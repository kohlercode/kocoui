/** Largest file we decode into a waveform. Longer audio keeps the native control. */
export const WAVE_MAX_BYTES = 2 * 1024 * 1024;

const BARS = 56;

const cache = new Map();

/**
 * Peak amplitudes (0–1) for one file. Cached by path. The decoded samples are
 * dropped before this resolves; only the short peak list is kept.
 */
export function wavePeaks(url, path) {
  const hit = cache.get(path);
  if (hit) return hit;
  const pending = loadPeaks(url).catch((err) => {
    cache.delete(path);
    throw err;
  });
  cache.set(path, pending);
  return pending;
}

async function loadPeaks(url) {
  if (typeof AudioContext === 'undefined') throw new Error('no_audio_context');
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('wave_fetch');
  const bytes = await res.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    return peaksFrom(buffer);
  } finally {
    await ctx.close().catch(() => {});
  }
}

function peaksFrom(buffer) {
  const data = buffer.getChannelData(0);
  const peaks = new Array(BARS).fill(0);
  if (!data.length) return peaks;
  const size = Math.max(1, Math.floor(data.length / BARS));
  let max = 0;
  for (let i = 0; i < BARS; i++) {
    const start = i * size;
    const end = i === BARS - 1 ? data.length : Math.min(data.length, start + size);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
    if (peak > max) max = peak;
  }
  if (max > 0) {
    for (let i = 0; i < BARS; i++) peaks[i] /= max;
  }
  return peaks;
}
