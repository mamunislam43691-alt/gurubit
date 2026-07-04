/**
 * SMS provider config — MongoDB backed with in-memory cache
 * Cache is refreshed on every write and periodically
 */

const { db } = require('../config/db');

const COLLECTION = 'smsProviders';
let _cache = [];
let _cacheLoaded = false;

function col() {
  return db.collection(COLLECTION);
}

async function _refreshCache() {
  const snap = await col().get();
  const items = [];
  snap.forEach(doc => items.push(doc.data()));
  _cache = items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  _cacheLoaded = true;
  return _cache;
}

// Load cache on startup
async function load() {
  await _refreshCache();
}

// Sync list — uses cache (call load() first on startup)
function list() {
  return [..._cache];
}

// Async list — always fresh from MongoDB
async function listAsync() {
  return _refreshCache();
}

function getPrimary() {
  return _cache[0] || null;
}

function findByApiKey(apiKey) {
  const k = String(apiKey || '').trim();
  return _cache.find(p => p.apiKey === k) || null;
}

async function add({ serviceName, baseUrl, getNumberUrl, getSmsUrl, controlUrl, apiKey, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange }) {
  const type = providerType || 'sms_only';
  const entry = {
    id: `prov_${Date.now()}`,
    serviceName: serviceName || 'Provider',
    baseUrl: String(baseUrl || '').trim(),
    getNumberUrl: String(getNumberUrl || '').trim(),
    getSmsUrl: String(getSmsUrl || '').trim(),
    controlUrl: String(controlUrl || '').trim(),
    additionalUrls: type === 'integrated' ? [] : (Array.isArray(additionalUrls) ? additionalUrls.map(u => String(u || '').trim()).filter(Boolean) : []),
    apiKey: String(apiKey || '').trim(),
    providerType: type,
    countryId: countryId || null,
    serverId: serverId || null,
    apiCountryCode: String(apiCountryCode || '').trim(),
    cliRange: cliRange ? String(cliRange).trim() : null,
    createdAt: new Date().toISOString()
  };
  await col().doc(entry.id).set(entry);
  await _refreshCache();
  return entry;
}

async function update(id, { serviceName, baseUrl, getNumberUrl, getSmsUrl, controlUrl, apiKey, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange }) {
  const doc = await col().doc(id).get();
  if (!doc.exists) return null;
  const p = { ...doc.data() };
  if (serviceName !== undefined) p.serviceName = serviceName || 'Provider';
  if (baseUrl !== undefined) p.baseUrl = String(baseUrl || '').trim();
  if (getNumberUrl !== undefined) p.getNumberUrl = String(getNumberUrl || '').trim();
  if (getSmsUrl !== undefined) p.getSmsUrl = String(getSmsUrl || '').trim();
  if (controlUrl !== undefined) p.controlUrl = String(controlUrl || '').trim();
  if (apiKey !== undefined) p.apiKey = String(apiKey || '').trim();
  if (providerType !== undefined) p.providerType = providerType || 'sms_only';
  const type = p.providerType;
  if (type === 'integrated') {
    p.additionalUrls = [];
  } else if (additionalUrls !== undefined) {
    p.additionalUrls = Array.isArray(additionalUrls) ? additionalUrls.map(u => String(u || '').trim()).filter(Boolean) : [];
  }
  if (countryId !== undefined) p.countryId = countryId || null;
  if (serverId !== undefined) p.serverId = serverId || null;
  if (apiCountryCode !== undefined) p.apiCountryCode = String(apiCountryCode || '').trim();
  if (cliRange !== undefined) p.cliRange = cliRange ? String(cliRange).trim() : null;
  p.updatedAt = new Date().toISOString();
  await col().doc(id).set(p);
  await _refreshCache();
  return p;
}

async function remove(id) {
  await col().doc(id).delete();
  await _refreshCache();
  return true;
}

module.exports = { load, list, listAsync, getPrimary, findByApiKey, add, update, remove };
