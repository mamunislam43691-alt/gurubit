/**
 * Countries, servers, phone inventory — Firestore backed with in-memory cache
 * Cache refreshed on every write for sync compatibility
 */

const { db } = require('../config/firebase');

const C_COUNTRIES = 'catalogCountries';
const C_SERVERS   = 'catalogServers';
const C_PLATFORMS = 'catalogPlatforms';

// In-memory caches
let _countries = new Map();
let _servers   = new Map();
let _platforms = new Map();

function countriesCol()  { return db.collection(C_COUNTRIES); }
function serversCol()    { return db.collection(C_SERVERS); }
function platformsCol()  { return db.collection(C_PLATFORMS); }

async function _loadAll() {
  const [cs, ss, ps] = await Promise.all([
    countriesCol().get(),
    serversCol().get(),
    platformsCol().get()
  ]);
  _countries.clear(); cs.forEach(d => _countries.set(d.id, d.data()));
  _servers.clear();   ss.forEach(d => _servers.set(d.id, d.data()));
  _platforms.clear(); ps.forEach(d => _platforms.set(d.id, d.data()));
}

function normalizePhoneInput(raw) {
  return String(raw || '').trim().replace(/\s+/g, '');
}

// ── Startup load ──────────────────────────────────────────────────────────────
async function loadCatalog() { await _loadAll(); }
async function persistCatalog() { /* no-op: Firestore is source of truth */ }

// ── Countries — sync (cache) + async (Firestore) ──────────────────────────────
function listCountries() { return Array.from(_countries.values()); }
function getCountry(id) { return _countries.get(id) || null; }

async function addCountry(data) {
  const id = (data.id || data.name || '').toLowerCase().replace(/\s+/g, '_').slice(0, 24);
  if (!id || !data.name) return null;
  const entry = { id, name: data.name, code: data.code || '', flag: data.iconData ? null : (data.flag || '🌍'), iconData: data.iconData || null };
  await countriesCol().doc(id).set(entry);
  _countries.set(id, entry);
  return entry;
}

async function updateCountry(id, data) {
  const c = _countries.get(id);
  if (!c) return null;
  if (data.name) c.name = data.name;
  if (data.code) c.code = data.code;
  if (data.iconData) { c.iconData = data.iconData; c.flag = null; }
  else if (data.flag) { c.flag = data.flag; c.iconData = null; }
  await countriesCol().doc(id).set(c);
  _countries.set(id, c);
  return c;
}

async function deleteCountry(id) {
  await countriesCol().doc(id).delete();
  _countries.delete(id);
  const srvs = listServers(id);
  await Promise.all(srvs.map(s => deleteServer(s.id)));
  for (const [pid, p] of _platforms) {
    if (p.countryId === id) { await platformsCol().doc(pid).delete(); _platforms.delete(pid); }
  }
  return true;
}

async function clearCountryData(countryId) {
  const srvs = listServers(countryId);
  await Promise.all(srvs.map(s => clearServerData(s.id)));
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
  await serversCol().doc(id).set(entry);
  _servers.set(id, entry);
  return entry;
}

async function updateServer(id, data) {
  const s = _servers.get(id);
  if (!s) return null;
  if (data.name !== undefined) s.name = data.name;
  if (data.providerId !== undefined) s.providerId = data.providerId || null;
  if (data.apiServiceCode !== undefined) s.apiServiceCode = data.apiServiceCode || '';
  if (data.apiCountryCode !== undefined) s.apiCountryCode = data.apiCountryCode || '';
  await serversCol().doc(id).set(s);
  _servers.set(id, s);
  return { ...s, numbers: [...(s.numbers || [])] };
}

async function deleteServer(id) {
  await serversCol().doc(id).delete();
  _servers.delete(id);
  return true;
}

async function clearServerData(serverId) {
  const s = _servers.get(serverId);
  if (!s) return false;
  s.numbers = []; s.availableNumbers = 0;
  await serversCol().doc(serverId).set(s);
  _servers.set(serverId, s);
  return true;
}

async function addServerNumbers(serverId, raw) {
  // Always reload from Firestore first to avoid overwriting with stale cache
  try {
    const doc = await serversCol().doc(serverId).get();
    if (doc.exists) {
      const fresh = doc.data();
      _servers.set(serverId, fresh);
    }
  } catch (_) {}

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
  await serversCol().doc(serverId).set(s);
  _servers.set(serverId, s);
  console.log(`[CatalogStore] Added ${added.length} numbers to server "${s.name}" (${serverId}). Total: ${s.numbers.length}`);
  return { server: { ...s, numbers: [...s.numbers] }, added };
}

async function takeNextPhoneFromServer(serverId, consume = true) {
  // Always reload from Firestore to get latest numbers (avoids stale cache)
  try {
    const doc = await serversCol().doc(serverId).get();
    if (doc.exists) {
      const fresh = doc.data();
      _servers.set(serverId, fresh);
    }
  } catch (_) {}

  const s = _servers.get(serverId);
  if (!s || !s.numbers?.length) return null;

  if (!consume) {
    // Rotate: return first number without removing it
    const phoneNumber = s.numbers[0];
    // Move to end for round-robin
    s.numbers.push(s.numbers.shift());
    s.availableNumbers = s.numbers.length;
    await serversCol().doc(serverId).set(s);
    _servers.set(serverId, s);
    return phoneNumber;
  }

  const phoneNumber = s.numbers.shift();
  s.availableNumbers = s.numbers.length;
  await serversCol().doc(serverId).set(s);
  _servers.set(serverId, s);
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
  await serversCol().doc(serverId).set(s);
  _servers.set(serverId, s);
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
  await platformsCol().doc(id).set(entry);
  _platforms.set(id, entry);
  return entry;
}

async function deletePlatform(id) {
  await platformsCol().doc(id).delete();
  _platforms.delete(id);
  return true;
}

async function addNumber(platformId, phoneNumber) {
  const plat = _platforms.get(platformId);
  if (!plat) return null;
  const id = `num_${Date.now()}`;
  if (!plat.numbers) plat.numbers = [];
  plat.numbers.push(phoneNumber);
  await platformsCol().doc(platformId).set(plat);
  _platforms.set(platformId, plat);
  return { id, platformId, phoneNumber, countryId: plat.countryId, serverId: plat.serverId };
}

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
  const [cs, ss, ps] = await Promise.all([countriesCol().get(), serversCol().get(), platformsCol().get()]);
  await Promise.all([
    ...cs.docs.map(d => d.ref.delete()),
    ...ss.docs.map(d => d.ref.delete()),
    ...ps.docs.map(d => d.ref.delete())
  ]);
  _countries.clear(); _servers.clear(); _platforms.clear();
}

// Async versions for routes that need fresh data
async function listCountriesAsync() { await _loadAll(); return listCountries(); }
async function listServersAsync(countryId) { await _loadAll(); return listServers(countryId); }

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
