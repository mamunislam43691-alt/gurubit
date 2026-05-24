/**
 * Per-user API keys (agents) for external site access
 */

const crypto = require('crypto');
const keys = new Map();

function generateKey() {
  return `gurubit_${crypto.randomBytes(24).toString('hex')}`;
}

function listForUser(userId) {
  return Array.from(keys.values()).filter((k) => k.userId === userId);
}

function createKey(userId, label) {
  const id = `ukey_${Date.now()}`;
  const apiKey = generateKey();
  const entry = {
    id,
    userId,
    label: label || 'API Key',
    apiKey,
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  };
  keys.set(id, entry);
  return entry;
}

function revokeKey(userId, id) {
  const k = keys.get(id);
  if (!k || k.userId !== userId) return false;
  keys.delete(id);
  return true;
}

function findByKey(apiKey) {
  return Array.from(keys.values()).find((k) => k.apiKey === apiKey) || null;
}

module.exports = { listForUser, createKey, revokeKey, findByKey };
