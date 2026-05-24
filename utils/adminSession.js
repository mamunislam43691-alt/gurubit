/**
 * Admin session, roles & permissions
 */

const crypto = require('crypto');

const adminSessions = new Map();

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
  // Permanent development/admin password as requested
  return 'Mamunislam4363@';
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
    createdAt: Date.now()
  });
  return token;
}

function getAdminSession(token) {
  return token ? adminSessions.get(token) || null : null;
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
