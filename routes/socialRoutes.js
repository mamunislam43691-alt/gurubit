/**
 * Guru social — feed, groups, follow, reports, AI moderation
 * All data stored in MongoDB — no in-memory stores
 */

const express = require('express');
const router = express.Router();
const { collections, db } = require('../config/db');
const postStore = require('../services/postStore');
const { moderateContent } = require('../services/aiModeration');
const { verifyToken } = require('../services/authService');

// User session cache — avoids repeated Mongo reads per request
const _userCache = new Map(); // uid → { user, expiresAt }
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedUser(uid) {
  const cached = _userCache.get(uid);
  if (cached && Date.now() < cached.expiresAt) return cached.user;
  try {
    const doc = await collections.users.doc(uid).get();
    if (!doc.exists) return null;
    const user = { ...doc.data(), id: uid };
    _userCache.set(uid, { user, expiresAt: Date.now() + USER_CACHE_TTL });
    return user;
  } catch (_) {
    if (cached) return cached.user; // return stale on error
    return null;
  }
}

const ANN_COL        = 'announcements';
const GROUP_MEM_COL  = 'groupMembers';   // doc id: groupId_userId
const GROUP_BAN_COL  = 'groupBans';      // doc id: groupId_userId

async function verifyAuth(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    if (String(token).startsWith('guest.')) {
      const guestUid = String(token).replace('guest.', '');
      const guestStore = require('../services/guestStore');
      const guestData = await guestStore.get(guestUid);
      if (!guestData) return res.status(401).json({ success: false, error: { message: 'Guest session expired' } });
      req.userId = guestUid;
      req.user = { id: guestUid, ...guestData };
      if (req.user.isBanned) return res.status(403).json({ success: false, error: { message: 'Account banned' } });
      return next();
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.uid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid session' } });
    }
    req.userId = decoded.uid;
    const user = await getCachedUser(decoded.uid);
    if (!user) return res.status(401).json({ success: false, error: { message: 'User not found' } });
    req.user = user;
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
  // Get all liked post IDs for this user in one query
  let likedIds = new Set();
  try {
    const likesSnap = await db.collection('guruLikes').get();
    likesSnap.forEach(doc => {
      const d = doc.data();
      if (d.userId === req.userId) likedIds.add(d.postId);
    });
  } catch (_) {}

  const withFollow = await Promise.all(
    posts.map(async (p) => ({
      ...p,
      _liked: likedIds.has(p.id),
      following: await postStore.isFollowing(req.userId, p.userId)
    }))
  );
  res.json({ success: true, posts: withFollow });
});

