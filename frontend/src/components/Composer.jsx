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
    if (menuOpen) setAddOpen(false);
  }, [menuOpen]);

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
              onClick={() => setAddOpen((open) => !open)}
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
      <div class="d-flex align-items-center gap-2 mt-1">
        {choices.length > 0 && (
          <select
            class="form-select form-select-sm w-auto model-select"
            value={model}
            disabled={running}
            onChange={(e) => onModelChange(e.currentTarget.value)}
            title={t('composer.model')}
            aria-label={t('composer.model')}
          >
            <option value="">{t('composer.modelDefault', { model: models?.current?.model || '?' })}</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {models.providers.length > 1 ? `${c.provider} · ${c.model}` : c.model}
              </option>
            ))}
          </select>
        )}
        <div class={`form-text m-0 text-truncate ${(voice.notice && !voice.recording && !sendingVoice) || (failed && !running) ? 'text-danger' : ''} ${items.length || voice.recording || voice.notice || sendingVoice ? '' : 'd-none d-md-block'}`}>{hint}</div>
      </div>
    </div>
  );
}
