import { useI18n } from '../i18n/index.js';
import { Markdown } from './Message.jsx';
import { ApprovalCard } from './ApprovalCard.jsx';
import { extractFiles } from '../media.js';

export function LiveRun({ run, onApprove }) {
  const { t } = useI18n();
  const waiting = !run.text && run.tools.length === 0 && !run.approval;
  // The files appear with the final transcript; while streaming only the tags are hidden.
  const text = extractFiles('assistant', run.text || '').text;

  return (
    <div class="mb-3">
      {run.tools.length > 0 && (
        <ul class="list-unstyled small mb-2 tool-list">
          {run.tools.map((tool) => (
            <li class="d-flex align-items-start gap-2 mb-1">
              {tool.running ? (
                <span class="spinner-border spinner-border-sm text-secondary mt-1" aria-hidden="true"></span>
              ) : tool.error ? (
                <i class="bi bi-x-circle text-danger" aria-hidden="true"></i>
              ) : (
                <i class="bi bi-check-circle text-success" aria-hidden="true"></i>
              )}
              <div class="min-w-0">
                <span class="fw-medium">{tool.tool}</span>
                {tool.duration != null && <span class="text-body-secondary ms-1">({tool.duration.toFixed(1)} s)</span>}
                {tool.preview && <div class="text-body-secondary text-truncate tool-preview">{tool.preview}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {run.interim.map((text) => (
        <div class="small fst-italic text-body-secondary mb-2">
          <Markdown text={text} />
        </div>
      ))}

      {run.approval && <ApprovalCard approval={run.approval} onChoose={onApprove} />}

      {text && (
        <div class="bubble bubble-agent">
          <Markdown text={text} />
        </div>
      )}

      <div class="small text-body-secondary mt-2 d-flex align-items-center gap-2">
        {waiting || run.status === 'running' ? (
          <>
            <span class="spinner-grow spinner-grow-sm" aria-hidden="true"></span>
            {t('chat.status.working')}
          </>
        ) : run.status === 'waiting_for_approval' ? (
          t('chat.status.approval')
        ) : run.status === 'stopping' ? (
          t('chat.status.stopping')
        ) : run.status === 'queued' ? (
          t('chat.status.queued')
        ) : null}
        {run.steers > 0 && <span class="badge text-bg-info">{t('chat.steered', { n: run.steers })}</span>}
      </div>
    </div>
  );
}

export function RunNotice({ notice, onDismiss }) {
  const { t } = useI18n();
  const style = {
    cancelled: 'alert-secondary',
    failed: 'alert-danger',
    interrupted: 'alert-warning',
    lost: 'alert-info',
    pending_steer: 'alert-info',
  }[notice.kind];
  return (
    <div class={`alert ${style} d-flex justify-content-between align-items-start gap-2`}>
      <div>
        <div>{t(`chat.notice.${notice.kind}`)}</div>
        {notice.error && <div class="small mt-1 font-monospace">{notice.error}</div>}
      </div>
      <button type="button" class="btn-close" aria-label="Close" onClick={onDismiss}></button>
    </div>
  );
}
