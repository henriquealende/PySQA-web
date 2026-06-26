import { X, FileAudio, Sheet, FileText } from 'lucide-react'
import { getWavUrl, exportXlsx, exportCsv } from '../api/exportApi'
import { MetricResult, WaveformData, SpectrumData } from '../types'

interface Props {
  sessionId: string
  audioId: string
  audioName: string
  currentPlotData?: { columns: Record<string, number[]> }
  onClose: () => void
}

export default function ExportModal({ sessionId, audioId, audioName, currentPlotData, onClose }: Props) {
  const handleWav = () => {
    const url = getWavUrl(sessionId, audioId)
    const a = document.createElement('a')
    a.href = url; a.download = audioName; a.click()
    onClose()
  }

  const handleXlsx = async () => {
    if (!currentPlotData) return
    await exportXlsx(sessionId, [audioId], [{
      sheet_name: audioName.replace(/\.wav$/i, '').slice(0, 31),
      columns: currentPlotData.columns,
    }])
    onClose()
  }

  const handleCsv = async () => {
    if (!currentPlotData) return
    await exportCsv(sessionId, audioId, currentPlotData.columns)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-[360px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-white">Export</span>
          <button onClick={onClose} className="text-muted hover:text-white"><X size={15} /></button>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-xs text-muted mb-3">Choose export format for <em className="text-white">{audioName}</em></p>

          <button
            onClick={handleWav}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-panel border border-border hover:border-teal/40 hover:bg-teal/5 transition-colors text-left"
          >
            <FileAudio size={18} className="text-teal shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Audio (.wav)</p>
              <p className="text-[10px] text-muted">Download the (processed) WAV file</p>
            </div>
          </button>

          <button
            onClick={handleXlsx}
            disabled={!currentPlotData}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-panel border border-border hover:border-teal/40 hover:bg-teal/5 disabled:opacity-40 transition-colors text-left"
          >
            <Sheet size={18} className="text-teal shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Plot data (.xlsx)</p>
              <p className="text-[10px] text-muted">Export current plot series to Excel</p>
            </div>
          </button>

          <button
            onClick={handleCsv}
            disabled={!currentPlotData}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-panel border border-border hover:border-teal/40 hover:bg-teal/5 disabled:opacity-40 transition-colors text-left"
          >
            <FileText size={18} className="text-teal shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Plot data (.csv)</p>
              <p className="text-[10px] text-muted">Export current plot series to CSV</p>
            </div>
          </button>
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
