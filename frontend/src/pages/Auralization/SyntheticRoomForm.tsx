import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { useAuralStore } from '../../store/useAuralStore'
import { toast } from '../../store/useToast'
import { useT } from '../../i18n'
import { BANDS } from '../../api/auralizationApi'
import { applySyntheticRoom } from './synthRoom'

/** A room made from numbers: volume, source distance and the reverberation time of each octave band. */
export default function SyntheticRoomForm() {
  const t = useT()
  const sessionId = useStore((s) => s.sessionId)
  const files = useStore((s) => s.files)
  const { sourceId, synth, setSynth, setScene } = useAuralStore()
  const [busy, setBusy] = useState(false)
  const fs = files.find((f) => f.audio_id === sourceId)?.sample_rate ?? 48000

  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }

  const generate = async () => {
    setBusy(true)
    try {
      await applySyntheticRoom(sessionId, fs, t('aur.synth.name'), synth)
      setScene(null)
      toast.success(t('aur.synth.done'))
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const field = 'w-16 bg-dark border border-field rounded px-1.5 py-0.5 text-xs text-right focus:border-teal'
  return (
    <details className="rounded border border-border">
      <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none">{t('aur.synth.title')}</summary>
      <div className="p-3 space-y-3">
        <p className="text-[11px] text-muted">{t('aur.synth.help')}</p>
        <div className="flex flex-wrap gap-4">
          <label className="text-xs text-muted flex items-center gap-2">{t('aur.synth.volume')}
            <input className={field} type="number" min={0.5} max={5000} step={1} value={synth.volume_m3}
              onChange={(e) => setSynth({ volume_m3: num(e.target.value, 0.5, 5000, synth.volume_m3) })} />
          </label>
          <label className="text-xs text-muted flex items-center gap-2">{t('aur.synth.distance')}
            <input className={field} type="number" min={0.1} max={50} step={0.1} value={synth.distance_m}
              onChange={(e) => setSynth({ distance_m: num(e.target.value, 0.1, 50, synth.distance_m) })} />
          </label>
        </div>
        <div>
          <p className="text-[10px] text-muted mb-1">{t('aur.synth.rt')}</p>
          <div className="flex flex-wrap gap-2">
            {BANDS.map((b) => (
              <label key={b} className="text-[11px] text-muted flex flex-col items-center gap-0.5">{b} Hz
                <input className={field} type="number" min={0.02} max={6} step={0.01} value={synth.rt60[b] ?? 0.5}
                  onChange={(e) => setSynth({ rt60: { ...synth.rt60, [b]: num(e.target.value, 0.02, 6, synth.rt60[b] ?? 0.5) } })} />
              </label>
            ))}
          </div>
        </div>
        <button
          onClick={() => void generate()} disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-teal text-teal hover:bg-teal/10 disabled:opacity-40"
        >
          {busy ? t('aur.synth.working') : t('aur.synth.generate')}
        </button>
      </div>
    </details>
  )
}
