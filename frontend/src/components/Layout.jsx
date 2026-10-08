import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { api, setCsrf } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { getTheme, setTheme } from '../theme.js';
import { ThemePanel } from './ThemePanel.jsx';
import { errorText } from '../util.js';
import { LanguageSelect } from './LanguageSelect.jsx';
import { SessionList } from './SessionList.jsx';
import { ChatView } from './ChatView.jsx';
import { ToolsView } from './ToolsView.jsx';
import { JobsView } from './JobsView.jsx';
import { PersonaView } from './PersonaView.jsx';
import { disablePush, enablePush, pushPrefOn, pushSupported } from '../push.js';
import { play, setSoundsEnabled, soundsEnabled } from '../sounds.js';

function sessionFromHash() {
  const m = location.hash.match(/^#\/s\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function viewFromHash() {
  if (location.hash === '#/tools') return 'tools';
  if (location.hash === '#/jobs') return 'jobs';
  if (location.hash === '#/persona') return 'persona';
  return 'chat';
}

export function Layout({ user, onLoggedOut }) {
  const { t } = useI18n();
  const [theme, setThemeState] = useState(getTheme);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [activeId, setActiveId] = useState(sessionFromHash);
  const [view, setView] = useState(viewFromHash);
  const [viewKey, setViewKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pushOn, setPushOn] = useState(pushPrefOn);
  const [pushBusy, setPushBusy] = useState(false);
  const [soundsOn, setSoundsOn] = useState(soundsEnabled);
  const settingsRef = useRef(null);
  const [features, setFeatures] = useState({});
  const [models, setModels] = useState(null);
  const [limits, setLimits] = useState(null);
  const appName = document.documentElement.dataset.appName || 'Hermes';
  const rawVersion = document.documentElement.dataset.appVersion || '';
  const appVersion = /^\d+\.\d+\.\d+$/.test(rawVersion) ? rawVersion : '';

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await api('GET', '/api/sessions?limit=100');
      setSessions((res.data || []).filter((s) => !s.hidden));
      setSessionsError('');
    } catch (e) {
      setSessionsError(errorText(t, e));
    } finally {
      setSessionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSessions();
    api('GET', '/api/capabilities').then((r) => {
      setFeatures(r.features || {});
      setLimits(r.files || null);
    }, () => {});
    api('GET', '/api/models').then(setModels, () => setModels({ current: {}, providers: [] }));
    const onHash = () => {
      const v = viewFromHash();
      setView(v);
      if (v !== 'chat') return;
      const id = sessionFromHash();
      setActiveId((cur) => {
        if (cur !== id) setViewKey((k) => k + 1);
        return id;
      });
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  function select(id) {
    setSidebarOpen(false);
    const wasChat = view === 'chat';
    setView('chat');
    if (id === activeId && wasChat) return;
    location.hash = id ? `#/s/${encodeURIComponent(id)}` : '';
    if (id !== activeId) {
      setActiveId(id);
      setViewKey((k) => k + 1);
    }
  }

  function show(v) {
    setSidebarOpen(false);
    if (v === 'chat') return select(activeId);
    location.hash = `#/${v}`;
    setView(v);
  }

  const onSessionCreated = useCallback((id) => {
    setActiveId(id);
    history.replaceState(null, '', `#/s/${encodeURIComponent(id)}`);
    loadSessions();
  }, [loadSessions]);

  async function rename(id, title) {
    try {
      await api('PATCH', `/api/sessions/${encodeURIComponent(id)}`, { title });
    } finally {
      loadSessions();
    }
  }

  async function remove(id) {
    try {
      await api('DELETE', `/api/sessions/${encodeURIComponent(id)}`);
      if (id === activeId) select(null);
    } catch (e) {
      alert(errorText(t, e));
    } finally {
      loadSessions();
    }
  }

  function chooseMode(next) {
    setTheme(next);
    setThemeState(next);
  }

  useEffect(() => {
    if (!settingsOpen) return;
    function onPointer(e) {
      if (!settingsRef.current?.contains(e.target)) setSettingsOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  async function logout() {
    try {
      const res = await api('POST', '/api/auth/logout');
      setCsrf(res.csrf);
    } finally {
      onLoggedOut();
    }
  }

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    setSettingsOpen(false);
    try {
      if (pushOn) {
        await disablePush(api);
        setPushOn(false);
        return;
      }
      const result = await enablePush(api);
      if (result === 'on') {
        setPushOn(true);
        return;
      }
      if (result === 'denied') alert(t('nav.push.denied'));
      else if (result === 'unsupported') alert(t('nav.push.unsupported'));
      else if (result === 'disabled') alert(t('nav.push.disabled'));
      else alert(t('nav.push.error', { code: result }));
    } catch (e) {
      alert(errorText(t, e));
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div class="d-flex flex-column h-100">
      <nav class="navbar border-bottom bg-body-tertiary px-2 px-md-3 flex-nowrap">
        <div class="d-flex align-items-center gap-2 min-w-0">
          <button class="btn btn-outline-secondary d-md-none" onClick={() => setSidebarOpen((o) => !o)} aria-label={t('nav.sessions')}>
            <i class="bi bi-list" aria-hidden="true"></i>
          </button>
          <span class="navbar-brand mb-0 h1 text-truncate d-none d-lg-inline">
            <i class="bi bi-robot me-2" aria-hidden="true"></i>
            {appName}
          </span>
          {appVersion && (
            <span class="app-version d-none d-lg-inline" aria-label={t('nav.version', { version: appVersion })}>
              {appVersion}
            </span>
          )}
        </div>
        <div class="d-flex align-items-center gap-2">
          <div class="btn-group" role="group" aria-label={t('nav.views')}>
            <button class={`btn ${view === 'chat' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => show('chat')} title={t('nav.chat')}>
              <i class="bi bi-chat-left-text" aria-hidden="true"></i>
              <span class="d-none d-lg-inline ms-1">{t('nav.chat')}</span>
            </button>
            <button class={`btn ${view === 'tools' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => show('tools')} title={t('nav.tools')}>
              <i class="bi bi-tools" aria-hidden="true"></i>
              <span class="d-none d-lg-inline ms-1">{t('nav.tools')}</span>
            </button>
            {features.jobs_admin && (
              <button class={`btn ${view === 'jobs' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => show('jobs')} title={t('nav.jobs')}>
                <i class="bi bi-clock-history" aria-hidden="true"></i>
                <span class="d-none d-lg-inline ms-1">{t('nav.jobs')}</span>
              </button>
            )}
            <button class={`btn ${view === 'persona' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => show('persona')} title={t('nav.persona')}>
              <i class="bi bi-person-heart" aria-hidden="true"></i>
              <span class="d-none d-lg-inline ms-1">{t('nav.persona')}</span>
            </button>
          </div>
          <LanguageSelect />
          <div class="dropdown" ref={settingsRef}>
            <button
              type="button"
              class="btn btn-outline-secondary dropdown-toggle"
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <i class="bi bi-gear" aria-hidden="true"></i>
              <span class="d-none d-lg-inline ms-1">{t('nav.settings')}</span>
            </button>
            <ul class={`dropdown-menu dropdown-menu-end ${settingsOpen ? 'show' : ''}`} role="menu">
              <li>
                <button
                  type="button"
                  class="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    chooseMode(theme === 'dark' ? 'light' : 'dark');
                    setSettingsOpen(false);
                  }}
                >
                  <i class={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon'} me-2`} aria-hidden="true"></i>
                  {theme === 'dark' ? t('nav.theme.light') : t('nav.theme.dark')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(false);
                    setThemeOpen(true);
                  }}
                >
                  <i class="bi bi-palette me-2" aria-hidden="true"></i>
                  {t('nav.theme.customize')}
                </button>
              </li>
              {pushSupported() && (
                <li>
                  <button
                    type="button"
                    class="dropdown-item"
                    role="menuitem"
                    disabled={pushBusy}
                    onClick={togglePush}
                  >
                    <i class={`bi ${pushOn ? 'bi-bell-slash' : 'bi-bell'} me-2`} aria-hidden="true"></i>
                    {pushOn ? t('nav.push.disable') : t('nav.push.enable')}
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  class="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    const next = !soundsOn;
                    setSoundsEnabled(next);
                    setSoundsOn(next);
                    setSettingsOpen(false);
                    if (next) play('click');
                  }}
                >
                  <i class={`bi ${soundsOn ? 'bi-volume-up' : 'bi-volume-mute'} me-2`} aria-hidden="true"></i>
                  {soundsOn ? t('nav.sounds.off') : t('nav.sounds.on')}
                </button>
              </li>
            </ul>
          </div>
          <span class="text-body-secondary small d-none d-lg-inline">
            <i class="bi bi-person-circle me-1" aria-hidden="true"></i>
            {user.username}
          </span>
          <button class="btn btn-outline-danger" onClick={logout} title={t('nav.logout')}>
            <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
            <span class="d-none d-md-inline ms-1">{t('nav.logout')}</span>
          </button>
        </div>
      </nav>
      <ThemePanel open={themeOpen} mode={theme} onMode={chooseMode} onClose={() => setThemeOpen(false)} />
      <div class="d-flex flex-grow-1 min-h-0 position-relative">
        <aside class={`sidebar border-end bg-body ${sidebarOpen ? 'open' : ''}`}>
          <SessionList
            sessions={sessions}
            loading={sessionsLoading}
            error={sessionsError}
            activeId={activeId}
            onSelect={select}
            onNew={() => select(null)}
            onRename={rename}
            onDelete={remove}
            onReload={loadSessions}
          />
        </aside>
        {sidebarOpen && <div class="sidebar-backdrop d-md-none" onClick={() => setSidebarOpen(false)}></div>}
        <main class="flex-grow-1 min-w-0">
          {/* Stays mounted behind the other views so a running turn keeps streaming. */}
          <div class={view === 'chat' ? 'h-100' : 'd-none'}>
            <ChatView
              key={viewKey}
              initialSessionId={activeId}
              models={models}
              limits={limits}
              onSessionCreated={onSessionCreated}
              onRunFinished={loadSessions}
              onNewChat={() => select(null)}
            />
          </div>
          {view === 'tools' && <ToolsView />}
          {view === 'jobs' && (features.jobs_admin ? <JobsView /> : <div class="p-4 text-body-secondary">{t('jobs.disabled')}</div>)}
          {view === 'persona' && <PersonaView />}
        </main>
      </div>
    </div>
  );
}
