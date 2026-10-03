import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { errorText } from '../util.js';

function useLoad(path) {
  const [state, setState] = useState({ loading: true, data: [], error: null, available: true });
  useEffect(() => {
    api('GET', path).then(
      (r) => setState({ loading: false, data: r.data || [], error: null, available: r.available !== false }),
      (e) => setState({ loading: false, data: [], error: e, available: true }),
    );
  }, [path]);
  return state;
}

export function ToolsView() {
  const { t } = useI18n();
  const toolsets = useLoad('/api/toolsets');
  const skills = useLoad('/api/skills');
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const sets = [...toolsets.data]
    .sort((a, b) => Number(b.enabled) - Number(a.enabled))
    .filter((s) => !q || [s.name, s.label, s.description, ...s.tools].join(' ').toLowerCase().includes(q));
  const skillList = skills.data.filter((s) => !q || [s.name, s.description, s.category].join(' ').toLowerCase().includes(q));

  return (
    <div class="h-100 overflow-auto">
      <div class="container-fluid chat-column py-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h1 class="h4 m-0">{t('tools.title')}</h1>
          <input
            class="form-control form-control-sm w-auto"
            type="search"
            placeholder={t('tools.filter')}
            value={filter}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
        </div>
        <p class="text-body-secondary small">{t('tools.intro')}</p>

        <h2 class="h5 mt-4">{t('tools.toolsets')}</h2>
        {toolsets.loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
        {toolsets.error && <div class="alert alert-warning">{errorText(t, toolsets.error)}</div>}
        <div class="list-group mb-4">
          {sets.map((s) => (
            <div key={s.name} class={`list-group-item ${s.enabled ? '' : 'text-body-secondary'}`}>
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="min-w-0">
                  <div class="fw-medium">{s.label}</div>
                  <div class="small">{s.description}</div>
                </div>
                <span class={`badge flex-shrink-0 ${s.enabled ? 'text-bg-success' : 'text-bg-secondary'}`}>
                  {s.enabled ? t('tools.enabled') : s.configured ? t('tools.disabled') : t('tools.notConfigured')}
                </span>
              </div>
              {s.tools.length > 0 && (
                <div class="d-flex flex-wrap gap-1 mt-2">
                  {s.tools.map((name) => (
                    <code key={name} class="tool-chip">{name}</code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <h2 class="h5">{t('tools.skills')}</h2>
        {skills.loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
        {skills.error && <div class="alert alert-warning">{errorText(t, skills.error)}</div>}
        {!skills.available && <div class="alert alert-warning">{t('tools.skillsUnavailable')}</div>}
        {!skills.loading && !skills.error && skills.available && skillList.length === 0 && (
          <div class="text-body-secondary small">{t('tools.noSkills')}</div>
        )}
        <div class="list-group mb-4">
          {skillList.map((s) => (
            <div key={s.name} class={`list-group-item ${s.enabled ? '' : 'text-body-secondary'}`}>
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="min-w-0">
                  <div class="fw-medium">{s.name}</div>
                  <div class="small">{s.description}</div>
                </div>
                <div class="d-flex gap-1 flex-shrink-0">
                  {s.category && <span class="badge bg-body-secondary text-body border">{s.category}</span>}
                  {!s.enabled && <span class="badge text-bg-secondary">{t('tools.disabled')}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
