import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Loader2, Download, X, Waves, Activity, CircleDot, LineChart } from 'lucide-react'
import clsx from 'clsx'
import { useFrfStore } from '../../store/useFrfStore'
import { toast } from '../../store/useToast'
import type { FrfResult, RespType } from '../../api/frfApi'
import type { FrfView } from './FrfPlots'

const FrfPlots = lazy(() => import('./FrfPlots'))

const VIEWS: { key: FrfView; label: string; Icon: React.ElementType }[] = [
  { key: 'bode',    label: 'Bode',        Icon: Activity },
  { key: 'complex', label: 'Real / Imag', Icon: Waves },
  { key: 'nyquist', label: 'Nyquist',     Icon: CircleDot },
  { key: 'modes',   label: 'Modes',       Icon: LineChart },
]

const BLOCKS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]
const RESP_LABEL: Record<RespType, string> = {
  none: 'Not specified', acceleration: 'Acceleration', velocity: 'Velocity', displacement: 'Displacement',
}

const sel = 'w-full bg-panel border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-teal disabled:opacity-50'
const num = 'w-full bg-panel border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-teal'
const lab = 'text-[10px] text-muted uppercase tracking-wider'

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
      <span className="text-[10px] text-muted">{label}{suffix ? ` (${suffix})` : ''}</span>
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

function frfCsv(r: FrfResult): string {
  const head = ['Frequency (Hz)']
  r.responses.forEach((c) => head.push(`${c.name} magnitude (dB)`, `${c.name} phase (deg)`, `${c.name} real`, `${c.name} imag`,
    ...(c.coherence ? [`${c.name} coherence`] : [])))
  const rows = r.freqs.map((f, i) => {
    const row: (string | number)[] = [f]
    r.responses.forEach((c) => row.push(c.mag_db[i], c.phase_deg[i], c.real[i], c.imag[i], ...(c.coherence ? [c.coherence[i]] : [])))
    return row.join(',')
  })
  return [head.map((h) => `"${h}"`).join(','), ...rows].join('\n')
}

function modesCsv(r: FrfResult): string {
  const head = 'Mode,Frequency (Hz),Damping ratio (%),Damping half-power (%),Damping fit (%),Q,-3 dB bandwidth (Hz),Coherence,Level (dB)'
  const pct = (v: number | null) => (v == null ? '' : (v * 100).toFixed(3))
  const rows = (r.modes ?? []).map((m, i) =>
    [i + 1, m.fn_hz, pct(m.zeta), pct(m.zeta_hp), pct(m.zeta_fit), m.q ?? '', m.bandwidth_hz ?? '', m.coherence ?? '', m.level_db].join(','))
  return [head, ...rows].join('\n')
}

