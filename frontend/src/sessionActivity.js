/**
 * Client-side last-activity clock for the idle-warning modal.
 *
 * The server refreshes last_seen on every request that opens the session
 * (Session::start). Polling /api/auth/me only to “check” remaining time would
 * therefore keep the session alive forever. The UI counts down from this clock
 * instead, and “Stay logged in” calls /api/auth/me once to refresh the server.
 *
 * While the warning modal is open, document input is ignored (paused) so a click
 * on the dialog does not silently reset the timer without touching the server.
 * API success and an explicit Stay still bump with { force: true }.
 *
 * localStorage syncs the timestamp across tabs of the same origin.
 */

const STORAGE_KEY = 'kocoui.sessionActivity';

let lastMs = Date.now();
let paused = false;
const listeners = new Set();

export function lastActivityMs() {
  return lastMs;
}

export function setActivityPaused(value) {
  paused = !!value;
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export function bumpActivity(opts = {}) {
  if (paused && !opts.force) return;
  lastMs = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, String(lastMs));
  } catch {
    /* private mode / quota */
  }
  listeners.forEach((fn) => {
    try {
      fn(lastMs);
    } catch {
      /* listener errors must not break callers */
    }
  });
}

export function onActivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pointer/keyboard listeners + cross-tab storage. Returns a cleanup function. */
export function installActivityListeners() {
  const onInput = () => bumpActivity();
  const opts = { capture: true, passive: true };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(ev, onInput, opts);
  }
  const onStorage = (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    const n = Number(e.newValue);
    if (!Number.isFinite(n) || n <= lastMs) return;
    lastMs = n;
    listeners.forEach((fn) => {
      try {
        fn(lastMs);
      } catch {
        /* ignore */
      }
    });
  };
  window.addEventListener('storage', onStorage);
  return () => {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      document.removeEventListener(ev, onInput, opts);
    }
    window.removeEventListener('storage', onStorage);
  };
}
