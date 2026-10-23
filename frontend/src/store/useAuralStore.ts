import { create } from 'zustand'
import { Asset, EnvParams, HrtfParams, NO_ENV, RenderResult, SPHERE_ID } from '../api/auralizationApi'

interface AuralState {
  sourceId: string | null
  hrtf: HrtfParams
  env: EnvParams
  assets: Asset[]
  lastRender: RenderResult | null

  setSource: (id: string | null) => void
  setHrtf: (p: Partial<HrtfParams>) => void
  setEnv: (p: Partial<EnvParams>) => void
  setAssets: (a: Asset[]) => void
  setLastRender: (r: RenderResult | null) => void
}

/** State of the Audio Preparation page; kept here so it survives a visit to another page. */
export const useAuralStore = create<AuralState>((set) => ({
  sourceId: null,
  hrtf: { asset: SPHERE_ID, azimuth: 30, elevation: 0, distance_m: 1 },
  env: NO_ENV,
  assets: [],
  lastRender: null,

  setSource: (sourceId) => set({ sourceId, lastRender: null }),
  setHrtf: (p) => set((s) => ({ hrtf: { ...s.hrtf, ...p } })),
  setEnv: (p) => set((s) => ({ env: { ...s.env, ...p } })),
  setAssets: (assets) => set({ assets }),
  setLastRender: (lastRender) => set({ lastRender }),
}))
