/**
 * Countries, servers, phone inventory — LOCAL JSON backed with in-memory cache
 * Numbers are stored ONLY in data/catalog.json — NOT in Firebase/Firestore.
 * Firestore is NOT used for catalog data (countries, servers, platforms, numbers).
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_FILE = path.join(__dirname, '..', 'data', 'catalog.json');

// In-memory caches
let _countries = new Map();
let _servers   = new Map();
let _platforms = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhoneInput(raw) {
  return String(raw || '').trim().replace(/\s+/g, '');
}

/** Read catalog.json from disk into memory */
function _loadFromLocalJson() {
  try {
    if (!fs.existsSync(CATALOG_FILE)) {
      // Create empty catalog file if it doesn't exist
      _saveToLocalJson();
      return;
    }
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));

    _countries.clear();
    if (Array.isArray(raw.countries)) {
      raw.countries.forEach(([id, data]) => {
        if (id && data) _countries.set(id, data);
      });
    }

    _servers.clear();
    if (Array.isArray(raw.servers)) {
      raw.servers.forEach(([id, data]) => {
        if (id && data) {
          data.numbers = Array.isArray(data.numbers)
            ? data.numbers.filter(n => n && typeof n === 'string' && n.trim().length > 0)
            : [];
          data.availableNumbers = data.numbers.length;
          _servers.set(id, data);
        }
      });
    }

    _platforms.clear();
    if (Array.isArray(raw.platforms)) {
      raw.platforms.forEach(([id, data]) => {
        if (id && data) _platforms.set(id, data);
      });
    }

    const totalNums = Array.from(_servers.values()).reduce((a, s) => a + (s.numbers?.length || 0), 0);
    console.log(`[CatalogStore] ✅ Loaded from local JSON: ${_countries.size} countries, ${_servers.size} servers, ${totalNums} numbers`);
  } catch (e) {
    console.error('[CatalogStore] Failed to load catalog.json:', e.message);
  }
}

/** Write current in-memory state to catalog.json */
function _saveToLocalJson() {
  // Write asynchronously — never block the event loop
  setImmediate(() => {
    try {
      const data = {
        countries: Array.from(_countries.entries()),
        servers:   Array.from(_servers.entries()),
        platforms: Array.from(_platforms.entries())
      };
      const dir = path.dirname(CATALOG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CATALOG_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[CatalogStore] Failed to save catalog.json:', e.message);
    }
  });
}

// ── Startup load ──────────────────────────────────────────────────────────────

async function loadCatalog() {
  _loadFromLocalJson();
}

// no-op: local JSON is the source of truth
async function persistCatalog() {}

// ── Countries ─────────────────────────────────────────────────────────────────

function listCountries() { return Array.from(_countries.values()); }
function getCountry(id)  { return _countries.get(id) || null; }

async function addCountry(data) {
  const id = (data.id || data.name || '').toLowerCase().replace(/\s+/g, '_').slice(0, 24);
  if (!id || !data.name) return null;
  const entry = {
    id,
    name:     data.name,
    code:     data.code  || '',
    flag:     data.iconData ? null : (data.flag || '🌍'),
    iconData: data.iconData || null
  };
  _countries.set(id, entry);
  _saveToLocalJson();
  return entry;
}

async function updateCountry(id, data) {
  const c = _countries.get(id);
  if (!c) return null;
  if (data.name)     c.name = data.name;
  if (data.code)     c.code = data.code;
  if (data.iconData) { c.iconData = data.iconData; c.flag = null; }
  else if (data.flag) { c.flag = data.flag; c.iconData = null; }
  _countries.set(id, c);
  _saveToLocalJson();
  return c;
}

async function deleteCountry(id) {
  _countries.delete(id);
  const srvs = listServers(id);
  srvs.forEach(s => _servers.delete(s.id));
  for (const [pid, p] of _platforms) {
    if (p.countryId === id) _platforms.delete(pid);
  }
  _saveToLocalJson();
  return true;
}

async function clearCountryData(countryId) {
  const srvs = listServers(countryId);
  srvs.forEach(s => {
    s.numbers = [];
    s.availableNumbers = 0;
    _servers.set(s.id, s);
  });
  _saveToLocalJson();
  return true;
}

// ── Servers ───────────────────────────────────────────────────────────────────

function listServers(countryId) {
  return Array.from(_servers.values()).filter(s => s.countryId === countryId);
}
function getServer(id) { return _servers.get(id) || null; }

async function addServer(countryId, data) {
  const id = data.id || `srv_${countryId}_${Date.now()}`;
  const entry = { id, name: data.name || 'Server', countryId, numbers: [], availableNumbers: 0 };
  _servers.set(id, entry);
  _saveToLocalJson();
  return entry;
}

async function updateServer(id, data) {
  const s = _servers.get(id);
  if (!s) return null;
  if (data.name          !== undefined) s.name          = data.name;
  if (data.providerId    !== undefined) s.providerId    = data.providerId    || null;
  if (data.apiServiceCode !== undefined) s.apiServiceCode = data.apiServiceCode || '';
  if (data.apiCountryCode !== undefined) s.apiCountryCode = data.apiCountryCode || '';
  _servers.set(id, s);
  _saveToLocalJson();
  return { ...s, numbers: [...(s.numbers || [])] };
}

async function deleteServer(id) {
  _servers.delete(id);
  _saveToLocalJson();
  return true;
}

async function clearServerData(serverId) {
  const s = _servers.get(serverId);
  if (!s) return false;
  s.numbers = [];
  s.availableNumbers = 0;
  _servers.set(serverId, s);
  _saveToLocalJson();
  return true;
}

async function addServerNumbers(serverId, raw) {
  const s = _servers.get(serverId);
  if (!s) return null;
  if (!s.numbers) s.numbers = [];

  const lines = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[\n,;]+/).map(x => normalizePhoneInput(x)).filter(Boolean);

  const added = [];
  lines.forEach(phoneNumber => {
    const normalized = normalizePhoneInput(phoneNumber);
    if (normalized && !s.numbers.includes(normalized)) {
      s.numbers.push(normalized);
      added.push(normalized);
    }
  });
  s.availableNumbers = s.numbers.length;
  _servers.set(serverId, s);
  _saveToLocalJson();

  console.log(`[CatalogStore] Added ${added.length} numbers to server "${s.name}" (${serverId}). Total: ${s.availableNumbers}`);
  return { server: { ...s, numbers: [...s.numbers] }, added };
}

