/**
 * Admin session, roles & permissions
 * Sessions stored in memory AND persisted to MongoDB for cross-restart survival
 */

const crypto = require('crypto');

// In-memory session store (fast lookup)
const adminSessions = new Map();

// Session TTL: 7 days
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

// ── Persist sessions to MongoDB ────────────────────────────────────────────

async function _saveSessionToDB(token, sessionData) {
  try {
    const { collections } = require('../config/db');
    await collections.adminSessions.doc(token).set({
      _id: token,
      id: token,
      token,
      ...sessionData,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    // Non-fatal — in-memory session still works
  }
}

async function _deleteSessionFromDB(token) {
  try {
    const { collections } = require('../config/db');
    await collections.adminSessions.doc(token).delete();
  } catch (e) {}
}

async function _loadSessionsFromDB() {
  try {
    const { collections } = require('../config/db');
    const snap = await collections.adminSessions.get();
    let loaded = 0;
    snap.forEach(doc => {
      const s = doc.data();
      if (!s || !s.token) return;
      // Skip expired
      if (s.expiresAt && Date.now() > new Date(s.expiresAt).getTime()) return;
      adminSessions.set(s.token, {
        role: s.role,
        username: s.username,
        staffId: s.staffId || null,
        displayName: s.displayName,
        permissions: s.permissions || [],
        defaultPath: s.defaultPath || getDefaultPathForRole(s.role),
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : new Date(s.createdAt).getTime(),
        expiresAt: typeof s.expiresAt === 'number' ? s.expiresAt : new Date(s.expiresAt).getTime()
      });
      loaded++;
    });
    if (loaded > 0) console.log(`✅ Restored ${loaded} admin session(s) from DB`);
  } catch (e) {
    // Non-fatal
  }
}

// Sessions load on startup via server.js after MongoDB is confirmed ready

// ───────────────────────────────────────────────────────────────────────────

function createAdminSession(meta) {
  const token = `admin_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const sessionData = {
    role: meta.role || 'admin',
    username: meta.username || 'admin',
    staffId: meta.staffId || null,
    displayName: meta.displayName || meta.username || 'Admin',
    permissions: meta.permissions || ROLE_PERMISSIONS[meta.role || 'admin'] || [],
    defaultPath: meta.defaultPath || getDefaultPathForRole(meta.role || 'admin'),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  adminSessions.set(token, sessionData);
  // Persist to DB (async, non-blocking)
  _saveSessionToDB(token, sessionData);
  return token;
}

function getAdminSession(token) {
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  if (session.expiresAt && Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    _deleteSessionFromDB(token);
    return null;
  }
  return session;
}

function isAdminSessionValid(token) {
  return !!getAdminSession(token);
}

function revokeAdminSession(token) {
  if (token) {
    adminSessions.delete(token);
    _deleteSessionFromDB(token);
  }
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
  requireSuperAdmin,
  _loadSessionsFromDB
};
