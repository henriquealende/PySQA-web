import { useState, useRef, useEffect } from 'react'
import { Loader2, Download, CheckSquare, Square, Plus, Pencil } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { fetchMetric, fetchServerLoad, isAbort, SessionExpiredError } from '../../api/audioApi'
import { newClientId } from '../../api/http'
import { MetricKey, FieldType, BatchLimit } from '../../types'
import TonalityPrecisionSelect from '../../components/TonalityPrecision'
import { exportXlsx } from '../../api/exportApi'
import { toast } from '../../store/useToast'
import { useT, currentLocale } from '../../i18n'
import { judge, judgeRow, hasLimit, describeLimit, type Verdict } from '../../utils/batchLimits'
import ChannelNotice from '../../components/ChannelNotice'
import NumberInput from '../../components/NumberInput'
import ModelEditor from './ModelEditor'
import { computeModel, isModelKey, modelKey, modelNeeds, newModelId } from '../../utils/batchModels'

const BATCH_METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: 'loudness_zwk',         label: 'Loudness ZWK',    short: 'N (ZWK)' },
  { key: 'loudness_ecma',        label: 'Loudness ECMA',   short: 'N (ECMA)' },
  { key: 'sharpness_din',        label: 'Sharpness DIN',   short: 'S' },
  { key: 'roughness_dw',         label: 'Roughness D&W',   short: 'R (D&W)' },
  { key: 'roughness_ecma',       label: 'Roughness ECMA',  short: 'R (ECMA)' },
  { key: 'fluctuation_strength', label: 'Fluct. Strength', short: 'FS' },
  { key: 'tonality_ecma',        label: 'Tonality ECMA',   short: 'T' },
  { key: 'ipm',                  label: 'IPM',             short: 'IPM' },
]

const ANNOYANCE_MODELS = [
  { key: 'sil', label: 'SIL', fullKey: 'pp.batch.annSil', tipKey: 'pp.batch.annSilTip' },
  { key: 'zwk', label: 'ZWK', fullKey: 'pp.batch.annZwk', tipKey: 'pp.batch.annZwkTip' },
]

function computeSIL(row: any) {
  const N = row['loudness_zwk'], S = row['sharpness_din']
  const R = row['roughness_dw'], I = row['ipm']
  if ([N,S,R,I].some(v => v == null)) return null
  return -25.95 + 10.24*Number(N) + 13.29*Number(S) + 7.75*Number(R) + 0.13*Number(I)
}
function computeZWK(row: any) {
  const N = row['loudness_zwk'], S = row['sharpness_din']
  const R = row['roughness_dw'], F = row['fluctuation_strength']
  if ([N,S,R,F].some(v => v == null)) return null
  const n = Number(N), s = Number(S), r = Number(R), f = Number(F)
  if (n <= 0) return 0
  // Zwicker-Fastl Psychoacoustic Annoyance (Fastl & Zwicker, 2007): PA = N5 (1 + sqrt(wS² + wFR²)).
  // N (stationary loudness) stands in for N5, the loudness exceeded 5 % of the time.
  const ws = s > 1.75 ? (s - 1.75) * 0.25 * Math.log10(n + 10) : 0
  const wfr = (2.18 / Math.pow(n, 0.4)) * (0.4 * f + 0.6 * r)
  return n * (1 + Math.sqrt(ws*ws + wfr*wfr))
}

