const PREF_KEY = 'kocoui.sounds';
const FILE_NAME = /^[A-Za-z0-9._-]+$/;

let ctx = null;
let loading = null;
let loaded = false;
const buffers = new Map();

export function soundsEnabled() {
  return localStorage.getItem(PREF_KEY) === 'on';
}

export function setSoundsEnabled(on) {
  localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
}

function mediaPlaying() {
  return Array.from(document.querySelectorAll('audio, video')).some((el) => !el.paused && !el.ended);
}

function context() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

document.addEventListener('pointerdown', () => {
  if (!soundsEnabled() || typeof AudioContext === 'undefined') return;
  context();
}, { capture: true });

async function load() {
  const res = await fetch('/sounds/sounds.json', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error('sounds');
  const map = await res.json();
  const audio = context();
  if (audio.state === 'suspended') await audio.resume();
  const jobs = [];
  if (map && typeof map === 'object') {
    for (const [name, file] of Object.entries(map)) {
      if (typeof file !== 'string' || !FILE_NAME.test(file)) continue;
      jobs.push(fetch(`/sounds/${encodeURIComponent(file)}`, { credentials: 'same-origin' }).then(async (fileRes) => {
        if (!fileRes.ok) return;
        const bytes = await fileRes.arrayBuffer();
        buffers.set(name, await audio.decodeAudioData(bytes.slice(0)));
      }).catch(() => {}));
    }
  }
  await Promise.all(jobs);
  loaded = true;
}

function ensureLoaded() {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = load().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/** Play one cue from sounds.json. Silent when sounds are off, the tab is hidden, or media is already playing. */
export function play(name) {
  if (!soundsEnabled() || document.hidden || mediaPlaying()) return;
  if (typeof AudioContext === 'undefined') return;
  const audio = context();
  ensureLoaded().then(() => {
    const buf = buffers.get(name);
    if (!buf || audio.state !== 'running') return;
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(audio.destination);
    src.start();
  }).catch(() => {});
}
