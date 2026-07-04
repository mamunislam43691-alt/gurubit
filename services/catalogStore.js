/**
 * Catalog Store — countries/servers/platforms backed by MongoDB.
 * Same public API as before; data now lives in Mongo.
 * Maintains an in-memory cache that is refreshed on startup or when
 * admin mutates a country/server/platform.
 */

const { collections, db } = require('../config/db');

let _countries = new Map();
let _servers = new Map();
let _platforms = new Map();
let _loaded = false;
let _loading = null;

async function _loadFromMongo() {
  const [cs, sv, pl] = await Promise.all([
    collections.countries.get(),
    collections.servers.get(),
    collections.platforms.get()
  ]);
  _countries = new Map();
  _servers = new Map();
  _platforms = new Map();

  cs.forEach((d) => {
    const data = d.data();
    if (!data.id) data.id = d.id;
    _countries.set(d.id, data);
  });
  sv.forEach((d) => {
    const data = d.data();
    if (!data.id) data.id = d.id;
    _servers.set(d.id, data);
  });
  pl.forEach((d) => {
    const data = d.data();
    if (!data.id) data.id = d.id;
    _platforms.set(d.id, data);
  });

  _loaded = true;
}

async function ensureLoaded() {
  if (_loaded) return;
  if (_loading) return _loading;
  _loading = _loadFromMongo().finally(() => { _loading = null; });
  return _loading;
}

async function loadCatalog() {
  await _loadFromMongo();
  return {
    countries: _countries.size,
    servers: _servers.size,
    platforms: _platforms.size
  };
}

function _saveServerImmediate(serverId) {
  const srv = _servers.get(serverId);
  if (!srv) return;
  collections.servers.doc(serverId).set(srv).catch((err) => console.warn('server persist:', err.message));
}

function _saveCountryImmediate(countryId) {
  const c = _countries.get(countryId);
  if (!c) return;
  collections.countries.doc(countryId).set(c).catch((err) => console.warn('country persist:', err.message));
}

function listCountries() {
  return Array.from(_countries.values());
}

function getCountry(id) {
  return _countries.get(id);
}

async function addCountry(data) {
  if (!data || !data.name) throw new Error('Country name is required');
  const id = String(data.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || `country_${Date.now()}`;
  if (_countries.has(id)) throw new Error('Country already exists');
  const country = {
    id,
    name: data.name,
    code: data.code || '',
    flag: data.flag || '',
    iconData: data.iconData || '',
    prefix: data.prefix || '+',
    createdAt: new Date().toISOString()
  };
  _countries.set(id, country);
  await collections.countries.doc(id).set(country);
  return country;
}

async function updateCountry(id, patch) {
  const cur = _countries.get(id);
  if (!cur) throw new Error('Country not found');
  const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
  _countries.set(id, next);
  await collections.countries.doc(id).set(next);
  return next;
}

async function deleteCountry(id) {
  _countries.delete(id);
  // Cascade
  const svSnap = await collections.servers.where('countryId', '==', id).get();
  await Promise.all(svSnap.docs.map((d) => collections.servers.doc(d.id).delete().catch(() => null)));
  const plSnap = await collections.platforms.where('countryId', '==', id).get();
  await Promise.all(plSnap.docs.map((d) => collections.platforms.doc(d.id).delete().catch(() => null)));
  await collections.countries.doc(id).delete().catch(() => null);
}

async function clearCountryData(id) {
  const svSnap = await collections.servers.where('countryId', '==', id).get();
  await Promise.all(svSnap.docs.map(async (d) => {
    const data = d.data();
    if (Array.isArray(data.numbers)) data.numbers = [];
    else if (data.numbers && typeof data.numbers === 'object') data.numbers = {};
    _servers.set(d.id, data);
    return collections.servers.doc(d.id).set(data);
  }));
}

function listServers(countryId = null) {
  const all = Array.from(_servers.values());
  return countryId ? all.filter((s) => s.countryId === countryId) : all;
}

function getServer(id) {
  return _servers.get(id);
}

async function addServer(countryId, data) {
  if (!_countries.has(countryId)) throw new Error('Country not found');
  const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const server = {
    id,
    countryId,
    name: data.name || `Server ${id.slice(-4)}`,
    displayName: data.displayName || data.name || '',
    numbers: data.numbers || [],
    createdAt: new Date().toISOString()
  };
  _servers.set(id, server);
  await collections.servers.doc(id).set(server);
  return server;
}

async function updateServer(id, patch) {
  const cur = _servers.get(id);
  if (!cur) throw new Error('Server not found');
  const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
  _servers.set(id, next);
  await collections.servers.doc(id).set(next);
  return next;
}

async function deleteServer(id) {
  _servers.delete(id);
  await collections.servers.doc(id).delete().catch(() => null);
}

async function clearServerData(id) {
  const srv = _servers.get(id);
  if (!srv) return;
  srv.numbers = [];
  _servers.set(id, srv);
  await collections.servers.doc(id).set(srv);
}

async function addServerNumbers(serverId, rawList) {
  const srv = _servers.get(serverId);
  if (!srv) throw new Error('Server not found');
  const arr = Array.isArray(srv.numbers) ? srv.numbers.slice() : [];
  const incoming = Array.isArray(rawList)
    ? rawList
    : String(rawList || '').split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean);
  arr.push(...incoming);
  srv.numbers = arr;
  _servers.set(serverId, srv);
  _saveServerImmediate(serverId);
  return { added: incoming.length, total: arr.length };
}

