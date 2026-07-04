/**
 * Admin Routes
 * Handles admin authentication and dashboard operations
 */

const express = require('express');
const router = express.Router();
const { db, collections } = require('../config/db');
const { hashPassword, genId } = require('../services/authService');

async function createAppUser({ email, password, displayName }) {
  const cleanEmail = String(email).toLowerCase().trim();
  const dup = await collections.users.where('email', '==', cleanEmail).limit(1).get();
  if (dup.size > 0) {
    const err = new Error('This email is already registered.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }
  const uid = genId('user');
  const passwordHash = await hashPassword(password);
  await collections.users.doc(uid).set({
    _id: uid,
    id: uid,
    name: displayName || cleanEmail.split('@')[0],
    email: cleanEmail,
    phone: '',
    telegram: '',
    cryptoAddress: '',
    referralEmail: '',
    earningsBalance: 0,
    totalOtps: 0,
    successfulOtps: 0,
    failedOtps: 0,
    isBanned: false,
    isAdmin: false,
    isAgent: false,
    profileComplete: true,
    emailVerified: true,
    passwordHash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return uid;
}
const {
  getAdminPassword,
  createAdminSession,
  getAdminSession,
  isAdminSessionValid,
  revokeAdminSession,
  hasPermission,
  ROLE_PERMISSIONS,
  getDefaultPathForRole,
  requirePermission,
  requireSuperAdmin
} = require('../utils/adminSession');
const { verifyStaff, createStaff, listStaff, deleteStaff, updateStaff } = require('../services/adminStaffStore');
const { createBroadcast, listBroadcasts } = require('../services/broadcastStore');
const catalogStore = require('../services/catalogStore');
const costStore = require('../services/costStore');
const supportStore = require('../services/supportStore');
const os = require('os');

/**
 * POST /api/admin/login
 * Admin login endpoint
 */
router.post('/login', async (req, res) => {
  try {
    const { password, username } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password is required' }
      });
    }

    let sessionMeta = null;

    if (username && String(username).trim()) {
      const staff = await verifyStaff(username, password);
      if (!staff) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid username or password' }
        });
      }
      sessionMeta = {
        role: staff.role,
        username: staff.username,
        staffId: staff.id,
        displayName: staff.displayName
      };
    } else {
      const adminPassword = getAdminPassword();
      if (!adminPassword) {
        return res.status(500).json({
          success: false,
          error: { message: 'Admin password not configured. Set ADMIN_PASSWORD in .env' }
        });
      }
      if (password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid password' }
        });
      }
      sessionMeta = {
        role: 'super_admin',
        username: 'super',
        displayName: 'Super Admin'
      };
    }

    const sessionToken = createAdminSession(sessionMeta);

    res.cookie('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      message: 'Admin login successful',
      redirect: getDefaultPathForRole(sessionMeta.role),
      admin: formatAdminPayload(sessionMeta)
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
});

function formatAdminPayload(meta) {
  const permissions = ROLE_PERMISSIONS[meta.role] || [];
  return {
    role: meta.role,
    username: meta.username,
    displayName: meta.displayName,
    permissions,
    defaultPath: getDefaultPathForRole(meta.role)
  };
}

/**
 * GET /api/admin/check-auth
 * Check if admin is authenticated
 */
router.get('/check-auth', (req, res) => {
  const session = getAdminSession(req.cookies.admin_session);

  if (session) {
    return res.status(200).json({
      success: true,
      authenticated: true,
      admin: formatAdminPayload(session)
    });
  }
  return res.status(401).json({
    success: false,
    authenticated: false
  });
});

router.get('/me', (req, res) => {
  const session = getAdminSession(req.cookies.admin_session);
  if (!session) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }
  res.json({ success: true, admin: formatAdminPayload(session) });
});

/**
 * POST /api/admin/logout
 * Admin logout endpoint
 */
router.post('/logout', (req, res) => {
  const sessionToken = req.cookies.admin_session;

  if (sessionToken) {
    revokeAdminSession(sessionToken);
  }

  res.clearCookie('admin_session');

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/admin/dashboard
 * Get admin dashboard statistics
 */
// In-memory cache for dashboard stats (survives quota errors)
let _dashboardCache = null;
let _dashboardCacheTime = 0;
const DASHBOARD_CACHE_TTL = 30 * 1000; // 30 seconds — fast refresh

router.get('/dashboard', async (req, res) => {
  try {
    const sessionToken = req.cookies.admin_session;

    if (!isAdminSessionValid(sessionToken)) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' }
      });
    }

    // Return cached data immediately if fresh enough
    if (_dashboardCache && (Date.now() - _dashboardCacheTime) < DASHBOARD_CACHE_TTL) {
      return res.json({ success: true, ..._dashboardCache });
    }

    // Get real counts from Firestore collections — with quota error handling
    let usersSnapshot, numbersSnapshot, messagesSnapshot;
    try {
      [usersSnapshot, numbersSnapshot, messagesSnapshot] = await Promise.all([
        collections.users.get(),
        collections.phoneNumbers.get(),
        collections.smsMessages.get()
      ]);
    } catch (quotaErr) {
      // On quota error, return cached data or empty stats
      if (_dashboardCache) {
        return res.json({ success: true, ..._dashboardCache, _cached: true });
      }
      return res.json({
        success: true,
        stats: { totalUsers:0, activeUsers:0, bannedUsers:0, totalServices:0, totalNumbers:0, totalSms:0, totalOtps:0, failedNumbers:0, providers:0, agents:0, activeAgents:0, withdrawalsSuccess:0, withdrawalsPending:0, supportChats:0, broadcasts:0 },
        topApplications: [], topRanges: [], chart: [], topServices: []
      });
    }

    const users = [];
    usersSnapshot.forEach((doc) => users.push(doc.data()));

    const agents = users.filter((u) => u.isAgent);
    const activeAgents = agents.filter((u) => {
      const t = u.updatedAt || u.createdAt;
      if (!t) return false;
      return Date.now() - new Date(t).getTime() < 15 * 60 * 1000;
    });

    let withdrawalsPending = 0;
    let withdrawalsSuccess = 0;
    try {
      const wSnap = await collections.withdrawalRequests.get();
      wSnap.forEach((doc) => {
        const w = doc.data();
        if (w.status === 'pending') withdrawalsPending += 1;
        if (w.status === 'approved') withdrawalsSuccess += 1;
      });
    } catch {}

    let providersCount = 0;
    try {
      const kSnap = await collections.apiKeys.get();
      providersCount = kSnap.size;
    } catch {}

    const supportSessionsRaw = await supportStore.listSessions().catch(() => []);
    const supportSessions = Array.isArray(supportSessionsRaw) ? supportSessionsRaw : [];
    const supportOpen = supportSessions.filter((s) => s.status === 'open').length;

    // Count failed numbers
    let failedNumbers = 0;
    try {
      const failedSnap = await collections.phoneNumbers.where('status', '==', 'failed').get();
      failedNumbers = failedSnap.size || 0;
    } catch {}

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => !u.isBanned).length,
      bannedUsers: users.filter((u) => !!u.isBanned).length,
      totalServices: await catalogStore.countServices(),
      totalNumbers: numbersSnapshot.size || 0,
      totalSms: messagesSnapshot.size || 0,
      totalOtps: messagesSnapshot.size || 0,
      failedNumbers,
      providers: providersCount,
      agents: agents.length,
      activeAgents: activeAgents.length,
      withdrawalsSuccess,
      withdrawalsPending,
      supportChats: supportOpen,
      broadcasts: (await listBroadcasts()).length
    };

    const { buildDashboardAnalytics } = require('../services/statsHelper');
    const analytics = await buildDashboardAnalytics(collections, stats, users);

    const responseData = {
      stats,
      topApplications: analytics.topApplications,
      topRanges: analytics.topRanges,
      chart: analytics.chart,
      topServices: analytics.topServices
    };

    // Cache for next request
    _dashboardCache = responseData;
    _dashboardCacheTime = Date.now();

    return res.status(200).json({ success: true, ...responseData });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /api/admin/number-requests
 * Return recent number allocations/requests for admin review
 */
