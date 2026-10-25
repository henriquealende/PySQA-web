import { useRef, useState, useCallback, useEffect } from 'react'

export interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
}

/** Which of the two files is heard: A is the selected file, B the one it is compared with. */
export type AbSide = 'a' | 'b'

/**
 * Module-level ref updated on every timeupdate — lets NormalView read
 * currentTime in a RAF loop without causing store re-renders at 4 Hz.
 */
export const audioCurrentTimeRef = { current: 0 }

/** The <audio> element being heard, and callbacks run whenever its time changes (playing, seeking, ending). */
export const audioElementRef: { current: HTMLAudioElement | null } = { current: null }
export const audioTimeListeners = new Set<() => void>()
const notifyTime = () => audioTimeListeners.forEach((f) => f())

/**
 * The player of the selected file. With `altSrc` (the file chosen in "Compare with") a second element is kept ready, and
 * `switchTo` changes between the two at the same instant, keeping the time and the play state: an A/B listening test.
 */
export function useAudioPlayer(src: string | null, onError?: () => void, altSrc: string | null = null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)   // A
  const altRef = useRef<HTMLAudioElement | null>(null)     // B
  const sideRef = useRef<AbSide>('a')
  const [side, setSide] = useState<AbSide>('a')
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
  })
  const stateRef = useRef(state)
  stateRef.current = state

  // The element being heard
  const current = () => (sideRef.current === 'b' && altRef.current ? altRef.current : audioRef.current)

  // The same wiring for both elements; only the one being heard drives the time, the progress and the end
  const wire = useCallback((audio: HTMLAudioElement) => {
    const heard = () => audio === current()
    const sync = () => {
      if (!heard()) return
      audioCurrentTimeRef.current = audio.currentTime
      setState((s) => ({ ...s, currentTime: audio.currentTime, duration: audio.duration || 0 }))
      notifyTime()
    }
    const onEnded = () => {
      if (!heard()) return
      audioCurrentTimeRef.current = 0
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
      notifyTime()
    }
    const onLoaded = () => { if (heard()) setState((s) => ({ ...s, duration: audio.duration || 0 })) }
    const onFail = () => { if (heard()) onErrorRef.current?.() }
    audio.volume = stateRef.current.volume
    audio.muted = stateRef.current.isMuted
    audio.addEventListener('timeupdate', sync)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('error', onFail)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', sync)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onFail)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-create the main element when the file changes (and go back to A)
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    altRef.current?.pause()         // a new file: the compared one stops too
    sideRef.current = 'a'
    setSide('a')
    audioElementRef.current = audio
    const unwire = wire(audio)
    if (src) audio.src = src
    return () => {
      unwire()
      audioCurrentTimeRef.current = 0
      if (audioElementRef.current === audio) audioElementRef.current = null
      notifyTime()
    }
  }, [src, wire])

  // The element of the compared file, ready (preloaded) so that switching is immediate
  useEffect(() => {
    if (!altSrc) { altRef.current = null; return }
    const audio = new Audio()
    audio.preload = 'auto'
    audio.src = altSrc
    altRef.current = audio
    const unwire = wire(audio)
    return () => {
      unwire()
      if (altRef.current === audio) altRef.current = null
      if (sideRef.current === 'b') {           // the compared file went away while it was being heard
        sideRef.current = 'a'
        setSide('a')
        const a = audioRef.current
        if (a) { a.currentTime = audio.currentTime; audioElementRef.current = a }
      }
    }
  }, [altSrc, wire])

  const play = useCallback(() => {
    const a = current()
    if (a?.error) a.load()          // the stream failed earlier (for example the server was asleep): try again
    a?.play()?.catch(() => setState((s) => ({ ...s, isPlaying: false })))
    setState((s) => ({ ...s, isPlaying: true }))
  }, [])

  const pause = useCallback(() => {
    current()?.pause()
    setState((s) => ({ ...s, isPlaying: false }))
  }, [])

  const stop = useCallback(() => {
    const a = current()
    if (!a) return
    a.pause()
    a.currentTime = 0
    setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
  }, [])

  const seek = useCallback((t: number) => {
    const a = current()
    if (a) a.currentTime = t
    setState((s) => ({ ...s, currentTime: t }))
  }, [])

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v
    if (altRef.current) altRef.current.volume = v
    setState((s) => ({ ...s, volume: v, isMuted: v === 0 }))
  }, [])

  const toggleMute = useCallback(() => {
    const a = current()
    if (!a) return
    const next = !a.muted
    if (audioRef.current) audioRef.current.muted = next
    if (altRef.current) altRef.current.muted = next
    setState((s) => ({ ...s, isMuted: next }))
  }, [])

  /** Hears the other file from the same point, still playing if it was playing. */
  const switchTo = useCallback((target: AbSide) => {
    const from = current()
    const to = target === 'b' ? altRef.current : audioRef.current
    if (!from || !to || from === to) return
    const wasPlaying = !from.paused
    to.currentTime = Math.min(from.currentTime, Number.isFinite(to.duration) && to.duration > 0 ? to.duration : from.currentTime)
    sideRef.current = target
    audioElementRef.current = to
    if (wasPlaying) void to.play().catch(() => setState((s) => ({ ...s, isPlaying: false })))
    from.pause()
    setSide(target)
    audioCurrentTimeRef.current = to.currentTime
    setState((s) => ({ ...s, currentTime: to.currentTime, duration: to.duration || 0 }))
    notifyTime()
  }, [])

  return { state, play, pause, stop, seek, setVolume, toggleMute, side, switchTo }
}
