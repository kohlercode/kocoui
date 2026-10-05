import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { fileMeta } from '../media.js';
import { fileIcon, humanSize } from '../uploads.js';
import { openLightbox } from '../lightbox.js';
import { WAVE_MAX_BYTES } from '../waveform.js';
import { AudioWave } from './AudioWave.jsx';

const MAX_TILES = 6;

export function useFileInfos(paths) {
  const [infos, setInfos] = useState(null);
  const key = paths.join('\n');
  useEffect(() => {
    let live = true;
    setInfos(null);
    Promise.all(paths.map((p) => fileMeta(api, p))).then((list) => live && setInfos(list));
    return () => {
      live = false;
    };
  }, [key]);
  return infos;
}

export function isVisual(f) {
  return !f.missing && (f.kind === 'image' || f.kind === 'video');
}

export function useLightbox() {
  const { t } = useI18n();
  return (files, index) => openLightbox(files, index, {
    close: t('media.close'),
    zoom: t('media.zoom'),
    prev: t('media.prev'),
    next: t('media.next'),
    download: t('media.download'),
    open: t('media.open'),
    error: t('media.loadError'),
  });
}

function srcset(thumb) {
  return [320, 480, 960].map((w) => `${thumb}&w=${w} ${w}w`).join(', ');
}

export function MediaTile({ file, onOpen, sizes, more = 0, single = false }) {
  const { t } = useI18n();
  const ratio = single && file.width && file.height ? file.width / file.height : null;
  return (
    <button
      type="button"
      class={`media-tile ${single ? 'is-single' : ''}`}
      onClick={onOpen}
      title={file.name}
      aria-label={t('media.view', { name: file.name })}
      ref={(el) => el && ratio && (el.style.aspectRatio = String(Math.min(Math.max(ratio, 0.5), 2.4)))}
    >
      {file.kind === 'video' ? (
        <>
          <video src={`${file.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1}></video>
          <span class="media-play"><i class="bi bi-play-fill" aria-hidden="true"></i></span>
        </>
      ) : file.thumb ? (
        <img src={`${file.thumb}&w=480`} srcset={srcset(file.thumb)} sizes={sizes} alt={file.name} loading="lazy" decoding="async" />
      ) : (
        <img src={file.url} alt={file.name} loading="lazy" decoding="async" />
      )}
      {more > 0 && <span class="media-more">+{more}</span>}
    </button>
  );
}

export function FileCard({ file, compact = false }) {
  const { t } = useI18n();
  const name = file.name || file.path?.split('/').pop() || '?';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const audioMessage = file.kind === 'audio' && !compact && !file.missing;

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointer(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (file.missing) {
    return (
      <div class="file-card is-missing" title={file.path}>
        <div class="file-card-icon"><i class="bi bi-file-earmark-x" aria-hidden="true"></i></div>
        <div class="min-w-0 flex-grow-1">
          <div class="file-card-name text-truncate">{name}</div>
          <div class="file-card-meta">{file.error ? t('media.loadError') : t('media.missing')}</div>
        </div>
      </div>
    );
  }
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase().slice(0, 6) : '';
  const viewable = file.kind === 'pdf' || file.mime === 'text/plain';
  return (
    <div class={`file-card kind-${file.kind} ${compact ? 'is-compact' : ''} ${audioMessage && menuOpen ? 'is-menu-open' : ''}`}>
      {audioMessage && (
        <div class="audio-card-menu" ref={menuRef}>
          <button
            type="button"
            class="audio-card-more"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={t('media.more')}
            title={t('media.more')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i class="bi bi-caret-down-fill" aria-hidden="true"></i>
          </button>
          <ul class={`dropdown-menu dropdown-menu-end ${menuOpen ? 'show' : ''}`} role="menu">
            <li>
              <a class="dropdown-item" role="menuitem" href={`${file.url}&download=1`} download={name} onClick={() => setMenuOpen(false)}>
                <i class="bi bi-download me-2" aria-hidden="true"></i>
                {t('media.download')}
              </a>
            </li>
          </ul>
        </div>
      )}
      {!audioMessage && (
        <div class="d-flex align-items-center gap-2 w-100 min-w-0">
          <div class="file-card-icon"><i class={`bi ${fileIcon(file.mime, file.kind)}`} aria-hidden="true"></i></div>
          <div class="min-w-0 flex-grow-1">
            <div class="file-card-name text-truncate" title={name}>{name}</div>
            <div class="file-card-meta">{[ext, humanSize(file.size)].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="file-card-actions">
            {viewable && (
              <a class="btn btn-sm btn-link" href={file.url} target="_blank" rel="noopener" title={t('media.open')} aria-label={t('media.open')}>
                <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
              </a>
            )}
            <a class="btn btn-sm btn-link" href={`${file.url}&download=1`} download={name} title={t('media.download')} aria-label={t('media.download')}>
              <i class="bi bi-download" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      )}
      {file.kind === 'audio' && !compact && (
        file.size > 0 && file.size <= WAVE_MAX_BYTES
          ? <AudioWave file={file} />
          : <audio class="file-card-audio" src={file.url} controls preload="none"></audio>
      )}
    </div>
  );
}

/** Attachments of one message: an album of images/videos plus cards for everything else. */
export function MediaGallery({ paths, align = 'start' }) {
  const { t } = useI18n();
  const infos = useFileInfos(paths);
  const open = useLightbox();

  if (!infos) {
    return (
      <div class={`media-gallery align-${align} placeholder-glow`} aria-busy="true">
        <div class="media-skeleton placeholder rounded-3"></div>
        <span class="visually-hidden">{t('common.loading')}</span>
      </div>
    );
  }
  const visual = infos.filter(isVisual);
  const others = infos.filter((f) => !isVisual(f));
  const shown = visual.slice(0, MAX_TILES);
  const cols = Math.min(shown.length, 3);
  const sizes = shown.length === 1 ? '(max-width: 576px) 85vw, 420px' : `(max-width: 576px) ${Math.round(85 / cols)}vw, ${Math.round(420 / cols)}px`;

  return (
    <div class={`media-gallery align-${align}`}>
      {shown.length > 0 && (
        <div class={`media-grid cols-${cols} count-${shown.length}`}>
          {shown.map((f, i) => (
            <MediaTile
              key={f.path}
              file={f}
              sizes={sizes}
              single={shown.length === 1}
              more={i === shown.length - 1 ? visual.length - shown.length : 0}
              onOpen={() => open(visual, i)}
            />
          ))}
        </div>
      )}
      {others.map((f) => <FileCard key={f.path} file={f} />)}
    </div>
  );
}
