import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../frontend/src/i18n/index.js';
import { bindDemoNote } from './note.js';

export function NoteModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => bindDemoNote(() => setOpen(true)), []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div class="modal-backdrop fade show" onClick={() => setOpen(false)}></div>
      <div class="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="demo-note-title" tabIndex={-1}>
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5" id="demo-note-title">{t('demo.note.title')}</h2>
              <button type="button" class="btn-close" aria-label={t('demo.note.close')} onClick={() => setOpen(false)}></button>
            </div>
            <div class="modal-body">
              <p class="mb-0">{t('demo.note.body')}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" ref={closeRef} onClick={() => setOpen(false)}>
                {t('demo.note.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
