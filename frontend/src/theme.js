const MODE_KEY = 'kocoui.theme';
const COLORS_KEY = 'kocoui.colors';

/** User-facing colors. Everything else (borders, muted text, info) is mixed from these in CSS. */
export const COLOR_KEYS = ['bg', 'surface', 'text', 'primary', 'danger', 'success', 'warning'];
const INK_KEYS = ['primary', 'danger', 'success', 'warning'];
const INFO_BLEND = '#6d9399';
const INFO_WEIGHT = 0.55;
const HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULTS = {
  light: {
    bg: '#f3f4f6',
    surface: '#ffffff',
    text: '#2c3136',
    primary: '#3f6f9f',
    danger: '#b55252',
    success: '#3d7a5a',
    warning: '#8f7034',
  },
  dark: {
    bg: '#1a1d21',
    surface: '#262a2e',
    text: '#cfd3d7',
    primary: '#7f9dba',
    danger: '#c48b90',
    success: '#7eaa96',
    warning: '#c4ae78',
  },
};

export function getTheme() {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initTheme() {
  const mode = getTheme();
  document.documentElement.setAttribute('data-bs-theme', mode);
  applyScheme(mode, loadColors()[mode]);
}

export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  localStorage.setItem(MODE_KEY, theme);
  document.documentElement.setAttribute('data-bs-theme', theme);
  applyScheme(theme, loadColors()[theme]);
}

export function loadColors() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(COLORS_KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  return {
    light: sanitize(stored.light, DEFAULTS.light),
    dark: sanitize(stored.dark, DEFAULTS.dark),
  };
}

export function saveColors(colors) {
  const next = { light: sanitize(colors.light, DEFAULTS.light), dark: sanitize(colors.dark, DEFAULTS.dark) };
  if (sameScheme(next.light, DEFAULTS.light) && sameScheme(next.dark, DEFAULTS.dark)) {
    localStorage.removeItem(COLORS_KEY);
  } else {
    localStorage.setItem(COLORS_KEY, JSON.stringify(next));
  }
  return next;
}

/** Writes one scheme onto the document as CSS variables. Defaults stay in the stylesheet. */
export function applyScheme(mode, colors) {
  const root = document.documentElement.style;
  const scheme = sanitize(colors, DEFAULTS[mode] || DEFAULTS.light);
  if (sameScheme(scheme, DEFAULTS[mode])) {
    for (const name of variableNames()) root.removeProperty(name);
    return scheme;
  }
  for (const [name, value] of Object.entries(variablesFor(scheme))) root.setProperty(name, value);
  return scheme;
}

export function sameScheme(a, b) {
  return COLOR_KEYS.every((key) => (a?.[key] || '').toLowerCase() === (b?.[key] || '').toLowerCase());
}

export function variablesFor(colors) {
  const out = {};
  for (const key of COLOR_KEYS) {
    out[`--k-${key}`] = colors[key];
    out[`--k-${key}-rgb`] = hexToRgb(colors[key]);
  }
  for (const key of INK_KEYS) out[`--k-on-${key}`] = onInk(colors[key]);
  const info = mixHex(colors.primary, INFO_BLEND, INFO_WEIGHT);
  out['--k-info'] = info;
  out['--k-info-rgb'] = hexToRgb(info);
  out['--k-on-info'] = onInk(info);
  return out;
}

function variableNames() {
  return Object.keys(variablesFor(DEFAULTS.light));
}

function sanitize(input, fallback) {
  const out = { ...fallback };
  if (!input || typeof input !== 'object') return out;
  for (const key of COLOR_KEYS) {
    const value = String(input[key] || '').trim().toLowerCase();
    if (HEX.test(value)) out[key] = value;
  }
  return out;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function mixHex(a, b, weightA) {
  const pa = parts(a);
  const pb = parts(b);
  const ch = (i) => Math.round(pa[i] * weightA + pb[i] * (1 - weightA));
  return '#' + [0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('');
}

function parts(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Ink (light or dark) with the higher contrast on this fill. */
export function onInk(hex) {
  const L = luminance(hex);
  const light = '#f4f6f8';
  const dark = '#1c1f23';
  const contrast = (bg, fg) => {
    const a = Math.max(bg, fg);
    const b = Math.min(bg, fg);
    return (a + 0.05) / (b + 0.05);
  };
  return contrast(L, luminance(light)) >= contrast(L, luminance(dark)) ? light : dark;
}

function luminance(hex) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parts(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
