/**
 * Admin session, roles & permissions
 * Sessions stored in memory — persists across requests within same process
 * On server restart, admin must re-login (this is expected behavior)
 */

const crypto = require('crypto');

// Persistent session store — survives within process lifetime
const adminSessions = new Map();

// Session TTL: 7 days (long enough to avoid frequent re-logins)
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['dashboard', 'users', 'agents', 'services', 'provider', 'leaderboard', 'withdraw', 'broadcast', 'support', 'costs', 'settings'],
  supporter: ['support']
};

const NAV_PATH_PERMISSION = {
  '/admin': 'dashboard',
  '/admin/users': 'users',
  '/admin/services': 'services',
  '/admin/provider': 'provider',
  '/admin/api-keys': 'provider',
  '/admin/leaderboard': 'leaderboard',
  '/admin/withdrawals': 'withdraw',
  '/admin/broadcast': 'broadcast',
  '/admin/support': 'support',
  '/admin/staff': 'staff',
  '/admin/agents': 'agents',
  '/admin/costs': 'costs',
  '/admin/settings': 'settings'
};

function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production') return null;
  return 'Mamunislam4363';
}

function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

function canAccessPath(role, path) {
  const perm = NAV_PATH_PERMISSION[path];
  if (!perm) return role === 'super_admin' || role === 'admin';
  return hasPermission(role, perm);
}

function getDefaultPathForRole(role) {
  if (role === 'supporter') return '/admin/support';
  return '/admin';
}

function createAdminSession(meta) {
  const token = `admin_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  adminSessions.set(token, {
    role: meta.role || 'admin',
    username: meta.username || 'admin',
    staffId: meta.staffId || null,
    displayName: meta.displayName || meta.username || 'Admin',
    permissions: meta.permissions || ROLE_PERMISSIONS[meta.role || 'admin'] || [],
    defaultPath: meta.defaultPath || getDefaultPathForRole(meta.role || 'admin'),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getAdminSession(token) {
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  // Check expiry
  if (session.expiresAt && Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  return session;
}

function isAdminSessionValid(token) {
  return !!getAdminSession(token);
}

function revokeAdminSession(token) {
  if (token) adminSessions.delete(token);
}

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_session;
  const session = getAdminSession(token);
  if (!session) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }
  req.adminSession = session;
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    const token = req.cookies.admin_session;
    const session = getAdminSession(token);
    if (!session) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }
    if (!hasPermission(session.role, permission)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    req.adminSession = session;
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  const token = req.cookies.admin_session;
  const session = getAdminSession(token);
  if (!session || session.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: { message: 'Super admin only' } });
  }
  req.adminSession = session;
  next();
}

module.exports = {
  adminSessions,
  ROLE_PERMISSIONS,
  NAV_PATH_PERMISSION,
  getAdminPassword,
  hasPermission,
  canAccessPath,
  getDefaultPathForRole,
  createAdminSession,
  getAdminSession,
  isAdminSessionValid,
  revokeAdminSession,
  requireAdmin,
  requirePermission,
  requireSuperAdmin
};