async function takeNextPhoneFromServer(serverId, consume = true) {
  // Reload from disk to get latest state (avoids stale in-memory race)
  _loadFromLocalJson();

  const s = _servers.get(serverId);
  if (!s || !s.numbers?.length) return null;

  let phoneNumber;

  if (!consume) {
    // Rotate: return first number without removing it
    phoneNumber = s.numbers[0];
    s.numbers.push(s.numbers.shift());
  } else {
    // Consume: remove from pool permanently
    phoneNumber = s.numbers.shift();
  }

  s.availableNumbers = s.numbers.length;
  _servers.set(serverId, s);
  _saveToLocalJson();

  console.log(`[CatalogStore] ${consume ? 'Consumed' : 'Rotated'} number ${phoneNumber} from server "${s.name}". Remaining: ${s.availableNumbers}`);
  return phoneNumber;
}

async function returnNumberToServer(serverId, phoneNumber) {
  const s = _servers.get(serverId);
  if (!s || !phoneNumber) return false;
  if (!s.numbers) s.numbers = [];
  const normalized = normalizePhoneInput(phoneNumber);
  if (s.numbers.includes(normalized)) return false;
  s.numbers.push(normalized);
  s.availableNumbers = s.numbers.length;
  _servers.set(serverId, s);
  _saveToLocalJson();
  return true;
}

function countAvailable(serverId) {
  const s = _servers.get(serverId);
  return s?.numbers?.length || s?.availableNumbers || 0;
}

// ── Platforms ─────────────────────────────────────────────────────────────────

function listPlatforms(countryId) {
  return Array.from(_platforms.values()).filter(p => p.countryId === countryId);
}

async function addPlatform(countryId, data) {
  const srvs = listServers(countryId);
  const serverId = data.serverId || srvs[0]?.id;
  if (!serverId) return null;
  const id = data.id || `plat_${Date.now()}`;
  const entry = { id, name: data.name, serverId, countryId, numbers: data.numbers || [] };
  _platforms.set(id, entry);
  _saveToLocalJson();
  return entry;
}

async function deletePlatform(id) {
  _platforms.delete(id);
  _saveToLocalJson();
  return true;
}

async function addNumber(platformId, phoneNumber) {
  const plat = _platforms.get(platformId);
  if (!plat) return null;
  const id = `num_${Date.now()}`;
  if (!plat.numbers) plat.numbers = [];
  plat.numbers.push(phoneNumber);
  _platforms.set(platformId, plat);
  _saveToLocalJson();
  return { id, platformId, phoneNumber, countryId: plat.countryId, serverId: plat.serverId };
}

// ── Misc ──────────────────────────────────────────────────────────────────────

function countServices() { return _servers.size; }

function resolveCountryMeta(countryId) {
  const c = _countries.get(String(countryId).toLowerCase())
    || Array.from(_countries.values()).find(x => x.name?.toLowerCase() === String(countryId).toLowerCase());
  return c || { id: countryId, name: String(countryId).toUpperCase(), flag: '🌍', code: '' };
}

function resolveServerName(serverId) {
  return _servers.get(serverId)?.name || serverId;
}

async function clearAllCatalog() {
  _countries.clear();
  _servers.clear();
  _platforms.clear();
  _saveToLocalJson();
}

// Async versions (kept for API compatibility — just return sync results)
async function listCountriesAsync() { _loadFromLocalJson(); return listCountries(); }
async function listServersAsync(countryId) { _loadFromLocalJson(); return listServers(countryId); }

module.exports = {
  clearAllCatalog, loadCatalog, persistCatalog,
  listCountries, listCountriesAsync, getCountry,
  addCountry, updateCountry, deleteCountry, clearCountryData,
  listServers, listServersAsync, getServer,
  addServer, updateServer, deleteServer, clearServerData,
  addServerNumbers, takeNextPhoneFromServer, returnNumberToServer, countAvailable,
  listPlatforms, addPlatform, deletePlatform, addNumber,
  countServices, resolveCountryMeta, resolveServerName, normalizePhoneInput
};