router.get('/number-requests', async (req, res) => {
  try {
    const sessionToken = req.cookies.admin_session;
    if (!isAdminSessionValid(sessionToken)) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    // Fetch recent numbers (limit 50)
    const snap = await collections.phoneNumbers
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const items = [];
    snap.forEach(doc => {
      const d = doc.data();
      items.push({
        id: d.id || doc.id,
        phoneNumber: d.phoneNumber,
        userId: d.userId || null,
        providerId: d.providerId || null,
        providerSessionId: d.providerSessionId || null,
        platformId: d.platformId || null,
        serverId: d.serverId || null,
        countryName: d.countryName || null,
        status: d.status || null,
        createdAt: d.createdAt || null
      });
    });

    res.json({ success: true, requests: items });
  } catch (err) {
    console.error('Admin number-requests error:', err.message);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch number requests' } });
  }
});

/**
 * POST /api/admin/test-number-request
 * Dev-only: broadcast a fake number_request event for testing admin UI
 */
router.post('/test-number-request', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, error: { message: 'Not allowed in production' } });
    }

    const { phoneNumber } = req.body || {};
    const numberId = `test_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const payload = {
      type: 'number_request',
      numberId,
      phoneNumber: phoneNumber || `+1000000${Math.floor(Math.random()*9000)+1000}`,
      userId: 'test_user',
      providerId: null,
      providerSessionId: null,
      platformId: 'test',
      serverId: 'test',
      countryName: 'Testland',
      createdAt: new Date().toISOString()
    };

    try {
      const wss = req.app && req.app.get && req.app.get('wss');
      if (wss) {
        wss.broadcast(payload);
      }
    } catch (e) {
      // ignore
    }

    console.log(`[TEST] number_request broadcast: ${payload.phoneNumber} id=${numberId}`);
    return res.json({ success: true, payload });
  } catch (err) {
    console.error('Test number-request error:', err.message);
    res.status(500).json({ success: false, error: { message: 'Failed to broadcast test request' } });
  }
});

/**
 * POST /api/admin/trigger-provider-send
 * Dev-only: trigger provider send/notify for a given phone number (for testing)
 */
router.post('/trigger-provider-send', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ success: false, error: { message: 'Not allowed in production' } });

    const { phoneNumber, providerId, providerSessionId, fbId, clientId, email } = req.body || {};
    if (!phoneNumber || !providerId) return res.status(400).json({ success: false, error: { message: 'phoneNumber and providerId are required' } });

    const providerStore = require('../services/providerStore');
    const prov = providerStore.list().find(p => p.id === providerId);
    if (!prov) return res.status(404).json({ success: false, error: { message: 'Provider not found' } });

    const sendUrlBase = prov.getSmsUrl || prov.baseUrl;
    const sep = sendUrlBase.includes('?') ? '&' : '?';
    const keyPart = prov.apiKey ? `${sep}api_key=${encodeURIComponent(prov.apiKey)}` : '';
    const sessionPart = providerSessionId ? `&session=${encodeURIComponent(providerSessionId)}` : '';
    const numPart = `&number=${encodeURIComponent(phoneNumber)}`;
    const fbPart = fbId ? `&fb_id=${encodeURIComponent(fbId)}` : '';
    const clientPart = clientId ? `&client_id=${encodeURIComponent(clientId)}` : '';
    const emailPart = email ? `&client_email=${encodeURIComponent(email)}` : '';

    const params = [];
    if (providerSessionId) params.push(`session=${encodeURIComponent(providerSessionId)}`);
    params.push(`number=${encodeURIComponent(phoneNumber)}`);
    if (fbId) params.push(`fb_id=${encodeURIComponent(fbId)}`);
    if (clientId) params.push(`client_id=${encodeURIComponent(clientId)}`);
    if (email) params.push(`client_email=${encodeURIComponent(email)}`);
    const triggerUrl = params.length ? `${sendUrlBase}?${params.join('&')}` : sendUrlBase;
    const headers = {};
    headers['Authorization'] = `Bearer ${prov.apiKey}`;
    headers['x-api-key'] = prov.apiKey;
    headers['X-API-Key'] = prov.apiKey;

    console.log(`[DEV] Triggering provider send: ${triggerUrl} (headers: ${Object.keys(headers).join(',')})`);

    try {
      const { triggerProviderSend } = require('../services/providerSender');
      const params = {
        session: providerSessionId,
        fb_id: fbId,
        client_id: clientId,
        client_email: email
      };
      const wss = req.app && req.app.get && req.app.get('wss');
      const result = await triggerProviderSend({ prov, params, phoneNumber, wss });
      if (!result.ok) return res.status(500).json({ success: false, error: { message: 'Provider send failed', detail: result.error } });
      return res.json({ success: true, status: result.status, body: result.body });
    } catch (err) {
      console.warn('[DEV] Provider send failed:', err.message);
      return res.status(500).json({ success: false, error: { message: 'Provider send failed', detail: err.message } });
    }

  } catch (err) {
    console.error('Dev trigger-provider-send error:', err.message);
    res.status(500).json({ success: false, error: { message: 'Failed to trigger provider send' } });
  }
});

/**
 * Middleware to verify admin authentication
 */
function verifyAdmin(req, res, next) {
  const session = getAdminSession(req.cookies.admin_session);
  if (session) {
    req.adminSession = session;
    next();
  } else {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
  }
}

function verifyAdminPerm(permission) {
  return (req, res, next) => {
    const session = getAdminSession(req.cookies.admin_session);
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

/** Staff management (super admin only) */
router.get('/staff', requireSuperAdmin, async (req, res) => {
  res.json({ success: true, staff: await listStaff() });
});

router.post('/staff', requireSuperAdmin, async (req, res) => {
  const { username, password, role, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: { message: 'Username and password required' } });
  }
  const allowed = ['admin', 'supporter'];
  const staffRole = allowed.includes(role) ? role : 'supporter';
  const created = await createStaff({ username, password, role: staffRole, displayName });
  res.json({ success: true, staff: created });
});

router.delete('/staff/:id', requireSuperAdmin, async (req, res) => {
  await deleteStaff(req.params.id);
  res.json({ success: true });
});

router.put('/staff/:id', requireSuperAdmin, async (req, res) => {
  const updated = await updateStaff(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }
  res.json({ success: true, staff: updated });
});

/** Broadcast */
router.get('/broadcasts', verifyAdminPerm('broadcast'), async (req, res) => {
  res.json({ success: true, broadcasts: await listBroadcasts() });
});

router.post('/broadcasts', verifyAdminPerm('broadcast'), async (req, res) => {
  const { title, message } = req.body || {};
  if (!title?.trim() || !message?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Title and message required' } });
  }
  const item = await createBroadcast({
    title,
    message,
    createdBy: req.adminSession?.username || 'admin'
  });
  const wss = req.app.get('wss');
  if (wss?.broadcast) {
    wss.broadcast({ type: 'admin_broadcast', broadcast: item });
  }
  res.json({ success: true, broadcast: item });
});

/** System settings / monitoring */
router.get('/settings/system', verifyAdminPerm('settings'), async (req, res) => {
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  let dbStats = { users: 0, messages: 0, numbers: 0 };
  try {
    const [users, messages, numbers] = await Promise.all([
      collections.users.get(),
      collections.smsMessages.get(),
      collections.phoneNumbers.get()
    ]);
    dbStats = { users: users.size, messages: messages.size, numbers: numbers.size };
  } catch {}

  res.json({
    success: true,
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      cpuCores: os.cpus().length,
      loadAvg: os.loadavg(),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        systemUsedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100)
      },
      database: dbStats,
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

/** Cache sync stats */
router.get('/settings/cache', verifyAdminPerm('settings'), async (req, res) => {
  try {
    const cacheSync = require('../services/cacheSync');
    res.json({ success: true, cache: cacheSync.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/** Force cache sync */
router.post('/settings/cache/sync', verifyAdminPerm('settings'), async (req, res) => {
  try {
    const cacheSync = require('../services/cacheSync');
    const result = await cacheSync.forceSyncAll();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.get('/settings/config', verifyAdminPerm('settings'), async (req, res) => {
  try {
    const doc = await collections.guruSettings.doc('system').get();
    const data = doc.exists ? doc.data() : { allowGuestLogin: true };
    res.json({ success: true, config: data });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.put('/settings/config', verifyAdminPerm('settings'), async (req, res) => {
  try {
    const { allowGuestLogin } = req.body;
    await collections.guruSettings.doc('system').set({
      allowGuestLogin: allowGuestLogin === true
    }, { merge: true });
    res.json({ success: true, message: 'System configuration updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ── Ads settings ──────────────────────────────────────────────────────────────

router.get('/settings/ads', verifyAdminPerm('settings'), async (req, res) => {
  try {
    const doc = await collections.guruSettings.doc('ads').get();
    const ads = doc.exists ? doc.data() : { enabled: false, frequency: 5, label: 'Sponsored', items: [] };
    // Sanitize items — remove undefined fields
    if (Array.isArray(ads.items)) {
      ads.items = ads.items.map(item => ({
        title: item.title || '',
        description: item.description || '',
        linkUrl: item.linkUrl || '',
        imageUrl: item.imageUrl || null,
        createdAt: item.createdAt || new Date().toISOString()
      }));
    } else {
      ads.items = [];
    }
    res.json({ success: true, ads });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.put('/settings/ads', verifyAdminPerm('settings'), async (req, res) => {
  try {
    const { enabled, frequency, label, items } = req.body || {};
    // Sanitize — no undefined values for Firestore
    const sanitizedItems = Array.isArray(items) ? items.map(item => ({
      title: String(item.title || ''),
      description: String(item.description || ''),
      linkUrl: String(item.linkUrl || ''),
      imageUrl: item.imageUrl || null,
      createdAt: item.createdAt || new Date().toISOString()
    })) : [];

    const ads = {
      enabled: enabled === true,
      frequency: Math.max(1, parseInt(frequency) || 5),
      label: String(label || 'Sponsored'),
      items: sanitizedItems,
      updatedAt: new Date().toISOString()
    };
    await collections.guruSettings.doc('ads').set(ads);
    res.json({ success: true, ads });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /api/admin/users
 * Get all users
 */
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await collections.users.get();
    const users = [];
    snapshot.forEach(doc => {
      users.push(doc.data());
    });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * PUT /api/admin/users/:id/ban
 */
router.put('/users/:id/ban', verifyAdmin, async (req, res) => {
  try {
    await collections.users.doc(req.params.id).update({ isBanned: true });
    res.json({ success: true, message: 'User banned' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * PUT /api/admin/users/:id/unban
 */
router.put('/users/:id/unban', verifyAdmin, async (req, res) => {
  try {
    await collections.users.doc(req.params.id).update({ isBanned: false });
    res.json({ success: true, message: 'User unbanned' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /api/admin/withdrawals
 */
router.get('/withdrawals', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await collections.withdrawalRequests.orderBy('createdAt', 'desc').get();
    const withdrawals = [];
    snapshot.forEach(doc => {
      withdrawals.push(doc.data());
    });
    res.json({ success: true, withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * PUT /api/admin/withdrawals/:id/approve
 */
router.put('/withdrawals/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const withdrawalRef = collections.withdrawalRequests.doc(req.params.id);
    const withdrawalDoc = await withdrawalRef.get();
    
    if (!withdrawalDoc.exists) {
      return res.status(404).json({ success: false, error: { message: 'Withdrawal not found' } });
    }

    const withdrawal = withdrawalDoc.data();
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, error: { message: 'Withdrawal already processed' } });
    }

    const userRef = collections.users.doc(withdrawal.userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    if (!userDoc.exists || !userData) {
      return res.status(404).json({ success: false, error: { message: 'User not found or data missing' } });
    }

    if ((userData.earningsBalance || 0) < withdrawal.amount) {
      return res.status(400).json({ success: false, error: { message: 'Insufficient user balance' } });
    }

    // Atomic transaction
    await db.runTransaction(async (t) => {
      t.update(withdrawalRef, { status: 'approved', updatedAt: new Date().toISOString() });
      t.update(userRef, { 
        earningsBalance: userData.earningsBalance - withdrawal.amount,
        updatedAt: new Date().toISOString()
      });
    });

    res.json({ success: true, message: 'Withdrawal approved and balance deducted' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * POST /api/admin/countries
 */
router.get('/catalog/countries', verifyAdmin, async (req, res) => {
  res.json({ success: true, countries: await catalogStore.listCountries() });
});

// Pool status — shows exactly how many numbers remain in each server
router.get('/catalog/pool-status', verifyAdmin, async (req, res) => {
  try {
    const countries = catalogStore.listCountries();
    const result = [];
    for (const c of countries) {
      const servers = catalogStore.listServers(c.id);
      for (const s of servers) {
        const nums = Array.isArray(s.numbers) ? s.numbers.filter(n => n && typeof n === 'string') : [];
        result.push({
          countryId: c.id,
          countryName: c.name,
          serverId: s.id,
          serverName: s.name,
          available: nums.length,
          sample: nums.slice(0, 3)
        });
      }
    }
    res.json({ success: true, pool: result, total: result.reduce((a, r) => a + r.available, 0) });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/countries', verifyAdmin, async (req, res) => {
  try {
    const c = await catalogStore.addCountry(req.body);
    res.json({ success: true, country: c });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.delete('/countries/:id', verifyAdmin, async (req, res) => {
  await catalogStore.deleteCountry(req.params.id);
  res.json({ success: true });
});

router.put('/countries/:id', verifyAdmin, async (req, res) => {
  const c = await catalogStore.updateCountry(req.params.id, req.body);
  if (!c) return res.status(404).json({ success: false, error: { message: 'Not found' } });
  res.json({ success: true, country: c });
});

router.post('/countries/:id/clear', verifyAdmin, async (req, res) => {
  await catalogStore.clearCountryData(req.params.id);
  res.json({ success: true });
});

router.post('/catalog/servers', verifyAdmin, async (req, res) => {
  const { countryId, name } = req.body || {};
  if (!countryId || !name) {
    return res.status(400).json({ success: false, error: { message: 'countryId and name required' } });
  }
  const s = await catalogStore.addServer(countryId, { name });
  res.json({ success: true, server: s });
});

router.put('/catalog/servers/:id', verifyAdmin, async (req, res) => {
  const s = await catalogStore.updateServer(req.params.id, req.body);
  if (!s) return res.status(404).json({ success: false, error: { message: 'Not found' } });
  res.json({ success: true, server: s });
});

router.delete('/catalog/servers/:id', verifyAdmin, async (req, res) => {
  await catalogStore.deleteServer(req.params.id);
  res.json({ success: true });
});

router.post('/catalog/servers/:id/clear', verifyAdmin, async (req, res) => {
  await catalogStore.clearServerData(req.params.id);
  res.json({ success: true, server: await catalogStore.getServer(req.params.id) });
});

router.post('/catalog/servers/:id/numbers', verifyAdmin, async (req, res) => {
  const { phoneNumbers, phoneNumber } = req.body || {};
  const raw = phoneNumbers || phoneNumber;
  const result = await catalogStore.addServerNumbers(req.params.id, raw);
  if (!result) return res.status(404).json({ success: false, error: { message: 'Server not found' } });
  res.json({ success: true, ...result });
});

router.get('/catalog/countries/:id/platforms', verifyAdmin, async (req, res) => {
  res.json({
    success: true,
    platforms: await catalogStore.listPlatforms(req.params.id),
    servers: await catalogStore.listServers(req.params.id)
  });
});

router.post('/catalog/countries/:id/platforms', verifyAdmin, async (req, res) => {
  const p = await catalogStore.addPlatform(req.params.id, req.body);
  if (!p) return res.status(400).json({ success: false, error: { message: 'Could not add service' } });
  res.json({ success: true, platform: p });
});

router.delete('/catalog/platforms/:id', verifyAdmin, async (req, res) => {
  await catalogStore.deletePlatform(req.params.id);
  res.json({ success: true });
});

router.post('/catalog/platforms/:id/numbers', verifyAdmin, async (req, res) => {
  const { phoneNumber } = req.body || {};
  const n = await catalogStore.addNumber(req.params.id, phoneNumber);
  if (!n) return res.status(400).json({ success: false, error: { message: 'Invalid' } });
  res.json({ success: true, number: n });
});

const providerStore = require('../services/providerStore');

router.get('/api-keys', verifyAdmin, async (req, res) => {
  try {
    const providerPoll = require('../services/providerPoll');
    const statuses = providerPoll.getProviderStatuses ? providerPoll.getProviderStatuses() : {};
    const allKeys = await providerStore.list();
    const keys = allKeys.map(k => {
      const urls = [];
      if (k.baseUrl) urls.push(k.baseUrl.trim());
      if (Array.isArray(k.additionalUrls)) {
        k.additionalUrls.forEach(u => { if (u && u.trim()) urls.push(u.trim()); });
      }
      const urlStatuses = {};
      urls.forEach(u => {
        const statusData = statuses[`${k.id}:${u}`] || { status: 'unknown', lastPollTime: null, lastError: null };
        urlStatuses[u] = { status: statusData.status, lastPollTime: statusData.lastPollTime, lastError: statusData.lastError };
      });
      return { ...k, urlStatuses };
    });
    res.json({ success: true, keys });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.post('/api-keys', verifyAdmin, async (req, res) => {
  try {
    const { serviceName, apiKey, baseUrl, getNumberUrl, getSmsUrl, controlUrl, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange } = req.body;
    
    // For integrated providers, at least getNumberUrl or baseUrl is required
    const effectiveUrl = (getNumberUrl || baseUrl || '').trim();
    if (!effectiveUrl || !apiKey?.trim()) {
      const urlLabel = (providerType === 'integrated') ? 'Number URL' : 'Base URL';
      return res.status(400).json({ success: false, error: { message: `${urlLabel} and API key are required` } });
    }
    const key = await providerStore.add({
      serviceName: serviceName || 'SMS Provider',
      baseUrl: effectiveUrl,
      getNumberUrl: (getNumberUrl || baseUrl || '').trim(),
      getSmsUrl: (getSmsUrl || '').trim(),
      controlUrl: (controlUrl || '').trim(),
      apiKey: apiKey.trim(),
      providerType: providerType || 'sms_only',
      additionalUrls,
      countryId: countryId || null,
      serverId: serverId || null,
      apiCountryCode: (apiCountryCode || '').trim(),
      cliRange: cliRange ? String(cliRange).trim() : null
    });
    res.json({ success: true, message: 'Provider saved', key, webhookUrl: `${req.protocol}://${req.get('host')}/api/provider/incoming-sms` });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.put('/api-keys/:id', verifyAdmin, async (req, res) => {
  try {
    const { serviceName, apiKey, baseUrl, getNumberUrl, getSmsUrl, controlUrl, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange } = req.body;
    
    const effectiveUrl = (getNumberUrl || baseUrl || '').trim();
    if (!effectiveUrl || !apiKey?.trim()) {
      const urlLabel = (providerType === 'integrated') ? 'Number URL' : 'Base URL';
      return res.status(400).json({ success: false, error: { message: `${urlLabel} and API key are required` } });
    }
    const key = await providerStore.update(req.params.id, {
      serviceName: serviceName || 'SMS Provider',
      baseUrl: effectiveUrl,
      getNumberUrl: (getNumberUrl || baseUrl || '').trim(),
      getSmsUrl: (getSmsUrl || '').trim(),
      controlUrl: (controlUrl || '').trim(),
      apiKey: apiKey.trim(),
      providerType: providerType || 'sms_only',
      additionalUrls,
      countryId: countryId || null,
      serverId: serverId || null,
      apiCountryCode: (apiCountryCode || '').trim(),
      cliRange: cliRange ? String(cliRange).trim() : null
    });
    if (!key) return res.status(404).json({ success: false, error: { message: 'Provider not found' } });
    res.json({ success: true, message: 'Provider updated', key });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.delete('/api-keys/:id', verifyAdmin, async (req, res) => {
  await providerStore.remove(req.params.id);
  res.json({ success: true });
});

/**
 * POST /api/admin/api-keys/:id/test
 * Test a provider's number fetch URL and OTP URL
 */
router.post('/api-keys/:id/test', verifyAdmin, async (req, res) => {
  try {
    const provider = providerStore.list().find(p => p.id === req.params.id);
    if (!provider) return res.status(404).json({ success: false, error: { message: 'Provider not found' } });

    const results = {};

    if (provider.providerType === 'integrated') {
      const rawBase = (provider.getNumberUrl || provider.baseUrl || '').replace(/\/$/, '')
        .replace(/\/numbers\/numbers$/, '').replace(/\/numbers$/, '').replace(/\/otp$/, '').replace(/\/$/, '');
      const manualRange = provider.cliRange ? String(provider.cliRange).trim() : null;
      const cliFilter = manualRange ? `&cli=${encodeURIComponent(manualRange)}` : '';
      const numbersUrl = `${rawBase}/numbers?status=assigned&limit=5${cliFilter}`;

      const headers = {
        'x-api-key': provider.apiKey,
        'Authorization': `Bearer ${provider.apiKey}`,
        'Accept': 'application/json'
      };

      // Test numbers endpoint
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(numbersUrl, { headers, signal: ctrl.signal });
        clearTimeout(tid);
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        const numbers = parsed ? (parsed.data || parsed.numbers || parsed.list || []) : [];
        results.numbers = {
          url: numbersUrl,
          status: r.status,
          ok: r.ok,
          count: numbers.length,
          sample: numbers.slice(0, 3),
          raw: text.slice(0, 500)
        };
      } catch (e) {
        results.numbers = { url: numbersUrl, ok: false, error: e.message };
      }

      // Test OTP endpoint (with a dummy number)
      const smsRaw = (provider.getSmsUrl || provider.baseUrl || '').replace(/\/$/, '')
        .replace(/\/numbers\/numbers$/, '').replace(/\/numbers$/, '').replace(/\/otp$/, '').replace(/\/$/, '');
      const otpBase = /\/otp$/i.test(smsRaw) ? smsRaw : `${smsRaw}/otp`;
      const otpUrl = `${otpBase}?number=0000000000&since=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}&limit=1`;
      try {
        const ctrl2 = new AbortController();
        const tid2 = setTimeout(() => ctrl2.abort(), 15000);
        const r2 = await fetch(otpUrl, { headers, signal: ctrl2.signal });
        clearTimeout(tid2);
        const text2 = await r2.text();
        results.otp = { url: otpUrl, status: r2.status, ok: r2.ok, raw: text2.slice(0, 300) };
      } catch (e) {
        results.otp = { url: otpUrl, ok: false, error: e.message };
      }

    } else {
      // SMS-only: test the base URL
      const urls = [provider.baseUrl, ...(provider.additionalUrls || [])].filter(Boolean);
      results.urls = [];
      for (const u of urls) {
        const testUrl = `${u.replace(/\/$/, '')}?limit=1`;
        const headers = { 'x-api-key': provider.apiKey, 'Authorization': `Bearer ${provider.apiKey}`, 'Accept': 'application/json' };
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 15000);
          const r = await fetch(testUrl, { headers, signal: ctrl.signal });
          clearTimeout(tid);
          const text = await r.text();
          results.urls.push({ url: testUrl, status: r.status, ok: r.ok, raw: text.slice(0, 300) });
        } catch (e) {
          results.urls.push({ url: testUrl, ok: false, error: e.message });
        }
      }
    }

    const allOk = provider.providerType === 'integrated'
      ? (results.numbers?.ok || results.otp?.ok)
      : results.urls?.some(u => u.ok);

    res.json({ success: true, connected: !!allOk, provider: provider.serviceName, results });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

router.post('/catalog/reset-demo', verifyAdmin, async (req, res) => {
  await catalogStore.clearAllCatalog();
  res.json({ success: true, message: 'All countries/servers/numbers cleared' });
});

router.get('/agents', verifyAdmin, async (req, res) => {
  const snapshot = await collections.users.get();
  const agents = [];
  snapshot.forEach((doc) => {
    const u = doc.data();
    if (u.isAgent) agents.push(u);
  });
  res.json({ success: true, agents });
});

router.post('/agents', verifyAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, telegram, cryptoAddress } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: { message: 'Name, email and password are required' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: { message: 'Password must be at least 8 characters.' } });
    }

    const uid = await createAppUser({ email, password, displayName: name });

    await collections.users.doc(uid).update({
      name,
      phone: phone || '',
      telegram: telegram || '',
      cryptoAddress: cryptoAddress || '',
      agentApproved: true,
      isAgent: true,
      isAdmin: false,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Agent account created successfully!' });
  } catch (error) {
    console.error('Create agent error:', error);
    let errMsg = error.message;
    if (errMsg.includes('EMAIL_EXISTS') || error.code === 'EMAIL_EXISTS') errMsg = 'This email address is already registered.';
    res.status(400).json({ success: false, error: { message: errMsg } });
  }
});

