import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Download, ExternalLink, Headphones, Trash2, Upload, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import FileDropzone from '../../components/FileDropzone'
import { useStore } from '../../store/useStore'
import { StepId, useAuralStore } from '../../store/useAuralStore'
import { toast } from '../../store/useToast'
import { useLang, useLocale, useT } from '../../i18n'
import { getStreamUrl, uploadFiles, isAbort } from '../../api/audioApi'
import {
  Catalog, deleteAsset, fetchCatalog, fetchHrtfResponse, fetchPreview, HrtfResponse, listAssets, renderToSession,
  NO_ENV, NO_HEADPHONE, NO_LEVEL, SPHERE_ID, uploadHrtf,
} from '../../api/auralizationApi'
import HrtfMap from './HrtfMap'
import ResponsePlot from './ResponsePlot'
import AbPlayer from './AbPlayer'
import EnvironmentSection from './EnvironmentSection'
import HeadphoneSection from './HeadphoneSection'
import LevelSection from './LevelSection'
import NoiseSection from './NoiseSection'
import ScenesBar from './ScenesBar'

const STEPS: StepId[] = ['environment', 'hrtf', 'noise', 'headphone', 'level']

/** "Sennheiser HD600" from a library id such as lib:sbaf:cEAR32:Sennheiser-HD600 */
const libName = (id: string) => id.split(':').slice(3).join(':').replace(/-/g, ' ')

type Phase = 'on' | 'ok' | 'off'

