/**
 * Guru social — feed, groups, follow, reports, AI moderation
 * All data stored in Firestore — no in-memory stores
 */

const express = require('express');
const router = express.Router();
const { auth, collections, db } = require('../config/firebase');
const postStore = require('../services/postStore');
const { moderateContent } = require('../services/aiModeration');

// Firestore collections
const ANN_COL        = 'announcements';
const GROUP_MEM_COL  = 'groupMembers';   // doc id: groupId_userId
const GROUP_BAN_COL  = 'groupBans';      // doc id: groupId_userId

async function verifyAuth(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    const decoded = await auth.verifyIdToken(token);
    req.userId = decoded.uid;
    const doc = await collections.users.doc(req.userId).get();
    if (!doc.exists) return res.status(401).json({ success: false, error: { message: 'User not found' } });
    req.user = { ...doc.data(), id: req.userId };
    if (req.user.isBanned) return res.status(403).json({ success: false, error: { message: 'Account banned' } });
    if (req.user.suspendedUntil && new Date(req.user.suspendedUntil) > new Date()) {
      return res.status(403).json({ success: false, error: { message: 'Account suspended', code: 'SUSPENDED' } });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid session' } });
  }
}

// ── Feed ─────────────────────────────────────────────────────────────────────

router.get('/feed', verifyAuth, async (req, res) => {
  const posts = await postStore.listPosts();
  const withFollow = await Promise.all(
    posts.map(async (p) => ({
      ...p,
      following: await postStore.isFollowing(req.userId, p.userId)
    }))
  );
  res.json({ success: true, posts: withFollow });
});

router.post('/posts', verifyAuth, async (req, res) => {
  const { text, imageUrl, imageData, videoUrl, link } = req.body || {};
  const img = imageUrl || imageData;

  if (postStore.hasLink(text) && !req.user.isAdmin) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Links are not allowed in posts. Telegram links, website URLs, and similar content are prohibited.',
        code: 'LINK_DETECTED'
      }
    });
  }

  const settings = await postStore.getSettings();
  const modText = [text, link].filter(Boolean).join(' ');
  const mod = await moderateContent({ text: modText, userId: req.userId, settings });
  if (!mod.allowed) {
    return res.status(403).json({ success: false, error: { message: mod.error, code: mod.code }, suspendedUntil: mod.suspendedUntil });
  }

  const result = await postStore.createPost({ user: req.user, text, imageUrl: img, videoUrl, link });
  if (result.error) return res.status(400).json({ success: false, error: { message: result.error } });
  res.json({ success: true, post: result.post });
});

async function applyReportPenalty(userId) {
  const uniqueReports = await postStore.countUserReports(userId);
  if (uniqueReports < 4) return null;
  const until = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
  await collections.users.doc(userId).update({ suspendedUntil: until, reportCount: uniqueReports, updatedAt: new Date().toISOString() });
  return until;
}

router.post('/posts/:id/report', verifyAuth, async (req, res) => {
  const post = await postStore.reportPost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });
  await postStore.reportUser(post.userId, req.userId);
  const suspendedUntil = await applyReportPenalty(post.userId);
  res.json({ success: true, suspendedUntil });
});

router.post('/users/:id/follow', verifyAuth, async (req, res) => {
  const r = await postStore.toggleFollow(req.userId, req.params.id);
  res.json({ success: true, ...r });
});

router.get('/users/:id/profile', verifyAuth, async (req, res) => {
  const doc = await collections.users.doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ success: false, error: { message: 'Not found' } });
  const u = doc.data();
  const userPosts = await postStore.listPosts({ forUserId: req.params.id });
  res.json({
    success: true,
    profile: {
      id: u.id || req.params.id,
      name: u.name,
      email: u.email,
      profilePhotoUrl: u.profilePhotoUrl,
      totalSms: u.totalOtps || 0,
      revenue: u.earningsBalance || 0,
      blueVerified: !!u.blueVerified,
      isAgent: !!u.isAgent
    },
    posts: userPosts,
    following: await postStore.isFollowing(req.userId, req.params.id)
  });
});

// ── Groups ────────────────────────────────────────────────────────────────────

async function isMember(groupId, userId) {
  const doc = await db.collection(GROUP_MEM_COL).doc(`${groupId}_${userId}`).get();
  return doc.exists;
}

async function isBanned(groupId, userId) {
  const doc = await db.collection(GROUP_BAN_COL).doc(`${groupId}_${userId}`).get();
  return doc.exists;
}

async function getMyGroupIds(userId) {
  const snap = await db.collection(GROUP_MEM_COL).get();
  const ids = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.userId === userId) ids.push(d.groupId);
  });
  return ids;
}

router.get('/groups', verifyAuth, async (req, res) => {
  const [groups, myGroupIds] = await Promise.all([
    postStore.listGroups(),
    getMyGroupIds(req.userId)
  ]);
  res.json({ success: true, groups, myGroupIds });
});

router.post('/groups', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ success: false, error: { message: 'Name required' } });
  const id = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await collections.guruGroups.doc(id).set({
    id, name: name.trim(), description: description || '',
    memberCount: 0, createdAt: new Date().toISOString(), createdBy: req.userId
  });
  res.json({ success: true, group: { id, name: name.trim() } });
});