export default function SystemAnalysisPage() {
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
    const t = window.setTimeout(() => { void s.compute() }, 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  const blockInfo = fs ? `Δf ${(fs / params.nperseg).toFixed(3)} Hz · ${(params.nperseg / fs).toFixed(2)} s` : ''

  return (
    <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden text-white">

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
            {channels.length ? 'Add more records' : <span className="text-teal font-semibold">Start here</span>}<br />
            Drop UFF, WAV or CSV files here<br />or <span className="text-teal">click to browse</span>
          </span>
          <input ref={inputRef} type="file" multiple accept=".uff,.unv,.wav,.csv,.txt,.dat,.tsv" className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
        </label>
        {loading && <p className="text-[10px] text-teal text-center animate-pulse">Reading files…</p>}
        <label className="flex items-center gap-2 text-[10px] text-muted" title="Only needed for CSV tables that have no time column">
          CSV sample rate (Hz)
          <input type="number" className={clsx(num, 'w-24')} placeholder="if no time column" value={s.csvFs}
            onChange={(e) => s.setCsvFs(e.target.value)} />
        </label>

        {s.files.length > 0 && (
          <div className="flex flex-col gap-1">
            {s.files.map((f) => (
              <div key={f.id} className="flex items-center gap-1 text-[11px] text-muted bg-panel/60 rounded px-2 py-1">
                <span className="truncate flex-1" title={f.name}>{f.name}</span>
                <button onClick={() => s.removeFile(f.id)} className="hover:text-red-400" aria-label={`Remove ${f.name}`}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {timeCh.length > 0 && (
          <Group title="Channels">
            <div className="flex items-center text-[10px] text-muted gap-1 px-1">
              <span className="flex-1">Record</span><span className="w-12 text-center">Input</span><span className="w-12 text-center">Output</span>
            </div>
            {timeCh.map((c) => (
              <div key={c.id} className="flex items-center gap-1 text-xs bg-panel/40 rounded px-1 py-1">
                <span className="flex-1 min-w-0">
                  <span className="block truncate" title={c.name}>{c.name}</span>
                  <span className="block text-[10px] text-muted">{c.fs?.toLocaleString("en-US")} Hz · {c.duration_s} s{c.unit ? ` · ${c.unit}` : ''}</span>
                </span>
                <button className="w-12 flex justify-center" onClick={() => s.setExcitation(excitation === c.id ? null : c.id)}
                  aria-label={`Use ${c.name} as the excitation`} aria-pressed={excitation === c.id}>
                  <span className={clsx('w-3.5 h-3.5 rounded-full border-2', excitation === c.id ? 'bg-orange border-orange' : 'border-border')} />
                </button>
                <button className="w-12 flex justify-center" onClick={() => s.toggleResponse(c.id)}
                  aria-label={`Use ${c.name} as a response`} aria-pressed={responses.includes(c.id)}>
                  <span className={clsx('w-3.5 h-3.5 rounded border-2', responses.includes(c.id) ? 'bg-teal border-teal' : 'border-border')} />
                </button>
              </div>
            ))}
            <p className="text-[10px] text-muted">Input = the force (or reference). Output = what responds; pick several to compare.</p>
          </Group>
        )}

        {frfCh.length > 0 && (
          <Group title="Measured FRFs in the files">
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
                <Group title="Estimator">
                  <Seg value={params.estimator} onChange={(v) => s.setParams({ estimator: v })} options={[
                    { v: 'H1', label: 'H1', title: 'Best when the noise is on the response' },
                    { v: 'H2', label: 'H2', title: 'Best when the noise is on the excitation' },
                    { v: 'HV', label: 'Hv', title: 'Total least squares: noise on both' },
                  ]} />
                </Group>

                <Group title="Averaging">
                  <Seg value={params.averaging} onChange={(v) => s.setParams({ averaging: v, nperseg: v === 'impact' ? Math.max(params.nperseg, 8192) : params.nperseg })} options={[
                    { v: 'welch', label: 'Random / continuous', title: 'Shaker, noise, sweeps: overlapping blocks' },
                    { v: 'impact', label: 'Impact (hammer)', title: 'Finds each hit and averages them' },
                  ]} />
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted">Block length{blockInfo ? ` · ${blockInfo}` : ''}</span>
                    <select className={sel} value={params.nperseg} onChange={(e) => s.setParams({ nperseg: Number(e.target.value) })}>
                      {BLOCKS.map((b) => <option key={b} value={b}>{b.toLocaleString("en-US")} samples</option>)}
                    </select>
                  </label>
                  {!impact ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted">Overlap</span>
                        <select className={sel} value={params.overlap} onChange={(e) => s.setParams({ overlap: Number(e.target.value) })}>
                          {[0, 25, 50, 66, 75].map((o) => <option key={o} value={o}>{o} %</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted">Window</span>
                        <select className={sel} value={params.window} onChange={(e) => s.setParams({ window: e.target.value })}>
                          {['hann', 'hamming', 'blackman', 'flattop', 'rectangular'].map((w) => <option key={w} value={w}>{w[0].toUpperCase() + w.slice(1)}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <NumField label="Trigger level" suffix="% of peak" value={params.impact.trigger_pct} min={1} max={95} onChange={(v) => s.setImpact({ trigger_pct: v })} />
                      <NumField label="Pre-trigger" suffix="% of block" value={params.impact.pretrigger_pct} min={0} max={50} onChange={(v) => s.setImpact({ pretrigger_pct: v })} />
                      <NumField label="Force window" suffix="ms" value={params.impact.force_ms} min={0.1} step={0.5} onChange={(v) => s.setImpact({ force_ms: v })} />
                      <NumField label="Exp. window ends at" suffix="%" value={params.impact.exp_end_pct} min={0.1} max={100} step={0.5} onChange={(v) => s.setImpact({ exp_end_pct: v })} />
                    </div>
                  )}
                </Group>
              </>
            )}

            <Group title="Response quantity">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted">The response channel measures</span>
                <select className={sel} value={params.response_type}
                  onChange={(e) => { const v = e.target.value as RespType; s.setParams({ response_type: v, show_as: v }) }}>
                  {(Object.keys(RESP_LABEL) as RespType[]).map((k) => <option key={k} value={k}>{RESP_LABEL[k]}</option>)}
                </select>
              </label>
              {params.response_type !== 'none' && (
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted">Show the FRF as</span>
                  <select className={sel} value={params.show_as} onChange={(e) => s.setParams({ show_as: e.target.value as RespType })}>
                    <option value="acceleration">Accelerance (acceleration / force)</option>
                    <option value="velocity">Mobility (velocity / force)</option>
                    <option value="displacement">Receptance (displacement / force)</option>
                  </select>
                </label>
              )}
            </Group>

            <Group title="Frequency range">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="From" suffix="Hz" value={params.fmin} min={0} onChange={(v) => s.setParams({ fmin: v })} />
                <label className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-muted">To (Hz)</span>
                  <input type="number" className={num} placeholder="Nyquist" value={params.fmax ?? ''} min={1}
                    onChange={(e) => { const v = parseFloat(e.target.value); s.setParams({ fmax: isNaN(v) ? null : v }) }} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="accent-teal" checked={params.unwrap} onChange={(e) => s.setParams({ unwrap: e.target.checked })} />
                Unwrap phase
              </label>
            </Group>

            <Group title="Modes">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" className="accent-teal" checked={params.modes.enabled} onChange={(e) => s.setModes({ enabled: e.target.checked })} />
                Detect modes and damping
              </label>
              {params.modes.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label="Peak prominence" suffix="dB" value={params.modes.prominence_db} min={1} step={1} onChange={(v) => s.setModes({ prominence_db: v })} />
                    <label className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] text-muted">Min. spacing (Hz)</span>
                      <input type="number" className={num} placeholder="auto" value={params.modes.min_sep_hz ?? ''} min={0}
                        onChange={(e) => { const v = parseFloat(e.target.value); s.setModes({ min_sep_hz: isNaN(v) ? null : v }) }} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted">Damping method</span>
                    <select className={sel} value={params.modes.method} onChange={(e) => s.setModes({ method: e.target.value as any })}>
                      <option value="both">Half-power and mode fit</option>
                      <option value="half_power">Half-power (−3 dB) only</option>
                      <option value="fit">Single-mode fit only</option>
                    </select>
                  </label>
                </>
              )}
            </Group>
          </>
        )}
      </aside>

      {/* ── Results column ── */}
      <main className="flex flex-col flex-1 min-w-0 min-h-[420px] lg:min-h-0 lg:overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {VIEWS.filter((v) => v.key !== 'modes' || params.modes.enabled).map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setView(key)} disabled={!result}
                className={clsx('flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors disabled:opacity-30',
                  view === key ? 'bg-teal text-dark' : 'bg-panel text-muted hover:text-white')}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
          {view !== 'nyquist' && (
            <div className="flex gap-1 ml-1" role="group" aria-label="Frequency axis">
              {([true, false] as const).map((lg) => (
                <button key={String(lg)} onClick={() => setXLog(lg)} aria-pressed={xLog === lg}
                  className={clsx('px-2 py-0.5 text-[11px] rounded border transition-colors',
                    xLog === lg ? 'bg-teal/20 border-teal/50 text-teal' : 'border-border text-muted hover:text-white')}>
                  {lg ? 'Log f' : 'Linear f'}
                </button>
              ))}
            </div>
          )}
          {result?.modes && result.modes.length > 0 && view !== 'modes' && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer ml-1">
              <input type="checkbox" className="accent-teal" checked={showModes} onChange={(e) => setShowModes(e.target.checked)} />
              Mark modes
            </label>
          )}
          <div className="flex-1" />
          {busy && <span className="flex items-center gap-1.5 text-[11px] text-teal"><Loader2 size={12} className="animate-spin" />Calculating…</span>}
          {result && (
            <>
              <button onClick={() => { download('frf.csv', frfCsv(result)); toast.success('FRF exported') }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors">
                <Download size={13} />FRF CSV
              </button>
              {result.modes && result.modes.length > 0 && (
                <button onClick={() => { download('modes.csv', modesCsv(result)); toast.success('Modes exported') }}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors">
                  <Download size={13} />Modes CSV
                </button>
              )}
            </>
          )}
        </div>

        {error && <p className="m-3 text-xs text-red-300 bg-red-400/10 border border-red-400/30 rounded px-3 py-2">{error}</p>}

        {result && (
          <div className="px-3 pt-2 text-[11px] text-muted flex flex-wrap gap-x-4 gap-y-0.5 shrink-0">
            <span>{result.estimator === 'HV' ? 'Hv' : result.estimator} · {result.quantity}</span>
            {result.n_averages > 0 && <span>{result.n_averages} {result.averaging === 'impact' ? 'impact' : 'average'}{result.n_averages === 1 ? '' : 's'}</span>}
            <span>Δf {result.df_hz.toFixed(3)} Hz</span>
          </div>
        )}
        {result && result.warnings.length > 0 && (
          <div className="mx-3 mt-1 text-[11px] text-amber bg-amber/10 border border-amber/30 rounded px-3 py-1.5 space-y-0.5 shrink-0">
            {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        <div className="flex-1 min-h-0 p-2 flex flex-col gap-2 lg:overflow-y-auto">
          {!result && !error && (
            <div className="flex flex-1 items-center justify-center text-center text-muted px-6">
              <div className="space-y-1">
                <p className="text-sm">{channels.length === 0 ? 'Load a measurement to begin' : busy ? 'Calculating…' : 'Choose the input and output channels'}</p>
                <p className="text-[11px] max-w-sm">
                  {channels.length === 0
                    ? 'Time records (UFF, WAV, CSV) give FRFs with coherence, Bode plots and modes. FRFs already stored in a UFF file are plotted as they are.'
                    : 'Mark which record is the excitation (input) and which are the responses (output).'}
                </p>
              </div>
            </div>
          )}
          {result && (
            <>
              <div className={clsx('min-h-[340px]', view === 'modes' ? 'h-[300px] shrink-0' : 'flex-1')}>
                <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-teal animate-pulse">Loading charts…</div>}>
                  <FrfPlots result={result} view={view} xLog={view === 'nyquist' ? false : xLog} showModes={showModes} />
                </Suspense>
              </div>
              {view === 'modes' && <ModesTable result={result} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function ModesTable({ result }: { result: FrfResult }) {
  const modes = result.modes ?? []
  if (!modes.length) {
    return <p className="text-xs text-muted px-2">No mode was found. Lower the peak prominence, widen the frequency range, or check the coherence.</p>
  }
  const pct = (v: number | null) => (v == null ? '—' : (v * 100).toFixed(2))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted text-left border-b border-border">
            <th className="px-2 py-1 font-medium">#</th>
            <th className="px-2 py-1 font-medium">Frequency (Hz)</th>
            <th className="px-2 py-1 font-medium">Damping ζ (%)</th>
            <th className="px-2 py-1 font-medium" title="From the width of the peak at −3 dB">ζ half-power</th>
            <th className="px-2 py-1 font-medium" title="From fitting one mode to the complex FRF around the peak">ζ fit</th>
            <th className="px-2 py-1 font-medium">Q</th>
            <th className="px-2 py-1 font-medium">Bandwidth (Hz)</th>
            <th className="px-2 py-1 font-medium">Coherence</th>
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
          {modes.flatMap((m, i) => m.warnings.map((w, k) => <li key={`${i}-${k}`}>Mode {i + 1} ({m.fn_hz.toFixed(1)} Hz): {w}</li>))}
        </ul>
      )}
      <p className="mt-2 px-2 text-[10px] text-muted">
        Damping uses the receptance form of the FRF. The half-power method is reliable for well separated modes; the fit also
        works when modes are close, and its error is shown in the exported table.
      </p>
    </div>
  )
}
