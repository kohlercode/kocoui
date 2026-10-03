import { useState } from 'preact/hooks';
import { api, setCsrf } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { LanguageSelect } from './LanguageSelect.jsx';

export function Login({ onSuccess }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const appName = document.documentElement.dataset.appName || 'Hermes';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('POST', '/api/auth/login', { username, password, code });
      setCsrf(res.csrf);
      onSuccess();
    } catch (err) {
      setCode('');
      if (err.code === 'invalid_credentials') setError(t('login.error.invalid'));
      else if (err.status === 429)
        setError(t('login.error.throttled', { minutes: Math.max(1, Math.ceil((err.data?.retry_after || 60) / 60)) }));
      else if (err.code === 'invalid_input') setError(t('login.error.input'));
      else if (err.status === 0) setError(t('common.error.network'));
      else setError(t('common.error.generic', { code: err.code }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="d-flex h-100 align-items-center justify-content-center p-3 bg-body-tertiary">
      <div class="card shadow-sm login-card">
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h1 class="h4 mb-0">
              <i class="bi bi-robot me-2" aria-hidden="true"></i>
              {appName}
            </h1>
            <LanguageSelect />
          </div>
          <h2 class="h6 text-body-secondary mb-3">{t('login.title')}</h2>
          {error && (
            <div class="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit} autocomplete="on">
            <div class="mb-3">
              <label class="form-label" for="login-username">
                {t('login.username')}
              </label>
              <input
                id="login-username"
                class="form-control"
                autocomplete="username"
                autocapitalize="none"
                spellcheck={false}
                required
                value={username}
                onInput={(e) => setUsername(e.currentTarget.value)}
              />
            </div>
            <div class="mb-3">
              <label class="form-label" for="login-password">
                {t('login.password')}
              </label>
              <input
                id="login-password"
                type="password"
                class="form-control"
                autocomplete="current-password"
                required
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
            </div>
            <div class="mb-4">
              <label class="form-label" for="login-code">
                {t('login.code')}
              </label>
              <input
                id="login-code"
                class="form-control code-input"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                value={code}
                onInput={(e) => setCode(e.currentTarget.value.replace(/[^0-9 ]/g, ''))}
              />
              <div class="form-text">{t('login.code.help')}</div>
            </div>
            <button type="submit" class="btn btn-primary w-100" disabled={busy}>
              {busy && <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
              {t('login.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
