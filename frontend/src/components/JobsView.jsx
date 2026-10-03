import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { errorText } from '../util.js';

function formatTime(lang, value) {
  if (!value) return '—';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(lang);
}

export function JobsView() {
  const { t, lang } = useI18n();
  const [state, setState] = useState({ loading: true, data: [], error: null });

  function load() {
    setState((s) => ({ ...s, loading: true }));
    api('GET', '/api/jobs').then(
      (r) => setState({ loading: false, data: r.data || [], error: null }),
      (e) => setState({ loading: false, data: [], error: e }),
    );
  }

  useEffect(load, []);

  return (
    <div class="h-100 overflow-auto">
      <div class="container-fluid chat-column py-3">
        <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
          <h1 class="h4 m-0">{t('jobs.title')}</h1>
          <button class="btn btn-sm btn-outline-secondary" onClick={load} title={t('sessions.reload')}>
            <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
          </button>
        </div>
        {state.loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
        {state.error && <div class="alert alert-warning">{errorText(t, state.error)}</div>}
        {!state.loading && !state.error && state.data.length === 0 && (
          <div class="text-body-secondary small">{t('jobs.empty')}</div>
        )}
        {state.data.length > 0 && (
          <div class="table-responsive">
            <table class="table table-sm align-middle">
              <thead>
                <tr>
                  <th>{t('jobs.name')}</th>
                  <th>{t('jobs.schedule')}</th>
                  <th>{t('jobs.next')}</th>
                  <th>{t('jobs.last')}</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((j) => (
                  <tr key={j.id} class={j.enabled ? '' : 'text-body-secondary'}>
                    <td>
                      {j.name || j.id}
                      {!j.enabled && <span class="badge text-bg-secondary ms-1">{t('jobs.paused')}</span>}
                    </td>
                    <td><code>{j.schedule}</code></td>
                    <td>{formatTime(lang, j.next_run_at)}</td>
                    <td>
                      {formatTime(lang, j.last_run_at)}
                      {j.last_status && (
                        <span class={`badge ms-1 ${j.last_status === 'error' ? 'text-bg-danger' : 'text-bg-success'}`}>
                          {j.last_status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
