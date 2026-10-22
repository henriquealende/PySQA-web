import { create } from 'zustand'
import { useStore } from './useStore'
import { toast } from './useToast'
import { t } from '../i18n'
import { newClientId } from '../api/http'
import {
  computeFrf, FrfChannel, FrfExpiredError, FrfParams, FrfResult, loadFrfFiles, removeFrfFile,
} from '../api/frfApi'

export const DEFAULT_PARAMS: FrfParams = {
  estimator: 'H1',
  averaging: 'welch',
  nperseg: 4096,
  overlap: 50,
  window: 'hann',
  detrend: 'constant',
  response_type: 'acceleration',
  show_as: 'acceleration',
  fmin: 0,
  fmax: null,
  unwrap: false,
  impact: { trigger_pct: 20, pretrigger_pct: 5, force_ms: 8, exp_end_pct: 1 },
  modes: { enabled: true, prominence_db: 6, min_sep_hz: null, max_modes: 12, method: 'both' },
}

interface LoadedFile { id: string; name: string; file: File }

interface FrfState {
  files: LoadedFile[]
  channels: FrfChannel[]
  excitation: string | null
  responses: string[]
  params: FrfParams
  csvFs: string
  result: FrfResult | null
  busy: boolean
  loading: boolean
  error: string

  addFiles: (list: File[]) => Promise<void>
  removeFile: (id: string) => void
  setExcitation: (id: string | null) => void
  toggleResponse: (id: string) => void
  setParams: (p: Partial<FrfParams>) => void
  setImpact: (p: Partial<FrfParams['impact']>) => void
  setModes: (p: Partial<FrfParams['modes']>) => void
  setCsvFs: (v: string) => void
  compute: () => Promise<void>
}

let ctrl: AbortController | null = null

export const useFrfStore = create<FrfState>((set, get) => ({
  files: [], channels: [], excitation: null, responses: [], params: DEFAULT_PARAMS,
  csvFs: '', result: null, busy: false, loading: false, error: '',

  addFiles: async (list) => {
    const sessionId = useStore.getState().sessionId
    const items = list.map((file) => ({ id: newClientId(), name: file.name, file }))
    set({ loading: true, error: '' })
    try {
      const fs = parseFloat(get().csvFs)
      const { channels, errors } = await loadFrfFiles(sessionId, items, fs > 0 ? fs : undefined)
      errors.forEach((e) => toast.error(`${e.file}: ${e.error}`))
      const okFiles = items.filter((it) => channels.some((c) => c.id.startsWith(it.id + '_')))
      set((s) => {
        const allCh = [...s.channels, ...channels]
        const time = allCh.filter((c) => c.kind === 'time')
        let { excitation, responses } = s
        // The common case of one force and one response record needs no clicking
        if (!excitation && responses.length === 0 && time.length === 2) {
          excitation = time[0].id
          responses = [time[1].id]
        }
        const frfs = channels.filter((c) => c.kind === 'frf').map((c) => c.id)
        return {
          files: [...s.files, ...okFiles], channels: allCh, excitation,
          responses: [...new Set([...responses, ...frfs])],
        }
      })
      if (channels.length) toast.success(t(channels.length > 1 ? 'sa.store.channelsMany' : 'sa.store.channelsOne', { n: channels.length }))
    } catch (e: any) {
      toast.error(e.message ?? t('sa.store.loadFail'))
    } finally {
      set({ loading: false })
    }
  },

  removeFile: (id) => {
    void removeFrfFile(useStore.getState().sessionId, id)
    set((s) => {
      const gone = (cid: string) => cid.startsWith(id + '_')
      return {
        files: s.files.filter((f) => f.id !== id),
        channels: s.channels.filter((c) => !gone(c.id)),
        excitation: s.excitation && gone(s.excitation) ? null : s.excitation,
        responses: s.responses.filter((r) => !gone(r)),
        result: null,
      }
    })
  },

  setExcitation: (id) => set((s) => ({ excitation: id, responses: id ? s.responses.filter((r) => r !== id) : s.responses })),
  toggleResponse: (id) => set((s) => ({
    responses: s.responses.includes(id) ? s.responses.filter((r) => r !== id) : [...s.responses, id],
    excitation: s.excitation === id ? null : s.excitation,
  })),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  setImpact: (p) => set((s) => ({ params: { ...s.params, impact: { ...s.params.impact, ...p } } })),
  setModes: (p) => set((s) => ({ params: { ...s.params, modes: { ...s.params.modes, ...p } } })),
  setCsvFs: (v) => set({ csvFs: v }),

  compute: async () => {
    const { excitation, responses, params, files } = get()
    ctrl?.abort()
    const mine = new AbortController()
    ctrl = mine
    const sessionId = useStore.getState().sessionId
    set({ busy: true, error: '' })
    const run = () => computeFrf(sessionId, excitation, responses, params, mine.signal)
    try {
      let result: FrfResult
      try {
        result = await run()
      } catch (e) {
        if (!(e instanceof FrfExpiredError)) throw e
        // The server lost the records: put them back from the files kept in this browser, then ask again
        const fs = parseFloat(get().csvFs)
        await loadFrfFiles(sessionId, files.map((f) => ({ id: f.id, file: f.file })), fs > 0 ? fs : undefined)
        result = await run()
      }
      if (mine.signal.aborted) return
      set({ result, busy: false })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      set({ busy: false, error: e.message ?? t('sa.store.calcFail'), result: null })
    } finally {
      if (ctrl === mine) ctrl = null
    }
  },
}))