async function takeNextPhoneFromServer(serverId, consume = true) {
  // Re-read from Mongo for race-protection
  await _loadFromMongo();
  const srv = _servers.get(serverId);
  if (!srv) return null;
  const arr = Array.isArray(srv.numbers) ? srv.numbers.slice() : [];
  if (arr.length === 0) return null;
  const phone = consume ? arr.shift() : arr[arr.length - 1];
  if (!consume) arr[arr.length - 1] = arr[arr.length - 1];
  srv.numbers = arr;
  _servers.set(serverId, srv);
  _saveServerImmediate(serverId);
  return phone;
}

async function returnNumberToServer(serverId, phone) {
  const srv = _servers.get(serverId);
  if (!srv || !phone) return;
  const arr = Array.isArray(srv.numbers) ? srv.numbers.slice() : [];
  arr.unshift(phone);
  srv.numbers = arr;
  _servers.set(serverId, srv);
  _saveServerImmediate(serverId);
}

function countAvailable(serverId) {
  const srv = _servers.get(serverId);
  if (!srv) return 0;
  return Array.isArray(srv.numbers) ? srv.numbers.length : 0;
}

function listPlatforms(countryId = null) {
  const all = Array.from(_platforms.values());
  return countryId ? all.filter((p) => p.countryId === countryId) : all;
}

async function addPlatform(countryId, data) {
  if (!_countries.has(countryId)) throw new Error('Country not found');
  const id = `plt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const platform = {
    id,
    countryId,
    serverId: data.serverId || null,
    name: data.name || `Platform ${id.slice(-4)}`,
    icon: data.icon || '',
    createdAt: new Date().toISOString()
  };
  _platforms.set(id, platform);
  await collections.platforms.doc(id).set(platform);
  return platform;
}

async function deletePlatform(id) {
  _platforms.delete(id);
  await collections.platforms.doc(id).delete().catch(() => null);
}

async function addNumber(serverId, phoneNumber) {
  const srv = _servers.get(serverId);
  if (!srv) throw new Error('Server not found');
  const arr = Array.isArray(srv.numbers) ? srv.numbers.slice() : [];
  arr.push(phoneNumber);
  srv.numbers = arr;
  _servers.set(serverId, srv);
  await collections.servers.doc(serverId).set(srv);
  return { count: arr.length };
}

function countServices() {
  return _countries.size + _servers.size + _platforms.size;
}

function resolveCountryMeta(countryId) {
  return _countries.get(countryId);
}

function resolveServerName(serverId) {
  const srv = _servers.get(serverId);
  return srv ? srv.name : null;
}

function normalizePhoneInput(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^\d+]/g, '');
}

async function clearAllCatalog() {
  _countries.clear();
  _servers.clear();
  _platforms.clear();
  await Promise.all([
    collections.countries.get().then((snap) =>
      Promise.all(snap.docs.map((d) => collections.countries.doc(d.id).delete().catch(() => null)))
    ),
    collections.servers.get().then((snap) =>
      Promise.all(snap.docs.map((d) => collections.servers.doc(d.id).delete().catch(() => null)))
    ),
    collections.platforms.get().then((snap) =>
      Promise.all(snap.docs.map((d) => collections.platforms.doc(d.id).delete().catch(() => null)))
    )
  ]);
}

// Auto-load on first import (best-effort; non-blocking)
ensureLoaded().catch((err) => console.warn('catalogStore initial load:', err.message));

module.exports = {
  loadCatalog,
  ensureLoaded,
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
  normalizePhoneInput,
  clearAllCatalog
};
