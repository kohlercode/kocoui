import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { fileIcon, humanSize } from '../uploads.js';
import { errorText } from '../util.js';
import { highlightCode } from '../workHighlight.js';
import { Markdown } from './Message.jsx';

function downloadUrl(url) {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

function isMarkdown(name) {
  return /\.(md|markdown)$/i.test(name || '');
}

function canInlinePreview(entry) {
  if (!entry || entry.previewable === false) return false;
  if (entry.text) return true;
  return ['image', 'audio', 'video', 'pdf', 'html'].includes(entry.kind);
}

/** Read-only highlighted source with line numbers (CSP-safe: classes + bundled CSS). */
function CodeBlock({ text, name }) {
  const [html, setHtml] = useState(null);

  useEffect(() => {
    let cancel = false;
    setHtml(null);
    highlightCode(text, name).then((res) => {
      if (!cancel) setHtml(res.html);
    }, () => {
      if (!cancel) setHtml(null);
    });
    return () => { cancel = true; };
  }, [text, name]);

  const lineCount = Math.max(1, String(text || '').split('\n').length);

  return (
    <div class="work-code border rounded">
      <div class="work-code-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre class="work-code-pre mb-0">
        {html != null
          ? <code class="hljs" dangerouslySetInnerHTML={{ __html: html }}></code>
          : <code>{text}</code>}
      </pre>
    </div>
  );
}

function DownloadOnly({ entry, reason, t }) {
  return (
    <div class="work-download-only text-center py-5 px-3">
      <i class={`bi ${fileIcon(entry.mime, entry.kind)} display-6 text-body-secondary`} aria-hidden="true"></i>
      <p class="mt-3 mb-1">{entry.name}</p>
      <p class="text-body-secondary small mb-3">{reason}</p>
      {entry.url && (
        <a class="btn btn-primary" href={downloadUrl(entry.url)} download={entry.name}>
          {t('work.download')}
        </a>
      )}
    </div>
  );
}

/** Sandboxed HTML preview in a modal so page CSS cannot touch the UI shell. */
function HtmlPreviewModal({ entry, onClose, t }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="work-html-backdrop" role="presentation" onClick={onClose}>
      <div
        class="work-html-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="work-html-bar d-flex align-items-center gap-2 px-3 py-2 border-bottom">
          <span class="text-truncate fw-semibold">{entry.name}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" onClick={onClose}>
            {t('work.htmlClose')}
          </button>
        </div>
        <iframe
          class="work-html-frame"
          src={entry.url}
          title={entry.name}
          sandbox=""
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </div>
  );
}

export function WorkView({ onAskAgent }) {
  const { t, lang } = useI18n();
  const [path, setPath] = useState('');
  const [dirAbsolute, setDirAbsolute] = useState('');
  const [entries, setEntries] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState('');
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError('');
    api('GET', `/api/work?path=${encodeURIComponent(path)}`).then(
      (res) => {
        if (cancel) return;
        setEntries(res.entries || []);
        setDirAbsolute(res.absolute || '');
        setTruncated(!!res.truncated);
      },
      (e) => {
        if (cancel) return;
        setEntries(null);
        setDirAbsolute('');
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
    setHtmlOpen(false);
    if (!selected?.text || !canInlinePreview(selected)) {
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
    setHtmlOpen(false);
    setPath(next);
  }

  function askAboutFile(entry) {
    if (!onAskAgent || !entry?.absolute) return;
    onAskAgent(t('work.ask.fileDraft', { path: entry.absolute, name: entry.name }));
  }

  function askAboutFolder() {
    if (!onAskAgent || !dirAbsolute) return;
    const label = path || t('work.root');
    onAskAgent(t('work.ask.folderDraft', { path: dirAbsolute, name: label }));
  }

  const crumbs = path ? path.split('/') : [];
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
  const showPreview = selected && canInlinePreview(selected);
  const downloadReason = selected && !showPreview
    ? (selected.oversized ? t('work.previewTooLarge') : t('work.previewUnavailable'))
    : '';

  return (
    <div class="h-100 d-flex flex-column min-h-0">
      <div class="border-bottom px-3 py-3">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <h1 class="h4 mb-0">{t('work.title')}</h1>
          <div class="ms-auto d-flex align-items-center gap-2">
            {onAskAgent && dirAbsolute && (
              <button type="button" class="btn btn-outline-secondary btn-sm" onClick={askAboutFolder} title={t('work.ask.folder')}>
                <i class="bi bi-chat-quote" aria-hidden="true"></i>
                <span class="ms-1 d-none d-sm-inline">{t('work.ask.folder')}</span>
              </button>
            )}
            <button type="button" class="btn btn-outline-secondary btn-sm" onClick={() => setReload((n) => n + 1)}>
              <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
              <span class="ms-1">{t('work.refresh')}</span>
            </button>
          </div>
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
                <div class="ms-md-auto d-flex gap-2">
                  {onAskAgent && selected.absolute && (
                    <button type="button" class="btn btn-outline-secondary btn-sm" onClick={() => askAboutFile(selected)}>
                      <i class="bi bi-chat-quote" aria-hidden="true"></i>
                      <span class="ms-1">{t('work.ask.file')}</span>
                    </button>
                  )}
                  {selected.url && (
                    <a class="btn btn-outline-secondary btn-sm" href={downloadUrl(selected.url)} download={selected.name}>
                      {t('work.download')}
                    </a>
                  )}
                </div>
              </div>
              {!showPreview && (
                <DownloadOnly entry={selected} reason={downloadReason} t={t} />
              )}
              {showPreview && selected.text && previewLoading && <div class="text-body-secondary small">{t('common.loading')}</div>}
              {showPreview && selected.text && previewError && <div class="alert alert-danger">{previewError}</div>}
              {showPreview && selected.text && !previewLoading && !previewError && (
                <>
                  {previewTruncated && <div class="small text-body-secondary mb-2">{t('work.previewTruncated')}</div>}
                  {isMarkdown(selected.name)
                    ? <Markdown text={preview} />
                    : <CodeBlock text={preview} name={selected.name} />}
                </>
              )}
              {showPreview && !selected.text && selected.kind === 'image' && selected.url && (
                <div class="work-media">
                  <img
                    class="img-fluid"
                    src={selected.thumb ? `${selected.thumb}&w=960` : selected.url}
                    alt={selected.name}
                  />
                </div>
              )}
              {showPreview && !selected.text && selected.kind === 'audio' && selected.url && (
                <div class="work-media">
                  <audio class="w-100" src={selected.url} controls></audio>
                </div>
              )}
              {showPreview && !selected.text && selected.kind === 'video' && selected.url && (
                <div class="work-media">
                  <video class="w-100" src={selected.url} controls playsInline></video>
                </div>
              )}
              {showPreview && !selected.text && selected.kind === 'pdf' && selected.url && (
                <iframe class="work-pdf" src={selected.url} title={selected.name}></iframe>
              )}
              {showPreview && !selected.text && selected.kind === 'html' && selected.url && (
                <div class="work-download-only text-center py-5 px-3">
                  <i class="bi bi-filetype-html display-6 text-body-secondary" aria-hidden="true"></i>
                  <p class="mt-3 mb-1">{selected.name}</p>
                  <p class="text-body-secondary small mb-3">{t('work.htmlHint')}</p>
                  <button type="button" class="btn btn-primary" onClick={() => setHtmlOpen(true)}>
                    {t('work.htmlOpen')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {htmlOpen && selected?.kind === 'html' && selected.url && (
        <HtmlPreviewModal entry={selected} onClose={() => setHtmlOpen(false)} t={t} />
      )}
    </div>
  );
}
