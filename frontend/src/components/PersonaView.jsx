import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { errorText } from '../util.js';

export function PersonaView() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const [max, setMax] = useState(20000);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  function apply(res) {
    setSaved(res.content);
    setText(res.content);
    setMax(res.max_chars || 20000);
    setHasPrevious(!!res.has_previous);
    setReady(true);
  }

  useEffect(() => {
    api('GET', '/api/persona').then(
      (res) => {
        apply(res);
        setError('');
      },
      (e) => setError(errorText(t, e)),
    ).finally(() => setLoading(false));
  }, [t]);

  const dirty = text !== saved;
  const over = [...text].length > max;

  async function save() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api('PUT', '/api/persona', { content: text });
      setSaved(text);
      setHasPrevious(!!res.has_previous);
      setNotice(t('persona.saved'));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!confirm(t('persona.restoreConfirm'))) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      apply(await api('POST', '/api/persona/restore'));
      setNotice(t('persona.restored'));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="h-100 overflow-auto">
      <div class="container-fluid chat-column py-3">
        <h1 class="h4">{t('persona.title')}</h1>
        <p class="text-body-secondary">{t('persona.intro')}</p>
        {loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
        {error && <div class="alert alert-danger">{error}</div>}
        {notice && <div class="alert alert-success py-2">{notice}</div>}
        {!loading && ready && (
          <>
            <textarea
              class="form-control persona-text font-monospace"
              value={text}
              spellcheck={true}
              aria-label={t('persona.title')}
              onInput={(e) => {
                setText(e.currentTarget.value);
                setNotice('');
              }}
            />
            <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
              <span class={`small ${over ? 'text-danger' : 'text-body-secondary'}`}>{t('persona.count', { n: [...text].length, max })}</span>
              <div class="flex-grow-1"></div>
              {hasPrevious && (
                <button type="button" class="btn btn-sm btn-outline-secondary" disabled={busy} onClick={restore}>
                  {t('persona.restore')}
                </button>
              )}
              <button type="button" class="btn btn-sm btn-primary" disabled={busy || !dirty || over} onClick={save}>
                {busy ? <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> : t('common.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
