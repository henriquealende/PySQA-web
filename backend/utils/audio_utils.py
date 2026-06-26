import os
import threading
import numpy as np
import sounddevice as sd
import soundfile as sf
from scipy.io import wavfile

class SimpleAudioPlayer:
	def __init__(self):
		self.data = None
		self.fs = None
		self.channels = 1
		self.position = 0
		self.duration = 0
		self.volume = 1.0
		self.muted = False
		self.playing = False
		self.paused = False
		self.lock = threading.Lock()
		self.thread = None
		self.stop_flag = False
		self._norm_gain = 1.0

	def load(self, file_path):
		# Build the complete, normalised 2-D array in a LOCAL variable first.
		# Only then do we update self.data under the lock so the sounddevice
		# callback never sees a transient 1-D array (which was the root cause
		# of the "shape (N,) into shape (N,1)" ValueError).
		ext = os.path.splitext(file_path)[1].lower()
		if ext == '.mp3':
			raw, fs = sf.read(file_path, dtype='float32', always_2d=True)
		else:
			fs, raw = wavfile.read(file_path)
			if raw.dtype == np.int16:
				raw = raw.astype(np.float32) / 32768.0
			elif raw.dtype == np.int32:
				raw = raw.astype(np.float32) / 2147483648.0
			elif raw.dtype == np.uint8:
				raw = (raw.astype(np.float32) - 128) / 128.0
			else:
				raw = raw.astype(np.float32)
		if raw.ndim == 1:
			raw = np.expand_dims(raw, axis=1)  # always 2-D (N, ch)
		# Atomically update all state so the callback always sees a
		# consistent (fs, data, duration, channels) view.
		with self.lock:
			self.fs = fs
			self.data = raw
			self.channels = raw.shape[1]
			self.duration = raw.shape[0]
			self.position = 0
			self.playing = False
			self.paused = False
			self.muted = False
			self.volume = 1.0
			self.stop_flag = True   # tell any live callback to stop immediately
			self._norm_gain = 1.0

	def play(self):
		if self.data is None or self.playing:
			return
		# Ensure any previous playback thread has fully exited before opening a
		# new OutputStream. Without this join the two streams briefly overlap,
		# which causes the audible glitch when switching signals.
		if self.thread is not None and self.thread.is_alive():
			with self.lock:
				self.stop_flag = True
				self.playing = False
			self.thread.join(timeout=0.3)
		# Compute a normalization gain so the loudest peak plays at 80% of
		# digital full scale. Applied only in the callback — self.data is
		# never modified, so analysis values are unaffected.
		peak = np.max(np.abs(self.data))
		self._norm_gain = (0.8 / peak) if peak > 0 else 1.0
		self.playing = True
		self.paused = False
		self.stop_flag = False
		self.thread = threading.Thread(target=self._playback, daemon=True)
		self.thread.start()

	def _playback(self):
		def callback(outdata, frames, time, status):
			with self.lock:
				if self.paused or self.stop_flag:
					outdata[:] = np.zeros_like(outdata)
					return
				end = min(self.position + frames, self.duration)
				chunk = self.data[self.position:end]
				# Guard against any residual shape mismatch
				if chunk.ndim == 1:
					chunk = chunk[:, np.newaxis]
				if self.muted:
					outdata[:len(chunk)] = 0
				else:
					outdata[:len(chunk)] = chunk * self._norm_gain * self.volume
				if len(chunk) < frames:
					outdata[len(chunk):] = 0
					self.playing = False
					self.stop_flag = True
				self.position += frames
		with sd.OutputStream(samplerate=self.fs, channels=self.channels, callback=callback):
			while self.playing and not self.stop_flag and self.position < self.duration:
				if self.paused:
					sd.sleep(20)
				else:
					sd.sleep(10)
			self.playing = False

	def pause(self):
		with self.lock:
			self.paused = True

	def resume(self):
		with self.lock:
			self.paused = False

	def stop(self):
		with self.lock:
			self.stop_flag = True
			self.playing = False
			self.paused = False
			self.position = 0
		# Wait for the playback thread to finish closing its OutputStream.
		# The reduced sleep granularity (10 ms) means this typically returns
		# within ~15 ms — imperceptible to the user.
		if self.thread is not None and self.thread.is_alive():
			self.thread.join(timeout=0.3)

	def mute(self, state):
		with self.lock:
			self.muted = state

	def set_volume(self, value):
		with self.lock:
			self.volume = value / 100.0
			self.muted = (self.volume == 0.0)

	def set_position(self, value):
		with self.lock:
			self.position = int(value)

	def get_duration(self):
		return self.duration / self.fs * 1000 if self.fs else 0

	def get_position(self):
		return self.position / self.fs * 1000 if self.fs else 0

	def is_muted(self):
		return self.muted

	def is_playing(self):
		return self.playing and not self.paused

def get_audio_files_from_dialog(parent):
	from PySide6.QtWidgets import QFileDialog
	files, _ = QFileDialog.getOpenFileNames(parent, "Importar Áudios", "", "Audio Files (*.wav *.mp3);;WAV Files (*.wav);;MP3 Files (*.mp3)")
	return files

def get_audio_names(file_paths):
	return [os.path.splitext(os.path.basename(f))[0] for f in file_paths]

def writable_output_dir(candidate_dir: str) -> str:
	"""Return *candidate_dir* when writable; otherwise fall back to
	%LOCALAPPDATA%\\PySQA\\aud_samples so writes never hit Program Files."""
	if os.access(candidate_dir, os.W_OK):
		return candidate_dir
	fallback = os.path.join(
		os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
		"PySQA", "aud_samples",
	)
	os.makedirs(fallback, exist_ok=True)
	return fallback


def save_audio(data: np.ndarray, fs: int, output_path: str) -> str:
	"""Save a float32 ndarray as a 16-bit PCM WAV file.

	Parameters
	----------
	data : ndarray, shape (N,) or (N, channels)
		Audio samples in the range [-1, 1].
	fs : int
		Sample rate in Hz.
	output_path : str
		Full path to the output .wav file (parent directory must exist).

	Returns
	-------
	str
		The resolved absolute path of the written file.
	"""
	data = np.asarray(data, dtype=np.float32)
	# If processing (e.g. loudness matching) pushed values outside ±1.0, scale
	# the whole signal down to fit — hard-clipping would introduce distortion.
	peak = float(np.max(np.abs(data)))
	if peak > 1.0:
		data = data / peak
	# Safety clip for any floating-point edge cases
	data = np.clip(data, -1.0, 1.0)
	pcm = (data * 32767).astype(np.int16)
	wavfile.write(output_path, fs, pcm)
	return os.path.abspath(output_path)