// ── View count — increment when user views a post (once per user) ─────────────
router.post('/posts/:id/view', verifyAuth, async (req, res) => {
  try {
    // Check if this user already viewed this post
    const viewRef = db.collection('guruViews').doc(`${req.params.id}_${req.userId}`);
    const viewDoc = await viewRef.get();
    if (viewDoc.exists) return res.json({ success: true, alreadyViewed: true }); // don't count again

    // Mark as viewed
    await viewRef.set({ postId: req.params.id, userId: req.userId, viewedAt: new Date().toISOString() });

    // Increment view count
    const ref = collections.guruPosts.doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.json({ success: false });
    const current = doc.data().views || 0;
    await ref.update({ views: current + 1 });
    res.json({ success: true, views: current + 1 });
  } catch (e) {
    res.json({ success: true }); // non-critical
  }
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

  const result = await postStore.createPost({ user: { ...req.user, profilePhotoUrl: req.user.profilePhotoUrl || null }, text, imageUrl: img, videoUrl, link });
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

// ── Likes ─────────────────────────────────────────────────────────────────────

router.post('/posts/:id/like', verifyAuth, async (req, res) => {
  try {
    const ref = collections.guruPosts.doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false });

    const likeRef = db.collection('guruLikes').doc(`${req.params.id}_${req.userId}`);
    const likeDoc = await likeRef.get();

    if (likeDoc.exists) {
      // Unlike
      await likeRef.delete();
      const current = doc.data().likes || 0;
      const newCount = Math.max(0, current - 1);
      await ref.update({ likes: newCount });
      return res.json({ success: true, liked: false, likes: newCount });
    } else {
      // Like
      await likeRef.set({ postId: req.params.id, userId: req.userId, createdAt: new Date().toISOString() });
      const current = doc.data().likes || 0;
      const newCount = current + 1;
      await ref.update({ likes: newCount });
      return res.json({ success: true, liked: true, likes: newCount });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

// Check if current user liked a post
router.get('/posts/:id/liked', verifyAuth, async (req, res) => {
  try {
    const likeRef = db.collection('guruLikes').doc(`${req.params.id}_${req.userId}`);
    const doc = await likeRef.get();
    res.json({ success: true, liked: doc.exists });
  } catch (e) {
    res.json({ success: true, liked: false });
  }
});

// ── Comments ──────────────────────────────────────────────────────────────────

router.get('/posts/:id/comments', verifyAuth, async (req, res) => {
  try {
    const snap = await db.collection('guruComments')
      .where('postId', '==', req.params.id)
      .get();
    const comments = [];
    snap.forEach(d => comments.push(d.data()));
    comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.json({ success: true, comments });
  } catch (e) {
    res.json({ success: true, comments: [] });
  }
});

router.post('/posts/:id/comments', verifyAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ success: false, error: { message: 'Comment required' } });
    if (postStore.hasLink(text) && !req.user.isAdmin) {
      return res.status(400).json({ success: false, error: { message: 'Links not allowed in comments' } });
    }
    const id = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const comment = {
      id, postId: req.params.id,
      userId: req.userId, userName: req.user.name || 'User',
      text: text.trim(), createdAt: new Date().toISOString()
    };
    await db.collection('guruComments').doc(id).set(comment);
    // Increment comment count on post
    const postRef = collections.guruPosts.doc(req.params.id);
    const postDoc = await postRef.get();
    if (postDoc.exists) {
      await postRef.update({ commentCount: (postDoc.data().commentCount || 0) + 1 });
    }
    res.json({ success: true, comment });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
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
  postStore.invalidateGroupsCache();
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
  postStore.invalidateGroupsCache();
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
  postStore.invalidateGroupsCache();
  res.json({ success: true });
});

router.post('/groups/:id/leave', verifyAuth, async (req, res) => {
  const gid = req.params.id;
  await db.collection(GROUP_MEM_COL).doc(`${gid}_${req.userId}`).delete();
  const snap = await db.collection(GROUP_MEM_COL).get();
  const count = snap.docs.filter(d => d.data().groupId === gid).length;
  await collections.guruGroups.doc(gid).update({ memberCount: Math.max(0, count) }).catch(() => {});
  postStore.invalidateGroupsCache();
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
  postStore.invalidateGroupsCache();
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
    // Auto-ban from group in MongoDB
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

// ── Announcements / News Feed — MongoDB backed ─────────────────────────────

const ANN_FS = () => db.collection(ANN_COL);

// GET all announcements (public — no auth needed)
router.get('/announcements', async (req, res) => {
  try {
    const snap = await ANN_FS().get();
    const items = [];
    snap.forEach(doc => items.push(doc.data()));
    items.sort((a, b) => {
      // Pinned first, then by date
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    res.json({ success: true, announcements: items });
  } catch (e) {
    res.json({ success: true, announcements: [] });
  }
});

// POST create announcement/news (admin only)
router.post('/announcements', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });

  const {
    title, body, imageData, imageUrl,
    videoUrl,                    // YouTube or direct video URL
    linkUrl, linkLabel,          // CTA button
    buttonText, buttonUrl,       // Alias for linkLabel/linkUrl
    type,                        // 'announcement' | 'news' | 'update' | 'alert'
    pinned,                      // boolean — pin to top
    expiresAt                    // optional expiry ISO string
  } = req.body || {};

  if (!title?.trim()) return res.status(400).json({ success: false, error: { message: 'Title required' } });

  const img = imageData || imageUrl || null;
  if (img && img.length > 2_500_000) {
    return res.status(400).json({ success: false, error: { message: 'Image too large (max ~2MB)' } });
  }

  // Extract YouTube video ID if YouTube URL
  let embedVideoUrl = null;
  if (videoUrl) {
    const ytMatch = String(videoUrl).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    embedVideoUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : videoUrl.trim();
  }

  const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ann = {
    id,
    type: type || 'announcement',
    title: title.trim(),
    body: (body || '').trim(),
    imageUrl: img || null,
    videoUrl: embedVideoUrl || null,
    linkUrl: buttonUrl?.trim() || linkUrl?.trim() || null,
    linkLabel: buttonText?.trim() || linkLabel?.trim() || null,
    pinned: pinned === true || pinned === 'true',
    expiresAt: expiresAt || null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: req.userId
  };
  await ANN_FS().doc(id).set(ann);

  // Broadcast to connected users via WebSocket
  try {
    const wss = req.app.get('wss');
    if (wss?.broadcast) {
      wss.broadcast({ type: 'new_announcement', announcement: ann });
    }
  } catch (_) {}

  res.json({ success: true, announcement: ann });
});

// PUT update announcement (admin only)
router.put('/announcements/:id', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  const doc = await ANN_FS().doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ success: false, error: { message: 'Not found' } });

  const existing = doc.data();
  const {
    title, body, imageData, imageUrl,
    videoUrl, linkUrl, linkLabel, buttonText, buttonUrl,
    type, pinned, expiresAt, active
  } = req.body || {};

  let embedVideoUrl = existing.videoUrl;
  if (videoUrl !== undefined) {
    if (videoUrl) {
      const ytMatch = String(videoUrl).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      embedVideoUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : videoUrl.trim();
    } else {
      embedVideoUrl = null;
    }
  }

  const updated = {
    ...existing,
    title:    title?.trim() || existing.title,
    body:     body !== undefined ? (body || '').trim() : existing.body,
    imageUrl: imageData || imageUrl || existing.imageUrl,
    videoUrl: embedVideoUrl,
    linkUrl:  buttonUrl?.trim() || linkUrl?.trim() || existing.linkUrl,
    linkLabel: buttonText?.trim() || linkLabel?.trim() || existing.linkLabel,
    type:     type || existing.type,
    pinned:   pinned !== undefined ? (pinned === true || pinned === 'true') : existing.pinned,
    expiresAt: expiresAt !== undefined ? expiresAt : existing.expiresAt,
    active:   active !== undefined ? !!active : existing.active,
    updatedAt: new Date().toISOString()
  };

  await ANN_FS().doc(req.params.id).set(updated);
  res.json({ success: true, announcement: updated });
});

// DELETE announcement (admin only)
router.delete('/announcements/:id', verifyAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, error: { message: 'Admin only' } });
  await ANN_FS().doc(req.params.id).delete();
  res.json({ success: true });
});

// ── Public ads endpoint (for PostFeed) ───────────────────────────────────────

router.get('/ads', async (req, res) => {
  try {
    const doc = await db.collection('guruSettings').doc('ads').get();
    if (!doc.exists) return res.json({ success: true, ads: null });
    const ads = doc.data();
    if (!ads.enabled) return res.json({ success: true, ads: null });
    // Return only safe fields — no admin metadata
    res.json({
      success: true,
      ads: {
        enabled: ads.enabled,
        frequency: ads.frequency || 5,
        label: ads.label || 'Sponsored',
        items: (ads.items || []).map(item => ({
          title: item.title || '',
          description: item.description || '',
          linkUrl: item.linkUrl || '',
          imageUrl: item.imageUrl || null
        }))
      }
    });
  } catch (e) {
    res.json({ success: true, ads: null });
  }
});

module.exports = router;
