import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.js';

// Server default for approvals.timeout; an unanswered request is denied when it runs out.
const APPROVAL_TIMEOUT = 300;

const CHOICE_STYLE = {
  once: 'btn-success',
  session: 'btn-outline-success',
  always: 'btn-outline-warning',
  deny: 'btn-danger',
};

export function ApprovalCard({ approval, onChoose }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const deadline = (approval.timestamp || Date.now() / 1000) + APPROVAL_TIMEOUT;
  const [left, setLeft] = useState(() => Math.max(0, Math.round(deadline - Date.now() / 1000)));

  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round(deadline - Date.now() / 1000))), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const choices = Array.isArray(approval.choices) && approval.choices.length ? approval.choices : ['once', 'deny'];

  async function choose(choice) {
    if (choice === 'always' && !confirm(t('approval.alwaysConfirm'))) return;
    setBusy(choice);
    setError('');
    try {
      await onChoose(choice);
    } catch (e) {
      setError(e.message || String(e));
      setBusy(null);
    }
  }

  const expired = left === 0;
  return (
    <div class="card border-warning mb-3 approval-card">
      <div class="card-header bg-warning-subtle d-flex justify-content-between align-items-center">
        <span>
          <i class="bi bi-shield-exclamation me-2" aria-hidden="true"></i>
          {t('approval.title')}
        </span>
        <span class={`small ${left < 60 ? 'text-danger fw-semibold' : 'text-body-secondary'}`}>
          {expired ? t('approval.expired') : t('approval.countdown', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}
        </span>
      </div>
      <div class="card-body">
        {approval.description && <p class="mb-2">{approval.description}</p>}
        {approval.command && <pre class="approval-command mb-3">{approval.command}</pre>}
        {approval.smart_denied && <div class="alert alert-danger py-2 small">{t('approval.smartDenied')}</div>}
        {error && <div class="alert alert-danger py-2 small">{error}</div>}
        <div class="d-flex flex-wrap gap-2">
          {choices.map((c) => (
            <button class={`btn btn-sm ${CHOICE_STYLE[c] || 'btn-outline-secondary'}`} disabled={!!busy || expired} onClick={() => choose(c)}>
              {busy === c && <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>}
              {t(`approval.choice.${c}`)}
            </button>
          ))}
        </div>
        <div class="form-text mt-2">{t('approval.hint')}</div>
      </div>
    </div>
  );
}
