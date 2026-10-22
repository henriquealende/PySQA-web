import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Loader2, Download, X, Waves, Activity, CircleDot, LineChart } from 'lucide-react'
import clsx from 'clsx'
import { useFrfStore } from '../../store/useFrfStore'
import { toast } from '../../store/useToast'
import type { FrfResult, RespType } from '../../api/frfApi'
import type { FrfView } from './FrfPlots'
import ImportCallout from '../../components/ImportCallout'
import { useT } from '../../i18n'

type T = (key: string, vars?: Record<string, string | number>) => string

const FRF_EXTENSIONS = ['.uff', '.unv', '.wav', '.csv', '.txt', '.dat', '.tsv']

const FrfPlots = lazy(() => import('./FrfPlots'))

const VIEWS: { key: FrfView; label: string; Icon: React.ElementType }[] = [
  { key: 'bode',    label: 'sa.page.view.bode',    Icon: Activity },
  { key: 'complex', label: 'sa.page.view.complex', Icon: Waves },
  { key: 'nyquist', label: 'sa.page.view.nyquist', Icon: CircleDot },
  { key: 'modes',   label: 'sa.page.view.modes',   Icon: LineChart },
]

const BLOCKS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]
const RESP_LABEL: Record<RespType, string> = {
  none: 'sa.page.resp.none', acceleration: 'sa.page.resp.acceleration', velocity: 'sa.page.resp.velocity', displacement: 'sa.page.resp.displacement',
}

const sel = 'w-full bg-panel border border-field rounded px-2 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal disabled:opacity-50'
const num = 'w-full bg-panel border border-field rounded px-2 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal'
const lab = 'text-[11px] text-muted uppercase tracking-wider'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3 flex flex-col gap-2">
      <p className={lab}>{title}</p>
      {children}
    </div>
  )
}

function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: string; title?: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} title={o.title}
          className={clsx('flex-1 py-1 text-xs rounded transition-colors',
            value === o.v ? 'bg-teal text-dark font-semibold' : 'bg-panel text-muted hover:text-white')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function NumField({ label, value, onChange, step = 1, min, max, suffix }: {
  label: string; value: number | null; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string
}) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] text-muted">{label}{suffix ? ` (${suffix})` : ''}</span>
      <input type="number" className={num} value={value ?? ''} step={step} min={min} max={max}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }} />
    </label>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

function frfCsv(r: FrfResult, t: T): string {
  const head = [t('sa.page.csv.frequency')]
  r.responses.forEach((c) => head.push(t('sa.page.csv.magnitude', { name: c.name }), t('sa.page.csv.phase', { name: c.name }), t('sa.page.csv.real', { name: c.name }), t('sa.page.csv.imag', { name: c.name }),
    ...(c.coherence ? [t('sa.page.csv.coherence', { name: c.name })] : [])))
  const rows = r.freqs.map((f, i) => {
    const row: (string | number)[] = [f]
    r.responses.forEach((c) => row.push(c.mag_db[i], c.phase_deg[i], c.real[i], c.imag[i], ...(c.coherence ? [c.coherence[i]] : [])))
    return row.join(',')
  })
  return [head.map((h) => `"${h}"`).join(','), ...rows].join('\n')
}

function modesCsv(r: FrfResult, t: T): string {
  const head = t('sa.page.csv.modesHead')
  const pct = (v: number | null) => (v == null ? '' : (v * 100).toFixed(3))
  const rows = (r.modes ?? []).map((m, i) =>
    [i + 1, m.fn_hz, pct(m.zeta), pct(m.zeta_hp), pct(m.zeta_fit), m.q ?? '', m.bandwidth_hz ?? '', m.coherence ?? '', m.level_db].join(','))
  return [head, ...rows].join('\n')
}