router.put('/users/:id/agent', verifyAdmin, async (req, res) => {
  return res.status(403).json({
    success: false,
    error: { message: 'Promoting users to agents has been disabled. Please create new agents directly using the Add Agent button.' }
  });
});

router.get('/users/search', verifyAdmin, async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const numberCounts = await buildNumberCountsByUser();
  const snapshot = await collections.users.get();
  const users = [];
  snapshot.forEach((doc) => {
    const u = { id: doc.id, ...doc.data(), totalNumbers: numberCounts.get(doc.id) || 0 };
    if (u.isAgent) return;
    if (!q) { users.push(u); return; }
    if (u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q)) users.push(u);
    else if (u.agentEmail?.toLowerCase() === q || u.referralEmail?.toLowerCase() === q) users.push(u);
  });
  res.json({ success: true, users });
});

/**
 * GET /api/admin/users/pending
 * Get users with pending email verification or pending agent approval
 */
router.get('/users/pending', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await collections.users.get();
    const users = [];
    snapshot.forEach((doc) => {
      const u = doc.data();
      if (u.isAgent || u.isAdmin) return;
      if (!u.emailVerified) users.push(u);
    });
    users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.get('/costs', verifyAdminPerm('costs'), async (req, res) => {
  res.json({ success: true, costs: await costStore.listCostsGrouped(catalogStore) });
});

router.put('/costs/:countryId', verifyAdminPerm('costs'), async (req, res) => {
  const { serverId, userReward, agentReward } = req.body || {};
  const c = await costStore.setCost(req.params.countryId, serverId || '', { userReward, agentReward });
  res.json({ success: true, cost: c });
});

/**
 * GET /api/admin/range-analytics
 * Range performance: OTP counts per country/server, sorted by best OTP rate
 */
router.get('/range-analytics', verifyAdmin, async (req, res) => {
  try {
    const catalogStore = require('../services/catalogStore');
    const providerStore = require('../services/providerStore');

    const countries = catalogStore.listCountries();
    const allProviders = providerStore.list();

    // Get OTP counts per server from local store (single pass)
    const allNumbersSnap = await collections.phoneNumbers.get();
    const successByServer = {};
    const pendingByServer = {};
    const failedByServer = {};

    allNumbersSnap.forEach(doc => {
      const d = doc.data();
      if (!d.serverId) return;
      if (d.status === 'successful') successByServer[d.serverId] = (successByServer[d.serverId] || 0) + 1;
      else if (d.status === 'pending')  pendingByServer[d.serverId] = (pendingByServer[d.serverId] || 0) + 1;
      else if (d.status === 'failed')   failedByServer[d.serverId]  = (failedByServer[d.serverId]  || 0) + 1;
    });

    // Get recent SMS messages per server for live feed
    const smsSnap = await collections.smsMessages.get();
    const smsByServer = {};
    smsSnap.forEach(doc => {
      const d = doc.data();
      if (d.serverId) {
        if (!smsByServer[d.serverId]) smsByServer[d.serverId] = [];
        smsByServer[d.serverId].push(d);
      }
    });

    // Build range data per country
    const rangeData = countries.map(country => {
      const servers = catalogStore.listServers(country.id);
      const ranges = servers.map(srv => {
        const success = successByServer[srv.id] || 0;
        const pending = pendingByServer[srv.id] || 0;
        const failed = failedByServer[srv.id] || 0;
        const total = success + failed;
        const rate = total > 0 ? Math.round((success / total) * 100) : 0;
        const available = catalogStore.countAvailable(srv.id);
        const provider = allProviders.find(p =>
          p.serverId === srv.id || (p.countryId === country.id && p.providerType === 'integrated')
        );
        const recentSms = (smsByServer[srv.id] || [])
          .sort((a, b) => new Date(b.receivedAt || b.createdAt) - new Date(a.receivedAt || a.createdAt))
          .slice(0, 5);

        return {
          serverId: srv.id,
          serverName: srv.name,
          available,
          success,
          pending,
          failed,
          total,
          rate,
          providerId: provider?.id || null,
          providerName: provider?.serviceName || null,
          recentSms
        };
      }).sort((a, b) => b.success - a.success); // best OTP first

      const totalSuccess = ranges.reduce((s, r) => s + r.success, 0);
      return {
        countryId: country.id,
        countryName: country.name,
        flag: country.flag || '🌍',
        iconData: country.iconData || null,
        totalSuccess,
        ranges
      };
    }).sort((a, b) => b.totalSuccess - a.totalSuccess); // best country first

    res.json({ success: true, rangeData });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * GET /api/admin/range-live
 * Live SMS feed with country/range/platform/number/SMS columns
 */
router.get('/range-live', verifyAdmin, async (req, res) => {
  try {
    const catalogStore = require('../services/catalogStore');
    const limit = parseInt(req.query.limit || '100', 10);

    const smsSnap = await collections.smsMessages.get();
    const numSnap = await collections.phoneNumbers.get();

    const numbersById = {};
    numSnap.forEach(doc => { numbersById[doc.id] = doc.data(); });

    const messages = [];
    smsSnap.forEach(doc => messages.push(doc.data()));
    messages.sort((a, b) => new Date(b.receivedAt || b.createdAt) - new Date(a.receivedAt || a.createdAt));

    const rows = messages.slice(0, limit).map((m, i) => {
      const num = numbersById[m.numberId] || {};
      const country = num.countryName || m.country || '—';
      const server = num.serverName || m.server || '—';
      const platform = m.platformName || m.service || '—';
      const phone = m.phoneNumber || num.phoneNumber || '—';
      const otp = m.otp || m.otpCode || null;
      const sms = m.content || m.smsMessage || '—';
      const time = m.receivedAt || m.createdAt;
      return { no: i + 1, country, server, platform, phone, otp, sms, time };
    });

    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * GET /api/admin/api-range-live
 * Fetch live range/CLI data from integrated API providers
 * Shows all countries, ranges, OTP counts from the provider API
 */
router.get('/api-range-live', verifyAdmin, async (req, res) => {
  try {
    const providerStore = require('../services/providerStore');
    const catalogStore  = require('../services/catalogStore');
    const providers = providerStore.list().filter(p => p.providerType === 'integrated');

    if (providers.length === 0) {
      return res.json({ success: true, providers: [], message: 'No integrated API providers configured.' });
    }

    const results = [];

    await Promise.allSettled(providers.map(async (provider) => {
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const headers = { 'x-api-key': provider.apiKey, 'Accept': 'application/json' };
      const entry = {
        providerId: provider.id,
        providerName: provider.serviceName,
        baseUrl: provider.baseUrl,
        countryId: provider.countryId,
        countryName: provider.countryId
          ? (catalogStore.getCountry(provider.countryId)?.name || provider.countryId)
          : '—',
        ranges: [],
        numbers: [],
        totalNumbers: 0,
        totalOtps: 0,
        status: 'ok',
        error: null
      };

      // 1. Fetch CLI ranges with OTP counts
      try {
        const rangeRes = await fetch(`${baseUrl}/cli-ranges`, { headers, signal: AbortSignal.timeout(8000) });
        if (rangeRes.ok) {
          const body = await rangeRes.json().catch(() => ({}));
          const ranges = body.data || body.ranges || [];
          entry.ranges = ranges.map(r => ({
            name: r.name || r.cli || r.range || '—',
            count: r.count || r.numberCount || 0,
            otpCount: r.otpCount || r.otp_count || 0,
            successRate: r.successRate || r.success_rate || null
          }));
          entry.totalOtps = entry.ranges.reduce((s, r) => s + (r.otpCount || 0), 0);
        }
      } catch (_) {}

      // 2. Fetch assigned numbers
      try {
        const numRes = await fetch(`${baseUrl}/numbers?status=assigned&limit=500`, { headers, signal: AbortSignal.timeout(8000) });
        if (numRes.ok) {
          const body = await numRes.json().catch(() => ({}));
          const nums = body.data || body.numbers || [];
          entry.numbers = nums.slice(0, 100).map(n => ({
            number: n.number || n.phone || n.msisdn || n.cli || '—',
            cli: n.cli || n.range || '—',
            status: n.status || 'assigned',
            otpCount: n.otpCount || n.otp_count || 0
          }));
          entry.totalNumbers = nums.length;
        }
      } catch (_) {}

      // 3. Fetch recent OTPs (last 50)
      try {
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last 1 hour
        const otpRes = await fetch(`${baseUrl}/otp?limit=50&since=${encodeURIComponent(since)}`, { headers, signal: AbortSignal.timeout(8000) });
        if (otpRes.ok) {
          const body = await otpRes.json().catch(() => ({}));
          entry.recentOtps = (body.data || body.messages || []).slice(0, 50).map(m => ({
            number: String(m.number || m.phone || '').replace(/\D/g, ''),
            content: m.message || m.content || m.text || '',
            otp: m.otp || null,
            receivedAt: m.created_at || m.receivedAt || new Date().toISOString(),
            cli: m.cli || m.range || '—'
          }));
        }
      } catch (_) {}

      results.push(entry);
    }));

    res.json({ success: true, providers: results, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/*
 * Rank users by successful OTPs — exclude guest users
 */
router.get('/leaderboard', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await collections.users.get();
    const leaderboard = [];
    snapshot.forEach(doc => {
      const u = doc.data();
      // Exclude guest users and users with no OTPs
      if (!u.isGuest && !String(u.id || '').startsWith('guest_') && !String(u.email || '').includes('@guest.local')) {
        leaderboard.push(u);
      }
    });
    leaderboard.sort((a, b) => (b.totalOtps || 0) - (a.totalOtps || 0));
    res.json({ success: true, leaderboard: leaderboard.slice(0, 10) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /api/admin/active-users
 * Get currently active users count
 */
router.get('/active-users', verifyAdmin, async (req, res) => {
  try {
    // Basic implementation: users active in the last 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const snapshot = await collections.users
      .where('updatedAt', '>=', fifteenMinsAgo)
      .get();
    
    res.json({ success: true, count: snapshot.size });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

const postStore = require('../services/postStore');

router.get('/guru/posts', verifyAdmin, async (req, res) => {
  res.json({
    success: true,
    posts: await postStore.listPosts(),
    groups: await postStore.listGroups(),
    settings: await postStore.getSettings()
  });
});

router.delete('/guru/posts/:id', verifyAdmin, async (req, res) => {
  await postStore.deletePost(req.params.id);
  res.json({ success: true });
});

router.post('/guru/posts/:id/promote', verifyAdmin, async (req, res) => {
  const p = await postStore.promotePost(req.params.id);
  if (!p) return res.status(404).json({ success: false, error: { message: 'Not found' } });
  res.json({ success: true, post: p });
});

router.post('/guru/posts', verifyAdmin, async (req, res) => {
  const adminUser = { id: 'admin', name: 'Admin', email: 'admin@gurubit.local', isAdmin: true };
  const { imageUrl, imageData, ...rest } = req.body || {};
  const result = await postStore.createPost({
    user: adminUser,
    ...rest,
    imageUrl: imageUrl || imageData,
    isAdminPost: true,
    isAdminPinned: true
  });
  if (result.error) return res.status(400).json({ success: false, error: { message: result.error } });
  res.json({ success: true, post: result.post });
});

router.put('/guru/settings', verifyAdmin, async (req, res) => {
  res.json({ success: true, settings: await postStore.setSettings(req.body) });
});

// Admin: create group
router.post('/guru/groups', verifyAdmin, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ success: false, error: { message: 'Name required' } });
  const id = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { collections: cols } = require('../config/db');
  await cols.guruGroups.doc(id).set({
    id, name: name.trim(), description: description || '',
    memberCount: 0, createdAt: new Date().toISOString(), createdBy: 'admin'
  });
  res.json({ success: true, group: { id, name: name.trim() } });
});

// Admin: delete group
router.delete('/guru/groups/:id', verifyAdmin, async (req, res) => {
  const { collections: cols } = require('../config/db');
  await cols.guruGroups.doc(req.params.id).delete();
  res.json({ success: true });
});

// Admin: edit group (name, description, icon/logo)
router.put('/guru/groups/:id', verifyAdmin, async (req, res) => {
  try {
    const { collections: cols } = require('../config/db');
    const { name, description, icon } = req.body || {};
    const ref = cols.guruGroups.doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: { message: 'Group not found' } });
    const patch = { updatedAt: new Date().toISOString() };
    if (name?.trim()) patch.name = name.trim();
    if (description !== undefined) patch.description = description || '';
    if (icon) patch.icon = icon; // base64 logo
    await ref.update(patch);
    res.json({ success: true, group: { ...doc.data(), ...patch } });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

// Admin: send message to group
router.post('/guru/groups/:id/message', verifyAdmin, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ success: false, error: { message: 'Message required' } });
    const session = req.adminSession;
    const result = await postStore.addGroupMessage(req.params.id, {
      userId: 'admin',
      userName: session?.displayName || 'Admin',
      text: text.trim(),
      imageUrl: null
    });
    res.json({ success: true, message: result });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.put('/users/:id/suspend', verifyAdmin, async (req, res) => {
  const days = parseInt(req.body.days, 10) || 4;
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await collections.users.doc(req.params.id).update({ suspendedUntil: until, updatedAt: new Date().toISOString() });
  res.json({ success: true, suspendedUntil: until });
});

router.put('/users/:id/unsuspend', verifyAdmin, async (req, res) => {
  await collections.users.doc(req.params.id).update({ suspendedUntil: null, updatedAt: new Date().toISOString() });
  res.json({ success: true });
});

router.put('/users/:id/blue-verify', verifyAdmin, async (req, res) => {
  const { verified } = req.body || {};
  await collections.users.doc(req.params.id).update({ blueVerified: !!verified, updatedAt: new Date().toISOString() });
  res.json({ success: true });
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user and ALL associated data (A to Z).
 */
router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    const { deleteUserAndAllData } = require('../services/userCleanup');
    const result = await deleteUserAndAllData(userId);

    res.json({
      success: true,
      message: 'User and all associated data deleted successfully',
      cleaned: result.deleted
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete user: ' + error.message } });
  }
});

/**
 * POST /api/admin/users
 * Add a new user (admin-created users are auto-verified)
 */
router.post('/users', verifyAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, telegram, cryptoAddress, agentEmail } = req.body || {};
    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'Name, email, and password are required' } 
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'Password must be at least 8 characters' } 
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    
    // Check for duplicate email
    const dup = await collections.users.where('email', '==', cleanEmail).limit(1).get();
    if (dup.size > 0) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'This email is already registered.' } 
      });
    }

    const uid = genId('user');
    const passwordHash = await hashPassword(password);
    
    const userData = {
      _id: uid,
      id: uid,
      name: String(name).trim(),
      email: cleanEmail,
      phone: phone ? String(phone).trim() : '',
      telegram: telegram ? String(telegram).trim() : '',
      cryptoAddress: cryptoAddress ? String(cryptoAddress).trim() : '',
      referralEmail: agentEmail ? String(agentEmail).toLowerCase().trim() : '',
      agentEmail: agentEmail ? String(agentEmail).toLowerCase().trim() : '',
      earningsBalance: 0,
      totalOtps: 0,
      successfulOtps: 0,
      failedOtps: 0,
      isBanned: false,
      isAdmin: false,
      isAgent: false,
      profileComplete: true,
      emailVerified: true,
      blueVerified: false,
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await collections.users.doc(uid).set(userData);

    // Return without passwordHash
    const { passwordHash: _ph, ...safeUser } = userData;

    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: safeUser
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      error: { message: 'Failed to create user: ' + error.message } 
    });
  }
});

/**
 * PUT /api/admin/users/:id
 * Edit/update a user
 */
router.put('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, telegram, cryptoAddress, agentEmail, earningsBalance, isBanned } = req.body || {};
    
    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: { message: 'User not found' } 
      });
    }

    // Build update object
    const updateData = {
      updatedAt: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = String(name).trim();
    if (email !== undefined) {
      // Check if email is already taken by another user
      const cleanEmail = String(email).toLowerCase().trim();
      const existingUser = await collections.users.where('email', '==', cleanEmail).limit(1).get();
      if (existingUser.size > 0) {
        // Get the found user's id
        let foundId = null;
        existingUser.forEach(doc => { foundId = doc.id; });
        if (foundId && foundId !== userId) {
          return res.status(400).json({ 
            success: false, 
            error: { message: 'Email is already in use by another user' } 
          });
        }
      }
      updateData.email = cleanEmail;
    }
    if (phone !== undefined) updateData.phone = String(phone).trim();
    if (telegram !== undefined) updateData.telegram = String(telegram).trim();
    if (cryptoAddress !== undefined) updateData.cryptoAddress = String(cryptoAddress).trim();
    if (agentEmail !== undefined) {
      const cleanAgentEmail = String(agentEmail).toLowerCase().trim();
      updateData.agentEmail = cleanAgentEmail;
      updateData.referralEmail = cleanAgentEmail;
    }
    if (earningsBalance !== undefined && !isNaN(parseFloat(earningsBalance))) {
      updateData.earningsBalance = parseFloat(earningsBalance);
    }
    if (isBanned !== undefined) updateData.isBanned = isBanned === true;

    // Update user
    await collections.users.doc(userId).update(updateData);

    // Fetch updated user
    const updatedDoc = await collections.users.doc(userId).get();
    const user = { id: updatedDoc.id, ...updatedDoc.data() };

    res.json({ 
      success: true, 
      message: 'User updated successfully',
      user 
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      success: false, 
      error: { message: 'Failed to update user: ' + error.message } 
    });
  }
});

/**
 * POST /api/admin/users/delete-all
 * Delete all users (with confirmation)
 * Using POST instead of DELETE because DELETE with body is not semantic
 */
router.post('/users/delete-all', verifyAdmin, async (req, res) => {
  try {
    const { confirm } = req.body || {};
    
    if (confirm !== 'DELETE_ALL_USERS') {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'Confirmation required. Send { "confirm": "DELETE_ALL_USERS" }' } 
      });
    }

    // Get all non-admin, non-agent users
    const snapshot = await collections.users.get();
    const deletePromises = [];
    let deleteCount = 0;

    snapshot.forEach(doc => {
      const user = doc.data();
      // Don't delete admins and agents
      if (!user.isAdmin && !user.isAgent) {
        deletePromises.push(doc.ref.delete());
        deleteCount++;
      }
    });

    await Promise.all(deletePromises);

    // Optional: Clean up related data
    try {
      // Get all user IDs that were deleted
      const deletedUserIds = [];
      snapshot.forEach(doc => {
        const user = doc.data();
        if (!user.isAdmin && !user.isAgent) {
          deletedUserIds.push(doc.id);
        }
      });

      // Delete phone numbers for deleted users
      if (deletedUserIds.length > 0) {
        // Firestore doesn't support 'in' with more than 10 items, so batch it
        for (let i = 0; i < deletedUserIds.length; i += 10) {
          const batch = deletedUserIds.slice(i, i + 10);
          const numbersSnap = await collections.phoneNumbers.where('userId', 'in', batch).get();
          const numberDeletes = [];
          numbersSnap.forEach(doc => numberDeletes.push(doc.ref.delete()));
          await Promise.all(numberDeletes);
        }
      }
    } catch (cleanupErr) {
      console.warn('Bulk cleanup warning:', cleanupErr.message);
    }

    res.json({ 
      success: true, 
      message: `Successfully deleted ${deleteCount} users`,
      deletedCount: deleteCount
    });
  } catch (error) {
    console.error('Delete all users error:', error);
    res.status(500).json({ 
      success: false, 
      error: { message: 'Failed to delete users: ' + error.message } 
    });
  }
});

