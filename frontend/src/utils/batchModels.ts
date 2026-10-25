import type { BatchModel, MetricKey } from '../types'

/** Metrics a user-defined model can weigh: the ones the batch computes. */
export const MODEL_METRICS: Exclude<MetricKey, 'none'>[] = [
  'loudness_zwk', 'loudness_ecma', 'sharpness_din', 'roughness_dw', 'roughness_ecma', 'fluctuation_strength', 'tonality_ecma', 'ipm',
]

export const modelKey = (id: string): string => `model_${id}`
export const isModelKey = (k: string): boolean => k.startsWith('model_')

export const newModelId = (): string => Math.random().toString(36).slice(2, 8)

/** The SIL annoyance equation as a starting point: −25.95 + 10.24·N + 13.29·S + 7.75·R + 0.13·IPM. */
export function silPreset(): Pick<BatchModel, 'intercept' | 'weights'> {
  return {
    intercept: -25.95,
    weights: { loudness_zwk: 10.24, sharpness_din: 13.29, roughness_dw: 7.75, ipm: 0.13 },
  }
}

/** The metrics a model needs: those with a weight other than zero. */
export function modelNeeds(m: BatchModel): MetricKey[] {
  return MODEL_METRICS.filter(k => (m.weights[k] ?? 0) !== 0)
}

/** intercept + Σ weight · value. A needed metric without a value makes the whole result missing (null). */
export function computeModel(m: BatchModel, row: Record<string, any>): number | null {
  let y = m.intercept
  for (const k of modelNeeds(m)) {
    const v = row[k]
    if (v == null || !Number.isFinite(Number(v))) return null
    y += (m.weights[k] as number) * Number(v)
  }
  return Number.isFinite(y) ? y : null
}

/** "−25,95 + 10,24·N + 13,29·S": how the model reads, with the short names of the metrics. */
export function describeModel(m: BatchModel, shortOf: (k: MetricKey) => string, locale: string): string {
  const f = (n: number) => Math.abs(n).toLocaleString(locale, { maximumFractionDigits: 6 })
  const parts: string[] = []
  const add = (v: number, label: string | null) => {
    const mag = f(v) + (label ? `·${label}` : '')
    parts.push(parts.length ? `${v < 0 ? '−' : '+'} ${mag}` : `${v < 0 ? '−' : ''}${mag}`)
  }
  if (m.intercept !== 0) add(m.intercept, null)
  for (const k of modelNeeds(m)) add(m.weights[k] as number, shortOf(k))
  return parts.length ? parts.join(' ') : '0'
}
