import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchServerLoad } from '../api/audioApi'
import type { ServerLoad } from '../types'

const fmt = (s: number) => (s < 10 ? s.toFixed(1) : String(Math.round(s)))

/**
 * What a slow calculation is really doing, instead of a bar that only pretends to advance.
 *
 * The server says whether this request is running or how many calculations are ahead of it, how long
 * it has been going, and how long this kind of calculation usually takes there (from its earlier runs).
 * The bar shows time against that estimate, never more than 95% until the answer arrives.
 */
export default function MetricProgress({ label, metricKey, job, duration, onCancel }: {
  label: string
  metricKey: string
  job: string                       // the name this request was sent under
  duration: number                  // seconds of audio being calculated
  onCancel: (wasRunning: boolean) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const [load, setLoad] = useState<ServerLoad | null>(null)

  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => { const l = await fetchServerLoad(); if (alive && l) setLoad(l) }
    void poll()
    const id = window.setInterval(poll, 1500)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const heavy = load?.heavy
  const tracked = !!heavy?.tracked                               // a server with a compute queue (small hosts); a local one has none
  const queued = tracked ? heavy!.queue.indexOf(job) : -1
  const running = tracked && heavy!.running_job === job
  const waiting = queued >= 0
  const ahead = waiting ? queued + (heavy!.running_job ? 1 : 0) : 0

  const rate = load?.timing_s_per_audio_s?.[metricKey]
  const eta = rate && duration > 0 ? rate * duration : null
  const worked = running ? (heavy!.running_for_s ?? 0) : elapsed       // time spent calculating, not waiting
  const pct = eta ? Math.min(95, (worked / eta) * 100) : 0
  const slow = !!eta && worked > eta * 1.3

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 h-full">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 size={14} className="animate-spin text-teal shrink-0" />
        <span>
          {waiting
            ? `Waiting for ${ahead} other calculation${ahead > 1 ? 's' : ''} on the server…`
            : `Calculating ${label}…`}
        </span>
      </div>

      {!waiting && (
        <div className="w-full max-w-xs h-1.5 bg-panel rounded-full overflow-hidden border border-border"
          role="progressbar" aria-label={`Calculating ${label}`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={eta ? Math.round(pct) : undefined}>
          {eta
            ? <div className="h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${pct.toFixed(1)}%`, background: 'linear-gradient(90deg,#50b89e,#3dd6b0)' }} />
            : <div className="h-full w-1/3 rounded-full bg-teal/70 animate-pulse" />}
        </div>
      )}

      <span className="text-[10px] text-muted/70 tabular-nums text-center">
        {waiting
          ? 'It starts as soon as they finish. You can cancel it.'
          : eta
            ? (slow ? `${fmt(worked)} s — taking longer than the usual ${fmt(eta)} s`
                    : `${fmt(worked)} s of about ${fmt(eta)} s (from earlier calculations on this server)`)
            : `${fmt(worked)} s — no estimate yet (first time on this server)`}
      </span>

      <button
        onClick={() => onCancel(running)}
        className="px-3 py-1 text-xs text-muted hover:text-white border border-border rounded transition-colors">
        Cancel
      </button>
    </div>
  )
}
