/**
 * Cost / reward rates per country + server — MongoDB backed
 */

const { db } = require('../config/db');

const COLLECTION = 'costRates';

function col() {
  return db.collection(COLLECTION);
}

function costKey(countryId, serverId) {
  return serverId ? `${countryId}__${serverId}` : String(countryId);
}

async function listCosts() {
  const snap = await col().get();
  const items = [];
  snap.forEach(doc => items.push(doc.data()));
  return items;
}

async function listCostsGrouped(catalogStore) {
  const countries = catalogStore?.listCountries?.() || [];
  const allCosts = await listCosts();
  const costMap = new Map(allCosts.map(c => [costKey(c.countryId, c.serverId || ''), c]));

  return countries.map((c) => {
    const servers = catalogStore.listServers(c.id);
    const ranges = servers.length
      ? servers.map((s) => {
          const row = costMap.get(costKey(c.id, s.id))
            || costMap.get(costKey(c.id, ''))
            || { userReward: 0.05, agentReward: 0.02 };
          return {
            serverId: s.id,
            serverName: s.name,
            userReward: row.userReward,
            agentReward: row.agentReward
          };
        })
      : [{
          serverId: '',
          serverName: 'Default',
          userReward: (costMap.get(costKey(c.id, '')) || { userReward: 0.05 }).userReward,
          agentReward: (costMap.get(costKey(c.id, '')) || { agentReward: 0.02 }).agentReward
        }];
    return { countryId: c.id, name: c.name, code: c.code, flag: c.flag, ranges };
  });
}

async function setCost(countryId, serverId, patch) {
  const key = costKey(countryId, serverId || '');
  const docRef = col().doc(key);
  const existing = await docRef.get();
  const prev = existing.exists ? existing.data() : { countryId, serverId: serverId || null, userReward: 0.05, agentReward: 0.02 };
  const next = {
    ...prev,
    ...patch,
    countryId,
    serverId: serverId || null,
    updatedAt: new Date().toISOString()
  };
  await docRef.set(next);
  return next;
}

async function getCost(countryId, serverId) {
  const key = costKey(countryId, serverId || '');
  const doc = await col().doc(key).get();
  if (doc.exists) return doc.data();
  // fallback to country default
  const fallback = await col().doc(costKey(countryId, '')).get();
  if (fallback.exists) return fallback.data();
  return { countryId, serverId: serverId || null, userReward: 0.05, agentReward: 0.02 };
}

module.exports = { listCosts, listCostsGrouped, setCost, getCost };
