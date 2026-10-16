/*
 * CAPSTAN tape model.
 *
 * One plain script shared by three hosts: the AudioWorklet (live playback and
 * scrubbing), the export worker (printing a tape to WAV) and the Node tests.
 * It only touches globalThis, so it runs unchanged in all of them.
 *
 * Signal path, in the order a real machine applies it:
 *   transport read (any speed, either direction, wow & flutter on velocity)
 *   -> drive -> record pre-emphasis -> Jiles-Atherton hysteresis (2x oversampled)
 *   -> dropouts + hiss (both fixed to tape position)
 *   -> playback de-emphasis -> head bump -> gap/spacing loss (both scale with speed)
 *   -> makeup -> soft ceiling
 */
(function (g) {
  'use strict';

  const TAU = Math.PI * 2;
  const dbToGain = (db) => Math.pow(10, db / 20);

  // Tape stocks. emphHz follows the real EQ time constants (120 us, 70 us, 50 us).
  const STOCKS = {
    I:      { id: 'I',      label: 'TYPE I',  sub: 'FERRIC',     emphHz: 1326, emphDb: 8,  bwHz: 11000, bwQ: 0.62, hiss: -56, hissCal: 7.8,  wf: 0.0015, bumpHz: 48, bumpDb: 1.5, ja: 0.55, sat: 0.55, width: 0.5,  asym: 0.03, dropouts: 0 },
    II:     { id: 'II',     label: 'TYPE II', sub: 'CHROME',     emphHz: 2274, emphDb: 6,  bwHz: 14000, bwQ: 0.65, hiss: -62, hissCal: 2.5,  wf: 0.0010, bumpHz: 48, bumpDb: 1.5, ja: 0.45, sat: 0.5,  width: 0.5,  asym: 0.02, dropouts: 0 },
    R15:    { id: 'R15',    label: 'REEL 15', sub: '15 IPS',     emphHz: 3183, emphDb: 4,  bwHz: 20000, bwQ: 0.7,  hiss: -70, hissCal: -3.3, wf: 0.0004, bumpHz: 55, bumpDb: 2.5, ja: 0.35, sat: 0.35, width: 0.45, asym: 0.01, dropouts: 0 },
    WORN:   { id: 'WORN',   label: 'WORN',    sub: 'DICTAPHONE', emphHz: 1326, emphDb: 10, bwHz: 6500,  bwQ: 0.9,  hiss: -46, hissCal: 11.7, wf: 0.0080, bumpHz: 90, bumpDb: 2.0, ja: 0.65, sat: 0.7,  width: 0.6,  asym: 0.05, dropouts: 1 },
    DIRECT: { id: 'DIRECT', label: 'DIRECT',  sub: 'NO TAPE',    bypass: true, wf: 0 },
  };
  // hiss is the level you hear at the default DRIVE (0.4); hissCal offsets the
  // emphasis, filters and makeup that sit after the tape. More DRIVE means a
  // hotter signal on tape and therefore less hiss after makeup, as on a real deck.
  const STOCK_ORDER = ['I', 'II', 'R15', 'WORN', 'DIRECT'];

  // Integer hash -> [-1, 1). Deterministic per tape position, so hiss and
  // dropouts live "on the tape" and move with it when you scrub.
  function hashNoise(i) {
    let x = i | 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;
    return (x >>> 0) / 2147483648 - 1;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // RBJ cookbook biquad, transposed direct form II.
  class Biquad {
    constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
    reset() { this.z1 = 0; this.z2 = 0; }
    identity() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; }
    set(type, f, fs, q, db) {
      f = Math.min(Math.max(f, 1), fs * 0.49);
      const w0 = TAU * f / fs, cs = Math.cos(w0), sn = Math.sin(w0);
      let b0, b1, b2, a0, a1, a2;
      if (type === 'lp') {
        const al = sn / (2 * q);
        b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
      } else if (type === 'hp') {
        const al = sn / (2 * q);
        b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
      } else if (type === 'peak') {
        const A = Math.pow(10, db / 40), al = sn / (2 * q);
        b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
      } else { // 'hs' high shelf, slope 1
        const A = Math.pow(10, db / 40), al = sn / 2 * Math.SQRT2, sA = 2 * Math.sqrt(A) * al;
        b0 = A * ((A + 1) + (A - 1) * cs + sA);
        b1 = -2 * A * ((A - 1) + (A + 1) * cs);
        b2 = A * ((A + 1) + (A - 1) * cs - sA);
        a0 = (A + 1) - (A - 1) * cs + sA;
        a1 = 2 * ((A - 1) - (A + 1) * cs);
        a2 = (A + 1) - (A - 1) * cs - sA;
      }
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    }
    process(x) {
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      return y;
    }
  }

  // 47-tap Blackman halfband pair for 2x oversampling. Odd-phase taps only;
  // the even phase of a halfband is a pure delay.
  const HB_HALF = 12;
  const HB = (function () {
    const N = 47, M = (N - 1) / 2, c = new Float64Array(HB_HALF);
    for (let k = 0; k < HB_HALF; k++) {
      const n = 2 * k + 1;
      const sinc = Math.sin(Math.PI * n / 2) / (Math.PI * n / 2);
      const w = 0.42 + 0.5 * Math.cos(Math.PI * n / M) + 0.08 * Math.cos(2 * Math.PI * n / M);
      c[k] = 0.5 * sinc * w;
    }
    return c;
  })();

  class Upsampler2x {
    constructor() { this.buf = new Float64Array(2 * HB_HALF * 2); this.i = 0; this.n = 2 * HB_HALF; this.out0 = 0; this.out1 = 0; }
    reset() { this.buf.fill(0); }
    // Push one base-rate sample, yields two oversampled samples in out0/out1.
    push(x) {
      const n = this.n;
      this.i = (this.i + 1) % n;
      this.buf[this.i] = x; this.buf[this.i + n] = x;
      // window: oldest .. newest = buf[i+1 .. i+n]
      const b = this.buf, base = this.i + 1;
      // midpoint between samples (base+H-1) and (base+H)
      let acc = 0;
      for (let k = 0; k < HB_HALF; k++) acc += 2 * HB[k] * (b[base + HB_HALF - 1 - k] + b[base + HB_HALF + k]);
      this.out0 = b[base + HB_HALF - 1];
      this.out1 = acc;
    }
  }

  class Downsampler2x {
    constructor() { this.n = 4 * HB_HALF; this.buf = new Float64Array(this.n * 2); this.i = 0; }
    reset() { this.buf.fill(0); }
    push(a, b) {
      const n = this.n;
      this.i = (this.i + 1) % n; this.buf[this.i] = a; this.buf[this.i + n] = a;
      this.i = (this.i + 1) % n; this.buf[this.i] = b; this.buf[this.i + n] = b;
      const buf = this.buf, base = this.i + 1, c = base + 2 * HB_HALF - 1;
      let acc = 0.5 * buf[c];
      for (let k = 0; k < HB_HALF; k++) acc += HB[k] * (buf[c - (2 * k + 1)] + buf[c + (2 * k + 1)]);
      return acc;
    }
  }

  // Jiles-Atherton magnetic hysteresis, solved with a 2nd-order Runge-Kutta
  // step. M_an = Ms * L((H + alpha*M)/a), L(x) = coth(x) - 1/x.
  class Hysteresis {
    constructor(fs) { this.fs = fs; this.T = 1 / fs; this.alpha = 1.6e-3; this.k = 0.47875; this.reset(); this.set(0.5, 0.5, 0.5); }
    reset() { this.M = 0; this.Hp = 0; this.Hdp = 0; }
    set(drive, sat, width) {
      this.Ms = 0.5 + 1.5 * (1 - sat);
      this.a = this.Ms / (0.01 + 6 * drive);
      this.c = Math.sqrt(1 - width) - 0.01;
      this.lim = this.Ms * 4;
    }
    dMdt(M, H, Hd) {
      const a = this.a, Ms = this.Ms, c = this.c, al = this.alpha;
      const Q = (H + al * M) / a;
      let L, Lp;
      if (Q > -1e-3 && Q < 1e-3) { L = Q / 3; Lp = 1 / 3; }
      else {
        const coth = 1 / Math.tanh(Q);
        L = coth - 1 / Q;
        Lp = 1 / (Q * Q) - coth * coth + 1;
      }
      const Mdiff = Ms * L - M;
      const delta = Hd >= 0 ? 1 : -1;
      const deltaM = (delta > 0) === (Mdiff > 0) && Mdiff !== 0 ? 1 : 0;
      const nc = 1 - c;
      let f1den = nc * delta * this.k - al * Mdiff;
      if (f1den > -1e-9 && f1den < 1e-9) f1den = 1e-9;
      const f1 = nc * deltaM * Mdiff / f1den;
      const f2 = c * Ms / a * Lp;
      const f3 = 1 - c * al * Ms / a * Lp;
      return Hd * (f1 + f2) / f3;
    }
    step(H) {
      const T = this.T;
      // generalized bilinear ("alpha transform") derivative, damped to avoid Nyquist ringing
      const Hd = 1.9 * this.fs * (H - this.Hp) - 0.9 * this.Hdp;
      const k1 = T * this.dMdt(this.M, this.Hp, this.Hdp);
      const k2 = T * this.dMdt(this.M + 0.5 * k1, 0.5 * (H + this.Hp), 0.5 * (Hd + this.Hdp));
      let M = this.M + k2;
      if (!(M > -this.lim && M < this.lim)) M = M > 0 ? this.lim : (M < 0 ? -this.lim : 0); // also catches NaN
      this.M = M; this.Hp = H; this.Hdp = (Hd > -1e7 && Hd < 1e7) ? Hd : 0;
      return M;
    }
  }

  // Record electronics + tape, without playback losses. Used live and for calibration.
  class RecordStage {
    constructor(fs) {
      this.fs = fs;
      this.pre = new Biquad(); this.de = new Biquad();
      this.up = new Upsampler2x(); this.down = new Downsampler2x();
      this.hyst = new Hysteresis(fs * 2);
      this.gIn = 1; this.norm = 1; this.asym = 0;
      this.dcX = 0; this.dcY = 0; this.dcR = 1 - TAU * 8 / fs;
    }
    configure(stock, drive) {
      this.pre.set('hs', stock.emphHz, this.fs, 0.707, stock.emphDb);
      this.de.set('hs', stock.emphHz, this.fs, 0.707, -stock.emphDb);
      this.hyst.set(stock.ja, stock.sat, stock.width);
      // DRIVE: -12 dB .. +18 dB into the tape
      this.gIn = dbToGain(-12 + 30 * drive);
      this.norm = 1 / this.hyst.Ms;
      this.asym = stock.asym || 0;
    }
    reset() { this.pre.reset(); this.de.reset(); this.up.reset(); this.down.reset(); this.hyst.reset(); this.dcX = 0; this.dcY = 0; }
    // returns the tape-domain signal (before hiss) and the de-emphasised output
    toTape(x) {
      const u = this.pre.process(x * this.gIn);
      this.up.push(u);
      // a small magnetic offset makes the loop slightly asymmetric: some 2nd harmonic
      const a = this.hyst.step(this.up.out0 + this.asym);
      const b = this.hyst.step(this.up.out1 + this.asym);
      // strip the offset's DC here so the speed-scaled filters downstream never ring on it
      const y = this.down.push(a, b) * this.norm;
      const d = y - this.dcX + this.dcR * this.dcY; this.dcX = y; this.dcY = d;
      return d;
    }
  }

  // Loudness match: gain that brings a -18 dBFS two-tone back to -18 dBFS after
  // drive, emphasis and saturation. Quiet and medium material stays level when you
  // move DRIVE; peaks compress.
  const makeupCache = new Map();
  function computeMakeup(stock, drive, fs) {
    const key = stock.id + ':' + drive.toFixed(2) + ':' + fs;
    const hit = makeupCache.get(key);
    if (hit) return hit;
    const st = new RecordStage(fs);
    st.configure(stock, drive);
    const amp = dbToGain(-18); // two equal tones: total RMS = amp
    let sIn = 0, sOut = 0;
    const warm = Math.round(fs * 0.03), meas = Math.round(fs * 0.06);
    for (let n = 0; n < warm + meas; n++) {
      const t = n / fs;
      const x = amp * (Math.sin(TAU * 220 * t) + Math.sin(TAU * 1700 * t));
      const y = st.de.process(st.toTape(x));
      if (n >= warm) { sIn += x * x; sOut += y * y; }
    }
    const m = sOut > 0 ? Math.sqrt(sIn / sOut) : 1;
    const v = Math.min(Math.max(m, 0.05), 20);
    if (makeupCache.size > 512) makeupCache.clear();
    makeupCache.set(key, v);
    return v;
  }

  function softCeiling(x) {
    const a = x < 0 ? -x : x;
    if (a <= 0.7) return x;
    const y = 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
    return x < 0 ? -y : y;
  }

  // Wow (slow) and flutter (fast) speed deviation, as a fraction of nominal speed.
  class WowFlutter {
    constructor(fs, seed) {
      this.fs = fs; this.rng = mulberry32(seed || 7);
      this.p1 = 0; this.p2 = 1.3; this.p3 = 0.4; this.p4 = 2.2;
      this.drift = 0; this.driftLP = 0; this.fl = 0; this.fl2 = 0;
      this.kDrift = 1 - Math.exp(-TAU * 0.35 / fs);
      this.kFl = 1 - Math.exp(-TAU * 30 / fs);
    }
    next() {
      const dt = TAU / this.fs;
      this.p1 += 0.55 * dt; if (this.p1 > TAU) this.p1 -= TAU; // capstan rotation
      this.p2 += 1.7 * dt;  if (this.p2 > TAU) this.p2 -= TAU; // pinch roller
      this.p3 += 7.3 * dt;  if (this.p3 > TAU) this.p3 -= TAU; // flutter
      this.p4 += 13.1 * dt; if (this.p4 > TAU) this.p4 -= TAU;
      const r = this.rng() * 2 - 1;
      this.drift += (r * 40 - this.drift) * this.kDrift;
      this.driftLP += (this.drift - this.driftLP) * this.kDrift;
      this.fl += (r - this.fl) * this.kFl;
      this.fl2 += (this.fl - this.fl2) * this.kFl;
      const wow = 0.5 * Math.sin(this.p1) + 0.22 * Math.sin(this.p2) + 0.35 * this.driftLP;
      const flut = 0.16 * Math.sin(this.p3) + 0.07 * Math.sin(this.p4) + 1.2 * this.fl2;
      return wow + flut;
    }
  }

  /*
   * Deck: a tape transport plus the tape chain. process(out) fills a block.
   *
   * Velocity v is in "x speed" (1 = real time, negative = reverse). Modes:
   *   motor  - motor drives the tape toward 1 (playing) or 0 (stopped)
   *   coast  - finger just let go: keeps momentum, then the motor grabs it
   *            back (playing) or friction stops it (stopped)
   *   scrub  - follows a target position set by a finger on the platter
   *   cue    - held rewind / fast-forward at a set speed
   *   seek   - flies to a position at high speed (audible), then resumes
   */
  class Deck {
    constructor(fs) {
      this.fs = fs;
      this.data = null; this.len = 0; this.tapeSR = fs; this.rate = 1; this.tapeGain = 1;
      this.pos = 0; this.v = 0; this.mode = 'motor'; this.playing = false;
      this.target = 0; this.cueSpeed = 0; this.seekMax = 40; this.seekPlay = false; this.seekGain = 1;
      this.ended = false; this.seekDone = false;
      this.wf = new WowFlutter(fs, 11); this.engage = 0;
      this.rec = new RecordStage(fs);
      this.bumpPk = new Biquad(); this.bumpHp = new Biquad(); this.lp1 = new Biquad(); this.lp2 = new Biquad();
      this.dcX = 0; this.dcY = 0; this.dcR = 1 - TAU * 15 / fs;
      this.env = 0; this.envK = 1 - Math.exp(-1 / (0.02 * fs));
      this.filterSpeed = -1; this.filterCountdown = 0;
      this.makeup = 1; this.makeupTarget = 1; this.makeupK = 1 - Math.exp(-1 / (0.03 * fs));
      this.drive = 0.4; this.stock = STOCKS.II;
      this.setStock('II');
    }

    load(int16, tapeSR, gain) {
      this.data = int16; this.len = int16 ? int16.length : 0;
      this.tapeSR = tapeSR || this.fs; this.rate = this.tapeSR / this.fs;
      this.tapeGain = gain || 1;
      this.pos = 0; this.v = 0; this.mode = 'motor'; this.playing = false; this.ended = false;
      this.rec.reset(); this.resetPlayback();
    }
    resetPlayback() { this.bumpPk.reset(); this.bumpHp.reset(); this.lp1.reset(); this.lp2.reset(); this.dcX = 0; this.dcY = 0; this.filterSpeed = -1; }

    // makeup may be precomputed by the caller (the UI thread does this so the
    // audio thread never runs a calibration pass mid-block)
    setStock(id, makeup) {
      this.stock = STOCKS[id] || STOCKS.II;
      this.filterSpeed = -1;
      this.configure(makeup);
    }
    setDrive(d, makeup) { this.drive = Math.min(Math.max(d, 0), 1); this.configure(makeup); }
    configure(makeup) {
      if (this.stock.bypass) { this.makeupTarget = 1; return; }
      this.rec.configure(this.stock, this.drive);
      this.makeupTarget = makeup > 0 ? makeup : computeMakeup(this.stock, this.drive, this.fs);
      this.hissAmp = dbToGain(this.stock.hiss + this.stock.hissCal) / 0.5774;
    }

    play() { if (!this.data) return; if (this.pos >= this.len - 1) this.pos = 0; this.playing = true; this.ended = false; if (this.mode !== 'scrub' && this.mode !== 'seek') this.mode = 'motor'; }
    pause() { this.playing = false; if (this.mode === 'coast') this.mode = 'motor'; }
    scrubStart() { this.mode = 'scrub'; this.target = this.pos; }
    scrubTo(p) { this.target = Math.min(Math.max(p, 0), this.len); }
    scrubEnd() { if (this.mode === 'scrub') this.mode = 'coast'; }
    cue(speed) {
      if (speed) { this.mode = 'cue'; this.cueSpeed = speed; }
      else if (this.mode === 'cue') this.mode = 'motor';
    }
    // Audible high-speed seek. Finishes in ~0.3-0.9 s whatever the distance.
    seek(p, thenPlay) {
      if (!this.data) return;
      this.target = Math.min(Math.max(p, 0), this.len);
      const dist = Math.abs(this.target - this.pos) / this.tapeSR;
      this.seekMax = Math.max(24, dist / 0.55);
      this.seekPlay = thenPlay === undefined ? this.playing : !!thenPlay;
      this.mode = 'seek'; this.seekDone = false;
    }
    jump(p) { this.pos = Math.min(Math.max(p, 0), this.len); this.v = this.playing ? this.v : 0; }

    sample(i) { return (i >= 0 && i < this.len) ? this.data[i] * (1 / 32768) : 0; }

    // 4-point Hermite for |speed| <= 1, box-averaged read above 1x (anti-alias for cue/rewind)
    read(p, step) {
      if (step <= 1.0001) {
        const i = Math.floor(p), f = p - i;
        const xm1 = this.sample(i - 1), x0 = this.sample(i), x1 = this.sample(i + 1), x2 = this.sample(i + 2);
        const c1 = 0.5 * (x1 - xm1), c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
        return ((c3 * f + c2) * f + c1) * f + x0;
      }
      const half = step * 0.5, a = Math.floor(p - half), b = Math.floor(p + half);
      const stride = Math.max(1, Math.floor((b - a) / 48));
      let s = 0, n = 0;
      for (let i = a; i <= b; i += stride) { s += this.sample(i); n++; }
      return n ? s / n : 0;
    }

    updateFilters(speed) {
      const st = this.stock;
      const sp = Math.min(Math.max(speed, 0.04), 64);
      const fs = this.fs;
      this.bumpPk.set('peak', st.bumpHz * sp, fs, 1.1, st.bumpDb);
      this.bumpHp.set('hp', st.bumpHz * 0.38 * sp, fs, 0.6);
      const fc = st.bwHz * sp;
      if (fc >= fs * 0.45) { this.lp1.identity(); this.lp2.identity(); }
      else {
        this.lp1.set('lp', fc, fs, st.bwQ);
        this.lp2.set('lp', Math.min(fc * 1.6, fs * 0.45), fs, 0.5);
      }
      this.filterSpeed = speed;
    }

    stepVelocity() {
      const fs = this.fs;
      let vt, tau;
      switch (this.mode) {
        case 'scrub': {
          const e = (this.target - this.pos) / this.tapeSR; // seconds of tape
          vt = Math.max(-64, Math.min(64, e / 0.028));
          tau = 0.012;
          break;
        }
        case 'seek': {
          const e = (this.target - this.pos) / this.tapeSR;
          vt = Math.max(-this.seekMax, Math.min(this.seekMax, e / 0.06));
          tau = 0.03;
          if (Math.abs(e) < 0.004) {
            this.pos = this.target; this.v = 0; this.mode = 'motor';
            this.playing = this.seekPlay && this.pos < this.len - 1; this.seekDone = true;
            return;
          }
          break;
        }
        case 'cue': vt = this.cueSpeed; tau = 0.09; break;
        case 'coast':
          if (this.playing) { vt = 1; tau = 0.12; } else { vt = 0; tau = 0.6; }
          if (Math.abs(this.v - vt) < 0.02) this.mode = 'motor';
          break;
        default:
          vt = this.playing ? 1 : 0;
          tau = vt > Math.abs(this.v) ? 0.02 : 0.03;
      }
      this.v += (vt - this.v) * (1 - Math.exp(-1 / (tau * fs)));
      if (this.mode === 'motor' && !this.playing && Math.abs(this.v) < 1e-4) this.v = 0;
    }

    process(out) {
      const n = out.length;
      if (!this.data) { out.fill(0); return; }
      const st = this.stock, bypass = !!st.bypass, rate = this.rate;
      for (let s = 0; s < n; s++) {
        this.stepVelocity();
        // wow & flutter only when the motor is pulling the tape
        const wantEngage = (this.mode === 'motor' && this.playing) ? 1 : 0;
        this.engage += (wantEngage - this.engage) * 0.0005;
        const wf = this.wf.next() * st.wf * this.engage;
        const vEff = this.v * (1 + wf);
        const step = vEff * rate;
        const absV = Math.abs(vEff);

        let p = this.pos + step;
        if (p <= 0) { p = 0; if (this.v < 0) this.v = 0; }
        if (p >= this.len) {
          p = this.len;
          if (this.v > 0) this.v = 0;
          if (this.playing && this.mode !== 'scrub') { this.playing = false; this.ended = true; this.mode = 'motor'; }
        }
        this.pos = p;

        let x = this.read(p, Math.abs(step)) * this.tapeGain;
        // cue/rewind chatter is real but loud; tame it as speed rises
        if (absV > 1) x *= 1 / (1 + 0.12 * (absV - 1));

        let y;
        if (bypass) {
          y = x;
        } else {
          if (--this.filterCountdown <= 0) {
            this.filterCountdown = 32;
            const fsN = this.filterSpeed;
            if (fsN < 0 || Math.abs(absV - fsN) > 0.015 * Math.max(fsN, 0.05)) this.updateFilters(absV);
          }
          let t = this.rec.toTape(x);
          if (st.dropouts) t *= this.dropout(p);
          // hiss: noise written on the tape, with a little modulation noise
          const ip = Math.floor(p), fr = p - ip;
          const hz = hashNoise(ip) * (1 - fr) + hashNoise(ip + 1) * fr;
          const ax = x < 0 ? -x : x;
          this.env += (ax - this.env) * this.envK;
          t += hz * this.hissAmp * (1 + 2.5 * this.env) * (absV > 0.0005 ? 1 : 0);
          y = this.rec.de.process(t);
          y = this.bumpHp.process(this.bumpPk.process(y));
          y = this.lp2.process(this.lp1.process(y));
          this.makeup += (this.makeupTarget - this.makeup) * this.makeupK;
          y *= this.makeup;
        }
        // DC blocker
        const d = y - this.dcX + this.dcR * this.dcY; this.dcX = y; this.dcY = d;
        out[s] = softCeiling(d);
      }
    }

    // WORN: oxide dropouts, fixed to tape position (same flaw, same place)
    dropout(p) {
      const segLen = this.tapeSR * 0.06;
      const seg = Math.floor(p / segLen);
      const r = hashNoise(seg * 7919 + 13);
      if (r < 0.9) return 1;
      const depth = 0.35 + 0.5 * (hashNoise(seg * 31 + 7) * 0.5 + 0.5);
      const f = (p - seg * segLen) / segLen;
      const sh = Math.sin(Math.PI * f);
      return 1 - depth * sh * sh;
    }
  }

  // Robust loudness trim for a finished take: 98th percentile of 10 ms block
  // peaks lands at -6 dBFS, never more than +24 dB of gain.
  function computeTrim(int16, sr) {
    const blk = Math.max(1, Math.round(sr * 0.01));
    const peaks = [];
    for (let i = 0; i < int16.length; i += blk) {
      let m = 0;
      const e = Math.min(int16.length, i + blk);
      for (let j = i; j < e; j++) { const a = int16[j] < 0 ? -int16[j] : int16[j]; if (a > m) m = a; }
      peaks.push(m / 32768);
    }
    if (!peaks.length) return 1;
    peaks.sort((a, b) => a - b);
    const p98 = peaks[Math.min(peaks.length - 1, Math.floor(peaks.length * 0.98))];
    if (p98 < 1e-4) return 1;
    return Math.min(dbToGain(24), Math.max(dbToGain(-6), dbToGain(-6) / p98));
  }

  // 48-bar overview for the library row
  function computePeaks(int16, bars) {
    bars = bars || 48;
    const out = new Array(bars).fill(0);
    if (!int16 || !int16.length) return out;
    const per = int16.length / bars;
    for (let b = 0; b < bars; b++) {
      const s = Math.floor(b * per), e = Math.min(int16.length, Math.floor((b + 1) * per));
      let m = 0;
      for (let j = s; j < e; j += 4) { const a = int16[j] < 0 ? -int16[j] : int16[j]; if (a > m) m = a; }
      out[b] = m;
    }
    const mx = Math.max(1, ...out);
    return out.map((v) => Math.round(255 * Math.sqrt(v / mx)));
  }

  function encodeWav(float32, sr) {
    const n = float32.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    wr(36, 'data'); dv.setUint32(40, n * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++, o += 2) {
      let s = float32[i]; s = s > 1 ? 1 : s < -1 ? -1 : s;
      dv.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
    }
    return buf;
  }

  g.CapstanDSP = { STOCKS, STOCK_ORDER, Deck, Biquad, Hysteresis, RecordStage, WowFlutter, Upsampler2x, Downsampler2x, computeMakeup, computeTrim, computePeaks, encodeWav, hashNoise, softCeiling, dbToGain };
})(typeof globalThis !== 'undefined' ? globalThis : this);
