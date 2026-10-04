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

export function Composer({ value, onChange, onSubmit, onStop, busy, running, canSteer, models, choices, model, onModelChange, attachments, maxUploadBytes }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const picker = useRef(null);
  const menuRef = useRef(null);
  const { items, add, remove, uploading, failed, ready } = attachments;
  const voice = useVoiceRecorder({
    maxBytes: maxUploadBytes || 50 * 1024 * 1024,
    onClip: (file) => add([file]),
  });
  const matches = running ? [] : matchingCommands(value);
  const [active, setActive] = useState(0);
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

  const hasContent = value.trim() !== '' || (!running && ready.length > 0);
  const blocked = !running && (uploading || failed);
  const canSend = !busy && !voice.recording && hasContent && !blocked && (!running || canSteer);

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
  const hint = recordHint || (running
    ? (items.length ? t('composer.attachLater') : t('composer.steerHint'))
    : uploading ? t('composer.waitUploads') : failed ? t('composer.fixFailed') : t('composer.hint'));

  return (
    <div class="border-top p-2 p-md-3 bg-body">
      {items.length > 0 && (
        <div class="attachment-list mb-2">
          {items.map((item) => <AttachmentChip key={item.key} item={item} onRemove={remove} />)}
        </div>
      )}
      <div class="d-flex gap-2 align-items-end composer position-relative">
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
        <button
          type="button"
          class="btn btn-outline-secondary"
          disabled={running || voice.recording}
          onClick={() => picker.current?.click()}
          title={running ? t('composer.attachLater') : t('composer.attach')}
          aria-label={t('composer.attach')}
        >
          <i class="bi bi-paperclip" aria-hidden="true"></i>
        </button>
        {voice.recording ? (
          <>
            <button type="button" class="btn btn-danger" onClick={voice.stop} title={t('composer.recordStop')} aria-label={t('composer.recordStop')}>
              <i class="bi bi-stop-fill" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn btn-outline-secondary" onClick={voice.cancel} title={t('composer.recordCancel')} aria-label={t('composer.recordCancel')}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </>
        ) : (
          <button
            type="button"
            class="btn btn-outline-secondary"
            disabled={running}
            onClick={voice.start}
            title={t('composer.record')}
            aria-label={t('composer.record')}
          >
            <i class="bi bi-mic" aria-hidden="true"></i>
          </button>
        )}
        <textarea
          ref={ref}
          class="form-control"
          rows={1}
          placeholder={placeholder}
          value={value}
          disabled={running && !canSteer}
          onInput={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        {running && (
          <button class="btn btn-outline-danger" onClick={onStop} title={t('composer.stop')}>
            <i class="bi bi-stop-fill" aria-hidden="true"></i>
            <span class="d-none d-md-inline ms-1">{t('composer.stop')}</span>
          </button>
        )}
        <button
          class={`btn ${running ? 'btn-outline-primary' : 'btn-primary'}`}
          disabled={!canSend}
          onClick={() => onSubmit()}
          title={running ? t('composer.steer') : t('composer.send')}
        >
          {busy || (uploading && !running) ? (
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          ) : (
            <i class={running ? 'bi bi-signpost-2' : 'bi bi-send'} aria-hidden="true"></i>
          )}
          <span class="d-none d-md-inline ms-1">{running ? t('composer.steer') : t('composer.send')}</span>
        </button>
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
        <div class={`form-text m-0 text-truncate ${(voice.notice && !voice.recording) || (failed && !running) ? 'text-danger' : ''} ${items.length || voice.recording || voice.notice ? '' : 'd-none d-md-block'}`}>{hint}</div>
      </div>
    </div>
  );
}
