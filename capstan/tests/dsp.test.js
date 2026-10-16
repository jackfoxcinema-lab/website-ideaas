// Node checks for the tape model. Run: node tests/dsp.test.js
'use strict';
require('../dsp.js');
const D = globalThis.CapstanDSP;
const FS = 48000;
const TAU = Math.PI * 2;
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; };
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const rms = (a, s = 0, e = a.length) => { let t = 0; for (let i = s; i < e; i++) t += a[i] * a[i]; return Math.sqrt(t / Math.max(1, e - s)); };
function goertzel(a, f, s, e) {
  const w = TAU * f / FS, c = 2 * Math.cos(w); let p1 = 0, p2 = 0;
  for (let i = s; i < e; i++) { const p0 = a[i] + c * p1 - p2; p2 = p1; p1 = p0; }
  return Math.sqrt(p1 * p1 + p2 * p2 - c * p1 * p2) / ((e - s) / 2);
}

console.log('shelf emphasis is exactly undone by de-emphasis');
{
  const a = new D.Biquad(), b = new D.Biquad();
  a.set('hs', 2274, FS, 0.707, 6); b.set('hs', 2274, FS, 0.707, -6);
  let maxErr = 0; let seed = 1;
  for (let i = 0; i < 20000; i++) { seed = (seed * 16807) % 2147483647; const x = seed / 2147483647 - 0.5; const y = b.process(a.process(x)); if (i > 100) maxErr = Math.max(maxErr, Math.abs(y - x)); }
  ok(maxErr < 1e-9, `max error ${maxErr.toExponential(2)}`);
}

console.log('2x oversampling round trip is transparent in the audio band');
{
  const up = new D.Upsampler2x(), dn = new D.Downsampler2x();
  for (const f of [100, 1000, 10000, 16000]) {
    up.reset(); dn.reset();
    const N = 9600, out = new Float64Array(N);
    for (let i = 0; i < N; i++) { const x = Math.sin(TAU * f * i / FS); up.push(x); out[i] = dn.push(up.out0, up.out1); }
    const g = goertzel(out, f, 2000, N);
    ok(Math.abs(db(g)) < 0.15, `${f} Hz gain ${db(g).toFixed(3)} dB`);
  }
}

console.log('hysteresis stays finite and bounded for every stock, drive, level and frequency');
{
  let bad = 0, cases = 0, maxOut = 0;
  for (const id of ['I', 'II', 'R15', 'WORN']) {
    for (const drive of [0, 0.5, 1]) {
      for (const f of [30, 1000, 9000, 18000]) {
        for (const amp of [0.001, 0.3, 1, 3]) {
          const st = new D.RecordStage(FS); st.configure(D.STOCKS[id], drive);
          for (let i = 0; i < 4800; i++) {
            const y = st.de.process(st.toTape(amp * Math.sin(TAU * f * i / FS)));
            if (!Number.isFinite(y)) { bad++; break; }
            maxOut = Math.max(maxOut, Math.abs(y));
          }
          cases++;
        }
      }
    }
  }
  ok(bad === 0, `${cases} cases, ${bad} non-finite`);
  ok(maxOut < 40, `max raw output ${maxOut.toFixed(2)} (before makeup and ceiling)`);
}

console.log('makeup keeps -18 dBFS program level matched across DRIVE');
for (const id of ['I', 'II', 'R15', 'WORN']) {
  const levels = [];
  for (const drive of [0, 0.4, 1]) {
    const st = new D.RecordStage(FS); st.configure(D.STOCKS[id], drive);
    const m = D.computeMakeup(D.STOCKS[id], drive, FS);
    const amp = D.dbToGain(-18), N = 9600, inA = new Float64Array(N), outA = new Float64Array(N);
    for (let i = 0; i < N; i++) { const x = amp * (Math.sin(TAU * 220 * i / FS) + Math.sin(TAU * 1700 * i / FS)); inA[i] = x; outA[i] = st.de.process(st.toTape(x)) * m; }
    levels.push(db(rms(outA, 2400) / rms(inA, 2400)));
  }
  ok(levels.every((l) => Math.abs(l) < 0.5), `${id}: ${levels.map((l) => l.toFixed(2)).join(' / ')} dB`);
}

