import { useEffect, useRef, useState } from 'preact/hooks';
import { LANGUAGES, useI18n } from '../i18n/index.js';

export function LanguageSelect({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div class={`dropdown ${className}`} ref={ref}>
      <button
        type="button"
        class="btn btn-outline-secondary"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('nav.language')}
        title={t('nav.language')}
        onClick={() => setOpen((v) => !v)}
      >
        <i class="bi bi-globe" aria-hidden="true"></i>
      </button>
      <ul class={`dropdown-menu dropdown-menu-end ${open ? 'show' : ''}`} role="menu">
        {Object.entries(LANGUAGES).map(([code, label]) => (
          <li key={code}>
            <button
              type="button"
              class={`dropdown-item ${code === lang ? 'active' : ''}`}
              role="menuitemradio"
              aria-checked={code === lang}
              onClick={() => {
                setLang(code);
                setOpen(false);
              }}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
