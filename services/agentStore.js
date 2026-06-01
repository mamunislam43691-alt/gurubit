/**
 * Agent user approvals — Firestore backed
 */

const { db } = require('../config/firebase');

const COLLECTION = 'agentApprovals';

function col() {
  return db.collection(COLLECTION);
}

async function queueApproval({ userId, email, name, agentEmail }) {
  const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const item = {
    id,
    userId,
    email,
    name,
    agentEmail: String(agentEmail || '').toLowerCase(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  await col().doc(id).set(item);
  return item;
}

async function listPending(agentEmail) {
  const snap = await col().get();
  const items = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.status === 'pending') {
      if (!agentEmail || d.agentEmail === String(agentEmail).toLowerCase()) {
        items.push(d);
      }
    }
  });
  return items;
}

async function approve(id) {
  const doc = await col().doc(id).get();
  if (!doc.exists) return null;
  await col().doc(id).update({ status: 'approved', approvedAt: new Date().toISOString() });
  return { ...doc.data(), status: 'approved' };
}

async function reject(id) {
  const doc = await col().doc(id).get();
  if (!doc.exists) return null;
  await col().doc(id).update({ status: 'rejected' });
  return { ...doc.data(), status: 'rejected' };
}

function findAgentByEmail(email) {
  return String(email || '').toLowerCase();
}

module.exports = { queueApproval, listPending, approve, reject, findAgentByEmail };
