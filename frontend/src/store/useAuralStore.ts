import { create } from 'zustand'
import { Asset, EnvParams, HeadphoneParams, HrtfParams, LevelParams, NO_ENV, NO_HEADPHONE, NO_LEVEL, NO_NOISE, NoiseParams, RenderResult, SPHERE_ID, SynthParams } from '../api/auralizationApi'

export type StepId = 'environment' | 'hrtf' | 'noise' | 'headphone' | 'level'

interface AuralState {
  step: StepId                   // the chain card whose settings are shown
  sourceId: string | null
  hrtf: HrtfParams
  env: EnvParams
  noise: NoiseParams
  headphone: HeadphoneParams
  level: LevelParams
  synth: SynthParams
  synthAssetId: string | null    // the synthetic room made last: replaced by the next one, so the 4-file limit is not hit
  scene: string | null
  adDismissed: boolean           // the Auralize Salas card, closed by the user (kept in this browser)
  assets: Asset[]
  lastRender: RenderResult | null

  setStep: (s: StepId) => void
  setSource: (id: string | null) => void
  setHrtf: (p: Partial<HrtfParams>) => void
  setEnv: (p: Partial<EnvParams>) => void
  setNoise: (p: Partial<NoiseParams>) => void
  setHeadphone: (p: Partial<HeadphoneParams>) => void
  setLevel: (p: Partial<LevelParams>) => void
  setSynth: (p: Partial<SynthParams>) => void
  setSynthAsset: (id: string | null) => void
  setScene: (id: string | null) => void
  setAdDismissed: (v: boolean) => void
  setAssets: (a: Asset[]) => void
  setLastRender: (r: RenderResult | null) => void
}

const AD_KEY = 'pysqa-ad-salas-dismissed'
const readDismissed = () => { try { return localStorage.getItem(AD_KEY) === '1' } catch { return false } }
const writeDismissed = (v: boolean) => { try { if (v) localStorage.setItem(AD_KEY, '1'); else localStorage.removeItem(AD_KEY) } catch { /* not remembered */ } }

/** State of the Audio Preparation page; kept here so it survives a visit to another page. */
export const useAuralStore = create<AuralState>((set) => ({
  step: 'environment',
  sourceId: null,
  hrtf: { asset: SPHERE_ID, azimuth: 30, elevation: 0, distance_m: 1 },
  env: NO_ENV,
  noise: NO_NOISE,
  headphone: NO_HEADPHONE,
  level: NO_LEVEL,
  synth: { volume_m3: 30, distance_m: 2, rt60: { '125': 0.6, '250': 0.55, '500': 0.5, '1000': 0.5, '2000': 0.45, '4000': 0.4 } },
  synthAssetId: null,
  scene: null,
  adDismissed: readDismissed(),
  assets: [],
  lastRender: null,

  setStep: (step) => set({ step }),
  setSource: (sourceId) => set({ sourceId, lastRender: null }),
  setHrtf: (p) => set((s) => ({ hrtf: { ...s.hrtf, ...p } })),
  setEnv: (p) => set((s) => ({ env: { ...s.env, ...p } })),
  setNoise: (p) => set((s) => ({ noise: { ...s.noise, ...p } })),
  setHeadphone: (p) => set((s) => ({ headphone: { ...s.headphone, ...p } })),
  setLevel: (p) => set((s) => ({ level: { ...s.level, ...p } })),
  setSynth: (p) => set((s) => ({ synth: { ...s.synth, ...p } })),
  setSynthAsset: (synthAssetId) => set({ synthAssetId }),
  setScene: (scene) => set({ scene }),
  setAdDismissed: (adDismissed) => { writeDismissed(adDismissed); set({ adDismissed }) },
  setAssets: (assets) => set({ assets }),
  setLastRender: (lastRender) => set({ lastRender }),
}))
