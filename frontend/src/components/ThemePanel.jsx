import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.js';
import { applyScheme, DEFAULTS, loadColors, sameScheme, saveColors } from '../theme.js';

const GROUPS = [
  ['canvas', ['bg', 'surface', 'text']],
  ['accent', ['primary', 'danger', 'success', 'warning']],
];

export function ThemePanel({ open, mode, onMode, onClose }) {
  const { t } = useI18n();
  const [baseline, setBaseline] = useState(loadColors);
  const [draft, setDraft] = useState(loadColors);

  useLayoutEffect(() => {
    if (open) applyScheme(mode, draft[mode]);
  }, [open, mode, draft]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, mode, baseline]);

  function close() {
    applyScheme(mode, baseline[mode]);
    setDraft(baseline);
    onClose();
  }

  function update(key, hex) {
    setDraft((d) => ({ ...d, [mode]: { ...d[mode], [key]: hex } }));
  }

  function reset() {
    setDraft((d) => ({ ...d, [mode]: { ...DEFAULTS[mode] } }));
  }

  function save() {
    const stored = saveColors(draft);
    setBaseline(stored);
    setDraft(stored);
    applyScheme(mode, stored[mode]);
    onClose();
  }

  const dirty = !sameScheme(draft.light, baseline.light) || !sameScheme(draft.dark, baseline.dark);
  const scheme = draft[mode];

  return (
    <>
      <div class={`offcanvas offcanvas-end theme-panel ${open ? 'show' : ''}`} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="theme-panel-title" inert={!open}>
        <div class="offcanvas-header border-bottom">
          <h5 class="offcanvas-title" id="theme-panel-title">
            <i class="bi bi-palette me-2" aria-hidden="true"></i>
            {t('theme.title')}
          </h5>
          <button type="button" class="btn-close" aria-label={t('theme.cancel')} onClick={close}></button>
        </div>
        <div class="offcanvas-body d-flex flex-column gap-3">
          <div class="btn-group w-100" role="group" aria-label={t('theme.mode')}>
            <button type="button" class={`btn btn-sm ${mode === 'light' ? 'btn-secondary' : 'btn-outline-secondary'}`} aria-pressed={mode === 'light'} onClick={() => onMode('light')}>
              <i class="bi bi-sun me-1" aria-hidden="true"></i>
              {t('theme.light')}
            </button>
            <button type="button" class={`btn btn-sm ${mode === 'dark' ? 'btn-secondary' : 'btn-outline-secondary'}`} aria-pressed={mode === 'dark'} onClick={() => onMode('dark')}>
              <i class="bi bi-moon me-1" aria-hidden="true"></i>
              {t('theme.dark')}
            </button>
          </div>
          <p class="small text-body-secondary mb-0">{t('theme.hint')}</p>

          <div class="theme-preview border rounded p-3 d-flex flex-wrap gap-2" aria-hidden="true">
            <button type="button" class="btn btn-sm btn-primary" tabIndex={-1}>{t('theme.primary')}</button>
            <button type="button" class="btn btn-sm btn-success" tabIndex={-1}>{t('theme.success')}</button>
            <button type="button" class="btn btn-sm btn-outline-warning" tabIndex={-1}>{t('theme.warning')}</button>
            <button type="button" class="btn btn-sm btn-danger" tabIndex={-1}>{t('theme.danger')}</button>
          </div>

          {GROUPS.map(([group, keys]) => (
            <fieldset class="border-0 p-0 m-0">
              <legend class="form-label small text-uppercase text-body-secondary mb-2">{t(`theme.group.${group}`)}</legend>
              <div class="d-flex flex-column gap-2">
                {keys.map((key) => (
                  <ColorRow key={key} name={key} color={scheme[key]} label={t(`theme.${key}`)} onPick={(hex) => update(key, hex)} />
                ))}
              </div>
            </fieldset>
          ))}

          <div class="d-flex flex-wrap gap-2 mt-auto pt-2 border-top">
            <button type="button" class="btn btn-sm btn-outline-secondary" onClick={reset} disabled={sameScheme(scheme, DEFAULTS[mode])}>
              {t('theme.reset')}
            </button>
            <div class="flex-grow-1"></div>
            <button type="button" class="btn btn-sm btn-outline-secondary" onClick={close}>{t('theme.cancel')}</button>
            <button type="button" class="btn btn-sm btn-primary" onClick={save} disabled={!dirty}>{t('theme.save')}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ColorRow({ name, color, label, onPick }) {
  return (
    <div class="theme-row">
      <input
        type="color"
        class="theme-swatch"
        value={color}
        aria-label={label}
        onInput={(e) => onPick(e.currentTarget.value.toLowerCase())}
      />
      <label class="theme-row-label text-truncate" for={`theme-${name}`}>{label}</label>
      <input
        id={`theme-${name}`}
        class="form-control form-control-sm font-monospace theme-hex"
        defaultValue={color}
        key={color}
        maxLength={7}
        spellcheck={false}
        aria-label={label}
        onChange={(e) => {
          const text = e.currentTarget.value.trim().toLowerCase();
          if (/^#[0-9a-f]{6}$/.test(text)) onPick(text);
          else e.currentTarget.value = color;
        }}
      />
    </div>
  );
}
