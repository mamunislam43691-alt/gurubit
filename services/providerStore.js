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

async function add({ serviceName, baseUrl, getNumberUrl, getSmsUrl, controlUrl, apiKey, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange, fbId, services }) {
  const validTypes = ['sms_only', 'integrated'];
  const type = validTypes.includes(providerType) ? providerType : 'sms_only';

  // Normalize services array (for integrated providers)
  let normalizedServices = [];
  if (type === 'integrated') {
    if (Array.isArray(services) && services.length > 0) {
      normalizedServices = services.map((s, i) => ({
        id: `svc_${Date.now()}_${i}`,
        countryId: s.countryId || null,
        serverId: s.serverId || null,
        apiCountryCode: String(s.apiCountryCode || '').trim(),
        cliRange: s.cliRange ? String(s.cliRange).trim() : null,
        label: s.label || ''
      }));
    } else if (countryId || serverId || apiCountryCode || cliRange) {
      // Legacy single-service fallback
      normalizedServices = [{
        id: `svc_${Date.now()}_0`,
        countryId: countryId || null,
        serverId: serverId || null,
        apiCountryCode: String(apiCountryCode || '').trim(),
        cliRange: cliRange ? String(cliRange).trim() : null,
        label: ''
      }];
    }
  }

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
    // Legacy single fields (kept for backward compat)
    countryId: normalizedServices[0]?.countryId || countryId || null,
    serverId: normalizedServices[0]?.serverId || serverId || null,
    apiCountryCode: normalizedServices[0]?.apiCountryCode || String(apiCountryCode || '').trim(),
    cliRange: normalizedServices[0]?.cliRange || (cliRange ? String(cliRange).trim() : null),
    fbId: fbId ? String(fbId).trim() : null,
    // New: multiple services
    services: normalizedServices,
    createdAt: new Date().toISOString()
  };
  await col().doc(entry.id).set(entry);
  await _refreshCache();
  return entry;
}

async function update(id, { serviceName, baseUrl, getNumberUrl, getSmsUrl, controlUrl, apiKey, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange, fbId, services }) {
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
    // Update services array
    if (Array.isArray(services)) {
      p.services = services.map((s, i) => ({
        id: s.id || `svc_${Date.now()}_${i}`,
        countryId: s.countryId || null,
        serverId: s.serverId || null,
        apiCountryCode: String(s.apiCountryCode || '').trim(),
        cliRange: s.cliRange ? String(s.cliRange).trim() : null,
        label: s.label || ''
      }));
    } else if (countryId !== undefined || serverId !== undefined || apiCountryCode !== undefined || cliRange !== undefined) {
      // Legacy single-service update — merge into services[0]
      const existing = Array.isArray(p.services) && p.services.length > 0 ? [...p.services] : [{ id: `svc_${Date.now()}_0` }];
      existing[0] = {
        ...existing[0],
        countryId: countryId !== undefined ? (countryId || null) : existing[0].countryId,
        serverId: serverId !== undefined ? (serverId || null) : existing[0].serverId,
        apiCountryCode: apiCountryCode !== undefined ? String(apiCountryCode || '').trim() : existing[0].apiCountryCode,
        cliRange: cliRange !== undefined ? (cliRange ? String(cliRange).trim() : null) : existing[0].cliRange,
      };
      p.services = existing;
    }
    // Sync legacy single fields from first service
    if (Array.isArray(p.services) && p.services.length > 0) {
      p.countryId = p.services[0].countryId;
      p.serverId = p.services[0].serverId;
      p.apiCountryCode = p.services[0].apiCountryCode;
      p.cliRange = p.services[0].cliRange;
    }
  } else if (additionalUrls !== undefined) {
    p.additionalUrls = Array.isArray(additionalUrls) ? additionalUrls.map(u => String(u || '').trim()).filter(Boolean) : [];
  }
  if (countryId !== undefined && type !== 'integrated') p.countryId = countryId || null;
  if (serverId !== undefined && type !== 'integrated') p.serverId = serverId || null;
  if (apiCountryCode !== undefined && type !== 'integrated') p.apiCountryCode = String(apiCountryCode || '').trim();
  if (cliRange !== undefined && type !== 'integrated') p.cliRange = cliRange ? String(cliRange).trim() : null;
  if (fbId !== undefined) p.fbId = fbId ? String(fbId).trim() : null;
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

// Get the matching service from a provider for a given serverId/countryId
// Falls back to first service, then legacy fields
function getServiceForTarget(provider, serverId, countryId) {
  const services = Array.isArray(provider.services) && provider.services.length > 0
    ? provider.services
    : null;

  if (!services) {
    // Legacy single-service
    return {
      id: 'legacy',
      countryId: provider.countryId || null,
      serverId: provider.serverId || null,
      apiCountryCode: provider.apiCountryCode || '',
      cliRange: provider.cliRange || null,
      label: ''
    };
  }

  // Try exact serverId match first
  if (serverId) {
    const exact = services.find(s => s.serverId === serverId);
    if (exact) return exact;
  }
  // Try countryId match
  if (countryId) {
    const byCountry = services.find(s => s.countryId === countryId);
    if (byCountry) return byCountry;
  }
  // Fallback to first service
  return services[0];
}

module.exports = { load, list, listAsync, getPrimary, findByApiKey, add, update, remove, getServiceForTarget };
