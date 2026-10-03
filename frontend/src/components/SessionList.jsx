import { useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.js';
import { relativeTime } from '../util.js';

export function SessionList({ sessions, loading, error, activeId, onSelect, onNew, onRename, onDelete, onReload }) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');

  function startEdit(s, e) {
    e.stopPropagation();
    setEditing(s.id);
    setTitle(s.title || '');
  }

  async function saveEdit(e) {
    e.preventDefault();
    const value = title.trim();
    if (value) await onRename(editing, value);
    setEditing(null);
  }

  function remove(s, e) {
    e.stopPropagation();
    if (confirm(t('sessions.deleteConfirm', { title: s.title || s.preview || s.id }))) onDelete(s.id);
  }

  return (
    <div class="d-flex flex-column h-100">
      <div class="p-2 border-bottom d-flex gap-2">
        <button class="btn btn-primary btn-sm flex-grow-1" onClick={onNew}>
          <i class="bi bi-plus-lg me-1" aria-hidden="true"></i>
          {t('sessions.new')}
        </button>
        <button class="btn btn-outline-secondary btn-sm" onClick={onReload} title={t('sessions.reload')}>
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
        </button>
      </div>
      <div class="flex-grow-1 overflow-auto">
        {error && <div class="alert alert-warning m-2 py-2 small">{error}</div>}
        {loading && sessions.length === 0 && <div class="p-3 small text-body-secondary">{t('common.loading')}</div>}
        {!loading && !error && sessions.length === 0 && (
          <div class="p-3 small text-body-secondary">{t('sessions.empty')}</div>
        )}
        <ul class="list-group list-group-flush">
          {sessions.map((s) => (
            <li
              key={s.id}
              class={`list-group-item list-group-item-action session-item ${s.id === activeId ? 'active' : ''}`}
              onClick={() => editing !== s.id && onSelect(s.id)}
            >
              {editing === s.id ? (
                <form onSubmit={saveEdit} class="d-flex gap-1">
                  <input
                    class="form-control form-control-sm"
                    value={title}
                    maxLength={200}
                    autoFocus
                    onInput={(e) => setTitle(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  />
                  <button class="btn btn-sm btn-light" type="submit" title={t('common.save')}>
                    <i class="bi bi-check-lg" aria-hidden="true"></i>
                  </button>
                </form>
              ) : (
                <>
                  <div class="d-flex justify-content-between align-items-start gap-2">
                    <div class="text-truncate fw-medium">{s.title || s.preview || t('sessions.untitled')}</div>
                    {s.id === activeId && (
                      <div class="d-flex gap-1 flex-shrink-0">
                        <button class="btn btn-link btn-sm p-0 session-action" onClick={(e) => startEdit(s, e)} title={t('sessions.rename')}>
                          <i class="bi bi-pencil" aria-hidden="true"></i>
                        </button>
                        <button class="btn btn-link btn-sm p-0 session-action" onClick={(e) => remove(s, e)} title={t('sessions.delete')}>
                          <i class="bi bi-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    )}
                  </div>
                  <div class="small session-meta">
                    {relativeTime(lang, s.last_active || s.started_at)}
                    {' · '}
                    {t('sessions.messages', { n: s.message_count || 0 })}
                    {s.source && s.source !== 'api_server' && <span class="badge text-bg-secondary ms-1">{s.source}</span>}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
