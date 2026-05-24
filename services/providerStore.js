/**
 * SMS provider config (base URL + API key) — persisted
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'providers.json');
let providers = [];

function save() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(providers, null, 2), 'utf8');
}

function load() {
  providers = [];
  if (!fs.existsSync(FILE)) return;
  try {
    providers = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    providers = [];
  }
}

function list() {
  return [...providers];
}

function getPrimary() {
  return providers[0] || null;
}

function findByApiKey(apiKey) {
  const k = String(apiKey || '').trim();
  return providers.find((p) => p.apiKey === k) || null;
}

function add({ serviceName, baseUrl, apiKey, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange }) {
  const type = providerType || 'sms_only';
  const entry = {
    id: `prov_${Date.now()}`,
    serviceName: serviceName || 'Provider',
    baseUrl: String(baseUrl || '').trim(),
    additionalUrls: type === 'integrated' ? [] : (Array.isArray(additionalUrls) ? additionalUrls.map(u => String(u || '').trim()).filter(Boolean) : []),
    apiKey: String(apiKey || '').trim(),
    providerType: type,
    countryId: countryId || null,
    serverId: serverId || null,
    apiCountryCode: String(apiCountryCode || '').trim(),
    cliRange: cliRange ? String(cliRange).trim() : null,
    createdAt: new Date().toISOString()
  };
  providers.push(entry);
  save();
  return entry;
}

function update(id, { serviceName, baseUrl, apiKey, providerType, additionalUrls, countryId, serverId, apiCountryCode, cliRange }) {
  const p = providers.find((x) => x.id === id);
  if (!p) return null;
  if (serviceName !== undefined) p.serviceName = serviceName || 'Provider';
  if (baseUrl !== undefined) p.baseUrl = String(baseUrl || '').trim();
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
  save();
  return p;
}

function remove(id) {
  const before = providers.length;
  providers = providers.filter((p) => p.id !== id);
  if (providers.length !== before) save();
  return before !== providers.length;
}

load();

module.exports = {
  load,
  list,
  getPrimary,
  findByApiKey,
  add,
  update,
  remove
};
