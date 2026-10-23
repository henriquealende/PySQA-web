import { Asset, deleteAsset, SynthParams, synthesizeRoom } from '../../api/auralizationApi'
import { useAuralStore } from '../../store/useAuralStore'

/**
 * Make a synthetic room on the server and select it as the environment. The synthetic room made before is removed
 * first, so trying scene after scene does not fill the 4-file limit of room responses.
 */
export async function applySyntheticRoom(sessionId: string, fs: number, name: string, params: SynthParams): Promise<Asset> {
  const previous = useAuralStore.getState().synthAssetId
  if (previous) await deleteAsset(sessionId, previous)
  const asset = await synthesizeRoom(sessionId, name, fs, params)
  const s = useAuralStore.getState()
  s.setAssets([...s.assets.filter((a) => a.asset_id !== previous), asset])
  s.setSynthAsset(asset.asset_id)
  s.setEnv({ type: 'rir', asset: asset.asset_id })
  return asset
}
