import { useRef, useState, useCallback, useEffect } from 'react'

export interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
}

/**
 * Module-level ref updated on every timeupdate — lets NormalView read
 * currentTime in a RAF loop without causing store re-renders at 4 Hz.
 */
export const audioCurrentTimeRef = { current: 0 }

/** The <audio> element of the current file, and callbacks run whenever its time changes (playing, seeking, ending). */
export const audioElementRef: { current: HTMLAudioElement | null } = { current: null }
export const audioTimeListeners = new Set<() => void>()
const notifyTime = () => audioTimeListeners.forEach((f) => f())

export function useAudioPlayer(src: string | null, onError?: () => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
  })

  // Re-create audio element when src changes
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    audioElementRef.current = audio

    const sync = () => {
      audioCurrentTimeRef.current = audio.currentTime
      setState((s) => ({ ...s, currentTime: audio.currentTime, duration: audio.duration || 0 }))
      notifyTime()
    }
    const onEnded = () => {
      audioCurrentTimeRef.current = 0
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
      notifyTime()
    }
    const onLoaded = () => setState((s) => ({ ...s, duration: audio.duration || 0 }))

    audio.addEventListener('timeupdate', sync)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('loadedmetadata', onLoaded)
    const onFail = () => onErrorRef.current?.()
    audio.addEventListener('error', onFail)

    if (src) audio.src = src

    return () => {
      audio.pause()
      audioCurrentTimeRef.current = 0
      if (audioElementRef.current === audio) audioElementRef.current = null
      notifyTime()
      audio.removeEventListener('timeupdate', sync)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onFail)
    }
  }, [src])

  const play = useCallback(() => {
    const a = audioRef.current
    if (a?.error) a.load()          // the stream failed earlier (for example the server was asleep): try again
    a?.play()?.catch(() => setState((s) => ({ ...s, isPlaying: false })))
    setState((s) => ({ ...s, isPlaying: true }))
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setState((s) => ({ ...s, isPlaying: false }))
  }, [])

  const stop = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.pause()
    a.currentTime = 0
    setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
  }, [])

  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t
    setState((s) => ({ ...s, currentTime: t }))
  }, [])

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v
    setState((s) => ({ ...s, volume: v, isMuted: v === 0 }))
  }, [])

  const toggleMute = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    const next = !a.muted
    a.muted = next
    setState((s) => ({ ...s, isMuted: next }))
  }, [])

  return { state, play, pause, stop, seek, setVolume, toggleMute }
}