export default function SystemAnalysisPage() {
  const t = useT()
  const s = useFrfStore()
  const { params, channels, excitation, responses, result, busy, loading, error } = s
  const [view, setView] = useState<FrfView>('bode')
  const [xLog, setXLog] = useState(true)
  const [showModes, setShowModes] = useState(true)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const timeCh = channels.filter((c) => c.kind === 'time')
  const frfCh = channels.filter((c) => c.kind === 'frf')
  const excCh = channels.find((c) => c.id === excitation)
  const fs = excCh?.fs ?? timeCh[0]?.fs
  const impact = params.averaging === 'impact'
  const hasTimeResp = responses.some((r) => channels.find((c) => c.id === r)?.kind === 'time')
  const ready = responses.length > 0 && (!hasTimeResp || !!excitation)

  const onFiles = (list: FileList | null) => {
    if (!list || !list.length) return
    void s.addFiles(Array.from(list))
  }

  // Recompute a moment after any change that matters, so the plots always match the settings
  const key = useMemo(() => JSON.stringify([excitation, responses, params]), [excitation, responses, params])
  useEffect(() => {
    if (!ready) return
    const tm = window.setTimeout(() => { void s.compute() }, 350)
    return () => window.clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  const blockInfo = fs ? `Δf ${(fs / params.nperseg).toFixed(3)} Hz · ${(params.nperseg / fs).toFixed(2)} s` : ''

  return (
    <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden text-white">

      <h1 className="sr-only">{t('sa.page.title')}</h1>
      {/* ── Settings column ── */}
      <aside className="shrink-0 lg:w-80 lg:border-r border-border p-3 flex flex-col gap-3 lg:overflow-y-auto">

        <label
          className={clsx('flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors py-5 px-4',
            drag ? 'border-teal bg-teal/10' : channels.length ? 'border-border hover:border-teal/50' : 'border-teal/70 bg-teal/5 animate-glow-ring motion-reduce:animate-none')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}>
          <Upload size={20} className="text-teal" />
          <span className="text-muted text-xs text-center">
            {channels.length ? t('sa.page.addMore') : <span className="text-teal font-semibold">{t('sa.page.startHere')}</span>}<br />
            {t('sa.page.dropFiles')}<br />{t('sa.page.or')} <span className="text-teal">{t('sa.page.clickBrowse')}</span>
          </span>
          <input ref={inputRef} type="file" multiple accept=".uff,.unv,.wav,.csv,.txt,.dat,.tsv" className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
        </label>
        {loading && <p className="text-[11px] text-teal text-center animate-pulse">{t('sa.page.reading')}</p>}
        <label className="flex items-center gap-2 text-[11px] text-muted" title={t('sa.page.csvFsTitle')}>
          {t('sa.page.csvFs')}
          <input type="number" className={clsx(num, 'w-24')} placeholder={t('sa.page.csvFsPlaceholder')} value={s.csvFs}
            onChange={(e) => s.setCsvFs(e.target.value)} />
        </label>

        {s.files.length > 0 && (
          <div className="flex flex-col gap-1">
            {s.files.map((f) => (
              <div key={f.id} className="flex items-center gap-1 text-[11px] text-muted bg-panel/60 rounded px-2 py-1">
                <span className="truncate flex-1" title={f.name}>{f.name}</span>
                <button onClick={() => s.removeFile(f.id)} className="hover:text-red-400" aria-label={t('sa.page.removeFile', { name: f.name })}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {timeCh.length > 0 && (
          <Group title={t('sa.page.channels')}>
            <div className="flex items-center text-[11px] text-muted gap-1 px-1">
              <span className="flex-1">{t('sa.page.record')}</span><span className="w-12 text-center">{t('sa.page.input')}</span><span className="w-12 text-center">{t('sa.page.output')}</span>
            </div>
            {timeCh.map((c) => (
              <div key={c.id} className="flex items-center gap-1 text-xs bg-panel/40 rounded px-1 py-1">
                <span className="flex-1 min-w-0">
                  <span className="block truncate" title={c.name}>{c.name}</span>
                  <span className="block text-[11px] text-muted">{c.fs?.toLocaleString("en-US")} Hz · {c.duration_s} s{c.unit ? ` · ${c.unit}` : ''}</span>
                </span>
                <button className="w-12 flex justify-center" onClick={() => s.setExcitation(excitation === c.id ? null : c.id)}
                  aria-label={t('sa.page.useAsExcitation', { name: c.name })} aria-pressed={excitation === c.id}>
                  <span className={clsx('w-3.5 h-3.5 rounded-full border-2', excitation === c.id ? 'bg-orange border-orange' : 'border-border')} />
                </button>
                <button className="w-12 flex justify-center" onClick={() => s.toggleResponse(c.id)}
                  aria-label={t('sa.page.useAsResponse', { name: c.name })} aria-pressed={responses.includes(c.id)}>
                  <span className={clsx('w-3.5 h-3.5 rounded border-2', responses.includes(c.id) ? 'bg-teal border-teal' : 'border-border')} />
                </button>
              </div>
            ))}
            <p className="text-[11px] text-muted">{t('sa.page.inputHelp')}</p>
          </Group>
        )}

        {frfCh.length > 0 && (
          <Group title={t('sa.page.measuredFrfs')}>
            {frfCh.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="accent-teal" checked={responses.includes(c.id)} onChange={() => s.toggleResponse(c.id)} />
                <span className="truncate" title={c.name}>{c.name}</span>
              </label>
            ))}
          </Group>
        )}

        {channels.length > 0 && (
          <>
            {hasTimeResp && (
              <>
                <Group title={t('sa.page.estimator')}>
                  <Seg value={params.estimator} onChange={(v) => s.setParams({ estimator: v })} options={[
                    { v: 'H1', label: 'H1', title: t('sa.page.h1Title') },
                    { v: 'H2', label: 'H2', title: t('sa.page.h2Title') },
                    { v: 'HV', label: 'Hv', title: t('sa.page.hvTitle') },
                  ]} />
                </Group>

                <Group title={t('sa.page.averaging')}>
                  <Seg value={params.averaging} onChange={(v) => s.setParams({ averaging: v, nperseg: v === 'impact' ? Math.max(params.nperseg, 8192) : params.nperseg })} options={[
                    { v: 'welch', label: t('sa.page.welch'), title: t('sa.page.welchTitle') },
                    { v: 'impact', label: t('sa.page.impact'), title: t('sa.page.impactTitle') },
                  ]} />
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted">{t('sa.page.blockLength')}{blockInfo ? ` · ${blockInfo}` : ''}</span>
                    <select className={sel} value={params.nperseg} onChange={(e) => s.setParams({ nperseg: Number(e.target.value) })}>
                      {BLOCKS.map((b) => <option key={b} value={b}>{t('sa.page.samples', { n: b.toLocaleString("en-US") })}</option>)}
                    </select>
                  </label>
                  {!impact ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted">{t('sa.page.overlap')}</span>
                        <select className={sel} value={params.overlap} onChange={(e) => s.setParams({ overlap: Number(e.target.value) })}>
                          {[0, 25, 50, 66, 75].map((o) => <option key={o} value={o}>{o} %</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted">{t('sa.page.window')}</span>
                        <select className={sel} value={params.window} onChange={(e) => s.setParams({ window: e.target.value })}>
                          {['hann', 'hamming', 'blackman', 'flattop', 'rectangular'].map((w) => <option key={w} value={w}>{w === 'rectangular' ? t('sa.page.win.rectangular') : w[0].toUpperCase() + w.slice(1)}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <NumField label={t('sa.page.triggerLevel')} suffix={t('sa.page.pctOfPeak')} value={params.impact.trigger_pct} min={1} max={95} onChange={(v) => s.setImpact({ trigger_pct: v })} />
                      <NumField label={t('sa.page.pretrigger')} suffix={t('sa.page.pctOfBlock')} value={params.impact.pretrigger_pct} min={0} max={50} onChange={(v) => s.setImpact({ pretrigger_pct: v })} />
                      <NumField label={t('sa.page.forceWindow')} suffix="ms" value={params.impact.force_ms} min={0.1} step={0.5} onChange={(v) => s.setImpact({ force_ms: v })} />
                      <NumField label={t('sa.page.expWindow')} suffix="%" value={params.impact.exp_end_pct} min={0.1} max={100} step={0.5} onChange={(v) => s.setImpact({ exp_end_pct: v })} />
                    </div>
                  )}
                </Group>
              </>
            )}

            <Group title={t('sa.page.respQuantity')}>
              <label className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted">{t('sa.page.respMeasures')}</span>
                <select className={sel} value={params.response_type}
                  onChange={(e) => { const v = e.target.value as RespType; s.setParams({ response_type: v, show_as: v }) }}>
                  {(Object.keys(RESP_LABEL) as RespType[]).map((k) => <option key={k} value={k}>{t(RESP_LABEL[k])}</option>)}
                </select>
              </label>
              {params.response_type !== 'none' && (
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted">{t('sa.page.showAs')}</span>
                  <select className={sel} value={params.show_as} onChange={(e) => s.setParams({ show_as: e.target.value as RespType })}>
                    <option value="acceleration">{t('sa.page.accelerance')}</option>
                    <option value="velocity">{t('sa.page.mobility')}</option>
                    <option value="displacement">{t('sa.page.receptance')}</option>
                  </select>
                </label>
              )}
            </Group>

            <Group title={t('sa.page.freqRange')}>
              <div className="grid grid-cols-2 gap-2">
                <NumField label={t('sa.page.from')} suffix="Hz" value={params.fmin} min={0} onChange={(v) => s.setParams({ fmin: v })} />
                <label className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] text-muted">{t('sa.page.toHz')}</span>
                  <input type="number" className={num} placeholder={t('sa.page.nyquist')} value={params.fmax ?? ''} min={1}
                    onChange={(e) => { const v = parseFloat(e.target.value); s.setParams({ fmax: isNaN(v) ? null : v }) }} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="accent-teal" checked={params.unwrap} onChange={(e) => s.setParams({ unwrap: e.target.checked })} />
                {t('sa.page.unwrap')}
              </label>
            </Group>

            <Group title={t('sa.page.modes')}>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="accent-teal" checked={params.modes.enabled} onChange={(e) => s.setModes({ enabled: e.target.checked })} />
                {t('sa.page.detectModes')}
              </label>
              {params.modes.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label={t('sa.page.prominence')} suffix="dB" value={params.modes.prominence_db} min={1} step={1} onChange={(v) => s.setModes({ prominence_db: v })} />
                    <label className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] text-muted">{t('sa.page.minSpacing')}</span>
                      <input type="number" className={num} placeholder={t('sa.page.auto')} value={params.modes.min_sep_hz ?? ''} min={0}
                        onChange={(e) => { const v = parseFloat(e.target.value); s.setModes({ min_sep_hz: isNaN(v) ? null : v }) }} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted">{t('sa.page.dampingMethod')}</span>
                    <select className={sel} value={params.modes.method} onChange={(e) => s.setModes({ method: e.target.value as any })}>
                      <option value="both">{t('sa.page.methodBoth')}</option>
                      <option value="half_power">{t('sa.page.methodHalfPower')}</option>
                      <option value="fit">{t('sa.page.methodFit')}</option>
                    </select>
                  </label>
                </>
              )}
            </Group>
          </>
        )}
      </aside>

      {/* ── Results column ── */}
      <section aria-label={t('sa.page.results')} className="flex flex-col flex-1 min-w-0 min-h-[420px] lg:min-h-0 lg:overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {VIEWS.filter((v) => v.key !== 'modes' || params.modes.enabled).map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setView(key)} disabled={!result}
                className={clsx('flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors disabled:opacity-30',
                  view === key ? 'bg-teal text-dark' : 'bg-panel text-muted hover:text-white')}>
                <Icon size={13} />{t(label)}
              </button>
            ))}
          </div>
          {view !== 'nyquist' && (
            <div className="flex gap-1 ml-1" role="group" aria-label={t('sa.page.freqAxis')}>
              {([true, false] as const).map((lg) => (
                <button key={String(lg)} onClick={() => setXLog(lg)} aria-pressed={xLog === lg}
                  className={clsx('px-2 py-0.5 text-[11px] rounded border transition-colors',
                    xLog === lg ? 'bg-teal/20 border-teal/50 text-teal' : 'border-border text-muted hover:text-white')}>
                  {lg ? t('sa.page.logF') : t('sa.page.linearF')}
                </button>
              ))}
            </div>
          )}
          {result?.modes && result.modes.length > 0 && view !== 'modes' && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer ml-1">
              <input type="checkbox" className="accent-teal" checked={showModes} onChange={(e) => setShowModes(e.target.checked)} />
              {t('sa.page.markModes')}
            </label>
          )}
          <div className="flex-1" />
          {busy && <span className="flex items-center gap-1.5 text-[11px] text-teal"><Loader2 size={12} className="animate-spin" />{t('sa.page.calculating')}</span>}
          {result && (
            <>
              <button onClick={() => { download('frf.csv', frfCsv(result, t)); toast.success(t('sa.page.frfExported')) }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors">
                <Download size={13} />{t('sa.page.frfCsv')}
              </button>
              {result.modes && result.modes.length > 0 && (
                <button onClick={() => { download('modes.csv', modesCsv(result, t)); toast.success(t('sa.page.modesExported')) }}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors">
                  <Download size={13} />{t('sa.page.modesCsv')}
                </button>
              )}
            </>
          )}
        </div>

        {error && <p className="m-3 text-xs text-red-300 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">{error}</p>}

        {result && (
          <div className="px-3 pt-2 text-[11px] text-muted flex flex-wrap gap-x-4 gap-y-0.5 shrink-0">
            <span>{result.estimator === 'HV' ? 'Hv' : result.estimator} · {result.quantity}</span>
            {result.n_averages > 0 && <span>{result.averaging === 'impact'
              ? t(result.n_averages === 1 ? 'sa.page.impactOne' : 'sa.page.impactMany', { n: result.n_averages })
              : t(result.n_averages === 1 ? 'sa.page.averageOne' : 'sa.page.averageMany', { n: result.n_averages })}</span>}
            <span>Δf {result.df_hz.toFixed(3)} Hz</span>
          </div>
        )}
        {result && result.warnings.length > 0 && (
          <div className="mx-3 mt-1 text-[11px] text-amber bg-amber/10 border border-amber/30 rounded px-3 py-1.5 space-y-0.5 shrink-0">
            {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        <div className="flex-1 min-h-0 p-2 flex flex-col gap-2 lg:overflow-y-auto">
          {!result && !error && channels.length === 0 && (
            <ImportCallout onFiles={(l) => { void s.addFiles(l) }} disabled={loading}
              title={t('sa.page.calloutTitle')} what={t('sa.page.calloutWhat')} extensions={FRF_EXTENSIONS} />
          )}
          {!result && !error && channels.length > 0 && (
            <div className="flex flex-1 items-center justify-center text-center text-muted px-6">
              <div className="space-y-1">
                <p className="text-sm">{busy ? t('sa.page.calculating') : t('sa.page.chooseChannels')}</p>
                <p className="text-[11px] max-w-sm">{t('sa.page.chooseHelp')}</p>
              </div>
            </div>
          )}
          {result && (
            <>
              <div className={clsx('min-h-[340px]', view === 'modes' ? 'h-[300px] shrink-0' : 'flex-1')}>
                <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-teal animate-pulse">{t('sa.page.loadingCharts')}</div>}>
                  <FrfPlots result={result} view={view} xLog={view === 'nyquist' ? false : xLog} showModes={showModes} />
                </Suspense>
              </div>
              {view === 'modes' && <ModesTable result={result} />}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function ModesTable({ result }: { result: FrfResult }) {
  const t = useT()
  const modes = result.modes ?? []
  if (!modes.length) {
    return <p className="text-xs text-muted px-2">{t('sa.page.noMode')}</p>
  }
  const pct = (v: number | null) => (v == null ? '—' : (v * 100).toFixed(2))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted text-left border-b border-border">
            <th className="px-2 py-1 font-medium">#</th>
            <th className="px-2 py-1 font-medium">{t('sa.page.thFrequency')}</th>
            <th className="px-2 py-1 font-medium">{t('sa.page.thDamping')}</th>
            <th className="px-2 py-1 font-medium" title={t('sa.page.thHalfPowerTitle')}>{t('sa.page.thHalfPower')}</th>
            <th className="px-2 py-1 font-medium" title={t('sa.page.thFitTitle')}>{t('sa.page.thFit')}</th>
            <th className="px-2 py-1 font-medium">Q</th>
            <th className="px-2 py-1 font-medium">{t('sa.page.thBandwidth')}</th>
            <th className="px-2 py-1 font-medium">{t('sa.page.thCoherence')}</th>
          </tr>
        </thead>
        <tbody>
          {modes.map((m, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              <td className="px-2 py-1 text-amber font-semibold">{i + 1}</td>
              <td className="px-2 py-1 tabular-nums">{m.fn_hz.toFixed(2)}</td>
              <td className="px-2 py-1 tabular-nums text-teal font-semibold">{pct(m.zeta)}</td>
              <td className="px-2 py-1 tabular-nums text-muted">{pct(m.zeta_hp)}</td>
              <td className="px-2 py-1 tabular-nums text-muted">{pct(m.zeta_fit)}</td>
              <td className="px-2 py-1 tabular-nums">{m.q ?? '—'}</td>
              <td className="px-2 py-1 tabular-nums">{m.bandwidth_hz?.toFixed(2) ?? '—'}</td>
              <td className={clsx('px-2 py-1 tabular-nums', m.coherence != null && m.coherence < 0.8 && 'text-amber')}>{m.coherence ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {modes.some((m) => m.warnings.length) && (
        <ul className="mt-2 px-2 text-[11px] text-amber space-y-0.5">
          {modes.flatMap((m, i) => m.warnings.map((w, k) => <li key={`${i}-${k}`}>{t('sa.page.modeWarning', { i: i + 1, f: m.fn_hz.toFixed(1), w })}</li>))}
        </ul>
      )}
      <p className="mt-2 px-2 text-[11px] text-muted">
        {t('sa.page.dampingNote')}
      </p>
    </div>
  )
}
