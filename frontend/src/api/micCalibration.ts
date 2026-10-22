/**
 * Microphone calibrations, kept in this browser (localStorage), one per input device.
 *
 * A calibration is the pressure that a full-scale signal stands for: `calibrationPa` Pa at digital full
 * scale (1.0). It is the same number the server uses (calibration_pa), and it is shown to the user as the
 * sensitivity in mV/Pa for a 1 V full scale, which is how Post-Processing asks for it.
 *
 * It holds as long as the input gain of the device stays the same: changing the microphone volume in the
 * system after calibrating invalidates it.
 */
export interface MicCalibration {
  calibrationPa: number          // Pa at full scale
  sensitivityMvPa: number        // 1000 / calibrationPa (for a 1 V full scale)
  source: 'calibrator' | 'manual'
  levelDb?: number               // the calibrator's level, dB SPL
  freqHz?: number                // and the frequency it was measured at
  at: string                     // ISO date
  deviceLabel: string
}

const KEY = 'pysqa-mic-calibration-v1'

export const sensitivityFromPa = (calibrationPa: number) => 1000 / calibrationPa
export const paFromSensitivity = (sensitivityMvPa: number) => 1000 / sensitivityMvPa

/**
 * The names a device is known by. The browser only shows its real name once the user has allowed the
 * microphone, so a calibration is kept under both the name and the id, and found by either.
 */
export function deviceKeys(devices: { deviceId: string; label: string }[], selected: string): string[] {
  const keys: string[] = []
  const label = devices.find((d) => d.deviceId === selected)?.label?.trim()
  if (label && !/^Microphone \d+$/.test(label)) keys.push(`name:${label}`)      // "Microphone 1" is the stand-in used before names can be read
  keys.push(`id:${selected || 'default'}`)
  return keys
}

function readAll(): Record<string, MicCalibration> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

const valid = (c: MicCalibration | undefined): c is MicCalibration =>
  !!c && Number.isFinite(c.calibrationPa) && c.calibrationPa > 0

export function getCalibration(keys: string[]): MicCalibration | null {
  const all = readAll()
  for (const k of keys) if (valid(all[k])) return all[k]
  return null
}

export function saveCalibration(keys: string[], cal: MicCalibration): boolean {
  try {
    const all = readAll()
    for (const k of keys) all[k] = cal
    localStorage.setItem(KEY, JSON.stringify(all))
    return true
  } catch { return false }
}

export function removeCalibration(keys: string[]): void {
  try {
    const all = readAll()
    for (const k of keys) delete all[k]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* nothing to remove */ }
}
