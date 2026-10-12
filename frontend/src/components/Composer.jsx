import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.js';
import { errorText } from '../util.js';
import { fileIcon, humanSize } from '../uploads.js';
import { matchingCommands } from '../commands.js';
import { useVoiceRecorder } from '../recorder.js';

function clock(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AttachmentChip({ item, onRemove }) {
  const { t } = useI18n();
  const pct = Math.round(item.progress * 100);
  const failed = item.status === 'error';
  return (
    <div class={`attachment-chip ${failed ? 'is-error' : ''}`} title={failed ? errorText(t, item.error) : item.name}>
      <div class="attachment-thumb">
        {item.preview ? <img src={item.preview} alt="" /> : <i class={`bi ${failed ? 'bi-exclamation-triangle' : fileIcon(item.mime)}`} aria-hidden="true"></i>}
      </div>
      <div class="attachment-meta">
        <div class="attachment-name text-truncate">{item.name}</div>
        <div class={`attachment-sub text-truncate ${failed ? 'text-danger' : 'text-body-secondary'}`}>
          {failed ? errorText(t, item.error) : item.status === 'uploading' ? t('composer.uploading', { pct }) : humanSize(item.size)}
        </div>
      </div>
      <button type="button" class="btn-close attachment-remove" aria-label={t('composer.remove', { name: item.name })} onClick={() => onRemove(item.key)}></button>
      {item.status === 'uploading' && (
        <div class="attachment-progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
          <div class="attachment-progress-bar" ref={(el) => el && (el.style.width = `${pct}%`)}></div>
        </div>
      )}
    </div>
  );
}

export function Composer({ value, onChange, onSubmit, onVoice, onStop, busy, running, canSteer, models, choices, model, onModelChange, attachments, maxUploadBytes }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const picker = useRef(null);
  const menuRef = useRef(null);
  const { items, add, remove, uploading, failed, ready } = attachments;
  const [sendingVoice, setSendingVoice] = useState(false);
  const voice = useVoiceRecorder({
    maxBytes: maxUploadBytes || 50 * 1024 * 1024,
    onClip: (file) => {
      setSendingVoice(true);
      Promise.resolve(onVoice(file)).finally(() => setSendingVoice(false));
    },
  });
  const matches = running ? [] : matchingCommands(value);
  const [active, setActive] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef(null);
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef(null);
  const menuOpen = matches.length > 0;

  useEffect(() => {
    setActive(0);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [value]);

  useEffect(() => {
    if (!menuOpen) return;
    const node = menuRef.current?.querySelector('[data-active="1"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      setAddOpen(false);
      setModelOpen(false);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (running) setModelOpen(false);
  }, [running]);

  useEffect(() => {
    if (!addOpen) return;
    function onPointer(e) {
      if (!addRef.current?.contains(e.target)) setAddOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setAddOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [addOpen]);

  useEffect(() => {
    if (!modelOpen) return;
    function fit() {
      const menu = modelRef.current?.querySelector('.composer-model-menu');
      const box = modelRef.current?.getBoundingClientRect();
      if (!menu || !box) return;
      const view = window.visualViewport;
      const viewTop = view?.offsetTop ?? 0;
      const viewHeight = view?.height ?? window.innerHeight;
      const room = Math.floor(box.top - viewTop - 12);
      const cap = Math.floor(viewHeight * 0.8);
      menu.style.maxHeight = `${Math.max(120, Math.min(room, cap))}px`;
    }
    function onPointer(e) {
      if (!modelRef.current?.contains(e.target)) setModelOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setModelOpen(false);
    }
    fit();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
    };
  }, [modelOpen]);

  const typed = value.trim() !== '';
  const hasContent = typed || (!running && ready.length > 0);
  const blocked = !running && (uploading || failed);
  const canSend = !busy && !voice.recording && hasContent && !blocked && (!running || canSteer);
  const showMic = !voice.recording && !running && !typed && items.length === 0;

  function pickCommand(cmd) {
    const text = `/${cmd.name}`;
    onChange(text);
    onSubmit(text);
  }

  function onKeyDown(e) {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = matches[active] || matches[0];
        if (cmd) onChange(`/${cmd.name}`);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onChange('');
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const cmd = matches[active] || matches[0];
        if (cmd) pickCommand(cmd);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  function onPaste(e) {
    const files = e.clipboardData?.files;
    if (files?.length && !running && !voice.recording) {
      e.preventDefault();
      add(files);
    }
  }

  const placeholder = running ? (canSteer ? t('composer.steerPlaceholder') : t('composer.waitPlaceholder')) : t('composer.placeholder');
  const recordHint = voice.recording
    ? t('composer.recording', { time: clock(voice.seconds) })
    : voice.notice === 'denied'
      ? t('composer.recordDenied')
      : voice.notice === 'unsupported'
        ? t('composer.recordUnsupported')
        : voice.notice === 'limit'
          ? t('composer.recordLimit', { max: humanSize(maxUploadBytes || 50 * 1024 * 1024) })
          : '';
  const hint = voice.recording
    ? t('composer.recording', { time: clock(voice.seconds) })
    : sendingVoice
      ? t('composer.sendingVoice')
      : recordHint || (running
        ? (items.length ? t('composer.attachLater') : t('composer.steerHint'))
        : uploading ? t('composer.waitUploads') : failed ? t('composer.fixFailed') : t('composer.hint'));

  return (
    <div class="border-top p-2 p-md-3 bg-body">
      {items.length > 0 && (
        <div class="attachment-list mb-2">
          {items.map((item) => <AttachmentChip key={item.key} item={item} onRemove={remove} />)}
        </div>
      )}
      <div class="composer position-relative">
        {menuOpen && (
          <ul class="command-menu list-unstyled mb-0" role="listbox" aria-label={t('cmd.menu')} ref={menuRef}>
            {matches.map((cmd, i) => (
              <li key={cmd.name} role="option" aria-selected={i === active} data-active={i === active ? '1' : '0'}>
                <button
                  type="button"
                  class={`command-menu-item ${i === active ? 'is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickCommand(cmd)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span class="command-menu-name">/{cmd.name}</span>
                  <span class="command-menu-desc text-body-secondary">{t(cmd.descKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div class="composer-box">
          <input
            ref={picker}
            type="file"
            multiple
            class="d-none"
            onChange={(e) => {
              add(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <div class="dropup" ref={addRef}>
            <button
              type="button"
              class="composer-round composer-plus"
              disabled={running || voice.recording}
              aria-expanded={addOpen}
              aria-haspopup="menu"
              aria-controls="composer-add-menu"
              aria-label={t('composer.add')}
              title={running ? t('composer.attachLater') : t('composer.add')}
              onClick={() => {
                setModelOpen(false);
                setAddOpen((open) => !open);
              }}
            >
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
            </button>
            <ul id="composer-add-menu" class={`dropdown-menu composer-add-menu ${addOpen ? 'show' : ''}`} role="menu">
              <li>
                <button
                  type="button"
                  class="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setAddOpen(false);
                    picker.current?.click();
                  }}
                >
                  <i class="bi bi-paperclip me-2" aria-hidden="true"></i>
                  {t('composer.attach')}
                </button>
              </li>
            </ul>
          </div>
          <textarea
            ref={ref}
            class="form-control"
            rows={1}
            placeholder={placeholder}
            value={value}
            disabled={running && !canSteer}
            onInput={(e) => {
              setAddOpen(false);
              setModelOpen(false);
              onChange(e.currentTarget.value);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          {voice.recording && (
            <button type="button" class="composer-round composer-ghost" onClick={voice.cancel} title={t('composer.recordCancel')} aria-label={t('composer.recordCancel')}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          )}
          {choices.length > 0 && (
            <div class="dropup" ref={modelRef}>
              <button
                type="button"
                class="composer-round composer-ghost"
                disabled={running}
                aria-expanded={modelOpen}
                aria-haspopup="menu"
                aria-controls="composer-model-menu"
                aria-label={t('composer.model')}
                title={t('composer.model')}
                onClick={() => {
                  setAddOpen(false);
                  setModelOpen((open) => !open);
                }}
              >
                <svg class="composer-brain" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M14.99 7.05c.06-.14.11-.29.15-.44a3.486 3.486 0 0 0-2.17-4.13c-.08-.86-.56-1.66-1.36-2.12a2.726 2.726 0 0 0-3.62.84C7.51.48 6.68 0 5.74 0a2.72 2.72 0 0 0-2.71 2.47c-.75.28-1.38.8-1.8 1.5-.47.8-.6 1.74-.37 2.64.04.15.08.3.14.44C.37 7.7-.01 8.57-.01 9.51s.37 1.8 1.02 2.46c.15.15.32.29.5.41v.13c0 .96.39 1.84 1.03 2.46C3.16 15.61 4.04 16 5 16s1.81-.36 2.46-1.02c.22-.22.4-.45.56-.72.23.39.53.73.88 1.01.62.48 1.36.72 2.12.72.15 0 .3 0 .46-.03.92-.11 1.74-.58 2.31-1.33.5-.65.75-1.44.72-2.26.91-.62 1.52-1.68 1.52-2.87 0-.93-.38-1.81-1.01-2.46Zm-8.2 7.26a2.547 2.547 0 0 1-4.32-1.47q.495.15 1.02.15c.26 0 .47-.22.47-.47s-.21-.47-.47-.47c-.45 0-.88-.11-1.26-.34-.2-.1-.38-.24-.54-.4-.48-.48-.74-1.12-.74-1.8 0-.78.37-1.52.97-2 .09-.07.2-.14.3-.2.23-.13.3-.42.17-.64a.46.46 0 0 0-.57-.21c0-.03-.02-.06-.03-.08-.17-.66-.08-1.35.27-1.93.25-.43.62-.77 1.06-.99.06.23.15.44.26.64.08.15.24.24.4.24.08 0 .16-.02.24-.07.23-.13.3-.41.18-.64-.14-.24-.23-.52-.24-.79v-.1c0-.99.8-1.79 1.79-1.79s1.79.8 1.79 1.79v3.01c0 1.18-.79 2.23-1.92 2.56-.24.07-.4.33-.32.58.08.24.34.39.58.32.65-.2 1.22-.56 1.66-1.04v4.36c0 .68-.26 1.31-.74 1.79Zm7.01-2.61s-.05.03-.07.05c-.36.19-.77.3-1.21.3a.47.47 0 1 0 0 .94c.35 0 .69-.06 1.01-.15-.05.44-.22.87-.5 1.22a2.534 2.534 0 0 1-3.56.46c-.53-.42-.88-1.02-.97-1.68 0-.1-.02-.22-.02-.32V8.16c.43.48 1.01.85 1.66 1.04.05 0 .08.02.13.02.21 0 .4-.13.45-.34a.456.456 0 0 0-.32-.58 2.68 2.68 0 0 1-1.92-2.56V2.73c0-.32.08-.63.24-.89.49-.86 1.58-1.15 2.44-.66s1.15 1.59.66 2.45c-.13.23-.06.51.17.64s.51.06.64-.17c.11-.21.21-.42.26-.64.44.22.82.56 1.07.99.34.58.44 1.27.27 1.93 0 .03-.02.06-.03.08-.22-.08-.46 0-.58.21-.13.22-.06.51.17.64.1.06.21.13.3.2.6.48.97 1.21.97 2 0 .93-.51 1.75-1.26 2.19"/>
                </svg>
              </button>
              <ul id="composer-model-menu" class={`dropdown-menu composer-model-menu ${modelOpen ? 'show' : ''}`} role="menu">
                <li>
                  <button
                    type="button"
                    class={`dropdown-item ${model === '' ? 'active' : ''}`}
                    role="menuitemradio"
                    aria-checked={model === ''}
                    title={t('composer.modelDefault', { model: models?.current?.model || '?' })}
                    onClick={() => {
                      onModelChange('');
                      setModelOpen(false);
                    }}
                  >
                    {t('composer.modelDefault', { model: models?.current?.model || '?' })}
                  </button>
                </li>
                {choices.map((c) => {
                  const label = models.providers.length > 1 ? `${c.provider} · ${c.model}` : c.model;
                  return (
                    <li key={c.value}>
                      <button
                        type="button"
                        class={`dropdown-item ${model === c.value ? 'active' : ''}`}
                        role="menuitemradio"
                        aria-checked={model === c.value}
                        title={label}
                        onClick={() => {
                          onModelChange(c.value);
                          setModelOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {running && (
            <button type="button" class="composer-round btn btn-outline-danger" onClick={onStop} title={t('composer.stop')} aria-label={t('composer.stop')}>
              <i class="bi bi-stop-fill" aria-hidden="true"></i>
            </button>
          )}
          {voice.recording ? (
            <button type="button" class="composer-round btn btn-primary" onClick={voice.stop} title={t('composer.recordSend')} aria-label={t('composer.recordSend')}>
              <i class="bi bi-send-fill composer-send-icon" aria-hidden="true"></i>
            </button>
          ) : showMic ? (
            <button type="button" class="composer-round btn btn-primary" disabled={sendingVoice || busy} onClick={voice.start} title={t('composer.record')} aria-label={t('composer.record')}>
              {sendingVoice ? (
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              ) : (
                <i class="bi bi-mic-fill" aria-hidden="true"></i>
              )}
            </button>
          ) : (typed || items.length > 0) && (
            <button
              type="button"
              class="composer-round btn btn-primary"
              disabled={!canSend}
              onClick={() => onSubmit()}
              title={running ? t('composer.steer') : t('composer.send')}
              aria-label={running ? t('composer.steer') : t('composer.send')}
            >
              {!sendingVoice && (busy || (uploading && !running)) ? (
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              ) : (
                <i class={running ? 'bi bi-signpost-2' : 'bi bi-send-fill composer-send-icon'} aria-hidden="true"></i>
              )}
            </button>
          )}
        </div>
      </div>
      <div class={`form-text mt-1 text-truncate ${(voice.notice && !voice.recording && !sendingVoice) || (failed && !running) ? 'text-danger' : ''} ${items.length || voice.recording || voice.notice || sendingVoice ? '' : 'd-none d-md-block'}`}>{hint}</div>
    </div>
  );
}
