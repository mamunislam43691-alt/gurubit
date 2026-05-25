/**
 * Admin Routes
 * Handles admin authentication and dashboard operations
 */

const express = require('express');
const router = express.Router();
const { db, collections, auth, isFirebaseConfigured } = require('../config/firebase');

async function createFirebaseUser(email, password, displayName) {
  if (isFirebaseConfigured && auth && typeof auth.createUser === 'function') {
    try {
      const user = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: true
      });
      return user.uid;
    } catch (e) {
      console.warn('Real Firebase Admin createUser failed, trying REST API fallback:', e.message);
    }
  }

  const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyCnX58oQu4fxTwp6sZTkO3yPp6YjaUMBhg";
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to create user in Firebase Auth');
  }
  return data.localId;
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
router.get('/dashboard', async (req, res) => {
  try {
    const sessionToken = req.cookies.admin_session;

    if (!isAdminSessionValid(sessionToken)) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' }
      });
    }

    // Get real counts from Firestore collections
    const usersSnapshot = await collections.users.get();
    const numbersSnapshot = await collections.phoneNumbers.get();
    const messagesSnapshot = await collections.smsMessages.get();

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

    const supportSessions = supportStore.listSessions();
    const supportOpen = supportSessions.filter((s) => s.status === 'open').length;

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => !u.isBanned).length,
      bannedUsers: users.filter((u) => !!u.isBanned).length,
      totalServices: await catalogStore.countServices(),
      totalNumbers: numbersSnapshot.size || 0,
      totalSms: messagesSnapshot.size || 0,
      totalOtps: messagesSnapshot.size || 0,
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

    return res.status(200).json({
      success: true,
      stats,
      topApplications: analytics.topApplications,
      topRanges: analytics.topRanges,
      chart: analytics.chart,
      topServices: analytics.topServices
    });
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
    if (sendUrlBase.includes('203.161.58.20') || (prov.apiKey || '').startsWith('sk_')) {
      headers['x-api-key'] = prov.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${prov.apiKey}`;
      headers['X-API-Key'] = prov.apiKey;
      headers['x-api-key'] = prov.apiKey;
    }

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
    const { serviceName, apiKey, baseUrl, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange } = req.body;
    if (!baseUrl?.trim() || !apiKey?.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Base URL and API key are required' } });
    }
    const key = await providerStore.add({
      serviceName: serviceName || 'SMS Provider',
      baseUrl: (baseUrl || '').trim(),
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
    const { serviceName, apiKey, baseUrl, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange } = req.body;
    if (!baseUrl?.trim() || !apiKey?.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Base URL and API key are required' } });
    }
    const key = await providerStore.update(req.params.id, {
      serviceName: serviceName || 'SMS Provider',
      baseUrl: (baseUrl || '').trim(),
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

    const uid = await createFirebaseUser(email, password, name);

    await collections.users.doc(uid).set({
      id: uid,
      name,
      email,
      phone: phone || '',
      telegram: telegram || '',
      cryptoAddress: cryptoAddress || '',
      referralEmail: '',
      agentEmail: '',
      agentApproved: true,
      earningsBalance: 0,
      totalOtps: 0,
      failedOtps: 0,
      isBanned: false,
      isAdmin: false,
      isAgent: true,
      profileComplete: true,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Agent account created successfully!' });
  } catch (error) {
    console.error('Create agent error:', error);
    let errMsg = error.message;
    if (errMsg.includes('EMAIL_EXISTS')) errMsg = 'This email address is already registered.';
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

router.get('/costs', verifyAdminPerm('costs'), async (req, res) => {
  res.json({ success: true, costs: await costStore.listCostsGrouped(catalogStore) });
});

router.put('/costs/:countryId', verifyAdminPerm('costs'), async (req, res) => {
  const { serverId, userReward, agentReward } = req.body || {};
  const c = await costStore.setCost(req.params.countryId, serverId || '', { userReward, agentReward });
  res.json({ success: true, cost: c });
});

/**
 * GET /api/admin/leaderboard
 * Rank users by successful OTPs
 */
router.get('/leaderboard', verifyAdmin, async (req, res) => {
  try {
    const snapshot = await collections.users
      .orderBy('totalOtps', 'desc')
      .limit(10)
      .get();
    
    const leaderboard = [];
    snapshot.forEach(doc => {
      leaderboard.push(doc.data());
    });
    
    res.json({ success: true, leaderboard });
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
  const { collections: cols } = require('../config/firebase');
  await cols.guruGroups.doc(id).set({
    id, name: name.trim(), description: description || '',
    memberCount: 0, createdAt: new Date().toISOString(), createdBy: 'admin'
  });
  res.json({ success: true, group: { id, name: name.trim() } });
});

// Admin: delete group
router.delete('/guru/groups/:id', verifyAdmin, async (req, res) => {
  const { collections: cols } = require('../config/firebase');
  await cols.guruGroups.doc(req.params.id).delete();
  res.json({ success: true });
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

router.delete('/users/:id', verifyAdmin, async (req, res) => {
  await collections.users.doc(req.params.id).delete();
  res.json({ success: true });
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
router.get('/database/env-config', requireSuperAdminRoute, (req, res) => {
  res.json({
    success: true,
    firebase: {
      databaseUrl: process.env.FIREBASE_DATABASE_URL || '',
      serviceAccountSet: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      projectId: (() => {
        try {
          const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : null;
          return sa?.project_id || '';
        } catch { return ''; }
      })()
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT || '587',
      secure: process.env.SMTP_SECURE || 'false',
      user: process.env.SMTP_USER || '',
      from: process.env.SMTP_FROM || '',
      passSet: !!process.env.SMTP_PASS
    }
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

      // Test SMTP connection if credentials provided
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          });
          await transporter.verify();
          return res.json({ success: true, message: 'SMTP settings saved & connection verified ✅' });
        } catch (err) {
          return res.json({ success: true, message: `Settings saved but SMTP test failed: ${err.message}` });
        }
      }
      return res.json({ success: true, message: 'SMTP settings saved (runtime only — also set in Render Dashboard for persistence)' });
    }

    if (section === 'firebase') {
      if (data.databaseUrl !== undefined) process.env.FIREBASE_DATABASE_URL = data.databaseUrl;
      if (data.serviceAccount && data.serviceAccount.trim()) {
        try {
          JSON.parse(data.serviceAccount); // validate JSON
          process.env.FIREBASE_SERVICE_ACCOUNT = data.serviceAccount;
        } catch {
          return res.status(400).json({ success: false, error: { message: 'Invalid JSON for Service Account' } });
        }
      }
      return res.json({ success: true, message: 'Firebase settings saved (runtime only — also set in Render Dashboard for persistence)' });
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
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"GURUBIT" <${process.env.SMTP_USER}>`,
      to,
      subject: 'GURUBIT — SMTP Test Email',
      html: `<div style="font-family:sans-serif;padding:24px;background:#0f172a;color:#fff;border-radius:12px">
        <h2 style="color:#06b6d4">✅ SMTP Test Successful</h2>
        <p>Your GURUBIT email configuration is working correctly.</p>
        <p style="color:#94a3b8;font-size:12px">Sent from GURUBIT Admin Panel</p>
      </div>`
    });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

module.exports = router;
