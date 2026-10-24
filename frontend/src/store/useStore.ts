import { create } from 'zustand'
import { AudioFile, ViewMode, MetricKey, FieldType, TonalityPrecision, Section, SpectrogramParams, EnvelopeParams } from '../types'
import { forgetSession } from '../api/recovery'
import { clearViewCache } from '../api/viewCache'

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
  precision: TonalityPrecision
  octaveWeighting: string
  spectrogramParams: SpectrogramParams
  envelopeParams: EnvelopeParams
  calibrations: Record<string, number | null>  // audio_id → sensitivity_mv_pa
  sections: Record<string, Section | undefined> // audio_id → the part of the file every analysis looks at
  batchEnabled: boolean
  isLoading: boolean
  loadingMessage: string
  audioIsPlaying: boolean
  audioDuration: number
  restore: { done: number; total: number } | null   // files being put back after the server forgot them
  serverWaking: boolean                              // the server is not answering: a cold start
  daqState: 'idle' | 'monitoring' | 'recording'      // is the microphone in use on the Data Acquisition page?

  setFiles: (files: AudioFile[]) => void
  addFiles: (files: AudioFile[]) => void
  removeFile: (id: string) => void
  selectFile: (id: string | null) => void
  setCompareId: (id: string | null) => void
  setViewMode: (m: ViewMode) => void
  setMetricKey: (k: MetricKey) => void
  setFieldType: (t: FieldType) => void
  setPrecision: (p: TonalityPrecision) => void
  setOctaveWeighting: (w: string) => void
  setSpectrogramParams: (p: Partial<SpectrogramParams>) => void
  setEnvelopeParams: (p: Partial<EnvelopeParams>) => void
  setCalibration: (audioId: string, mVPa: number | null) => void
  setSection: (audioId: string, section: Section | null) => void
  setBatchEnabled: (v: boolean) => void
  setLoading: (v: boolean, msg?: string) => void
  setAudioPlayback: (isPlaying: boolean, duration: number) => void
  clearSession: () => void
  hydrate: (files: AudioFile[], calibrations: Record<string, number | null>) => void
  setRestore: (r: { done: number; total: number } | null) => void
  setServerWaking: (v: boolean) => void
  setDaqState: (s: 'idle' | 'monitoring' | 'recording') => void
}

// Stable session ID per tab — persists across hot-reloads in dev
const SESSION_ID = (() => {
  const k = 'pysqa_session_id'
  let id = sessionStorage.getItem(k)
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(k, id) }
  return id
})()

export const useStore = create<AppState>((set, get) => ({
  sessionId: SESSION_ID,
  files: [],
  selectedId: null,
  compareId: null,
  viewMode: 'normal',
  metricKey: 'none',
  fieldType: 'free',
  precision: 'exact',
  octaveWeighting: 'Z',
  spectrogramParams: DEFAULT_SPECTROGRAM,
  envelopeParams: DEFAULT_ENVELOPE,
  calibrations: {},
  sections: {},
  batchEnabled: false,
  isLoading: false,
  loadingMessage: '',
  audioIsPlaying: false,
  audioDuration: 0,
  restore: null,
  serverWaking: false,
  daqState: 'idle',

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
    const sections = { ...s.sections }
    delete sections[id]
    return { files, selectedId, compareId, sections }
  }),
  selectFile: (id) => set({ selectedId: id }),
  setCompareId: (compareId) => set({ compareId }),

  setViewMode: (viewMode) => set({ viewMode }),
  setMetricKey: (metricKey) => set({ metricKey }),
  setFieldType: (fieldType) => set({ fieldType }),
  setPrecision: (precision) => set({ precision }),
  setOctaveWeighting: (octaveWeighting) => set({ octaveWeighting }),
  setSpectrogramParams: (p) => set((s) => ({ spectrogramParams: { ...s.spectrogramParams, ...p } })),
  setEnvelopeParams: (p) => set((s) => ({ envelopeParams: { ...s.envelopeParams, ...p } })),
  setCalibration: (audioId, mVPa) => set((s) => ({
    calibrations: { ...s.calibrations, [audioId]: mVPa },
  })),
  setSection: (audioId, section) => set((s) => {
    const prev = s.sections[audioId]
    if (!section && !prev) return s
    if (section && prev && prev[0] === section[0] && prev[1] === section[1]) return s
    const sections = { ...s.sections }
    if (section) sections[audioId] = section
    else delete sections[audioId]
    return { sections }
  }),
  setBatchEnabled: (batchEnabled) => set({ batchEnabled }),
  setLoading: (isLoading, loadingMessage = '') => set({ isLoading, loadingMessage }),
  setAudioPlayback: (audioIsPlaying, audioDuration) => set({ audioIsPlaying, audioDuration }),
  clearSession: () => {
    void forgetSession(get().sessionId)     // also drop this browser's copy, or it would be restored again
    clearViewCache()
    set({ files: [], selectedId: null, compareId: null, calibrations: {}, sections: {} })
  },
  // After a reload: the files the server (or this browser's copy) still has, with their calibrations
  hydrate: (incoming, calibrations) => set((s) => {
    const ids = new Set(incoming.map((f) => f.audio_id))
    const files = [...incoming, ...s.files.filter((f) => !ids.has(f.audio_id))]
    return {
      files,
      selectedId: s.selectedId ?? files[0]?.audio_id ?? null,
      calibrations: { ...calibrations, ...s.calibrations },
    }
  }),
  setRestore: (restore) => set({ restore }),
  setServerWaking: (serverWaking) => set({ serverWaking }),
  setDaqState: (daqState) => set({ daqState }),
}))
