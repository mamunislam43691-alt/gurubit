/**
 * Per-user API keys (agents) — MongoDB backed
 */

const crypto = require('crypto');
const { db } = require('../config/db');

const COLLECTION = 'userApiKeys';

function col() {
  return db.collection(COLLECTION);
}

function generateKey() {
  return `gurubit_${crypto.randomBytes(24).toString('hex')}`;
}

async function listForUser(userId) {
  const snap = await col().get();
  const items = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.userId === userId) items.push(d);
  });
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createKey(userId, label) {
  const id = `ukey_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const apiKey = generateKey();
  const entry = {
    id,
    userId,
    label: label || 'API Key',
    apiKey,
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  };
  await col().doc(id).set(entry);
  return entry;
}

async function revokeKey(userId, id) {
  const doc = await col().doc(id).get();
  if (!doc.exists) return false;
  const data = doc.data();
  if (data.userId !== userId) return false;
  await col().doc(id).delete();
  return true;
}

async function findByKey(apiKey) {
  const snap = await col().get();
  let found = null;
  snap.forEach(doc => {
    const d = doc.data();
    if (d.apiKey === apiKey) found = d;
  });
  return found;
}

module.exports = { listForUser, createKey, revokeKey, findByKey };
