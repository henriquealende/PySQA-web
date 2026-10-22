// Feed 128-sample blocks to the recorder worklet and check that clipping between report boundaries is seen.
const fs = require('fs')
const vm = require('vm')

function load(path) {
  const messages = []
  let Registered
  const sandbox = {
    sampleRate: 48000,
    registerProcessor: (_name, cls) => { Registered = cls },
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (m) => messages.push(m), onmessage: null } } },
    console,
  }
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), sandbox)
  return { proc: new Registered({ processorOptions: { preRollSec: 1 } }), messages }
}

function run(path, clipBlock) {
  const { proc, messages } = load(path)
  // 60 blocks (~160 ms): everything at 0.1 except one block that contains a full-scale sample
  for (let b = 0; b < 60; b++) {
    const block = new Float32Array(128).fill(0.1)
    if (b === clipBlock) block[64] = 1.0
    proc.process([[block]])
  }
  return messages.filter(m => m.type === 'level').map(m => m.peak)
}

const file = process.argv[2]
const peaks = run(file, 7)           // block 7 is NOT the one that lands on a report boundary
const seenClip = peaks.some(p => p >= 0.999)
console.log(file.split(/[\\/]/).slice(-2).join('/'), '-> level reports:', peaks.map(p => p.toFixed(2)).join(' '), '| clip seen:', seenClip)
process.exit(0)