function BatchProgress({ step, total, label, elapsed, eta, onCancel }: {
  step: number; total: number; label: string; elapsed: number; eta: number | null; onCancel: () => void
}) {
  const t = useT()
  const pct = total > 0 ? Math.round((step/total)*100) : 0
  return (
    <div className="flex flex-col gap-2 py-3 px-4 bg-panel rounded-lg border border-border">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 size={13} className="animate-spin text-teal shrink-0" />
        <span className="truncate flex-1">{label}</span>
        <span className="tabular-nums text-[11px] shrink-0 text-teal font-semibold">{step}/{total}</span>
      </div>
      <div className="w-full h-2 bg-dark rounded-full overflow-hidden border border-border/50">
        <div className="h-full rounded-full transition-all duration-200 ease-out"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#50b89e,#3dd6b0)' }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted/70 tabular-nums flex-1">
          {Math.round(elapsed)} s{eta ? t('pp.batch.etaOf', { n: Math.round(eta) }) : ''}
        </span>
        <span className="text-[11px] text-muted/70 tabular-nums">{pct}%</span>
        <button onClick={onCancel}
          className="px-3 py-0.5 text-xs text-muted hover:text-white border border-border rounded transition-colors">
          {t('pp.batch.cancel')}
        </button>
      </div>
    </div>
  )
}

