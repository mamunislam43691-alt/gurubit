/**
 * Countries, servers, phone inventory — persisted to data/catalog.json
 */

const fs = require('fs');
const path = require('path');

const CATALOG_FILE = path.join(__dirname, '..', 'data', 'catalog.json');
const LEGACY_SEED_IDS = new Set(['bd', 'in', 'us', 'uk', 'ca']);

const countries = new Map();
const servers = new Map();
const platforms = new Map();
const numbers = new Map();

function persistCatalog() {
  try {
    const dir = path.dirname(CATALOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      countries: Array.from(countries.entries()),
      servers: Array.from(servers.entries()).map(([id, s]) => [
        id,
        { ...s, numbers: [...(s.numbers || [])] }
      ]),
      platforms: Array.from(platforms.entries())
    };
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('catalog persist failed:', e.message);
  }
}

function rebuildNumberIndex() {
  numbers.clear();
  for (const [serverId, s] of servers) {
    (s.numbers || []).forEach((phoneNumber) => {
      const id = `inv_${serverId}_${String(phoneNumber).replace(/\D/g, '')}`;
      numbers.set(id, { id, serverId, countryId: s.countryId, phoneNumber });
    });
  }
}

function purgeLegacySeedCountries() {
  let changed = false;
  for (const id of [...countries.keys()]) {
    if (LEGACY_SEED_IDS.has(id)) {
      countries.delete(id);
      changed = true;
    }
  }
  for (const [sid, s] of [...servers.entries()]) {
    if (LEGACY_SEED_IDS.has(s.countryId)) {
      servers.delete(sid);
      changed = true;
    }
  }
  for (const [pid, p] of [...platforms.entries()]) {
    if (LEGACY_SEED_IDS.has(p.countryId)) {
      platforms.delete(pid);
      changed = true;
    }
  }
  if (changed) {
    rebuildNumberIndex();
    persistCatalog();
  }
  return changed;
}

function loadCatalog() {
  countries.clear();
  servers.clear();
  platforms.clear();
  numbers.clear();

  if (!fs.existsSync(CATALOG_FILE)) {
    persistCatalog();
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    (raw.countries || []).forEach(([id, c]) => {
      if (LEGACY_SEED_IDS.has(id)) return;
      countries.set(id, c);
    });
    (raw.servers || []).forEach(([id, s]) => {
      if (LEGACY_SEED_IDS.has(s.countryId)) return;
      servers.set(id, { ...s, numbers: [...(s.numbers || [])] });
    });
    (raw.platforms || []).forEach(([id, p]) => {
      if (LEGACY_SEED_IDS.has(p.countryId)) return;
      platforms.set(id, p);
    });
    rebuildNumberIndex();
    purgeLegacySeedCountries();
  } catch (e) {
    console.error('catalog load failed:', e.message);
  }
}

function clearAllCatalog() {
  countries.clear();
  servers.clear();
  platforms.clear();
  numbers.clear();
  persistCatalog();
}

function normalizePhoneInput(raw) {
  return String(raw || '').trim().replace(/\s+/g, '');
}

function listCountries() {
  return Array.from(countries.values());
}

function getCountry(id) {
  return countries.get(id) || null;
}

function addCountry(data) {
  const id = (data.id || data.name || '').toLowerCase().replace(/\s+/g, '_').slice(0, 24);
  if (!id || !data.name) return null;
  const entry = {
    id,
    name: data.name,
    code: data.code || '',
    flag: data.iconData ? null : (data.flag || '🌍'),
    iconData: data.iconData || null
  };
  countries.set(id, entry);
  persistCatalog();
  return entry;
}

function updateCountry(id, data) {
  const c = countries.get(id);
  if (!c) return null;
  if (data.name) c.name = data.name;
  if (data.code) c.code = data.code;
  if (data.iconData) {
    c.iconData = data.iconData;
    c.flag = null;
  } else if (data.flag) {
    c.flag = data.flag;
    c.iconData = null;
  }
  persistCatalog();
  return c;
}

function deleteCountry(id) {
  if (!countries.delete(id)) return false;
  for (const [sid, s] of servers) {
    if (s.countryId === id) {
      clearServerData(sid);
      servers.delete(sid);
    }
  }
  for (const [pid, p] of platforms) {
    if (p.countryId === id) platforms.delete(pid);
  }
  persistCatalog();
  return true;
}

function clearCountryData(countryId) {
  const list = listServers(countryId);
  list.forEach((s) => clearServerData(s.id));
  list.forEach((s) => servers.delete(s.id));
  persistCatalog();
  return true;
}

function listServers(countryId) {
  return Array.from(servers.values())
    .filter((s) => s.countryId === countryId)
    .map((s) => ({ ...s, numbers: [...(s.numbers || [])] }));
}

function getServer(id) {
  const s = servers.get(id);
  if (!s) return null;
  return { ...s, numbers: [...(s.numbers || [])] };
}

