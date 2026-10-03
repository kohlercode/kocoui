import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.js';
import { extractFiles } from '../media.js';
import { fileIcon, humanSize } from '../uploads.js';
import { FileCard, isVisual, useFileInfos, useLightbox } from './MediaGallery.jsx';

const VIEW_KEY = 'kocoui.filesView';

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
  return '';
}

/** Every file referenced in the transcript, newest first, each path once. */
export function conversationFiles(messages) {
  const seen = new Set();
  const out = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    for (const path of extractFiles(m.role, contentText(m.content)).paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, origin: m.role === 'user' ? 'upload' : 'agent' });
    }
  }
  return out.reverse();
}

function GridItem({ file, onOpen }) {
  const { t } = useI18n();
  if (isVisual(file)) {
    return (
      <button type="button" class="files-grid-item" onClick={onOpen} title={file.name} aria-label={t('media.view', { name: file.name })}>
        {file.kind === 'video' ? (
          <>
            <video src={`${file.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1}></video>
            <span class="media-play small-play"><i class="bi bi-play-fill" aria-hidden="true"></i></span>
          </>
        ) : (
          <img src={file.thumb ? `${file.thumb}&w=320` : file.url} alt={file.name} loading="lazy" decoding="async" />
        )}
      </button>
    );
  }
  const viewable = !file.missing && (file.kind === 'pdf' || file.mime === 'text/plain');
  const href = file.missing ? undefined : viewable ? file.url : `${file.url}&download=1`;
  return (
    <a
      class={`files-grid-item is-file kind-${file.kind || 'file'} ${file.missing ? 'is-missing' : ''}`}
      href={href}
      target={viewable ? '_blank' : undefined}
      rel="noopener"
      download={!viewable && !file.missing ? file.name : undefined}
      title={file.missing ? t('media.missing') : file.name}
    >
      <i class={`bi ${file.missing ? 'bi-file-earmark-x' : fileIcon(file.mime, file.kind)}`} aria-hidden="true"></i>
      <span class="files-grid-name text-truncate">{file.name || file.path.split('/').pop()}</span>
      {!file.missing && <span class="files-grid-size">{humanSize(file.size)}</span>}
    </a>
  );
}

export function FilesPanel({ open, onClose, messages }) {
  const { t, lang } = useI18n();
  const refs = useMemo(() => conversationFiles(messages), [messages]);
  const infos = useFileInfos(open ? refs.map((r) => r.path) : []);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid');
  const lightbox = useLightbox();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.pswp') && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function chooseView(v) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  const byPath = new Map((infos || []).map((info) => [info.requested || info.path, info]));
  const files = infos
    ? refs.map((r) => ({ ...(byPath.get(r.path) || { missing: true }), path: r.path, origin: r.origin }))
        .map((f) => ({ ...f, name: f.name || f.path.split('/').pop() }))
    : [];
  const counts = { all: files.length, upload: files.filter((f) => f.origin === 'upload').length, agent: files.filter((f) => f.origin === 'agent').length };
  const q = query.trim().toLowerCase();
  const shown = files.filter((f) => (tab === 'all' || f.origin === tab) && (!q || f.name.toLowerCase().includes(q)));
  const visual = shown.filter(isVisual);
  const openVisual = (f) => lightbox(visual, visual.indexOf(f));
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });

  const tabs = [
    ['all', t('filesPanel.all'), 'bi-collection'],
    ['upload', t('filesPanel.uploaded'), 'bi-person'],
    ['agent', t('filesPanel.fromAgent'), 'bi-robot'],
  ];

  return (
    <>
      <div class={`offcanvas offcanvas-end files-panel ${open ? 'show' : ''}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="files-panel-title" inert={!open}>
        <div class="offcanvas-header border-bottom">
          <h5 class="offcanvas-title" id="files-panel-title">
            <i class="bi bi-folder2-open me-2" aria-hidden="true"></i>
            {t('filesPanel.title')}
          </h5>
          <button type="button" class="btn-close" aria-label={t('media.close')} onClick={onClose}></button>
        </div>
        <div class="px-3 pt-3 d-flex flex-column gap-2">
          <ul class="nav nav-pills nav-fill files-tabs small" role="tablist">
            {tabs.map(([id, label, icon]) => (
              <li class="nav-item" role="presentation">
                <button type="button" role="tab" aria-selected={tab === id} class={`nav-link py-1 ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                  <i class={`bi ${icon} me-1 d-none d-sm-inline`} aria-hidden="true"></i>
                  {label}
                  <span class={`badge rounded-pill ms-1 ${tab === id ? 'text-bg-light' : 'text-bg-secondary'}`}>{counts[id]}</span>
                </button>
              </li>
            ))}
          </ul>
          <div class="d-flex gap-2">
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
              <input type="search" class="form-control" placeholder={t('filesPanel.search')} aria-label={t('filesPanel.search')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
            </div>
            <div class="btn-group btn-group-sm" role="group" aria-label={t('filesPanel.layout')}>
              <button type="button" class={`btn ${view === 'grid' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => chooseView('grid')} title={t('filesPanel.grid')} aria-pressed={view === 'grid'}>
                <i class="bi bi-grid-3x3-gap" aria-hidden="true"></i>
              </button>
              <button type="button" class={`btn ${view === 'list' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => chooseView('list')} title={t('filesPanel.list')} aria-pressed={view === 'list'}>
                <i class="bi bi-list-ul" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="offcanvas-body pt-3">
          {open && !infos && refs.length > 0 && (
            <div class="files-grid placeholder-glow">
              {refs.slice(0, 6).map(() => <span class="files-grid-item placeholder"></span>)}
            </div>
          )}
          {infos && shown.length === 0 && (
            <div class="text-center text-body-secondary py-5">
              <i class="bi bi-inbox display-6 d-block mb-2" aria-hidden="true"></i>
              {files.length === 0 ? t('filesPanel.empty') : t('filesPanel.noMatch')}
            </div>
          )}
          {infos && shown.length > 0 && view === 'grid' && (
            <div class="files-grid">
              {shown.map((f) => <GridItem key={f.path} file={f} onOpen={() => openVisual(f)} />)}
            </div>
          )}
          {infos && shown.length > 0 && view === 'list' && (
            <div class="d-flex flex-column gap-2">
              {shown.map((f) => (
                <div key={f.path} class="files-list-row">
                  {isVisual(f) ? (
                    <button type="button" class="files-list-thumb" onClick={() => openVisual(f)} aria-label={t('media.view', { name: f.name })}>
                      {f.kind === 'video'
                        ? <i class="bi bi-play-circle" aria-hidden="true"></i>
                        : <img src={f.thumb ? `${f.thumb}&w=160` : f.url} alt="" loading="lazy" />}
                    </button>
                  ) : null}
                  <div class="flex-grow-1 min-w-0">
                    <FileCard file={f} compact />
                    <div class="files-list-sub">
                      <i class={`bi ${f.origin === 'agent' ? 'bi-robot' : 'bi-person'} me-1`} aria-hidden="true"></i>
                      {f.origin === 'agent' ? t('filesPanel.fromAgent') : t('filesPanel.uploaded')}
                      {f.modified ? ` · ${dateFmt.format(new Date(f.modified * 1000))}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {open && <div class="offcanvas-backdrop fade show" onClick={onClose}></div>}
    </>
  );
}
