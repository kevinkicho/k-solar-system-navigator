/**
 * Browser auth helpers for HELIOS local companion API (T0/T1/T2).
 * Token is never committed; operator may paste into session/local storage.
 */

const STORAGE_KEY = 'HELIOS_API_TOKEN';

export function getStoredHeliosToken() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const s = sessionStorage.getItem(STORAGE_KEY);
      if (s) return s;
    }
    if (typeof localStorage !== 'undefined') {
      const l = localStorage.getItem(STORAGE_KEY);
      if (l) return l;
    }
  } catch {
    /* private mode */
  }
  return '';
}

/**
 * @param {string} token
 * @param {{ persist?: boolean }} [opts]
 */
export function setStoredHeliosToken(token, opts = {}) {
  const t = String(token || '').trim();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (!t) return;
    if (opts.persist) localStorage.setItem(STORAGE_KEY, t);
    else sessionStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

export function clearStoredHeliosToken() {
  setStoredHeliosToken('');
}

export function heliosAuthHeaders() {
  const t = getStoredHeliosToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Same-origin fetch with optional Bearer from storage.
 * Throws Error with code HELIOS_AUTH on 401.
 */
export async function heliosFetch(path, opts = {}) {
  const headers = {
    ...(opts.headers || {}),
    ...heliosAuthHeaders(),
  };
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    const err = new Error(
      'API token required — open AI settings and paste HELIOS_API_TOKEN',
    );
    err.code = 'HELIOS_AUTH';
    err.status = 401;
    throw err;
  }
  return res;
}

export async function heliosJson(path, opts = {}) {
  const res = await heliosFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
