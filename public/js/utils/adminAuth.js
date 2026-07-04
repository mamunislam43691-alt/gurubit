/**
 * Client-side admin auth helpers
 */

const PATH_PERMISSION = {
  '/admin': 'dashboard',
  '/admin/users': 'users',
  '/admin/pending-users': 'users',
  '/admin/agents': 'agents',
  '/admin/costs': 'costs',
  '/admin/services': 'services',
  '/admin/provider': 'provider',
  '/admin/api-keys': 'provider',
  '/admin/leaderboard': 'leaderboard',
  '/admin/withdrawals': 'withdraw',
  '/admin/broadcast': 'broadcast',
  '/admin/support': 'support',
  '/admin/staff': 'staff',
  '/admin/settings': 'settings',
  '/admin/guru': 'users',
  '/admin/sms-feed': 'provider',
  '/admin/database': 'settings'
};

let cachedAdmin = null;
let _adminFetchPromise = null;

// Persist admin session in sessionStorage for instant navigation
function _saveToSession(admin) {
  try { sessionStorage.setItem('_gadmin', JSON.stringify(admin)); } catch (_) {}
}
function _loadFromSession() {
  try {
    const raw = sessionStorage.getItem('_gadmin');
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// Pre-load from sessionStorage on module init — instant
cachedAdmin = _loadFromSession();

export async function fetchAdminMe() {
  // Return cached admin immediately — no network call
  if (cachedAdmin) return cachedAdmin;

  // Deduplicate concurrent calls — with 3s timeout
  if (!_adminFetchPromise) {
    _adminFetchPromise = Promise.race([
      fetch('/api/admin/me', { credentials: 'include' }).then(res => {
        if (!res.ok) return null;
        return res.json();
      }).then(data => {
        if (data?.success && data.admin) {
          cachedAdmin = data.admin;
          _saveToSession(cachedAdmin);
          return cachedAdmin;
        }
        return null;
      }).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), 3000))
    ]).finally(() => { _adminFetchPromise = null; });
  }

  return _adminFetchPromise;
}

export function getCachedAdmin() {
  if (!cachedAdmin) cachedAdmin = _loadFromSession();
  return cachedAdmin;
}

export function clearAdminCache() {
  cachedAdmin = null;
  _adminFetchPromise = null;
  try { sessionStorage.removeItem('_gadmin'); } catch (_) {}
}

export function adminCanAccess(path, admin = cachedAdmin) {
  if (!admin) return false;
  if (admin.permissions?.includes('*')) return true;
  const perm = PATH_PERMISSION[path];
  if (!perm) return admin.role === 'super_admin' || admin.role === 'admin';
  return admin.permissions?.includes(perm);
}

export function getAdminHomePath(admin = cachedAdmin) {
  if (!admin) return '/admin';
  return admin.defaultPath || '/admin';
}

/**
 * Authenticated fetch — always includes cookies, auto-redirects on 401
 */
export async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  // If 401, session expired — clear cache and redirect to login
  if (res.status === 401) {
    clearAdminCache();
    window.location.href = '/admin';
    throw new Error('Session expired. Please log in again.');
  }

  return res;
}
