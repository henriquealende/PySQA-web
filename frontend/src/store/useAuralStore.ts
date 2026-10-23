import { create } from 'zustand'
import { Asset, EnvParams, HrtfParams, NO_ENV, NO_NOISE, NoiseParams, RenderResult, SPHERE_ID, SynthParams } from '../api/auralizationApi'

interface AuralState {
  sourceId: string | null
  hrtf: HrtfParams
  env: EnvParams
  noise: NoiseParams
  synth: SynthParams
  synthAssetId: string | null    // the synthetic room made last: replaced by the next one, so the 4-file limit is not hit
  scene: string | null
  assets: Asset[]
  lastRender: RenderResult | null

  setSource: (id: string | null) => void
  setHrtf: (p: Partial<HrtfParams>) => void
  setEnv: (p: Partial<EnvParams>) => void
  setNoise: (p: Partial<NoiseParams>) => void
  setSynth: (p: Partial<SynthParams>) => void
  setSynthAsset: (id: string | null) => void
  setScene: (id: string | null) => void
  setAssets: (a: Asset[]) => void
  setLastRender: (r: RenderResult | null) => void
}

/** State of the Audio Preparation page; kept here so it survives a visit to another page. */
export const useAuralStore = create<AuralState>((set) => ({
  sourceId: null,
  hrtf: { asset: SPHERE_ID, azimuth: 30, elevation: 0, distance_m: 1 },
  env: NO_ENV,
  noise: NO_NOISE,
  synth: { volume_m3: 30, distance_m: 2, rt60: { '125': 0.6, '250': 0.55, '500': 0.5, '1000': 0.5, '2000': 0.45, '4000': 0.4 } },
  synthAssetId: null,
  scene: null,
  assets: [],
  lastRender: null,

  setSource: (sourceId) => set({ sourceId, lastRender: null }),
  setHrtf: (p) => set((s) => ({ hrtf: { ...s.hrtf, ...p } })),
  setEnv: (p) => set((s) => ({ env: { ...s.env, ...p } })),
  setNoise: (p) => set((s) => ({ noise: { ...s.noise, ...p } })),
  setSynth: (p) => set((s) => ({ synth: { ...s.synth, ...p } })),
  setSynthAsset: (synthAssetId) => set({ synthAssetId }),
  setScene: (scene) => set({ scene }),
  setAssets: (assets) => set({ assets }),
  setLastRender: (lastRender) => set({ lastRender }),
}))
