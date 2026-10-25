import { useEffect, useRef, useState } from 'react'
import { X, Mic, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { measureTone } from '../../api/toneMeasure'
import type { ToneMeasurement } from '../../api/toneMeasure'
import { deviceKeys as keysOf, paFromSensitivity, saveCalibration, sensitivityFromPa } from '../../api/micCalibration'
import type { MicCalibration } from '../../api/micCalibration'
import { RECORDER_WORKLET_URL } from './worklet'
import { useDialog } from '../../hooks/useDialog'
import { useT } from '../../i18n'

const P0 = 20e-6
const MEASURE_S = 5
const PRESETS = [
  { id: '94', labelKey: 'cal.wizard.preset94', level: 94, freq: 1000 },
  { id: '114', labelKey: 'cal.wizard.preset114', level: 114, freq: 1000 },
  { id: 'other', labelKey: 'cal.wizard.presetOther', level: 94, freq: 1000 },
]
const dbfs = (lin: number) => 20 * Math.log10(Math.max(lin, 1e-9))

interface Result { m: ToneMeasurement; calibrationPa: number; warnings: { text: string; blocking: boolean }[] }

/**
 * Calibrate a microphone with an acoustic calibrator: fit it on the microphone, switch it on, press
 * Measure. The tone is recorded for 5 s and its level is compared with what the calibrator says it is
 * (for example 94 dB SPL), which gives the pressure a full-scale signal stands for. Or type the
 * sensitivity from the microphone's data sheet.
 *
 * The microphone is opened by this dialog only, so it opens when the page is idle.
 */
export default function CalibrationWizard({ deviceId, deviceKeys, deviceLabel, sampleRate, onClose, onSaved }: {
  deviceId: string
  deviceKeys: string[]
  deviceLabel: string
  sampleRate: number
  onClose: () => void
  onSaved: (c: MicCalibration) => void
}) {
  const t = useT()
  const [tab, setTab] = useState<'calibrator' | 'manual'>('calibrator')
  const [preset, setPreset] = useState('94')
  const [level, setLevel] = useState(94)
  const [freq, setFreq] = useState(1000)
  const [phase, setPhase] = useState<'ready' | 'starting' | 'listening' | 'measuring' | 'analysing' | 'result' | 'error'>('ready')
  const [live, setLive] = useState<{ rms: number; peak: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  // Read by the audio callbacks, which were created before the latest render
  const params = useRef({ level, freq })
  params.current = { level, freq }
  const rig = useRef<{ stream: MediaStream; ctx: AudioContext; node: AudioWorkletNode } | null>(null)
  const chunks = useRef<Float32Array[]>([])
  const measuring = useRef(false)
  // Once the browser lets us read the microphone's real name, the calibration is also kept under it
  const keys = useRef(deviceKeys)
  const label = useRef(deviceLabel)

  const closeRig = () => {
    const r = rig.current
    if (!r) return
    rig.current = null
    try { r.node.port.onmessage = null; r.node.disconnect() } catch { /* already gone */ }
    r.stream.getTracks().forEach((t) => t.stop())
    void r.ctx.close()
  }
  useEffect(() => closeRig, [])          // closing the dialog closes the microphone

  const analyse = (pcm: Float32Array, sr: number) => {
    const { level: lvl, freq: f0 } = params.current
    const m = measureTone(pcm, sr, f0)
    if (!(m.toneRms > 0)) { setError(t('cal.wizard.noTone')); setPhase('error'); return }
    const calibrationPa = (P0 * Math.pow(10, lvl / 20)) / m.toneRms
    const warnings: Result['warnings'] = []
    if (m.peak >= 0.999) warnings.push({ blocking: true, text: t('cal.wizard.warnClip') })
    if (dbfs(m.toneRms) < -60) warnings.push({ blocking: true, text: t('cal.wizard.warnQuiet') })
    if (Math.abs(m.freqHz - f0) / f0 > 0.03) warnings.push({ blocking: false, text: t('cal.wizard.warnFreq', { found: m.freqHz.toFixed(0), expected: f0 }) })
    if (m.purity < 0.9) warnings.push({ blocking: false, text: t('cal.wizard.warnNoise') })
    setResult({ m, calibrationPa, warnings })
    setPhase('result')
  }

  const finish = (sr: number) => {
    measuring.current = false
    let total = 0
    chunks.current.forEach((c) => { total += c.length })
    const pcm = new Float32Array(total)
    let o = 0
    chunks.current.forEach((c) => { pcm.set(c, o); o += c.length })
    chunks.current = []
    setPhase('analysing')
    window.setTimeout(() => analyse(pcm, sr), 30)      // let "Analysing…" show first: it takes a moment
  }

  const listen = async () => {
    setError(''); setResult(null); setPhase('starting')
    try {
      const audio: MediaTrackConstraints = {
        deviceId: deviceId && deviceId !== 'default' ? { ideal: deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,      // a calibration needs the sound untouched
      }
      let stream: MediaStream
      try { stream = await navigator.mediaDevices.getUserMedia({ audio }) }
      catch (e: any) {
        if (e?.name === 'NotAllowedError') throw e
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      try {
        const inputs = (await navigator.mediaDevices.enumerateDevices())
          .filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label }))
        keys.current = Array.from(new Set([...keys.current, ...keysOf(inputs, deviceId)]))
        label.current = inputs.find((d) => d.deviceId === deviceId)?.label || label.current
      } catch { /* the names stay as they were */ }
      const ctx = new AudioContext({ sampleRate })
      if (ctx.state === 'suspended') await ctx.resume()
      await ctx.audioWorklet.addModule(RECORDER_WORKLET_URL)
      const node = new AudioWorkletNode(ctx, 'recorder-processor', {
        processorOptions: { preRollSec: 0.1 }, channelCount: 1, channelCountMode: 'explicit',
      })
      ctx.createMediaStreamSource(stream).connect(node)
      node.port.onmessage = (e) => {
        const m = e.data
        if (m.type === 'level') {
          setLive({ rms: m.rms, peak: m.peak })
          if (measuring.current && m.recording) setProgress(Math.min(1, m.recorded / (MEASURE_S * ctx.sampleRate)))
        } else if (m.type === 'chunk') {
          if (measuring.current) chunks.current.push(new Float32Array(m.data))
        } else if (m.type === 'stopped' && measuring.current) {
          finish(ctx.sampleRate)
        }
      }
      rig.current = { stream, ctx, node }
      setPhase('listening')
    } catch (e: any) {
      closeRig()
      setError(e?.name === 'NotAllowedError'
        ? t('cal.wizard.micBlocked')
        : t('cal.wizard.micFailed', { reason: e?.message ?? String(e) }))
      setPhase('error')
    }
  }

  const measure = () => {
    const r = rig.current
    if (!r) return
    chunks.current = []
    measuring.current = true
    setProgress(0); setPhase('measuring')
    r.node.port.postMessage({ type: 'start', preRoll: false, maxSamples: Math.round(MEASURE_S * r.ctx.sampleRate), rules: [] })
  }

  const save = (calibrationPa: number, source: MicCalibration['source'], extra: Partial<MicCalibration>) => {
    const cal: MicCalibration = {
      calibrationPa, sensitivityMvPa: sensitivityFromPa(calibrationPa), source,
      at: new Date().toISOString(), deviceLabel: label.current, ...extra,
    }
    if (!saveCalibration(keys.current, cal)) { setError(t('cal.wizard.storageBlocked')); return }
    closeRig()
    onSaved(cal)
  }

  const manualValue = parseFloat(manual)
  const manualOk = Number.isFinite(manualValue) && manualValue > 0
  const blocked = !!result?.warnings.some((w) => w.blocking)
  const busy = phase === 'starting' || phase === 'measuring' || phase === 'analysing'
  const dialogRef = useDialog(() => { if (!busy) onClose() })

  const chooseCalibrator = (id: string) => {
    setPreset(id)
    const p = PRESETS.find((x) => x.id === id)!
    if (id !== 'other') { setLevel(p.level); setFreq(p.freq) }
  }

  const liveDb = live ? dbfs(live.rms) : null
  const liveNote = !live ? null
    : live.peak >= 0.999 ? { text: t('cal.wizard.liveLoud'), bad: true }
    : dbfs(live.rms) < -55 ? { text: t('cal.wizard.liveQuiet'), bad: true }
    : { text: t('cal.wizard.liveGood'), bad: false }

  const input = 'bg-panel border border-field rounded px-2 py-1 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { if (!busy) onClose() }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('cal.wizard.dialogLabel')}
        className="bg-surface border border-border rounded-xl w-[480px] max-w-[94vw] max-h-[92vh] overflow-y-auto shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-white">{t('cal.wizard.title')}</span>
          <button onClick={onClose} disabled={busy} className="text-muted hover:text-white disabled:opacity-40" aria-label={t('cal.wizard.close')}><X size={15} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3 text-xs">
          <p className="text-muted">{t('cal.wizard.microphone')} <span className="text-white">{deviceLabel}</span></p>

          <div className="flex gap-1 p-0.5 bg-panel rounded border border-border">
            {([['calibrator', t('cal.wizard.tabCalibrator')], ['manual', t('cal.wizard.tabManual')]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} disabled={busy}
                className={`flex-1 py-1 rounded font-medium transition-colors disabled:opacity-50 ${tab === k ? 'bg-teal/20 text-teal' : 'text-muted hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'manual' && (
            <div className="flex flex-col gap-2">
              <label className="text-muted" htmlFor="cal-manual">{t('cal.wizard.manualLabel')}</label>
              <div className="flex gap-2">
                <input id="cal-manual" type="number" min={0} step="any" value={manual} placeholder={t('cal.wizard.manualPlaceholder')}
                  onChange={(e) => setManual(e.target.value)} className={`${input} w-32`} />
                <button disabled={!manualOk}
                  onClick={() => save(paFromSensitivity(manualValue), 'manual', {})}
                  className="btn btn-primary btn-sm">
                  {t('cal.wizard.manualUse')}
                </button>
              </div>
              <p className="text-muted/80">{t('cal.wizard.manualNote')}</p>
            </div>
          )}

          {tab === 'calibrator' && (<>
            <div className="flex flex-col gap-2">
              <p className="text-white font-semibold">{t('cal.wizard.step1')}</p>
              <div className="flex gap-3 flex-wrap items-center">
                {PRESETS.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="radio" name="cal-preset" checked={preset === p.id} disabled={busy}
                      onChange={() => chooseCalibrator(p.id)} className="accent-teal" />
                    <span className={preset === p.id ? 'text-white' : 'text-muted'}>{t(p.labelKey)}</span>
                  </label>
                ))}
              </div>
              {preset === 'other' && (
                <div className="flex gap-3 items-center">
                  <label className="flex items-center gap-1.5 text-muted">{t('cal.wizard.level')}
                    <input type="number" step="any" value={level} disabled={busy} aria-label={t('cal.wizard.levelAria')}
                      onChange={(e) => setLevel(Number(e.target.value))} className={`${input} w-20`} /> dB SPL
                  </label>
                  <label className="flex items-center gap-1.5 text-muted">{t('cal.wizard.at')}
                    <input type="number" step="any" value={freq} disabled={busy} aria-label={t('cal.wizard.freqAria')}
                      onChange={(e) => setFreq(Number(e.target.value))} className={`${input} w-20`} /> Hz
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-white font-semibold">{t('cal.wizard.step2')}</p>
              {(phase === 'ready' || phase === 'error') && (
                <button onClick={listen}
                  className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal/20 text-teal font-medium hover:bg-teal/30 transition-colors">
                  <Mic size={13} /> {t('cal.wizard.listen')}
                </button>
              )}
              {phase === 'starting' && <p className="flex items-center gap-2 text-muted"><Loader2 size={13} className="animate-spin text-teal" /> {t('cal.wizard.opening')}</p>}
              {(phase === 'listening' || phase === 'measuring') && live && (
                <div className="flex flex-col gap-1">
                  <div className="h-2 bg-panel rounded overflow-hidden border border-border" role="meter" aria-label={t('cal.wizard.meterAria')}
                    aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(liveDb ?? -60)}>
                    <div className="h-full bg-teal transition-all" style={{ width: `${Math.max(0, Math.min(100, ((liveDb ?? -60) + 60) / 60 * 100))}%` }} />
                  </div>
                  <p className="tabular-nums text-muted">{(liveDb ?? -99).toFixed(1)} {t('cal.wizard.rms')}</p>
                  {liveNote && phase === 'listening' && (
                    <p className={liveNote.bad ? 'text-amber' : 'text-teal'}>{liveNote.text}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-white font-semibold">{t('cal.wizard.step3', { seconds: MEASURE_S })}</p>
              <div className="flex items-center gap-3">
                <button onClick={measure} disabled={phase !== 'listening' && phase !== 'result'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange text-dark font-medium hover:bg-orange/80 disabled:opacity-40 transition-colors">
                  {phase === 'result' ? t('cal.wizard.measureAgain') : t('cal.wizard.measure')}
                </button>
                {phase === 'measuring' && (
                  <div className="flex-1 h-1.5 bg-panel rounded overflow-hidden border border-border">
                    <div className="h-full bg-orange transition-all" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
                {phase === 'analysing' && <span className="flex items-center gap-2 text-muted"><Loader2 size={13} className="animate-spin text-teal" /> {t('cal.wizard.analysing')}</span>}
              </div>
              <p className="text-muted/80">{t('cal.wizard.keepStill')}</p>
            </div>

            {phase === 'result' && result && (
              <div className="flex flex-col gap-2 p-3 rounded border border-border bg-panel/60" aria-label={t('cal.wizard.resultAria')}>
                <p className="text-white">{t('cal.wizard.toneFound')} <span className="tabular-nums">{result.m.freqHz.toFixed(1)} Hz</span> {t('cal.wizard.toneAt')} <span className="tabular-nums">{dbfs(result.m.toneRms).toFixed(1)} dBFS</span> {t('cal.wizard.rmsParen')}</p>
                <p className="text-white">{t('cal.wizard.sensitivity')} <span className="text-teal font-semibold tabular-nums" data-testid="cal-sens">{sensitivityFromPa(result.calibrationPa).toFixed(2)} mV/Pa</span>
                  <span className="text-muted">{t('cal.wizard.forFullScale')}</span></p>
                <p className="text-muted">{t('cal.wizard.fullScale', { pa: result.calibrationPa.toFixed(2), db: (20 * Math.log10(result.calibrationPa / P0)).toFixed(1) })}</p>
                {result.warnings.map((w, i) => (
                  <p key={i} className={`flex items-start gap-1.5 ${w.blocking ? 'text-orange' : 'text-amber'}`}><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w.text}</p>
                ))}
                {!result.warnings.length && <p className="flex items-center gap-1.5 text-teal"><CheckCircle size={12} /> {t('cal.wizard.clean')}</p>}
                <button disabled={blocked}
                  onClick={() => save(result.calibrationPa, 'calibrator', { levelDb: level, freqHz: result.m.freqHz })}
                  className="btn btn-primary self-start">
                  {t('cal.wizard.save')}
                </button>
              </div>
            )}
          </>)}

          {error && <p className="text-orange">{error}</p>}

          <p className="text-muted/80 border-t border-border/60 pt-2">
            {t('cal.wizard.footer1')} {t('cal.wizard.footer2')}
          </p>
        </div>
      </div>
    </div>
  )
}
