import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../frontend/src/theme.css';
import '../frontend/src/styles.css';
import { useMemo, useState } from 'preact/hooks';
import { render } from 'preact';
import { I18n, initialLang, storeLang, translate } from '../frontend/src/i18n/index.js';
import { initTheme } from '../frontend/src/theme.js';
import { Layout } from '../frontend/src/components/Layout.jsx';
import { Login } from '../frontend/src/components/Login.jsx';
import { Banner } from './Banner.jsx';
import { NoteModal } from './NoteModal.jsx';

const APPROVAL_SESSION = 'sess_approval';
const APPROVAL_RUN = 'run_approval';

sessionStorage.setItem(`kocoui.run.${APPROVAL_SESSION}`, APPROVAL_RUN);
if (!location.hash) location.replace('#/s/sess_markdown');

addEventListener('unhandledrejection', (event) => {
  if (event.reason?.code === 'demo_readonly') event.preventDefault();
});

function DemoApp() {
  const [lang, setLangState] = useState(initialLang);
  const [login, setLogin] = useState(false);
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

  return (
    <I18n.Provider value={i18n}>
      <div class="d-flex flex-column h-100">
        <Banner login={login} onToggle={() => setLogin((v) => !v)} />
        <div class="flex-grow-1 min-h-0">
          {login ? (
            <Login onSuccess={() => setLogin(false)} />
          ) : (
            <Layout user={{ username: 'alice' }} onLoggedOut={() => {}} />
          )}
        </div>
      </div>
      <NoteModal />
    </I18n.Provider>
  );
}

initTheme();
document.documentElement.lang = initialLang();
render(<DemoApp />, document.getElementById('app'));
