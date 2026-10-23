import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Download, ExternalLink, Headphones, Trash2, Upload, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import FileDropzone from '../../components/FileDropzone'
import { useStore } from '../../store/useStore'
import { useAuralStore } from '../../store/useAuralStore'
import { toast } from '../../store/useToast'
import { useLang, useLocale, useT } from '../../i18n'
import { getStreamUrl, uploadFiles, isAbort } from '../../api/audioApi'
import {
  Catalog, deleteAsset, fetchCatalog, fetchHrtfResponse, fetchPreview, HrtfResponse, listAssets, renderToSession,
  NO_ENV, SPHERE_ID, uploadHrtf,
} from '../../api/auralizationApi'
import HrtfMap from './HrtfMap'
import ResponsePlot from './ResponsePlot'
import AbPlayer from './AbPlayer'
import EnvironmentSection from './EnvironmentSection'
import NoiseSection from './NoiseSection'
import ScenesBar from './ScenesBar'

const LOCKED = ['aur.chain.environment', 'aur.chain.headphone'] as const

function Block({ n, title, children, active }: { n: number; title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <div className={clsx('flex-1 min-w-[130px] rounded-lg border px-3 py-2', active ? 'border-teal bg-teal/10' : 'border-border bg-panel')}>
      <p className="text-[10px] uppercase tracking-wider text-muted">{n} · {title}</p>
      <div className="text-xs mt-1">{children}</div>
    </div>
  )
}

