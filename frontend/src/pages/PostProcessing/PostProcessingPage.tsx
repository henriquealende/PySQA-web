import React, { useState, useCallback, lazy, Suspense } from 'react'
import { Download, PanelLeftOpen, PanelLeftClose, BarChart3, Waves, LayoutGrid, BarChart2, TrendingUp, Activity } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { toast } from '../../store/useToast'
import { uploadFiles, deleteAudio, setCalibration as apiSetCalibration, clearCalibration as apiClearCalibration } from '../../api/audioApi'
import { restoreSession } from '../../api/http'
import { AudioFile, ViewMode, MetricKey, FieldType } from '../../types'
import FileDropzone from '../../components/FileDropzone'
import ImportCallout from '../../components/ImportCallout'
import ChannelNotice from '../../components/ChannelNotice'
import TonalityPrecisionSelect from '../../components/TonalityPrecision'
import BugReportButton from '../../components/BugReportButton'
import ConfigMenu from '../../components/ConfigMenu'
import SideSection from '../../components/SideSection'
import AudioList from '../../components/AudioList'
import MetricSelector from '../../components/MetricSelector'
import AudioPlayer from '../../components/AudioPlayer'
import ExportModal from '../../components/ExportModal'
import BatchPanel from './BatchPanel'
import { useT } from '../../i18n'

// Plotly is the heaviest part of the app: load it only when a chart is first needed
const PlotPanel = lazy(() => import('../../components/PlotPanel'))
const ProcessingModal = lazy(() => import('../../components/ProcessingModal'))

const ChartFallback = () => {
  const t = useT()
  return <div className="flex h-full items-center justify-center text-xs text-teal animate-pulse">{t('pp.page.loadingCharts')}</div>
}

const VIEW_MODES: { key: ViewMode; labelKey: string; Icon: React.ElementType }[] = [
  { key: 'normal',      labelKey: 'pp.page.viewNormal',      Icon: Waves },
  { key: 'spectrogram', labelKey: 'pp.page.viewSpectrogram', Icon: LayoutGrid },
  { key: 'octave',      labelKey: 'pp.page.viewOctave',      Icon: BarChart2 },
  { key: 'envelope',    labelKey: 'pp.page.viewEnvelope',    Icon: TrendingUp },
]