console.log('saturation: distortion rises with DRIVE and is odd-harmonic dominant');
for (const id of ['II', 'WORN']) {
  const thd = [];
  let h2 = 0, h3 = 0;
  for (const drive of [0, 0.5, 1]) {
    const st = new D.RecordStage(FS); st.configure(D.STOCKS[id], drive);
    const N = 24000, out = new Float64Array(N);
    for (let i = 0; i < N; i++) out[i] = st.de.process(st.toTape(0.5 * Math.sin(TAU * 500 * i / FS)));
    const f1 = goertzel(out, 500, 4800, N), f2 = goertzel(out, 1000, 4800, N), f3 = goertzel(out, 1500, 4800, N), f5 = goertzel(out, 2500, 4800, N);
    thd.push(Math.sqrt(f2 * f2 + f3 * f3 + f5 * f5) / f1);
    if (drive === 1) { h2 = f2; h3 = f3; }
  }
  ok(thd[0] < thd[1] && thd[1] < thd[2], `${id} THD ${thd.map((t) => (t * 100).toFixed(2) + '%').join(' -> ')}`);
  ok(h3 > h2 && db(h2) > -80, `${id} 3rd harmonic ${db(h3).toFixed(1)} dB > 2nd ${db(h2).toFixed(1)} dB`);
}

function sineTape(sec, f, amp = 0.5) {
  const n = Math.round(sec * FS), a = new Int16Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round(amp * 32767 * Math.sin(TAU * f * i / FS));
  return a;
}
function run(deck, sec) { const out = new Float32Array(Math.round(sec * FS)); for (let i = 0; i < out.length; i += 128) deck.process(out.subarray(i, Math.min(out.length, i + 128))); return out; }

console.log('deck plays at 1x with the right pitch (DIRECT) and gets there fast');
{
  const d = new D.Deck(FS); d.setStock('DIRECT'); d.load(sineTape(3, 440), FS, 1); d.play();
  const out = run(d, 1);
  let zc = 0; for (let i = 24001; i < 48000; i++) if (out[i - 1] < 0 && out[i] >= 0) zc++;
  ok(Math.abs(zc * 2 - 440) <= 2, `pitch ~ ${zc * 2} Hz`);
  ok(Math.abs(d.pos - FS) < FS * 0.03, `position after 1 s = ${(d.pos / FS).toFixed(3)} s`);
  ok(Math.abs(d.v - 1) < 1e-3, `velocity settled at ${d.v.toFixed(4)}`);
}

console.log('scrubbing backwards plays the tape in reverse');
{
  const d = new D.Deck(FS); d.setStock('II'); d.load(sineTape(4, 300), FS, 1);
  d.jump(2 * FS); d.scrubStart();
  // finger drags back 1 s of tape over 0.5 s
  const out = new Float32Array(FS); let minV = 0;
  for (let b = 0; b < FS / 128; b++) {
    const t = Math.min(1, (b * 128) / (FS * 0.5));
    d.scrubTo(2 * FS - t * FS);
    d.process(out.subarray(b * 128, b * 128 + 128));
    minV = Math.min(minV, d.v);
  }
  ok(minV < -1.5 && minV > -3, `reverse velocity reached ${minV.toFixed(2)}x`);
  ok(Math.abs(d.pos - FS) < FS * 0.02, `landed at ${(d.pos / FS).toFixed(3)} s`);
  ok(rms(out, 2400, 24000) > 0.05, `audible while scrubbing (rms ${db(rms(out, 2400, 24000)).toFixed(1)} dB)`);
  ok(Math.abs(d.v) < 0.05, `held still -> tape stops (v=${d.v.toFixed(3)})`);
  d.scrubEnd(); run(d, 1); ok(d.v === 0 && d.mode === 'motor', 'release while stopped -> friction brings it to rest');
}

console.log('fling while playing: the motor grabs it back to 1x');
{
  const d = new D.Deck(FS); d.load(sineTape(20, 200), FS, 1); d.play(); run(d, 0.2);
  d.scrubStart(); for (let i = 0; i < 20; i++) { d.scrubTo(d.pos + FS * 0.25); run(d, 0.01); }
  const vFling = d.v; d.scrubEnd(); run(d, 0.8);
  ok(vFling > 4, `fling speed ${vFling.toFixed(1)}x`);
  ok(Math.abs(d.v - 1) < 0.03 && d.mode === 'motor', `back to ${d.v.toFixed(3)}x in motor mode`);
}

