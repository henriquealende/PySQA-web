/**
 * recorder-processor.js  —  AudioWorklet processor for PySQA Data Acquisition
 *
 * Runs in a dedicated audio rendering thread. Captures raw Float32 PCM from the audio graph and sends
 * chunks to the main thread via MessagePort.
 *
 * The recording is controlled here, in the audio thread, because it counts samples: a take lasts exactly
 * the requested number of samples, a silence or trigger rule acts on the very block that satisfies it, and
 * the pre-roll is exactly the requested length. Timers in the page can slip by tens of milliseconds.
 *
 * Pre-roll: while not recording, a ring buffer keeps the last `preRollSec` seconds (at least one block).
 *
 * Messages received:
 *   { type: 'start', preRoll: boolean, maxSamples: number, rules: Rule[] }
 *       begin streaming. preRoll: send the buffered audio first (false: start from this moment).
 *       maxSamples: stop after exactly this many samples (0: no limit). rules: stop after a run of quiet.
 *       Rule = { thresh: linear peak, samples: run length, reason: string }; a block is quiet when its peak
 *       is below thresh.
 *   { type: 'stop' }            stop streaming (answered by 'stopped' if a take was running)
 *   { type: 'trigger', thresh, edge: 'rising'|'falling', maxSamples, rules }
 *       wait for the level to cross thresh, then start (the pre-roll and the block that fired come first)
 *   { type: 'trigger-cancel' }
 *   { type: 'config', preRollSec: number }
 *
 * Messages sent:
 *   { type: 'chunk', data: ArrayBuffer }                transferable Float32 block
 *   { type: 'stopped', reason, samples, sinceStart }    right behind the last chunk; reason: 'manual' |
 *                                                       'duration' | a rule's reason
 *   { type: 'triggered', preRollSamples }               a trigger fired; the take has started
 *   { type: 'level', peak, rms, rmsA, seconds, recorded, recording }
 *                                                       every ~50 ms: peak and RMS (unweighted and
 *                                                       A-weighted) of the last `seconds`, samples recorded
 */

// ── A-weighting (IEC 61672) as a cascade of filters designed for this sample rate ──────────────────
// Poles at 20.6, 107.7, 737.9 and 12194 Hz (bilinear transform with the pole frequencies pre-warped so
// they land where the standard puts them), scaled to 0 dB at 1 kHz.

function bilinear2 (b2, b1, b0, a2, a1, a0, c) {
  const n0 = b2 * c * c + b1 * c + b0, n1 = 2 * b0 - 2 * b2 * c * c, n2 = b2 * c * c - b1 * c + b0
  const d0 = a2 * c * c + a1 * c + a0, d1 = 2 * a0 - 2 * a2 * c * c, d2 = a2 * c * c - a1 * c + a0
  return { b0: n0 / d0, b1: n1 / d0, b2: n2 / d0, a1: d1 / d0, a2: d2 / d0 }
}

// first order: (b1 s + b0) / (a1 s + a0)
function bilinear1 (b1, b0, a1, a0, c) {
  const d0 = a1 * c + a0
  return { b0: (b1 * c + b0) / d0, b1: (b0 - b1 * c) / d0, b2: 0, a1: (a0 - a1 * c) / d0, a2: 0 }
}

function stageMagnitude (st, f, fs) {
  const w = 2 * Math.PI * f / fs
  const nr = st.b0 + st.b1 * Math.cos(w) + st.b2 * Math.cos(2 * w)
  const ni = -(st.b1 * Math.sin(w) + st.b2 * Math.sin(2 * w))
  const dr = 1 + st.a1 * Math.cos(w) + st.a2 * Math.cos(2 * w)
  const di = -(st.a1 * Math.sin(w) + st.a2 * Math.sin(2 * w))
  return Math.hypot(nr, ni) / Math.hypot(dr, di)
}

function designAWeighting (fs) {
  const c = 2 * fs
  const warp = (f) => c * Math.tan(Math.PI * f / fs)
  const w1 = warp(20.598997), w2 = warp(107.65265), w3 = warp(737.86223), w4 = warp(12194.217)
  const stages = [
    bilinear2(1, 0, 0, 1, 2 * w1, w1 * w1, c),
    bilinear1(1, 0, 1, w2, c),
    bilinear1(1, 0, 1, w3, c),
    bilinear2(0, 0, w4 * w4, 1, 2 * w4, w4 * w4, c),
  ]
  let g = 1
  for (const st of stages) g *= stageMagnitude(st, 1000, fs)
  return { stages, gain: 1 / g }
}

class RecorderProcessor extends AudioWorkletProcessor {
  constructor (options) {
    super()
    const opts          = (options && options.processorOptions) || {}
    this._preRollSec    = opts.preRollSec  ?? 1.0
    this._preBuffer     = []          // array of Float32Array
    this._preLen        = 0           // total samples in pre-buffer
    this._recording     = false
    this._sinceStart    = 0           // samples recorded since the start (pre-roll not counted)
    this._sent          = 0           // samples sent in this take (pre-roll included)
    this._maxSamples    = 0
    this._rules         = []
    this._trigger       = null
    this._levelCounter  = 0
    this._peakAcc       = 0           // level statistics accumulated since the last report
    this._sqAcc         = 0
    this._sqAccA        = 0
    this._countAcc      = 0
    this._levelInterval = Math.round(sampleRate * 0.05)  // ~50 ms

    const a = designAWeighting(sampleRate)
    this._aStages = a.stages
    this._aGain   = a.gain
    this._aState  = a.stages.map(() => [0, 0])

    this.port.onmessage = ({ data }) => this._onMessage(data)
  }

