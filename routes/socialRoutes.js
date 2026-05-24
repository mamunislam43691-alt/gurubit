/**
 * Guru social — feed, groups, follow, reports, AI moderation
 */

const express = require('express');
const router = express.Router();
const { auth, collections } = require('../config/firebase');
const postStore = require('../services/postStore');
const { moderateContent } = require('../services/aiModeration');

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
  const settings = await postStore.getSettings();
  const modText = [text, link].filter(Boolean).join(' ');
  const mod = await moderateContent({ text: modText, userId: req.userId, settings });
  if (!mod.allowed) {
    return res.status(403).json({
      success: false,
      error: { message: mod.error, code: mod.code },
      suspendedUntil: mod.suspendedUntil
    });
  }

  const result = await postStore.createPost({
    user: req.user,
    text,
    imageUrl: img,
    videoUrl,
    link
  });
  if (result.error) return res.status(400).json({ success: false, error: { message: result.error } });
  res.json({ success: true, post: result.post });
});

async function applyReportPenalty(userId) {
  const uniqueReports = await postStore.countUserReports(userId);
  if (uniqueReports < 4) return null;
  const until = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
  await collections.users.doc(userId).update({
    suspendedUntil: until,
    reportCount: uniqueReports,
    updatedAt: new Date().toISOString()
  });
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

router.get('/groups', verifyAuth, async (req, res) => {
  res.json({ success: true, groups: await postStore.listGroups() });
});

router.get('/groups/:id/messages', verifyAuth, async (req, res) => {
  res.json({ success: true, messages: await postStore.getGroupMessages(req.params.id) });
});

router.post('/groups/:id/messages', verifyAuth, async (req, res) => {
  const { text, imageData, imageUrl } = req.body || {};
  const img = imageUrl || imageData;
  if (!text?.trim() && !img) return res.status(400).json({ success: false, error: { message: 'Message required' } });
  if (postStore.hasLink(text) && !req.user.isAdmin) {
    return res.status(400).json({ success: false, error: { message: 'Links not allowed' } });
  }

  const settings = await postStore.getSettings();
  const mod = await moderateContent({ text: (text || '').trim(), userId: req.userId, settings });
  if (!mod.allowed) {
    return res.status(403).json({
      success: false,
      error: { message: mod.error, code: mod.code },
      suspendedUntil: mod.suspendedUntil
    });
  }

  const result = await postStore.addGroupMessage(req.params.id, {
    userId: req.userId,
    userName: req.user.name,
    text: (text || '').trim(),
    imageUrl: img
  });
  if (result?.error) return res.status(400).json({ success: false, error: { message: result.error } });
  res.json({ success: true, message: result });
});

module.exports = router;
