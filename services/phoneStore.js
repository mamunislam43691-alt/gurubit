/**
 * Local Phone Number & SMS Store
 * Replaces Firestore collections.phoneNumbers and collections.smsMessages
 * All data stored in data/phone-store.json — never in Firebase.
 */

const fs   = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'phone-store.json');

// In-memory state
let _numbers  = new Map(); // numberId → numberData
let _messages = new Map(); // messageId → messageData

// ── Persistence ───────────────────────────────────────────────────────────────

function _load() {
  try {
    if (!fs.existsSync(STORE_FILE)) { _save(); return; }
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    _numbers.clear();
    (raw.numbers || []).forEach(n => { if (n && n.id) _numbers.set(n.id, n); });
    _messages.clear();
    (raw.messages || []).forEach(m => { if (m && m.id) _messages.set(m.id, m); });
  } catch (e) {
    console.error('[PhoneStore] Load error:', e.message);
  }
}

function _save() {
  // Write asynchronously — never block the event loop
  setImmediate(() => {
    try {
      const dir = path.dirname(STORE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        numbers:  Array.from(_numbers.values()),
        messages: Array.from(_messages.values())
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[PhoneStore] Save error:', e.message);
    }
  });
}

// Load on startup
_load();

// Auto-cleanup: remove entries older than 24 hours, runs every 10 minutes
setInterval(() => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let changed = false;
  for (const [id, n] of _numbers) {
    const t = n.createdAt || n.allocatedAt || '';
    if (t && t < cutoff) { _numbers.delete(id); changed = true; }
  }
  for (const [id, m] of _messages) {
    const t = m.receivedAt || m.createdAt || '';
    if (t && t < cutoff) { _messages.delete(id); changed = true; }
  }
  if (changed) {
    _save();
    console.log('[PhoneStore] 🧹 Auto-cleanup: removed entries older than 24h');
  }
}, 10 * 60 * 1000);

// ── Firestore-compatible shim ─────────────────────────────────────────────────
// Mimics the Firestore collection API so existing code works unchanged.

function _makeDocRef(map, id) {
  return {
    id,
    get: async () => {
      const data = map.get(id);
      return { exists: !!data, id, data: () => data || null };
    },
    set: async (data, _opts) => {
      map.set(id, { ...data, id });
      _save();
    },
    update: async (updates) => {
      const existing = map.get(id);
      if (!existing) {
        // Create if not exists (some callers update without prior set)
        map.set(id, { id, ...updates });
      } else {
        map.set(id, { ...existing, ...updates });
      }
      _save();
    },
    delete: async () => {
      map.delete(id);
      _save();
    }
  };
}

/**
 * Query builder — supports chaining: where, orderBy, limit, select, get
 */
function _makeQuery(map, filters, orderField, limitN, selectFields) {
  const self = {
    where(field, op, value) {
      return _makeQuery(map, [...filters, { field, op, value }], orderField, limitN, selectFields);
    },
    orderBy(field, _dir) {
      return _makeQuery(map, filters, field, limitN, selectFields);
    },
    limit(n) {
      return _makeQuery(map, filters, orderField, n, selectFields);
    },
    select(...fields) {
      return _makeQuery(map, filters, orderField, limitN, fields);
    },
    async get() {
      let items = Array.from(map.values());

      // Apply filters
      for (const { field, op, value } of filters) {
        items = items.filter(item => {
          const v = item[field];
          if (op === '==')  return v === value;
          if (op === '!=')  return v !== value;
          if (op === '>')   return v > value;
          if (op === '<')   return v < value;
          if (op === '>=')  return v >= value;
          if (op === '<=')  return v <= value;
          if (op === 'in')  return Array.isArray(value) && value.includes(v);
          return true;
        });
      }

      // Order
      if (orderField) {
        items.sort((a, b) => {
          const av = a[orderField] || '';
          const bv = b[orderField] || '';
          return av < bv ? -1 : av > bv ? 1 : 0;
        });
      }

      // Limit
      if (limitN) items = items.slice(0, limitN);

      // Project fields
      if (selectFields && selectFields.length > 0) {
        items = items.map(item => {
          const projected = { id: item.id };
          selectFields.forEach(f => { if (f in item) projected[f] = item[f]; });
          return projected;
        });
      }

      const docs = items.map(item => ({
        id: item.id,
        exists: true,
        data: () => item,
        ref: _makeDocRef(map, item.id)
      }));

      return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
        forEach: (cb) => docs.forEach(cb)
      };
    }
  };
  return self;
}

function _makeCollection(map) {
  return {
    doc: (id) => _makeDocRef(map, id),
    where:   (field, op, value) => _makeQuery(map, [{ field, op, value }], null, null, null),
    orderBy: (field, dir)       => _makeQuery(map, [], field, null, null),
    limit:   (n)                => _makeQuery(map, [], null, n, null),
    select:  (...fields)        => _makeQuery(map, [], null, null, fields),
    get:     ()                 => _makeQuery(map, [], null, null, null).get(),
    add: async (data) => {
      const id = data.id || `auto_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      map.set(id, { ...data, id });
      _save();
      return { id };
    }
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const phoneNumbers = _makeCollection(_numbers);
const smsMessages  = _makeCollection(_messages);

/** Direct helpers used by providerPoll for fast access */
function getPendingNumbers() {
  const now = new Date();
  return Array.from(_numbers.values()).filter(n =>
    n.status === 'pending' && new Date(n.expiresAt) > now
  );
}

function getNumberById(id) {
  return _numbers.get(id) || null;
}

function reload() { _load(); }

module.exports = { phoneNumbers, smsMessages, getPendingNumbers, getNumberById, reload };
