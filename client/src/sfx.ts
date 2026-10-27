// Tiny WebAudio comic sounds — no assets, just oscillators making noise.

let ac: AudioContext | null = null

function ctx(): AudioContext | null {
  try {
    ac ??= new AudioContext()
    if (ac.state === 'suspended') ac.resume()
    return ac
  } catch { return null }
}

function tone(fn: (a: AudioContext, g: GainNode) => OscillatorNode[], vol = 0.08) {
  const a = ctx(); if (!a) return
  const g = a.createGain()
  g.gain.value = vol
  g.connect(a.destination)
  const oscs = fn(a, g)
  for (const o of oscs) o.connect(g)
}

export const sfx = {
  meow() {
    tone((a, g) => {
      const o = a.createOscillator()
      o.type = 'sawtooth'
      const t = a.currentTime
      o.frequency.setValueAtTime(480, t)
      o.frequency.linearRampToValueAtTime(820, t + 0.12)
      o.frequency.linearRampToValueAtTime(360, t + 0.42)
      g.gain.setValueAtTime(0.09, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
      o.start(); o.stop(t + 0.5)
      return [o]
    })
  },
  hiss() {
    const a = ctx(); if (!a) return
    const g = a.createGain(); g.connect(a.destination)
    const buf = a.createBuffer(1, a.sampleRate * 0.35, a.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const src = a.createBufferSource(); src.buffer = buf
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800
    src.connect(f); f.connect(g); g.gain.value = 0.14
    src.start()
  },
  plunk() {
    tone((a, g) => {
      const o = a.createOscillator()
      o.type = 'triangle'
      const t = a.currentTime
      o.frequency.setValueAtTime(420, t)
      o.frequency.exponentialRampToValueAtTime(120, t + 0.25)
      g.gain.setValueAtTime(0.16, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
      o.start(); o.stop(t + 0.32)
      return [o]
    })
  },
  pop() {
    tone((a, g) => {
      const o = a.createOscillator()
      o.type = 'sine'
      const t = a.currentTime
      o.frequency.setValueAtTime(300, t)
      o.frequency.exponentialRampToValueAtTime(900, t + 0.08)
      g.gain.setValueAtTime(0.12, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      o.start(); o.stop(t + 0.14)
      return [o]
    })
  },
  splish() {
    const a = ctx(); if (!a) return
    const g = a.createGain(); g.connect(a.destination)
    const buf = a.createBuffer(1, a.sampleRate * 0.2, a.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI)
    const src = a.createBufferSource(); src.buffer = buf
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900
    src.connect(f); f.connect(g); g.gain.value = 0.1
    src.start()
  },
}
