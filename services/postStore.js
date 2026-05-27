/**
 * Guru social — Firestore-backed posts, groups, follows, reports
 */

const { collections } = require('../config/firebase');

const SETTINGS_DOC = 'config';
const LINK_RE = /https?:\/\/|www\.|\.com\/|\.net\/|\.org\/|t\.me\/|bit\.ly/i;
const IMAGE_RE = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i;
const MAX_IMAGE_LEN = 2_500_000;

async function colDocs(col) {
  const snap = await col.get();
  const items = [];
  snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
  return items;
}

function isAdminUser(u) {
  return !!(u?.isAdmin || u?.role === 'super_admin');
}

function hasLink(text) {
  return LINK_RE.test(String(text || ''));
}

function validateImage(imageUrl) {
  if (!imageUrl) return { ok: true, imageUrl: null };
  const s = String(imageUrl);
  if (!IMAGE_RE.test(s)) return { error: 'Invalid image format. Use JPEG, PNG, GIF, or WebP.' };
  if (s.length > MAX_IMAGE_LEN) return { error: 'Image too large (max ~2MB).' };
  return { ok: true, imageUrl: s };
}

async function ensureDefaultGroup() {
  try {
    const ref = collections.guruGroups.doc('main');
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        id: 'main',
        name: 'GURUBIT Community',
        memberCount: 0,
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    const msg = String(err.message || '');
    if (!msg.includes('RESOURCE_EXHAUSTED') && !msg.includes('Quota exceeded')) {
      console.warn('[postStore] ensureDefaultGroup error:', err.message);
    }
    // Silently ignore quota errors — group will be created on next successful call
  }
}

