import clsx from 'clsx'
import { MetricKey } from '../types'

interface Group {
  label: string
  items: { key: MetricKey; label: string; fullLabel: string }[]
}

const GROUPS: Group[] = [
  {
    label: 'Visualisation',
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
    label: 'Other metrics',
    items: [
      { key: 'sharpness_din',        label: 'Sharpness DIN 45692',     fullLabel: 'Sharpness DIN 45692' },
      { key: 'fluctuation_strength', label: 'Fluctuation Strength DW', fullLabel: 'Fluctuation Strength DW' },
      { key: 'tonality_ecma',        label: 'Tonality ECMA-418-2',     fullLabel: 'Tonality ECMA-418-2' },
      { key: 'ipm',                  label: 'IPM',                     fullLabel: 'IPM' },
    ],
  },
]

interface Props {
  value: MetricKey
  onChange: (k: MetricKey) => void
  disabled?: boolean
}

export default function MetricSelector({ value, onChange, disabled }: Props) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as MetricKey)}
      className={clsx(
        'bg-panel border border-border text-xs text-white rounded px-2 py-1.5',
        'focus:outline-none focus:border-teal disabled:opacity-40 cursor-pointer',
        'w-full'
      )}
    >
      {GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((item) => (
            <option key={item.key} value={item.key}>
              {item.fullLabel}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