async function buildNumberCountsByUser() {
  const counts = new Map();
  try {
    const snap = await collections.phoneNumbers.get();
    snap.forEach((doc) => {
      const uid = doc.data().userId;
      if (uid) counts.set(uid, (counts.get(uid) || 0) + 1);
    });
  } catch {}
  return counts;
}

router.get('/agents/stats', verifyAdmin, async (req, res) => {
  const snapshot = await collections.users.get();
  const all = [];
  snapshot.forEach((d) => all.push({ id: d.id, ...d.data() }));
  const numberCounts = await buildNumberCountsByUser();
  const agents = all.filter((u) => u.isAgent).map((agent) => {
    const members = all.filter((u) => !u.isAgent && (u.agentEmail || u.referralEmail || '').toLowerCase() === agent.email?.toLowerCase());
    const activeMembers = members.filter((m) => m.agentApproved).length;
    const totalSms = members.reduce((s, m) => s + (m.totalOtps || 0), 0) + (agent.totalOtps || 0);
    const revenue = members.reduce((s, m) => s + (m.earningsBalance || 0), 0) + (agent.earningsBalance || 0);
    const totalNumbers = members.reduce((s, m) => s + (numberCounts.get(m.id) || 0), 0) + (numberCounts.get(agent.id) || 0);
    const membersWithCounts = members.map((m) => ({
      ...m,
      totalNumbers: numberCounts.get(m.id) || 0
    }));
    return { ...agent, memberCount: members.length, activeMembers, totalSms, totalNumbers, revenue, members: membersWithCounts };
  });
  res.json({ success: true, agents });
});

