/**
 * Level of a steady tone (the sound of an acoustic calibrator) in a recording.
 *
 * The tone is found by searching for the frequency where a Hann-windowed DFT is strongest, so a calibrator
 * a little off its nominal frequency, or an input clock a little off its nominal rate, does not lose
 * level to scalloping. Noise and hum elsewhere in the spectrum do not count: only the tone is measured,
 * and how much of the signal's power it is (`purity`) tells whether the recording is a clean tone.
 */
export interface ToneMeasurement {
  freqHz: number      // where the tone really is
  toneRms: number     // RMS of the tone, in full-scale units (1.0 = full scale)
  totalRms: number    // RMS of everything in the analysed part
  purity: number      // tone power / total power, 0..1
  peak: number        // highest absolute sample of the whole recording (1.0 = clipping)
  seconds: number     // length analysed
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n)
  for (let k = 0; k < n; k++) w[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / Math.max(1, n - 1))
  return w
}

/** |sum of w[k] x[k] e^(-j 2 pi f k / sr)| over x[start .. start+len) */
function dftMagnitude(x: Float32Array, start: number, len: number, sr: number, f: number, w: Float64Array): number {
  const a = (2 * Math.PI * f) / sr
  const c = Math.cos(a), s = Math.sin(a)
  let cr = 1, ci = 0, re = 0, im = 0
  for (let k = 0; k < len; k++) {
    const v = w[k] * x[start + k]
    re += v * cr
    im -= v * ci
    const t = cr * c - ci * s
    ci = cr * s + ci * c
    cr = t
    if ((k & 4095) === 4095) { const m = Math.hypot(cr, ci); cr /= m; ci /= m }      // keep the rotating phasor on the unit circle
  }
  return Math.hypot(re, im)
}

export function measureTone(pcm: Float32Array, sr: number, nominalHz: number): ToneMeasurement {
  let peak = 0
  for (let i = 0; i < pcm.length; i++) { const v = Math.abs(pcm[i]); if (v > peak) peak = v }

  // The first half second holds the calibrator being switched on and the hand letting go of it
  const skip = Math.min(Math.round(0.5 * sr), Math.floor(pcm.length / 4))
  const x = pcm.subarray(skip)
  const N = x.length

  // 1. coarse: where is the tone? a short window, 1 Hz steps (the main lobe is 4 Hz wide on each side)
  const nc = Math.min(N, Math.round(0.5 * sr)), wc = hann(nc)
  const lo = nominalHz * 0.94, hi = nominalHz * 1.06, step = Math.max(1, (hi - lo) / 400)
  let f = nominalHz, best = -1
  for (let g = lo; g <= hi; g += step) { const m = dftMagnitude(x, 0, nc, sr, g, wc); if (m > best) { best = m; f = g } }

  // 2. closer: 2 s window, 0.1 Hz steps around it
  const nm = Math.min(N, Math.round(2 * sr)), wm = hann(nm)
  let f2 = f; best = -1
  for (let g = f - 2; g <= f + 2; g += 0.1) { const m = dftMagnitude(x, 0, nm, sr, g, wm); if (m > best) { best = m; f2 = g } }

  // 3. exact: golden-section search on the whole recording, where the peak is a single smooth hump
  const w = hann(N)
  let a = f2 - 0.25, b = f2 + 0.25
  const phi = (Math.sqrt(5) - 1) / 2
  let c = b - phi * (b - a), d = a + phi * (b - a)
  let mc = dftMagnitude(x, 0, N, sr, c, w), md = dftMagnitude(x, 0, N, sr, d, w)
  for (let i = 0; i < 28; i++) {
    if (mc > md) { b = d; d = c; md = mc; c = b - phi * (b - a); mc = dftMagnitude(x, 0, N, sr, c, w) }
    else { a = c; c = d; mc = md; d = a + phi * (b - a); md = dftMagnitude(x, 0, N, sr, d, w) }
  }
  const freqHz = (a + b) / 2
  const mag = dftMagnitude(x, 0, N, sr, freqHz, w)

  let wsum = 0; for (let k = 0; k < N; k++) wsum += w[k]
  const amplitude = (2 * mag) / wsum                       // a sine of amplitude A gives |X| = A * sum(w) / 2
  const toneRms = amplitude / Math.SQRT2
  let sq = 0; for (let i = 0; i < N; i++) sq += x[i] * x[i]
  const totalRms = Math.sqrt(sq / N)
  const purity = totalRms > 0 ? Math.min(1, (toneRms * toneRms) / (totalRms * totalRms)) : 0

  return { freqHz, toneRms, totalRms, purity, peak, seconds: N / sr }
}
