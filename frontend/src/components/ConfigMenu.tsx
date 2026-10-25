import { useRef, useState } from 'react'
import { Save, FolderOpen } from 'lucide-react'
import { useStore } from '../store/useStore'
import { setCalibration as apiSetCalibration } from '../api/audioApi'
import { downloadBlob } from '../api/exportApi'
import { buildConfig, parseConfig, ConfigError } from '../utils/analysisConfig'
import { toast } from '../store/useToast'
import { useT } from '../i18n'

/** Saves the analysis set-up to a .json file and loads it back (view, metric, options, batch limits, calibration and section per file). */
export default function ConfigMenu() {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const save = () => {
    const s = useStore.getState()
    const cfg = buildConfig(s)
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
    downloadBlob(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }), `pysqa-config-${stamp}.json`)
    toast.success(t('pp.cfg.saved'))
  }

  const load = async (file: File) => {
    setBusy(true)
    try {
      const s = useStore.getState()
      const cfg = parseConfig(await file.text(), { spectrogram: s.spectrogramParams, envelope: s.envelopeParams })
      s.setFieldType(cfg.view.fieldType)
      s.setPrecision(cfg.view.precision)
      s.setOctaveWeighting(cfg.view.octaveWeighting)
      s.setSpectrogramParams(cfg.view.spectrogram)
      s.setEnvelopeParams(cfg.view.envelope)
      s.setBatchMetrics(cfg.batch.metrics)
      s.setBatchAnnoyance(cfg.batch.annoyance)
      s.setBatchLimits(cfg.batch.limits)
      s.setViewMode(cfg.view.viewMode)
      s.setMetricKey(cfg.view.metricKey)

      // Per-file settings go to the files that have the same name; what the file does not mention stays as it is
      let calFailed = 0
      const names = new Set(cfg.files.map(f => f.name))
      for (const f of useStore.getState().files) {
        const fs = cfg.files.find(x => x.name === f.name)
        if (!fs) continue
        if (fs.calibration_mv_pa != null) {
          try {
            await apiSetCalibration(s.sessionId, f.audio_id, fs.calibration_mv_pa)
            useStore.getState().setCalibration(f.audio_id, fs.calibration_mv_pa)
          } catch { calFailed++ }
        }
        if (fs.section) useStore.getState().setSection(f.audio_id, fs.section)
      }
      const missing = [...names].filter(n => !useStore.getState().files.some(f => f.name === n)).length

      toast.success(t('pp.cfg.loaded'))
      if (missing > 0) toast.info(t('pp.cfg.missing', { n: missing }))
      if (calFailed > 0) toast.error(t('pp.cfg.calFailed', { n: calFailed }))
    } catch (e) {
      const code = e instanceof ConfigError ? e.code : null
      toast.error(code ? t(`pp.cfg.err.${code}`) : t('pp.cfg.err.read'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const btn = 'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded bg-panel text-muted hover:text-white transition-colors disabled:opacity-40'
  return (
    <div className="border-t border-border pt-5 space-y-3">
      <p className="text-xs font-semibold text-muted">{t('pp.cfg.title')}</p>
      <div className="flex gap-1">
        <button onClick={save} className={btn} title={t('pp.cfg.saveHelp')}>
          <Save size={13} aria-hidden="true" /> {t('pp.cfg.save')}
        </button>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className={btn} title={t('pp.cfg.loadHelp')}>
          <FolderOpen size={13} aria-hidden="true" /> {t('pp.cfg.load')}
        </button>
      </div>
      <input
        ref={inputRef} type="file" accept=".json,application/json" className="hidden" aria-label={t('pp.cfg.load')}
        onChange={e => { const f = e.target.files?.[0]; if (f) void load(f) }}
      />
    </div>
  )
}
