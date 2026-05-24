/**
 * Live support REST API
 */

const express = require('express');
const router = express.Router();
const {
  createSession,
  getSession,
  listSessions,
  addMessage,
  getMessages,
  markRead,
  pickSupporter,
  transferSession,
  assignSession,
  deleteMessage
} = require('../services/supportStore');
const { requireAdmin, getAdminSession } = require('../utils/adminSession');
const { listStaff } = require('../services/adminStaffStore');

const IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i;

router.post('/start', (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({
      success: false,
      error: { message: 'Name and email are required' }
    });
  }

  const supporters = listStaff().filter((s) => s.role === 'supporter').map((s) => s.username);
  const assignedTo = pickSupporter(supporters);
  const session = createSession({ name, email, assignedTo });
  const welcome = addMessage(session.id, {
    from: 'admin',
    text: "Hi! 👋 Welcome to GURUBIT Support. How can we help you today?"
  });

  const wss = req.app.get('wss');
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.isSupportAdmin) {
        client.send(JSON.stringify({
          type: 'support_session_new',
          session: getSession(session.id)
        }));
      }
    });
  }

  res.json({
    success: true,
    session,
    messages: [welcome]
  });
});

function ensureWelcomeMessage(sessionId) {
  const msgs = getMessages(sessionId);
  const hasWelcome = msgs.some(
    (m) => m.from === 'admin' && String(m.text || '').toLowerCase().includes('welcome')
  );
  if (!hasWelcome) {
    addMessage(sessionId, {
      from: 'admin',
      text: 'Hi! 👋 Welcome to GURUBIT Support. How can we help you today?'
    });
  }
  return getMessages(sessionId);
}

router.get('/session/:id/messages', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: { message: 'Session not found' } });
  }
  markRead(req.params.id, 'visitor');
  res.json({ success: true, messages: ensureWelcomeMessage(req.params.id) });
});

router.get('/admin/sessions', requireAdmin, (req, res) => {
  const session = getAdminSession(req.cookies.admin_session);
  const filter = session?.role === 'supporter' ? session.username : null;
  res.json({ success: true, sessions: listSessions(filter) });
});

router.post('/admin/sessions/:id/transfer', requireAdmin, (req, res) => {
  const { toUsername } = req.body || {};
  if (!toUsername) {
    return res.status(400).json({ success: false, error: { message: 'toUsername required' } });
  }
  const updated = transferSession(req.params.id, toUsername);
  if (!updated) return res.status(404).json({ success: false, error: { message: 'Not found' } });
  res.json({ success: true, session: updated });
});

router.get('/admin/staff-list', requireAdmin, (req, res) => {
  res.json({ success: true, staff: listStaff().filter((s) => s.role === 'supporter') });
});

router.get('/admin/sessions/:id/messages', requireAdmin, (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: { message: 'Session not found' } });
  }
  markRead(req.params.id, 'admin');
  res.json({ success: true, session, messages: getMessages(req.params.id) });
});

router.post('/session/:id/message', (req, res) => {
  const { text, imageData } = req.body || {};
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: { message: 'Not found' } });
  if (imageData && !IMAGE_RE.test(String(imageData))) {
    return res.status(400).json({ success: false, error: { message: 'Invalid image' } });
  }
  const msg = addMessage(req.params.id, { from: 'visitor', text: text || '', imageUrl: imageData || null });
  if (!msg) return res.status(400).json({ success: false, error: { message: 'Empty message' } });
  const wss = req.app.get('wss');
  if (wss?.broadcastSupport) {
    wss.broadcastSupport({ type: 'support_message', sessionId: req.params.id, message: msg, session: getSession(req.params.id) });
  }
  res.json({ success: true, message: msg });
});

router.delete('/session/:id/messages/:msgId', (req, res) => {
  return res.status(403).json({
    success: false,
    error: { message: 'Visitors cannot delete messages' }
  });
});

router.post('/admin/sessions/:id/reply', requireAdmin, (req, res) => {
  const { text, imageData } = req.body || {};
  if (!text?.trim() && !imageData) {
    return res.status(400).json({ success: false, error: { message: 'Message is required' } });
  }
  if (imageData && !IMAGE_RE.test(String(imageData))) {
    return res.status(400).json({ success: false, error: { message: 'Invalid image' } });
  }

  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: { message: 'Session not found' } });
  }

  const msg = addMessage(req.params.id, { from: 'admin', text: text || '', imageUrl: imageData || null });
  const wss = req.app.get('wss');
  if (wss?.broadcastSupport) {
    wss.broadcastSupport({
      type: 'support_message',
      sessionId: req.params.id,
      message: msg,
      session: getSession(req.params.id)
    });
  }

  res.json({ success: true, message: msg });
});

router.delete('/admin/sessions/:id/messages/:msgId', requireAdmin, (req, res) => {
  if (!deleteMessage(req.params.id, req.params.msgId)) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }
  res.json({ success: true });
});

module.exports = router;
