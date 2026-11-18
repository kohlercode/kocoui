export const SYSTEM_ID = 'system';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

function vf(id, family, weight) {
  return {
    id,
    family,
    files: [
      { url: `/fonts/${id}/${id}-latin-wght-normal.woff2`, weight, unicodeRange: LATIN },
      { url: `/fonts/${id}/${id}-latin-ext-wght-normal.woff2`, weight, unicodeRange: LATIN_EXT },
    ],
  };
}

function staticFamily(id, family, weights) {
  const files = [];
  for (const weight of weights) {
    files.push({ url: `/fonts/${id}/${id}-latin-${weight}-normal.woff2`, weight, unicodeRange: LATIN });
    files.push({ url: `/fonts/${id}/${id}-latin-ext-${weight}-normal.woff2`, weight, unicodeRange: LATIN_EXT });
  }
  return { id, family, files };
}

/** Fallback catalog when Shell data-fonts is missing. Keep in sync with Fonts::BUILTIN. */
export const DEFAULT_FONTS = [
  vf('inter', 'Inter', '100 900'),
  vf('roboto', 'Roboto', '100 900'),
  vf('open-sans', 'Open Sans', '300 800'),
  staticFamily('lato', 'Lato', ['400', '700']),
  vf('montserrat', 'Montserrat', '100 900'),
  vf('source-sans-3', 'Source Sans 3', '200 900'),
  vf('nunito-sans', 'Nunito Sans', '200 1000'),
  staticFamily('poppins', 'Poppins', ['400', '700']),
  vf('noto-sans', 'Noto Sans', '100 900'),
  vf('ibm-plex-sans', 'IBM Plex Sans', '100 700'),
];

export function builtinCatalog() {
  return {
    default: SYSTEM_ID,
    families: [{ id: SYSTEM_ID, family: 'system', files: [] }, ...DEFAULT_FONTS],
  };
}
