/**
 * recorder-processor.js  —  AudioWorklet processor for PySQA Data Acquisition
 *
 * Runs in a dedicated audio rendering thread. Captures raw Float32 PCM from the
 * audio graph and sends chunks to the main thread via MessagePort.
 *
 * Pre-roll: always maintains a circular buffer of the last `preRollSec` seconds.
 * When the main thread sends { type: 'start' }, the pre-roll buffer is flushed
 * first, then live chunks follow. This enables level-triggered recording with
 * audio captured just before the trigger fires.
 *
 * Messages received:
 *   { type: 'start' }        — flush pre-roll, begin streaming chunks
 *   { type: 'stop'  }        — stop streaming
 *   { type: 'config', preRollSec: number }  — update pre-roll length
 *
 * Messages sent:
 *   { type: 'chunk', data: ArrayBuffer }   — transferable Float32 block
 *   { type: 'level', peak: number, rms: number }  — ~every 50 ms for UI
 */

class RecorderProcessor extends AudioWorkletProcessor {
  constructor (options) {
    super()
    const opts          = (options && options.processorOptions) || {}
    this._preRollSec    = opts.preRollSec  ?? 1.0
    this._preBuffer     = []          // array of Float32Array
    this._preLen        = 0           // total samples in pre-buffer
    this._recording     = false
    this._levelCounter  = 0
    this._levelInterval = Math.round(sampleRate * 0.05)  // ~50 ms

    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        // Flush pre-roll so the main thread gets audio from before the trigger
        for (const chunk of this._preBuffer) {
          this.port.postMessage({ type: 'chunk', data: chunk.buffer }, [chunk.buffer])
        }
        this._preBuffer = []
        this._preLen    = 0
        this._recording = true
      } else if (data.type === 'stop') {
        this._recording = false
      } else if (data.type === 'config') {
        if (data.preRollSec != null) this._preRollSec = data.preRollSec
      }
    }
  }

  process (inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch || ch.length === 0) return true

    // Copy the block (the original is reused by the engine on the next call)
    const copy = ch.slice()

    if (this._recording) {
      // Transfer ownership to the main thread for zero-copy
      this.port.postMessage({ type: 'chunk', data: copy.buffer }, [copy.buffer])
    } else {
      // Maintain pre-roll ring buffer
      this._preBuffer.push(copy)
      this._preLen += copy.length
      const maxSamples = this._preRollSec * sampleRate
      while (this._preBuffer.length > 1 && this._preLen - this._preBuffer[0].length >= maxSamples) {
        this._preLen -= this._preBuffer.shift().length
      }
    }

    // Send level metrics to main thread at ~50 ms intervals
    this._levelCounter += ch.length
    if (this._levelCounter >= this._levelInterval) {
      this._levelCounter = 0
      let peak = 0, sumSq = 0
      for (let i = 0; i < ch.length; i++) {
        const v = Math.abs(ch[i])
        if (v > peak) peak = v
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / ch.length)
      this.port.postMessage({ type: 'level', peak, rms })
    }

    return true   // keep processor alive
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
