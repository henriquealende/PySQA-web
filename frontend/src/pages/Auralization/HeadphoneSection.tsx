import { useEffect, useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { useAuralStore } from '../../store/useAuralStore'
import { toast } from '../../store/useToast'
import { useLang, useT } from '../../i18n'
import { isAbort } from '../../api/audioApi'
import { deleteAsset, fetchHeadphoneLibrary, fetchHeadphoneResponse, HeadphoneLibrary, HeadphoneMode, HeadphoneResponse, uploadHeadphone } from '../../api/auralizationApi'
import HeadphonePlot from './HeadphonePlot'

const MODES: HeadphoneMode[] = ['off', 'compensate', 'simulate']

/** Headphone block: compensate a measured headphone (so it sounds flat) or simulate it. Applied after the room, the head and the noise. */
export default function HeadphoneSection() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const sessionId = useStore((s) => s.sessionId)
  const files = useStore((s) => s.files)
  const { sourceId, headphone, assets, setHeadphone, setAssets } = useAuralStore()
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<HeadphoneResponse | null>(null)
  const [lib, setLib] = useState<HeadphoneLibrary | null>(null)
  const [filter, setFilter] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const fs = files.find((f) => f.audio_id === sourceId)?.sample_rate ?? 48000
  const list = assets.filter((a) => a.kind === 'headphone')
  const current = list.find((a) => a.asset_id === headphone.asset)
  const inLibrary = headphone.asset?.startsWith('lib:') ?? false
  const libItem = lib?.items.find((i) => i.id === headphone.asset)
  const shown = lib?.items.filter((i) => i.id === headphone.asset || i.label.toLowerCase().includes(filter.trim().toLowerCase())) ?? []

  useEffect(() => { void fetchHeadphoneLibrary().then(setLib).catch(() => undefined) }, [])

  useEffect(() => {
    if (headphone.mode === 'off' || !headphone.asset) { setData(null); return }
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      fetchHeadphoneResponse(sessionId, headphone.asset!, headphone.mode as 'compensate' | 'simulate', headphone.max_boost_db, fs, ctrl.signal)
        .then(setData).catch((e) => { if (!isAbort(e)) setData(null) })
    }, 250)
    return () => { window.clearTimeout(id); ctrl.abort() }
  }, [sessionId, headphone.mode, headphone.asset, headphone.max_boost_db, fs])

  const pick = (mode: HeadphoneMode) => {
    if (mode === 'off') { setHeadphone({ mode }); return }
    setHeadphone({ mode, asset: headphone.asset ?? list[0]?.asset_id ?? null })
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const a = await uploadHeadphone(sessionId, file)
      setAssets([...assets, a])
      setHeadphone({ asset: a.asset_id, mode: headphone.mode === 'off' ? 'compensate' : headphone.mode })
      toast.success(t('aur.hp.uploaded', { name: a.name }))
    } catch (e: any) { toast.error(e.message) } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    if (!headphone.asset || inLibrary) return
    await deleteAsset(sessionId, headphone.asset)
    setAssets(assets.filter((a) => a.asset_id !== headphone.asset))
    setHeadphone({ mode: 'off', asset: null })
  }

  return (
    <section className="rounded-lg border border-border bg-panel p-4 space-y-4" aria-labelledby="aur-hp">
      <h2 id="aur-hp" className="text-sm font-semibold">{t('aur.hp.title')}</h2>
      <div className="flex flex-wrap rounded overflow-hidden border border-border w-fit" role="radiogroup" aria-label={t('aur.hp.title')}>
        {MODES.map((m) => (
          <button
            key={m} role="radio" aria-checked={headphone.mode === m} onClick={() => pick(m)}
            className={clsx('px-3 py-1.5 text-xs', headphone.mode === m ? 'bg-teal text-dark font-semibold' : 'bg-dark text-muted hover:text-white')}
          >
            {t(`aur.hp.mode.${m}`)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t('aur.hp.help')}</p>

      {headphone.mode !== 'off' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted" htmlFor="aur-hp-file">{t('aur.env.file')}</label>
            <input
              type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('aur.hp.search')} aria-label={t('aur.hp.search')}
              className="w-44 bg-dark border border-field rounded px-2 py-1 text-xs focus:border-teal"
            />
            <select
              id="aur-hp-file" value={headphone.asset ?? ''} onChange={(e) => setHeadphone({ asset: e.target.value || null })}
              className="max-w-[320px] bg-dark border border-field rounded px-2 py-1 text-xs focus:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
            >
              <option value="">—</option>
              {list.length > 0 && <optgroup label={t('aur.hp.yours')}>{list.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}</optgroup>}
              {lib && <optgroup label={t('aur.hp.library', { n: shown.length })}>{shown.map((i) => <option key={i.id} value={i.id}>{i.label} · {i.rig}</option>)}</optgroup>}
            </select>
            <input ref={input} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
            <button
              onClick={() => input.current?.click()} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-field hover:border-teal hover:text-teal disabled:opacity-40"
            >
              <Upload size={13} aria-hidden="true" /> {busy ? t('aur.hrtf.reading') : t('aur.hp.upload')}
            </button>
            {headphone.asset && !inLibrary && (
              <button onClick={() => void remove()} aria-label={t('aur.hp.remove')} className="text-muted hover:text-red-400 p-1">
                <Trash2 size={14} />
              </button>
            )}
            {current && <span className="text-[11px] text-muted">{t('aur.hp.info', { n: current.n_points, lo: Math.round(current.f_min), hi: Math.round(current.f_max) })}</span>}
          </div>
          {libItem && lib && (
            <p className="text-[11px] text-muted">
              {t('aur.hp.libInfo', { rig: lib.rigs[libItem.rig]?.[lang] ?? libItem.rig })}{' '}
              <a href={lib.source.url} target="_blank" rel="noopener noreferrer" className="text-teal underline">{lib.source.name}</a> ({lib.source.license}).
            </p>
          )}
          {!headphone.asset && <p className="text-xs text-muted">{t('aur.hp.noAsset')}</p>}

          {headphone.asset && (
            <div className="space-y-3">
              {headphone.mode === 'compensate' && (
                <div className="flex items-center gap-3">
                  <label htmlFor="aur-hp-boost" className="text-xs text-muted w-36 shrink-0">{t('aur.hp.boost')}</label>
                  <input
                    id="aur-hp-boost" type="range" min={0} max={24} step={1} value={headphone.max_boost_db}
                    onChange={(e) => setHeadphone({ max_boost_db: Number(e.target.value) })} className="flex-1 accent-teal"
                  />
                  <span className="text-xs tabular-nums w-14 text-right">+{headphone.max_boost_db} dB</span>
                </div>
              )}
              <HeadphonePlot data={data} mode={headphone.mode as 'compensate' | 'simulate'} />
              <p className="text-[11px] text-muted">{t(headphone.mode === 'compensate' ? 'aur.hp.noteCompensate' : 'aur.hp.noteSimulate')}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
