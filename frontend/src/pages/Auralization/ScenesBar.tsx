import { useEffect, useState } from 'react'
import { ChefHat, Car, Plane, Sofa, SlidersHorizontal, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { useAuralStore } from '../../store/useAuralStore'
import { toast } from '../../store/useToast'
import { useLang, useT } from '../../i18n'
import { Catalog, deleteAsset, fetchCatalog, NO_ENV, NO_NOISE, Scene } from '../../api/auralizationApi'
import { applySyntheticRoom } from './synthRoom'

const ICONS: Record<string, LucideIcon> = { kitchen: ChefHat, living: Sofa, car: Car, aircraft: Plane }

/** One click puts a synthetic room, a head position and a background noise in place; each block stays adjustable. */
export default function ScenesBar() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const sessionId = useStore((s) => s.sessionId)
  const files = useStore((s) => s.files)
  const { sourceId, scene, setSynth, setHrtf, setNoise, setScene, setEnv, setAdDismissed } = useAuralStore()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const fs = files.find((f) => f.audio_id === sourceId)?.sample_rate ?? 48000

  useEffect(() => { void fetchCatalog().then(setCatalog).catch(() => undefined) }, [])
  if (!catalog?.scenes?.length) return null

  const apply = async (sc: Scene) => {
    setBusy(sc.id)
    try {
      setSynth(sc.room)
      setHrtf(sc.hrtf)
      setNoise(sc.noise ?? NO_NOISE)
      await applySyntheticRoom(sessionId, fs, `${sc.name[lang]} (${t('aur.scene.synthetic')})`, sc.room)
      setScene(sc.id)
      toast.success(t('aur.scene.applied', { name: sc.name[lang] }))
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  const clear = async () => {
    const { synthAssetId, assets, setAssets, setSynthAsset } = useAuralStore.getState()
    if (synthAssetId) {
      await deleteAsset(sessionId, synthAssetId)
      setAssets(assets.filter((a) => a.asset_id !== synthAssetId))
      setSynthAsset(null)
    }
    setEnv(NO_ENV)
    setNoise(NO_NOISE)
    setScene(null)
  }

  const goToCard = () => {
    setAdDismissed(false)
    window.setTimeout(() => {
      const el = document.getElementById('auralize-salas')
      el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
    }, 50)
  }

  const active = catalog.scenes.find((s) => s.id === scene)
  return (
    <section className="rounded-lg border border-border bg-panel p-4 space-y-3" aria-labelledby="aur-scenes">
      <h2 id="aur-scenes" className="text-sm font-semibold">{t('aur.scene.title')}</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('aur.scene.title')}>
        {catalog.scenes.map((sc) => {
          const Icon = ICONS[sc.icon] ?? SlidersHorizontal
          return (
            <button
              key={sc.id} onClick={() => void apply(sc)} disabled={busy !== null} aria-pressed={scene === sc.id}
              className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors disabled:opacity-50',
                scene === sc.id ? 'bg-teal text-dark border-teal font-semibold' : 'bg-dark border-field text-white hover:border-teal hover:text-teal')}
            >
              <Icon size={14} aria-hidden="true" /> {busy === sc.id ? t('aur.scene.applying') : sc.name[lang]}
            </button>
          )
        })}
        <button
          onClick={() => void clear()} disabled={busy !== null}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs text-muted hover:text-white hover:border-field disabled:opacity-50"
        >
          <SlidersHorizontal size={14} aria-hidden="true" /> {t('aur.scene.none')}
        </button>
        <button
          onClick={goToCard}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-[#00BFC8]/60 text-xs text-[#00BFC8] hover:bg-[#00BFC8]/10"
        >
          <Building2 size={14} aria-hidden="true" /> {t('aur.scene.mine')}
        </button>
      </div>
      <p className="text-[11px] text-muted">{active ? active.description[lang] : t('aur.scene.hint')}</p>
      <p className="text-[11px] text-amber">{catalog.scenes_note[lang]}</p>
    </section>
  )
}
