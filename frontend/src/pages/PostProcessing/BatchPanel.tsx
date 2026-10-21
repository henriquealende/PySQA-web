import { useState } from 'react'
import { Loader2, Download, CheckSquare, Square } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { fetchBatch } from '../../api/audioApi'
import { MetricKey, FieldType } from '../../types'
import { exportXlsx } from '../../api/exportApi'
import { toast } from '../../store/useToast'

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
  { key: 'sil', label: 'SIL',  full: 'Annoyance SIL', tip: 'Requires N, S, R, IPM' },
  { key: 'zwk', label: 'ZWK', full: 'Annoyance ZWK', tip: 'Requires N, S, R, FS' },
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
  // Zwicker-Fastl Psychoacoustic Annoyance (Psychoacoustics: Facts and Models, Ch. 12)
  const ws = Math.max(0, 0.25 * (s - 1.75))
  const wf = (2.18 / Math.pow(n, 0.4)) * (0.4 * f + 0.6 * Math.max(f - 0.4, 0))
  const wr = 0.95 * r / n
  return n * (1 + Math.sqrt(ws*ws + wf*wf + wr*wr))
}

function BatchProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((step/total)*100) : 0
  return (
    <div className="flex flex-col gap-2 py-3 px-4 bg-panel rounded-lg border border-border">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 size={13} className="animate-spin text-teal shrink-0" />
        <span className="truncate flex-1">{label}</span>
        <span className="tabular-nums text-[10px] shrink-0 text-teal font-semibold">{step}/{total}</span>
      </div>
      <div className="w-full h-2 bg-dark rounded-full overflow-hidden border border-border/50">
        <div className="h-full rounded-full transition-all duration-200 ease-out"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#50b89e,#3dd6b0)' }} />
      </div>
      <span className="text-[10px] text-muted/50 tabular-nums text-right">{pct}%</span>
    </div>
  )
}

