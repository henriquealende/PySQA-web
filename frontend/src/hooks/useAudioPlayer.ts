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

export function useAudioPlayer(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
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

    const sync = () => {
      audioCurrentTimeRef.current = audio.currentTime
      setState((s) => ({ ...s, currentTime: audio.currentTime, duration: audio.duration || 0 }))
    }
    const onEnded = () => {
      audioCurrentTimeRef.current = 0
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
    }
    const onLoaded = () => setState((s) => ({ ...s, duration: audio.duration || 0 }))

    audio.addEventListener('timeupdate', sync)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('loadedmetadata', onLoaded)

    if (src) audio.src = src

    return () => {
      audio.pause()
      audioCurrentTimeRef.current = 0
      audio.removeEventListener('timeupdate', sync)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [src])

  const play = useCallback(() => {
    audioRef.current?.play()
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
