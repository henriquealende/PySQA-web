import { create } from 'zustand'
import { HrtfAsset, HrtfParams, RenderResult, SPHERE_ID } from '../api/auralizationApi'

interface AuralState {
  sourceId: string | null
  hrtf: HrtfParams
  assets: HrtfAsset[]
  lastRender: RenderResult | null

  setSource: (id: string | null) => void
  setHrtf: (p: Partial<HrtfParams>) => void
  setAssets: (a: HrtfAsset[]) => void
  setLastRender: (r: RenderResult | null) => void
}

/** State of the Auralization page; kept here so it survives a visit to another page. */
export const useAuralStore = create<AuralState>((set) => ({
  sourceId: null,
  hrtf: { asset: SPHERE_ID, azimuth: 30, elevation: 0, distance_m: 1 },
  assets: [],
  lastRender: null,

  setSource: (sourceId) => set({ sourceId, lastRender: null }),
  setHrtf: (p) => set((s) => ({ hrtf: { ...s.hrtf, ...p } })),
  setAssets: (assets) => set({ assets }),
  setLastRender: (lastRender) => set({ lastRender }),
}))
