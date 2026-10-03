let csrfToken = '';
const unauthorizedListeners = new Set();

export function setCsrf(token) {
  csrfToken = token || '';
}

export function csrf() {
  return csrfToken;
}

/** Called when the server says the session is gone (expired, logged out elsewhere). */
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function api(method, path, body, extraHeaders = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders };
  const init = { method, headers, credentials: 'same-origin', cache: 'no-store' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network_error', 'Network error');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body (e.g. nginx error page) */
  }
  if (!res.ok) {
    const err = data?.error || {};
    if (res.status === 401 && err.code === 'unauthenticated') {
      unauthorizedListeners.forEach((fn) => fn());
    }
    throw new ApiError(res.status, err.code || 'http_' + res.status, err.message || res.statusText, err);
  }
  return data;
}
