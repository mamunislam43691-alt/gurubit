/**
 * Live support REST API — all async (Firestore backed)
 */

const express = require('express');
const router = express.Router();
const supportStore = require('../services/supportStore');
const { requireAdmin, getAdminSession } = require('../utils/adminSession');
const { listStaff } = require('../services/adminStaffStore');

const IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i;

router.post('/start', async (req, res) => {
  try {
    const { name, email } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ success: false, error: { message: 'Name and email are required' } });
    }

    const allStaff = await listStaff();
    const supporters = allStaff.filter(s => s.role === 'supporter').map(s => s.username);
    const assignedTo = await supportStore.pickSupporter(supporters);
    const session = await supportStore.createSession({ name, email, assignedTo });
    const welcome = await supportStore.addMessage(session.id, {
      from: 'admin',
      text: "Hi! 👋 Welcome to GURUBIT Support. How can we help you today?"
    });

    const wss = req.app.get('wss');
    if (wss) {
      const updated = await supportStore.getSession(session.id);
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.isSupportAdmin) {
          client.send(JSON.stringify({ type: 'support_session_new', session: updated }));
        }
      });
    }

    res.json({ success: true, session, messages: [welcome] });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.get('/session/:id/messages', async (req, res) => {
  try {
    const session = await supportStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    await supportStore.markRead(req.params.id, 'visitor');
    let messages = await supportStore.getMessages(req.params.id);
    // Ensure welcome message
    const hasWelcome = messages.some(m => m.from === 'admin' && String(m.text || '').toLowerCase().includes('welcome'));
    if (!hasWelcome) {
      await supportStore.addMessage(req.params.id, { from: 'admin', text: 'Hi! 👋 Welcome to GURUBIT Support. How can we help you today?' });
      messages = await supportStore.getMessages(req.params.id);
    }
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.get('/admin/sessions', requireAdmin, async (req, res) => {
  try {
    const session = getAdminSession(req.cookies.admin_session);
    const filter = session?.role === 'supporter' ? session.username : null;
    res.json({ success: true, sessions: await supportStore.listSessions(filter) });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/admin/sessions/:id/transfer', requireAdmin, async (req, res) => {
  try {
    const { toUsername } = req.body || {};
    if (!toUsername) return res.status(400).json({ success: false, error: { message: 'toUsername required' } });
    const updated = await supportStore.transferSession(req.params.id, toUsername);
    if (!updated) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true, session: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.get('/admin/staff-list', requireAdmin, async (req, res) => {
  try {
    const all = await listStaff();
    res.json({ success: true, staff: all.filter(s => s.role === 'supporter') });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.get('/admin/sessions/:id/messages', requireAdmin, async (req, res) => {
  try {
    const session = await supportStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    await supportStore.markRead(req.params.id, 'admin');
    res.json({ success: true, session, messages: await supportStore.getMessages(req.params.id) });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/session/:id/message', async (req, res) => {
  try {
    const { text, imageData } = req.body || {};
    const session = await supportStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    if (imageData && !IMAGE_RE.test(String(imageData))) {
      return res.status(400).json({ success: false, error: { message: 'Invalid image' } });
    }
    const msg = await supportStore.addMessage(req.params.id, { from: 'visitor', text: text || '', imageUrl: imageData || null });
    if (!msg) return res.status(400).json({ success: false, error: { message: 'Empty message' } });
    const wss = req.app.get('wss');
    const updated = await supportStore.getSession(req.params.id);
    if (wss?.broadcastSupport) {
      wss.broadcastSupport({ type: 'support_message', sessionId: req.params.id, message: msg, session: updated });
    }
    res.json({ success: true, message: msg });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.post('/admin/sessions/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { text, imageData } = req.body || {};
    if (!text?.trim() && !imageData) return res.status(400).json({ success: false, error: { message: 'Message is required' } });
    if (imageData && !IMAGE_RE.test(String(imageData))) return res.status(400).json({ success: false, error: { message: 'Invalid image' } });
    const session = await supportStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    const msg = await supportStore.addMessage(req.params.id, { from: 'admin', text: text || '', imageUrl: imageData || null });
    const updated = await supportStore.getSession(req.params.id);
    const wss = req.app.get('wss');
    if (wss?.broadcastSupport) {
      wss.broadcastSupport({ type: 'support_message', sessionId: req.params.id, message: msg, session: updated });
    }
    res.json({ success: true, message: msg });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.delete('/admin/sessions/:id/messages/:msgId', requireAdmin, async (req, res) => {
  try {
    const ok = await supportStore.deleteMessage(req.params.id, req.params.msgId);
    if (!ok) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.delete('/session/:id/messages/:msgId', (req, res) => {
  res.status(403).json({ success: false, error: { message: 'Visitors cannot delete messages' } });
});

module.exports = router;
