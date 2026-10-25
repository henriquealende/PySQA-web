import { useEffect, useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { useAuralStore } from '../../store/useAuralStore'
import { toast } from '../../store/useToast'
import { useLocale, useT } from '../../i18n'
import { deleteAsset, EnvType, fetchRirInfo, RirInfo, uploadRir } from '../../api/auralizationApi'
import DecayPlot from './DecayPlot'
import SyntheticRoomForm from './SyntheticRoomForm'
import AuralizeSalasCard from './AuralizeSalasCard'

const TYPES: EnvType[] = ['none', 'rir', 'brir']

/** Room block: a room impulse response (1 channel) or a binaural one (2 channels), its parameters and its decay. */
export default function EnvironmentSection() {
  const t = useT()
  const locale = useLocale()
  const sessionId = useStore((s) => s.sessionId)
  const { env, assets, synthAssetId, setEnv, setAssets, setSynthAsset } = useAuralStore()
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<RirInfo | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const rooms = assets.filter((a) => a.kind === 'rir')
  const usable = rooms.filter((a) => (env.type === 'brir' ? a.channels === 2 : true))
  const num = (v: number | null | undefined, d: number, unit = '') =>
    v == null ? '—' : `${v.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })}${unit}`

  useEffect(() => {
    if (env.type === 'none' || !env.asset) { setInfo(null); return }
    const ctrl = new AbortController()
    fetchRirInfo(sessionId, env.asset, ctrl.signal).then(setInfo).catch(() => { if (!ctrl.signal.aborted) setInfo(null) })
    return () => ctrl.abort()
  }, [sessionId, env.type, env.asset])

  const pickType = (type: EnvType) => {
    if (type === 'none') { setEnv({ type }); return }
    const ok = rooms.filter((a) => (type === 'brir' ? a.channels === 2 : true))
    const keep = ok.some((a) => a.asset_id === env.asset) ? env.asset : ok[0]?.asset_id ?? null
    setEnv({ type, asset: keep })
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const a = await uploadRir(sessionId, file)
      setAssets([...assets, a])
      setEnv({ type: a.suggested_type ?? 'rir', asset: a.asset_id })
      toast.success(t('aur.env.uploaded', { name: a.name }))
    } catch (e: any) { toast.error(e.message) } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    if (!env.asset) return
    await deleteAsset(sessionId, env.asset)
    if (env.asset === synthAssetId) setSynthAsset(null)
    setAssets(assets.filter((a) => a.asset_id !== env.asset))
    setEnv({ type: 'none', asset: null })
  }

  const m = info?.metrics
  const cells: [string, string][] = [
    ['T20', num(m?.rt60_t20, 2, ' s')], ['T30', num(m?.rt60_t30, 2, ' s')], ['EDT', num(m?.edt, 2, ' s')],
    ['C50', num(m?.c50, 1, ' dB')], ['C80', num(m?.c80, 1, ' dB')], ['D50', num(m?.d50, 0, ' %')],
  ]

  return (
    <section className="rounded-lg border border-border bg-panel p-4 space-y-4" aria-labelledby="aur-env">
      <h2 id="aur-env" className="text-sm font-semibold">{t('aur.env.title')}</h2>
      <div className="seg" role="radiogroup" aria-label={t('aur.env.title')}>
        {TYPES.map((ty) => (
          <button
            key={ty} role="radio" aria-checked={env.type === ty} onClick={() => pickType(ty)}
          >
            {t(`aur.env.type.${ty}`)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t('aur.env.help')}</p>

      {env.type !== 'none' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted" htmlFor="aur-room">{t('aur.env.file')}</label>
            <select
              id="aur-room" value={env.asset ?? ''} onChange={(e) => setEnv({ asset: e.target.value || null })}
              className="bg-dark border border-field rounded px-2 py-1 text-xs focus:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
            >
              <option value="">—</option>
              {usable.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}
            </select>
            <input ref={input} type="file" accept=".wav" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
            <button
              onClick={() => input.current?.click()} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-field hover:border-teal hover:text-teal disabled:opacity-40"
            >
              <Upload size={13} aria-hidden="true" /> {busy ? t('aur.hrtf.reading') : t('aur.env.upload')}
            </button>
            {env.asset && (
              <button onClick={() => void remove()} aria-label={t('aur.env.remove')} className="text-muted hover:text-red-400 p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {env.type === 'brir' && <p className="text-[11px] text-amber">{t('aur.env.brirNote')}</p>}
          {!env.asset && <p className="text-xs text-muted">{t('aur.env.noAsset')}</p>}

          {env.asset && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] items-start">
              <div className="space-y-3">
                <dl className="grid grid-cols-3 gap-2">
                  {cells.map(([k, v]) => (
                    <div key={k} className="rounded bg-dark px-2 py-1.5 text-center">
                      <dt className="text-[10px] text-muted" title={t(`aur.env.hint.${k}`)}>{k}</dt>
                      <dd className="text-xs font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                {info && (
                  <div>
                    <p className="text-[10px] text-muted mb-1">{t('aur.env.bands')}</p>
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(info.bands).map(([f, v]) => (
                        <span key={f} className="rounded bg-dark px-1.5 py-0.5 text-[11px] tabular-nums">
                          <span className="text-muted">{f} Hz</span> {num(v, 2)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label htmlFor="aur-gain" className="text-xs text-muted w-24 shrink-0">{t('aur.env.gain')}</label>
                  <input
                    id="aur-gain" type="range" min={-30} max={10} step={1} value={env.reverb_gain_db}
                    onChange={(e) => setEnv({ reverb_gain_db: Number(e.target.value) })} className="flex-1 accent-teal"
                  />
                  <span className="text-xs tabular-nums w-14 text-right">{env.reverb_gain_db > 0 ? '+' : ''}{env.reverb_gain_db} dB</span>
                </div>
                <p className="text-[11px] text-muted">{t('aur.env.gainNote')}</p>
              </div>
              <DecayPlot info={info} />
            </div>
          )}
        </>
      )}
      <SyntheticRoomForm />
      <AuralizeSalasCard />
    </section>
  )
}
