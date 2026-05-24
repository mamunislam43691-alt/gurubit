/**
 * Admin staff accounts (in-memory; persists while server runs)
 */

const crypto = require('crypto');

const staff = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function createStaff({ username, password, role, displayName }) {
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
  staff.set(id, entry);
  return sanitize(entry);
}

function sanitize(entry) {
  const { passwordHash, ...rest } = entry;
  return rest;
}

function findByUsername(username) {
  const u = String(username).trim().toLowerCase();
  for (const entry of staff.values()) {
    if (entry.username === u && entry.active) return entry;
  }
  return null;
}

function verifyStaff(username, password) {
  const entry = findByUsername(username);
  if (!entry) return null;
  if (entry.passwordHash !== hashPassword(password)) return null;
  return sanitize(entry);
}

function listStaff() {
  return Array.from(staff.values()).map(sanitize);
}

function deleteStaff(id) {
  return staff.delete(id);
}

function updateStaff(id, patch) {
  const entry = staff.get(id);
  if (!entry) return null;
  if (patch.password) entry.passwordHash = hashPassword(patch.password);
  if (patch.role) entry.role = patch.role;
  if (patch.displayName) entry.displayName = patch.displayName;
  if (typeof patch.active === 'boolean') entry.active = patch.active;
  staff.set(id, entry);
  return sanitize(entry);
}

module.exports = {
  createStaff,
  verifyStaff,
  listStaff,
  deleteStaff,
  updateStaff,
  hashPassword
};
