/*
 * Prints a tape to a 16-bit WAV off the UI thread: reads the raw chunks from
 * IndexedDB, plays them through the same Deck the audio thread uses (at 1x,
 * with wow and flutter) and encodes the result.
 */
importScripts('dsp.js');
const DSP = self.CapstanDSP;

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('capstan');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function loadChunks(db, tapeId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const req = tx.objectStore('chunks').getAll(IDBKeyRange.bound([tapeId, 0], [tapeId, Infinity]));
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.seq - b.seq));
    req.onerror = () => reject(req.error);
  });
}

self.onmessage = async (e) => {
  const job = e.data;
  try {
    const db = await openDb();
    const rows = await loadChunks(db, job.tapeId);
    db.close();
    let total = 0;
    for (const r of rows) total += r.data.byteLength / 2;
    const pcm = new Int16Array(total);
    let o = 0;
    for (const r of rows) { const a = new Int16Array(r.data); pcm.set(a, o); o += a.length; }

    let out;
    if (!job.withTape || job.stock === 'DIRECT') {
      out = new Float32Array(total);
      for (let i = 0; i < total; i++) out[i] = DSP.softCeiling((pcm[i] / 32768) * job.gain);
      self.postMessage({ t: 'progress', p: 1 });
    } else {
      const deck = new DSP.Deck(job.sr);
      deck.setStock(job.stock);
      deck.setDrive(job.drive);
      deck.load(pcm, job.sr, job.gain);
      deck.play();
      const cap = Math.ceil(total * 1.03) + job.sr;
      const buf = new Float32Array(cap);
      const block = 4096;
      let n = 0, lastP = 0;
      while (n < cap) {
        const end = Math.min(cap, n + block);
        deck.process(buf.subarray(n, end));
        n = end;
        if (!deck.playing && deck.pos >= deck.len) break;
        const p = deck.pos / Math.max(1, deck.len);
        if (p - lastP > 0.02) { lastP = p; self.postMessage({ t: 'progress', p }); }
      }
      out = buf.subarray(0, n);
    }
    const wav = DSP.encodeWav(out, job.sr);
    self.postMessage({ t: 'done', wav }, [wav]);
  } catch (err) {
    self.postMessage({ t: 'error', message: String(err && err.message || err) });
  }
};
