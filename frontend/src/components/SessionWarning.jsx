import { useEffect, useRef, useState } from 'preact/hooks';
import { api, setCsrf } from '../api.js';
import { useI18n } from '../i18n/index.js';
import {
  bumpActivity,
  installActivityListeners,
  lastActivityMs,
  setActivityPaused,
} from '../sessionActivity.js';

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : String(r);
}

/**
 * Modal shown shortly before the PHP session expires (idle or absolute).
 *
 * @param {{ idle: number, absolute: number, warn: number, login_at: number } | null | undefined} session
 * @param {() => void | Promise<void>} onLogout  Sign out (POST logout + return to login).
 */
export function SessionWarning({ session, onLogout }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [absoluteBound, setAbsoluteBound] = useState(false);
  const [busy, setBusy] = useState(false);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!session || session.warn <= 0) {
      setOpen(false);
      setActivityPaused(false);
      return undefined;
    }

    expiredRef.current = false;
    bumpActivity({ force: true });
    const stopListen = installActivityListeners();

    const tick = () => {
      const now = Date.now();
      const idleDeadline = lastActivityMs() + session.idle * 1000;
      const absDeadline = session.login_at * 1000 + session.absolute * 1000;
      const deadline = Math.min(idleDeadline, absDeadline);
      const leftMs = deadline - now;
      const left = Math.max(0, Math.ceil(leftMs / 1000));
      const show = now >= deadline - session.warn * 1000;
      const absWins = absDeadline <= idleDeadline;

      setAbsoluteBound(absWins);
      setSecondsLeft(left);

      if (left <= 0) {
        setOpen(false);
        setActivityPaused(false);
        if (!expiredRef.current) {
          expiredRef.current = true;
          onLogout();
        }
        return;
      }

      setOpen(show);
      setActivityPaused(show);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      stopListen();
      setActivityPaused(false);
    };
  }, [session, onLogout]);

  async function stay() {
    if (busy || expiredRef.current) return;
    setBusy(true);
    try {
      const me = await api('GET', '/api/auth/me');
      setCsrf(me.csrf);
      if (!me.authenticated) {
        expiredRef.current = true;
        setOpen(false);
        setActivityPaused(false);
        onLogout();
        return;
      }
      // Absolute expiry cannot be extended; if it still binds, keep the modal.
      if (me.session) {
        const absLeft = me.session.login_at + me.session.absolute - Math.floor(Date.now() / 1000);
        if (absLeft <= me.session.warn) {
          bumpActivity({ force: true });
          setAbsoluteBound(true);
          setSecondsLeft(Math.max(0, absLeft));
          setBusy(false);
          return;
        }
      }
      bumpActivity({ force: true });
      setOpen(false);
      setActivityPaused(false);
    } catch {
      expiredRef.current = true;
      setOpen(false);
      setActivityPaused(false);
      onLogout();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const title = absoluteBound ? t('session.warn.absoluteTitle') : t('session.warn.title');
  const body = absoluteBound
    ? t('session.warn.absoluteBody', { time: formatCountdown(secondsLeft) })
    : t('session.warn.body', { time: formatCountdown(secondsLeft) });

  return (
    <>
      <div class="session-warn-backdrop" aria-hidden="true"></div>
      <div
        class="session-warn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-warn-title"
        aria-describedby="session-warn-body"
      >
        <div class="session-warn-card border bg-body shadow">
          <h2 class="h5 mb-2" id="session-warn-title">
            <i class="bi bi-hourglass-split me-2 text-warning" aria-hidden="true"></i>
            {title}
          </h2>
          <p class="mb-3 text-body-secondary" id="session-warn-body">
            {body}
          </p>
          <div class="d-flex flex-wrap gap-2 justify-content-end">
            <button type="button" class="btn btn-outline-secondary" disabled={busy} onClick={onLogout}>
              {t('session.warn.logout')}
            </button>
            {!absoluteBound && (
              <button type="button" class="btn btn-primary" disabled={busy} onClick={stay}>
                {busy ? t('common.loading') : t('session.warn.stay')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
