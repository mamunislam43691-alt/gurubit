/**
 * Cost / reward rates per country + server (range)
 */

const costs = new Map();

function costKey(countryId, serverId) {
  return serverId ? `${countryId}|${serverId}` : String(countryId);
}

function listCosts() {
  return Array.from(costs.values());
}

function listCostsGrouped(catalogStore) {
  const countries = catalogStore?.listCountries?.() || [];
  return countries.map((c) => {
    const servers = catalogStore.listServers(c.id);
    const ranges = servers.length
      ? servers.map((s) => {
          const row = getCost(c.id, s.id);
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
          userReward: getCost(c.id).userReward,
          agentReward: getCost(c.id).agentReward
        }];
    return {
      countryId: c.id,
      name: c.name,
      code: c.code,
      flag: c.flag,
      ranges
    };
  });
}

function setCost(countryId, serverId, patch) {
  const key = costKey(countryId, serverId || '');
  const prev = costs.get(key) || { countryId, serverId: serverId || null, userReward: 0.05, agentReward: 0.02 };
  const next = {
    ...prev,
    ...patch,
    countryId,
    serverId: serverId || null,
    updatedAt: new Date().toISOString()
  };
  costs.set(key, next);
  return next;
}

function getCost(countryId, serverId) {
  const key = costKey(countryId, serverId || '');
  return costs.get(key) || costs.get(costKey(countryId, '')) || {
    countryId,
    serverId: serverId || null,
    userReward: 0.05,
    agentReward: 0.02
  };
}

module.exports = { listCosts, listCostsGrouped, setCost, getCost };