/** Where the user is: audio, scenario, listen and create. */
function Stepper({ phases, sourceName }: { phases: [Phase, Phase, Phase]; sourceName?: string }) {
  const t = useT()
  const labels = [sourceName ? `${t('aur.guide.step1')}: ${sourceName}` : t('aur.guide.step1'), t('aur.guide.step2'), t('aur.guide.step3')]
  return (
    <ol className="flex items-center gap-2 flex-wrap text-xs" aria-label={t('aur.chain.title')}>
      {labels.map((label, i) => (
        <li key={i} className="flex items-center gap-2 min-w-0" aria-current={phases[i] === 'on' ? 'step' : undefined}>
          {i > 0 && <span className="w-4 h-px bg-border shrink-0" aria-hidden="true" />}
          <span className={clsx('flex items-center gap-2 rounded-full border px-3 py-1.5 min-w-0',
            phases[i] === 'on' ? 'border-teal bg-teal/10 text-teal' : phases[i] === 'ok' ? 'border-border text-teal' : 'border-border text-muted')}>
            <span className={clsx('w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-medium shrink-0',
              phases[i] === 'on' ? 'bg-teal text-dark' : phases[i] === 'ok' ? 'bg-teal/25 text-teal' : 'bg-panel')}>
              {phases[i] === 'ok' ? <Check size={11} aria-hidden="true" /> : i + 1}
            </span>
            <span className="truncate">{label}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** One tab of the fine adjustments. */
function TabBtn({ step, label, configured, selected, onSelect }: { step: StepId; label: string; configured: boolean; selected: boolean; onSelect: () => void }) {
  const t = useT()
  return (
    <button
      role="tab" id={`aur-tab-${step}`} aria-selected={selected} aria-controls="aur-panel" tabIndex={selected ? 0 : -1} onClick={onSelect}
      className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal',
        selected ? 'bg-teal text-dark font-semibold' : 'bg-panel text-muted hover:text-white')}
    >
      {label}
      {configured && <><Check size={12} className={selected ? 'text-dark' : 'text-teal'} aria-hidden="true" /><span className="sr-only">{t('aur.step.on')}</span></>}
    </button>
  )
}

export default function AuralizationPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const locale = useLocale()
  const fmt = (n: number, d = 1) => n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
  const navigate = useNavigate()
  const { sessionId, files, addFiles, selectFile, calibrations } = useStore()
  const { step, setStep, sourceId, scene, hrtf, env, noise, headphone, level, assets, lastRender, setSource, setHrtf, setEnv, setHeadphone, setAssets, setLastRender } = useAuralStore()
  // keeping the level of a recording needs the calibration of the microphone; without it there is nothing to keep
  const calibrated = sourceId != null && calibrations[sourceId] != null
  const lvEff = useMemo(() => (level.mode === 'source' && !calibrated ? NO_LEVEL : level), [level, calibrated])
  const hpEff = useMemo(() => (headphone.mode !== 'off' && !headphone.asset ? NO_HEADPHONE : headphone), [headphone])
  // a room type without a file chosen yet means no room
  const envEff = useMemo(() => (env.type !== 'none' && !env.asset ? NO_ENV : env), [env])

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [sofaBusy, setSofaBusy] = useState(false)
  const [response, setResponse] = useState<HrtfResponse | null>(null)
  const [preview, setPreview] = useState<{ url: string; peakDbfs: number; gainDb: number | null } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [rendering, setRendering] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const sofaInput = useRef<HTMLInputElement>(null)
  const [adv, setAdv] = useState(false)

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
      if (headphone.asset && !headphone.asset.startsWith('lib:') && !list.some((a) => a.asset_id === headphone.asset)) setHeadphone({ mode: 'off', asset: null })
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
      fetchPreview(sessionId, sourceId, hrtf, envEff, noise, hpEff, lvEff, 0, ctrl.signal)
        .then((p) => { made = p.url; setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return p }) })
        .catch((e) => { if (!isAbort(e)) setPreviewError(e.message) })
        .finally(() => { if (!ctrl.signal.aborted) setPreviewBusy(false) })
    }, 600)
    return () => { window.clearTimeout(id); ctrl.abort(); if (made && !ctrl.signal.aborted) URL.revokeObjectURL(made) }
  }, [sessionId, sourceId, hrtf, envEff, noise, hpEff, lvEff])
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
      const r = await renderToSession(sessionId, sourceId, hrtf, envEff, noise, hpEff, lvEff)
      addFiles([r])
      setLastRender(r)
      toast.success(t('aur.render.done', { name: r.name }))
    } catch (e: any) { toast.error(e.message) } finally { setRendering(false) }
  }

  // arrows, Home and End move between the cards of the chain
  const onTabKeys = (e: React.KeyboardEvent) => {
    const i = STEPS.indexOf(step)
    const next = e.key === 'ArrowRight' ? STEPS[(i + 1) % STEPS.length] : e.key === 'ArrowLeft' ? STEPS[(i + STEPS.length - 1) % STEPS.length]
      : e.key === 'Home' ? STEPS[0] : e.key === 'End' ? STEPS[STEPS.length - 1] : null
    if (!next) return
    e.preventDefault()
    setStep(next)
    window.setTimeout(() => document.getElementById(`aur-tab-${next}`)?.focus(), 0)
  }

  const asset = assets.find((a) => a.asset_id === hrtf.asset)
  const setName = hrtf.asset === SPHERE_ID ? t('aur.hrtf.sphere') : asset?.name ?? '—'
  const modelDesc = useMemo(() => catalog?.builtin.find((b) => b.id === SPHERE_ID)?.description[lang] ?? '', [catalog, lang])
  const clipped = (preview?.peakDbfs ?? -200) > 0
  const sceneName = catalog?.scenes?.find((sc) => sc.id === scene)?.name[lang]
  // what is set, shown while the fine adjustments are folded
  const chips = [
    sceneName ?? (envEff.type === 'none' ? t('aur.env.type.none') : assets.find((a) => a.asset_id === envEff.asset)?.name ?? '—'),
    envEff.type === 'brir' ? t('aur.chain.ignored') : `${setName} · ${t('aur.chain.pos', { az: hrtf.azimuth, el: hrtf.elevation })}`,
    noise.type === 'none' ? t('aur.noise.type.none') : `${t(`aur.noise.type.${noise.type}`)} · ${noise.snr_db} dB`,
    hpEff.mode === 'off' ? t('aur.hp.mode.off') : hpEff.asset?.startsWith('lib:') ? libName(hpEff.asset) : assets.find((a) => a.asset_id === hpEff.asset)?.name ?? '—',
    lvEff.mode === 'off' ? t('aur.lv.mode.off') : lvEff.mode === 'spl' ? `${lvEff.target_db_spl} dB SPL` : t('aur.lv.mode.source'),
  ]

  return (
    <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
      <aside className="flex flex-col gap-5 p-4 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto shrink-0 sm:w-64 lg:w-80">
        <div className="flex items-center gap-2 px-1 pb-1">
          <Headphones size={18} className="text-teal" aria-hidden="true" />
          <h1 className="text-base font-semibold">{t('aur.page.title')}</h1>
        </div>
        <p className="text-xs text-muted px-1">{t('aur.page.intro')}</p>
        {files.length > 0 && (
          <>
        <FileDropzone onFiles={handleFiles} disabled={uploading} highlight={false} />
        {uploading && <p className="text-[11px] text-teal text-center animate-pulse">{t('pp.page.uploading')}</p>}
        {uploadError && <p className="text-[11px] text-red-400 text-center">{uploadError}</p>}
          </>
        )}
        {files.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted">{t('aur.source.pick')}</p>
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

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6 space-y-5">
          <Stepper phases={[source ? 'ok' : 'on', source ? 'on' : 'off', lastRender ? 'ok' : 'off']} sourceName={source ? source.name.replace(/\.wav$/i, '') : undefined} />

          {!source && (
            <section className="mx-auto max-w-xl pt-10 space-y-4 text-center" aria-labelledby="aur-empty">
              <h2 id="aur-empty" className="text-lg font-semibold">{t('aur.guide.emptyTitle')}</h2>
              <FileDropzone onFiles={handleFiles} disabled={uploading} highlight={!uploading} />
              {uploading && <p className="text-xs text-teal animate-pulse">{t('pp.page.uploading')}</p>}
              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
              <p className="text-sm text-muted">{t('aur.guide.emptyHint')}</p>
            </section>
          )}

          {source && (
            <>
              <ScenesBar onOpenAdvanced={() => setAdv(true)} />

              {/* ── Fine adjustments (optional) ───────────────────────── */}
              <section className="space-y-4" aria-labelledby="aur-fine">
                <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-surface px-4 py-3">
                  <h2 id="aur-fine" className="text-sm font-semibold mr-1">{t('aur.guide.fine')}</h2>
                  {!adv && chips.map((c, i) => <span key={i} className="rounded bg-panel px-2 py-0.5 text-xs text-muted">{c}</span>)}
                  <button
                    onClick={() => setAdv(!adv)} aria-expanded={adv} aria-controls="aur-fine-body"
                    className="ml-auto flex items-center gap-1 text-xs text-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal rounded"
                  >
                    {adv ? t('aur.guide.collapse') : t('aur.guide.adjust')} {adv ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  </button>
                </div>

                {adv && (
                  <div id="aur-fine-body" className="space-y-4">
                    <div role="tablist" aria-label={t('aur.guide.fine')} onKeyDown={onTabKeys} className="flex gap-1 flex-wrap">
                      <TabBtn step="environment" label={t('aur.chain.environment')} configured={envEff.type !== 'none'} selected={step === 'environment'} onSelect={() => setStep('environment')} />
                      <TabBtn step="hrtf" label={t('aur.guide.tabHrtf')} configured={envEff.type !== 'brir'} selected={step === 'hrtf'} onSelect={() => setStep('hrtf')} />
                      <TabBtn step="noise" label={t('aur.chain.noise')} configured={noise.type !== 'none'} selected={step === 'noise'} onSelect={() => setStep('noise')} />
                      <TabBtn step="headphone" label={t('aur.chain.headphone')} configured={hpEff.mode !== 'off'} selected={step === 'headphone'} onSelect={() => setStep('headphone')} />
                      <TabBtn step="level" label={t('aur.chain.level')} configured={lvEff.mode !== 'off'} selected={step === 'level'} onSelect={() => setStep('level')} />
                    </div>

                    <div role="tabpanel" id="aur-panel" aria-labelledby={`aur-tab-${step}`} className="space-y-4">
                      {step === 'environment' && <EnvironmentSection />}

        {step === 'hrtf' && (
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
        )}

                      {step === 'noise' && <NoiseSection />}

                      {step === 'headphone' && <HeadphoneSection />}

                      {step === 'level' && <LevelSection gainDb={lvEff.mode === 'off' ? null : preview?.gainDb ?? null} calibrated={calibrated} />}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
        </div>

        {/* ── Listen and create the file (always on screen) ───────────── */}
        {source && (
          <section className="shrink-0 border-t border-border bg-surface" aria-labelledby="aur-play">
            <h2 id="aur-play" className="sr-only">{t('aur.play.title')}</h2>
            <div className="mx-auto max-w-5xl px-3 sm:px-6 py-2 sm:py-3 space-y-2 max-h-[45vh] overflow-y-auto">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <div className="flex-1 min-w-[240px] sm:min-w-[300px]">
                  <AbPlayer
                    originalUrl={sourceId ? getStreamUrl(sessionId, sourceId) : null}
                    processedUrl={preview?.url ?? null}
                    busy={previewBusy}
                  />
                </div>
                <button
                  onClick={() => void render()} disabled={!sourceId || rendering} title={t('aur.render.help')}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-teal text-dark text-sm font-semibold disabled:opacity-40"
                >
                  <Wand2 size={15} aria-hidden="true" /> {rendering ? t('aur.render.working') : t('aur.render.button')}
                </button>
              </div>
              <p className="hidden sm:flex text-xs text-muted items-center gap-1.5">
                <Headphones size={12} aria-hidden="true" /> {t('aur.ab.note')}
              </p>
              {previewError && <p className="text-xs text-red-400">{previewError}</p>}
              {clipped && (
                <p className="text-xs text-amber flex items-center gap-1.5">
                  <AlertTriangle size={13} aria-hidden="true" /> {t('aur.ab.clip', { db: fmt(preview!.peakDbfs) })}
                </p>
              )}

            </div>
          </section>
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
