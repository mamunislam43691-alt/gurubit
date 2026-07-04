/**
 * Guest Store — backed by MongoDB.
 * Uses a TTL index on `createdAt` (24 hours) so expired guests are removed automatically.
 */

const { collections } = require('../config/db');
const crypto = require('crypto');

function genId() {
  return `guest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function create(uid = null) {
  const id = uid || genId();
  const doc = {
    _id: id,
    id,
    uid: id,
    name: 'Guest User',
    email: `${id}@guest.local`,
    isGuest: true,
    createdAt: new Date(),
    lastSeenAt: new Date()
  };
  try {
    await collections.guests.doc(id).set(doc);
  } catch (err) {
    console.warn('guestStore.create error:', err.message);
  }
  return doc;
}

async function get(uid) {
  if (!uid) return null;
  try {
    const doc = await collections.guests.doc(uid).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.isBanned) return null;
    return data;
  } catch (err) {
    return null;
  }
}

async function exists(uid) {
  if (!uid) return false;
  try {
    const doc = await collections.guests.doc(uid).get();
    return !!doc.exists;
  } catch (_) {
    return false;
  }
}

async function remove(uid) {
  if (!uid) return;
  try {
    await collections.guests.doc(uid).delete();
  } catch (_) {}
}

async function update(uid, patch) {
  if (!uid) return;
  try {
    await collections.guests.doc(uid).update({ ...patch, lastSeenAt: new Date() });
  } catch (_) {}
}

module.exports = { create, get, exists, remove, update };
