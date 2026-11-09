import { useEffect, useState } from 'preact/hooks';
import { api, csrf } from '../api.js';
import { ApiError } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { COLOR_KEYS, SITE_DEFAULTS, setSiteDefaults, sameScheme } from '../theme.js';
import { errorText } from '../util.js';
import { applyBrand } from './BrandMark.jsx';

const ICON_SLOTS = [
  { slot: 'logo', accept: '.svg,.png,image/svg+xml,image/png', hintKey: 'branding.icon.logo.hint' },
  { slot: 'favicon', accept: '.ico,image/x-icon,image/vnd.microsoft.icon', hintKey: 'branding.icon.favicon.hint' },
  { slot: 'icon192', accept: '.png,image/png', hintKey: 'branding.icon.icon192.hint' },
  { slot: 'icon512', accept: '.png,image/png', hintKey: 'branding.icon.icon512.hint' },
];

const COLOR_GROUPS = [
  ['canvas', ['bg', 'surface', 'text']],
  ['accent', ['primary', 'danger', 'success', 'warning']],
];

export function BrandingView() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [colors, setColors] = useState({ light: { ...SITE_DEFAULTS.light }, dark: { ...SITE_DEFAULTS.dark } });
  const [savedColors, setSavedColors] = useState({ light: { ...SITE_DEFAULTS.light }, dark: { ...SITE_DEFAULTS.dark } });
  const [scheme, setScheme] = useState('light');
  const [urls, setUrls] = useState({});
  const [icons, setIcons] = useState({});

  function apply(res) {
    setName(res.app_name || '');
    setSavedName(res.app_name || '');
    const nextColors = {
      light: { ...SITE_DEFAULTS.light, ...(res.colors?.light || {}) },
      dark: { ...SITE_DEFAULTS.dark, ...(res.colors?.dark || {}) },
    };
    for (const key of COLOR_KEYS) {
      nextColors.light[key] = String(nextColors.light[key] || '').toLowerCase();
      nextColors.dark[key] = String(nextColors.dark[key] || '').toLowerCase();
    }
    setColors(nextColors);
    setSavedColors(nextColors);
    setUrls(res.urls || {});
    setIcons(res.icons || {});
  }

  useEffect(() => {
    api('GET', '/api/branding').then(
      (res) => {
        apply(res);
        setError('');
      },
      (e) => setError(errorText(t, e)),
    ).finally(() => setLoading(false));
  }, [t]);

  const dirty =
    name.trim() !== savedName
    || !sameScheme(colors.light, savedColors.light)
    || !sameScheme(colors.dark, savedColors.dark);

  async function save() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api('PUT', '/api/branding', { app_name: name.trim(), colors });
      apply(res);
      setSiteDefaults(res.colors);
      applyBrand(res);
      setNotice(t('branding.saved'));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadSlot(slot, file) {
    if (!file) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await putIcon(slot, file);
      apply(res);
      applyBrand(res);
      setNotice(t('branding.icon.uploaded'));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function clearSlot(slot) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api('DELETE', `/api/branding/icons/${encodeURIComponent(slot)}`);
      apply(res);
      applyBrand(res);
      setNotice(t('branding.icon.cleared'));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  function updateColor(key, hex) {
    setColors((c) => ({ ...c, [scheme]: { ...c[scheme], [key]: hex } }));
    setNotice('');
  }

  function previewUrl(slot) {
    if (slot === 'logo') return urls.logo || '';
    if (slot === 'favicon') return icons.favicon ? urls.favicon : '';
    if (slot === 'icon192') return icons.icon192 ? urls.icon192 : '';
    if (slot === 'icon512') return icons.icon512 ? urls.icon512 : '';
    return '';
  }

  function isCustom(slot) {
    if (slot === 'logo') return !!icons.logo;
    return !!icons[slot];
  }

  return (
    <div class="h-100 overflow-auto">
      <div class="container-fluid chat-column py-3">
        <h1 class="h4">{t('branding.title')}</h1>
        <p class="text-body-secondary">{t('branding.intro')}</p>
        {loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
        {error && <div class="alert alert-danger">{error}</div>}
        {notice && <div class="alert alert-success py-2">{notice}</div>}
        {!loading && (
          <>
            <div class="mb-4">
              <label class="form-label" for="branding-name">{t('branding.name')}</label>
              <input
                id="branding-name"
                class="form-control"
                maxLength={64}
                value={name}
                disabled={busy}
                onInput={(e) => {
                  setName(e.currentTarget.value);
                  setNotice('');
                }}
              />
              <div class="form-text">{t('branding.name.help')}</div>
            </div>

            <h2 class="h6">{t('branding.icons')}</h2>
            <p class="small text-body-secondary">{t('branding.icons.help')}</p>
            <div class="row g-3 mb-4">
              {ICON_SLOTS.map(({ slot, accept, hintKey }) => (
                <div class="col-12 col-md-6" key={slot}>
                  <div class="border rounded p-3 h-100">
                    <div class="d-flex align-items-center gap-3 mb-2">
                      <div class="branding-icon-preview border rounded d-flex align-items-center justify-content-center bg-body-tertiary">
                        {previewUrl(slot) ? (
                          <img src={previewUrl(slot)} alt="" />
                        ) : (
                          <i class="bi bi-image text-body-secondary" aria-hidden="true"></i>
                        )}
                      </div>
                      <div class="min-w-0">
                        <div class="fw-semibold">{t(`branding.icon.${slot}`)}</div>
                        <div class="small text-body-secondary">{t(hintKey)}</div>
                      </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                      <label class={`btn btn-sm btn-outline-secondary mb-0 ${busy ? 'disabled' : ''}`}>
                        {t('branding.icon.upload')}
                        <input
                          type="file"
                          class="d-none"
                          accept={accept}
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = '';
                            uploadSlot(slot, file);
                          }}
                        />
                      </label>
                      {isCustom(slot) && (
                        <button type="button" class="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => clearSlot(slot)}>
                          {t('branding.icon.clear')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <h2 class="h6">{t('branding.colors')}</h2>
            <p class="small text-body-secondary">{t('branding.colors.help')}</p>
            <div class="btn-group mb-3" role="group" aria-label={t('theme.mode')}>
              <button type="button" class={`btn btn-sm ${scheme === 'light' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setScheme('light')}>
                {t('theme.light')}
              </button>
              <button type="button" class={`btn btn-sm ${scheme === 'dark' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setScheme('dark')}>
                {t('theme.dark')}
              </button>
            </div>
            {COLOR_GROUPS.map(([group, keys]) => (
              <fieldset class="border-0 p-0 mb-3" key={group}>
                <legend class="form-label small text-uppercase text-body-secondary mb-2">{t(`theme.group.${group}`)}</legend>
                <div class="d-flex flex-column gap-2">
                  {keys.map((key) => (
                    <ColorRow
                      key={`${scheme}-${key}`}
                      name={key}
                      color={colors[scheme][key]}
                      label={t(`theme.${key}`)}
                      onPick={(hex) => updateColor(key, hex)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}

            <div class="d-flex flex-wrap gap-2 mt-3 pt-3 border-top">
              <button type="button" class="btn btn-sm btn-primary" disabled={busy || !dirty || !name.trim()} onClick={save}>
                {busy ? <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> : t('common.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
      <label class="theme-row-label text-truncate" for={`branding-${name}`}>{label}</label>
      <input
        id={`branding-${name}`}
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

function putIcon(slot, file) {
  if (import.meta.env.VITE_DEMO) {
    return import('../../demo/note.js').then((m) => m.rejectDemo());
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/branding/icons/${encodeURIComponent(slot)}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-CSRF-Token', csrf());
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name || 'icon'));
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* nginx error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.app_name) return resolve(data);
      const err = data?.error || {};
      reject(new ApiError(xhr.status, err.code || (xhr.status === 413 ? 'file_too_large' : 'http_' + xhr.status), err.message || '', err));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error'));
    xhr.send(file);
  });
}