export default function BatchPanel() {
  const t = useT()
  const { sessionId, files, fieldType, setFieldType, precision, sections } = useStore()
  const { batchMetrics: selected, batchAnnoyance: annoyance, batchLimits: limits, batchModels: models, setBatchMetrics, setBatchAnnoyance, setBatchLimit, setBatchModels } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const locale = currentLocale()

  // File selection
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(files.map(f => f.audio_id)))
  const toggleFile = (id: string) => setCheckedIds(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allChecked = files.length > 0 && files.every(f => checkedIds.has(f.audio_id))
  const toggleAll  = () => setCheckedIds(allChecked ? new Set() : new Set(files.map(f => f.audio_id)))

  const selectedFiles = files.filter(f => checkedIds.has(f.audio_id))
  // A file with a section selected in the Time & Frequency view is analysed on that part only
  const withSection = selectedFiles.filter(f => sections[f.audio_id])
  const sectionMap = Object.fromEntries(withSection.map(f => [f.audio_id, sections[f.audio_id]!]))

  // Metric + annoyance selection
  const toggle = (k: MetricKey) =>
    setBatchMetrics(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k])
  const toggleAnn = (k: string) =>
    setBatchAnnoyance(annoyance.includes(k) ? annoyance.filter(x => x !== k) : [...annoyance, k])

  const silNeeds: MetricKey[] = ['loudness_zwk','sharpness_din','roughness_dw','ipm']
  const zwkNeeds: MetricKey[] = ['loudness_zwk','sharpness_din','roughness_dw','fluctuation_strength']
  const metricsToCompute = (): MetricKey[] => {
    const extra: MetricKey[] = []
    if (annoyance.includes('sil')) silNeeds.forEach(k => { if (!selected.includes(k)) extra.push(k) })
    if (annoyance.includes('zwk')) zwkNeeds.forEach(k => { if (!selected.includes(k)) extra.push(k) })
    models.filter(m => m.on).forEach(m => modelNeeds(m).forEach(k => { if (!selected.includes(k)) extra.push(k) }))
    return [...new Set([...selected, ...extra])]
  }
  const autoAdded = metricsToCompute().filter(k => !selected.includes(k))

  // Results
  const [rows,   setRows]   = useState<any[]|null>(null)
  const [keys,   setKeys]   = useState<string[]>([])
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [skipped, setSkipped] = useState<{ name: string; metric: string; reason: string }[]>([])
  const [pStep,  setPStep]  = useState(0)
  const [pTotal, setPTotal] = useState(0)
  const [pLabel, setPLabel] = useState('')

  const keyLabel = (k: string) => {
    if (isModelKey(k)) return models.find(m => modelKey(m.id) === k)?.name || t('pp.batch.modelUnnamed')
    const ann = ANNOYANCE_MODELS.find(m => `annoyance_${m.key}` === k)
    if (ann) return t(ann.fullKey)
    return BATCH_METRICS.find(m => m.key === k)?.label ?? k
  }

  const ctrlRef = useRef<AbortController | null>(null)
  const [etaTotal, setEtaTotal] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!busy) return
    const id = window.setInterval(() => tick(n => n + 1), 500)
    return () => window.clearInterval(id)
  }, [busy])

  const cancel = () => ctrlRef.current?.abort()

  // One calculation per file and metric, so the bar moves for real and Cancel stops at the next boundary.
  // Results are shared with the single-file views through the same cache.
  const compute = async () => {
    const metrics = metricsToCompute()
    if (!metrics.length || !selectedFiles.length) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setBusy(true); setError(''); setRows(null); setSkipped([])
    const total = selectedFiles.length * metrics.length
    setPStep(0); setPTotal(total); setPLabel(t('pp.batch.starting')); setStartedAt(Date.now()); setEtaTotal(null)
    const load = await fetchServerLoad()
    if (load?.timing_s_per_audio_s) {
      let eta = 0, known = true
      for (const f of selectedFiles) for (const m of metrics) {
        const rate = load.timing_s_per_audio_s[m === 'tonality_ecma' && precision === 'fast' ? 'tonality_ecma_fast' : m]
        if (rate == null) { known = false; continue }
        const sec = sectionMap[f.audio_id]
        eta += rate * (sec ? sec[1] - sec[0] : f.duration_s)
      }
      if (known && eta > 0) setEtaTotal(eta)
    }
    const out: any[] = []
    const skip: { audio_id: string; name: string; metric: string; reason: string }[] = []
    let step = 0
    try {
      for (const f of selectedFiles) {
        const sec = sectionMap[f.audio_id] ?? null
        const row: any = { audio_id: f.audio_id, name: f.name, section: sec }
        for (const m of metrics) {
          if (ctrl.signal.aborted) throw new DOMException('cancelled', 'AbortError')
          setPLabel(`${f.name.replace(/\.wav$/i, '')} · ${keyLabel(m)}`)
          try {
            const res = await fetchMetric(sessionId, f.audio_id, m, fieldType, sec, { signal: ctrl.signal, job: newClientId(), precision })
            row[m] = res.global ?? null
            if (res.section !== undefined) row.section = res.section
          } catch (e: any) {
            if (isAbort(e) || e instanceof SessionExpiredError) throw e
            row[m] = null
            skip.push({ audio_id: f.audio_id, name: f.name, metric: m, reason: e?.message ?? t('pp.batch.failed') })
          }
          setPStep(++step)
        }
        out.push(row)
      }
      setRows(out); setKeys(metrics); setSkipped(skip)
      toast.success(t('pp.batch.complete'))
    } catch (e: any) {
      if (isAbort(e)) {
        // Keep what was finished: the rows already done are shown, the rest is left out
        if (out.length) { setRows(out); setKeys(metrics); setSkipped(skip) }
        toast.info(t('pp.batch.cancelledAfter', { step, total }))
      } else if (e instanceof SessionExpiredError) {
        setError(t('pp.batch.sessionLost'))
      } else {
        setError(e.message); toast.error(t('pp.batch.batchFailed'))
      }
    } finally {
      setBusy(false); setPLabel('')
    }
  }

  const augRows = rows ? rows.map(row => {
    const r = {...row}
    if (annoyance.includes('sil')) r['annoyance_sil'] = computeSIL(row)
    if (annoyance.includes('zwk')) r['annoyance_zwk'] = computeZWK(row)
    models.filter(m => m.on).forEach(m => { r[modelKey(m.id)] = computeModel(m, row) })
    return r
  }) : null

  const displayKeys = [
    ...keys,
    ...(annoyance.includes('sil') ? ['annoyance_sil'] : []),
    ...(annoyance.includes('zwk') ? ['annoyance_zwk'] : []),
    ...models.filter(m => m.on).map(m => modelKey(m.id)),
  ]
  const failedKeys = augRows ? keys.filter(k => augRows.every(r => r[k]==null)) : []
  const unexplainedFailures = failedKeys.filter(k => !skipped.some(s => s.metric === k))

  const METRIC_UNITS: Record<string,string> = {
    loudness_zwk: 'sone', loudness_ecma: 'sone',
    sharpness_din: 'acum', roughness_dw: 'asper', roughness_ecma: 'asper',
    fluctuation_strength: 'vacil', tonality_ecma: 'tu', ipm: 'dB',
    annoyance_sil: 'AU', annoyance_zwk: 'AU',
  }
  const colHeader = (k: string) => {
    const label = keyLabel(k)
    const unit  = isModelKey(k) ? models.find(m => modelKey(m.id) === k)?.unit : METRIC_UNITS[k]
    return unit ? `${label}\n(${unit})` : label
  }

  // Pass/fail against the limits typed under the column names
  const limited = displayKeys.filter(k => hasLimit(limits[k]))
  const verdicts = augRows ? augRows.map(r => judgeRow(r, displayKeys, limits)) : []
  const nPass = verdicts.filter(v => v === 'pass').length
  const nFail = verdicts.filter(v => v === 'fail').length
  const nMissing = verdicts.filter(v => v === 'missing').length
  const verdictText = (v: Verdict) => v === 'pass' ? t('pp.batch.pass') : v === 'fail' ? t('pp.batch.fail') : v === 'missing' ? t('pp.batch.incomplete') : ''
  const verdictMark = (v: Verdict) => v === 'pass' ? '✓' : v === 'fail' ? '✗' : ''

  const doExport = async () => {
    if (!augRows) return
    try {
      const columns: Record<string,any[]> = { [t('pp.batch.colFile')]: augRows.map(r => r.name) }
      if (augRows.some(r => r.section)) columns[t('pp.batch.colSection')] = augRows.map(r => r.section ? `${r.section[0]}-${r.section[1]}` : t('pp.batch.wholeFile'))
      displayKeys.forEach(k => { columns[colHeader(k)] = augRows.map(r => r[k]??'') })
      const sheet: Record<string, any> = { sheet_name: t('pp.batch.sheetName'), columns }
      if (limited.length) {
        // Cells that pass or fail are coloured in the workbook; the Result column says it in words as well
        const marks: Record<string, (string | null)[]> = {}
        limited.forEach(k => { marks[colHeader(k)] = augRows.map(r => { const v = judge(r[k], limits[k]); return v === 'pass' || v === 'fail' ? v : null }) })
        const resultHeader = t('pp.batch.colResult')
        columns[resultHeader] = verdicts.map(v => [verdictMark(v), verdictText(v)].filter(Boolean).join(' '))
        marks[resultHeader] = verdicts.map(v => v === 'pass' || v === 'fail' ? v : null)
        sheet.marks = marks
        sheet.notes = [
          t('pp.batch.limitsNote', { list: limited.map(k => `${keyLabel(k)} ${describeLimit(limits[k], locale)}`).join('; ') }),
          t('pp.batch.limitsSummary', { pass: nPass, fail: nFail, missing: nMissing }),
        ]
      }
      await exportXlsx(sessionId, selectedFiles.map(f => f.audio_id), [sheet])
      toast.success(t('pp.batch.xlsxExported'))
    } catch(e:any) { toast.error(t('pp.batch.exportFailed')) }
  }

  return (
    <div className="flex flex-col sm:flex-row flex-1 overflow-y-auto sm:overflow-hidden">

      {/* ── Left column: file list ───────────────────────────────── */}
      <div className="w-full sm:w-52 shrink-0 max-h-44 sm:max-h-none border-b sm:border-b-0 sm:border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">{t('pp.batch.files')}</span>
          <button onClick={toggleAll} className="text-[11px] text-muted hover:text-teal transition-colors">
            {allChecked ? t('pp.batch.none') : t('pp.batch.all')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {files.length === 0 && (
            <p className="text-[11px] text-muted text-center py-6">{t('pp.batch.noFiles')}</p>
          )}
          {files.map(f => (
            <button
              key={f.audio_id}
              onClick={() => toggleFile(f.audio_id)}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                checkedIds.has(f.audio_id) ? 'text-white' : 'text-muted/70'
              )}
            >
              {checkedIds.has(f.audio_id)
                ? <CheckSquare size={13} className="text-teal shrink-0" />
                : <Square size={13} className="shrink-0" />
              }
              <span className="flex flex-col min-w-0">
                <span className="text-xs truncate" title={f.name}>
                  {f.name.replace(/\.wav$/i,'')}
                </span>
                {sections[f.audio_id] && (
                  <span className="text-[11px] text-teal/80 truncate">
                    {t('pp.batch.section', { a: sections[f.audio_id]![0], b: sections[f.audio_id]![1] })}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border shrink-0">
          <span className="text-[11px] text-muted">{t('pp.batch.selectedCount', { n: selectedFiles.length, total: files.length })}</span>
        </div>
      </div>

      {/* ── Right area: controls + results ───────────────────────── */}
      <div className="flex flex-col sm:flex-1 sm:overflow-hidden">

        {/* Controls bar */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex flex-col gap-3 bg-surface/40">

          {selectedFiles.some(f => f.channels > 1) && <ChannelNotice />}

          {/* Row 1: metrics */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted uppercase tracking-wider shrink-0 whitespace-nowrap">{t('pp.batch.metrics')}</span>
            {BATCH_METRICS.map(({ key, label }) => (
              <button key={key} onClick={() => toggle(key)} disabled={busy}
                className={clsx('px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40',
                  selected.includes(key)
                    ? 'bg-teal/20 border-teal text-teal font-medium'
                    : 'bg-panel border-border text-muted hover:text-white'
                )}>
                {label}
              </button>
            ))}
          </div>

          {/* Row 2: annoyance + field type + compute */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted uppercase tracking-wider shrink-0 whitespace-nowrap">{t('pp.batch.annoyance')}</span>
            {ANNOYANCE_MODELS.map(({ key, fullKey, tipKey }) => (
              <button key={key} onClick={() => toggleAnn(key)} disabled={busy} title={t(tipKey)}
                className={clsx('px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40',
                  annoyance.includes(key)
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-medium'
                    : 'bg-panel border-border text-muted hover:text-white'
                )}>
                {t(fullKey)}
              </button>
            ))}

            <div className="flex-1" />

            {/* Field type */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">{t('pp.batch.field')}</span>
              <div className="seg" role="group" aria-label={t('pp.batch.field')}>
                {(['free','diffuse'] as FieldType[]).map(ft => (
                  <button key={ft} onClick={() => setFieldType(ft)} disabled={busy} aria-pressed={fieldType === ft}>
                    {ft === 'free' ? t('pp.batch.free') : t('pp.batch.diffuse')}
                  </button>
                ))}
              </div>
            </div>

            {selected.includes('tonality_ecma') && <TonalityPrecisionSelect compact disabled={busy} />}

            {/* Compute */}
            <button onClick={compute}
              disabled={busy || !selected.length || !selectedFiles.length}
              className="btn btn-primary">
              {busy ? <><Loader2 size={12} className="animate-spin" /> {t('pp.batch.computing')}</> : t('pp.batch.compute')}
            </button>

            {augRows && augRows.length > 0 && !busy && (
              <button onClick={doExport}
                className="btn btn-secondary">
                <Download size={13} /> {t('pp.batch.exportXlsx')}
              </button>
            )}
          </div>

          {/* Row 3: user-defined models */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted uppercase tracking-wider shrink-0 whitespace-nowrap">{t('pp.batch.models')}</span>
            {models.map(m => (
              <span key={m.id} className={clsx('inline-flex items-stretch rounded border text-xs overflow-hidden',
                m.on ? 'border-amber-500 bg-amber-500/20 text-amber-400' : 'border-border bg-panel text-muted')}>
                <button onClick={() => setBatchModels(models.map(x => x.id === m.id ? { ...x, on: !x.on } : x))} disabled={busy}
                  aria-pressed={m.on} title={t('pp.batch.modelToggle')}
                  className={clsx('px-2.5 py-1 transition-colors disabled:opacity-40', m.on ? 'font-medium' : 'hover:text-white')}>
                  {m.name || t('pp.batch.modelUnnamed')}
                </button>
                <button onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                  aria-label={t('pp.batch.modelEdit')} title={t('pp.batch.modelEdit')}
                  className="px-1.5 border-l border-current/30 hover:text-white transition-colors"><Pencil size={11} /></button>
              </span>
            ))}
            <button onClick={() => {
                const id = newModelId()
                setBatchModels([...models, { id, name: t('pp.batch.modelDefaultName', { n: models.length + 1 }), unit: '', intercept: 0, weights: {}, on: true }])
                setEditingId(id)
              }}
              disabled={busy || models.length >= 20}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-dashed border-border text-muted hover:text-white transition-colors disabled:opacity-40">
              <Plus size={12} /> {t('pp.batch.modelNew')}
            </button>
          </div>
          {editingId && models.find(m => m.id === editingId) && (() => {
            const m = models.find(x => x.id === editingId)!
            return (
              <ModelEditor
                model={m}
                labelOf={k => BATCH_METRICS.find(x => x.key === k)?.label ?? k}
                shortOf={k => BATCH_METRICS.find(x => x.key === k)?.short ?? k}
                onChange={patch => setBatchModels(models.map(x => x.id === m.id ? { ...x, ...patch } : x))}
                onDelete={() => { setBatchModels(models.filter(x => x.id !== m.id)); setEditingId(null) }}
                onClose={() => setEditingId(null)}
              />
            )
          })()}

          {withSection.length > 0 && (
            <p className="text-[11px] text-muted">
              {t('pp.batch.usingSectionPre')} <span className="text-teal">{t(withSection.length > 1 ? 'pp.batch.fileMany' : 'pp.batch.fileOne', { n: withSection.length })}</span>
              {' '}{t('pp.batch.usingSectionPost')}
            </p>
          )}

          {/* Auto-added notice */}
          {autoAdded.length > 0 && (
            <p className="text-[11px] text-muted">
              {t('pp.batch.autoAdding')} <span className="text-amber-400">{autoAdded.map(keyLabel).join(', ')}</span>
            </p>
          )}
        </div>

        {/* Progress / results */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3 min-h-[320px] sm:min-h-0">

          {busy && <BatchProgress step={pStep} total={pTotal} label={pLabel} elapsed={(Date.now() - startedAt) / 1000} eta={etaTotal} onCancel={cancel} />}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {!busy && !augRows && !error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted">
              <p className="text-sm">{t('pp.batch.hintPre')} <span className="text-teal font-semibold">{t('pp.batch.compute')}</span></p>
              <p className="text-[11px]">{t(selectedFiles.length !== 1 ? 'pp.batch.nSelectedMany' : 'pp.batch.nSelectedOne', { n: selectedFiles.length })}</p>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2 space-y-1">
              <p className="font-semibold">
                {t(skipped.length > 1 ? 'pp.batch.skippedMany' : 'pp.batch.skippedOne', { n: skipped.length })}
              </p>
              {skipped.slice(0, 4).map((s, i) => (
                <p key={i} className="text-amber-300/80">
                  {s.name.replace(/\.wav$/i, '')} · {keyLabel(s.metric)}: {s.reason}
                </p>
              ))}
              {skipped.length > 4 && <p className="text-amber-300/60">{t('pp.batch.more', { n: skipped.length - 4 })}</p>}
            </div>
          )}

          {unexplainedFailures.length > 0 && (
            <p className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2">
              {t('pp.batch.noResult', { list: unexplainedFailures.map(keyLabel).join(', ') })}
            </p>
          )}

          {augRows && augRows.length > 0 && !busy && (
            <p className="text-[11px] text-muted">
              {limited.length > 0
                ? <><span className="text-teal font-semibold">{t('pp.batch.limitsSummary', { pass: nPass, fail: nFail, missing: nMissing })}</span>
                    <button onClick={() => limited.forEach(k => setBatchLimit(k, { min: null, max: null }))}
                      className="ml-3 underline hover:text-white">{t('pp.batch.limitsClear')}</button></>
                : t('pp.batch.limitsHint')}
            </p>
          )}

          {augRows && augRows.length > 0 && !busy && (
            <div className="overflow-auto rounded-lg border border-border flex-1">
              <table className="text-xs border-collapse"
                style={{ tableLayout:'fixed', width:'100%', minWidth:`${180+displayKeys.length*120+(limited.length ? 110 : 0)}px` }}>
                <colgroup>
                  <col style={{ width:'180px' }} />
                  {displayKeys.map(k => <col key={k} style={{ width:'120px' }} />)}
                  {limited.length > 0 && <col style={{ width:'110px' }} />}
                </colgroup>
                <thead>
                  <tr className="bg-panel sticky top-0 z-10">
                    <th className="text-left px-3 py-2.5 text-muted font-semibold border-b border-border">{t('pp.batch.colFile')}</th>
                    {displayKeys.map(k => (
                      <th key={k} className={clsx(
                        'text-right px-3 py-2.5 font-semibold border-b border-l border-border whitespace-nowrap',
                        k.startsWith('annoyance') || isModelKey(k) ? 'text-amber-400/80'
                        : failedKeys.includes(k) ? 'text-muted/70' : 'text-muted'
                      )}>
                        {keyLabel(k)}
                        <span className="flex justify-end gap-1 mt-1">
                          <NumberInput value={limits[k]?.min ?? null} onChange={v => setBatchLimit(k, { min: v })}
                            placeholder={t('pp.batch.limitMin')} title={t('pp.batch.limitMinTitle')} />
                          <NumberInput value={limits[k]?.max ?? null} onChange={v => setBatchLimit(k, { max: v })}
                            placeholder={t('pp.batch.limitMax')} title={t('pp.batch.limitMaxTitle')} />
                        </span>
                      </th>
                    ))}
                    {limited.length > 0 && (
                      <th className="text-left px-3 py-2.5 text-muted font-semibold border-b border-l border-border align-top whitespace-nowrap">{t('pp.batch.colResult')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {augRows.map((row, i) => (
                    <tr key={row.audio_id}
                      className={clsx(i%2===0 ? 'bg-surface' : 'bg-dark', 'hover:bg-teal/5 transition-colors')}>
                      <td className="px-3 py-2 text-white border-b border-border/50"
                        title={row.name}
                        style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {row.name.replace(/\.wav$/i,'')}
                        {row.section && <span className="block text-[11px] text-teal/80">{t('pp.batch.section', { a: row.section[0], b: row.section[1] })}</span>}
                      </td>
                      {displayKeys.map(k => {
                        const v = judge(row[k], limits[k])
                        return (
                          <td key={k} className={clsx(
                            'px-3 py-2 text-right font-mono tabular-nums border-b border-l border-border/50',
                            v === 'fail' ? 'bg-red-500/15 text-red-300' : v === 'pass' ? 'bg-teal/10' : '',
                            v !== 'fail' && (k.startsWith('annoyance') || isModelKey(k) ? 'text-amber-400' : 'text-teal')
                          )}>
                            {v === 'pass' && <span className="mr-1 text-teal" aria-label={t('pp.batch.pass')}>✓</span>}
                            {v === 'fail' && <span className="mr-1" aria-label={t('pp.batch.fail')}>✗</span>}
                            {row[k] != null ? Number(row[k]).toFixed(3) : <span className="text-muted/70">—</span>}
                          </td>
                        )
                      })}
                      {limited.length > 0 && (
                        <td className={clsx('px-3 py-2 border-b border-l border-border/50 font-semibold whitespace-nowrap',
                          verdicts[i] === 'pass' ? 'text-teal' : verdicts[i] === 'fail' ? 'text-red-300' : 'text-muted')}>
                          {verdictMark(verdicts[i])} {verdictText(verdicts[i]) || '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
