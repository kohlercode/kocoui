import { builtinCatalog, SYSTEM_ID } from './fonts-default.js';

export { SYSTEM_ID };

const PREF_KEY = 'kocoui.font';

const loaded = new Set();
let prefetching = null;

function publicUrl(path) {
  if (typeof path !== 'string' || path === '') return '';
  const trimmed = path.replace(/^\//, '');
  const base = import.meta.env.VITE_DEMO ? import.meta.env.BASE_URL : '/';
  return base + trimmed;
}

function sanitizeFamily(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' && /^[a-z0-9-]+$/.test(entry.id) ? entry.id : '';
  const family = typeof entry.family === 'string' ? entry.family.trim() : '';
  if (!id || !family || family.length > 64) return null;
  if (id === SYSTEM_ID) return { id, family: 'system', files: [] };
  const files = [];
  if (Array.isArray(entry.files)) {
    for (const file of entry.files) {
      if (!file || typeof file.url !== 'string' || !file.url.startsWith('/') || file.url.includes('..')) continue;
      const weight = typeof file.weight === 'string' && /^[1-9][0-9]{0,3}(?: [1-9][0-9]{0,3})?$/.test(file.weight)
        ? file.weight
        : '400';
      const item = { url: file.url, weight };
      if (typeof file.unicodeRange === 'string' && file.unicodeRange.startsWith('U+')) {
        item.unicodeRange = file.unicodeRange;
      }
      files.push(item);
    }
  }
  if (files.length === 0) return null;
  return { id, family, files };
}

export function fontCatalog() {
  try {
    const raw = document.documentElement.dataset.fonts || '';
    if (raw) {
      const parsed = JSON.parse(raw);
      const families = [];
      const seen = new Set();
      if (Array.isArray(parsed?.families)) {
        for (const entry of parsed.families) {
          const fam = sanitizeFamily(entry);
          if (!fam || seen.has(fam.id)) continue;
          seen.add(fam.id);
          families.push(fam);
        }
      }
      if (!seen.has(SYSTEM_ID)) {
        families.unshift({ id: SYSTEM_ID, family: 'system', files: [] });
        seen.add(SYSTEM_ID);
      } else if (families[0]?.id !== SYSTEM_ID) {
        const sys = families.find((f) => f.id === SYSTEM_ID);
        families.splice(families.indexOf(sys), 1);
        families.unshift(sys);
      }
      const defaultId = typeof parsed?.default === 'string' && seen.has(parsed.default)
        ? parsed.default
        : SYSTEM_ID;
      return { default: defaultId, families };
    }
  } catch {
    // Shell JSON missing or invalid: shipped list.
  }
  return builtinCatalog();
}

export function getFont() {
  const catalog = fontCatalog();
  const ids = new Set(catalog.families.map((f) => f.id));
  try {
    const stored = localStorage.getItem(PREF_KEY);
    if (stored && ids.has(stored)) return stored;
  } catch {
    // private mode
  }
  return ids.has(catalog.default) ? catalog.default : SYSTEM_ID;
}

export function setFont(id) {
  const catalog = fontCatalog();
  if (!catalog.families.some((f) => f.id === id)) return getFont();
  try {
    if (id === catalog.default) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, id);
  } catch {
    // private mode
  }
  applyFont(id);
  return id;
}

export function initFont() {
  applyFont(getFont());
}

function applyFont(id) {
  const root = document.documentElement.style;
  const catalog = fontCatalog();
  const fam = catalog.families.find((f) => f.id === id);
  if (!fam || fam.id === SYSTEM_ID) {
    root.removeProperty('--k-font-sans');
    return;
  }
  const name = fam.family.replace(/["\\]/g, '');
  root.setProperty('--k-font-sans', `"${name}", var(--k-font-system)`);
  void loadFamily(fam);
}

async function loadFamily(fam) {
  if (!fam || fam.id === SYSTEM_ID || typeof FontFace === 'undefined') return;
  const jobs = [];
  for (const file of fam.files) {
    const url = publicUrl(file.url);
    const key = `${fam.family}|${url}|${file.weight}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    const descriptors = { weight: file.weight, display: 'swap' };
    if (file.unicodeRange) descriptors.unicodeRange = file.unicodeRange;
    const face = new FontFace(fam.family, `url(${JSON.stringify(url)}) format("woff2")`, descriptors);
    jobs.push(
      face.load().then((loadedFace) => {
        document.fonts.add(loadedFace);
      }).catch(() => {
        loaded.delete(key);
      }),
    );
  }
  if (jobs.length) await Promise.all(jobs);
}

export function prefetchFonts() {
  if (!prefetching) {
    prefetching = Promise.all(fontCatalog().families.map((fam) => loadFamily(fam))).finally(() => {
      prefetching = null;
    });
  }
  return prefetching;
}
