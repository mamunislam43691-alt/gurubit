/**
 * Broadcast messages — Firestore backed
 */

const { randomBytes } = require('crypto');
const { db } = require('../config/firebase');

const COLLECTION = 'broadcasts';

function col() {
  return db.collection(COLLECTION);
}

async function createBroadcast({ title, message, createdBy }) {
  const id = `bc_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const item = {
    id,
    title: title.trim(),
    message: message.trim(),
    createdBy: createdBy || 'admin',
    createdAt: new Date().toISOString(),
    status: 'sent'
  };
  await col().doc(id).set(item);
  return item;
}

async function listBroadcasts() {
  const snap = await col().get();
  const items = [];
  snap.forEach(doc => items.push(doc.data()));
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { createBroadcast, listBroadcasts };
