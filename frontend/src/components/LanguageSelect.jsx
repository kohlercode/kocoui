import { LANGUAGES, useI18n } from '../i18n/index.js';

export function LanguageSelect({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      class={`form-select form-select-sm w-auto ${className}`}
      aria-label={t('nav.language')}
      value={lang}
      onChange={(e) => setLang(e.currentTarget.value)}
    >
      {Object.entries(LANGUAGES).map(([code, label]) => (
        <option value={code}>{label}</option>
      ))}
    </select>
  );
}
