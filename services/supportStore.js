/**
 * In-memory live support conversations (persists while server runs)
 */

const { randomBytes } = require('crypto');

const sessions = new Map();
const messages = new Map();
const visitorSockets = new Map();
const adminSockets = new Set();

function newId(prefix = 's') {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function pickSupporter(staffUsernames = []) {
  const counts = {};
  staffUsernames.forEach((u) => { counts[u] = 0; });
  sessions.forEach((s) => {
    if (s.assignedTo && s.status === 'open') {
      counts[s.assignedTo] = (counts[s.assignedTo] || 0) + 1;
    }
  });
  const keys = Object.keys(counts);
  if (!keys.length) return null;
  return keys.sort((a, b) => counts[a] - counts[b])[0];
}

function createSession({ name, email, assignedTo = null }) {
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
  sessions.set(id, session);
  messages.set(id, []);
  return session;
}

function getSession(id) {
  return sessions.get(id) || null;
}

function listSessions(filterAssignedTo) {
  let list = Array.from(sessions.values());
  if (filterAssignedTo) {
    list = list.filter((s) => s.assignedTo === filterAssignedTo || !s.assignedTo);
  }
  return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function assignSession(sessionId, username) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.assignedTo = username;
  session.updatedAt = new Date().toISOString();
  return session;
}

function transferSession(sessionId, toUsername) {
  return assignSession(sessionId, toUsername);
}

function addMessage(sessionId, { from, text, imageUrl }) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (!text?.trim() && !imageUrl) return null;

  const msg = {
    id: newId('m'),
    sessionId,
    from,
    text: String(text || '').trim(),
    imageUrl: imageUrl || null,
    createdAt: new Date().toISOString()
  };

  const list = messages.get(sessionId) || [];
  list.push(msg);
  messages.set(sessionId, list);

  session.updatedAt = msg.createdAt;
  session.lastMessage = text || (imageUrl ? '[Image]' : '');
  if (from === 'visitor') session.unreadAdmin += 1;
  else session.unreadVisitor += 1;

  return msg;
}

function getMessages(sessionId) {
  return messages.get(sessionId) || [];
}

function markRead(sessionId, forRole) {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (forRole === 'admin') session.unreadAdmin = 0;
  if (forRole === 'visitor') session.unreadVisitor = 0;
}

function registerVisitorSocket(sessionId, ws) {
  visitorSockets.set(sessionId, ws);
}

function removeVisitorSocket(sessionId) {
  visitorSockets.delete(sessionId);
}

function registerAdminSocket(ws) {
  adminSockets.add(ws);
}

function removeAdminSocket(ws) {
  adminSockets.delete(ws);
}

function getVisitorSocket(sessionId) {
  return visitorSockets.get(sessionId);
}

function getAdminSockets() {
  return adminSockets;
}

function deleteMessage(sessionId, messageId) {
  const list = messages.get(sessionId);
  if (!list) return false;
  const i = list.findIndex((m) => m.id === messageId);
  if (i < 0) return false;
  list.splice(i, 1);
  messages.set(sessionId, list);
  return true;
}

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