router.delete('/groups/:id', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  await collections.guruGroups.doc(req.params.id).delete();
  // Clean up memberships and bans
  const [memSnap, banSnap] = await Promise.all([
    db.collection(GROUP_MEM_COL).get(),
    db.collection(GROUP_BAN_COL).get()
  ]);
  const deletes = [];
  memSnap.forEach(doc => { if (doc.data().groupId === req.params.id) deletes.push(doc.ref.delete()); });
  banSnap.forEach(doc => { if (doc.data().groupId === req.params.id) deletes.push(doc.ref.delete()); });
  await Promise.all(deletes);
  res.json({ success: true });
});

router.post('/groups/:id/join', verifyAuth, async (req, res) => {
  const gid = req.params.id;
  if (await isBanned(gid, req.userId)) {
    return res.status(403).json({ success: false, error: { message: 'You are banned from this group' } });
  }
  const memId = `${gid}_${req.userId}`;
  await db.collection(GROUP_MEM_COL).doc(memId).set({
    groupId: gid, userId: req.userId, joinedAt: new Date().toISOString()
  });
  // Update member count
  const snap = await db.collection(GROUP_MEM_COL).get();
  const count = snap.docs.filter(d => d.data().groupId === gid).length;
  await collections.guruGroups.doc(gid).update({ memberCount: count }).catch(() => {});
  res.json({ success: true });
});

router.post('/groups/:id/leave', verifyAuth, async (req, res) => {
  const gid = req.params.id;
  await db.collection(GROUP_MEM_COL).doc(`${gid}_${req.userId}`).delete();
  const snap = await db.collection(GROUP_MEM_COL).get();
  const count = snap.docs.filter(d => d.data().groupId === gid).length;
  await collections.guruGroups.doc(gid).update({ memberCount: Math.max(0, count) }).catch(() => {});
  res.json({ success: true });
});

router.post('/groups/:id/ban/:userId', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  const gid = req.params.id;
  const uid = req.params.userId;
  await db.collection(GROUP_BAN_COL).doc(`${gid}_${uid}`).set({
    groupId: gid, userId: uid, bannedAt: new Date().toISOString(), bannedBy: req.userId
  });
  await db.collection(GROUP_MEM_COL).doc(`${gid}_${uid}`).delete();
  res.json({ success: true });
});

router.get('/groups/:id/messages', verifyAuth, async (req, res) => {
  res.json({ success: true, messages: await postStore.getGroupMessages(req.params.id) });
});

router.post('/groups/:id/messages', verifyAuth, async (req, res) => {
  const gid = req.params.id;
  const { text, imageData, imageUrl } = req.body || {};
  const img = imageUrl || imageData;

  if (!text?.trim() && !img) {
    return res.status(400).json({ success: false, error: { message: 'Message required' } });
  }

  if (await isBanned(gid, req.userId)) {
    return res.status(403).json({ success: false, error: { message: 'You are banned from this group' } });
  }

  if (postStore.hasLink(text) && !req.user.isAdmin) {
    // Auto-ban from group in Firestore
    await db.collection(GROUP_BAN_COL).doc(`${gid}_${req.userId}`).set({
      groupId: gid, userId: req.userId, bannedAt: new Date().toISOString(), bannedBy: 'system', reason: 'link_detected'
    });
    await db.collection(GROUP_MEM_COL).doc(`${gid}_${req.userId}`).delete();
    return res.status(400).json({
      success: false,
      error: { message: 'Links are not allowed in groups. You have been removed from this group.', code: 'LINK_DETECTED' }
    });
  }

  const settings = await postStore.getSettings();
  const mod = await moderateContent({ text: (text || '').trim(), userId: req.userId, settings });
  if (!mod.allowed) {
    return res.status(403).json({ success: false, error: { message: mod.error, code: mod.code }, suspendedUntil: mod.suspendedUntil });
  }

  const result = await postStore.addGroupMessage(gid, {
    userId: req.userId, userName: req.user.name,
    text: (text || '').trim(), imageUrl: img
  });
  if (result?.error) return res.status(400).json({ success: false, error: { message: result.error } });
  res.json({ success: true, message: result });
});

// ── Announcements — Firestore backed ─────────────────────────────────────────

const ANN_FS = () => db.collection(ANN_COL);

router.get('/announcements', async (req, res) => {
  try {
    const snap = await ANN_FS().get();
    const items = [];
    snap.forEach(doc => items.push(doc.data()));
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, announcements: items });
  } catch (e) {
    res.json({ success: true, announcements: [] });
  }
});

router.post('/announcements', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  const { title, body } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ success: false, error: { message: 'Title required' } });
  const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ann = { id, title: title.trim(), body: (body || '').trim(), createdAt: new Date().toISOString(), createdBy: req.userId };
  await ANN_FS().doc(id).set(ann);
  res.json({ success: true, announcement: ann });
});

router.delete('/announcements/:id', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  await ANN_FS().doc(req.params.id).delete();
  res.json({ success: true });
});

module.exports = router;
