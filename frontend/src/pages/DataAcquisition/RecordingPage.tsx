/**
 * Data Acquisition — Phase 1 + 2 + 3 + Análise Comparativa Python
 *
 * Phase 1: device selector, VU meter, MediaRecorder → WAV, send to Post-Processing
 * Phase 2: live FFT spectrum, clipping indicator, download WAV, max duration
 * Phase 3: AudioWorklet (Float32 PCM), pre-roll buffer, level-triggered recording
 * Gap fixes: live waveform, accept/decline gate, fixed duration input, overload protection,
 *            volume/mute playback, CSV export, delete confirmation, trigger edge,
 *            countdown visor, VU peak-hold, FFT average mode, silence stop (any mode)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Mic, Square, Send, Trash2, RefreshCw, Play, Pause,
  ChevronRight, Download, Timer, Zap, Radio, Volume2, VolumeX,
  CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { uploadFiles } from '../../api/audioApi'
import { toast } from '../../store/useToast'
import { saveTake, deleteTake, loadTakes } from '../../api/recordingsStore'
import { useNavigate } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviceInfo { deviceId: string; label: string }
interface Recording  {
  id: string; name: string; blob: Blob; durationSec: number; url: string
  bitDepth: number; sr: number; device: string; capturedAt: string; mode: string
}
type CaptureMode = 'immediate' | 'triggered'
type DurMode     = 'free' | 'fixed'
type TrigEdge    = 'rising' | 'falling'
type RecState    = 'idle' | 'armed' | 'waiting' | 'recording' | 'reviewing' | 'busy'

// ── WAV encoders ──────────────────────────────────────────────────────────────

function encodeWAV16(pcm: Float32Array, sr: number): ArrayBuffer {
  const dataLen = pcm.length * 2
  const buf = new ArrayBuffer(44 + dataLen); const view = new DataView(buf)
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off+i, s.charCodeAt(i)) }
  str(0,'RIFF'); view.setUint32(4,36+dataLen,true); str(8,'WAVE'); str(12,'fmt ')
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true)
  view.setUint32(24,sr,true); view.setUint32(28,sr*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true)
  str(36,'data'); view.setUint32(40,dataLen,true)
  let off=44; for (let i=0;i<pcm.length;i++){const s=Math.max(-1,Math.min(1,pcm[i]));view.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2}
  return buf
}

function encodeWAV32(pcm: Float32Array, sr: number): ArrayBuffer {
  const dataLen = pcm.length * 4
  const buf = new ArrayBuffer(44 + dataLen); const view = new DataView(buf)
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off+i, s.charCodeAt(i)) }
  str(0,'RIFF'); view.setUint32(4,36+dataLen,true); str(8,'WAVE'); str(12,'fmt ')
  view.setUint32(16,16,true); view.setUint16(20,3,true); view.setUint16(22,1,true)
  view.setUint32(24,sr,true); view.setUint32(28,sr*4,true); view.setUint16(32,4,true); view.setUint16(34,32,true)
  str(36,'data'); view.setUint32(40,dataLen,true)
  let off=44; for (let i=0;i<pcm.length;i++){view.setFloat32(off,pcm[i],true);off+=4}
  return buf
}

// ── Utility ───────────────────────────────────────────────────────────────────

const fmtTime = (s: number) =>
  `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
const dbToLinear = (db: number) => Math.pow(10, db/20)

// ── VU Meter — with peak-hold and decay ───────────────────────────────────────

function VUMeter({ analyser, onClip, height = 64 }: { analyser: AnalyserNode|null; onClip:()=>void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // DPR-aware sizing via ResizeObserver
    let W = 0, H = 0
    const ro = new ResizeObserver(entries => {
      const dpr = window.devicePixelRatio || 1
      const rect = entries[0].contentRect
      W = Math.round(rect.width  * dpr)
      H = Math.round(rect.height * dpr)
      canvas.width  = W
      canvas.height = H
    })
    ro.observe(canvas)

    if (!analyser) {
      return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current) }
    }

    const buf = new Float32Array(analyser.fftSize)
    const dpr = window.devicePixelRatio || 1
    // Tick-mark positions on a -60..0 dB scale
    const TICKS = [-60, -48, -36, -24, -18, -12, -6, -3, 0]
    const toX = (db: number) => Math.max(0, Math.min(W, ((db + 60) / 60) * W))
    let peakHold = 0, peakHoldTimer = 0

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      if (W === 0 || H === 0) return
      analyser.getFloatTimeDomainData(buf)
      let peak = 0, sumSq = 0
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]); if (v > peak) peak = v; sumSq += v * v
      }
      const rms    = Math.sqrt(sumSq / buf.length)
      const peakDb = 20 * Math.log10(Math.max(peak, 1e-9))
      const rmsDb  = 20 * Math.log10(Math.max(rms,  1e-9))
      if (peak >= 1.0) onClip()

      // Peak-hold: 18 frames ≈ 600ms at 30fps, then decay
      if (peak > peakHold) { peakHold = peak; peakHoldTimer = 18 }
      else if (peakHoldTimer > 0) peakHoldTimer--
      else peakHold *= 0.97

      const ctx = canvas.getContext('2d')!
      ctx.save(); ctx.scale(dpr, dpr)
      const cw = W / dpr, ch = H / dpr

      // Background
      const BAR_Y = Math.max(12, ch * 0.2), BAR_H = Math.max(14, ch * 0.4)
      ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, cw, ch)
      ctx.fillStyle = '#1c2a38'; ctx.beginPath()
      ;(ctx as any).roundRect(0, BAR_Y, cw, BAR_H, 3); ctx.fill()

      // Colour gradient bar (RMS level)
      const rmsX = toX(rmsDb) / dpr
      if (rmsX > 0) {
        const grad = ctx.createLinearGradient(0, 0, cw, 0)
        grad.addColorStop(0,    '#50b89e')
        grad.addColorStop(0.72, '#ffa94d')
        grad.addColorStop(1,    '#ed693b')
        ctx.fillStyle = grad; ctx.beginPath()
        ;(ctx as any).roundRect(0, BAR_Y, rmsX, BAR_H, 3); ctx.fill()
      }

      // Instant-peak line
      const pkX = toX(peakDb) / dpr
      ctx.fillStyle = peakDb > -3 ? '#ed693b' : 'rgba(255,255,255,0.85)'
      ctx.fillRect(pkX - 1, BAR_Y - 1, 2, BAR_H + 2)

      // Peak-hold line
      const phDb = 20 * Math.log10(Math.max(peakHold, 1e-9))
      const phX  = toX(phDb) / dpr
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(phX - 1, BAR_Y - 1, 2, BAR_H + 2)

      // Tick marks + labels below bar
      const LABEL_Y = BAR_Y + BAR_H + 9
      ctx.font = `${Math.round(9 * dpr) / dpr}px Inter,ui-sans-serif,sans-serif`
      ctx.textAlign = 'center'
      for (const db of TICKS) {
        const tx = toX(db) / dpr
        ctx.strokeStyle = '#3a5570'; ctx.lineWidth = 0.75
        ctx.beginPath(); ctx.moveTo(tx, BAR_Y + BAR_H + 1); ctx.lineTo(tx, BAR_Y + BAR_H + 5); ctx.stroke()
        if (db === 0 || db % 12 === 0 || db === -3 || db === -6) {
          ctx.fillStyle = db >= -3 ? '#ed693b' : '#5a7a94'
          ctx.fillText(db === 0 ? '0' : `${db}`, tx, LABEL_Y)
        }
      }

      // dBFS readout (right-aligned, top of bar)
      ctx.textAlign = 'right'; ctx.fillStyle = peakDb > -3 ? '#ed693b' : '#8ab4c9'
      ctx.font = `bold ${Math.round(10 * dpr) / dpr}px Inter,ui-sans-serif,sans-serif`
      ctx.fillText(`${peakDb.toFixed(1)} dBFS`, cw - 4, BAR_Y - 3)

      ctx.restore()
    }
    draw()
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current) }
  }, [analyser, onClip])

  return (
    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: `${height}px` }} />
  )
}

// ── Live Waveform — rolling window ────────────────────────────────────────────

interface LiveWaveformProps {
  bufRef: React.MutableRefObject<Float32Array>
  posRef: React.MutableRefObject<number>
  sampleRate: number
  windowSec?: number
}

function LiveWaveform({ bufRef, posRef, sampleRate, windowSec = 3 }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    let W = 0, H = 0

    const ro = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      W = Math.round(rect.width  * dpr)
      H = Math.round(rect.height * dpr)
      canvas.width  = W
      canvas.height = H
    })
    ro.observe(canvas)

    const capacity = bufRef.current.length

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      if (W === 0 || H === 0) return
      const buf = bufRef.current
      const pos = posRef.current
      const windowSamples = windowSec * sampleRate
      const displayLen = Math.min(pos, windowSamples)

      const ctx = canvas.getContext('2d')!
      ctx.save(); ctx.scale(dpr, dpr)
      const cw = W / dpr, ch = H / dpr, midY = ch / 2

      ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, cw, ch)

      // Grid lines
      ctx.strokeStyle = '#1e2f40'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(cw, midY); ctx.stroke()
      const y6 = midY - dbToLinear(-6) * midY * 0.9
      ctx.strokeStyle = '#172535'
      ctx.beginPath(); ctx.moveTo(0, y6);       ctx.lineTo(cw, y6);       ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, ch - y6);  ctx.lineTo(cw, ch - y6);  ctx.stroke()

      // dB labels on left
      ctx.fillStyle = '#3a5570'; ctx.font = `9px Inter,ui-sans-serif,sans-serif`; ctx.textAlign = 'left'
      ctx.fillText('0 dBFS', 3, midY - 3)
      ctx.fillText('-6', 3, y6 - 3)

      if (displayLen < 2) { ctx.restore(); return }

      // Waveform: min/max per pixel column, so short peaks and clipping stay visible
      ctx.strokeStyle = '#50b89e'; ctx.lineWidth = 1; ctx.beginPath()
      const start = pos - displayLen
      const clipX: number[] = []
      for (let i = 0; i < cw; i++) {
        const a = Math.floor(start + (i / cw) * displayLen)
        const b = Math.max(a + 1, Math.floor(start + ((i + 1) / cw) * displayLen))
        let lo = Infinity, hi = -Infinity
        for (let s = a; s < b; s++) {
          const v = buf[((s % capacity) + capacity) % capacity]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
        ctx.moveTo(i + 0.5, midY - hi * midY * 0.9)
        ctx.lineTo(i + 0.5, midY - lo * midY * 0.9 + 0.5)
        if (hi >= 0.999 || lo <= -0.999) clipX.push(i + 0.5)
      }
      ctx.stroke()
      ctx.strokeStyle = '#ed693b'; ctx.beginPath()
      for (const x of clipX) { ctx.moveTo(x, 0); ctx.lineTo(x, ch) }
      ctx.stroke()
      ctx.restore()
    }
    draw()
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current) }
  }, [bufRef, posRef, sampleRate, windowSec])

  return (
    <canvas ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '120px' }}
      className="rounded border border-border" />
  )
}

// ── Live FFT — with average mode ──────────────────────────────────────────────

const FFT_SIZE   = 4096
const DB_MIN     = -90
const DB_MAX     = 0
const FREQ_LINES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

function LiveSpectrum({ analyser, sampleRate, thresholdDb, showThreshold, avgMode }: {
  analyser: AnalyserNode|null; sampleRate: number
  thresholdDb?: number; showThreshold?: boolean; avgMode?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    let W = 0, H = 0

    const ro = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      W = Math.round(rect.width  * dpr)
      H = Math.round(rect.height * dpr)
      canvas.width  = W
      canvas.height = H
    })
    ro.observe(canvas)

    if (!analyser) {
      return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current) }
    }

    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = avgMode ? 0 : 0.8
    const buf      = new Float32Array(analyser.frequencyBinCount)
    const fftSum   = new Float32Array(analyser.frequencyBinCount)
    const dispBuf  = new Float32Array(analyser.frequencyBinCount)
    let fftCount   = 0
    const nyq  = sampleRate / 2
    const FMIN = 20, FMAX = nyq

    const freqToX = (f: number, cw: number) => (Math.log10(f / FMIN) / Math.log10(FMAX / FMIN)) * cw
    const dbToY   = (db: number, ch: number) => ch - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * ch

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      if (W === 0 || H === 0 || !analyser) return
      analyser.getFloatFrequencyData(buf)

      if (avgMode) {
        const binHz = nyq / buf.length
        for (let i = 0; i < buf.length; i++) {
          const f = i * binHz; if (f < FMIN || f > FMAX) continue
          fftSum[i] += Math.pow(10, buf[i] / 10)
        }
        fftCount++
        for (let i = 0; i < dispBuf.length; i++)
          dispBuf[i] = fftCount > 0 ? 10 * Math.log10(Math.max(fftSum[i] / fftCount, 1e-30)) : buf[i]
      } else {
        fftCount = 0; fftSum.fill(0)
        for (let i = 0; i < dispBuf.length; i++) dispBuf[i] = buf[i]
      }

      const ctx = canvas.getContext('2d')!
      ctx.save(); ctx.scale(dpr, dpr)
      const cw = W / dpr, ch = H / dpr

      ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, cw, ch)

      // Horizontal dB grid
      for (let db = DB_MIN; db <= DB_MAX; db += 10) {
        const y = dbToY(db, ch)
        ctx.strokeStyle = '#1e2f40'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke()
        if (db !== DB_MIN) {
          ctx.fillStyle = '#3a5570'; ctx.font = '9px Inter,ui-sans-serif,sans-serif'
          ctx.textAlign = 'left'; ctx.fillText(`${db}`, 3, y - 2)
        }
      }

      // Vertical frequency grid
      for (const f of FREQ_LINES) {
        if (f < FMIN || f > FMAX) continue
        const x = freqToX(f, cw)
        ctx.strokeStyle = '#1e2f40'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke()
        ctx.fillStyle = '#3a5570'; ctx.font = '9px Inter,ui-sans-serif,sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, ch - 3)
      }

      // Trigger threshold
      if (showThreshold && thresholdDb !== undefined) {
        const ty = dbToY(thresholdDb, ch)
        ctx.strokeStyle = '#fbbf2480'; ctx.lineWidth = 1; ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(cw, ty); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#fbbf24'; ctx.font = '9px Inter,ui-sans-serif,sans-serif'; ctx.textAlign = 'right'
        ctx.fillText(`trig ${thresholdDb} dB`, cw - 4, ty - 3)
      }

      // Spectrum fill
      const binHz = nyq / dispBuf.length
      const grad  = ctx.createLinearGradient(0, 0, 0, ch)
      grad.addColorStop(0,    '#50b89e')
      grad.addColorStop(0.55, '#50b89e66')
      grad.addColorStop(1,    '#50b89e11')
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, ch)
      let firstFill = true
      for (let i = 1; i < dispBuf.length; i++) {
        const f = i * binHz; if (f < FMIN || f > FMAX) continue
        const x = freqToX(f, cw), y = dbToY(Math.max(DB_MIN, Math.min(DB_MAX, dispBuf[i])), ch)
        if (firstFill) { ctx.lineTo(x, y); firstFill = false } else ctx.lineTo(x, y)
      }
      ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill()

      // Spectrum line
      ctx.strokeStyle = '#50b89e'; ctx.lineWidth = 1.5; ctx.beginPath()
      let first = true
      for (let i = 1; i < dispBuf.length; i++) {
        const f = i * binHz; if (f < FMIN || f > FMAX) continue
        const x = freqToX(f, cw), y = dbToY(Math.max(DB_MIN, Math.min(DB_MAX, dispBuf[i])), ch)
        if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Avg counter label
      if (avgMode && fftCount > 0) {
        ctx.fillStyle = '#50b89e99'; ctx.font = '9px Inter,ui-sans-serif,sans-serif'; ctx.textAlign = 'left'
        ctx.fillText(`avg ${fftCount}`, 4, 12)
      }

      ctx.restore()
    }
    draw()
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current) }
  }, [analyser, sampleRate, thresholdDb, showThreshold, avgMode])

  return (
    <canvas ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '180px' }}
      className="rounded border border-border" />
  )
}

// ── Client-side FFT (Cooley-Tukey, real input) ────────────────────────────────

function clientFFT(pcm: Float32Array, sr: number): { freqs: number[]; magnitudeDb: number[] } {
  let n = 1
  while (n * 2 <= Math.min(pcm.length, 65536)) n *= 2
  const re = new Float64Array(n), im = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = pcm[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)))

  // Bit-reversal permutation
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr }
  }
  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0
      for (let k = 0; k < len >> 1; k++) {
        const uRe = re[i+k], uIm = im[i+k]
        const vRe = re[i+k+(len>>1)]*cRe - im[i+k+(len>>1)]*cIm
        const vIm = re[i+k+(len>>1)]*cIm + im[i+k+(len>>1)]*cRe
        re[i+k] = uRe+vRe; im[i+k] = uIm+vIm
        re[i+k+(len>>1)] = uRe-vRe; im[i+k+(len>>1)] = uIm-vIm
        const nr = cRe*wRe - cIm*wIm; cIm = cRe*wIm + cIm*wRe; cRe = nr
      }
    }
  }
  const halfN = n >> 1
  const step = Math.max(1, Math.floor(halfN / 2048))
  const freqs: number[] = [], magnitudeDb: number[] = []
  for (let i = 1; i < halfN; i += step) {
    freqs.push(i * sr / n)
    magnitudeDb.push(20 * Math.log10(Math.sqrt(re[i]*re[i] + im[i]*im[i]) / (n/2) + 1e-12))
  }
  return { freqs, magnitudeDb }
}

// ── Static Waveform — full signal + playback cursor ───────────────────────────

function StaticWaveform({ pcm, sampleRate, playProgress }: {
  pcm: Float32Array; sampleRate: number; playProgress: number
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wfCacheRef = useRef<ImageData | null>(null)

  // Draw waveform baseline when PCM changes
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(canvas.offsetWidth * dpr) || 600
    const H = Math.round(canvas.offsetHeight * dpr) || 120
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!; ctx.save(); ctx.scale(dpr, dpr)
    const cw = W/dpr, ch = H/dpr, midY = ch/2

    ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, cw, ch)
    ctx.strokeStyle = '#1e2f40'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(cw, midY); ctx.stroke()

    const n = pcm.length
    ctx.strokeStyle = '#50b89e'; ctx.lineWidth = 1; ctx.beginPath()
    const clipX: number[] = []
    for (let i = 0; i < cw; i++) {
      const a = Math.floor((i / cw) * n)
      const b = Math.max(a + 1, Math.floor(((i + 1) / cw) * n))
      let lo = Infinity, hi = -Infinity
      for (let s = a; s < b && s < n; s++) { const v = pcm[s]; if (v < lo) lo = v; if (v > hi) hi = v }
      ctx.moveTo(i + 0.5, midY - hi * midY * 0.9)
      ctx.lineTo(i + 0.5, midY - lo * midY * 0.9 + 0.5)
      if (hi >= 0.999 || lo <= -0.999) clipX.push(i + 0.5)
    }
    ctx.stroke()
    ctx.strokeStyle = '#ed693b'; ctx.beginPath()
    for (const x of clipX) { ctx.moveTo(x, 0); ctx.lineTo(x, ch) }
    ctx.stroke()

    // Duration labels
    const dur = n / sampleRate
    ctx.fillStyle = '#3a5570'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`0 s`, 3, ch - 4)
    ctx.textAlign = 'right'
    ctx.fillText(`${dur.toFixed(1)} s`, cw - 3, ch - 4)

    ctx.restore()
    wfCacheRef.current = ctx.getImageData(0, 0, W, H)
  }, [pcm, sampleRate])

  // Draw cursor overlay on every playProgress tick
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const cache = wfCacheRef.current; if (!cache) return
    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(cache, 0, 0)
    if (playProgress > 0 && playProgress <= 1) {
      const W = canvas.width, H = canvas.height
      const x = playProgress * (W / dpr)
      ctx.save(); ctx.scale(dpr, dpr)
      ctx.strokeStyle = '#ed693b'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H/dpr); ctx.stroke()
      ctx.restore()
    }
  }, [playProgress])

  return (
    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '110px' }}
      className="rounded border border-border" />
  )
}

// ── Static Spectrum — FFT of full recording ───────────────────────────────────

function StaticSpectrum({ pcm, sampleRate }: { pcm: Float32Array; sampleRate: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const { freqs, magnitudeDb } = clientFFT(pcm, sampleRate)

    const dpr = window.devicePixelRatio || 1
    const W = Math.round(canvas.offsetWidth * dpr) || 600
    const H = Math.round(canvas.offsetHeight * dpr) || 140
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!; ctx.save(); ctx.scale(dpr, dpr)
    const cw = W/dpr, ch = H/dpr
    const DB_MIN = -90, DB_MAX = 0, PAD_L = 36, PAD_B = 18, PAD_T = 8, PAD_R = 8

    ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, cw, ch)

    const freqToX = (f: number) => {
      const fMin = freqs[0] || 10, fMax = sampleRate / 2
      return PAD_L + (Math.log10(f / fMin) / Math.log10(fMax / fMin)) * (cw - PAD_L - PAD_R)
    }
    const dbToY = (db: number) => PAD_T + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (ch - PAD_T - PAD_B)

    // Grid lines + freq labels
    const GRID_HZ = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    ctx.strokeStyle = '#1e2d3d'; ctx.lineWidth = 0.5; ctx.font = '8px Inter,sans-serif'
    ctx.fillStyle = '#3a5570'; ctx.textAlign = 'center'
    for (const f of GRID_HZ) {
      if (f > sampleRate / 2) continue
      const x = freqToX(f)
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, ch - PAD_B); ctx.stroke()
      ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x, ch - PAD_B + 10)
    }
    // dB grid
    ctx.textAlign = 'right'
    for (const db of [-80, -60, -40, -20, 0]) {
      const y = dbToY(db)
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(cw - PAD_R, y); ctx.stroke()
      ctx.fillText(`${db}`, PAD_L - 3, y + 3)
    }

    // Spectrum line
    ctx.strokeStyle = '#ed693b'; ctx.lineWidth = 1; ctx.beginPath()
    let first = true
    for (let i = 0; i < freqs.length; i++) {
      const x = freqToX(freqs[i])
      const y = dbToY(Math.max(DB_MIN, magnitudeDb[i]))
      if (first || x < PAD_L) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
    }
    ctx.stroke()

    ctx.restore()
  }, [pcm, sampleRate])

  return (
    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '140px' }}
      className="rounded border border-border" />
  )
}

// ── Badges ────────────────────────────────────────────────────────────────────

function ClipIndicator({ clipping }: { clipping: boolean }) {
  return <div className={`px-2 py-0.5 rounded text-xs font-bold tracking-widest transition-colors ${clipping?'bg-orange text-white':'bg-panel text-border'}`}>CLIP</div>
}
function WorkletBadge({ active }: { active: boolean }) {
  return <div title={active?'AudioWorklet PCM':'MediaRecorder fallback'} className={`px-2 py-0.5 rounded text-xs font-semibold ${active?'bg-teal/20 text-teal':'bg-panel text-muted'}`}>{active?'Worklet':'MediaRec'}</div>
}

// ── Main page ─────────────────────────────────────────────────────────────────

const MAX_SR = 96000

export default function RecordingPage({ active = true }: { active?: boolean }) {
  const { sessionId, addFiles } = useStore()
  const navigate = useNavigate()

  // Device / basic settings
  const [devices,      setDevices]      = useState<DeviceInfo[]>([])
  const [selectedDev,  setSelectedDev]  = useState<string>('default')
  const [sampleRate,   setSampleRate]   = useState<number>(48000)
  const [channels,     setChannels]     = useState<1|2>(1)
  const [bitDepth,     setBitDepth]     = useState<16|32>(16)

  // Duration
  const [durMode,      setDurMode]      = useState<DurMode>('free')
  const [durSeconds,   setDurSeconds]   = useState<number>(30)

  // Averaging
  const [avgEnabled,   setAvgEnabled]   = useState<boolean>(false)
  const [avgTotal,     setAvgTotal]     = useState<number>(3)
  const [avgAutoAccept,setAvgAutoAccept]= useState<boolean>(false)
  const avgTakesRef    = useRef<Float32Array[]>([])       // accumulated PCM buffers
  const avgSrRef       = useRef<number>(48000)
  const [avgCount,     setAvgCount]     = useState<number>(0)  // takes accepted so far

  // Capture mode
  const [captureMode,  setCaptureMode]  = useState<CaptureMode>('immediate')

  // Trigger settings
  const [trigThresh,   setTrigThresh]   = useState<number>(-30)
  const [trigEdge,     setTrigEdge]     = useState<TrigEdge>('rising')
  const [trigPreRoll,  setTrigPreRoll]  = useState<number>(1)
  const [trigHold,     setTrigHold]     = useState<number>(2)

  // Signal protection
  const [overloadOn,   setOverloadOn]   = useState<boolean>(false)
  const [overloadDb,   setOverloadDb]   = useState<number>(-6)
  const [silenceStop,  setSilenceStop]  = useState<boolean>(false)
  const [silenceDur,   setSilenceDur]   = useState<number>(2)

  // FFT display
  const [fftAvg,       setFftAvg]       = useState<boolean>(false)

  // Recording state
  const [recState,     setRecState]     = useState<RecState>('idle')
  const [elapsed,      setElapsed]      = useState(0)
  const [clipping,     setClipping]     = useState(false)
  const [workletActive,setWorkletActive]= useState(false)
  const [analyser,     setAnalyser]     = useState<AnalyserNode|null>(null)

  // Recordings
  const [recordings,   setRecordings]   = useState<Recording[]>([])
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [pendingRec,   setPendingRec]   = useState<Recording|null>(null)
  const [playingId,    setPlayingId]    = useState<string|null>(null)
  const [playVolume,   setPlayVolume]   = useState<number>(0.8)
  const [playMuted,    setPlayMuted]    = useState<boolean>(false)
  const [sendingId,    setSendingId]    = useState<string|null>(null)
  const [deleteConfId, setDeleteConfId] = useState<string|null>(null)
  const [recName,      setRecName]      = useState('')

  // Audio refs
  const streamRef      = useRef<MediaStream|null>(null)
  const audioCtxRef    = useRef<AudioContext|null>(null)
  const workletNodeRef = useRef<AudioWorkletNode|null>(null)
  const pcmChunksRef   = useRef<Float32Array[]>([])
  const mediaChunksRef = useRef<Blob[]>([])
  const mediaRecRef    = useRef<MediaRecorder|null>(null)

  // Waveform display buffer (circular, 3s at max SR)
  const waveBufRef     = useRef<Float32Array>(new Float32Array(3 * MAX_SR))
  const wavePosRef     = useRef<number>(0)

  // Static waveform/spectrum for reviewing + accepted recordings
  const pendingPcmRef      = useRef<{ pcm: Float32Array; sr: number } | null>(null)
  const [selectedRecId,    setSelectedRecId]    = useState<string | null>(null)
  const [selectedPcm,      setSelectedPcm]      = useState<{ pcm: Float32Array; sr: number } | null>(null)
  const [selectedPcmLoading, setSelectedPcmLoading] = useState(false)
  const [playProgress,     setPlayProgress]     = useState(0)
  const playRafRef         = useRef<number>(0)

  // Timer refs
  const timerRef       = useRef<ReturnType<typeof setInterval>|null>(null)
  const maxDurRef      = useRef<ReturnType<typeof setTimeout>|null>(null)
  const trigPollRef    = useRef<ReturnType<typeof setInterval>|null>(null)
  const clipTimerRef   = useRef<ReturnType<typeof setTimeout>|null>(null)
  const silPollRef     = useRef<ReturnType<typeof setInterval>|null>(null)

  // Stable refs for closures
  const audioElRef     = useRef<HTMLAudioElement|null>(null)
  const startTimeRef   = useRef<number>(0)
  const recNameRef     = useRef<string>('')
  const recStateRef    = useRef<RecState>('idle')
  const overloadOnRef  = useRef<boolean>(false)
  const overloadDbRef  = useRef<number>(-6)
  const selectedDevRef = useRef<string>('default')
  const captureModeRef = useRef<CaptureMode>('immediate')

  useEffect(() => { recNameRef.current   = recName },     [recName])
  useEffect(() => { recStateRef.current  = recState },    [recState])
  useEffect(() => { overloadOnRef.current= overloadOn },  [overloadOn])
  useEffect(() => { overloadDbRef.current= overloadDb },  [overloadDb])
  useEffect(() => { selectedDevRef.current = selectedDev }, [selectedDev])
  useEffect(() => { captureModeRef.current = captureMode }, [captureMode])

  // ── Takes kept in this browser ──────────────────────────────────────────────
  // Accepted recordings are saved in IndexedDB, so leaving the page or reloading does not lose them.
  useEffect(() => {
    let alive = true
    loadTakes().then(stored => {
      if (!alive || !stored.length) return
      setRecordings(prev => {
        const have = new Set(prev.map(r => r.id))
        const restored = stored.filter(t => !have.has(t.id)).map(t => ({ ...t, url: URL.createObjectURL(t.blob) }))
        return [...restored, ...prev]
      })
    })
    return () => { alive = false }
  }, [])

  // Warn before closing the tab or reloading with a take that has not been kept yet
  const hasUnsaved = ['waiting', 'recording', 'busy', 'reviewing'].includes(recState) || avgCount > 0 || !!pendingRec
  useEffect(() => {
    if (!hasUnsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  // The page stays mounted while the user visits other pages (see Layout): stop playback when hidden
  useEffect(() => {
    if (!active) { audioElRef.current?.pause(); setPlayingId(null) }
  }, [active])

  // Tell the rest of the app whether the microphone is in use (the navigation shows a dot)
  useEffect(() => {
    useStore.getState().setDaqState(recState === 'recording' ? 'recording' : ['armed', 'waiting'].includes(recState) ? 'monitoring' : 'idle')
  }, [recState])
  useEffect(() => () => useStore.getState().setDaqState('idle'), [])

  // Settings fold away once the microphone is open and come back when it closes
  useEffect(() => {
    if (recState === 'armed') setSettingsOpen(false)
    if (recState === 'idle') setSettingsOpen(true)
  }, [recState])

  // ── Play-cursor RAF loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!playingId) { setPlayProgress(0); return }
    const tick = () => {
      const el = audioElRef.current
      if (el && el.duration > 0) setPlayProgress(el.currentTime / el.duration)
      playRafRef.current = requestAnimationFrame(tick)
    }
    playRafRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(playRafRef.current); setPlayProgress(0) }
  }, [playingId])

  // ── Clip latch ──────────────────────────────────────────────────────────────

  const handleClip = useCallback(() => {
    setClipping(true)
    if (clipTimerRef.current) clearTimeout(clipTimerRef.current)
    clipTimerRef.current = setTimeout(() => setClipping(false), 2000)
  }, [])

  // ── Enumerate devices ───────────────────────────────────────────────────────

  // Listing devices needs no permission (names stay blank until it is granted), so
  // opening the page never triggers the browser's microphone prompt.
  const listDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const all = await navigator.mediaDevices.enumerateDevices()
    const inputs = all.filter(d=>d.kind==='audioinput')
      .map((d,i)=>({ deviceId: d.deviceId, label: d.label||`Microphone ${i+1}` }))
    setDevices(inputs)
    if (inputs.length>0 && !inputs.find(d=>d.deviceId===selectedDevRef.current))
      setSelectedDev(inputs[0].deviceId)
  }, [])

  // Explicit user action (Refresh button): ask for access so the device names can be read.
  const refreshDevices = useCallback(async () => {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true })
      tmp.getTracks().forEach(t=>t.stop())
      await listDevices()
    } catch (e: any) {
      toast.error(e?.name === 'NotAllowedError'
        ? 'Microphone blocked. Allow it in the browser site settings, then press Refresh.'
        : 'Could not read the microphone list: ' + (e?.message ?? e))
    }
  }, [listDevices])

  useEffect(() => { listDevices().catch(() => {}) }, [listDevices])

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    stopStream(); clearAllTimers()
    recordings.forEach(r=>URL.revokeObjectURL(r.url))
    if (pendingRec) URL.revokeObjectURL(pendingRec.url)
  }, [])

  const clearAllTimers = () => {
    [timerRef,maxDurRef,trigPollRef,clipTimerRef,silPollRef].forEach(r => {
      if (r.current) { r.current instanceof Object && 'hasRef' in r ? clearInterval(r.current as any) : clearTimeout(r.current as any); r.current = null }
    })
    if (timerRef.current)    { clearInterval(timerRef.current);  timerRef.current    = null }
    if (maxDurRef.current)   { clearTimeout(maxDurRef.current);  maxDurRef.current   = null }
    if (trigPollRef.current) { clearInterval(trigPollRef.current); trigPollRef.current = null }
    if (clipTimerRef.current){ clearTimeout(clipTimerRef.current); clipTimerRef.current = null }
    if (silPollRef.current)  { clearInterval(silPollRef.current); silPollRef.current  = null }
  }

  // ── Stream helpers ───────────────────────────────────────────────────────────

  const stopStream = () => {
    workletNodeRef.current?.port.postMessage({ type: 'stop' })
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null
    streamRef.current?.getTracks().forEach(t=>t.stop())
    streamRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    setAnalyser(null); setWorkletActive(false)
  }

  // ── Arm stream ───────────────────────────────────────────────────────────────

  const armStream = async () => {
    setRecState('armed')
    wavePosRef.current = 0
    try {
      // Build constraints with progressive fallback for mobile compatibility.
      // - Use { ideal } (not { exact }) for deviceId: exact fails on 'default' and
      //   on browsers that enumerate device IDs differently (iOS Safari, Android).
      // - Some mobile browsers reject sampleRate/channelCount constraints entirely,
      //   so on failure we retry with bare { audio: true }.
      const audioConstraints: MediaTrackConstraints = {
        deviceId:         selectedDev && selectedDev !== 'default' ? { ideal: selectedDev } : undefined,
        sampleRate:       { ideal: sampleRate },
        channelCount:     { ideal: channels },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false,
      }
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      } catch {
        // Retry with minimal constraints (mobile fallback)
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      streamRef.current = stream
      listDevices().catch(() => {})   // permission is granted now: device names become readable
      const ctx = new AudioContext({ sampleRate })
      audioCtxRef.current = ctx
      // Mobile browsers (iOS Safari, some Android) start AudioContext suspended
      // even inside a user-gesture handler — resume explicitly before using it.
      if (ctx.state === 'suspended') await ctx.resume()
      const src  = ctx.createMediaStreamSource(stream)
      const node = ctx.createAnalyser(); node.fftSize = FFT_SIZE
      src.connect(node)
      setAnalyser(node)

      let useWorklet = false
      try {
        await ctx.audioWorklet.addModule('/recorder-processor.js')
        const wn = new AudioWorkletNode(ctx, 'recorder-processor', {
          processorOptions: { preRollSec: trigPreRoll },
          channelCount: 1, channelCountMode: 'explicit',
        })
        src.connect(wn)
        workletNodeRef.current = wn

        wn.port.onmessage = (e) => {
          const msg = e.data
          if (msg.type === 'chunk') {
            const chunk = new Float32Array(msg.data)
            pcmChunksRef.current.push(chunk)
            // Feed waveform display ring buffer
            const cap = waveBufRef.current.length
            for (let i=0;i<chunk.length;i++) {
              waveBufRef.current[wavePosRef.current % cap] = chunk[i]
              wavePosRef.current++
            }
          } else if (msg.type === 'level') {
            if (msg.peak >= 1.0) handleClip()
            if (overloadOnRef.current && recStateRef.current === 'recording') {
              const thresh = dbToLinear(overloadDbRef.current)
              if (msg.peak >= thresh) {
                toast.error(`Overload! Peak ${(20*Math.log10(msg.peak)).toFixed(1)} dBFS — take discarded`)
                discardCurrentRecording()
              }
            }
          }
        }
        useWorklet = true
      } catch { /* AudioWorklet unavailable */ }
      setWorkletActive(useWorklet)
    } catch (e: any) {
      toast.error('Cannot open device: ' + e.message)
      setRecState('idle')
    }
  }

  // ── Start recording ───────────────────────────────────────────────────────────

  const startRecording = () => {
    startTimeRef.current = Date.now()
    pcmChunksRef.current = []; mediaChunksRef.current = []
    setElapsed(0); setRecState('recording')

    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'start' })
    } else {
      const stream = streamRef.current!
      const mimeType = ['audio/webm;codecs=pcm','audio/webm','audio/ogg','audio/mp4']
        .find(m=>MediaRecorder.isTypeSupported(m)) ?? ''
      const rec = new MediaRecorder(stream, mimeType?{mimeType}:{})
      rec.ondataavailable = e => { if(e.data.size>0) mediaChunksRef.current.push(e.data) }
      rec.onstop = finalizeMediaRecorder
      mediaRecRef.current = rec; rec.start(100)
    }

    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-startTimeRef.current)/1000)), 500)

    // Fixed duration timer
    if (durMode === 'fixed' && durSeconds > 0) {
      maxDurRef.current = setTimeout(() => {
        toast.info(`Duration ${fmtTime(durSeconds)} reached`)
        stopRecording()
      }, durSeconds*1000)
    }

    // Silence-stop poll (any mode)
    if (silenceStop) startSilencePoll()
  }

  const stopRecording = () => {
    if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null }
    if (maxDurRef.current) { clearTimeout(maxDurRef.current);  maxDurRef.current = null }
    if (trigPollRef.current){ clearInterval(trigPollRef.current); trigPollRef.current = null }
    if (silPollRef.current) { clearInterval(silPollRef.current); silPollRef.current = null }
    setRecState('busy')
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' })
      setTimeout(() => finalizeWorklet(), 120)
    } else if (mediaRecRef.current?.state === 'recording') {
      mediaRecRef.current.stop()
    } else {
      // The capture was cut (device lost, stream closed): keep what was recorded so far instead of hanging in 'busy'
      void finalizeWorklet()
    }
  }

  const discardCurrentRecording = () => {
    if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null }
    if (maxDurRef.current) { clearTimeout(maxDurRef.current);  maxDurRef.current = null }
    if (silPollRef.current) { clearInterval(silPollRef.current); silPollRef.current = null }
    workletNodeRef.current?.port.postMessage({ type: 'stop' })
    pcmChunksRef.current = []
    stopStream(); setRecState('idle')
  }

  // ── Silence-stop poll ─────────────────────────────────────────────────────────

  const startSilencePoll = () => {
    const threshLin = dbToLinear(-50) // fixed silence threshold
    let silSince = 0
    silPollRef.current = setInterval(() => {
      if (recStateRef.current !== 'recording') { clearInterval(silPollRef.current!); silPollRef.current=null; return }
      const an = analyser
      if (!an) return
      const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b)
      let pk=0; for(let i=0;i<b.length;i++){const v=Math.abs(b[i]);if(v>pk)pk=v}
      if (pk < threshLin) { silSince += 100; if (silSince >= silenceDur*1000) { toast.info(`Silence for ${silenceDur}s — stopping`); stopRecording() } }
      else silSince = 0
    }, 100)
  }

  // ── Finalize: Worklet path ────────────────────────────────────────────────────

  const finalizeWorklet = async () => {
    const chunks = pcmChunksRef.current
    const totalLen = chunks.reduce((s,c)=>s+c.length, 0)
    if (totalLen === 0) { stopStream(); setRecState('idle'); return }
    const pcm = new Float32Array(totalLen); let off=0
    for (const c of chunks) { pcm.set(c,off); off+=c.length }
    const sr = audioCtxRef.current?.sampleRate ?? sampleRate
    buildRecording(pcm, sr)
  }

  // ── Finalize: MediaRecorder fallback ──────────────────────────────────────────

  const finalizeMediaRecorder = async () => {
    const blob = new Blob(mediaChunksRef.current, { type: mediaChunksRef.current[0]?.type??'audio/webm' })
    try {
      const ab = await blob.arrayBuffer()
      const ctx = new AudioContext(); const decoded = await ctx.decodeAudioData(ab); await ctx.close()
      const len = decoded.length, sr = decoded.sampleRate, nCh = decoded.numberOfChannels
      let pcm: Float32Array
      if (nCh===1) { pcm = decoded.getChannelData(0) }
      else { const L=decoded.getChannelData(0),R=decoded.getChannelData(1); pcm=new Float32Array(len); for(let i=0;i<len;i++) pcm[i]=(L[i]+R[i])/2 }
      buildRecording(pcm, sr)
    } catch(e:any) { toast.error('Encode failed: '+e.message); stopStream(); setRecState('idle') }
  }

  // ── Build recording object → reviewing state ──────────────────────────────────

  const buildRecording = (pcm: Float32Array, sr: number) => {
    pendingPcmRef.current = { pcm, sr }  // save for static waveform/spectrum
    const wavBuf  = bitDepth===32 ? encodeWAV32(pcm,sr) : encodeWAV16(pcm,sr)
    const wavBlob = new Blob([wavBuf], { type:'audio/wav' })
    const url     = URL.createObjectURL(wavBlob)
    const durSec  = Math.floor((Date.now()-startTimeRef.current)/1000)
    const rawName = recNameRef.current.trim()
    const name    = rawName ? `${rawName}.wav` : `Recording_${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.wav`
    const devLabel = devices.find(d=>d.deviceId===selectedDevRef.current)?.label ?? selectedDevRef.current
    const rec: Recording = {
      id: crypto.randomUUID(), name, blob: wavBlob, durationSec: durSec, url,
      bitDepth, sr, device: devLabel, capturedAt: new Date().toISOString(),
      mode: captureModeRef.current,
    }
    setPendingRec(rec)
    stopStream()
    setRecState('reviewing')
  }

  // ── Accept / Decline ─────────────────────────────────────────────────────────

  // ── Average PCM stacks ─────────────────────────────────────────────────────

  const buildAveragedRecording = (takes: Float32Array[], sr: number, name: string) => {
    const minLen = Math.min(...takes.map(t => t.length))
    const avg = new Float32Array(minLen)
    for (const take of takes) for (let i = 0; i < minLen; i++) avg[i] += take[i] / takes.length
    buildRecording(avg, sr)
    // Override name that buildRecording would set from recNameRef
    pendingPcmRef.current = { pcm: avg, sr }
    // We build a final recording object manually over the pending one
    const wavBuf  = bitDepth===32 ? encodeWAV32(avg, sr) : encodeWAV16(avg, sr)
    const wavBlob = new Blob([wavBuf], { type: 'audio/wav' })
    const url     = URL.createObjectURL(wavBlob)
    const durSec  = Math.round(minLen / sr)
    const devLabel = devices.find(d=>d.deviceId===selectedDevRef.current)?.label ?? selectedDevRef.current
    const rec: Recording = {
      id: crypto.randomUUID(), name, blob: wavBlob, durationSec: durSec, url,
      bitDepth, sr, device: devLabel, capturedAt: new Date().toISOString(),
      mode: `${takes.length}-take average`,
    }
    setPendingRec(rec); pendingPcmRef.current = { pcm: avg, sr }
    stopStream(); setRecState('reviewing')
  }

  // Add a take to the list and keep a copy of it in this browser
  const keepTake = (rec: Recording) => {
    setRecordings(prev => [...prev, rec])
    saveTake({
      id: rec.id, name: rec.name, blob: rec.blob, durationSec: rec.durationSec, bitDepth: rec.bitDepth,
      sr: rec.sr, device: rec.device, capturedAt: rec.capturedAt, mode: rec.mode,
    }).then(ok => {
      if (!ok) toast.info("Couldn't keep a copy of this recording in the browser: send it to Post-Processing or download it before leaving.")
    })
  }

  const acceptRecording = () => {
    if (!pendingRec) return

    // If this is the final averaged result, save it directly
    if (pendingRec.mode.includes('average') && avgTakesRef.current.length === 0) {
      keepTake(pendingRec)
      setPendingRec(null); pendingPcmRef.current = null; setRecName(''); setRecState('idle')
      toast.success(`"${pendingRec.name}" saved`)
      return
    }

    if (avgEnabled) {
      // Store this take's PCM
      if (pendingPcmRef.current) {
        avgTakesRef.current.push(new Float32Array(pendingPcmRef.current.pcm))
        avgSrRef.current = pendingPcmRef.current.sr
      }
      const newCount = avgTakesRef.current.length
      setAvgCount(newCount)
      URL.revokeObjectURL(pendingRec.url)
      setPendingRec(null); pendingPcmRef.current = null

      if (newCount >= avgTotal) {
        // All takes collected — compute average
        toast.info(`${avgTotal} takes collected — computing average`)
        const takes = avgTakesRef.current.slice()
        const sr    = avgSrRef.current
        const rawName = recNameRef.current.trim()
        const name = rawName
          ? `${rawName}_avg${avgTotal}.wav`
          : `Recording_avg${avgTotal}_${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.wav`
        avgTakesRef.current = []; setAvgCount(0)
        buildAveragedRecording(takes, sr, name)
        return
      }

      // More takes needed
      toast.success(`Take ${newCount}/${avgTotal} accepted`)
      setRecState('idle')
      if (avgAutoAccept) {
        // Automatically start next take
        setTimeout(() => armStream(), 300)
      }
    } else {
      keepTake(pendingRec)
      setPendingRec(null); pendingPcmRef.current = null; setRecName(''); setRecState('idle')
      toast.success(`"${pendingRec.name}" saved`)
    }
  }

  const declineRecording = () => {
    if (pendingRec) URL.revokeObjectURL(pendingRec.url)
    setPendingRec(null); pendingPcmRef.current = null; setRecName(''); setRecState('idle')
    toast.info('Take discarded')
  }

  const cancelAveraging = () => {
    avgTakesRef.current = []; setAvgCount(0)
    toast.info('Averaging session cancelled')
  }

  // ── Select recording for waveform/spectrum view ──────────────────────────────

  const selectRecording = async (rec: Recording) => {
    if (selectedRecId === rec.id) { setSelectedRecId(null); setSelectedPcm(null); return }
    setSelectedRecId(rec.id); setSelectedPcm(null); setSelectedPcmLoading(true)
    try {
      const ab = await rec.blob.arrayBuffer()
      const ctx = new AudioContext(); const decoded = await ctx.decodeAudioData(ab); await ctx.close()
      const raw = decoded.getChannelData(0)
      setSelectedPcm({ pcm: new Float32Array(raw), sr: decoded.sampleRate })
    } catch { toast.error('Could not decode recording for preview') }
    finally { setSelectedPcmLoading(false) }
  }

  // ── Level trigger ─────────────────────────────────────────────────────────────

  const startWaiting = () => {
    if (!analyser) return
    setRecState('waiting')
    workletNodeRef.current?.port.postMessage({ type:'config', preRollSec: trigPreRoll })
    const threshLin = dbToLinear(trigThresh)
    let wasAbove = false; let holdSince = 0

    trigPollRef.current = setInterval(() => {
      if (recStateRef.current === 'recording') return
      const b = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b)
      let pk=0; for(let i=0;i<b.length;i++){const v=Math.abs(b[i]);if(v>pk)pk=v}

      if (recStateRef.current === 'waiting') {
        const fired = trigEdge==='rising'
          ? (pk >= threshLin && !wasAbove)
          : (pk < threshLin && wasAbove)
        wasAbove = pk >= threshLin
        if (fired) {
          clearInterval(trigPollRef.current!); trigPollRef.current=null
          toast.info('Trigger fired — recording')
          startRecording()
          // Hold detector
          trigPollRef.current = setInterval(() => {
            const b2=new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b2)
            let pk2=0; for(let i=0;i<b2.length;i++){const v=Math.abs(b2[i]);if(v>pk2)pk2=v}
            if (pk2<threshLin){holdSince+=100;if(holdSince>=trigHold*1000){clearInterval(trigPollRef.current!);trigPollRef.current=null;toast.info(`${trigHold}s silence — stopping`);stopRecording()}}
            else holdSince=0
          }, 100)
        }
      }
    }, 50)
  }

  const cancelWaiting = () => {
    if (trigPollRef.current){clearInterval(trigPollRef.current);trigPollRef.current=null}
    stopStream(); setRecState('idle')
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────

  const exportCSV = async (rec: Recording) => {
    try {
      const ab  = await rec.blob.arrayBuffer()
      const ctx = new AudioContext(); const decoded = await ctx.decodeAudioData(ab); await ctx.close()
      const pcm = decoded.getChannelData(0), sr = decoded.sampleRate
      const MAX_PTS = 500_000
      const step = Math.max(1, Math.floor(pcm.length/MAX_PTS))
      const lines: string[] = [
        '# PySQA Data Acquisition Export',
        `# Name: ${rec.name}`,
        `# Device: ${rec.device}`,
        `# Captured: ${rec.capturedAt}`,
        `# Mode: ${rec.mode}`,
        `# Sample Rate: ${sr} Hz`,
        `# Bit Depth: ${rec.bitDepth}`,
        `# Duration: ${rec.durationSec} s`,
        `# Samples: ${pcm.length}`,
        step>1 ? `# (decimated ${step}x for export, ${Math.ceil(pcm.length/step)} rows)` : '',
        'Time (s),Amplitude',
      ].filter(Boolean)
      for (let i=0; i<pcm.length; i+=step) lines.push(`${(i/sr).toFixed(6)},${pcm[i].toFixed(8)}`)
      const blob = new Blob([lines.join('\n')], { type:'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href=url; a.download=rec.name.replace('.wav','.csv'); a.click()
      URL.revokeObjectURL(url)
    } catch(e:any) { toast.error('CSV export failed: '+e.message) }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  const togglePlay = (rec: Recording) => {
    if (playingId===rec.id) { audioElRef.current?.pause(); setPlayingId(null) }
    else {
      audioElRef.current?.pause()
      const el = new Audio(rec.url)
      el.volume = playMuted ? 0 : playVolume
      el.onended = () => setPlayingId(null); el.play()
      audioElRef.current = el; setPlayingId(rec.id)
    }
  }

  useEffect(() => {
    if (audioElRef.current) audioElRef.current.volume = playMuted ? 0 : playVolume
  }, [playVolume, playMuted])

  // ── Send / download / delete ──────────────────────────────────────────────────

  const sendToPostProcessing = async (rec: Recording) => {
    setSendingId(rec.id)
    try {
      const uploaded = await uploadFiles(sessionId, [new File([rec.blob], rec.name, {type:'audio/wav'})])
      addFiles(uploaded); toast.success(`"${rec.name}" → Post-Processing`); navigate('/post-processing')
    } catch(e:any) { toast.error('Send failed: '+e.message) }
    finally { setSendingId(null) }
  }

  const downloadRecording = (rec: Recording) => {
    const a=document.createElement('a'); a.href=rec.url; a.download=rec.name; a.click()
  }

  const deleteRecording = (id: string) => {
    setRecordings(prev => { const r=prev.find(x=>x.id===id); if(r) URL.revokeObjectURL(r.url); return prev.filter(x=>x.id!==id) })
    setDeleteConfId(null)
    void deleteTake(id)
    if (playingId===id) { audioElRef.current?.pause(); setPlayingId(null) }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────

  const isActive    = ['armed','waiting','recording'].includes(recState)
  const isRecording = recState === 'recording'
  const isArmed     = recState === 'armed'
  const isWaiting   = recState === 'waiting'
  const isBusy      = recState === 'busy'
  const isReviewing = recState === 'reviewing'

  // Countdown logic: if fixed duration, show remaining time
  const displayTime = durMode==='fixed' && isRecording
    ? Math.max(0, durSeconds - elapsed)
    : elapsed
  const isCountdown = durMode==='fixed' && isRecording

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-4 gap-4 text-white">

      {/* Title */}
      <div className="flex items-center gap-2">
        <Mic size={18} className="text-teal" />
        <h1 className="text-base font-semibold">Data Acquisition</h1>
      </div>

      {/* ── Sticky transport bar: Record, Stop, time and level stay in reach while scrolling ── */}
      <div className="sticky -top-4 z-20 -mx-4 px-4 py-2 bg-dark/95 backdrop-blur border-b border-border flex flex-col gap-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            {recState==='idle' && (
              <button onClick={armStream}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-teal/20 text-teal text-sm font-medium hover:bg-teal/30 transition-colors">
                <Mic size={14}/> Monitor
              </button>
            )}
            {isArmed && captureMode==='immediate' && (<>
              <button onClick={startRecording}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-orange text-white text-sm font-medium hover:bg-orange/80 transition-colors">
                <span className="w-2.5 h-2.5 rounded-full bg-white"/> Record
              </button>
              <button onClick={()=>{stopStream();setRecState('idle')}}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel border border-border text-muted text-sm hover:text-white transition-colors">
                Cancel
              </button>
            </>)}
            {isArmed && captureMode==='triggered' && (<>
              <button onClick={startWaiting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-amber/20 text-amber text-sm font-medium hover:bg-amber/30 transition-colors">
                <Zap size={14}/> Watch
              </button>
              <button onClick={()=>{stopStream();setRecState('idle')}}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel border border-border text-muted text-sm hover:text-white transition-colors">
                Cancel
              </button>
            </>)}
            {isWaiting && (
              <button onClick={cancelWaiting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel border border-amber/40 text-amber text-sm hover:bg-amber/10 transition-colors">
                <Square size={13} fill="currentColor"/> Cancel
              </button>
            )}
            {isRecording && (
              <button onClick={stopRecording}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-panel border border-border text-white text-sm font-medium hover:bg-orange/20 hover:border-orange/50 transition-colors">
                <Square size={13} fill="currentColor"/> Stop
              </button>
            )}
            {isBusy && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <RefreshCw size={13} className="animate-spin"/> Encoding WAV…
              </div>
            )}
            {isReviewing && pendingRec && (<>
              <button onClick={acceptRecording}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-teal text-dark text-sm font-semibold hover:bg-teal/80 transition-colors">
                <CheckCircle size={14}/> Accept
              </button>
              <button onClick={declineRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel border border-orange/40 text-orange text-sm font-medium hover:bg-orange/10 transition-colors">
                <XCircle size={14}/> Discard
              </button>
            </>)}
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-orange animate-pulse"/>
              <span className="text-sm font-mono text-orange">{fmtTime(displayTime)}</span>
              {isCountdown && <span className="text-xs text-muted">remaining</span>}
              {!isCountdown && durMode==='fixed' && <span className="text-xs text-muted">/ {fmtTime(durSeconds)}</span>}
            </div>
          )}

          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider shrink-0">Level</span>
            <div className="flex-1"><VUMeter analyser={analyser} onClip={handleClip} height={48}/></div>
            <ClipIndicator clipping={clipping}/>
            <WorkletBadge active={workletActive}/>
          </div>
        </div>
        {isRecording && durMode==='fixed' && (
          <div className="h-1 bg-panel rounded overflow-hidden">
            <div className="h-full bg-orange transition-all" style={{width:`${Math.min(100,(elapsed/durSeconds)*100)}%`}}/>
          </div>
        )}
      </div>

      {/* ── Device + Settings (fold away while the microphone is open) ── */}
      <div className="bg-surface border border-border rounded-lg">
        <button type="button" onClick={() => setSettingsOpen(o => !o)} aria-expanded={settingsOpen}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
          <ChevronRight size={14} className={`shrink-0 text-muted transition-transform ${settingsOpen ? 'rotate-90' : ''}`}/>
          <span className="text-xs font-semibold text-muted uppercase tracking-wider shrink-0">Settings</span>
          <span className="text-xs text-muted truncate">
            {(sampleRate/1000).toFixed(1)} kHz · {channels===1?'Mono':'Stereo→Mono'} · {bitDepth}-bit · {captureMode==='immediate'?'Immediate':'Level trigger'}{durMode==='fixed'?` · ${durSeconds} s`:''}{avgEnabled?` · average of ${avgTotal}`:''}
          </span>
        </button>
        {settingsOpen && (
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Input Device</span>
          <button onClick={refreshDevices} className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors">
            <RefreshCw size={11}/> Refresh
          </button>
        </div>

        <select value={selectedDev} onChange={e=>setSelectedDev(e.target.value)} disabled={isActive}
          className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal disabled:opacity-50">
          {devices.length===0 && <option value="default">Default microphone</option>}
          {devices.map(d=><option key={d.deviceId} value={d.deviceId} title={d.label}>{d.label}</option>)}
        </select>

        {/* Row 1: SR / Channels / Bit depth */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex flex-col gap-1 flex-1 min-w-24">
            <label className="text-xs text-muted">Sample Rate</label>
            <select value={sampleRate} onChange={e=>setSampleRate(Number(e.target.value))} disabled={isActive}
              className="bg-panel border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal disabled:opacity-50">
              <option value={44100}>44 100 Hz</option>
              <option value={48000}>48 000 Hz</option>
              <option value={96000}>96 000 Hz</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-24">
            <label className="text-xs text-muted">Channels</label>
            <select value={channels} onChange={e=>setChannels(Number(e.target.value) as 1|2)} disabled={isActive}
              className="bg-panel border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal disabled:opacity-50">
              <option value={1}>Mono</option>
              <option value={2}>Stereo→Mono</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-24">
            <label className="text-xs text-muted">Bit Depth</label>
            <select value={bitDepth} onChange={e=>setBitDepth(Number(e.target.value) as 16|32)} disabled={isActive}
              className="bg-panel border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal disabled:opacity-50">
              <option value={16}>16-bit PCM</option>
              <option value={32}>32-bit Float</option>
            </select>
          </div>
        </div>

        {/* Duration */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted flex items-center gap-1"><Timer size={10}/> Duration</label>
            <div className="flex gap-1 p-0.5 bg-panel rounded border border-border">
              {(['free','fixed'] as DurMode[]).map(m=>(
                <button key={m} onClick={()=>setDurMode(m)} disabled={isRecording}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${durMode===m?'bg-teal/20 text-teal':'text-muted hover:text-white'}`}>
                  {m==='free'?'Free Run':'Fixed'}
                </button>
              ))}
            </div>
          </div>
          {durMode==='fixed' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Duration (s)</label>
              <input type="number" min={1} max={3600} step={1} value={durSeconds}
                onChange={e=>setDurSeconds(Math.max(1,Number(e.target.value)))} disabled={isRecording}
                className="w-24 bg-panel border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal disabled:opacity-50" />
            </div>
          )}
        </div>

        {/* Capture mode toggle */}
        <div className="flex gap-1 p-1 bg-panel rounded border border-border">
          {(['immediate','triggered'] as CaptureMode[]).map(m=>(
            <button key={m} onClick={()=>setCaptureMode(m)} disabled={isActive}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${captureMode===m?'bg-teal/20 text-teal':'text-muted hover:text-white'}`}>
              {m==='immediate'?<><Radio size={11}/> Immediate</>:<><Zap size={11}/> Level Trigger</>}
            </button>
          ))}
        </div>

        {/* Trigger settings */}
        {captureMode==='triggered' && (
          <div className="flex flex-col gap-2 p-3 bg-panel/50 rounded border border-border/50">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Trigger</span>
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-32">
                <label className="text-xs text-muted">Threshold <span className="text-amber">{trigThresh} dBFS</span></label>
                <input type="range" min={-80} max={0} step={1} value={trigThresh}
                  onChange={e=>setTrigThresh(Number(e.target.value))} disabled={isWaiting||isRecording} className="accent-amber"/>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-32">
                <label className="text-xs text-muted">Pre-roll <span className="text-teal">{trigPreRoll} s</span></label>
                <input type="range" min={0} max={5} step={0.5} value={trigPreRoll}
                  onChange={e=>setTrigPreRoll(Number(e.target.value))} disabled={isWaiting||isRecording} className="accent-teal"/>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-32">
                <label className="text-xs text-muted">Hold <span className="text-muted">{trigHold} s</span></label>
                <input type="range" min={0.5} max={10} step={0.5} value={trigHold}
                  onChange={e=>setTrigHold(Number(e.target.value))} disabled={isWaiting||isRecording} className="accent-border"/>
              </div>
            </div>
            <div className="flex gap-1">
              <label className="text-xs text-muted">Edge:</label>
              {(['rising','falling'] as TrigEdge[]).map(e=>(
                <button key={e} onClick={()=>setTrigEdge(e)} disabled={isWaiting||isRecording}
                  className={`px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-50 ${trigEdge===e?'bg-amber/20 text-amber':'text-muted hover:text-white'}`}>
                  {e==='rising'?'↑ Rising':'↓ Falling'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Averaging */}
        <div className="flex flex-col gap-2 p-3 bg-panel/50 rounded border border-border/50">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={avgEnabled} onChange={e=>setAvgEnabled(e.target.checked)} disabled={isActive}
                className="accent-teal w-3 h-3"/>
              <span className="text-muted font-semibold uppercase tracking-wider">Averaging</span>
            </label>
            {avgEnabled && avgCount > 0 && (
              <span className="ml-auto text-xs font-semibold text-teal">
                {avgCount} / {avgTotal} takes
              </span>
            )}
          </div>
          {avgEnabled && (
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Number of takes</label>
                <input type="number" min={2} max={99} step={1} value={avgTotal}
                  onChange={e=>setAvgTotal(Math.max(2,Number(e.target.value)))} disabled={isActive||avgCount>0}
                  className="w-20 bg-panel border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal disabled:opacity-50"/>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none mb-1.5">
                <input type="checkbox" checked={avgAutoAccept} onChange={e=>setAvgAutoAccept(e.target.checked)} disabled={isActive}
                  className="accent-teal w-3 h-3"/>
                <span className="text-muted">Auto-start next take</span>
              </label>
              {avgCount > 0 && (
                <button onClick={cancelAveraging}
                  className="px-2 py-1 text-xs text-orange border border-orange/30 rounded hover:bg-orange/10 transition-colors mb-1.5">
                  Cancel session
                </button>
              )}
            </div>
          )}
        </div>

        {/* Signal protection */}
        <div className="flex flex-col gap-2 p-3 bg-panel/50 rounded border border-border/50">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Signal Protection</span>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={overloadOn} onChange={e=>setOverloadOn(e.target.checked)} disabled={isRecording}
                className="accent-orange w-3 h-3"/>
              <span className="text-muted">Overload abort</span>
              {overloadOn && <span className="text-orange">{overloadDb} dBFS</span>}
            </label>
            {overloadOn && (
              <input type="range" min={-20} max={0} step={0.5} value={overloadDb}
                onChange={e=>setOverloadDb(Number(e.target.value))} disabled={isRecording}
                className="flex-1 accent-orange" />
            )}
          </div>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={silenceStop} onChange={e=>setSilenceStop(e.target.checked)} disabled={isRecording}
                className="accent-teal w-3 h-3"/>
              <span className="text-muted">Auto-stop on silence</span>
              {silenceStop && <span className="text-teal">{silenceDur} s</span>}
            </label>
            {silenceStop && (
              <input type="range" min={0.5} max={30} step={0.5} value={silenceDur}
                onChange={e=>setSilenceDur(Number(e.target.value))} disabled={isRecording}
                className="flex-1 accent-teal" />
            )}
          </div>
        </div>
      </div>
        )}
      </div>

      {/* ── Live plots: only while the microphone is open ── */}
      {isActive && (
      <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">

        {/* Live plots */}
        {isActive && (
          <>
            {/* Waveform */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Waveform — live</span>
              <LiveWaveform bufRef={waveBufRef} posRef={wavePosRef} sampleRate={sampleRate}/>
            </div>
            {/* Spectrum */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Spectrum — live</span>
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={fftAvg} onChange={e=>setFftAvg(e.target.checked)} className="accent-teal w-3 h-3"/>
                  <span className="text-muted">Average</span>
                </label>
              </div>
              <LiveSpectrum analyser={analyser} sampleRate={sampleRate}
                thresholdDb={captureMode==='triggered'?trigThresh:undefined}
                showThreshold={captureMode==='triggered'&&(isWaiting||isArmed)}
                avgMode={fftAvg}/>
            </div>
          </>
        )}

        {/* Waiting indicator */}
        {isWaiting && (
          <div className="flex items-center gap-2 p-2 rounded bg-amber/10 border border-amber/30">
            <span className="w-2 h-2 rounded-full bg-amber animate-pulse shrink-0"/>
            <span className="text-sm text-amber">
              Waiting for {trigEdge==='rising'?'↑':'↓'} trigger ({trigThresh} dBFS)…
            </span>
            <span className="text-xs text-muted ml-auto">Pre-roll: {trigPreRoll}s</span>
          </div>
        )}

        {/* Recording name (while armed or recording) */}
        {(isArmed||isRecording) && (
          <input type="text" placeholder="Recording name (optional)"
            value={recName} onChange={e=>setRecName(e.target.value)}
            className="bg-panel border border-border rounded px-2 py-1.5 text-sm text-white placeholder-muted focus:outline-none focus:border-teal"/>
        )}

      </div>
      )}

      {/* ── Accept / Decline gate ── */}
      {isReviewing && pendingRec && (
        <div className="bg-surface border border-teal/30 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-teal uppercase tracking-wider">
              {avgEnabled && !pendingRec.mode.includes('average')
                ? `Review Take ${avgCount + 1} / ${avgTotal}`
                : pendingRec.mode.includes('average')
                  ? `Review Averaged Result (${avgTotal} takes)`
                  : 'Review Take'}
            </span>
          </div>
          <div className="flex items-center gap-3 bg-panel rounded px-3 py-2 border border-border">
            <button onClick={()=>togglePlay(pendingRec)}
              className="text-muted hover:text-white transition-colors shrink-0">
              {playingId===pendingRec.id?<Pause size={14}/>:<Play size={14}/>}
            </button>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm truncate">{pendingRec.name}</span>
              <span className="text-xs text-muted">
                {fmtTime(pendingRec.durationSec)} · {pendingRec.bitDepth}-bit · {(pendingRec.sr/1000).toFixed(1)} kHz · {pendingRec.device}
              </span>
            </div>
          </div>
          {/* Full-signal waveform with playback cursor */}
          {pendingPcmRef.current && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted uppercase tracking-wider">Waveform</span>
              <StaticWaveform
                pcm={pendingPcmRef.current.pcm}
                sampleRate={pendingPcmRef.current.sr}
                playProgress={playingId === pendingRec.id ? playProgress : 0}
              />
            </div>
          )}
          {/* Spectrum */}
          {pendingPcmRef.current && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted uppercase tracking-wider">Spectrum</span>
              <StaticSpectrum pcm={pendingPcmRef.current.pcm} sampleRate={pendingPcmRef.current.sr} />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={acceptRecording}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-teal text-dark text-sm font-semibold hover:bg-teal/80 transition-colors">
              <CheckCircle size={14}/> Accept
            </button>
            <button onClick={declineRecording}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-panel border border-orange/40 text-orange text-sm font-medium hover:bg-orange/10 transition-colors">
              <XCircle size={14}/> Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Recordings list ── */}
      {recordings.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Recordings ({recordings.length})<span className="ml-2 normal-case font-normal tracking-normal text-muted/70">kept in this browser</span></span>
            <div className="flex items-center gap-1.5">
              <button onClick={()=>setPlayMuted(m=>!m)} className="text-muted hover:text-white transition-colors">
                {playMuted?<VolumeX size={13}/>:<Volume2 size={13}/>}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={playMuted?0:playVolume}
                onChange={e=>{setPlayVolume(Number(e.target.value));setPlayMuted(false)}}
                className="w-16 h-1 cursor-pointer" style={{accentColor:'#50b89e'}}/>
            </div>
          </div>
          {recordings.map(rec=>(
            <div key={rec.id} className={`flex flex-col bg-panel rounded border overflow-hidden transition-colors ${selectedRecId===rec.id?'border-teal/40':'border-border'}`}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button onClick={()=>togglePlay(rec)}
                  className="text-muted hover:text-white transition-colors shrink-0"
                  title={playingId===rec.id?'Pause':'Play'}>
                  {playingId===rec.id?<Pause size={14}/>:<Play size={14}/>}
                </button>
                {/* Clicking the name row toggles waveform/spectrum expand */}
                <div className="flex flex-col min-w-0 flex-1 cursor-pointer select-none"
                  onClick={()=>selectRecording(rec)} title="Click to view waveform & spectrum">
                  <span className="text-sm truncate">{rec.name}</span>
                  <span className="text-xs text-muted truncate">
                    {fmtTime(rec.durationSec)} · {rec.bitDepth}-bit · {(rec.sr/1000).toFixed(1)} kHz · {rec.device}
                  </span>
                </div>

                {/* Download WAV */}
                <button onClick={()=>downloadRecording(rec)} title="Download WAV"
                  className="text-muted hover:text-white transition-colors shrink-0 p-1 rounded hover:bg-panel">
                  <Download size={13}/>
                </button>

                {/* Export CSV */}
                <button onClick={()=>exportCSV(rec)} title="Export CSV"
                  className="text-muted hover:text-teal transition-colors shrink-0 px-1.5 py-1 rounded hover:bg-teal/10 text-xs font-medium">
                  CSV
                </button>

                {/* Send */}
                <button onClick={()=>sendToPostProcessing(rec)} disabled={sendingId===rec.id}
                  title="Send to Post-Processing"
                  className="flex items-center gap-1 text-xs text-teal hover:text-white disabled:opacity-50 transition-colors shrink-0 px-2 py-1 rounded hover:bg-teal/20">
                  {sendingId===rec.id?<RefreshCw size={12} className="animate-spin"/>:<><Send size={12}/><ChevronRight size={10}/></>}
                </button>

                {/* Delete with confirm */}
                {deleteConfId===rec.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <AlertTriangle size={11} className="text-orange"/>
                    <span className="text-xs text-orange">Delete?</span>
                    <button onClick={()=>deleteRecording(rec.id)} className="text-xs text-orange hover:text-white px-1">Yes</button>
                    <button onClick={()=>setDeleteConfId(null)} className="text-xs text-muted hover:text-white px-1">No</button>
                  </div>
                ) : (
                  <button onClick={()=>setDeleteConfId(rec.id)} title="Delete"
                    className="text-muted hover:text-orange transition-colors shrink-0">
                    <Trash2 size={13}/>
                  </button>
                )}
              </div>

              {/* Expanded waveform + spectrum panel */}
              {selectedRecId === rec.id && (
                <div className="px-3 pb-3 flex flex-col gap-2 border-t border-border/50">
                  {selectedPcmLoading && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted">
                      <RefreshCw size={11} className="animate-spin"/> Decoding…
                    </div>
                  )}
                  {selectedPcm && !selectedPcmLoading && (<>
                    <div className="flex flex-col gap-1 pt-2">
                      <span className="text-xs text-muted uppercase tracking-wider">Waveform</span>
                      <StaticWaveform
                        pcm={selectedPcm.pcm}
                        sampleRate={selectedPcm.sr}
                        playProgress={playingId === rec.id ? playProgress : 0}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted uppercase tracking-wider">Spectrum</span>
                      <StaticSpectrum pcm={selectedPcm.pcm} sampleRate={selectedPcm.sr} />
                    </div>
                  </>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Help */}
      <div className="text-xs text-muted bg-surface border border-border rounded-lg p-3 leading-relaxed">
        <strong className="text-white">Workflow:</strong> Monitor → Record / Watch → Stop → <strong className="text-teal">Accept</strong> (keeps) or <strong className="text-orange">Discard</strong> (throws away).
        {' '}The <span className="text-teal font-semibold">Worklet</span> badge means lossless Float32 PCM capture (requires HTTPS or localhost).
        <br/><br/>
        <strong className="text-white">Signal protection:</strong> Overload abort automatically discards the take if the peak exceeds the threshold.
        Silence stop ends the recording after N seconds of silence, in any capture mode.
        <br/><br/>
        <strong className="text-white">Trigger:</strong> ↑ Rising fires when the signal rises above the threshold;
        ↓ Falling fires when it drops below. Pre-roll captures audio before the trigger (via AudioWorklet).
      </div>

    </div>
  )
}