export default function PostProcessingPage() {
  const t = useT()
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
  const compareFile  = compareId && compareId !== selectedId ? files.find((f) => f.audio_id === compareId) ?? null : null
  const streamUrl    = selectedFile
    ? `/api/audio/${sessionId}/${selectedFile.audio_id}/stream`
    : null

  const handleFiles = useCallback(async (rawFiles: File[]) => {
    setUploading(true); setUploadError('')
    try {
      const uploaded = await uploadFiles(sessionId, rawFiles)
      addFiles(uploaded)
      toast.success(t(uploaded.length > 1 ? 'pp.page.uploadedMany' : 'pp.page.uploadedOne', { n: uploaded.length }))
    } catch (e: any) {
      setUploadError(e.message)
      toast.error(t('pp.page.uploadFailed', { msg: e.message }))
    } finally {
      setUploading(false)
    }
  }, [sessionId, addFiles, t])

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
    if (isNaN(val) || val <= 0) { setCalError(t('pp.page.calPositive')); return }
    setCalBusy(true); setCalError('')
    try {
      await apiSetCalibration(sessionId, selectedId, val)
      setCalibration(selectedId, val)
      setCalInput('')
      toast.success(t('pp.page.calApplied'))
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
    toast.info(t('pp.page.calCleared'))
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

      {files.length > 0 && (
      <aside className={clsx(
        'flex flex-col gap-3 p-4 border-r border-border overflow-y-auto shrink-0 transition-transform',
        'sm:relative sm:translate-x-0 sm:w-64 lg:w-80',
        'fixed top-0 left-0 h-full w-72 z-30 bg-surface sm:bg-transparent',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
      )}>
        <div className="flex items-center gap-2 px-1 pb-1">
          <Activity size={18} className="text-teal" aria-hidden="true" />
          <h1 className="text-base font-semibold">{t('pp.page.title')}</h1>
        </div>

        <SideSection id="files" title={t('pp.page.sectFiles')}>
          <FileDropzone onFiles={handleFiles} disabled={uploading} highlight={false} />
          {uploading    && <p className="text-[11px] text-teal text-center animate-pulse">{t('pp.page.uploading')}</p>}
          {uploadError  && <p className="text-[11px] text-red-400 text-center">{uploadError}</p>}
          <AudioList
            files={files}
            selectedId={selectedId}
            onSelect={(id) => { selectFile(id); setSidebarOpen(false) }}
            onRemove={handleRemove}
            onEdit={(id) => setEditId(id)}
          />
        </SideSection>

        <SideSection id="analysis" title={t('pp.page.sectAnalysis')}>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">{t('pp.page.metric')}</p>
            <MetricSelector
              value={metricKey}
              onChange={(k) => { setMetricKey(k); if (k !== 'none') setViewMode('normal') }}
              disabled={!selectedId}
            />
            {(selectedFile?.channels ?? 1) > 1 && metricKey !== 'none' && <ChannelNotice />}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">{t('pp.page.fieldType')}</p>
            <div className="seg seg-fill">
              {(['free', 'diffuse'] as FieldType[]).map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFieldType(ft)}
                  aria-pressed={fieldType === ft}
                >
                  {ft === 'free' ? t('pp.page.freeField') : t('pp.page.diffuse')}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted">{t('pp.page.fieldHelp')}</p>
          </div>

          {metricKey === 'tonality_ecma' && <TonalityPrecisionSelect />}

          {files.length > 1 && selectedId && !showBatch && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted">{t('pp.page.compareWith')}</p>
              <select
                value={compareId ?? ''}
                onChange={e => setCompareId(e.target.value || null)}
                className="w-full bg-panel border border-field rounded px-2 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal"
              >
                <option value="">{t('pp.page.none')}</option>
                {files.filter(f => f.audio_id !== selectedId).map(f => (
                  <option key={f.audio_id} value={f.audio_id}>
                    {f.name.replace(/\.wav$/i, '')}
                  </option>
                ))}
              </select>
              {compareId && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#60a5fa' }} />
                  <span className="text-muted truncate">{files.find(f => f.audio_id === compareId)?.name.replace(/\.wav$/i,'')}</span>
                  <button onClick={() => setCompareId(null)} aria-label={t('pp.page.clear')} className="ml-auto px-1 text-muted hover:text-red-400 transition-colors">✕</button>
                </div>
              )}
            </div>
          )}
        </SideSection>

        {selectedId && (
          <SideSection
            id="calibration" title={t('pp.page.micCal')} defaultOpen={false}
            summary={calibrations[selectedId] != null ? `${calibrations[selectedId]!.toFixed(1)} mV/Pa ✓` : undefined}
          >
            {calibrations[selectedId] != null ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-teal flex-1">
                  {calibrations[selectedId]!.toFixed(1)} mV/Pa ✓
                </span>
                <button
                  onClick={handleClearCal}
                  className="text-[11px] text-muted hover:text-red-400 transition-colors"
                >{t('pp.page.clear')}</button>
              </div>
            ) : (
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="mV/Pa"
                  aria-label={t('pp.page.micCal')}
                  value={calInput}
                  onChange={e => { setCalInput(e.target.value); setCalError('') }}
                  className="flex-1 w-0 min-w-0 bg-panel border border-field rounded px-2 py-0.5 text-xs text-white placeholder:text-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal"
                />
                <button
                  onClick={handleCalibrate}
                  disabled={calBusy || !calInput}
                  className="btn btn-primary btn-sm"
                >{t('pp.page.set')}</button>
              </div>
            )}
            {calError && <p className="text-[11px] text-red-400">{calError}</p>}
            <p className="text-[11px] leading-snug text-muted">{t('pp.page.calHelp')}</p>
          </SideSection>
        )}

        <SideSection id="setup" title={t('pp.cfg.title')} defaultOpen={false}>
          <ConfigMenu />
        </SideSection>

        <div className="mt-auto pt-2"><BugReportButton /></div>
      </aside>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        {files.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          <button
            className="sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-border text-muted hover:text-white hover:bg-panel transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-expanded={sidebarOpen}
            aria-label={t('pp.page.toggleSidebar')}
          >
            {sidebarOpen ? <PanelLeftClose size={15} aria-hidden="true" /> : <PanelLeftOpen size={15} aria-hidden="true" />}
            {t('pp.page.sectFiles')}
          </button>

          <div className="seg flex-wrap">
            {VIEW_MODES.map(({ key, labelKey, Icon }) => (
              <button
                key={key}
                onClick={() => { setViewMode(key); if (key !== 'normal') setMetricKey('none'); setShowBatch(false) }}
                disabled={!selectedId}
                aria-pressed={viewMode === key && metricKey === 'none' && !showBatch}
              >
                <Icon size={13} />
                {t(labelKey)}
              </button>
            ))}
          </div>

          {files.length > 0 && <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />}

          {files.length > 0 && (
            <button
              onClick={() => setShowBatch(!showBatch)}
              aria-pressed={showBatch}
              className="btn btn-secondary btn-sm"
            >
              <BarChart3 size={13} />
              {t('pp.page.batch')}
            </button>
          )}

          <div className="flex-1" />

          {selectedId && !showBatch && (
            <button
              onClick={() => setShowExport(true)}
              className="btn btn-secondary btn-sm"
            >
              <Download size={13} aria-hidden="true" />
              {t('pp.page.export')}
            </button>
          )}
        </div>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          {showBatch && files.length > 0
            ? <BatchPanel />
            : (
              <div className="flex flex-col flex-1 overflow-hidden p-2 gap-1">
                <div className="flex-1 overflow-hidden">
                  {files.length === 0
                    ? <ImportCallout onFiles={handleFiles} disabled={uploading} hintLeft={false} />
                    : <Suspense fallback={<ChartFallback />}><PlotPanel /></Suspense>}
                </div>
                {selectedFile && (
                  <AudioPlayer src={streamUrl} fileName={selectedFile.name} altSrc={compareFile ? `/api/audio/${sessionId}/${compareFile.audio_id}/stream` : null} altName={compareFile?.name} onError={() => { void restoreSession(sessionId) }} />
                )}
              </div>
            )
          }
        </div>
      </div>

      {editId && editFile && (
        <Suspense fallback={null}><ProcessingModal
          sessionId={sessionId}
          audioId={editId}
          audioName={editFile.name}
          sampleRate={editFile.sample_rate}
          otherFiles={otherFiles}
          onClose={() => setEditId(null)}
          onResult={handleProcessed}
        /></Suspense>
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
