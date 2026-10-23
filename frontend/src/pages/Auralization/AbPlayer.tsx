import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '../../i18n'

/**
 * One audio element that switches between the original and the processed version at the same instant, so the two
 * can be compared. `processedUrl` is null while the preview is being made.
 */
export default function AbPlayer({ originalUrl, processedUrl, busy, labels, order, initial = 'processed', onPlayingChange }: {
  originalUrl: string | null; processedUrl: string | null; busy: boolean
  labels?: { processed: string; original: string }       // other names for the two versions
  order?: ('processed' | 'original')[]                    // the order of the two buttons
  initial?: 'processed' | 'original'
  onPlayingChange?: (playing: boolean) => void
}) {
  const t = useT()
  const audio = useRef<HTMLAudioElement>(null)
  const [which, setWhich] = useState<'processed' | 'original'>(initial)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const url = which === 'processed' ? processedUrl : originalUrl
  useEffect(() => { onPlayingChange?.(playing) }, [playing, onPlayingChange])

  // Changing the source keeps the time and the play state, so the switch is heard as an A/B.
  const resume = useRef({ time: 0, play: false })
  const swap = (next: 'processed' | 'original') => {
    const el = audio.current
    resume.current = { time: el?.currentTime ?? 0, play: !!el && !el.paused }
    setWhich(next)
  }
  // A new processed preview (the position or the file changed): back to the start of the stretch, keep playing if it was.
  useEffect(() => {
    resume.current = { time: 0, play: !!audio.current && !audio.current.paused }
  }, [processedUrl])

  useEffect(() => {
    const el = audio.current
    if (!el || !url) return
    el.load()
    const onReady = () => {
      el.currentTime = Math.min(resume.current.time, el.duration || 0)
      if (resume.current.play) void el.play().catch(() => undefined)
    }
    el.addEventListener('loadedmetadata', onReady, { once: true })
    return () => el.removeEventListener('loadedmetadata', onReady)
  }, [url])

  const toggle = () => {
    const el = audio.current
    if (!el || !url) return
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <audio
        ref={audio} src={url ?? undefined} preload="auto"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
      />
      <button
        onClick={toggle} disabled={!url}
        aria-label={playing ? t('aur.ab.pause') : t('aur.ab.play')}
        className="w-9 h-9 rounded-full bg-teal text-dark flex items-center justify-center disabled:opacity-40"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <input
        type="range" min={0} max={dur || 1} step={0.01} value={pos} disabled={!url}
        aria-label={t('aur.ab.seek')}
        onChange={(e) => { const v = Number(e.target.value); if (audio.current) audio.current.currentTime = v; setPos(v) }}
        className="flex-1 min-w-[120px] accent-teal"
      />
      <span className="text-[11px] text-muted tabular-nums w-20 text-right">{pos.toFixed(1)} / {dur.toFixed(1)} s</span>
      <div className="flex rounded overflow-hidden border border-border" role="group" aria-label={t('aur.ab.version')}>
        {(order ?? ['processed', 'original']).map((w) => (
          <button
            key={w} onClick={() => swap(w)} aria-pressed={which === w}
            className={clsx('px-3 py-1 text-xs', which === w ? 'bg-teal text-dark font-semibold' : 'bg-panel text-muted hover:text-white')}
          >
            {labels ? labels[w] : t(w === 'processed' ? 'aur.ab.processed' : 'aur.ab.original')}
          </button>
        ))}
      </div>
      {busy && <span className="text-[11px] text-teal animate-pulse">{t('aur.ab.preparing')}</span>}
    </div>
  )
}