function addServer(countryId, data) {
  const id = data.id || `srv_${countryId}_${Date.now()}`;
  const entry = {
    id,
    name: data.name || 'Server',
    countryId,
    numbers: [],
    availableNumbers: 0
  };
  servers.set(id, entry);
  persistCatalog();
  return entry;
}

function updateServer(id, data) {
  const s = servers.get(id);
  if (!s) return null;
  if (data.name !== undefined) s.name = data.name;
  if (data.providerId !== undefined) s.providerId = data.providerId || null;
  if (data.apiServiceCode !== undefined) s.apiServiceCode = data.apiServiceCode || '';
  if (data.apiCountryCode !== undefined) s.apiCountryCode = data.apiCountryCode || '';
  persistCatalog();
  return { ...s, numbers: [...(s.numbers || [])] };
}

function deleteServer(id) {
  clearServerData(id);
  const ok = servers.delete(id);
  if (ok) persistCatalog();
  return ok;
}

function clearServerData(serverId) {
  const s = servers.get(serverId);
  if (!s) return false;
  s.numbers = [];
  rebuildNumberIndex();
  persistCatalog();
  return true;
}

function addServerNumbers(serverId, raw) {
  const s = servers.get(serverId);
  if (!s) return null;
  if (!s.numbers) s.numbers = [];
  const lines = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(/[\n,;]+/)
        .map((x) => normalizePhoneInput(x))
        .filter(Boolean);
  const added = [];
  lines.forEach((phoneNumber) => {
    if (s.numbers.includes(phoneNumber)) return;
    s.numbers.push(phoneNumber);
    added.push(phoneNumber);
  });
  rebuildNumberIndex();
  persistCatalog();
  return { server: { ...s, numbers: [...s.numbers] }, added };
}

/**
 * Take next available number from server pool.
 * Always consumes (removes) the number from the pool — one-time use.
 * Numbers are returned to the pool when the session expires or OTP is received.
 */
function takeNextPhoneFromServer(serverId, consume = true) {
  const s = servers.get(serverId);
  if (!s || !s.numbers?.length) return null;
  // Always remove from pool — number is returned later via returnNumberToServer
  const phoneNumber = s.numbers.shift();
  rebuildNumberIndex();
  persistCatalog();
  return phoneNumber;
}

/**
 * Return a phone number back to the server pool (after session ends).
 * Adds to the end of the pool so it can be reused.
 */
function returnNumberToServer(serverId, phoneNumber) {
  const s = servers.get(serverId);
  if (!s || !phoneNumber) return false;
  if (!s.numbers) s.numbers = [];
  const normalized = normalizePhoneInput(phoneNumber);
  // Don't add duplicates
  if (s.numbers.includes(normalized)) return false;
  s.numbers.push(normalized);
  rebuildNumberIndex();
  persistCatalog();
  return true;
}

function countAvailable(serverId) {
  const s = servers.get(serverId);
  return s?.numbers?.length || 0;
}

function listPlatforms(countryId) {
  return Array.from(platforms.values()).filter((p) => p.countryId === countryId);
}

function addPlatform(countryId, data) {
  const serverId = data.serverId || listServers(countryId)[0]?.id;
  if (!serverId) return null;
  const id = data.id || `plat_${Date.now()}`;
  const entry = { id, name: data.name, serverId, countryId, numbers: data.numbers || [] };
  platforms.set(id, entry);
  persistCatalog();
  return entry;
}

function deletePlatform(id) {
  const ok = platforms.delete(id);
  if (ok) persistCatalog();
  return ok;
}

function addNumber(platformId, phoneNumber) {
  const plat = platforms.get(platformId);
  if (!plat) return null;
  const id = `num_${Date.now()}`;
  const entry = { id, platformId, phoneNumber, countryId: plat.countryId, serverId: plat.serverId };
  numbers.set(id, entry);
  if (!plat.numbers) plat.numbers = [];
  plat.numbers.push(phoneNumber);
  persistCatalog();
  return entry;
}

function countServices() {
  return servers.size;
}

function resolveCountryMeta(countryId) {
  const c = countries.get(String(countryId).toLowerCase()) ||
    Array.from(countries.values()).find(
      (x) => x.id === countryId || x.name?.toLowerCase() === String(countryId).toLowerCase()
    );
  return c || { id: countryId, name: String(countryId).toUpperCase(), flag: '🌍', code: '' };
}

function resolveServerName(serverId) {
  const s = servers.get(serverId);
  return s?.name || serverId;
}

loadCatalog();

module.exports = {
  clearAllCatalog,
  loadCatalog,
  persistCatalog,
  listCountries,
  getCountry,
  addCountry,
  updateCountry,
  deleteCountry,
  clearCountryData,
  listServers,
  getServer,
  addServer,
  updateServer,
  deleteServer,
  clearServerData,
  addServerNumbers,
  takeNextPhoneFromServer,
  returnNumberToServer,
  countAvailable,
  listPlatforms,
  addPlatform,
  deletePlatform,
  addNumber,
  countServices,
  resolveCountryMeta,
  resolveServerName,
  normalizePhoneInput
};