async function listPosts({ forUserId } = {}) {
  await ensureDefaultGroup();
  let list;
  try {
    list = (await colDocs(collections.guruPosts)).filter((p) => !p.deleted);
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
      return []; // Return empty on quota error — don't crash
    }
    throw err;
  }
  if (forUserId) list = list.filter((p) => p.userId === forUserId);
  list.sort((a, b) => {
    if (a.isPromoted && !b.isPromoted) return -1;
    if (!a.isPromoted && b.isPromoted) return 1;
    if (a.isAdminPinned && !b.isAdminPinned) return -1;
    if (!a.isAdminPinned && b.isAdminPinned) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return list;
}

async function getPost(id) {
  const doc = await collections.guruPosts.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function savePost(post) {
  await collections.guruPosts.doc(post.id).set(post);
  return post;
}

async function createPost({ user, text, imageUrl, videoUrl, link, isAdminPost, isAdminPinned }) {
  const admin = isAdminUser(user) || isAdminPost;
  if (!admin && hasLink(text)) {
    return { error: 'Links are not allowed in posts. Only admins can post links.' };
  }
  if (!admin && videoUrl) {
    return { error: 'Only admins can post videos.' };
  }
  const imgCheck = validateImage(imageUrl);
  if (imgCheck.error) return { error: imgCheck.error };

  if (!text?.trim() && !imgCheck.imageUrl && !videoUrl && !link) {
    return { error: 'Post cannot be empty' };
  }

  const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Sanitize all fields — no undefined values allowed in Firestore
  const post = {
    id,
    userId: user.id || '',
    userName: user.name || 'User',
    userEmail: user.email || '',
    isAdmin: admin === true,           // always boolean, never undefined
    isAgent: user.isAgent === true,    // always boolean
    blueVerified: user.blueVerified === true, // always boolean
    text: String(text || '').trim(),
    imageUrl: imgCheck.imageUrl || null,
    videoUrl: (admin && videoUrl) ? videoUrl : null,
    link: (admin && link) ? link : null,
    isPromoted: false,
    isAdminPinned: (!!isAdminPinned && admin) === true,
    reportCount: 0,
    likes: 0,
    views: 0,
    createdAt: new Date().toISOString(),
    deleted: false
  };
  await savePost(post);
  return { post };
}

async function updatePost(id, patch) {
  const ref = collections.guruPosts.doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.update({ ...patch, updatedAt: new Date().toISOString() });
  return getPost(id);
}

async function deletePost(id) {
  const ref = collections.guruPosts.doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.update({ deleted: true, deletedAt: new Date().toISOString() });
  return true;
}

async function promotePost(id) {
  const all = await colDocs(collections.guruPosts);
  await Promise.all(
    all.filter((p) => p.isPromoted && p.id !== id).map((p) =>
      collections.guruPosts.doc(p.id).update({ isPromoted: false })
    )
  );
  const ref = collections.guruPosts.doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.update({ isPromoted: true });
  const sRef = collections.guruSettings.doc(SETTINGS_DOC);
  const sDoc = await sRef.get();
  const pin = { pinnedPostId: id, updatedAt: new Date().toISOString() };
  if (sDoc.exists) await sRef.update(pin);
  else await sRef.set({ ...pin, aiEnabled: false, aiApiKey: '' });
  return getPost(id);
}

async function reportPost(postId, reporterId) {
  const p = await getPost(postId);
  if (!p) return null;
  const dup = (await colDocs(collections.guruReports)).some(
    (r) => r.postId === postId && r.reporterId === reporterId
  );
  if (!dup) {
    await collections.guruReports.add({
      postId,
      userId: p.userId,
      reporterId,
      at: new Date().toISOString()
    });
  }
  await collections.guruPosts.doc(postId).update({
    reportCount: (p.reportCount || 0) + 1
  });
  return { ...p, reportCount: (p.reportCount || 0) + 1 };
}

async function reportUser(userId, reporterId) {
  const dup = (await colDocs(collections.guruReports)).some(
    (r) => r.userId === userId && r.reporterId === reporterId && !r.postId
  );
  if (!dup) {
    await collections.guruReports.add({
      userId,
      reporterId,
      at: new Date().toISOString()
    });
  }
  return countUserReports(userId);
}

async function countUserReports(userId) {
  const reporters = new Set(
    (await colDocs(collections.guruReports))
      .filter((r) => r.userId === userId)
      .map((r) => r.reporterId)
  );
  return reporters.size;
}

async function toggleFollow(followerId, followingId) {
  const id = `${followerId}_${followingId}`;
  const ref = collections.guruFollows.doc(id);
  const doc = await ref.get();
  if (doc.exists) {
    await ref.delete();
    return { following: false };
  }
  await ref.set({
    followerId,
    followingId,
    createdAt: new Date().toISOString()
  });
  return { following: true };
}

async function isFollowing(followerId, followingId) {
  const doc = await collections.guruFollows.doc(`${followerId}_${followingId}`).get();
  return doc.exists;
}

async function listGroups() {
  await ensureDefaultGroup();
  const groups = await colDocs(collections.guruGroups);
  const messages = await colDocs(collections.guruGroupMessages);
  const recent = Date.now() - 15 * 60 * 1000;

  return groups.map((g) => {
    const msgs = messages.filter((m) => m.groupId === g.id);
    const active = new Set(
      msgs.filter((m) => new Date(m.createdAt).getTime() > recent).map((m) => m.userId)
    );
    return {
      ...g,
      messageCount: msgs.length,
      activeCount: active.size,
      inactiveCount: Math.max(0, (g.memberCount || 0) - active.size)
    };
  });
}

async function addGroupMessage(groupId, { userId, userName, text, imageUrl }) {
  const id = `gm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const imgCheck = validateImage(imageUrl);
  if (imgCheck.error) return { error: imgCheck.error };
  const msg = {
    id,
    groupId,
    userId,
    userName,
    text: String(text || '').trim(),
    imageUrl: imgCheck.imageUrl,
    createdAt: new Date().toISOString()
  };
  await collections.guruGroupMessages.doc(id).set(msg);
  return msg;
}

async function getGroupMessages(groupId) {
  const all = await colDocs(collections.guruGroupMessages);
  return all
    .filter((m) => m.groupId === groupId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-500);
}

async function getSettings() {
  const doc = await collections.guruSettings.doc(SETTINGS_DOC).get();
  const data = doc.exists ? doc.data() : {};
  return {
    aiApiKey: data.aiApiKey || '',
    aiEnabled: !!data.aiEnabled,
    aiApiUrl: data.aiApiUrl || '',
    aiModel: data.aiModel || '',
    pinnedPostId: data.pinnedPostId || null,
    aiApiKeySet: !!(data.aiApiKey)
  };
}

async function setSettings(data) {
  const patch = { updatedAt: new Date().toISOString() };
  if (data.aiApiKey !== undefined && data.aiApiKey !== '') patch.aiApiKey = data.aiApiKey;
  if (data.aiEnabled !== undefined) patch.aiEnabled = !!data.aiEnabled;
  if (data.aiApiUrl !== undefined) patch.aiApiUrl = data.aiApiUrl;
  if (data.aiModel !== undefined) patch.aiModel = data.aiModel;
  const sRef = collections.guruSettings.doc(SETTINGS_DOC);
  const sDoc = await sRef.get();
  if (sDoc.exists) await sRef.update(patch);
  else await sRef.set({ aiEnabled: false, aiApiKey: '', pinnedPostId: null, ...patch });
  return getSettings();
}

module.exports = {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  promotePost,
  reportPost,
  reportUser,
  countUserReports,
  toggleFollow,
  isFollowing,
  listGroups,
  addGroupMessage,
  getGroupMessages,
  getSettings,
  setSettings,
  hasLink,
  validateImage
};
