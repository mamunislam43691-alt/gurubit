/**
 * Live support conversations — Firestore backed
 * WebSocket socket references remain in-memory (they can't be stored in DB)
 */

const { randomBytes } = require('crypto');
const { db } = require('../config/firebase');

const SESSIONS_COL = 'supportSessions';
const MESSAGES_COL = 'supportMessages';

// Socket references stay in-memory (not serializable)
const visitorSockets = new Map();
const adminSockets = new Set();

function sessionsCol() { return db.collection(SESSIONS_COL); }
function messagesCol() { return db.collection(MESSAGES_COL); }

function newId(prefix = 's') {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

async function pickSupporter(staffUsernames = []) {
  const snap = await sessionsCol().get();
  const counts = {};
  staffUsernames.forEach(u => { counts[u] = 0; });
  snap.forEach(doc => {
    const s = doc.data();
    if (s.assignedTo && s.status === 'open') {
      counts[s.assignedTo] = (counts[s.assignedTo] || 0) + 1;
    }
  });
  const keys = Object.keys(counts);
  if (!keys.length) return null;
  return keys.sort((a, b) => counts[a] - counts[b])[0];
}

async function createSession({ name, email, assignedTo = null }) {
  const id = newId('chat');
  const session = {
    id,
    visitorName: name || 'Guest',
    visitorEmail: email || '',
    status: 'open',
    assignedTo: assignedTo || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unreadAdmin: 0,
    unreadVisitor: 0,
    lastMessage: ''
  };
  await sessionsCol().doc(id).set(session);
  return session;
}

async function getSession(id) {
  const doc = await sessionsCol().doc(id).get();
  return doc.exists ? doc.data() : null;
}

async function listSessions(filterAssignedTo) {
  const snap = await sessionsCol().get();
  const items = [];
  snap.forEach(doc => {
    const s = doc.data();
    if (!filterAssignedTo || s.assignedTo === filterAssignedTo || !s.assignedTo) {
      items.push(s);
    }
  });
  return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function assignSession(sessionId, username) {
  const doc = await sessionsCol().doc(sessionId).get();
  if (!doc.exists) return null;
  await sessionsCol().doc(sessionId).update({
    assignedTo: username,
    updatedAt: new Date().toISOString()
  });
  return { ...doc.data(), assignedTo: username };
}

async function transferSession(sessionId, toUsername) {
  return assignSession(sessionId, toUsername);
}

async function addMessage(sessionId, { from, text, imageUrl }) {
  const sessionDoc = await sessionsCol().doc(sessionId).get();
  if (!sessionDoc.exists) return null;
  if (!text?.trim() && !imageUrl) return null;

  const msg = {
    id: newId('m'),
    sessionId,
    from,
    text: String(text || '').trim(),
    imageUrl: imageUrl || null,
    createdAt: new Date().toISOString()
  };

  await messagesCol().doc(msg.id).set(msg);

  const session = sessionDoc.data();
  const update = {
    updatedAt: msg.createdAt,
    lastMessage: text || (imageUrl ? '[Image]' : ''),
    unreadAdmin: (session.unreadAdmin || 0) + (from === 'visitor' ? 1 : 0),
    unreadVisitor: (session.unreadVisitor || 0) + (from !== 'visitor' ? 1 : 0)
  };
  await sessionsCol().doc(sessionId).update(update);

  return msg;
}

async function getMessages(sessionId) {
  const snap = await messagesCol().get();
  const items = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.sessionId === sessionId) items.push(d);
  });
  return items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function markRead(sessionId, forRole) {
  const update = {};
  if (forRole === 'admin') update.unreadAdmin = 0;
  if (forRole === 'visitor') update.unreadVisitor = 0;
  if (Object.keys(update).length) {
    await sessionsCol().doc(sessionId).update(update);
  }
}

async function deleteMessage(sessionId, messageId) {
  const doc = await messagesCol().doc(messageId).get();
  if (!doc.exists) return false;
  await messagesCol().doc(messageId).delete();
  return true;
}

// Socket helpers (in-memory only — sockets can't be stored in DB)
function registerVisitorSocket(sessionId, ws) { visitorSockets.set(sessionId, ws); }
function removeVisitorSocket(sessionId) { visitorSockets.delete(sessionId); }
function registerAdminSocket(ws) { adminSockets.add(ws); }
function removeAdminSocket(ws) { adminSockets.delete(ws); }
function getVisitorSocket(sessionId) { return visitorSockets.get(sessionId); }
function getAdminSockets() { return adminSockets; }

module.exports = {
  pickSupporter,
  createSession,
  getSession,
  listSessions,
  assignSession,
  transferSession,
  addMessage,
  getMessages,
  markRead,
  registerVisitorSocket,
  removeVisitorSocket,
  registerAdminSocket,
  removeAdminSocket,
  getVisitorSocket,
  getAdminSockets,
  deleteMessage
};
