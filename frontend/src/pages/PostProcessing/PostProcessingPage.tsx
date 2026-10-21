import React, { useState, useCallback } from 'react'
import { Download, PanelLeftOpen, PanelLeftClose, BarChart3, Waves, LayoutGrid, BarChart2, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { toast } from '../../store/useToast'
import { uploadFiles, deleteAudio, setCalibration as apiSetCalibration, clearCalibration as apiClearCalibration } from '../../api/audioApi'
import { restoreSession } from '../../api/http'
import { AudioFile, ViewMode, MetricKey, FieldType } from '../../types'
import FileDropzone from '../../components/FileDropzone'
import AudioList from '../../components/AudioList'
import MetricSelector from '../../components/MetricSelector'
import PlotPanel from '../../components/PlotPanel'
import AudioPlayer from '../../components/AudioPlayer'
import ProcessingModal from '../../components/ProcessingModal'
import ExportModal from '../../components/ExportModal'
import BatchPanel from './BatchPanel'

const VIEW_MODES: { key: ViewMode; label: string; Icon: React.ElementType }[] = [
  { key: 'normal',      label: 'Normal',      Icon: Waves },
  { key: 'spectrogram', label: 'Spectrogram', Icon: LayoutGrid },
  { key: 'octave',      label: '1/3 Octave',  Icon: BarChart2 },
  { key: 'envelope',    label: 'Envelope',    Icon: TrendingUp },
]

export default function PostProcessingPage() {
  const {
    sessionId, files, selectedId,
    viewMode, metricKey, fieldType, calibrations, compareId,
    addFiles, removeFile, selectFile,
    setViewMode, setMetricKey, setFieldType, setCalibration, setCompareId,
  } = useStore()

  const [uploading,    setUploading]    = useState(false)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [showExport,   setShowExport]   = useState(false)
  const [uploadError,  setUploadError]  = useState('')
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [calInput,     setCalInput]     = useState('')
  const [calError,     setCalError]     = useState('')
  const [calBusy,      setCalBusy]      = useState(false)
  const [showBatch,    setShowBatch]    = useState(false)

  const selectedFile = files.find((f) => f.audio_id === selectedId) ?? null
  const streamUrl    = selectedFile
    ? `/api/audio/${sessionId}/${selectedFile.audio_id}/stream`
    : null

  const handleFiles = useCallback(async (rawFiles: File[]) => {
    setUploading(true); setUploadError('')
    try {
      const uploaded = await uploadFiles(sessionId, rawFiles)
      addFiles(uploaded)
      toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`)
    } catch (e: any) {
      setUploadError(e.message)
      toast.error('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }, [sessionId, addFiles])

  const handleRemove = useCallback(async (id: string) => {
    await deleteAudio(sessionId, id)
    removeFile(id)
  }, [sessionId, removeFile])

  const handleProcessed = useCallback((newFile: AudioFile) => {
    addFiles([newFile])
    selectFile(newFile.audio_id)
    // The server copies the calibration of the file it was made from into the new one
    const inherited = editId ? calibrations[editId] : null
    if (inherited != null) setCalibration(newFile.audio_id, inherited)
  }, [addFiles, selectFile, editId, calibrations, setCalibration])

  const handleCalibrate = async () => {
    if (!selectedId) return
    const val = parseFloat(calInput)
    if (isNaN(val) || val <= 0) { setCalError('Enter a positive number'); return }
    setCalBusy(true); setCalError('')
    try {
      await apiSetCalibration(sessionId, selectedId, val)
      setCalibration(selectedId, val)
      setCalInput('')
      toast.success('Calibration applied')
    } catch (e: any) {
      setCalError(e.message)
    } finally {
      setCalBusy(false)
    }
  }

  const handleClearCal = async () => {
    if (!selectedId) return
    await apiClearCalibration(sessionId, selectedId)
    setCalibration(selectedId, null)
    toast.info('Calibration cleared')
  }

  const editFile   = editId ? files.find((f) => f.audio_id === editId) : null
  const otherFiles = editFile ? files.filter((f) => f.audio_id !== editId) : []

  return (
    <div className="flex flex-1 overflow-hidden relative">

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={clsx(
        'flex flex-col gap-3 p-3 border-r border-border overflow-y-auto shrink-0 transition-transform',
        'sm:relative sm:translate-x-0 sm:w-64',
        'fixed top-0 left-0 h-full w-72 z-30 bg-surface sm:bg-transparent',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
      )}>
        <FileDropzone onFiles={handleFiles} disabled={uploading} />
        {uploading    && <p className="text-[10px] text-teal text-center animate-pulse">Uploading…</p>}
        {uploadError  && <p className="text-[10px] text-red-400 text-center">{uploadError}</p>}

        <AudioList
          files={files}
          selectedId={selectedId}
          onSelect={(id) => { selectFile(id); setSidebarOpen(false) }}
          onRemove={handleRemove}
          onEdit={(id) => setEditId(id)}
        />

        {files.length > 0 && (
          <>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] text-muted uppercase tracking-wider">Metric</p>
              <MetricSelector
                value={metricKey}
                onChange={(k) => { setMetricKey(k); if (k !== 'none') setViewMode('normal') }}
                disabled={!selectedId}
              />
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] text-muted uppercase tracking-wider">Field Type</p>
              <div className="flex gap-1">
                {(['free', 'diffuse'] as FieldType[]).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => setFieldType(ft)}
                    className={`flex-1 py-1 text-xs rounded transition-colors ${fieldType === ft ? 'bg-teal text-dark font-semibold' : 'bg-panel text-muted hover:text-white'}`}
                  >
                    {ft === 'free' ? 'Free-field' : 'Diffuse'}
                  </button>
                ))}
              </div>
            </div>

            {files.length > 1 && selectedId && !showBatch && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Compare with</p>
                <select
                  value={compareId ?? ''}
                  onChange={e => setCompareId(e.target.value || null)}
                  className="w-full bg-panel border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-teal"
                >
                  <option value="">— None —</option>
                  {files.filter(f => f.audio_id !== selectedId).map(f => (
                    <option key={f.audio_id} value={f.audio_id}>
                      {f.name.replace(/\.wav$/i, '')}
                    </option>
                  ))}
                </select>
                {compareId && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#60a5fa' }} />
                    <span className="text-muted truncate">{files.find(f => f.audio_id === compareId)?.name.replace(/\.wav$/i,'')}</span>
                    <button onClick={() => setCompareId(null)} className="ml-auto text-muted hover:text-red-400 transition-colors">✕</button>
                  </div>
                )}
              </div>
            )}

            {selectedId && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Mic Calibration</p>
                {calibrations[selectedId] != null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-teal flex-1">
                      {calibrations[selectedId]!.toFixed(1)} mV/Pa ✓
                    </span>
                    <button
                      onClick={handleClearCal}
                      className="text-[10px] text-muted hover:text-red-400 transition-colors"
                    >Clear</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="mV/Pa"
                      value={calInput}
                      onChange={e => { setCalInput(e.target.value); setCalError('') }}
                      className="flex-1 w-0 min-w-0 bg-panel border border-border rounded px-2 py-0.5 text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-teal"
                    />
                    <button
                      onClick={handleCalibrate}
                      disabled={calBusy || !calInput}
                      className="px-2 py-0.5 text-xs bg-teal text-dark rounded hover:bg-teal/80 disabled:opacity-40 transition-colors font-semibold"
                    >Set</button>
                  </div>
                )}
                {calError && <p className="text-[10px] text-red-400">{calError}</p>}
              </div>
            )}

          </>
        )}
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          <button
            className="sm:hidden p-1.5 rounded text-muted hover:text-white hover:bg-panel transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          <div className="flex gap-1 flex-wrap">
            {VIEW_MODES.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setViewMode(key); if (key !== 'normal') setMetricKey('none'); setShowBatch(false) }}
                disabled={!selectedId}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors disabled:opacity-30',
                  viewMode === key && metricKey === 'none' && !showBatch
                    ? 'bg-teal text-dark'
                    : 'bg-panel text-muted hover:text-white hover:bg-panel/80'
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {files.length > 0 && (
            <button
              onClick={() => setShowBatch(!showBatch)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors border',
                showBatch
                  ? 'bg-orange-500/20 border-orange-500/60 text-orange-400'
                  : 'bg-panel border-border text-muted hover:text-white hover:bg-panel/80'
              )}
            >
              <BarChart3 size={13} />
              Batch
            </button>
          )}

          <div className="flex-1" />

          {selectedId && !showBatch && (
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors"
            >
              <Download size={13} />
              Export
            </button>
          )}
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          {showBatch && files.length > 0
            ? <BatchPanel />
            : (
              <div className="flex flex-col flex-1 overflow-hidden p-2 gap-1">
                <div className="flex-1 overflow-hidden">
                  <PlotPanel />
                </div>
                {selectedFile && (
                  <AudioPlayer src={streamUrl} fileName={selectedFile.name} onError={() => { void restoreSession(sessionId) }} />
                )}
              </div>
            )
          }
        </div>
      </div>

      {editId && editFile && (
        <ProcessingModal
          sessionId={sessionId}
          audioId={editId}
          audioName={editFile.name}
          sampleRate={editFile.sample_rate}
          otherFiles={otherFiles}
          onClose={() => setEditId(null)}
          onResult={handleProcessed}
        />
      )}

      {showExport && selectedFile && (
        <ExportModal
          sessionId={sessionId}
          audioId={selectedFile.audio_id}
          audioName={selectedFile.name}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
