import { humanSize } from './uploads.js';

export function relativeTime(lang, seconds) {
  if (!seconds) return '';
  const diff = seconds - Date.now() / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(seconds * 1000).toLocaleDateString(lang);
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

/** User-facing text for an ApiError from our PHP endpoints. */
export function errorText(t, e) {
  const known = {
    network_error: 'common.error.network',
    hermes_unreachable: 'chat.error.unreachable',
    hermes_auth: 'chat.error.auth',
    hermes_busy: 'chat.error.busy',
    idempotency_key_conflict: 'chat.error.idempotency',
    run_not_accepting_steer: 'chat.error.steerRejected',
    steer_not_accepted: 'chat.error.steerRejected',
    approval_not_pending: 'chat.error.approvalGone',
    approval_not_active: 'chat.error.approvalGone',
    unsupported_content_type: 'chat.error.unsupported',
    invalid_model: 'chat.error.model',
    invalid_attachment: 'chat.error.attachment',
    file_too_large: 'files.error.tooLarge',
    too_many_files: 'files.error.tooMany',
    empty_file: 'files.error.empty',
    files_unavailable: 'files.error.unavailable',
    persona_unavailable: 'persona.error.unavailable',
    persona_too_long: 'persona.error.tooLong',
    persona_invalid: 'persona.error.invalid',
    persona_no_previous: 'persona.error.noPrevious',
    restart_unavailable: 'cmd.restart.unavailable',
    restart_pending: 'cmd.restart.pending',
    restart_cooldown: 'cmd.restart.cooldown',
    push_disabled: 'nav.push.disabled',
  };
  const key = known[e?.code];
  const d = e?.data || e || {};
  const params = { max: d.max_bytes ? humanSize(d.max_bytes) : d.max ?? '', seconds: d.retry_after ?? '' };
  return key ? t(key, params) : t('common.error.generic', { code: e?.code || e?.status || '?' });
}