export default function AuralizationPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const locale = useLocale()
  const fmt = (n: number, d = 1) => n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
  const navigate = useNavigate()
  const { sessionId, files, addFiles, selectFile } = useStore()
  const { sourceId, hrtf, env, noise, assets, lastRender, setSource, setHrtf, setEnv, setAssets, setLastRender } = useAuralStore()
  // a room type without a file chosen yet means no room
  const envEff = useMemo(() => (env.type !== 'none' && !env.asset ? NO_ENV : env), [env])

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [sofaBusy, setSofaBusy] = useState(false)
  const [response, setResponse] = useState<HrtfResponse | null>(null)
  const [preview, setPreview] = useState<{ url: string; peakDbfs: number } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [rendering, setRendering] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const sofaInput = useRef<HTMLInputElement>(null)

  const source = files.find((f) => f.audio_id === sourceId) ?? null
  const fs = source?.sample_rate ?? 48000

  // The first file of the session is the source until the user picks another
  useEffect(() => {
    if (!source && files.length) setSource(files[0].audio_id)
  }, [files, source, setSource])

  // What the server still holds (it forgets on a restart): drop a set that is gone
  useEffect(() => {
    void listAssets(sessionId).then((list) => {
      setAssets(list)
      if (hrtf.asset !== SPHERE_ID && !list.some((a) => a.asset_id === hrtf.asset)) setHrtf({ asset: SPHERE_ID })
      if (env.asset && !list.some((a) => a.asset_id === env.asset)) setEnv({ type: 'none', asset: null })
    })
    void fetchCatalog().then(setCatalog).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Response of the ears: cheap, so it follows every change
  useEffect(() => {
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      fetchHrtfResponse(sessionId, hrtf, fs, ctrl.signal).then(setResponse).catch((e) => {
        if (!isAbort(e)) setResponse(null)
      })
    }, 200)
    return () => { window.clearTimeout(id); ctrl.abort() }
  }, [sessionId, hrtf, fs])

  // Preview of the first seconds, rebuilt shortly after each change
  useEffect(() => {
    if (!sourceId) { setPreview(null); return }
    const ctrl = new AbortController()
    let made: string | null = null
    setPreviewBusy(true)
    setPreviewError('')
    const id = window.setTimeout(() => {
      fetchPreview(sessionId, sourceId, hrtf, envEff, noise, 0, ctrl.signal)
        .then((p) => { made = p.url; setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return p }) })
        .catch((e) => { if (!isAbort(e)) setPreviewError(e.message) })
        .finally(() => { if (!ctrl.signal.aborted) setPreviewBusy(false) })
    }, 600)
    return () => { window.clearTimeout(id); ctrl.abort(); if (made && !ctrl.signal.aborted) URL.revokeObjectURL(made) }
  }, [sessionId, sourceId, hrtf, envEff, noise])
  useEffect(() => () => { setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return null }) }, [])

  const handleFiles = async (list: File[]) => {
    setUploading(true); setUploadError('')
    try {
      const uploaded = await uploadFiles(sessionId, list)
      addFiles(uploaded)
      if (uploaded[0]) setSource(uploaded[0].audio_id)
    } catch (e: any) { setUploadError(e.message) } finally { setUploading(false) }
  }

  const handleSofa = async (file: File | undefined) => {
    if (!file) return
    setSofaBusy(true)
    try {
      const asset = await uploadHrtf(sessionId, file)
      setAssets([...assets, asset])
      setHrtf({ asset: asset.asset_id })
      toast.success(t('aur.hrtf.uploaded', { name: asset.name }))
    } catch (e: any) { toast.error(e.message) } finally {
      setSofaBusy(false)
      if (sofaInput.current) sofaInput.current.value = ''
    }
  }

  const removeAsset = async () => {
    if (hrtf.asset === SPHERE_ID) return
    await deleteAsset(sessionId, hrtf.asset)
    setAssets(assets.filter((a) => a.asset_id !== hrtf.asset))
    setHrtf({ asset: SPHERE_ID })
  }

  const render = async () => {
    if (!sourceId) return
    setRendering(true)
    try {
      const r = await renderToSession(sessionId, sourceId, hrtf, envEff, noise)
      addFiles([r])
      setLastRender(r)
      toast.success(t('aur.render.done', { name: r.name }))
    } catch (e: any) { toast.error(e.message) } finally { setRendering(false) }
  }

  const asset = assets.find((a) => a.asset_id === hrtf.asset)
  const setName = hrtf.asset === SPHERE_ID ? t('aur.hrtf.sphere') : asset?.name ?? '—'
  const modelDesc = useMemo(() => catalog?.builtin.find((b) => b.id === SPHERE_ID)?.description[lang] ?? '', [catalog, lang])
  const freeSets = catalog?.datasets.filter((d) => d.kind === 'hrtf' || d.kind === 'room') ?? []
  const clipped = (preview?.peakDbfs ?? -200) > 0

  return (
    <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
      <aside className="flex flex-col gap-3 p-3 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto shrink-0 sm:w-64 lg:w-80">
        <div className="flex items-center gap-2 px-1 pb-1">
          <Headphones size={18} className="text-teal" aria-hidden="true" />
          <h1 className="text-base font-semibold">{t('aur.page.title')}</h1>
        </div>
        <p className="text-[11px] text-muted px-1">{t('aur.page.intro')}</p>
        <FileDropzone onFiles={handleFiles} disabled={uploading} highlight={files.length === 0 && !uploading} />
        {uploading && <p className="text-[11px] text-teal text-center animate-pulse">{t('pp.page.uploading')}</p>}
        {uploadError && <p className="text-[11px] text-red-400 text-center">{uploadError}</p>}
        {files.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted uppercase tracking-wider">{t('aur.source.pick')}</p>
            <ul className="flex flex-col gap-1" role="radiogroup" aria-label={t('aur.source.pick')}>
              {files.map((f) => (
                <li key={f.audio_id}>
                  <button
                    role="radio" aria-checked={f.audio_id === sourceId} onClick={() => setSource(f.audio_id)}
                    className={clsx('w-full text-left rounded px-3 py-2 border text-xs transition-colors',
                      f.audio_id === sourceId ? 'bg-teal/15 border-teal/40' : 'bg-panel border-border hover:border-teal/30')}
                  >
                    <span className="block font-semibold truncate" title={f.name}>{f.name.replace(/\.wav$/i, '')}</span>
                    <span className="text-[11px] text-muted">
                      {fmt(f.duration_s)} s · {f.sample_rate / 1000} kHz · {f.channels === 1 ? 'Mono' : t('pp.list.stereo')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {(source?.channels ?? 1) > 1 && <p className="text-[11px] text-amber">{t('aur.source.downmix')}</p>}
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <ScenesBar />

        {/* ── The chain ───────────────────────────────────────────────── */}
        <div className="flex items-stretch gap-2 flex-wrap" aria-label={t('aur.chain.title')}>
          <Block n={1} title={t('aur.chain.source')}>
            <span className="font-semibold block truncate">{source ? source.name.replace(/\.wav$/i, '') : t('aur.chain.noSource')}</span>
          </Block>
          <ChevronRight size={16} className="self-center text-muted hidden sm:block" aria-hidden="true" />
          <Block n={2} title={t('aur.chain.environment')} active={envEff.type !== 'none'}>
            <span className="font-semibold block truncate">
              {envEff.type === 'none' ? t('aur.env.type.none') : assets.find((a) => a.asset_id === envEff.asset)?.name ?? '—'}
            </span>
            {envEff.type !== 'none' && <span className="text-muted">{t(`aur.env.type.${envEff.type}`)}</span>}
          </Block>
          <ChevronRight size={16} className="self-center text-muted hidden sm:block" aria-hidden="true" />
          <Block n={3} title="HRTF" active>
            <span className="font-semibold block truncate">{setName}</span>
            <span className="text-muted">{t('aur.chain.pos', { az: hrtf.azimuth, el: hrtf.elevation })}</span>
            {envEff.type === 'brir' && <span className="text-amber block">{t('aur.chain.ignored')}</span>}
          </Block>
          <ChevronRight size={16} className="self-center text-muted hidden sm:block" aria-hidden="true" />
          <Block n={4} title={t('aur.chain.noise')} active={noise.type !== 'none'}>
            <span className="font-semibold block truncate">{t(`aur.noise.type.${noise.type}`)}</span>
            {noise.type !== 'none' && <span className="text-muted">{noise.snr_db} dB</span>}
          </Block>
          <ChevronRight size={16} className="self-center text-muted hidden sm:block" aria-hidden="true" />
          <div className="flex-1 min-w-[130px] rounded-lg border border-dashed border-border px-3 py-2 opacity-60">
            <p className="text-[10px] uppercase tracking-wider text-muted">5 · {t(LOCKED[1])}</p>
            <p className="text-xs mt-1">{t('aur.chain.soon')}</p>
          </div>
        </div>

        {!source && (
          <p className="text-sm text-muted rounded-lg border border-border bg-panel px-4 py-6 text-center">{t('aur.page.empty')}</p>
        )}

        <EnvironmentSection />

        {/* ── HRTF block ──────────────────────────────────────────────── */}
        <section className={clsx('rounded-lg border border-border bg-panel p-4 space-y-4', envEff.type === 'brir' && 'opacity-50')} aria-labelledby="aur-hrtf">
          <h2 id="aur-hrtf" className="text-sm font-semibold">{t('aur.hrtf.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted" htmlFor="aur-set">{t('aur.hrtf.set')}</label>
            <select
              id="aur-set" value={hrtf.asset} onChange={(e) => setHrtf({ asset: e.target.value })}
              className="bg-dark border border-field rounded px-2 py-1 text-xs focus:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
            >
              <option value={SPHERE_ID}>{t('aur.hrtf.sphere')}</option>
              {assets.filter((a) => a.kind === 'hrtf').map((a) => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}
            </select>
            <input ref={sofaInput} type="file" accept=".sofa" className="hidden" onChange={(e) => void handleSofa(e.target.files?.[0])} />
            <button
              onClick={() => sofaInput.current?.click()} disabled={sofaBusy}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-field hover:border-teal hover:text-teal disabled:opacity-40"
            >
              <Upload size={13} aria-hidden="true" /> {sofaBusy ? t('aur.hrtf.reading') : t('aur.hrtf.upload')}
            </button>
            {hrtf.asset !== SPHERE_ID && (
              <button onClick={() => void removeAsset()} aria-label={t('aur.hrtf.remove')} className="text-muted hover:text-red-400 p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted">
            {hrtf.asset === SPHERE_ID
              ? modelDesc
              : asset ? t('aur.hrtf.info', { dirs: asset.n_directions, taps: asset.n_taps, khz: (asset.sample_rate / 1000).toFixed(1) }) : ''}
          </p>

          <div className="grid gap-4 md:grid-cols-[220px_1fr] items-start">
            <div className="flex flex-col items-center gap-3">
              <HrtfMap azimuth={hrtf.azimuth} onChange={(az) => setHrtf({ azimuth: az })} />
              <p className="text-[11px] text-muted text-center">{t('aur.map.hint')}</p>
            </div>
            <div className="space-y-3">
              <Slider id="az" label={t('aur.param.az')} unit="°" min={-180} max={180} step={1} value={hrtf.azimuth} onChange={(v) => setHrtf({ azimuth: v })} />
              <Slider id="el" label={t('aur.param.el')} unit="°" min={-90} max={90} step={1} value={hrtf.elevation} onChange={(v) => setHrtf({ elevation: v })} />
              <Slider id="dist" label={t('aur.param.dist')} unit=" m" min={0.2} max={10} step={0.1} value={hrtf.distance_m} onChange={(v) => setHrtf({ distance_m: v })} />
              <p className="text-[11px] text-muted">
                {t('aur.param.distNote', { db: fmt(response?.distance_gain_db ?? 0) })}
              </p>
              <ResponsePlot data={response} />
              {response && (
                <p className="text-[11px] text-muted">
                  {t('aur.resp.itd', { itd: fmt(response.itd_ms, 2) })} · {t('aur.resp.dir', { az: Math.round(response.azimuth), el: Math.round(response.elevation) })}
                </p>
              )}
            </div>
          </div>
        </section>

        <NoiseSection />

        {/* ── A/B preview ─────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-panel p-4 space-y-2" aria-labelledby="aur-ab">
          <h2 id="aur-ab" className="text-sm font-semibold">{t('aur.ab.title')}</h2>
          <AbPlayer
            originalUrl={sourceId ? getStreamUrl(sessionId, sourceId) : null}
            processedUrl={preview?.url ?? null}
            busy={previewBusy}
          />
          <p className="text-[11px] text-muted flex items-center gap-1.5">
            <Headphones size={12} aria-hidden="true" /> {t('aur.ab.note')}
          </p>
          {previewError && <p className="text-xs text-red-400">{previewError}</p>}
          {clipped && (
            <p className="text-xs text-amber flex items-center gap-1.5">
              <AlertTriangle size={13} aria-hidden="true" /> {t('aur.ab.clip', { db: fmt(preview!.peakDbfs) })}
            </p>
          )}
        </section>

        {/* ── Render ──────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-panel p-4 space-y-3" aria-labelledby="aur-render">
          <h2 id="aur-render" className="text-sm font-semibold">{t('aur.render.title')}</h2>
          <p className="text-[11px] text-muted">{t('aur.render.help')}</p>
          <button
            onClick={() => void render()} disabled={!sourceId || rendering}
            className="flex items-center gap-2 px-4 py-2 rounded bg-teal text-dark text-sm font-semibold disabled:opacity-40"
          >
            <Wand2 size={15} aria-hidden="true" /> {rendering ? t('aur.render.working') : t('aur.render.button')}
          </button>
          {lastRender && (
            <div className="rounded border border-teal/40 bg-teal/10 p-3 space-y-2 text-xs" role="status">
              <p><span className="font-semibold">{lastRender.name}</span> · {fmt(lastRender.duration_s)} s · {lastRender.sample_rate / 1000} kHz · {t('pp.list.stereo')}</p>
              <p className="text-muted">{t('aur.render.peak', { db: fmt(lastRender.peak_dbfs) })}</p>
              {lastRender.notes.map((n) => <p key={n} className="text-amber">{n}</p>)}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { selectFile(lastRender.audio_id); navigate('/post-processing') }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded border border-teal text-teal hover:bg-teal/10"
                >
                  <ExternalLink size={13} aria-hidden="true" /> {t('aur.render.open')}
                </button>
                <a
                  href={getStreamUrl(sessionId, lastRender.audio_id)} download={lastRender.name}
                  className="flex items-center gap-1.5 px-3 py-1 rounded border border-field hover:border-teal hover:text-teal"
                >
                  <Download size={13} aria-hidden="true" /> {t('aur.render.download')}
                </a>
              </div>
            </div>
          )}
        </section>

        {/* ── Where to find free HRTF sets ────────────────────────────── */}
        {freeSets.length > 0 && (
          <details className="rounded-lg border border-border bg-panel p-4">
            <summary className="text-sm font-semibold cursor-pointer">{t('aur.open.title')}</summary>
            <p className="text-[11px] text-muted mt-2">{t('aur.open.help')}</p>
            <ul className="mt-2 space-y-2">
              {freeSets.map((d) => (
                <li key={d.id} className="text-xs">
                  <span className="text-muted">{t(`aur.open.kind.${d.kind}`)} · </span>
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-teal underline">{d.name}</a>
                  <span className="text-muted"> · {d.license} · </span>
                  <span className={d.license_status === 'verified' ? 'text-teal' : 'text-amber'}>{t(`aur.open.status.${d.license_status}`)}</span>
                  <span className="block text-[11px] text-muted">{d.note}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  )
}

function Slider({ id, label, unit, min, max, step, value, onChange }: {
  id: string; label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={`aur-${id}`} className="text-xs text-muted w-24 shrink-0">{label}</label>
      <input
        id={`aur-${id}`} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-teal"
      />
      <input
        type="number" min={min} max={max} step={step} value={Number(value.toFixed(1))} aria-label={label}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))) }}
        className="w-16 bg-dark border border-field rounded px-1.5 py-0.5 text-xs text-right focus:border-teal"
      />
      <span className="text-xs text-muted w-6">{unit.trim()}</span>
    </div>
  )
}
