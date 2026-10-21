import { useEffect, useState } from 'react'
import { X, FileAudio, Sheet as SheetIcon, FileText, Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { toast } from '../store/useToast'
import { getWavUrl, exportXlsx, downloadCsv, slug } from '../api/exportApi'
import { buildExport, rowCount, ExportData } from '../api/exportData'

interface Props {
  sessionId: string
  audioId: string
  audioName: string
  onClose: () => void
}

const optionCls =
  'flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-panel border border-border hover:border-teal/40 hover:bg-teal/5 disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-panel transition-colors text-left'

export default function ExportModal({ sessionId, audioId, audioName, onClose }: Props) {
  // What is on screen when the dialog opens decides what is exported
  const [view] = useState(() => {
    const s = useStore.getState()
    return {
      viewMode: s.viewMode, metricKey: s.metricKey, fieldType: s.fieldType, octaveWeighting: s.octaveWeighting,
      spectrogramParams: s.spectrogramParams, envelopeParams: s.envelopeParams,
      section: s.sections[audioId] ?? null,
    }
  })

  const [data, setData]           = useState<ExportData | null>(null)
  const [error, setError]         = useState('')
  const [csvSheet, setCsvSheet]   = useState('')
  const [busy, setBusy]           = useState<'xlsx' | 'csv' | null>(null)
  const base = audioName.replace(/\.wav$/i, '')

  // Collect the tables behind the plot that is on screen
  useEffect(() => {
    let alive = true
    buildExport({ sessionId, audioId, ...view })
      .then((d) => { if (alive) { setData(d); setCsvSheet(d.sheets[0]?.name ?? '') } })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleWav = () => {
    const a = document.createElement('a')
    a.href = getWavUrl(sessionId, audioId); a.download = audioName; a.click()
    onClose()
  }

  const handleXlsx = async () => {
    if (!data) return
    setBusy('xlsx')
    try {
      await exportXlsx(
        sessionId, [audioId],
        data.sheets.map((s) => ({ sheet_name: s.name, columns: s.columns })),
        `${base}_${slug(data.label)}.xlsx`,
      )
      toast.success('Excel file ready')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setBusy(null) }
  }

  const handleCsv = () => {
    const sheet = data?.sheets.find((s) => s.name === csvSheet)
    if (!data || !sheet) return
    setBusy('csv')
    try {
      // The analysis tables of a section say so in the file name; the waveform is always the whole file
      const part = view.section && sheet.name !== 'Waveform' ? `_section-${slug(`${view.section[0]}-${view.section[1]}`)}` : ''
      downloadCsv(sheet.columns, `${base}_${slug(sheet.name)}${part}.csv`)
      toast.success('CSV file ready')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setBusy(null) }
  }

  const loading = !data && !error
  const ready = !!data && data.sheets.length > 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-[380px] max-w-[94vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-white">Export</span>
          <button onClick={onClose} className="text-muted hover:text-white" aria-label="Close"><X size={15} /></button>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-xs text-muted mb-3">Export from <em className="text-white">{audioName}</em></p>

          <button onClick={handleWav} className={optionCls}>
            <FileAudio size={18} className="text-teal shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Audio (.wav)</p>
              <p className="text-[10px] text-muted">Download the (processed) WAV file</p>
            </div>
          </button>

          <div className="pt-2">
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
              Data on screen{data ? ` — ${data.label}` : ''}
            </p>
            {loading && (
              <p className="flex items-center gap-2 text-[11px] text-muted"><Loader2 size={12} className="animate-spin text-teal" /> Collecting the data…</p>
            )}
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            {data && (
              <ul className="text-[11px] text-muted space-y-0.5 mb-2">
                {data.sheets.map((s) => (
                  <li key={s.name}>{s.name} · {rowCount(s).toLocaleString('en-US')} rows · {Object.keys(s.columns).length} columns</li>
                ))}
              </ul>
            )}
          </div>

          <button onClick={handleXlsx} disabled={!ready || busy !== null} className={optionCls}>
            {busy === 'xlsx' ? <Loader2 size={18} className="animate-spin text-teal shrink-0" /> : <SheetIcon size={18} className="text-teal shrink-0" />}
            <div>
              <p className="text-xs font-semibold text-white">Excel (.xlsx)</p>
              <p className="text-[10px] text-muted">{data && data.sheets.length > 1 ? `All ${data.sheets.length} tables, one sheet each` : 'The table on screen'}</p>
            </div>
          </button>

          <div className="flex items-stretch gap-2">
            <button onClick={handleCsv} disabled={!ready || busy !== null} className={optionCls}>
              <FileText size={18} className="text-teal shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">CSV (.csv)</p>
                <p className="text-[10px] text-muted">One table, made in your browser</p>
              </div>
            </button>
            {data && data.sheets.length > 1 && (
              <select
                value={csvSheet}
                onChange={(e) => setCsvSheet(e.target.value)}
                aria-label="Table to export as CSV"
                className="w-28 shrink-0 bg-panel border border-border rounded-lg px-2 text-xs text-white focus:outline-none focus:border-teal"
              >
                {data.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="px-4 pb-4">
          <button onClick={onClose} className="w-full py-1.5 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
