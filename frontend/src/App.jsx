import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { api, onUnauthorized, setCsrf } from './api.js';
import { I18n, initialLang, storeLang, translate } from './i18n/index.js';
import { Login } from './components/Login.jsx';
import { Layout } from './components/Layout.jsx';
import { syncPushAfterLogin } from './push.js';

export function App() {
  const [lang, setLangState] = useState(initialLang);
  const [state, setState] = useState({ status: 'loading', me: null, error: null });

  const i18n = useMemo(
    () => ({
      lang,
      setLang: (l) => {
        storeLang(l);
        setLangState(l);
      },
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang],
  );

  const refresh = useCallback(async () => {
    try {
      const me = await api('GET', '/api/auth/me');
      setCsrf(me.csrf);
      setState({ status: 'ready', me, error: null });
      if (me.authenticated) syncPushAfterLogin(api);
    } catch (error) {
      setState({ status: 'error', me: null, error });
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    refresh();
    return onUnauthorized(refresh);
  }, []);

  let body;
  if (state.status === 'loading') {
    body = (
      <div class="d-flex h-100 align-items-center justify-content-center">
        <div class="spinner-border text-secondary" role="status">
          <span class="visually-hidden">{i18n.t('common.loading')}</span>
        </div>
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <div class="container py-5 narrow">
        <div class="alert alert-danger">
          {state.error.status === 0
            ? i18n.t('common.error.network')
            : i18n.t('common.error.generic', { code: state.error.code })}
        </div>
        <button class="btn btn-outline-secondary" onClick={refresh}>
          {i18n.t('common.retry')}
        </button>
      </div>
    );
  } else if (!state.me.authenticated) {
    body = <Login onSuccess={refresh} />;
  } else {
    body = <Layout user={state.me.user} onLoggedOut={refresh} />;
  }

  return <I18n.Provider value={i18n}>{body}</I18n.Provider>;
}
