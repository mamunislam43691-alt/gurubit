/**
 * Agent panel API — members, approvals, stats
 */

const express = require('express');
const router = express.Router();
const { auth, collections } = require('../config/firebase');
const agentStore = require('../services/agentStore');

async function verifyAuth(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }
    const decodedToken = await auth.verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
}

async function verifyAgent(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }
    const decodedToken = await auth.verifyIdToken(token);
    req.userId = decodedToken.uid;
    const userDoc = await collections.users.doc(req.userId).get();
    if (!userDoc.exists || !userDoc.data().isAgent) {
      return res.status(403).json({ success: false, error: { message: 'Agent access only' } });
    }
    req.agent = userDoc.data();
    next();
  } catch (e) {
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
    const pendingRaw = agentStore.listPending(agentEmail);
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
      isBanned: !!m.isBanned
    }));

    const totalNumbers = members.reduce((s, m) => s + (numberCounts.get(m.id) || 0), 0);
    const bannedMembers = members.filter((m) => !!m.isBanned).length;

    res.json({
      success: true,
      agent: { name: req.agent.name, email: req.agent.email },
      stats: {
        totalMembers: members.length,
        activeMembers: activeMembers.length,
        bannedMembers,
        pendingApprovals: pending.length,
        totalSms: members.reduce((s, m) => s + (m.totalOtps || 0), 0),
        totalNumbers
      },
      members: memberStats,
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
  const pending = agentStore.listPending(agentEmail);
  pending.forEach((p) => {
    if (p.userId === userId && p.status === 'pending') agentStore.approve(p.id);
  });
}

router.post('/approve/:approvalId', verifyAgent, async (req, res) => {
  try {
    const item = agentStore.approve(req.params.approvalId);
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
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }
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
  const item = agentStore.reject(req.params.approvalId);
  if (!item || item.agentEmail !== req.agent.email.toLowerCase()) {
    return res.status(404).json({ success: false, error: { message: 'Approval not found' } });
  }
  res.json({ success: true, message: 'Request rejected' });
});

router.put('/users/:userId/toggle-ban', verifyAgent, async (req, res) => {
  try {
    const userDoc = await collections.users.doc(req.params.userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }
    const u = userDoc.data();
    if (!memberOfAgent(u, req.agent.email)) {
      return res.status(403).json({ success: false, error: { message: 'Not your member' } });
    }
    const nextBanStatus = !u.isBanned;
    await collections.users.doc(req.params.userId).update({
      isBanned: nextBanStatus,
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true, isBanned: nextBanStatus, message: nextBanStatus ? 'User banned' : 'User unbanned' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

module.exports = router;
