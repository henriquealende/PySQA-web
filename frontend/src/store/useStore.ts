import { create } from 'zustand'
import { AudioFile, ViewMode, MetricKey, FieldType, SpectrogramParams, EnvelopeParams } from '../types'

const DEFAULT_SPECTROGRAM: SpectrogramParams = {
  nfft: 2048,
  overlap: 75,
  window: 'hann',
  kaiser_beta: 14,
  cmap: 'magma',
  freq_scale: 'log',
  fmax: null,
  dyn_range: 90,
}

const DEFAULT_ENVELOPE: EnvelopeParams = {
  smoothing_ms: 0,
  lpf_hz: null,
}

interface AppState {
  sessionId: string
  files: AudioFile[]
  selectedId: string | null
  compareId: string | null
  viewMode: ViewMode
  metricKey: MetricKey
  fieldType: FieldType
  octaveWeighting: string
  spectrogramParams: SpectrogramParams
  envelopeParams: EnvelopeParams
  calibrations: Record<string, number | null>  // audio_id → sensitivity_mv_pa
  batchEnabled: boolean
  isLoading: boolean
  loadingMessage: string
  audioIsPlaying: boolean
  audioDuration: number

  setFiles: (files: AudioFile[]) => void
  addFiles: (files: AudioFile[]) => void
  removeFile: (id: string) => void
  selectFile: (id: string | null) => void
  setCompareId: (id: string | null) => void
  setViewMode: (m: ViewMode) => void
  setMetricKey: (k: MetricKey) => void
  setFieldType: (t: FieldType) => void
  setOctaveWeighting: (w: string) => void
  setSpectrogramParams: (p: Partial<SpectrogramParams>) => void
  setEnvelopeParams: (p: Partial<EnvelopeParams>) => void
  setCalibration: (audioId: string, mVPa: number | null) => void
  setBatchEnabled: (v: boolean) => void
  setLoading: (v: boolean, msg?: string) => void
  setAudioPlayback: (isPlaying: boolean, duration: number) => void
  clearSession: () => void
}

// Stable session ID per tab — persists across hot-reloads in dev
const SESSION_ID = (() => {
  const k = 'pysqa_session_id'
  let id = sessionStorage.getItem(k)
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(k, id) }
  return id
})()

export const useStore = create<AppState>((set) => ({
  sessionId: SESSION_ID,
  files: [],
  selectedId: null,
  compareId: null,
  viewMode: 'normal',
  metricKey: 'none',
  fieldType: 'free',
  octaveWeighting: 'Z',
  spectrogramParams: DEFAULT_SPECTROGRAM,
  envelopeParams: DEFAULT_ENVELOPE,
  calibrations: {},
  batchEnabled: false,
  isLoading: false,
  loadingMessage: '',
  audioIsPlaying: false,
  audioDuration: 0,

  setFiles: (files) => set({ files }),
  addFiles: (incoming) => set((s) => {
    const ids = new Set(s.files.map((f) => f.audio_id))
    const fresh = incoming.filter((f) => !ids.has(f.audio_id))
    const next = [...s.files, ...fresh]
    return { files: next, selectedId: s.selectedId ?? (next[0]?.audio_id ?? null) }
  }),
  removeFile: (id) => set((s) => {
    const files = s.files.filter((f) => f.audio_id !== id)
    const selectedId = s.selectedId === id ? (files[0]?.audio_id ?? null) : s.selectedId
    const compareId = s.compareId === id ? null : s.compareId
    return { files, selectedId, compareId }
  }),
  selectFile: (id) => set({ selectedId: id }),
  setCompareId: (compareId) => set({ compareId }),

  setViewMode: (viewMode) => set({ viewMode }),
  setMetricKey: (metricKey) => set({ metricKey }),
  setFieldType: (fieldType) => set({ fieldType }),
  setOctaveWeighting: (octaveWeighting) => set({ octaveWeighting }),
  setSpectrogramParams: (p) => set((s) => ({ spectrogramParams: { ...s.spectrogramParams, ...p } })),
  setEnvelopeParams: (p) => set((s) => ({ envelopeParams: { ...s.envelopeParams, ...p } })),
  setCalibration: (audioId, mVPa) => set((s) => ({
    calibrations: { ...s.calibrations, [audioId]: mVPa },
  })),
  setBatchEnabled: (batchEnabled) => set({ batchEnabled }),
  setLoading: (isLoading, loadingMessage = '') => set({ isLoading, loadingMessage }),
  setAudioPlayback: (audioIsPlaying, audioDuration) => set({ audioIsPlaying, audioDuration }),
  clearSession: () => set({ files: [], selectedId: null }),
}))
