# PySQA Web — Project Memory

## Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Plotly.js (react-plotly.js)
- **Backend**: FastAPI (Python) + mosqito + scipy + soundfile + numpy
- **State**: Zustand
- **Port**: Frontend dev server proxies `/api` → `http://localhost:8000`

## Colors
- Teal `#50b89e` — time domain / primary
- Orange `#ed693b` — frequency domain
- Amber `#ffa94d` — envelope

## Paths
- Bash: `/sessions/determined-laughing-hamilton/mnt/PSYCHOBOX/PySQA-Web/PySQA-Web/`
- Windows: `C:\Users\alend\OneDrive\Documentos\UFSC\PÓS-DOUTORADO\PSYCHOBOX\PySQA-Web\PySQA-Web\`

## CRITICAL FILE-WRITE RULE
**Edit tool and `cat >>` TRUNCATE files on Windows OneDrive mount.**
- Full rewrites: use `cat > file << 'ENDOFFILE'` bash heredoc
- Targeted in-place changes in large files: use Python string-replacement scripts

---

## Implemented Features

### Backend (`backend/`)
- `main.py`: global exception handler (full traceback in JSON), `/api/health` endpoint
- `routers/audio.py`:
  - Upload, delete, list, stream WAV files
  - `/waveform`, `/spectrum` endpoints
  - `/spectrogram` — query params: `nfft`, `overlap`, `window`, `cmap`, `freq_scale`, `fmax`, `dyn_range`
  - `/octave` — query param: `weighting` (Z / A)
  - `/envelope` — query params: `smoothing_ms`, `lpf_hz`
  - `/metrics` (POST) — `metric_key`, `field_type` (free / diffuse)
  - `/batch` (POST) — `audio_ids`, `metric_keys`, `field_type`
  - `/calibrate` (POST) — `sensitivity_mv_pa`, `fs_voltage`; DELETE to clear
  - Signal processing: Filtering (HP/LP Butterworth), Windowing (Hann/Hamming/Blackman/Bartlett/FlatTop/Boxcar), Weighting (A/C/Z), Harmonic Notch, 1/3-Octave EQ, Loudness Adjustment
- `services/audio_service.py`:
  - `compute_spectrogram(entry, params)` — full param support
  - `compute_octave_bands(entry, weighting)` — Z/A weighting
  - `compute_envelope(entry, smoothing_ms, lpf_hz)` — moving avg + Butterworth LPF
  - `compute_metric(entry, metric_key, field_type)` — cache-aware, applies calibration
  - `_calibrated_mono(entry)` — scales signal by `calibration_pa` if set
  - Psychoacoustic metrics: Loudness ZWK/ECMA, Sharpness DIN, Roughness D&W/ECMA, Fluctuation Strength, Tonality ECMA, IPM
  - Field type (free/diffuse) passed to: Loudness ZWK, Sharpness DIN, Tonality ECMA
- `services/session_store.py`:
  - `AudioEntry` dataclass with `calibration_pa: Optional[float]`
  - In-memory session store

### Frontend (`frontend/src/`)
- **`types/index.ts`**: `AudioFile`, `ViewMode`, `FieldType`, `MetricKey`, `SpectrogramParams`, `EnvelopeParams`, `MetricResult`, `WaveformData`, `SpectrumData`, `SpectrogramData`, `OctaveData`, `EnvelopeData`, `BatchRow`
- **`store/useStore.ts`**: `spectrogramParams`, `envelopeParams`, `octaveWeighting`, `fieldType`, `calibrations` + all setters
- **`api/audioApi.ts`**: `fetchSpectrogram(params?)`, `fetchOctave(weighting)`, `fetchEnvelope(params?)`, `fetchMetric(…, fieldType)`, `fetchBatch(…, fieldType)`, `setCalibration()`, `clearCalibration()`
- **`components/PlotPanel.tsx`**:
  - NormalView: waveform + spectrum
  - MetricView: time-varying + frequency display, reads `fieldType` from store
  - SpectrogramView: ⚙ gear settings (NFFT, overlap, window, colormap, freq scale, fmax, dyn range)
  - OctaveView: ⚙ gear settings (Z / A weighting)
  - EnvelopeView: ⚙ gear settings (smoothing ms, LPF cutoff Hz)
  - Settings panel: Apply button defers API call until confirmed
- **`components/ProcessingModal.tsx`**: Filtering, Windowing (with waveform overlay), Weighting, Loudness Adj. tabs — fully in English
- **`pages/PostProcessing/PostProcessingPage.tsx`**:
  - File upload/dropzone, audio list, metric selector
  - **Field type selector** (Free-field / Diffuse) in sidebar
  - **Mic calibration** input (mV/Pa) per file in sidebar
  - Export button
- **`pages/PostProcessing/BatchPanel.tsx`**:
  - Psychoacoustic metric toggles
  - **Annoyance SIL** checkbox (−25.95 + 10.24·N + 13.29·S + 7.75·R + 0.13·IPM%): auto-adds required metrics
  - **Annoyance ZWK** checkbox (N·[1 + √(ws²+wf²+wr²)]): auto-adds required metrics
  - Shows field type in use; annoyance columns shown in amber
  - XLSX export includes annoyance columns

---

## Annoyance Model Formulas
- **SIL**: `−25.95 + 10.24·N + 13.29·S + 7.75·R + 0.13·(IPM×100)`
  - Requires: Loudness ZWK (N, sone), Sharpness DIN (S, acum), Roughness DW (R, asper), IPM
- **ZWK** (Zwicker-Fastl PA): `N · [1 + √(ws² + wf² + wr²)]`
  - ws = 0.25·max(0, S−1.75), wf = 0.15·FS, wr = 0.1·R
  - Requires: Loudness ZWK, Sharpness DIN, Roughness DW, Fluctuation Strength

## Microphone Calibration
- User enters sensitivity in mV/Pa + FS voltage (default 1 V)
- `calibration_pa = (fs_voltage × 1000) / sensitivity_mv_pa`
- Applied in `_calibrated_mono()` before all metric computations
- Stored per-file in `AudioEntry.calibration_pa`; cached metrics keyed by cal value

---

## Remaining (Medium/Low Priority)
### Medium
- Export to PDF report (waveform + metrics + spectrogram screenshot)
- Comparison mode (overlay two audio files on same plot)
- Statistical summary panel (L_eq, L_peak, L_90, etc.)
- Time-frequency cursor readout

### Low
- Dark/light theme toggle
- Keyboard shortcuts
- Undo/redo for processing steps

### Unimplemented Modules (from Python original)
- **System Analysis** (FRF — Frequency Response Function): requires stimulus + response WAV pair, H1/H2/Hv estimator
- **Data Acquisition**: real-time audio capture, not feasible in pure web without Web Audio API bridge
