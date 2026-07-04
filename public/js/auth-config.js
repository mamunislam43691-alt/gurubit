/**
 * Custom auth client helpers
 * Talks directly to GURUBIT's /api/auth/* endpoints.
 */

const API = '';

async function postJSON(path, body, fetchOpts = {}) {
  const res = await fetch(API + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    ...fetchOpts
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  }
  return { ok: res.ok, status: res.status, data };
}

async function getJSON(path, fetchOpts = {}) {
  const res = await fetch(API + path, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...fetchOpts
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  }
  return { ok: res.ok, status: res.status, data };
}

export async function loginWithEmail({ email, password }) {
  return postJSON('/api/auth/login', { email, password });
}

export async function signupWithEmail(payload) {
  return postJSON('/api/auth/signup', payload);
}

export async function sendPasswordReset(email) {
  return postJSON('/api/auth/send-password-reset', { email });
}

export async function confirmPasswordReset(token, newPassword) {
  return postJSON('/api/auth/reset-password', { token, password: newPassword });
}

export async function startGuestSession() {
  return postJSON('/api/auth/guest');
}

export async function fetchSession() {
  return getJSON('/api/auth/session');
}

export async function logout() {
  return postJSON('/api/auth/logout');
}

export const createUserWithEmailAndPassword = async ({ email, password }) => {
  return signupWithEmail({ email, password });
};
export const signInWithEmailAndPassword = async ({ email, password }) => {
  const r = await loginWithEmail({ email, password });
  if (!r.ok) {
    const err = new Error(r.data?.error?.message || 'Login failed');
    err.code = `auth/${r.data?.error?.code || 'invalid-credential'}`;
    throw err;
  }
  return { user: { ...r.data?.user, getIdToken: async () => r.data?.token || '' } };
};
export const signOut = async () => {
  await logout();
};
export const onAuthStateChanged = (callback) => {
  fetchSession().then((r) => {
    if (r.ok && r.data?.authenticated) callback(r.data.user);
    else callback(null);
  });
  return () => {};
};
