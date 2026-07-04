/**
 * Agent panel API — members, approvals, stats
 * All store calls are async (MongoDB backed).
 */

const express = require('express');
const router = express.Router();
const { collections, db } = require('../config/db');
const { verifyToken } = require('../services/authService');
const agentStore = require('../services/agentStore');

async function verifyAuth(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    const decodedToken = verifyToken(token);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
    }
    req.userId = decodedToken.uid;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
}

async function verifyAgent(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    const decodedToken = verifyToken(token);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
    }
    req.userId = decodedToken.uid;
    const userDoc = await collections.users.doc(req.userId).get();
    if (!userDoc.exists || !userDoc.data().isAgent) {
      return res.status(403).json({ success: false, error: { message: 'Agent access only' } });
    }
    req.agent = userDoc.data();
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
}

function memberOfAgent(u, agentEmail) {
  const ae = String(agentEmail).toLowerCase();
  return !u.isAgent && (u.agentEmail?.toLowerCase() === ae || u.referralEmail?.toLowerCase() === ae);
}

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

router.get('/dashboard', verifyAgent, async (req, res) => {
  try {
    const agentEmail = req.agent.email.toLowerCase();
    const numberCounts = await buildNumberCountsByUser();
    const snapshot = await collections.users.get();
    const members = [];
    snapshot.forEach((doc) => {
      const u = doc.data();
      if (memberOfAgent(u, agentEmail)) members.push({ id: doc.id, ...u });
    });

    const activeMembers = members.filter((m) => m.agentApproved !== false);
    const pendingRaw = await agentStore.listPending(agentEmail);
    const pending = [];
    for (const p of pendingRaw) {
      let extra = {};
      try {
        const ud = await collections.users.doc(p.userId).get();
        if (ud.exists) extra = ud.data();
      } catch {}
      pending.push({
        ...p,
        phone: extra.phone || extra.identificationNumber || '—',
        telegram: extra.telegram || extra.telegramNumber || '—',
        whatsapp: extra.whatsappNumber || '—',
        cryptoAddress: extra.cryptoAddress || extra.cryptoWalletAddress || '—',
        cryptoCurrencyType: extra.cryptoCurrencyType || '—'
      });
    }

    const memberStats = members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone || '—',
      telegram: m.telegram || m.telegramNumber || '—',
      totalNumbers: numberCounts.get(m.id) || 0,
      totalSms: m.totalOtps || 0,
      revenue: m.earningsBalance || 0,
      agentApproved: m.agentApproved !== false,
      isBanned: !!m.isBanned,
      apiEnabled: !!m.apiEnabled
    }));

    // Only include approved members in the members list — pending go in the separate pending list
    const approvedMemberStats = memberStats.filter(m => m.agentApproved === true);

    const totalNumbers = members.reduce((s, m) => s + (numberCounts.get(m.id) || 0), 0);
    const bannedMembers = members.filter((m) => !!m.isBanned).length;

    // Count failed numbers for this agent's team
    let failedNumbers = 0;
    try {
      const memberIds = members.map(m => m.id);
      // Batch query in chunks of 10 (MongoDB 'in' limit workaround)
      for (let i = 0; i < memberIds.length; i += 10) {
        const batch = memberIds.slice(i, i + 10);
        const failedSnap = await collections.phoneNumbers
          .where('userId', 'in', batch)
          .get();
        failedSnap.forEach(doc => {
          if (doc.data().status === 'failed') failedNumbers++;
        });
      }
    } catch {}

    res.json({
      success: true,
      agent: { name: req.agent.name, email: req.agent.email },
      stats: {
        totalMembers: members.length,
        activeMembers: activeMembers.length,
        bannedMembers,
        pendingApprovals: pending.length,
        totalSms: members.reduce((s, m) => s + (m.totalOtps || 0), 0),
        totalNumbers,
        failedNumbers
      },
      members: approvedMemberStats,
      pending
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

async function approveUser(userId, agentEmail) {
  await collections.users.doc(userId).update({
    agentApproved: true,
    updatedAt: new Date().toISOString()
  });
  const pending = await agentStore.listPending(agentEmail);
  for (const p of pending) {
    if (p.userId === userId && p.status === 'pending') await agentStore.approve(p.id);
  }
}

router.post('/approve/:approvalId', verifyAgent, async (req, res) => {
  try {
    const item = await agentStore.approve(req.params.approvalId);
    if (!item || item.agentEmail !== req.agent.email.toLowerCase()) {
      return res.status(404).json({ success: false, error: { message: 'Approval not found' } });
    }
    await approveUser(item.userId, req.agent.email);
    res.json({ success: true, message: 'User approved' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.post('/approve-user/:userId', verifyAgent, async (req, res) => {
  try {
    const userDoc = await collections.users.doc(req.params.userId).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    const u = userDoc.data();
    if (!memberOfAgent(u, req.agent.email)) {
      return res.status(403).json({ success: false, error: { message: 'Not your member' } });
    }
    await approveUser(req.params.userId, req.agent.email);
    res.json({ success: true, message: 'User approved' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.post('/reject/:approvalId', verifyAgent, async (req, res) => {
  try {
    const item = await agentStore.reject(req.params.approvalId);
    if (!item || item.agentEmail !== req.agent.email.toLowerCase()) {
      return res.status(404).json({ success: false, error: { message: 'Approval not found' } });
    }

    // Delete the user and ALL their data when agent rejects
    if (item.userId) {
      const { deleteUserAndAllData } = require('../services/userCleanup');
      await deleteUserAndAllData(item.userId).catch(e =>
        console.warn('[AgentReject] cleanup error:', e.message)
      );
    }

    res.json({ success: true, message: 'Request rejected and user data removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.put('/users/:userId/toggle-ban', verifyAgent, async (req, res) => {
  try {
    const userDoc = await collections.users.doc(req.params.userId).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    const u = userDoc.data();
    if (!memberOfAgent(u, req.agent.email)) {
      return res.status(403).json({ success: false, error: { message: 'Not your member' } });
    }
    const nextBanStatus = !u.isBanned;
    await collections.users.doc(req.params.userId).update({ isBanned: nextBanStatus, updatedAt: new Date().toISOString() });
    res.json({ success: true, isBanned: nextBanStatus, message: nextBanStatus ? 'User banned' : 'User unbanned' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.put('/users/:userId/toggle-api', verifyAgent, async (req, res) => {
  try {
    const userDoc = await collections.users.doc(req.params.userId).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    const u = userDoc.data();
    if (!memberOfAgent(u, req.agent.email)) {
      return res.status(403).json({ success: false, error: { message: 'Not your member' } });
    }
    const next = !u.apiEnabled;
    await collections.users.doc(req.params.userId).update({ apiEnabled: next, updatedAt: new Date().toISOString() });
    res.json({ success: true, apiEnabled: next, message: next ? 'API access enabled' : 'API access disabled' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.delete('/users/:userId', verifyAgent, async (req, res) => {
  try {
    const userId = req.params.userId;
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }
    const u = userDoc.data();
    if (!memberOfAgent(u, req.agent.email)) {
      return res.status(403).json({ success: false, error: { message: 'Not your member' } });
    }

    // Full A-Z data deletion
    const { deleteUserAndAllData } = require('../services/userCleanup');
    const result = await deleteUserAndAllData(userId);

    res.json({
      success: true,
      message: 'User and all associated data deleted successfully',
      cleaned: result.deleted
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

module.exports = router;