router.put('/agents/:id/unagent', verifyAdmin, async (req, res) => {
  const { transferToEmail } = req.body || {};
  const agentDoc = await collections.users.doc(req.params.id).get();
  if (!agentDoc.exists || !agentDoc.data().isAgent) {
    return res.status(400).json({ success: false, error: { message: 'Not an agent' } });
  }
  const agentEmail = agentDoc.data().email?.toLowerCase();
  let targetAgentEmail = String(transferToEmail || '').toLowerCase().trim();
  if (!targetAgentEmail) {
    return res.status(400).json({ success: false, error: { message: 'transferToEmail required' } });
  }
  const snap = await collections.users.get();
  let targetFound = false;
  snap.forEach((doc) => {
    const u = doc.data();
    if (u.isAgent && u.email?.toLowerCase() === targetAgentEmail) targetFound = true;
  });
  if (!targetFound) {
    return res.status(400).json({ success: false, error: { message: 'Target agent email not found' } });
  }
  const batch = [];
  snap.forEach((doc) => {
    const u = doc.data();
    if (!u.isAgent && (u.agentEmail || u.referralEmail || '').toLowerCase() === agentEmail) {
      batch.push(collections.users.doc(doc.id).update({
        agentEmail: targetAgentEmail,
        referralEmail: targetAgentEmail,
        updatedAt: new Date().toISOString()
      }));
    }
  });
  await Promise.all(batch);
  await collections.users.doc(req.params.id).update({
    isAgent: false,
    agentEmail: targetAgentEmail,
    referralEmail: targetAgentEmail,
    updatedAt: new Date().toISOString()
  });
  res.json({ success: true, message: 'Agent removed; members transferred' });
});

