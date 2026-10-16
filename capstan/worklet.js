/*
 * Audio-thread processors. dsp.js is added to the same AudioWorkletGlobalScope
 * first, so CapstanDSP is already defined here.
 */
const DSP = globalThis.CapstanDSP;

// Plays the loaded tape through the tape model. All transport physics live here
// so scrubbing never stutters when the UI thread is busy.
class TransportProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.deck = new DSP.Deck(sampleRate);
    this.blocks = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    const d = this.deck;
    switch (m.t) {
      case 'load':
        d.load(m.data ? new Int16Array(m.data) : null, m.sr, m.gain);
        if (m.stock) d.setStock(m.stock, m.makeup);
        if (m.drive != null) d.setDrive(m.drive, m.makeup);
        if (m.pos) d.jump(m.pos);
        break;
      case 'unload': d.load(null); break;
      case 'play': d.play(); break;
      case 'pause': d.pause(); break;
      case 'scrubStart': d.scrubStart(); break;
      case 'scrub': d.scrubTo(m.pos); break;
      case 'scrubEnd': d.scrubEnd(); break;
      case 'cue': d.cue(m.speed); break;
      case 'seek': d.seek(m.pos, m.play); break;
      case 'jump': d.jump(m.pos); break;
      case 'stock': d.setStock(m.id, m.makeup); break;
      case 'drive': d.setDrive(m.v, m.makeup); break;
      case 'gain': d.tapeGain = m.v; break;
    }
    this.report();
  }

  report() {
    const d = this.deck;
    this.port.postMessage({ t: 'state', pos: d.pos, v: d.v, playing: d.playing, mode: d.mode, len: d.len });
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const ch0 = out && out[0];
    if (!ch0) return true;
    this.deck.process(ch0);
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    if (this.deck.ended) { this.deck.ended = false; this.port.postMessage({ t: 'ended' }); }
    if (this.deck.seekDone) { this.deck.seekDone = false; this.port.postMessage({ t: 'seekDone' }); }
    // ~94 position reports a second at 48 kHz: smooth platter, cheap messages
    if (++this.blocks >= 4) { this.blocks = 0; this.report(); }
    return true;
  }
}

// Captures the microphone in 1024-sample blocks with a 20 Hz DC filter.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1024;
    this.buf = new Float32Array(this.size);
    this.i = 0; this.peak = 0; this.active = true;
    this.x1 = 0; this.y1 = 0; this.R = 1 - (2 * Math.PI * 20) / sampleRate;
    this.port.onmessage = (e) => { if (e.data && e.data.t === 'stop') this.flushAndStop(); };
  }

  flushAndStop() {
    if (this.i > 0) this.send(this.buf.slice(0, this.i));
    this.i = 0; this.active = false;
    this.port.postMessage({ t: 'stopped' });
  }

  send(arr) {
    this.port.postMessage({ t: 'data', buf: arr.buffer, peak: this.peak }, [arr.buffer]);
    this.peak = 0;
  }

  process(inputs) {
    if (!this.active) return false;
    const inp = inputs[0];
    if (!inp || !inp.length || !inp[0]) return true;
    const a = inp[0], b = inp.length > 1 ? inp[1] : null;
    for (let s = 0; s < a.length; s++) {
      const x = b ? 0.5 * (a[s] + b[s]) : a[s];
      const y = x - this.x1 + this.R * this.y1;
      this.x1 = x; this.y1 = y;
      const ay = y < 0 ? -y : y;
      if (ay > this.peak) this.peak = ay;
      this.buf[this.i++] = y;
      if (this.i === this.size) {
        this.send(this.buf);
        this.buf = new Float32Array(this.size);
        this.i = 0;
      }
    }
    return true;
  }
}

registerProcessor('capstan-transport', TransportProcessor);
registerProcessor('capstan-recorder', RecorderProcessor);
