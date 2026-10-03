import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import en from './en.json';
import de from './de.json';

export const LANGUAGES = { en: 'English', de: 'Deutsch' };
const DICTS = { en, de };
const KEY = 'kocoui.lang';

export function initialLang() {
  const stored = localStorage.getItem(KEY);
  if (DICTS[stored]) return stored;
  for (const l of navigator.languages || [navigator.language || '']) {
    const short = l.slice(0, 2).toLowerCase();
    if (DICTS[short]) return short;
  }
  const fallback = document.documentElement.dataset.defaultLang;
  return DICTS[fallback] ? fallback : 'en';
}

export function storeLang(lang) {
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
}

export function translate(lang, key, vars) {
  let s = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export const I18n = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });
export const useI18n = () => useContext(I18n);
