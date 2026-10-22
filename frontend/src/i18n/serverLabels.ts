/** Axis and threshold names that the server sends with a metric result (always in English), mapped to dictionary keys. */
const KEYS: Record<string, string> = {
  'Specific Loudness (sone/Bark)': 'srv.specificLoudness',
  'Specific Loudness ECMA (sone/Bark HMS)': 'srv.specificLoudnessEcma',
  'Specific Sharpness (acum/Bark)': 'srv.specificSharpness',
  'Specific Roughness (asper/Bark)': 'srv.specificRoughness',
  'Specific Roughness ECMA (asper/Bark HMS)': 'srv.specificRoughnessEcma',
  'Specific Fluctuation Strength (vacil/Bark)': 'srv.specificFluctuation',
  'Specific Tonality ECMA (tu/Bark)': 'srv.specificTonality',
  'Impulsive Threshold (5 dB)': 'srv.impulsiveThreshold',
}

export function serverLabel(label: string | undefined, t: (key: string) => string): string | undefined {
  if (!label) return label
  const key = KEYS[label]
  return key ? t(key) : label
}
