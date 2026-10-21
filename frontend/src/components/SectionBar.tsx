import { useEffect, useState } from 'react'
import { Scissors } from 'lucide-react'
import { useStore } from '../store/useStore'
import { toast } from '../store/useToast'
import type { Section } from '../types'

export const MIN_SECTION_S = 0.05

const round3 = (x: number) => Math.round(x * 1000) / 1000
const fmt = (x: number) => x.toFixed(3)

/** Stable text for a section, for effect dependencies and labels. */
export const sectionKey = (s: Section | null | undefined) => (s ? `${s[0]}-${s[1]}` : '')

/**
 * Limits typed or dragged by the user → what to keep.
 * `null`: the limits cover the whole file (no section); `undefined`: too short to analyse.
 */
export function toSection(a: number, b: number, duration: number, edge = 0.0005): Section | null | undefined {
  let lo = Math.max(0, Math.min(a, b))
  let hi = Math.min(duration, Math.max(a, b))
  if (lo <= edge) lo = 0                    // a limit on (or dragged onto) an edge of the file is that edge
  if (hi >= duration - edge) hi = duration
  if (lo === 0 && hi === duration) return null
  if (hi - lo < MIN_SECTION_S) return undefined
  return [round3(lo), round3(hi)]
}

/**
 * The part of the file every analysis looks at. It can be dragged on the waveform (Normal view)
 * or typed here, and it is the same in every view: spectrum, spectrogram, 1/3-octave, envelope,
 * metrics. A short section is also what lets a long file be analysed on a small server.
 */
export default function SectionBar({ audioId, duration }: { audioId: string; duration: number }) {
  const section = useStore((s) => s.sections[audioId] ?? null)
  const setSection = useStore((s) => s.setSection)
  const lo = section ? section[0] : 0
  const hi = section ? section[1] : duration
  const [from, setFrom] = useState(fmt(lo))
  const [to, setTo] = useState(fmt(hi))

  useEffect(() => { setFrom(fmt(lo)); setTo(fmt(hi)) }, [audioId, lo, hi])

  if (duration < 2 * MIN_SECTION_S) return null

  const reset = () => { setFrom(fmt(lo)); setTo(fmt(hi)) }

  const apply = () => {
    const a = parseFloat(from), b = parseFloat(to)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return reset()
    const next = toSection(a, b, duration)
    if (next === undefined) {
      toast.error(`The section must last at least ${MIN_SECTION_S} s`)
      return reset()
    }
    setSection(audioId, next)
    if (next === null) { setFrom(fmt(0)); setTo(fmt(duration)) }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    if (e.key === 'Escape') { reset(); (e.target as HTMLInputElement).blur() }
  }

  const inputCls = 'w-[4.5rem] bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-white tabular-nums focus:outline-none focus:border-teal'

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 shrink-0 rounded border text-[11px] flex-wrap ${
        section ? 'border-teal/50 bg-teal/5' : 'border-border/60'
      }`}
    >
      <Scissors size={12} className={section ? 'text-teal' : 'text-muted'} />
      <span className="text-[10px] uppercase tracking-wider text-muted">Section</span>
      <input
        type="number" min={0} step={0.1} value={from} aria-label="Section start (s)"
        onChange={(e) => setFrom(e.target.value)} onBlur={apply} onKeyDown={onKey} className={inputCls}
      />
      <span className="text-muted">–</span>
      <input
        type="number" min={0} step={0.1} value={to} aria-label="Section end (s)"
        onChange={(e) => setTo(e.target.value)} onBlur={apply} onKeyDown={onKey} className={inputCls}
      />
      <span className="text-muted">s</span>
      {section ? (
        <>
          <span className="text-teal">Analysing only this part · {(hi - lo).toFixed(2)} of {duration.toFixed(2)} s</span>
          <button
            onClick={() => setSection(audioId, null)}
            className="px-2 py-0.5 text-[10px] text-muted hover:text-white border border-border rounded transition-colors"
          >
            Whole file
          </button>
        </>
      ) : (
        <>
          <span className="text-muted">Whole file · {duration.toFixed(2)} s</span>
          <span className="ml-auto hidden md:inline text-[10px] text-muted/70">
            Drag on the waveform (Normal view) or type the limits to analyse only a part
          </span>
        </>
      )}
    </div>
  )
}
