import type { BatchLimit } from '../types'

/** pass / fail against a limit; none: no limit set; missing: there is a limit but no value to compare. */
export type Verdict = 'pass' | 'fail' | 'none' | 'missing'

export function hasLimit(lim?: BatchLimit | null): boolean {
  return !!lim && (lim.min != null || lim.max != null)
}

export function judge(value: number | null | undefined, lim?: BatchLimit | null): Verdict {
  if (!lim || !hasLimit(lim)) return 'none'
  if (value == null || !Number.isFinite(value)) return 'missing'
  if (lim.min != null && value < lim.min) return 'fail'
  if (lim.max != null && value > lim.max) return 'fail'
  return 'pass'
}

/** The verdict of a whole row: one failed limit fails it; a missing value stops it from passing. */
export function judgeRow(row: Record<string, any>, keys: string[], limits: Record<string, BatchLimit>): Verdict {
  let any = false
  let missing = false
  for (const k of keys) {
    const v = judge(row[k], limits[k])
    if (v === 'fail') return 'fail'
    if (v === 'pass') any = true
    if (v === 'missing') missing = true
  }
  if (missing) return 'missing'
  return any ? 'pass' : 'none'
}

/** "≥ 2 and ≤ 5", "≤ 5" or "≥ 2": how a limit reads in a note. */
export function describeLimit(lim: BatchLimit, locale: string): string {
  const f = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 6 })
  const parts: string[] = []
  if (lim.min != null) parts.push(`≥ ${f(lim.min)}`)
  if (lim.max != null) parts.push(`≤ ${f(lim.max)}`)
  return parts.join(' / ')
}
