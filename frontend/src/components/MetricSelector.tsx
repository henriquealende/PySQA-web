import clsx from 'clsx'
import { MetricKey } from '../types'
import { t, useT } from '../i18n'

interface Group {
  label: string
  labelKey?: string
  items: { key: MetricKey; label: string; fullLabel: string }[]
}

const GROUPS: Group[] = [
  {
    label: 'Visualisation', labelKey: 'pp.metric.visualisation',
    items: [{ key: 'none', label: 'Time — Frequency', fullLabel: 'Time — Frequency' }],
  },
  {
    label: 'Loudness',
    items: [
      { key: 'loudness_zwk',  label: 'ISO 532-1 (Zwicker)', fullLabel: 'Loudness ISO 532-1 (Zwicker)' },
      { key: 'loudness_ecma', label: 'ECMA-418-2',           fullLabel: 'Loudness ECMA-418-2' },
    ],
  },
  {
    label: 'Roughness',
    items: [
      { key: 'roughness_dw',   label: 'Daniel & Weber', fullLabel: 'Roughness D&W' },
      { key: 'roughness_ecma', label: 'ECMA-418-2',     fullLabel: 'Roughness ECMA-418-2' },
    ],
  },
  {
    label: 'Other metrics', labelKey: 'pp.metric.otherMetrics',
    items: [
      { key: 'sharpness_din',        label: 'Sharpness DIN 45692',     fullLabel: 'Sharpness DIN 45692' },
      { key: 'fluctuation_strength', label: 'Fluctuation Strength', fullLabel: 'Fluctuation Strength' },
      { key: 'tonality_ecma',        label: 'Tonality ECMA-418-2',     fullLabel: 'Tonality ECMA-418-2' },
      { key: 'ipm',                  label: 'IPM',                     fullLabel: 'IPM' },
    ],
  },
]

export function metricLabel(key: MetricKey): string {
  if (key === 'none') return t('pp.metric.timeFreq')
  for (const g of GROUPS) {
    const item = g.items.find((i) => i.key === key)
    if (item) return item.fullLabel
  }
  return key
}

interface Props {
  value: MetricKey
  onChange: (k: MetricKey) => void
  disabled?: boolean
}

export default function MetricSelector({ value, onChange, disabled }: Props) {
  const t = useT()
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as MetricKey)}
      className={clsx(
        'bg-panel border border-field text-xs text-white rounded px-2 py-1.5',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal disabled:opacity-40 cursor-pointer',
        'w-full'
      )}
    >
      {GROUPS.map((g) => (
        <optgroup key={g.label} label={g.labelKey ? t(g.labelKey) : g.label}>
          {g.items.map((item) => (
            <option key={item.key} value={item.key}>
              {item.key === 'none' ? t('pp.metric.timeFreq') : item.fullLabel}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
