/**
 * Deterministic pseudo-waveform bars.
 *
 * Real peak data would mean decoding the audio, which is overkill for a
 * snippet player. Instead each track gets a stable, seeded shape derived from
 * its id: the same track always draws the same bars, on the server and the
 * client alike, so there's no hydration mismatch and no layout jump.
 */

/** xmur3 string hash -> 32-bit seed. */
function seedFrom(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG — small, fast, good enough for visual noise. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns `count` bar heights in the range 0.12–1, shaped so the middle of
 * the clip is louder than its edges — the way a phrase usually sits.
 */
export function waveformBars(id: string, count = 64): number[] {
  const next = rng(seedFrom(id));
  const bars: number[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    // Gentle arch so clips fade in and out instead of starting at full tilt.
    const envelope = 0.45 + 0.55 * Math.sin(Math.PI * progress);
    // Two mixed frequencies keep it from looking like pure static.
    const wobble = 0.55 * next() + 0.45 * Math.abs(Math.sin(progress * 11 + next()));
    bars.push(Math.min(1, Math.max(0.12, envelope * wobble * 1.35)));
  }

  return bars;
}
