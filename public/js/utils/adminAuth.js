/**
 * Client-side admin auth helpers
 */

const PATH_PERMISSION = {
  '/admin': 'dashboard',
  '/admin/users': 'users',
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

export async function fetchAdminMe() {
  // Return cached admin immediately
  if (cachedAdmin) return cachedAdmin;

  // Deduplicate concurrent calls — with 3s timeout for faster response
  if (!_adminFetchPromise) {
    _adminFetchPromise = Promise.race([
      fetch('/api/admin/me').then(res => {
        if (!res.ok) return null;
        return res.json();
      }).then(data => {
        if (data?.success && data.admin) {
          cachedAdmin = data.admin;
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
  return cachedAdmin;
}

export function clearAdminCache() {
  cachedAdmin = null;
  _adminFetchPromise = null;
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
