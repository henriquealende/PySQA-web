import { useCallback, useEffect, useRef, useState } from 'react'

/** Second-order sections as scipy gives them: [b0, b1, b2, a0, a1, a2]. */
export type Sos = number[][]

const FADE_S = 0.04

/**
 * Plays a file through a filter that can be changed while it plays, to hear what a filter does before applying it.
 *
 * The filter comes from the server as second-order sections (the same ones the real filter uses) and is run `passes`
 * times, which gives the same level per frequency as the zero-phase result that ends up in the file; only the phase differs.
 * The context is made at the sample rate of the file, so the frequencies of the sections are the right ones.
 * A new filter fades in over the old one, so moving a value does not click. "Bypass" plays the file as it is.
 */
export function useLiveFilter(src: string | null, sampleRate: number) {
  const ctxRef = useRef<AudioContext | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const dryRef = useRef<GainNode | null>(null)
  const wetRef = useRef<GainNode | null>(null)
  const chainRef = useRef<{ out: GainNode; nodes: AudioNode[] } | null>(null)
  const pending = useRef<{ sos: Sos; passes: number } | null>(null)
  const bypassRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [bypass, setBypassState] = useState(false)
  const [error, setError] = useState('')

  const buildChain = useCallback((sos: Sos, passes: number) => {
    const ctx = ctxRef.current, source = sourceRef.current, wet = wetRef.current
    if (!ctx || !source || !wet) return
    const nodes: AudioNode[] = []
    for (let p = 0; p < passes; p++) {
      for (const [b0, b1, b2, a0, a1, a2] of sos) nodes.push(ctx.createIIRFilter([b0, b1, b2], [a0, a1, a2]))
    }
    const out = ctx.createGain()
    out.gain.value = 0
    let prev: AudioNode = source
    for (const n of nodes) { prev.connect(n); prev = n }
    prev.connect(out)
    out.connect(wet)

    const old = chainRef.current
    const now = ctx.currentTime
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(1, now + FADE_S)
    if (old) {
      old.out.gain.cancelScheduledValues(now)
      old.out.gain.setValueAtTime(old.out.gain.value, now)
      old.out.gain.linearRampToValueAtTime(0, now + FADE_S)
      window.setTimeout(() => {
        try { source.disconnect(old.nodes[0]) } catch { /* already gone */ }
        old.nodes.forEach(n => n.disconnect())
        old.out.disconnect()
      }, FADE_S * 1000 + 60)
    }
    chainRef.current = { out, nodes }
  }, [])

  // The audio graph is made on the first play (it needs a click), at the sample rate of the file
  const ensure = useCallback(() => {
    if (ctxRef.current || !src) return
    const ctx = new AudioContext({ sampleRate })
    const audio = new Audio(src)
    audio.loop = true
    audio.addEventListener('pause', () => setPlaying(false))
    audio.addEventListener('play', () => setPlaying(true))
    audio.addEventListener('error', () => setError('stream'))
    const source = ctx.createMediaElementSource(audio)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    dry.gain.value = bypassRef.current ? 1 : 0
    wet.gain.value = bypassRef.current ? 0 : 1
    source.connect(dry); dry.connect(ctx.destination)
    wet.connect(ctx.destination)
    ctxRef.current = ctx; audioRef.current = audio; sourceRef.current = source; dryRef.current = dry; wetRef.current = wet
    if (pending.current) buildChain(pending.current.sos, pending.current.passes)
  }, [src, sampleRate, buildChain])

  const toggle = useCallback(() => {
    ensure()
    const a = audioRef.current, ctx = ctxRef.current
    if (!a || !ctx) return
    if (a.paused) { void ctx.resume(); void a.play().catch(() => setError('play')) }
    else a.pause()
  }, [ensure])

  const stop = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.pause()
    a.currentTime = 0
  }, [])

  const setBypass = useCallback((b: boolean) => {
    bypassRef.current = b
    setBypassState(b)
    const ctx = ctxRef.current
    if (!ctx || !dryRef.current || !wetRef.current) return
    dryRef.current.gain.setTargetAtTime(b ? 1 : 0, ctx.currentTime, 0.01)
    wetRef.current.gain.setTargetAtTime(b ? 0 : 1, ctx.currentTime, 0.01)
  }, [])

  const setFilter = useCallback((sos: Sos, passes: number) => {
    pending.current = { sos, passes }
    setError('')
    if (ctxRef.current) buildChain(sos, passes)
  }, [buildChain])

  // Another file, or the modal closing: stop and release everything
  useEffect(() => () => {
    audioRef.current?.pause()
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null; audioRef.current = null; sourceRef.current = null
    dryRef.current = null; wetRef.current = null; chainRef.current = null
  }, [src, sampleRate])

  return { playing, bypass, error, toggle, stop, setBypass, setFilter }
}
