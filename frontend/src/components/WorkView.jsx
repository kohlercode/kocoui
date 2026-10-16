import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { fileIcon, humanSize } from '../uploads.js';
import { errorText } from '../util.js';
import { Markdown } from './Message.jsx';

function downloadUrl(url) {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

function isMarkdown(name) {
  return /\.(md|markdown)$/i.test(name || '');
}

export function WorkView() {
  const { t, lang } = useI18n();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState('');
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError('');
    api('GET', `/api/work?path=${encodeURIComponent(path)}`).then(
      (res) => {
        if (cancel) return;
        setEntries(res.entries || []);
        setTruncated(!!res.truncated);
      },
      (e) => {
        if (cancel) return;
        setEntries(null);
        setError(errorText(t, e));
      },
    ).finally(() => {
      if (!cancel) setLoading(false);
    });
    return () => { cancel = true; };
  }, [path, reload, t]);

  useEffect(() => {
    setPreview('');
    setPreviewTruncated(false);
    setPreviewError('');
    if (!selected?.text) {
      setPreviewLoading(false);
      return;
    }
    let cancel = false;
    setPreviewLoading(true);
    api('GET', `/api/work/text?path=${encodeURIComponent(selected.path)}`).then(
      (res) => {
        if (cancel) return;
        setPreview(res.text || '');
        setPreviewTruncated(!!res.truncated);
      },
      (e) => {
        if (!cancel) setPreviewError(errorText(t, e));
      },
    ).finally(() => {
      if (!cancel) setPreviewLoading(false);
    });
    return () => { cancel = true; };
  }, [selected, t]);

  function openDir(next) {
    setSelected(null);
    setPath(next);
  }

  const crumbs = path ? path.split('/') : [];
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div class="h-100 d-flex flex-column min-h-0">
      <div class="border-bottom px-3 py-3">
        <div class="d-flex align-items-center gap-2">
          <h1 class="h4 mb-0">{t('work.title')}</h1>
          <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" onClick={() => setReload((n) => n + 1)}>
            <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            <span class="ms-1">{t('work.refresh')}</span>
          </button>
        </div>
        <p class="text-body-secondary mb-2 mt-2">{t('work.intro')}</p>
        <nav aria-label={t('work.title')}>
          <ol class="breadcrumb mb-0">
            <li class={`breadcrumb-item ${crumbs.length === 0 ? 'active' : ''}`}>
              {crumbs.length === 0 ? t('work.root') : (
                <button type="button" class="btn btn-link btn-sm p-0 align-baseline" onClick={() => openDir('')}>{t('work.root')}</button>
              )}
            </li>
            {crumbs.map((name, i) => {
              const crumbPath = crumbs.slice(0, i + 1).join('/');
              const last = i === crumbs.length - 1;
              return (
                <li key={crumbPath} class={`breadcrumb-item ${last ? 'active' : ''}`} aria-current={last ? 'page' : undefined}>
                  {last ? name : (
                    <button type="button" class="btn btn-link btn-sm p-0 align-baseline" onClick={() => openDir(crumbPath)}>{name}</button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <div class="work-layout d-flex flex-column flex-md-row flex-grow-1 min-h-0">
        <div class="work-list overflow-auto border-end">
          {loading && <div class="p-3 text-body-secondary small">{t('common.loading')}</div>}
          {error && <div class="alert alert-danger m-3">{error}</div>}
          {!loading && !error && entries?.length === 0 && <div class="p-3 text-body-secondary">{t('work.empty')}</div>}
          {!loading && !error && entries?.length > 0 && (
            <div class="list-group list-group-flush">
              {entries.map((entry) => {
                if (entry.type === 'dir') {
                  return (
                    <button type="button" key={entry.path} class="list-group-item list-group-item-action d-flex align-items-center gap-2" onClick={() => openDir(entry.path)}>
                      <i class="bi bi-folder" aria-hidden="true"></i>
                      <span class="text-truncate">{entry.name}</span>
                    </button>
                  );
                }
                if (entry.type === 'link') {
                  return (
                    <div key={entry.path} class="list-group-item d-flex align-items-center gap-2 text-body-secondary" title={t('work.link')}>
                      <i class="bi bi-link-45deg" aria-hidden="true"></i>
                      <span class="text-truncate">{entry.name}</span>
                      <span class="small ms-auto">{t('work.link')}</span>
                    </div>
                  );
                }
                const active = selected?.path === entry.path;
                return (
                  <button
                    type="button"
                    key={entry.path}
                    class={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${active ? 'active' : ''}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => setSelected(entry)}
                  >
                    <i class={`bi ${fileIcon(entry.mime, entry.kind)}`} aria-hidden="true"></i>
                    <span class="text-truncate">{entry.name}</span>
                    <span class={`small ms-auto ${active ? '' : 'text-body-secondary'}`}>{humanSize(entry.size || 0)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {truncated && <div class="p-3 small text-body-secondary">{t('work.truncated')}</div>}
        </div>
        <div class="work-preview overflow-auto p-3">
          {!selected && <div class="text-body-secondary">{t('work.previewEmpty')}</div>}
          {selected && (
            <>
              <div class="d-flex flex-wrap align-items-baseline gap-2 mb-3">
                <h2 class="h5 mb-0 text-truncate">{selected.name}</h2>
                <span class="small text-body-secondary">{humanSize(selected.size || 0)}</span>
                {selected.modified ? <span class="small text-body-secondary">{dateFmt.format(selected.modified * 1000)}</span> : null}
                {selected.url && (
                  <a class="btn btn-outline-secondary btn-sm ms-md-auto" href={downloadUrl(selected.url)} download={selected.name}>
                    {t('work.download')}
                  </a>
                )}
              </div>
              {selected.text && previewLoading && <div class="text-body-secondary small">{t('common.loading')}</div>}
              {selected.text && previewError && <div class="alert alert-danger">{previewError}</div>}
              {selected.text && !previewLoading && !previewError && (
                <>
                  {previewTruncated && <div class="small text-body-secondary mb-2">{t('work.previewTruncated')}</div>}
                  {isMarkdown(selected.name)
                    ? <Markdown text={preview} />
                    : <pre class="work-pre border rounded p-3 mb-0">{preview}</pre>}
                </>
              )}
              {!selected.text && selected.kind === 'image' && selected.url && (
                <img class="img-fluid" src={selected.thumb ? `${selected.thumb}&w=960` : selected.url} alt={selected.name} />
              )}
              {!selected.text && selected.kind === 'audio' && selected.url && (
                <audio class="w-100" src={selected.url} controls></audio>
              )}
              {!selected.text && selected.kind === 'video' && selected.url && (
                <video class="w-100" src={selected.url} controls playsInline></video>
              )}
              {!selected.text && selected.kind === 'pdf' && selected.url && (
                <iframe class="work-pdf" src={selected.url} title={selected.name}></iframe>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
