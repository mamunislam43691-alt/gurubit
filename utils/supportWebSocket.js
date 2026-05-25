/**
 * WebSocket handlers for live support — async (Firestore backed)
 */

const supportStore = require('../services/supportStore');
const { isAdminSessionValid } = require('./adminSession');

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('=') || '');
  });
  return out;
}

function broadcastToAdmins(wss, payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.isSupportAdmin) {
      client.send(JSON.stringify(payload));
    }
  });
}

function sendToVisitor(sessionId, payload) {
  const ws = supportStore.getVisitorSocket(sessionId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

async function handleSupportMessage(wss, ws, data) {
  try {
    switch (data.type) {

      case 'support_visitor_join': {
        const session = await supportStore.getSession(data.sessionId);
        if (!session) return;
        ws.supportSessionId = data.sessionId;
        ws.isSupportVisitor = true;
        supportStore.registerVisitorSocket(data.sessionId, ws);
        ws.send(JSON.stringify({ type: 'support_joined', sessionId: data.sessionId }));
        break;
      }

      case 'support_send': {
        const sessionId = data.sessionId || ws.supportSessionId;
        const text = (data.text || '').trim();
        const imageUrl = data.imageUrl || null;
        if (!sessionId || (!text && !imageUrl)) return;

        const session = await supportStore.getSession(sessionId);
        if (!session) return;

        const from = ws.isSupportAdmin ? 'admin' : 'visitor';
        const msg = await supportStore.addMessage(sessionId, { from, text, imageUrl });
        const updated = await supportStore.getSession(sessionId);

        const payload = { type: 'support_message', sessionId, message: msg, session: updated };
        sendToVisitor(sessionId, payload);
        broadcastToAdmins(wss, payload);
        break;
      }

      case 'support_admin_join': {
        const cookies = parseCookies(ws._cookies);
        if (!isAdminSessionValid(cookies.admin_session)) {
          ws.send(JSON.stringify({ type: 'support_error', message: 'Admin not authenticated' }));
          return;
        }
        ws.isSupportAdmin = true;
        supportStore.registerAdminSocket(ws);
        const sessions = await supportStore.listSessions();
        ws.send(JSON.stringify({ type: 'support_admin_ready', sessions }));
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Support WS error:', err.message);
  }
}

function onSupportDisconnect(ws) {
  if (ws.supportSessionId) supportStore.removeVisitorSocket(ws.supportSessionId);
  if (ws.isSupportAdmin) supportStore.removeAdminSocket(ws);
}

module.exports = { handleSupportMessage, onSupportDisconnect, broadcastToAdmins };
