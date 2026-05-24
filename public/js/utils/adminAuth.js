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
  '/admin/guru': 'users'
};

let cachedAdmin = null;

export async function fetchAdminMe() {
  try {
    const res = await fetch('/api/admin/me');
    if (!res.ok) {
      cachedAdmin = null;
      return null;
    }
    const data = await res.json();
    if (data.success && data.admin) {
      cachedAdmin = data.admin;
      return cachedAdmin;
    }
  } catch {
    cachedAdmin = null;
  }
  return null;
}

export function getCachedAdmin() {
  return cachedAdmin;
}

export function clearAdminCache() {
  cachedAdmin = null;
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