console.log('audible seek (rewind to zero) finishes in under a second, any distance');
for (const len of [10, 300, 900]) {
  const d = new D.Deck(FS); d.setStock('DIRECT'); d.load(new Int16Array(len * FS), FS, 1); d.jump(len * FS - FS);
  d.seek(0, false); let t = 0; while (!d.seekDone && t < 3) { run(d, 0.01); t += 0.01; }
  ok(d.seekDone && d.pos === 0 && t < 1.2, `${len} s tape: ${t.toFixed(2)} s`);
}

console.log('hold-to-cue moves at the requested speed');
{
  const d = new D.Deck(FS); d.load(sineTape(30, 500), FS, 1); d.jump(20 * FS); d.cue(-12); run(d, 1);
  const moved = 20 - d.pos / FS;
  ok(moved > 10 && moved < 12.5, `rewound ${moved.toFixed(2)} s in 1 s at 12x`);
  d.cue(0); run(d, 0.3); ok(Math.abs(d.v) < 0.01, 'release stops the tape (was stopped)');
}

console.log('hiss lives on the tape: present while moving, gone when stopped');
for (const id of ['I', 'II', 'R15', 'WORN']) {
  const d = new D.Deck(FS); d.setStock(id); d.load(new Int16Array(4 * FS), FS, 1); d.play();
  const out = run(d, 1.5);
  const level = db(rms(out, FS * 0.5, FS * 1.5));
  d.pause(); const out2 = run(d, 0.6); const quiet = db(rms(out2, FS * 0.3, FS * 0.6));
  ok(Math.abs(level - D.STOCKS[id].hiss) < 2.5, `${id} hiss ${level.toFixed(1)} dB (target ${D.STOCKS[id].hiss})`);
  ok(quiet < level - 25, `${id} stopped: ${quiet.toFixed(1)} dB`);
}

console.log('wow & flutter is real pitch modulation of the right size');
for (const id of ['II', 'WORN']) {
  const d = new D.Deck(FS); d.setStock(id); d.load(new Int16Array(10 * FS), FS, 1); d.play(); run(d, 0.5);
  let prev = d.pos, maxDev = 0; const blk = new Float32Array(1);
  for (let i = 0; i < 4 * FS; i++) { d.process(blk); const inc = d.pos - prev; prev = d.pos; maxDev = Math.max(maxDev, Math.abs(inc - 1)); }
  const wf = D.STOCKS[id].wf;
  ok(maxDev > wf * 0.3 && maxDev < wf * 3, `${id} peak speed deviation ${(maxDev * 100).toFixed(3)}% (stock ${(wf * 100).toFixed(2)}%)`);
}

console.log('gap loss: treble above the stock bandwidth rolls off');
for (const [id, f] of [['I', 16000], ['WORN', 10000]]) {
  const lvl = (hz) => { const d = new D.Deck(FS); d.setStock(id); d.setDrive(0); d.load(sineTape(2, hz, 0.05), FS, 1); d.play(); const out = run(d, 1); return goertzel(out, hz, FS * 0.4, FS); };
  const lo = lvl(1000), hi = lvl(f);
  ok(db(hi) < db(lo) - 8, `${id}: ${f / 1000} kHz is ${(db(lo) - db(hi)).toFixed(1)} dB below 1 kHz`);
}

console.log('helpers');
{
  const wav = D.encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 48000);
  const dv = new DataView(wav);
  ok(wav.byteLength === 52 && String.fromCharCode(...new Uint8Array(wav, 0, 4)) === 'RIFF' && dv.getUint32(24, true) === 48000 && dv.getInt16(46, true) === 16383, 'WAV header and samples');
  const quiet = sineTape(2, 200, 0.05);
  const g = D.computeTrim(quiet, FS);
  ok(Math.abs(db(g * 0.05) - -6) < 0.5, `trim lifts a quiet take to -6 dBFS (gain ${db(g).toFixed(1)} dB)`);
  ok(D.computePeaks(quiet).length === 48, 'overview has 48 bars');
}

console.log('performance');
{
  const d = new D.Deck(FS); d.setStock('II'); d.load(sineTape(12, 220), FS, 1); d.play();
  const t0 = process.hrtime.bigint(); run(d, 10); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  10 s of TYPE II audio rendered in ${ms.toFixed(0)} ms (${(10000 / ms).toFixed(0)}x realtime)`);
  ok(10000 / ms > 20, 'comfortably faster than realtime');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