  _onMessage (data) {
    switch (data.type) {
      case 'start':
        this._begin(data.preRoll !== false, data.maxSamples || 0, data.rules || [], 0)
        break
      case 'stop':
        // Answered only if a take was running: one that has just ended by itself already reported 'stopped'
        if (this._recording) this._finish('manual')
        break
      case 'config':
        if (data.preRollSec != null) this._preRollSec = data.preRollSec
        break
      case 'trigger':
        this._trigger = {
          thresh: data.thresh, edge: data.edge === 'falling' ? 'falling' : 'rising',
          maxSamples: data.maxSamples || 0, rules: data.rules || [], wasAbove: false,
        }
        break
      case 'trigger-cancel':
        this._trigger = null
        break
    }
  }

  // Start streaming. `extra`: samples at the end of the buffer that belong to the take on top of the pre-roll
  // (the block whose level fired a trigger).
  _begin (usePreRoll, maxSamples, rules, extra) {
    if (usePreRoll && this._preLen > 0) {
      const want = Math.min(this._preLen, Math.round(this._preRollSec * sampleRate) + extra)
      const all = new Float32Array(this._preLen)
      let o = 0
      for (const chunk of this._preBuffer) { all.set(chunk, o); o += chunk.length }
      const keep = all.slice(this._preLen - want)
      this.port.postMessage({ type: 'chunk', data: keep.buffer }, [keep.buffer])
      this._sent += keep.length
    }
    this._preBuffer  = []
    this._preLen     = 0
    this._recording  = true
    this._sinceStart = 0
    this._maxSamples = maxSamples
    this._rules      = rules.map((r) => ({ thresh: r.thresh, samples: r.samples, reason: r.reason || 'silence', run: 0 }))
  }

  _finish (reason) {
    this._recording = false
    this.port.postMessage({ type: 'stopped', reason, samples: this._sent, sinceStart: this._sinceStart })
    this._sent = 0; this._sinceStart = 0; this._maxSamples = 0; this._rules = []
  }

  _aWeigh (x) {
    let v = x * this._aGain
    for (let k = 0; k < 4; k++) {
      const s = this._aStages[k], z = this._aState[k]
      const y = s.b0 * v + z[0]
      z[0] = s.b1 * v - s.a1 * y + z[1]
      z[1] = s.b2 * v - s.a2 * y
      v = y
    }
    return v
  }

  // One block while recording: send it (cut at exactly maxSamples), then check the stop rules
  _record (ch, blockPeak) {
    let len = ch.length, reason = null
    if (this._maxSamples > 0 && this._sinceStart + len >= this._maxSamples) {
      len = this._maxSamples - this._sinceStart
      reason = 'duration'
    }
    const copy = len === ch.length ? ch.slice() : ch.slice(0, len)
    this.port.postMessage({ type: 'chunk', data: copy.buffer }, [copy.buffer])
    this._sinceStart += len
    this._sent       += len
    if (!reason) {
      for (const r of this._rules) {
        if (blockPeak < r.thresh) r.run += len; else r.run = 0
        if (r.run >= r.samples) { reason = r.reason; break }
      }
    }
    if (reason) this._finish(reason)
  }

  _checkTrigger (blockPeak, blockLen) {
    const t = this._trigger
    const above = blockPeak >= t.thresh
    const fired = t.edge === 'rising' ? (above && !t.wasAbove) : (!above && t.wasAbove)
    t.wasAbove = above
    if (!fired) return
    this._trigger = null
    const preRollSamples = Math.max(0, Math.min(this._preLen - blockLen, Math.round(this._preRollSec * sampleRate)))
    // The pre-roll and the block that fired go out first; that block counts as the start of the take
    this._begin(true, t.maxSamples, t.rules, blockLen)
    this._sinceStart = blockLen
    this.port.postMessage({ type: 'triggered', preRollSamples })
  }

  process (inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch || ch.length === 0) return true
    const n = ch.length

    // Level statistics over EVERY block, reported every ~50 ms. (Measuring only the block that lands on the
    // report boundary looks at ~5% of the audio, so clipping and overload between reports went unnoticed.)
    let blockPeak = 0, blockSq = 0, blockSqA = 0
    for (let i = 0; i < n; i++) {
      const v = ch[i], a = v < 0 ? -v : v
      if (a > blockPeak) blockPeak = a
      blockSq += v * v
      const y = this._aWeigh(v)
      blockSqA += y * y
    }

    if (this._recording) {
      this._record(ch, blockPeak)
    } else {
      // Maintain pre-roll ring buffer (a copy: the engine reuses the original on the next call)
      this._preBuffer.push(ch.slice())
      this._preLen += n
      const keep = Math.round(this._preRollSec * sampleRate)
      while (this._preBuffer.length > 1 && this._preLen - this._preBuffer[0].length >= keep) {
        this._preLen -= this._preBuffer.shift().length
      }
      if (this._trigger) this._checkTrigger(blockPeak, n)
    }

    if (blockPeak > this._peakAcc) this._peakAcc = blockPeak
    this._sqAcc    += blockSq
    this._sqAccA   += blockSqA
    this._countAcc += n
    this._levelCounter += n
    if (this._levelCounter >= this._levelInterval) {
      this.port.postMessage({
        type: 'level',
        peak: this._peakAcc,
        rms: Math.sqrt(this._sqAcc / this._countAcc),
        rmsA: Math.sqrt(this._sqAccA / this._countAcc),
        seconds: this._countAcc / sampleRate,
        recorded: this._recording ? this._sinceStart : 0,
        recording: this._recording,
      })
      this._levelCounter = 0
      this._peakAcc = 0; this._sqAcc = 0; this._sqAccA = 0; this._countAcc = 0
    }

    return true   // keep processor alive
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
