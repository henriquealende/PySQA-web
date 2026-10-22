import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'

/** What the recorder worklet reports about the last ~50 ms of sound. */
export interface LevelMsg {
  peak: number        // highest absolute sample (full scale = 1)
  rms: number         // unweighted RMS
  rmsA: number        // A-weighted RMS
  seconds: number     // how long the figures cover
  recorded: number
  recording: boolean
}

// The page hands every report to the meter without going through React state: the page does not
// re-render 20 times a second, only the meter redraws (10 times a second).
const listeners = new Set<(m: LevelMsg) => void>()
export const levelBus = {
  emit: (m: LevelMsg) => listeners.forEach((f) => f(m)),
  on: (f: (m: LevelMsg) => void) => { listeners.add(f); return () => { listeners.delete(f) } },
}

const P0 = 20e-6        // reference pressure, Pa
const FAST_TAU = 0.125  // "Fast" time weighting, s

const fresh = () => ({ fastZ: 0, fastA: 0, sumZ: 0, sumA: 0, secs: 0, maxZ: 0, maxA: 0, peak: 0, seen: false })

/** Mean square in full-scale units → dB SPL (calibrated) or dBFS (not). */
function level(meanSquare: number, calibrationPa: number | null): number | null {
  if (!(meanSquare > 0)) return null
  const k = calibrationPa ? (calibrationPa * calibrationPa) / (P0 * P0) : 1
  return 10 * Math.log10(meanSquare * k)
}

const fmt = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1))

/**
 * A sound level meter for the microphone that is open: level with Fast time weighting, the equivalent
 * level (Leq) and the maximum since monitoring began, or since the take started, and the highest peak.
 * In dB SPL when the microphone is calibrated (A-weighted or not), in dBFS when it is not.
 */
export default function SplMeter({ calibrationPa, workletActive, recording }: {
  calibrationPa: number | null
  workletActive: boolean
  recording: boolean
}) {
  const [weighting, setWeighting] = useState<'A' | 'Z'>('A')
  const acc = useRef(fresh())
  const [shown, setShown] = useState<{ lp: number | null; leq: number | null; max: number | null; peak: number | null }>(
    { lp: null, leq: null, max: null, peak: null })
  const reset = useCallback(() => { acc.current = fresh() }, [])

  useEffect(() => levelBus.on((m) => {
    const a = acc.current
    const dt = m.seconds > 0 ? m.seconds : 0.05
    const alpha = 1 - Math.exp(-dt / FAST_TAU)
    const z = m.rms * m.rms, w = m.rmsA * m.rmsA
    a.fastZ += alpha * (z - a.fastZ)
    a.fastA += alpha * (w - a.fastA)
    a.sumZ += z * dt
    a.sumA += w * dt
    a.secs += dt
    if (a.fastZ > a.maxZ) a.maxZ = a.fastZ
    if (a.fastA > a.maxA) a.maxA = a.fastA
    if (m.peak > a.peak) a.peak = m.peak
    a.seen = true
  }), [])

  // Leq and Max then cover the take
  useEffect(() => { if (recording) reset() }, [recording, reset])

  const useA = weighting === 'A' && !!calibrationPa
  useEffect(() => {
    const id = window.setInterval(() => {
      const a = acc.current
      if (!a.seen) return
      setShown({
        lp: level(useA ? a.fastA : a.fastZ, calibrationPa),
        leq: a.secs > 0 ? level((useA ? a.sumA : a.sumZ) / a.secs, calibrationPa) : null,
        max: level(useA ? a.maxA : a.maxZ, calibrationPa),
        peak: a.peak > 0 ? 20 * Math.log10(a.peak * (calibrationPa ? calibrationPa / P0 : 1)) : null,
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [useA, calibrationPa])

  if (!workletActive) {
    return <p className="text-[11px] text-muted">The level in dB needs the Worklet capture (HTTPS or localhost).</p>
  }

  const unit = !calibrationPa ? 'dBFS' : useA ? 'dB(A)' : 'dB SPL'
  const num = 'font-semibold tabular-nums text-white'

  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]" aria-label="Sound level">
      <span className="flex items-baseline gap-1.5" title="Level with Fast time weighting (125 ms)">
        <span className="text-[11px] uppercase tracking-wider text-muted">{calibrationPa ? 'Sound level' : 'Level, not calibrated'}</span>
        <span className="text-base font-semibold tabular-nums text-white" data-testid="spl-now">{fmt(shown.lp)}</span>
        <span className="text-muted">{unit}</span>
      </span>
      <span title={recording ? 'Equivalent (average) level since the recording started' : 'Equivalent (average) level since the microphone was opened'}>
        <span className="text-muted">Leq </span><span className={num} data-testid="spl-leq">{fmt(shown.leq)}</span>
      </span>
      <span title="Highest level (Fast) since then">
        <span className="text-muted">Max </span><span className={num} data-testid="spl-max">{fmt(shown.max)}</span>
      </span>
      {calibrationPa && (
        <span title="Highest instantaneous peak, not weighted">
          <span className="text-muted">Peak </span><span className={num} data-testid="spl-peak">{fmt(shown.peak)}</span><span className="text-muted"> dB SPL</span>
        </span>
      )}
      {calibrationPa && (
        <span className="flex items-center gap-1" role="group" aria-label="Frequency weighting">
          {(['A', 'Z'] as const).map((w) => (
            <button key={w} onClick={() => setWeighting(w)} aria-pressed={weighting === w}
              title={w === 'A' ? 'A-weighted: how loud it sounds to the ear' : 'Not weighted: every frequency counts the same'}
              className={`px-1.5 py-0.5 rounded border transition-colors ${weighting === w ? 'bg-teal/20 border-teal/50 text-teal' : 'border-border text-muted hover:text-white'}`}>
              {w === 'A' ? 'dB(A)' : 'dB SPL'}
            </button>
          ))}
        </span>
      )}
      <button onClick={reset} title="Start Leq, Max and Peak again"
        className="flex items-center gap-1 text-muted hover:text-white transition-colors">
        <RotateCcw size={11} /> Reset
      </button>
      {!calibrationPa && (
        <span className="text-muted/80">Calibrate the microphone (Settings) to read dB SPL.</span>
      )}
    </div>
  )
}