export default function BatchPanel() {
  const { sessionId, files, fieldType, setFieldType } = useStore()

  // File selection
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(files.map(f => f.audio_id)))
  const toggleFile = (id: string) => setCheckedIds(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allChecked = files.length > 0 && files.every(f => checkedIds.has(f.audio_id))
  const toggleAll  = () => setCheckedIds(allChecked ? new Set() : new Set(files.map(f => f.audio_id)))

  const selectedFiles = files.filter(f => checkedIds.has(f.audio_id))

  // Metric + annoyance selection
  const [selected,  setSelected]  = useState<MetricKey[]>(['loudness_zwk','sharpness_din'])
  const [annoyance, setAnnoyance] = useState<string[]>([])

  const toggle = (k: MetricKey) =>
    setSelected(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])
  const toggleAnn = (k: string) =>
    setAnnoyance(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])

  const silNeeds: MetricKey[] = ['loudness_zwk','sharpness_din','roughness_dw','ipm']
  const zwkNeeds: MetricKey[] = ['loudness_zwk','sharpness_din','roughness_dw','fluctuation_strength']
  const metricsToCompute = (): MetricKey[] => {
    const extra: MetricKey[] = []
    if (annoyance.includes('sil')) silNeeds.forEach(k => { if (!selected.includes(k)) extra.push(k) })
    if (annoyance.includes('zwk')) zwkNeeds.forEach(k => { if (!selected.includes(k)) extra.push(k) })
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
    const ann = ANNOYANCE_MODELS.find(m => `annoyance_${m.key}` === k)
    if (ann) return ann.full
    return BATCH_METRICS.find(m => m.key === k)?.label ?? k
  }

  const compute = async () => {
    const metrics = metricsToCompute()
    if (!metrics.length || !selectedFiles.length) return
    setBusy(true); setError(''); setRows(null); setSkipped([])
    setPStep(0); setPTotal(1); setPLabel('Computing all metrics on server…')
    try {
      const result = await fetchBatch(
        sessionId,
        selectedFiles.map(f => f.audio_id),
        metrics,
        fieldType,
      )
      // Merge names into rows (server rows only have audio_id)
      const named = result.rows.map(row => ({
        ...row,
        name: files.find(f => f.audio_id === row.audio_id)?.name ?? row.audio_id,
      }))
      setRows(named); setKeys(result.metric_keys as MetricKey[])
      setSkipped(result.skipped ?? [])
      setPStep(1)
      toast.success('Batch analysis complete')
    } catch(e:any) {
      setError(e.message); toast.error('Batch failed')
    } finally {
      setBusy(false); setPLabel('')
    }
  }

  const augRows = rows ? rows.map(row => {
    const r = {...row}
    if (annoyance.includes('sil')) r['annoyance_sil'] = computeSIL(row)
    if (annoyance.includes('zwk')) r['annoyance_zwk'] = computeZWK(row)
    return r
  }) : null

  const displayKeys = [
    ...keys,
    ...(annoyance.includes('sil') ? ['annoyance_sil'] : []),
    ...(annoyance.includes('zwk') ? ['annoyance_zwk'] : []),
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
    const unit  = METRIC_UNITS[k]
    return unit ? `${label}\n(${unit})` : label
  }

  const doExport = async () => {
    if (!augRows) return
    try {
      const columns: Record<string,any[]> = { 'File': augRows.map(r => r.name) }
      displayKeys.forEach(k => { columns[colHeader(k)] = augRows.map(r => r[k]??'') })
      await exportXlsx(sessionId, selectedFiles.map(f => f.audio_id), [{ sheet_name:'Batch Results', columns }])
      toast.success('XLSX exported')
    } catch(e:any) { toast.error('Export failed') }
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left column: file list ───────────────────────────────── */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Files</span>
          <button onClick={toggleAll} className="text-[10px] text-muted hover:text-teal transition-colors">
            {allChecked ? 'None' : 'All'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {files.length === 0 && (
            <p className="text-[10px] text-muted text-center py-6">No files uploaded</p>
          )}
          {files.map(f => (
            <button
              key={f.audio_id}
              onClick={() => toggleFile(f.audio_id)}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                checkedIds.has(f.audio_id) ? 'text-white' : 'text-muted/50'
              )}
            >
              {checkedIds.has(f.audio_id)
                ? <CheckSquare size={13} className="text-teal shrink-0" />
                : <Square size={13} className="shrink-0" />
              }
              <span className="text-xs truncate" title={f.name}>
                {f.name.replace(/\.wav$/i,'')}
              </span>
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border shrink-0">
          <span className="text-[10px] text-muted">{selectedFiles.length} of {files.length} selected</span>
        </div>
      </div>

      {/* ── Right area: controls + results ───────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Controls bar */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex flex-col gap-3 bg-surface/40">

          {/* Row 1: metrics */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted uppercase tracking-wider shrink-0 whitespace-nowrap">Metrics</span>
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
            <span className="text-[10px] text-muted uppercase tracking-wider shrink-0 whitespace-nowrap">Annoyance</span>
            {ANNOYANCE_MODELS.map(({ key, full, tip }) => (
              <button key={key} onClick={() => toggleAnn(key)} disabled={busy} title={tip}
                className={clsx('px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40',
                  annoyance.includes(key)
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-medium'
                    : 'bg-panel border-border text-muted hover:text-white'
                )}>
                {full}
              </button>
            ))}

            <div className="flex-1" />

            {/* Field type */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Field:</span>
              {(['free','diffuse'] as FieldType[]).map(ft => (
                <button key={ft} onClick={() => setFieldType(ft)} disabled={busy}
                  className={clsx('px-2 py-0.5 text-[11px] rounded transition-colors disabled:opacity-40',
                    fieldType===ft ? 'bg-teal text-dark font-semibold' : 'bg-panel text-muted hover:text-white'
                  )}>
                  {ft === 'free' ? 'Free' : 'Diffuse'}
                </button>
              ))}
            </div>

            {/* Compute */}
            <button onClick={compute}
              disabled={busy || !selected.length || !selectedFiles.length}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal text-dark rounded hover:bg-teal/80 disabled:opacity-40 transition-colors">
              {busy ? <><Loader2 size={12} className="animate-spin" /> Computing…</> : 'Compute'}
            </button>

            {augRows && augRows.length > 0 && !busy && (
              <button onClick={doExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-white rounded border border-border hover:bg-panel transition-colors">
                <Download size={13} /> Export XLSX
              </button>
            )}
          </div>

          {/* Auto-added notice */}
          {autoAdded.length > 0 && (
            <p className="text-[10px] text-muted">
              Auto-adding for annoyance: <span className="text-amber-400">{autoAdded.map(keyLabel).join(', ')}</span>
            </p>
          )}
        </div>

        {/* Progress / results */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">

          {busy && <BatchProgress step={pStep} total={pTotal} label={pLabel} />}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {!busy && !augRows && !error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted">
              <p className="text-sm">Select metrics and click <span className="text-teal font-semibold">Compute</span></p>
              <p className="text-[11px]">{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</p>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2 space-y-1">
              <p className="font-semibold">
                {skipped.length} calculation{skipped.length > 1 ? 's were' : ' was'} skipped to protect the server
              </p>
              {skipped.slice(0, 4).map((s, i) => (
                <p key={i} className="text-amber-300/80">
                  {s.name.replace(/\.wav$/i, '')} · {keyLabel(s.metric)}: {s.reason}
                </p>
              ))}
              {skipped.length > 4 && <p className="text-amber-300/60">+{skipped.length - 4} more</p>}
            </div>
          )}

          {unexplainedFailures.length > 0 && (
            <p className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2">
              No result for: {unexplainedFailures.map(keyLabel).join(', ')}. Check the server log for details.
            </p>
          )}

          {augRows && augRows.length > 0 && !busy && (
            <div className="overflow-auto rounded-lg border border-border flex-1">
              <table className="text-xs border-collapse"
                style={{ tableLayout:'fixed', width:'100%', minWidth:`${180+displayKeys.length*110}px` }}>
                <colgroup>
                  <col style={{ width:'180px' }} />
                  {displayKeys.map(k => <col key={k} style={{ width:'110px' }} />)}
                </colgroup>
                <thead>
                  <tr className="bg-panel sticky top-0 z-10">
                    <th className="text-left px-3 py-2.5 text-muted font-semibold border-b border-border">File</th>
                    {displayKeys.map(k => (
                      <th key={k} className={clsx(
                        'text-right px-3 py-2.5 font-semibold border-b border-l border-border whitespace-nowrap',
                        k.startsWith('annoyance') ? 'text-amber-400/80'
                        : failedKeys.includes(k) ? 'text-muted/40' : 'text-muted'
                      )}>
                        {keyLabel(k)}
                      </th>
                    ))}
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
                      </td>
                      {displayKeys.map(k => (
                        <td key={k} className={clsx(
                          'px-3 py-2 text-right font-mono tabular-nums border-b border-l border-border/50',
                          k.startsWith('annoyance') ? 'text-amber-400' : 'text-teal'
                        )}>
                          {row[k] != null ? Number(row[k]).toFixed(3) : <span className="text-muted/40">—</span>}
                        </td>
                      ))}
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
