import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { errorText } from '../util.js';

const STATE_BADGE = {
  connected: 'text-bg-success',
  connecting: 'text-bg-warning',
  lazy: 'text-bg-info',
  failed: 'text-bg-danger',
  disabled: 'text-bg-secondary',
  unknown: 'text-bg-secondary',
};

export function McpView() {
  const { t } = useI18n();
  const [state, setState] = useState({ loading: true, data: [], source: '', error: null });
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  function load() {
    setState((s) => ({ ...s, loading: true }));
    api('GET', '/api/mcp/servers').then(
      (r) => setState({ loading: false, data: r.data || [], source: r.source || '', error: null }),
      (e) => setState({ loading: false, data: [], source: '', error: e }),
    );
  }

  useEffect(load, []);

  const rows = state.data.filter((s) => {
    if (!q) return true;
    const tools = Array.isArray(s.tools) ? s.tools.join(' ') : '';
    return [s.name, s.state, s.transport, tools].join(' ').toLowerCase().includes(q);
  });

  return (
    <div class="h-100 overflow-auto">
      <div class="container-fluid chat-column py-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h1 class="h4 m-0">{t('mcp.title')}</h1>
          <div class="d-flex gap-2">
            <input
              class="form-control form-control-sm w-auto"
              type="search"
              placeholder={t('tools.filter')}
              aria-label={t('tools.filter')}
              value={filter}
              onInput={(e) => setFilter(e.currentTarget.value)}
            />
            <button class="btn btn-sm btn-outline-secondary" onClick={load} title={t('sessions.reload')} aria-label={t('sessions.reload')}>
              <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <p class="text-body-secondary small">{t('mcp.intro')}</p>
        {state.source === 'toolsets' && !state.loading && !state.error && (
          <div class="alert alert-warning py-2 small">{t('mcp.fallback')}</div>
        )}
        {state.loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
        {state.error && <div class="alert alert-warning">{errorText(t, state.error)}</div>}
        {!state.loading && !state.error && rows.length === 0 && (
          <div class="text-body-secondary small">{state.data.length === 0 ? t('mcp.empty') : t('mcp.noMatch')}</div>
        )}
        <div class="list-group mb-4">
          {rows.map((s) => (
            <div key={s.name} class={`list-group-item ${s.state === 'connected' || s.state === 'lazy' ? '' : 'text-body-secondary'}`}>
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="min-w-0">
                  <div class="fw-medium">{s.name}</div>
                  <div class="small">
                    {s.transport ? `${t(`mcp.transport.${s.transport}`)} · ` : ''}
                    {t('mcp.tools', { n: s.tool_count || 0 })}
                  </div>
                </div>
                <span class={`badge flex-shrink-0 ${STATE_BADGE[s.state] || 'text-bg-secondary'}`}>
                  {t(`mcp.state.${s.state}`)}
                </span>
              </div>
              {Array.isArray(s.tools) && s.tools.length > 0 && (
                <div class="d-flex flex-wrap gap-1 mt-2">
                  {s.tools.map((name) => (
                    <code key={name} class="tool-chip">{name}</code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
