import { useI18n } from '../frontend/src/i18n/index.js';

export function Banner({ login, onToggle }) {
  const { t } = useI18n();
  return (
    <div class="border-bottom bg-body-secondary px-3 py-2 d-flex flex-wrap align-items-center gap-2 small">
      <i class="bi bi-info-circle" aria-hidden="true"></i>
      <span class="flex-grow-1">{t('demo.banner')}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" onClick={onToggle}>
        {login ? t('demo.back') : t('demo.login')}
      </button>
    </div>
  );
}
