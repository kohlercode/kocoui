const PREF_KEY = 'kocoui.push';

export function pushPrefOn() {
  return localStorage.getItem(PREF_KEY) === 'on';
}

export function setPushPref(on) {
  localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Register the thin root SW (installability + push). Safe to call repeatedly. */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/**
 * Enable push: permission + subscribe + POST /api/push/subscribe.
 * @returns {'on'|'denied'|'unsupported'|'disabled'|string} status or error code
 */
export async function enablePush(api) {
  if (!pushSupported()) return 'unsupported';
  const status = await api('GET', '/api/push');
  if (!status.enabled || !status.vapid_public) return 'disabled';

  const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(status.vapid_public),
  });
  const json = sub.toJSON();
  await api('POST', '/api/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  setPushPref(true);
  return 'on';
}

/** Disable push for this browser and forget the server-side subscription. */
export async function disablePush(api) {
  setPushPref(false);
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      try {
        await api('POST', '/api/push/unsubscribe', { endpoint });
      } catch {
        /* still drop the browser subscription */
      }
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
}

/** After login: keep SW registered; re-subscribe if the user previously opted in. */
export async function syncPushAfterLogin(api) {
  await registerServiceWorker();
  if (!pushPrefOn() || !pushSupported()) return;
  try {
    const status = await api('GET', '/api/push');
    if (!status.enabled || !status.vapid_public) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (Notification.permission !== 'granted') return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.vapid_public),
      });
    }
    const json = sub.toJSON();
    await api('POST', '/api/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch {
    /* permission revoked or push service down — leave pref; user can toggle again */
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
