import { useEffect } from 'react'
import { Play, Pause, Square, Volume2, VolumeX } from 'lucide-react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useStore } from '../store/useStore'
import { useT } from '../i18n'
import clsx from 'clsx'

interface Props {
  src: string | null
  fileName?: string
  altSrc?: string | null   // the file chosen in "Compare with": with it the player switches between the two (A/B)
  altName?: string
  onError?: () => void     // the stream could not be loaded (for example the server forgot the file)
}

function fmtTime(s: number) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return `${m}:${sec}`
}

const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null
  return !!e && (e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName))
}

export default function AudioPlayer({ src, fileName, altSrc = null, altName, onError }: Props) {
  const t = useT()
  const { state, play, pause, stop, seek, setVolume, toggleMute, side, switchTo } = useAudioPlayer(src, onError, altSrc)
  const { isPlaying, currentTime, duration, volume, isMuted } = state
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const setAudioPlayback = useStore((s) => s.setAudioPlayback)
  const hasAb = !!src && !!altSrc

  // Sync play/pause/duration to store (NormalView reads these for cursor)
  useEffect(() => {
    setAudioPlayback(isPlaying, duration)
  }, [isPlaying, duration, setAudioPlayback])

  // Keys A and B choose the file to hear, as long as the cursor is not in a text box
  useEffect(() => {
    if (!hasAb) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'a') switchTo('a')
      else if (k === 'b') switchTo('b')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasAb, switchTo])

  const heard = hasAb && side === 'b' ? altName : fileName

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-panel border-t border-border rounded-b-lg">
      {/* Controls */}
      <div className="flex gap-1 shrink-0">
        <button
          onClick={isPlaying ? pause : play}
          disabled={!src}
          className="p-1.5 rounded bg-teal/20 text-teal hover:bg-teal/30 disabled:opacity-30 transition-colors"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={stop}
          disabled={!src}
          className="p-1.5 rounded hover:bg-white/10 text-muted hover:text-white disabled:opacity-30 transition-colors"
        >
          <Square size={14} />
        </button>
      </div>

      {/* Seek bar */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[11px] text-muted w-8 text-right shrink-0">{fmtTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          disabled={!src}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 h-1 accent-teal disabled:opacity-30 cursor-pointer"
          style={{ accentColor: '#50b89e' }}
        />
        <span className="text-[11px] text-muted w-8 shrink-0">{fmtTime(duration)}</span>
      </div>

      {/* A/B: the selected file against the one in "Compare with" */}
      {hasAb && (
        <div className="flex rounded overflow-hidden border border-border shrink-0" role="group" aria-label={t('pp.player.ab')}>
          {(['a', 'b'] as const).map((s) => (
            <button
              key={s}
              onClick={() => switchTo(s)}
              aria-pressed={side === s}
              title={t(s === 'a' ? 'pp.player.hearA' : 'pp.player.hearB', { name: (s === 'a' ? fileName : altName) ?? '' })}
              className={clsx('px-2.5 py-0.5 text-xs font-semibold transition-colors',
                side === s ? (s === 'a' ? 'bg-teal text-dark' : 'bg-blue-400 text-dark') : 'bg-panel text-muted hover:text-white')}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Volume */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={toggleMute} className="text-muted hover:text-white transition-colors">
          {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-16 h-1 cursor-pointer"
          style={{ accentColor: '#50b89e' }}
        />
      </div>

      {/* File name */}
      {heard && (
        <span className="text-[11px] text-muted truncate max-w-[120px] hidden lg:block" title={heard}>
          {heard}
        </span>
      )}
    </div>
  )
}
