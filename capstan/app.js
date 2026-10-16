/* CAPSTAN CS-1 — UI, transport control, recording, storage, library */
(() => {
  'use strict';

  const DSP = window.CapstanDSP;
  const SEC_PER_REV = 1.8;       // one platter revolution = 1.8 s of tape (33 1/3 rpm at 1x)
  const SIDE_SEC = 15 * 60;      // C30: 15 minutes a side, then roll onto the next tape
  const CHUNK_SEC = 2;           // write to storage every 2 s while recording
  const SKIP_SEC = 5;
  const UNDO_MS = 6000;

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  const el = {
    device: $('device'), led: $('led'), oled: $('oled'), oledCanvas: $('oledCanvas'),
    platter: $('platter'), rot: $('rot'), screws: $('screws'), pack: $('pack'), blur: $('blur'), ringFill: $('ringFill'),
    specRate: $('specRate'), specStock: $('specStock'),
    tapesKey: $('tapesKey'), stockKey: $('stockKey'), stockName: $('stockName'), ffKey: $('ffKey'), rewKey: $('rewKey'),
    recKey: $('recKey'), playKey: $('playKey'), stopKey: $('stopKey'),
    fader: $('fader'), faderSlot: $('faderSlot'),
    sticker: $('sticker'), stickerText: $('stickerText'), stickerX: $('stickerX'),
    scrim: $('scrim'), sheet: $('sheet'), doneKey: $('doneKey'), libCount: $('libCount'), libMonth: $('libMonth'), libYear: $('libYear'),
    cal: $('cal'), libScroll: $('libScroll'), libList: $('libList'), libEmpty: $('libEmpty'), emptyRec: $('emptyRec'),
    setClicks: $('setClicks'), setRewind: $('setRewind'), setExportTape: $('setExportTape'), storage: $('storage'),
    toast: $('toast'), toastText: $('toastText'), toastUndo: $('toastUndo'), live: $('live'),
  };

  // ------------------------------------------------------------------ state
  const S = {
    tapes: [], cur: null, rec: null,
    playing: false, pos: 0, v: 0, mode: 'motor', len: 0, tapeSR: 48000, reportAt: 0, cmdAt: 0,
    dragging: false, dragPos: 0, pointerId: null,
    settings: { clicks: true, autoRewind: true, exportTape: true },
    defaults: { stock: 'II', drive: 0.4 },
    nextNum: 1, msg: null, arming: false, busy: false, sheetOpen: false, openRow: null, renaming: null,
    exporting: false, drive: 0.4,
  };

  // ------------------------------------------------------------------ storage
  const DB = {
    db: null,
    open() {
      return new Promise((resolve, reject) => {
        const r = indexedDB.open('capstan', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('tapes')) db.createObjectStore('tapes', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['tapeId', 'seq'] });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        r.onsuccess = () => { this.db = r.result; resolve(); };
        r.onerror = () => reject(r.error);
      });
    },
    run(store, mode, fn) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(store, mode);
        let result;
        const req = fn(tx.objectStore(store));
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
    },
    tapes() { return this.run('tapes', 'readonly', (s) => s.getAll()); },
    putTape(t) { return this.run('tapes', 'readwrite', (s) => s.put(t)); },
    putChunk(tapeId, seq, data) { return this.run('chunks', 'readwrite', (s) => s.put({ tapeId, seq, data })); },
    async chunks(tapeId) {
      const rows = await this.run('chunks', 'readonly', (s) => s.getAll(IDBKeyRange.bound([tapeId, 0], [tapeId, Infinity])));
      return rows.sort((a, b) => a.seq - b.seq).map((r) => r.data);
    },
    remove(tapeId) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['tapes', 'chunks'], 'readwrite');
        tx.objectStore('tapes').delete(tapeId);
        tx.objectStore('chunks').delete(IDBKeyRange.bound([tapeId, 0], [tapeId, Infinity]));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    get(key) { return this.run('meta', 'readonly', (s) => s.get(key)); },
    set(key, v) { return this.run('meta', 'readwrite', (s) => s.put(v, key)); },
  };
  // Writes are serialised so chunks land in order even when the UI is busy.
  let writeQ = Promise.resolve();
  const queue = (fn) => (writeQ = writeQ.then(fn).catch(storageProblem));

  function concat(bufs) {
    let n = 0;
    for (const b of bufs) n += (b.length !== undefined ? b.length : b.byteLength / 2);
    const out = new Int16Array(n);
    let o = 0;
    for (const b of bufs) { const a = b instanceof Int16Array ? b : new Int16Array(b); out.set(a, o); o += a.length; }
    return out;
  }

  // ------------------------------------------------------------------ audio
  const A = { ctx: null, node: null, ready: null, src: null, recNode: null, sink: null, clicks: {} };

  function setSession(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* not supported */ } }

  function audio() {
    if (A.ready) return A.ready;
    A.ready = (async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx({ latencyHint: 'interactive' });
      setSession('playback'); // plays with the ringer switch on silent
      await A.ctx.audioWorklet.addModule('dsp.js');
      await A.ctx.audioWorklet.addModule('worklet.js');
      A.node = new AudioWorkletNode(A.ctx, 'capstan-transport', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      A.node.connect(A.ctx.destination);
      A.node.port.onmessage = onDeck;
      A.ctx.onstatechange = onCtxState;
      buildClicks();
      el.specRate.textContent = Math.round(A.ctx.sampleRate / 1000) + '/16';
    })();
    A.ready.catch((err) => { console.error(err); flash('AUDIO', 'ERROR', 4000); });
    return A.ready;
  }

  function unlock() {
    if (!A.ctx) { audio(); return; }
    if (A.ctx.state !== 'running') A.ctx.resume().catch(() => {});
  }

  function post(msg, transfer) { if (A.node) A.node.port.postMessage(msg, transfer || []); }

  function makeupFor(stock, drive) {
    const st = DSP.STOCKS[stock];
    if (!st || st.bypass) return 1;
    return DSP.computeMakeup(st, Math.round(drive * 100) / 100, A.ctx ? A.ctx.sampleRate : 48000);
  }

  function onDeck(e) {
    const m = e.data;
    if (m.t === 'state') {
      S.pos = m.pos; S.v = m.v; S.mode = m.mode; S.reportAt = performance.now();
      if (performance.now() - S.cmdAt > 200 && S.playing !== m.playing) { S.playing = m.playing; renderKeys(); }
    } else if (m.t === 'ended') {
      S.playing = false; renderKeys(); say('End of tape');
    } else if (m.t === 'seekDone') {
      S.cmdAt = 0;
    }
  }

  function onCtxState() {
    const st = A.ctx.state;
    if (S.rec && S.rec.started && (st === 'interrupted' || st === 'suspended')) stopRecording({ reason: 'interrupted' });
  }

  // synthesized mechanical key sounds
  function buildClicks() {
    const sr = A.ctx.sampleRate;
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const mk = (dur, fn) => {
      const b = A.ctx.createBuffer(1, Math.round(dur * sr), sr), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = fn(i / sr);
      return b;
    };
    const TAU = Math.PI * 2;
    A.clicks.key = mk(0.03, (t) => (rnd() * Math.exp(-t * 900) * 0.45 + Math.sin(TAU * 1900 * t) * Math.exp(-t * 700) * 0.25) * 0.3);
    A.clicks.latch = mk(0.1, (t) => (rnd() * Math.exp(-t * 520) * 0.3 + Math.sin(TAU * 92 * t) * Math.exp(-t * 48) * 0.7 + Math.sin(TAU * 2600 * t) * Math.exp(-t * 900) * 0.18) * 0.32);
    A.clicks.tick = mk(0.012, (t) => rnd() * Math.exp(-t * 2600) * 0.22);
  }
  function click(kind) {
    if (!S.settings.clicks || !A.ctx || A.ctx.state !== 'running' || !A.clicks[kind]) return;
    const s = A.ctx.createBufferSource();
    s.buffer = A.clicks[kind];
    s.connect(A.ctx.destination);
    s.start();
  }

  // iOS has no Vibration API; Safari 17.4+ ticks the Taptic Engine when a
  // switch checkbox toggles. Best effort only: nothing depends on it.
  const haptic = (() => {
    let label = null, last = 0;
    return () => {
      const now = performance.now();
      if (now - last < 35) return;
      last = now;
      if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) { /* ignore */ } return; }
      if (!isIOS) return;
      try {
        if (!label) {
          label = document.createElement('label');
          label.setAttribute('aria-hidden', 'true');
          label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
          const input = document.createElement('input');
          input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
          label.appendChild(input);
          document.body.appendChild(label);
        }
        label.click();
      } catch (e) { /* ignore */ }
    };
  })();

  // ------------------------------------------------------------------ OLED (96x32 pixels, 5x7 font)
  const GLYPHS = {
    A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
    C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
    E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
    I: '111 010 010 010 010 010 111', J: '00111 00010 00010 00010 00010 10010 01100',
    K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
    O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
    Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
    W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
    0: '01110 10001 10001 10001 10001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
    2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
    4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
    6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
    8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
    '.': '0 0 0 0 0 0 1', ':': '0 0 1 0 0 1 0', '-': '000 000 000 111 000 000 000',
    '+': '00000 00100 00100 11111 00100 00100 00000', '/': '00001 00001 00010 00100 01000 10000 10000',
    ' ': '000 000 000 000 000 000 000', '%': '11000 11001 00010 00100 01000 10011 00011',
    '!': '1 1 1 1 1 0 1', '?': '01110 10001 00001 00010 00100 00000 00100', "'": '1 1 0 0 0 0 0',
    '*': '00000 01110 11111 11111 11111 01110 00000', '>': '10000 11000 11100 11110 11100 11000 10000',
    '<': '00001 00011 00111 01111 00111 00011 00001', '#': '00000 11111 11111 11111 11111 11111 00000',
    '|': '00000 11011 11011 11011 11011 11011 00000',
  };
  const FONT = {};
  for (const [ch, src] of Object.entries(GLYPHS)) {
    const rows = src.split(' ');
    FONT[ch] = { w: rows[0].length, rows: rows.map((r) => [...r].map(Number)) };
  }

  const oled = {
    W: 96, H: 32, fb: new Uint8Array(96 * 32), key: '', bg: null,
    ctx: el.oledCanvas.getContext('2d'),
    resize() {
      const r = el.oledCanvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      el.oledCanvas.width = Math.max(96, Math.round(r.width * dpr));
      el.oledCanvas.height = Math.max(32, Math.round(r.height * dpr));
      const bg = document.createElement('canvas');
      bg.width = el.oledCanvas.width; bg.height = el.oledCanvas.height;
      const b = bg.getContext('2d'), cw = bg.width / 96, ch = bg.height / 32, g = Math.max(0.6, cw * 0.16);
      b.fillStyle = '#060606'; b.fillRect(0, 0, bg.width, bg.height);
      b.fillStyle = '#0f0f0f';
      for (let y = 0; y < 32; y++) for (let x = 0; x < 96; x++) b.fillRect(x * cw + g / 2, y * ch + g / 2, cw - g, ch - g);
      this.bg = bg; this.key = '';
    },
    clear() { this.fb.fill(0); },
    px(x, y, v) { if (x >= 0 && x < 96 && y >= 0 && y < 32) this.fb[y * 96 + x] = v; },
    rect(x, y, w, h, v) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, v); },
    measure(str, s) { let w = 0; for (const c of str) w += ((FONT[c] || FONT['?']).w + 1) * s; return Math.max(0, w - s); },
    text(str, x, y, s, v = 1) {
      for (const c of str) {
        const g = FONT[c] || FONT['?'];
        for (let r = 0; r < 7; r++) for (let k = 0; k < g.w; k++) if (g.rows[r][k]) this.rect(x + k * s, y + r * s, s, s, v);
        x += (g.w + 1) * s;
      }
      return x;
    },
    flush() {
      const c = el.oledCanvas, ctx = this.ctx, cw = c.width / 96, ch = c.height / 32, g = Math.max(0.6, cw * 0.16);
      if (this.bg) ctx.drawImage(this.bg, 0, 0);
      ctx.fillStyle = '#f3f3ee';
      for (let y = 0; y < 32; y++) for (let x = 0; x < 96; x++) if (this.fb[y * 96 + x]) ctx.fillRect(x * cw + g / 2, y * ch + g / 2, cw - g, ch - g);
    },
  };

  function drawOled(o) {
    const key = JSON.stringify(o);
    if (key === oled.key) return;
    oled.key = key;
    oled.clear();
    if (o.l1) oled.text(o.l1.toUpperCase(), 1, 1, 2);
    let l2Right = 95;
    if (o.badge) {
      const w = oled.measure(o.badge, 1) + 5, x = 96 - w;
      oled.rect(x, 17, w, 11, 1);
      oled.text(o.badge, x + 3, 19, 1, 0);
      l2Right = x - 2;
    }
    if (o.l2) oled.text(o.l2.toUpperCase().slice(0, 16), 1, 19, 1);
    if (o.meter != null) {
      const segs = 23, lit = Math.round(o.meter * segs);
      for (let i = 0; i < segs; i++) { if (i < lit) oled.rect(1 + i * 4, 29, 3, 3, 1); else oled.px(2 + i * 4, 30, 1); }
    } else if (o.bar != null) {
      for (let x = 1; x < 95; x += 2) oled.px(x, 30, 1);
      oled.rect(1, 29, Math.round(clamp(o.bar, 0, 1) * 94), 3, 1);
    }
    void l2Right;
    oled.flush();
  }

  // ------------------------------------------------------------------ formatting
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}.${pad2(m)}.${pad2(s)}`;
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}:${pad2(m)}:${pad2(s)}`;
  }
  function spoken(sec) {
    sec = Math.round(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? `${m} minute${m === 1 ? '' : 's'} ${s} second${s === 1 ? '' : 's'}` : `${s} second${s === 1 ? '' : 's'}`;
  }
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const MONTHS_LONG = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  function dayLabel(ts) {
    const d = new Date(ts), today = dayStart(new Date());
    const diff = Math.round((today - dayStart(d)) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff > 0 && diff < 7) return `${DAYS[d.getDay()]} ${d.getDate()}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  function dayHeading(ts) {
    const d = new Date(ts), today = dayStart(new Date());
    const diff = Math.round((today - dayStart(d)) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'YESTERDAY';
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
  }
  const clock = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const tapeName = (t) => t.name || clock(t.createdAt);
  const tapeSec = (t) => (t.length || 0) / (t.sr || 48000);

  function flash(l1, l2, ms = 1500, extra) { S.msg = Object.assign({ l1, l2, until: performance.now() + ms }, extra || {}); }
  function say(text) { el.live.textContent = ''; setTimeout(() => { el.live.textContent = text; }, 30); }

  // ------------------------------------------------------------------ transport commands
  const curStock = () => (S.cur ? S.cur.stock : S.defaults.stock);
  const curDrive = () => (S.cur ? S.cur.drive : S.defaults.drive);

  function estPos(now = performance.now()) {
    const dt = Math.min(0.06, Math.max(0, (now - S.reportAt) / 1000));
    return clamp(S.pos + S.v * S.tapeSR * dt, 0, S.len);
  }

  function play() {
    if (!S.cur) return;
    unlock();
    if (estPos() >= S.len - 1) { post({ t: 'jump', pos: 0 }); S.pos = 0; }
    post({ t: 'play' });
    S.playing = true; S.cmdAt = performance.now();
    renderKeys(); say('Playing');
  }
  function pause() {
    post({ t: 'pause' });
    S.playing = false; S.cmdAt = performance.now();
    renderKeys();
  }

  function onRec() {
    if (S.busy) return;
    if (S.rec) { togglePause(); return; }
    startRecording();
  }
  function onPlay() {
    if (S.busy) return;
    if (S.rec) { stopRecording({ thenPlay: true }); return; }
    if (!S.cur) { flash('NO TAPE', 'PRESS * REC', 1800); return; }
    click('latch'); haptic();
    if (S.playing) pause(); else play();
  }
  function onStop() {
    if (S.busy) return;
    click('latch'); haptic();
    if (S.rec) { stopRecording(); return; }
    if (!S.cur) return;
    if (S.playing) { pause(); say('Stopped'); return; }
    if (estPos() > 1) { post({ t: 'seek', pos: 0, play: false }); S.cmdAt = performance.now(); say('Rewinding to the start'); }
  }

  function skip(dir) {
    if (!S.cur || S.rec) return;
    const p = clamp(estPos() + dir * SKIP_SEC * S.tapeSR, 0, S.len);
    post({ t: 'seek', pos: p, play: S.playing });
    S.cmdAt = performance.now();
  }

  // ------------------------------------------------------------------ recording
  function newTape(sr) {
    const now = Date.now();
    const t = {
      id: 't' + now.toString(36) + Math.random().toString(36).slice(2, 7),
      num: S.nextNum++, name: '', createdAt: now, sr, length: 0,
      stock: S.defaults.stock, drive: S.defaults.drive, gain: 1, peaks: [], complete: false, deleted: false,
    };
    S.tapes.push(t);
    queue(() => DB.putTape(t));
    queue(() => DB.set('nextNum', S.nextNum));
    return t;
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showSticker('secure'); flash('NO MIC', 'NEEDS HTTPS', 3000); return; }
    S.busy = true; S.arming = true; renderKeys();
    try {
      await audio();
      unlock();
      if (S.playing) pause();
      let stream;
      try {
        setSession('play-and-record');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        });
      } catch (err) {
        setSession('playback');
        micProblem(err);
        return;
      }
      unlock();
      const sr = A.ctx.sampleRate;
      const tape = newTape(sr);
      S.rec = { tape, stream, sr, chunks: [], pend: [], pendLen: 0, seq: 0, samples: 0, paused: false, level: 0, warned: false, started: false };
      A.src = A.ctx.createMediaStreamSource(stream);
      A.recNode = new AudioWorkletNode(A.ctx, 'capstan-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      A.recNode.port.onmessage = onRecMsg;
      A.sink = A.ctx.createGain();
      A.sink.gain.value = 0;
      A.src.connect(A.recNode);
      A.recNode.connect(A.sink);
      A.sink.connect(A.ctx.destination);
      wakeLock(true);
      click('latch'); haptic();
      hideSticker('mic');
      say(`Recording tape ${tape.num}`);
    } finally {
      S.arming = false; S.busy = false; renderKeys();
    }
  }

  function micProblem(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') { flash('NO MIC', 'ACCESS BLOCKED', 4000); showSticker('mic'); say('Microphone access is blocked.'); }
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') { flash('NO MIC', 'NOT FOUND', 3000); say('No microphone found.'); }
    else { flash('NO MIC', 'TRY AGAIN', 3000); say('The microphone could not start. Try again.'); }
  }

  function onRecMsg(e) {
    const m = e.data, r = S.rec;
    if (!r) return;
    if (m.t === 'stopped') { if (r.onStopped) r.onStopped(); return; }
    if (m.t !== 'data') return;
    r.started = true;
    r.level = Math.max(r.level, m.peak);
    if (r.paused) return;
    const f = new Float32Array(m.buf), n = f.length, i16 = new Int16Array(n);
    for (let i = 0; i < n; i++) { const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]; i16[i] = s < 0 ? s * 32768 : s * 32767; }
    append(r, i16);
  }

  function append(r, i16) {
    const max = SIDE_SEC * r.sr;
    let off = 0;
    while (off < i16.length) {
      const take = Math.min(max - r.samples, i16.length - off);
      r.pend.push(i16.subarray(off, off + take));
      r.pendLen += take; r.samples += take; off += take;
      if (r.pendLen >= CHUNK_SEC * r.sr) flush(r);
      if (r.samples >= max) rollover(r);
    }
    if (!r.warned && r.samples > (SIDE_SEC - 60) * r.sr) { r.warned = true; flash('1 MIN', 'LEFT ON SIDE', 3000); say('One minute left on this tape. Recording continues on the next one.'); }
  }

  function flush(r) {
    if (!r.pendLen) return;
    const a = concat(r.pend);
    r.pend = []; r.pendLen = 0;
    r.chunks.push(a);
    const seq = r.seq++, tape = r.tape;
    tape.length = (tape.length || 0) + a.length;
    queue(() => DB.putChunk(tape.id, seq, a.buffer));
    queue(() => DB.putTape(tape));
  }

  function finalize(tape, chunks) {
    const data = concat(chunks);
    tape.length = data.length;
    tape.peaks = DSP.computePeaks(data);
    tape.gain = DSP.computeTrim(data, tape.sr);
    tape.complete = true;
    queue(() => DB.putTape(tape));
    return data;
  }

  // Side full: close this tape and keep recording onto a fresh one, no gap.
  function rollover(r) {
    flush(r);
    finalize(r.tape, r.chunks);
    const t = newTape(r.sr);
    r.tape = t; r.chunks = []; r.seq = 0; r.samples = 0; r.warned = false;
    flash('NEW TAPE', 'TAPE ' + pad2(t.num), 2500);
    renderLibrary();
  }

  function togglePause() {
    const r = S.rec;
    r.paused = !r.paused;
    click('latch'); haptic();
    say(r.paused ? 'Recording paused' : 'Recording');
    renderKeys();
  }

  function teardownMic(r) {
    try { A.src && A.src.disconnect(); } catch (e) { /* ignore */ }
    try { A.recNode && A.recNode.disconnect(); } catch (e) { /* ignore */ }
    try { A.sink && A.sink.disconnect(); } catch (e) { /* ignore */ }
    A.src = A.recNode = A.sink = null;
    try { r.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
    setSession('playback'); // back to the loud speaker, privacy dot off
  }

  async function stopRecording(opts = {}) {
    const r = S.rec;
    if (!r || r.stopping) return;
    r.stopping = true;
    S.busy = true;
    await new Promise((res) => {
      r.onStopped = res;
      try { A.recNode.port.postMessage({ t: 'stop' }); } catch (e) { res(); }
      setTimeout(res, 150);
    });
    S.rec = null;
    teardownMic(r);
    wakeLock(false);
    flush(r);
    const tape = r.tape;
    S.busy = false;
    if (!r.samples) {
      S.tapes = S.tapes.filter((t) => t !== tape);
      queue(() => DB.remove(tape.id));
      renderKeys(); renderLibrary();
      return;
    }
    const data = finalize(tape, r.chunks);
    const len = data.length;
    loadData(tape, data, len); // data's buffer moves to the audio thread here
    if (opts.thenPlay) {
      post({ t: 'seek', pos: 0, play: true }); S.playing = true; S.cmdAt = performance.now();
    } else if (S.settings.autoRewind) {
      post({ t: 'seek', pos: 0, play: false }); S.cmdAt = performance.now();
    }
    if (opts.reason) flash('SAVED', opts.reason === 'background' ? 'APP WAS CLOSED' : 'INTERRUPTED', 3500, { badge: pad2(tape.num) });
    else flash('SAVED', fmtTime(len / tape.sr), 1700, { badge: pad2(tape.num) });
    say(`Saved tape ${tape.num}, ${spoken(len / tape.sr)}`);
    renderKeys(); renderLibrary();
  }

  // ------------------------------------------------------------------ loading tapes
  function loadData(tape, data, pos = 0) {
    S.cur = tape; S.len = data.length; S.tapeSR = tape.sr; S.pos = pos; S.v = 0; S.playing = false;
    S.reportAt = performance.now(); S.cmdAt = performance.now();
    const mk = makeupFor(tape.stock, tape.drive);
    post({ t: 'load', data: data.buffer, sr: tape.sr, gain: tape.gain, stock: tape.stock, drive: Math.round(tape.drive * 100) / 100, makeup: mk, pos }, [data.buffer]);
    queue(() => DB.set('last', tape.id));
    renderStatic(); renderKeys();
  }

  async function loadTape(t, andPlay) {
    if (S.rec || !t) return;
    await audio();
    const data = concat(await DB.chunks(t.id));
    if (!data.length) { flash('EMPTY', 'TAPE ' + pad2(t.num), 2000); return; }
    loadData(t, data, 0);
    if (andPlay) play();
    else flash(dayLabel(t.createdAt), 'TAPE ' + pad2(t.num), 1200);
  }

  function unloadCurrent() {
    post({ t: 'unload' });
    S.cur = null; S.len = 0; S.pos = 0; S.v = 0; S.playing = false;
    renderStatic(); renderKeys();
  }

  // ------------------------------------------------------------------ platter
  const P = { cx: 0, cy: 0, R: 1, lastAng: 0, tick: 0 };

  function platterDown(e) {
    if (e.button > 0 || S.pointerId != null) return;
    if (S.rec) { el.platter.classList.remove('locked'); void el.platter.offsetWidth; el.platter.classList.add('locked'); flash('LOCKED', 'RECORDING', 1200); haptic(); return; }
    if (!S.cur || !S.len) { flash('NO TAPE', 'PRESS * REC', 1800); return; }
    e.preventDefault();
    unlock();
    el.platter.setPointerCapture(e.pointerId);
    S.pointerId = e.pointerId;
    const r = el.platter.getBoundingClientRect();
    P.cx = r.left + r.width / 2; P.cy = r.top + r.height / 2; P.R = r.width / 2;
    P.lastAng = Math.atan2(e.clientY - P.cy, e.clientX - P.cx);
    S.dragPos = estPos();
    P.tick = Math.floor((S.dragPos / S.tapeSR / SEC_PER_REV) * 12);
    S.dragging = true;
    post({ t: 'scrubStart' });
    el.platter.classList.add('grab');
  }
  function platterMove(e) {
    if (e.pointerId !== S.pointerId) return;
    const dx = e.clientX - P.cx, dy = e.clientY - P.cy;
    if (Math.hypot(dx, dy) < P.R * 0.14) return; // angle is meaningless at the very centre
    const ang = Math.atan2(dy, dx);
    let d = ang - P.lastAng;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    P.lastAng = ang;
    const prev = S.dragPos;
    S.dragPos = clamp(S.dragPos + (d / (2 * Math.PI)) * SEC_PER_REV * S.tapeSR, 0, S.len);
    post({ t: 'scrub', pos: S.dragPos });
    const tick = Math.floor((S.dragPos / S.tapeSR / SEC_PER_REV) * 12);
    if (tick !== P.tick) { P.tick = tick; haptic(); }
    if ((S.dragPos === 0 || S.dragPos === S.len) && prev !== S.dragPos) haptic();
  }
  function platterUp(e) {
    if (e.pointerId !== S.pointerId) return;
    S.pointerId = null; S.dragging = false;
    post({ t: 'scrubEnd' });
    S.pos = S.dragPos; S.reportAt = performance.now();
    el.platter.classList.remove('grab');
  }

  function platterKey(e) {
    if (!S.cur) return;
    const step = e.shiftKey ? 1 : SKIP_SEC;
    let handled = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') skip(-step / SKIP_SEC);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') skip(step / SKIP_SEC);
    else if (e.key === 'Home') { post({ t: 'seek', pos: 0, play: S.playing }); }
    else if (e.key === 'End') { post({ t: 'seek', pos: S.len, play: false }); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // ------------------------------------------------------------------ cue keys
  function bindCue(btn, dir) {
    let pid = null, cueing = false, t1 = 0, t2 = 0;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || pid != null) return;
      e.preventDefault();
      if (S.rec) { flash('LOCKED', 'RECORDING', 1200); return; }
      if (!S.cur) { flash('NO TAPE', 'PRESS * REC', 1800); return; }
      unlock();
      pid = e.pointerId; btn.setPointerCapture(pid); btn.classList.add('down');
      click('key'); haptic();
      cueing = false;
      t1 = setTimeout(() => { cueing = true; post({ t: 'cue', speed: dir * 4 }); S.cmdAt = performance.now(); haptic(); }, 260);
      t2 = setTimeout(() => { post({ t: 'cue', speed: dir * 12 }); haptic(); }, 1300);
    });
    const end = (e, cancelled) => {
      if (e.pointerId !== pid) return;
      pid = null; btn.classList.remove('down');
      clearTimeout(t1); clearTimeout(t2);
      if (cueing) { post({ t: 'cue', speed: 0 }); S.cmdAt = performance.now(); }
      else if (!cancelled) skip(dir);
    };
    btn.addEventListener('pointerup', (e) => end(e, false));
    btn.addEventListener('pointercancel', (e) => end(e, true));
    btn.addEventListener('click', (e) => { if (e.detail === 0) skip(dir); }); // keyboard
  }

  // ------------------------------------------------------------------ stock + drive
  function cycleStock() {
    const order = DSP.STOCK_ORDER, id = order[(order.indexOf(curStock()) + 1) % order.length];
    setStock(id);
  }
  function setStock(id) {
    const st = DSP.STOCKS[id];
    S.defaults.stock = id;
    if (S.cur) { S.cur.stock = id; const t = S.cur; queue(() => DB.putTape(t)); }
    queue(() => DB.set('defaults', S.defaults));
    post({ t: 'stock', id, makeup: makeupFor(id, curDrive()) });
    click('tick'); haptic();
    flash(st.label, st.sub, 1500);
    say(`Tape stock ${st.label.replace(' II', ' 2').replace(' I', ' 1')}, ${st.sub.toLowerCase()}`);
    renderStatic();
  }

  let driveSent = 0, driveTimer = 0, driveTick = -1;
  function setDrive(v, commit) {
    v = clamp(v, 0, 1);
    S.drive = v;
    S.defaults.drive = v;
    if (S.cur) S.cur.drive = v;
    el.fader.style.setProperty('--fv', v.toFixed(4));
    el.fader.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    const send = () => { driveSent = performance.now(); const q = Math.round(v * 100) / 100; post({ t: 'drive', v: q, makeup: makeupFor(curStock(), q) }); };
    clearTimeout(driveTimer);
    if (performance.now() - driveSent > 45) send(); else driveTimer = setTimeout(send, 50);
    const tick = Math.round(v * 10);
    if (tick !== driveTick) { driveTick = tick; haptic(); }
    flash('DRIVE', String(Math.round(v * 100)), 1200, { bar: v });
    if (commit) {
      if (S.cur) { const t = S.cur; queue(() => DB.putTape(t)); }
      queue(() => DB.set('defaults', S.defaults));
    }
  }
  function bindFader() {
    let pid = null, y0 = 0, v0 = 0;
    el.fader.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || pid != null) return;
      e.preventDefault(); unlock();
      pid = e.pointerId; el.fader.setPointerCapture(pid);
      y0 = e.clientY; v0 = S.drive;
      // a tap on the slot (not the cap) jumps there; dragging is always relative
      const r = el.faderSlot.getBoundingClientRect();
      const capY = r.top + 6 + (r.height - 12) * (1 - S.drive);
      if (Math.abs(e.clientY - capY) > 26 && e.clientY > r.top && e.clientY < r.bottom) {
        v0 = clamp(1 - (e.clientY - r.top - 6) / (r.height - 12), 0, 1);
        setDrive(v0);
      }
      click('tick');
    });
    el.fader.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const r = el.faderSlot.getBoundingClientRect();
      setDrive(v0 + (y0 - e.clientY) / Math.max(40, r.height - 12));
    });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; setDrive(S.drive, true); };
    el.fader.addEventListener('pointerup', end);
    el.fader.addEventListener('pointercancel', end);
    el.fader.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); setDrive(S.drive + d, true); }
    });
  }

  // ------------------------------------------------------------------ rendering
  let lastAria = 0;
  function renderStatic() {
    const st = DSP.STOCKS[curStock()];
    el.stockName.textContent = st.label;
    el.stockKey.setAttribute('aria-label', `Tape stock: ${st.label}, ${st.sub.toLowerCase()}. Tap to change.`);
    el.specStock.textContent = { I: 'I', II: 'II', R15: '15', WORN: 'W', DIRECT: 'D' }[st.id];
    S.drive = curDrive();
    el.fader.style.setProperty('--fv', S.drive.toFixed(4));
    el.fader.setAttribute('aria-valuenow', String(Math.round(S.drive * 100)));
    el.pack.classList.toggle('show', !!(S.cur || S.rec));
    lastAria = 0;
  }

  function renderKeys() {
    const r = S.rec;
    el.recKey.setAttribute('aria-pressed', r ? 'true' : 'false');
    el.recKey.classList.toggle('paused', !!(r && r.paused));
    el.recKey.setAttribute('aria-label', r ? (r.paused ? 'Resume recording' : 'Pause recording') : 'Record');
    el.playKey.setAttribute('aria-pressed', S.playing ? 'true' : 'false');
    el.playKey.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
    el.ringFill.classList.toggle('rec', !!r);
    el.pack.classList.toggle('show', !!(S.cur || r));
  }

  function oledState(now) {
    const r = S.rec;
    if (S.msg && now < S.msg.until) return { l1: S.msg.l1, l2: S.msg.l2, badge: S.msg.badge, bar: S.msg.bar };
    S.msg = null;
    const blinkOn = Math.floor(now / 500) % 2 === 0;
    if (S.arming) return { l1: blinkOn ? 'ARMING' : '', l2: 'ALLOW MIC' };
    if (r) {
      const lvl = clamp((20 * Math.log10(Math.max(r.level, 1e-5)) + 48) / 48, 0, 1);
      return { l1: r.paused ? (blinkOn ? 'PAUSE' : '') : '* REC', l2: fmtTime(r.samples / r.sr), badge: pad2(r.tape.num), meter: r.paused ? 0 : Math.round(lvl * 23) / 23 };
    }
    if (!S.cur) return { l1: 'READY', l2: 'PRESS * REC' };
    const pos = S.dragging ? S.dragPos : estPos(now);
    const sec = pos / S.tapeSR;
    const v = S.v, av = Math.abs(v);
    const moving = S.dragging || S.mode === 'scrub' || S.mode === 'coast' || S.mode === 'seek' || S.mode === 'cue';
    if (moving && (Math.abs(av - 1) > 0.04 || S.dragging)) {
      const sp = av < 0.05 ? 'HOLD' : `${v < 0 ? '<' : '>'}${av >= 1.95 && (S.mode === 'seek' || S.mode === 'cue') ? (v < 0 ? '<' : '>') : ''} ${av >= 10 ? Math.round(av) : av.toFixed(1)}X`;
      return { l1: sp, l2: fmtTime(sec), badge: pad2(S.cur.num), bar: S.len ? pos / S.len : 0 };
    }
    return { l1: dayLabel(S.cur.createdAt), l2: fmtTime(sec) + (S.playing ? ' >' : ''), badge: pad2(S.cur.num), bar: S.len ? pos / S.len : 0 };
  }

  let lastDeg = null, lastPk = null, lastRing = null, lastBlur = null, lastLed = '';
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const r = S.rec;
    let sec = 0, ring = 0, speed = 0;
    if (r) { sec = r.samples / r.sr; ring = sec / SIDE_SEC; speed = r.paused ? 0 : 1; }
    else if (S.cur && S.len) {
      const p = S.dragging ? S.dragPos : estPos(now);
      sec = p / S.tapeSR; ring = p / S.len; speed = Math.abs(S.v);
    }
    const deg = Math.round(((sec / SEC_PER_REV) * 360) % 360 * 100) / 100;
    if (deg !== lastDeg) { lastDeg = deg; const tf = `rotate(${deg}deg)`; el.rot.style.transform = tf; el.screws.style.transform = tf; }
    // tape pack: wound tape area grows linearly with time, so radius grows with sqrt
    const hub = 0.47, frac = clamp(sec / SIDE_SEC, 0, 1);
    const pk = Math.round(Math.sqrt(hub * hub + (1 - hub * hub) * frac) * 1000) / 1000;
    if (pk !== lastPk) { lastPk = pk; el.pack.style.setProperty('--pk', pk); }
    const ro = Math.round(1000 - clamp(ring, 0, 1) * 1000);
    if (ro !== lastRing) { lastRing = ro; el.ringFill.style.strokeDashoffset = ro; }
    const bl = Math.round(clamp((speed - 2.5) / 14, 0, 0.55) * 100) / 100;
    if (bl !== lastBlur) { lastBlur = bl; el.blur.style.opacity = bl; }
    // LED: glows with input level while recording, blinks while arming or paused
    let led = 'off';
    if (S.arming || (r && r.paused)) led = 'blink';
    else if (r) led = 'on';
    if (led !== lastLed) { lastLed = led; el.led.classList.toggle('on', led !== 'off'); el.led.classList.toggle('blink', led === 'blink'); }
    if (r) el.led.style.setProperty('--lvl', clamp((20 * Math.log10(Math.max(r.level, 1e-5)) + 42) / 42, 0, 1).toFixed(2));
    drawOled(oledState(now));
    if (r) r.level *= 0.88;
    if (S.cur && now - lastAria > 1000) {
      lastAria = now;
      const total = Math.round(S.len / S.tapeSR), at = Math.round(sec);
      el.platter.setAttribute('aria-valuemax', String(total));
      el.platter.setAttribute('aria-valuenow', String(at));
      el.platter.setAttribute('aria-valuetext', `Tape ${S.cur.num}: ${spoken(at)} of ${spoken(total)}`);
    }
  }

  // ------------------------------------------------------------------ library sheet
  function liveTapes() { return S.tapes.filter((t) => !t.deleted && (t.complete || (S.rec && t === S.rec.tape))); }

  function renderLibrary() {
    const tapes = liveTapes();
    el.libCount.textContent = pad2(tapes.length);
    const now = new Date();
    el.libMonth.textContent = MONTHS_LONG[now.getMonth()];
    el.libYear.textContent = String(now.getFullYear());
    renderCalendar(tapes, now);

    el.libList.textContent = '';
    el.libEmpty.hidden = tapes.length > 0;
    const sorted = tapes.slice().sort((a, b) => b.createdAt - a.createdAt);
    let lastDay = null;
    for (const t of sorted) {
      const day = dayStart(new Date(t.createdAt));
      if (day !== lastDay) {
        lastDay = day;
        const h = document.createElement('li');
        h.className = 'day-label'; h.id = 'day-' + day;
        h.textContent = dayHeading(t.createdAt);
        el.libList.appendChild(h);
      }
      el.libList.appendChild(tapeRow(t));
    }
  }

  function tapeRow(t) {
    const li = document.createElement('li');
    li.className = 'tape-row' + (S.cur === t ? ' current' : '');
    const recording = S.rec && S.rec.tape === t;
    const main = document.createElement('button');
    main.className = 'tape-main';
    const st = DSP.STOCKS[t.stock] || DSP.STOCKS.II;
    main.setAttribute('aria-label', `Tape ${t.num}, ${tapeName(t)}, ${spoken(tapeSec(t))}, ${st.label}${S.cur === t ? ', loaded' : ''}. Play.`);
    const num = document.createElement('span'); num.className = 't-num'; num.textContent = pad2(t.num);
    const body = document.createElement('span'); body.className = 't-body';
    const name = document.createElement('span'); name.className = 't-name'; name.textContent = recording ? 'Recording…' : tapeName(t);
    const meta = document.createElement('span'); meta.className = 't-meta'; meta.textContent = `${fmtDur(tapeSec(t))} · ${st.label}`;
    body.append(name, meta);
    const wave = document.createElement('span'); wave.className = 't-wave'; wave.setAttribute('aria-hidden', 'true');
    const peaks = t.peaks && t.peaks.length ? t.peaks : new Array(48).fill(10);
    for (const p of peaks) { const i = document.createElement('i'); i.style.height = Math.max(4, Math.round((p / 255) * 100)) + '%'; wave.appendChild(i); }
    main.append(num, body, wave);
    main.addEventListener('click', () => {
      if (S.rec) { flash('LOCKED', 'RECORDING', 1200); return; }
      click('key');
      closeSheet();
      loadTape(t, true);
    });
    li.appendChild(main);
    if (recording) return li;

    const more = document.createElement('button');
    more.className = 't-more'; more.textContent = '•••';
    more.setAttribute('aria-label', `More for tape ${t.num}`);
    more.setAttribute('aria-expanded', S.openRow === t.id ? 'true' : 'false');
    more.addEventListener('click', () => { S.openRow = S.openRow === t.id ? null : t.id; S.renaming = null; click('tick'); renderLibrary(); });
    li.appendChild(more);

    if (S.openRow === t.id) {
      const bar = document.createElement('div');
      bar.className = 't-actions';
      if (S.renaming === t.id) {
        const input = document.createElement('input');
        input.className = 't-rename'; input.value = t.name; input.maxLength = 40; input.placeholder = clock(t.createdAt);
        input.setAttribute('aria-label', `Name for tape ${t.num}`); input.enterKeyHint = 'done';
        let done = false;
        const finish = (save) => {
          if (done) return; done = true;
          if (save) { t.name = input.value.trim().slice(0, 40); queue(() => DB.putTape(t)); }
          S.renaming = null; S.openRow = null; renderLibrary();
        };
        input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
        input.addEventListener('blur', () => finish(true));
        bar.appendChild(input);
        setTimeout(() => { input.focus(); input.select(); }, 30);
      } else {
        const ren = document.createElement('button'); ren.textContent = 'RENAME';
        ren.addEventListener('click', () => { S.renaming = t.id; renderLibrary(); });
        const share = document.createElement('button'); share.className = 'act-share';
        share.textContent = shareLabel(t);
        if (exportsDone.has(t.id)) share.classList.add('act-send');
        share.addEventListener('click', () => exportTape(t, share));
        const del = document.createElement('button'); del.className = 'act-del'; del.textContent = 'DELETE';
        del.addEventListener('click', () => deleteTape(t));
        bar.append(ren, share, del);
      }
      li.appendChild(bar);
    }
    return li;
  }

  function renderCalendar(tapes, now) {
    const y = now.getFullYear(), mo = now.getMonth(), today = now.getDate();
    const first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Monday first
    const has = new Map();
    for (const t of tapes) { const d = new Date(t.createdAt); if (d.getFullYear() === y && d.getMonth() === mo) has.set(d.getDate(), (has.get(d.getDate()) || 0) + 1); }
    el.cal.textContent = '';
    for (const w of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) { const s = document.createElement('span'); s.className = 'wd'; s.textContent = w; s.setAttribute('aria-hidden', 'true'); el.cal.appendChild(s); }
    for (let i = 0; i < offset; i++) el.cal.appendChild(document.createElement('span'));
    for (let d = 1; d <= days; d++) {
      const n = has.get(d) || 0;
      const node = document.createElement(n ? 'button' : 'span');
      node.className = 'd' + (n ? ' has' : d < today ? ' past' : '') + (d === today ? ' today' : '');
      const label = `${MONTHS_LONG[mo].toLowerCase()} ${d}: ${n ? n + ' tape' + (n > 1 ? 's' : '') : 'no tapes'}`;
      if (n) {
        node.setAttribute('aria-label', label);
        node.addEventListener('click', () => {
          const target = document.getElementById('day-' + new Date(y, mo, d).getTime());
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else node.setAttribute('aria-hidden', 'true');
      el.cal.appendChild(node);
    }
  }

  async function renderStorage() {
    const tapes = liveTapes();
    const total = tapes.reduce((s, t) => s + tapeSec(t), 0);
    let used = '';
    try { const est = await navigator.storage.estimate(); used = `${(est.usage / 1048576).toFixed(1)} MB on this device · `; } catch (e) { /* not available */ }
    el.storage.textContent = `${used}${tapes.length} tape${tapes.length === 1 ? '' : 's'} · ${fmtDur(total)} total`;
  }

  let lastFocus = null;
  function openSheet() {
    if (S.sheetOpen) return;
    S.sheetOpen = true; S.openRow = null; S.renaming = null;
    lastFocus = document.activeElement;
    renderLibrary(); renderStorage();
    el.scrim.hidden = false;
    el.sheet.setAttribute('aria-hidden', 'false');
    el.device.querySelectorAll('.head, .platter-zone, .mid, .deck').forEach((n) => n.setAttribute('inert', ''));
    requestAnimationFrame(() => { el.scrim.classList.add('show'); el.sheet.classList.add('open'); });
    click('key');
    setTimeout(() => el.doneKey.focus({ preventScroll: true }), 60);
  }
  function closeSheet() {
    if (!S.sheetOpen) return;
    S.sheetOpen = false;
    el.sheet.classList.remove('open');
    el.scrim.classList.remove('show');
    el.sheet.setAttribute('aria-hidden', 'true');
    el.device.querySelectorAll('[inert]').forEach((n) => n.removeAttribute('inert'));
    setTimeout(() => { if (!S.sheetOpen) el.scrim.hidden = true; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ delete with undo
  const pendingDeletes = new Map();
  let toastTimer = 0, toastUndo = null;
  function deleteTape(t) {
    t.deleted = true;
    queue(() => DB.putTape(t));
    if (S.cur === t) unloadCurrent();
    S.openRow = null;
    click('key');
    renderLibrary(); renderStorage();
    say(`Tape ${t.num} deleted. Undo is available for a few seconds.`);
    pendingDeletes.set(t.id, setTimeout(() => {
      pendingDeletes.delete(t.id);
      if (!t.deleted) return;
      S.tapes = S.tapes.filter((x) => x !== t);
      queue(() => DB.remove(t.id));
    }, UNDO_MS));
    showToast(`Tape ${pad2(t.num)} deleted`, () => {
      clearTimeout(pendingDeletes.get(t.id)); pendingDeletes.delete(t.id);
      t.deleted = false;
      queue(() => DB.putTape(t));
      renderLibrary(); renderStorage();
      say(`Tape ${t.num} restored`);
    });
  }
  function showToast(text, undo) {
    el.toastText.textContent = text;
    toastUndo = undo;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; toastUndo = null; }, UNDO_MS);
  }

  // ------------------------------------------------------------------ export + share
  const exportsDone = new Map(); // tapeId -> File (valid until the tape's sound settings change)
  const exportKey = (t) => `${t.stock}|${t.drive.toFixed(2)}|${S.settings.exportTape}|${t.name}`;
  function shareLabel(t) {
    const f = exportsDone.get(t.id);
    if (f && f.key === exportKey(t)) return canShareFiles() ? 'SEND ↗' : 'SAVE ↓';
    exportsDone.delete(t.id);
    return 'SHARE';
  }
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], 'x.wav', { type: 'audio/wav' })] })); } catch (e) { return false; }
  }
  function fileName(t) {
    const d = new Date(t.createdAt);
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const name = (t.name || clock(t.createdAt).replace(':', '.')).replace(/[\\/:*?"<>|]+/g, '').trim();
    return `Capstan ${pad2(t.num)} - ${name} - ${date}.wav`;
  }

  // Printing takes a moment, and iOS only opens the share sheet straight from a
  // tap. So: first tap prints (with real progress), second tap sends.
  function exportTape(t, btn) {
    const ready = exportsDone.get(t.id);
    if (ready && ready.key === exportKey(t)) { deliver(ready.file); return; }
    if (S.exporting) return;
    S.exporting = true;
    click('key');
    btn.textContent = 'PRINTING 0%';
    btn.disabled = true;
    const key = exportKey(t);
    const w = new Worker('export-worker.js');
    w.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'progress') btn.textContent = `PRINTING ${Math.round(m.p * 100)}%`;
      else if (m.t === 'done') {
        w.terminate(); S.exporting = false; btn.disabled = false;
        const file = new File([m.wav], fileName(t), { type: 'audio/wav' });
        exportsDone.set(t.id, { key, file });
        btn.classList.add('act-send');
        if (canShareFiles()) { btn.textContent = 'SEND ↗'; say('Ready. Tap send to share the file.'); }
        else { btn.textContent = 'SAVE ↓'; deliver(file); }
      } else if (m.t === 'error') {
        w.terminate(); S.exporting = false; btn.disabled = false;
        btn.textContent = 'RETRY';
        say('Export failed. Tap to try again.');
      }
    };
    w.onerror = () => { w.terminate(); S.exporting = false; btn.disabled = false; btn.textContent = 'RETRY'; };
    w.postMessage({ tapeId: t.id, stock: t.stock, drive: t.drive, gain: t.gain, sr: t.sr, withTape: S.settings.exportTape });
  }
  async function deliver(file) {
    if (canShareFiles()) {
      try { await navigator.share({ files: [file], title: file.name }); } catch (e) { /* cancelled */ }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  // ------------------------------------------------------------------ stickers (install hint, mic help)
  const STICKERS = {
    install: '<b>Install it first.</b> Tap Share, then <b>Add to Home Screen</b>. The installed app runs full-screen, works offline and keeps its tapes safe. (Tapes made in this Safari tab stay here.)',
    mic: '<b>The mic is blocked.</b> Open Settings › Apps › Safari › Microphone, choose <b>Allow</b>, then press REC again.',
    secure: '<b>Recording needs a secure link.</b> Open this app from its https:// address.',
  };
  let stickerKind = null;
  function showSticker(kind) { stickerKind = kind; el.stickerText.innerHTML = STICKERS[kind]; el.sticker.hidden = false; }
  function hideSticker(kind) { if (!kind || stickerKind === kind) { el.sticker.hidden = true; stickerKind = null; } }

  // ------------------------------------------------------------------ device integration
  let wl = null;
  async function wakeLock(on) {
    try {
      if (on && 'wakeLock' in navigator) { wl = await navigator.wakeLock.request('screen'); }
      else if (!on && wl) { await wl.release(); wl = null; }
    } catch (e) { /* not available */ }
  }

  function storageProblem(err) {
    console.error(err);
    if (err && err.name === 'QuotaExceededError') { flash('DISK FULL', 'FREE SPACE', 5000); say('Storage is full. Delete some tapes to keep recording.'); if (S.rec) stopRecording(); }
  }

  function onHidden() {
    if (document.visibilityState !== 'hidden') return;
    if (S.rec) stopRecording({ reason: 'background' });
    else if (S.playing) pause();
  }

  // textures: brushed panel + spun platter, drawn once
  function makeTextures() {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const b = document.createElement('canvas'); b.width = 600; b.height = 300;
    const bx = b.getContext('2d');
    for (let i = 0; i < 1500; i++) {
      const y = Math.floor(rnd() * 300), x = rnd() * 600, len = 60 + rnd() * 380;
      bx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${(dark ? 0.012 : 0.03) + rnd() * 0.05})` : `rgba(0,0,0,${(dark ? 0.03 : 0.015) + rnd() * 0.03})`;
      bx.fillRect(x, y, len, 1); bx.fillRect(x - 600, y, len, 1);
    }
    document.documentElement.style.setProperty('--brushed', `url(${b.toDataURL('image/png')})`);
    const s = document.createElement('canvas'); s.width = s.height = 512;
    const sx = s.getContext('2d');
    for (let r = 2; r < 256; r += 0.75) {
      sx.strokeStyle = rnd() > 0.5 ? `rgba(255,255,255,${(dark ? 0.015 : 0.05) + rnd() * 0.07})` : `rgba(0,0,0,${0.015 + rnd() * 0.035})`;
      sx.lineWidth = 0.7;
      sx.beginPath(); sx.arc(256, 256, r, 0, Math.PI * 2); sx.stroke();
    }
    document.documentElement.style.setProperty('--spun', `url(${s.toDataURL('image/png')})`);
  }

  // ------------------------------------------------------------------ wiring
  function pressKey(btn, fn) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      btn.classList.add('down');
      fn();
    });
    const up = () => btn.classList.remove('down');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // keyboard and VoiceOver
  }

  function wire() {
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });

    pressKey(el.recKey, onRec);
    pressKey(el.playKey, onPlay);
    pressKey(el.stopKey, onStop);

    el.platter.addEventListener('pointerdown', platterDown);
    el.platter.addEventListener('pointermove', platterMove);
    el.platter.addEventListener('pointerup', platterUp);
    el.platter.addEventListener('pointercancel', platterUp);
    el.platter.addEventListener('lostpointercapture', platterUp);
    el.platter.addEventListener('keydown', platterKey);

    bindCue(el.rewKey, -1);
    bindCue(el.ffKey, 1);
    bindFader();
    el.stockKey.addEventListener('click', cycleStock);
    el.tapesKey.addEventListener('click', openSheet);
    el.oled.addEventListener('click', openSheet);
    el.doneKey.addEventListener('click', closeSheet);
    el.scrim.addEventListener('click', closeSheet);
    el.emptyRec.addEventListener('click', () => { closeSheet(); onRec(); });
    el.toastUndo.addEventListener('click', () => { const u = toastUndo; el.toast.hidden = true; toastUndo = null; clearTimeout(toastTimer); if (u) u(); });
    el.stickerX.addEventListener('click', () => { if (stickerKind === 'install') DB.set('stickerInstall', true); hideSticker(); });

    const bindSetting = (input, key) => {
      input.checked = !!S.settings[key];
      input.addEventListener('change', () => { S.settings[key] = input.checked; DB.set('settings', S.settings); click('tick'); });
    };
    bindSetting(el.setClicks, 'clicks');
    bindSetting(el.setRewind, 'autoRewind');
    bindSetting(el.setExportTape, 'exportTape');

    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey)) return;
      if (S.sheetOpen) { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } return; }
      const onButton = e.target && e.target.tagName === 'BUTTON';
      if ((e.key === ' ' || e.key === 'Enter') && onButton) return;
      switch (e.key) {
        case ' ': e.preventDefault(); onPlay(); break;
        case 'r': case 'R': onRec(); break;
        case 's': case 'S': onStop(); break;
        case 'ArrowLeft': if (e.target !== el.fader) skip(-1); break;
        case 'ArrowRight': if (e.target !== el.fader) skip(1); break;
        case 't': case 'T': openSheet(); break;
        default:
      }
    });

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', () => { if (S.rec) stopRecording({ reason: 'background' }); });
    window.addEventListener('resize', () => oled.resize());
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    makeTextures();
    oled.resize();
    wire();
    renderStatic(); renderKeys();
    requestAnimationFrame(frame);
    try {
      await DB.open();
    } catch (e) {
      flash('NO DISK', 'PRIVATE MODE?', 6000);
      return;
    }
    const [nextNum, settings, defaults, last, stickerOff] = await Promise.all([DB.get('nextNum'), DB.get('settings'), DB.get('defaults'), DB.get('last'), DB.get('stickerInstall')]);
    if (settings) Object.assign(S.settings, settings);
    if (defaults) Object.assign(S.defaults, defaults);
    el.setClicks.checked = S.settings.clicks; el.setRewind.checked = S.settings.autoRewind; el.setExportTape.checked = S.settings.exportTape;
    S.tapes = (await DB.tapes()).sort((a, b) => a.createdAt - b.createdAt);
    S.nextNum = Math.max(nextNum || 1, ...S.tapes.map((t) => t.num + 1));

    // purge tapes deleted last session; rescue takes cut off by a crash or a closed app
    const rescued = [];
    for (const t of S.tapes.slice()) {
      if (t.deleted) { await DB.remove(t.id); S.tapes = S.tapes.filter((x) => x !== t); continue; }
      if (!t.complete) {
        const data = concat(await DB.chunks(t.id));
        if (!data.length) { await DB.remove(t.id); S.tapes = S.tapes.filter((x) => x !== t); continue; }
        finalize(t, [data]);
        rescued.push(t);
      }
    }
    renderStatic(); renderLibrary();

    const pick = S.tapes.find((t) => t.id === last) || S.tapes[S.tapes.length - 1];
    if (pick) { try { await loadTape(pick, false); } catch (e) { console.error(e); } }
    if (rescued.length) flash('RESCUED', 'TAPE ' + pad2(rescued[rescued.length - 1].num), 3500);

    if (isIOS && !standalone() && !stickerOff) showSticker('install');
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  window.__capstan = { S, A, DB }; // for the end-to-end test
  boot();
})();
