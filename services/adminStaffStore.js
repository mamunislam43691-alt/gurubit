/**
 * Admin staff accounts — Firestore backed
 */

const crypto = require('crypto');
const { db } = require('../config/firebase');

const COLLECTION = 'adminStaff';

function col() { return db.collection(COLLECTION); }

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function sanitize(entry) {
  const { passwordHash, ...rest } = entry;
  return rest;
}

async function _getAll() {
  const snap = await col().get();
  const items = [];
  snap.forEach(doc => items.push(doc.data()));
  return items;
}

async function createStaff({ username, password, role, displayName }) {
  const id = `staff_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const entry = {
    id,
    username: String(username).trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role,
    displayName: displayName || username,
    createdAt: new Date().toISOString(),
    active: true
  };
  await col().doc(id).set(entry);
  return sanitize(entry);
}

async function verifyStaff(username, password) {
  const u = String(username).trim().toLowerCase();
  const all = await _getAll();
  const entry = all.find(s => s.username === u && s.active);
  if (!entry) return null;
  if (entry.passwordHash !== hashPassword(password)) return null;
  return sanitize(entry);
}

async function listStaff() {
  const all = await _getAll();
  return all.map(sanitize);
}

async function deleteStaff(id) {
  await col().doc(id).delete();
  return true;
}

async function updateStaff(id, patch) {
  const doc = await col().doc(id).get();
  if (!doc.exists) return null;
  const entry = doc.data();
  const update = {};
  if (patch.password) update.passwordHash = hashPassword(patch.password);
  if (patch.role) update.role = patch.role;
  if (patch.displayName) update.displayName = patch.displayName;
  if (typeof patch.active === 'boolean') update.active = patch.active;
  await col().doc(id).update(update);
  return sanitize({ ...entry, ...update });
}

module.exports = { createStaff, verifyStaff, listStaff, deleteStaff, updateStaff, hashPassword };
