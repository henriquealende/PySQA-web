// The A-weighting filter of the recorder worklet against the values of IEC 61672 (nominal, dB)
const fs = require('fs'), vm = require('vm')
const file = process.argv[2]
const NOMINAL = { 31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6, 500: -3.2, 1000: 0, 2000: 1.2, 4000: 1.0, 8000: -1.1, 12500: -4.3, 16000: -6.6 }

let worst = 0
for (const rate of [44100, 48000, 96000]) {
  const ctx = vm.createContext({ AudioWorkletProcessor: class {}, registerProcessor() {}, sampleRate: rate, Math, Float32Array, console })
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx)
  const { stages, gain } = vm.runInContext('designAWeighting(' + rate + ')', ctx)
  const mag = (st, f) => { const w = 2 * Math.PI * f / rate; const nr = st.b0 + st.b1 * Math.cos(w) + st.b2 * Math.cos(2 * w), ni = -(st.b1 * Math.sin(w) + st.b2 * Math.sin(2 * w)); const dr = 1 + st.a1 * Math.cos(w) + st.a2 * Math.cos(2 * w), di = -(st.a1 * Math.sin(w) + st.a2 * Math.sin(2 * w)); return Math.hypot(nr, ni) / Math.hypot(dr, di) }
  const row = []
  for (const [f, nom] of Object.entries(NOMINAL)) {
    if (+f >= rate / 2 * 0.9) continue
    let g = gain; for (const st of stages) g *= mag(st, +f)
    const db = 20 * Math.log10(g), err = db - nom
    if (+f <= 10000) worst = Math.max(worst, Math.abs(err))
    row.push(`${f}Hz ${db.toFixed(1)} (${err >= 0 ? '+' : ''}${err.toFixed(2)})`)
  }
  // stability: every pole inside the unit circle
  const stable = stages.every(s => Math.abs(s.a2) < 1 && Math.abs(s.a1) < 1 + s.a2)
  console.log(`fs=${rate} stable=${stable}\n  ` + row.join('\n  '))
}
console.log('worst deviation up to 10 kHz: ' + worst.toFixed(2) + ' dB')