const backupStore = require('../services/backupStore');
const path = require('path');

function requireSuperAdminRoute(req, res, next) {
  const session = getAdminSession(req.cookies.admin_session);
  if (!session || session.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: { message: 'Super admin only' } });
  }
  req.adminSession = session;
  next();
}

router.get('/database', requireSuperAdminRoute, (req, res) => {
  const cfg = backupStore.loadConfig();
  res.json({
    success: true,
    config: {
      ...cfg,
      botToken: undefined,
      botTokenMasked: backupStore.maskToken(cfg.botToken)
    },
    backups: backupStore.listBackups()
  });
});

// ── Multi-Database Management ──────────────────────────────────────────────
const mongoManager = require('../config/mongo');

/**
 * GET /api/admin/database/list
 * List all configured databases with connection status
 */
router.get('/database/list', requireSuperAdminRoute, async (req, res) => {
  try {
    const dbs = mongoManager.getDbList();
    const statuses = mongoManager.getAllConnStatus();
    // Merge config with live status
    const result = dbs.map(db => {
      const status = statuses.find(s => s.id === db.id) || {};
      return {
        ...db,
        connected: status.connected || false,
        readyState: status.readyState ?? -1
      };
    });
    res.json({ success: true, databases: result });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * POST /api/admin/database/list
 * Add a new database connection
 */
router.post('/database/list', requireSuperAdminRoute, async (req, res) => {
  try {
    const { name, uri, dbName } = req.body || {};
    if (!name || !uri) {
      return res.status(400).json({ success: false, error: { message: 'Name and URI are required' } });
    }
    const id = `db_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = { id, name, uri, dbName: dbName || 'gurubit', active: true, isDefault: false };
    mongoManager.addDbConfig(entry);

    // Try to connect immediately
    try {
      await mongoManager.connectSingle(entry);
    } catch (connErr) {
      console.warn(`Database ${name} added but connection failed:`, connErr.message);
    }

    res.json({ success: true, database: { ...entry, connected: mongoManager.getConnInfo(id)?.connected || false } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * PUT /api/admin/database/list/:id
 * Update a database connection
 */
router.put('/database/list/:id', requireSuperAdminRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, uri, dbName, active } = req.body || {};
    const existing = mongoManager.getDbConfig(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Database not found' } });
    }

    const patch = {};
    if (name !== undefined) patch.name = name;
    if (uri !== undefined) patch.uri = uri;
    if (dbName !== undefined) patch.dbName = dbName;
    if (active !== undefined) patch.active = active;

    mongoManager.updateDbConfig(id, patch);

    // Reconnect if URI changed or active state changed
    if (uri !== undefined || active !== undefined) {
      const updated = mongoManager.getDbConfig(id);
      if (updated.active) {
        try {
          await mongoManager.disconnectSingle(id);
          await mongoManager.connectSingle(updated);
        } catch (connErr) {
          console.warn(`Database ${name || id} reconnect failed:`, connErr.message);
        }
      } else {
        await mongoManager.disconnectSingle(id);
      }
    }

    const info = mongoManager.getConnInfo(id);
    res.json({ success: true, database: { ...existing, ...patch, connected: info?.connected || false } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * DELETE /api/admin/database/list/:id
 * Remove a database connection
 */
router.delete('/database/list/:id', requireSuperAdminRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = mongoManager.getDbConfig(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Database not found' } });
    }
    if (existing.isDefault) {
      return res.status(400).json({ success: false, error: { message: 'Cannot delete the primary database' } });
    }

    await mongoManager.disconnectSingle(id);
    mongoManager.removeDbConfig(id);

    res.json({ success: true, message: `Database "${existing.name}" removed` });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * PUT /api/admin/database/list/:id/set-primary
 * Set a database as the primary (default)
 */
router.put('/database/list/:id/set-primary', requireSuperAdminRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = mongoManager.getDbConfig(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Database not found' } });
    }
    mongoManager.setPrimaryDb(id);
    res.json({ success: true, message: `"${existing.name}" set as primary` });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * POST /api/admin/database/list/:id/test
 * Test a database connection
 */
router.post('/database/list/:id/test', requireSuperAdminRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = mongoManager.getDbConfig(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Database not found' } });
    }
    const info = mongoManager.getConnInfo(id);
    if (info && info.connected) {
      return res.json({ success: true, message: `Connected to "${existing.name}" ✅` });
    }
    // Try connecting
    try {
      await mongoManager.disconnectSingle(id);
      await mongoManager.connectSingle(existing);
      res.json({ success: true, message: `Connected to "${existing.name}" ✅` });
    } catch (connErr) {
      res.json({ success: false, message: `Connection failed: ${connErr.message}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

router.put('/database/schedule', requireSuperAdminRoute, (req, res) => {
  const { enabled, intervalDays, time, botToken, adminChatId } = req.body || {};
  const patch = {
    enabled: !!enabled,
    intervalDays: Math.max(1, parseInt(intervalDays, 10) || 1),
    time: time || '09:00'
  };
  if (botToken && String(botToken).trim()) patch.botToken = String(botToken).trim();
  if (adminChatId !== undefined) patch.adminChatId = String(adminChatId).trim();
  let cfg = backupStore.saveConfig(patch);
  if (cfg.enabled) {
    cfg = backupStore.saveConfig({ nextBackupAt: backupStore.computeNextRun(cfg) });
  }
  res.json({
    success: true,
    config: { ...cfg, botToken: undefined, botTokenMasked: backupStore.maskToken(cfg.botToken) }
  });
});

router.post('/database/export', requireSuperAdminRoute, async (req, res) => {
  try {
    const file = await backupStore.runBackup(collections, { prefix: 'manual', notify: true });
    res.json({ success: true, backup: file });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/database/import', requireSuperAdminRoute, async (req, res) => {
  try {
    await backupStore.restoreBackup(collections, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/database/wipe', requireSuperAdminRoute, async (req, res) => {
  try {
    await backupStore.wipeDatabase(collections);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/database/restore/:id', requireSuperAdminRoute, async (req, res) => {
  try {
    const snap = backupStore.readBackup(req.params.id);
    if (!snap) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    await backupStore.restoreBackup(collections, snap);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.delete('/database/backups/:id', requireSuperAdminRoute, (req, res) => {
  if (!backupStore.deleteBackup(req.params.id)) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }
  res.json({ success: true });
});

router.get('/database/download/:id', requireSuperAdminRoute, (req, res) => {
  const file = path.join(backupStore.BACKUP_DIR, `${req.params.id}.json`);
  if (!require('fs').existsSync(file)) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }
  res.download(file);
});

/**
 * GET /api/admin/database/env-config
 * Return current env config (masked secrets) for display in admin panel
 */
router.get('/database/env-config', requireSuperAdminRoute, async (req, res) => {
  let mongoInfo = { connected: false, host: '', dbName: process.env.MONGODB_DB || 'gurubit' };
  try {
    const { isMongoConfigured, mongoose } = require('../config/mongo');
    const connected = isMongoConfigured();
    mongoInfo = {
      connected,
      host: process.env.MONGODB_URI
        ? process.env.MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')
        : '',
      dbName: (mongoose.connection && mongoose.connection.name) || process.env.MONGODB_DB || 'gurubit'
    };
  } catch (_) {}
  res.json({
    success: true,
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT || '587',
      secure: process.env.SMTP_SECURE || 'false',
      user: process.env.SMTP_USER || '',
      from: process.env.SMTP_FROM || '',
      passSet: !!process.env.SMTP_PASS
    },
    mongodb: mongoInfo
  });
});

/**
 * PUT /api/admin/database/env-config
 * Update SMTP and Firebase env vars at runtime (persists in memory until restart)
 * For permanent storage, user must also set in Render Dashboard
 */
router.put('/database/env-config', requireSuperAdminRoute, async (req, res) => {
  try {
    const { section, data } = req.body || {};

    if (section === 'smtp') {
      if (data.host !== undefined) process.env.SMTP_HOST = data.host;
      if (data.port !== undefined) process.env.SMTP_PORT = String(data.port);
      if (data.secure !== undefined) process.env.SMTP_SECURE = String(data.secure);
      if (data.user !== undefined) process.env.SMTP_USER = data.user;
      if (data.pass && data.pass.trim()) process.env.SMTP_PASS = data.pass;
      if (data.from !== undefined) process.env.SMTP_FROM = data.from;

      // Persist to MongoDB so it survives server restarts
      const { saveSmtpToMongo } = require('../services/emailSender');
      await saveSmtpToMongo({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM
      });

      // Verify SMTP in background with a 10s timeout — don't block the save response
      let verifyMsg = 'SMTP settings saved ✅';
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 8000
          });
          await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), 10000))
          ]);
          verifyMsg = 'SMTP settings saved & connection verified ✅';
        } catch (err) {
          verifyMsg = `SMTP settings saved ✅ (verify failed: ${err.message})`;
        }
      }
      return res.json({ success: true, message: verifyMsg });
    }

    if (section === 'mongodb') {
      if (data.uri) process.env.MONGODB_URI = data.uri;
      if (data.dbName) process.env.MONGODB_DB = data.dbName;
      try {
        const { mongoose, isMongoConfigured } = require('../config/mongo');
        const wasConnected = isMongoConfigured();
        if (data.uri) {
          await mongoose.disconnect().catch(() => {});
          const { connectMongo, ensureIndexes } = require('../config/mongo');
          await connectMongo();
          await ensureIndexes();
        }
        return res.json({
          success: true,
          message: wasConnected
            ? 'MongoDB already connected ✅'
            : 'MongoDB connected successfully ✅'
        });
      } catch (err) {
        return res.json({ success: true, message: `Settings saved but connection test failed: ${err.message}` });
      }
    }

    res.status(400).json({ success: false, error: { message: 'Unknown section' } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * POST /api/admin/database/test-email
 * Send a test email to verify SMTP settings
 */
router.post('/database/test-email', requireSuperAdminRoute, async (req, res) => {
  try {
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ success: false, error: { message: 'Recipient email required' } });
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(400).json({ success: false, error: { message: 'SMTP not configured. Save SMTP settings first.' } });
    }
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    await Promise.race([
      transporter.sendMail({
        from: process.env.SMTP_FROM || `"GURUBIT" <${process.env.SMTP_USER}>`,
        to,
        subject: 'GURUBIT — SMTP Test Email',
        html: `<div style="font-family:sans-serif;padding:24px;background:#0f172a;color:#fff;border-radius:12px">
        <h2 style="color:#06b6d4">✅ SMTP Test Successful</h2>
        <p>Your GURUBIT email configuration is working correctly.</p>
        <p style="color:#94a3b8;font-size:12px">Sent from GURUBIT Admin Panel</p>
      </div>`
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Send timed out after 15s — check SMTP credentials and host')), 15000))
    ]);
    res.json({ success: true, message: `Test email sent to ${to} ✅` });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

module.exports = router;
