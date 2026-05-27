/**
 * Guest User Store — local JSON only, never Firebase
 * Guest sessions expire after 24 hours and are auto-cleaned.
 */

const fs   = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'guest-store.json');

let _guests = new Map(); // uid → guestData

// ── Persistence ───────────────────────────────────────────────────────────────

function _load() {
  try {
    if (!fs.existsSync(STORE_FILE)) { _save(); return; }
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    _guests.clear();
    (raw.guests || []).forEach(g => { if (g && g.id) _guests.set(g.id, g); });
    _cleanup(); // remove expired on load
  } catch (e) {
    console.error('[GuestStore] Load error:', e.message);
  }
}

function _save() {
  setImmediate(() => {
    try {
      const dir = path.dirname(STORE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify({ guests: Array.from(_guests.values()) }, null, 2), 'utf8');
    } catch (e) {
      console.error('[GuestStore] Save error:', e.message);
    }
  });
}

function _cleanup() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let changed = false;
  for (const [id, g] of _guests) {
    if ((g.createdAt || '') < cutoff) { _guests.delete(id); changed = true; }
  }
  if (changed) _save();
}

// Load on startup
_load();

// Auto-cleanup every 30 minutes
setInterval(() => { _cleanup(); }, 30 * 60 * 1000);

// ── Public API ────────────────────────────────────────────────────────────────

function create(uid) {
  const guest = {
    id: uid,
    name: 'Guest User',
    email: `${uid}@guest.local`,
    phone: '', telegram: '', cryptoAddress: '', referralEmail: '',
    earningsBalance: 0, totalOtps: 0, failedOtps: 0,
    isBanned: false, isAdmin: false, isGuest: true,
    agentApproved: true, profileComplete: true, emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  _guests.set(uid, guest);
  _save();
  return guest;
}

function get(uid) {
  return _guests.get(uid) || null;
}

function exists(uid) {
  return _guests.has(uid);
}

function remove(uid) {
  _guests.delete(uid);
  _save();
}

function update(uid, patch) {
  const g = _guests.get(uid);
  if (!g) return null;
  const updated = { ...g, ...patch, updatedAt: new Date().toISOString() };
  _guests.set(uid, updated);
  _save();
  return updated;
}

module.exports = { create, get, exists, remove, update };
