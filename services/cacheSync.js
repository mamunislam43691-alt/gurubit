/**
 * Cache Sync Scheduler
 * Keeps local in-memory caches in sync with MongoDB.
 */

const catalogStore = require('./catalogStore');
const providerStore = require('./providerStore');

const SYNC_INTERVALS = {
  catalog:   2 * 60 * 60 * 1000,
  providers: 3 * 60 * 60 * 1000,
  fullSync:  5 * 60 * 60 * 1000
};

const lastSync = { catalog: 0, providers: 0, fullSync: 0 };

const syncStats = {
  lastCatalogSync: null,
  lastProviderSync: null,
  totalSyncs: 0,
  failedSyncs: 0,
  isSyncing: false
};

let syncInterval = null;

async function syncCatalog() {
  try {
    await catalogStore.loadCatalog();
    lastSync.catalog = Date.now();
    syncStats.lastCatalogSync = new Date().toISOString();
    return { success: true };
  } catch (err) {
    syncStats.failedSyncs++;
    console.error('[CacheSync] Catalog reload failed:', err.message);
    return { error: err.message };
  }
}

async function syncProviders() {
  const now = Date.now();
  if (now - lastSync.providers < SYNC_INTERVALS.providers) return { skipped: true };
  try {
    console.log('[CacheSync] Syncing providers...');
    await providerStore.load();
    lastSync.providers = now;
    syncStats.lastProviderSync = new Date().toISOString();
    syncStats.totalSyncs++;
    console.log('[CacheSync] Providers synced');
    return { success: true };
  } catch (err) {
    syncStats.failedSyncs++;
    console.error('[CacheSync] Provider sync failed:', err.message);
    return { error: err.message };
  }
}

async function fullSync() {
  if (syncStats.isSyncing) return { skipped: true, reason: 'already_running' };

  syncStats.isSyncing = true;
  const results = { catalog: null, providers: null, timestamp: new Date().toISOString() };
  try { results.catalog = await syncCatalog(); } catch (e) { results.catalog = { error: e.message }; }
  try { results.providers = await syncProviders(); } catch (e) { results.providers = { error: e.message }; }
  lastSync.fullSync = Date.now();
  syncStats.isSyncing = false;
  return results;
}

async function forceSyncAll() {
  lastSync.catalog = 0;
  lastSync.providers = 0;
  return fullSync();
}

function startScheduler() {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    fullSync().catch(err => console.error('[CacheSync] Scheduled sync error:', err.message));
  }, SYNC_INTERVALS.fullSync);

  setTimeout(() => {
    fullSync().catch(() => {});
  }, 10 * 60 * 1000);

  console.log('[CacheSync] Scheduler started - first sync in 10 min, then every 5 hours');
}

function stopScheduler() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

function getStats() {
  return {
    ...syncStats,
    intervals: SYNC_INTERVALS,
    lastSyncTimes: {
      catalog:   lastSync.catalog   ? new Date(lastSync.catalog).toISOString()   : null,
      providers: lastSync.providers ? new Date(lastSync.providers).toISOString() : null,
      fullSync:  lastSync.fullSync  ? new Date(lastSync.fullSync).toISOString()  : null
    }
  };
}

function configure(newIntervals) {
  if (newIntervals.catalog)   SYNC_INTERVALS.catalog   = newIntervals.catalog;
  if (newIntervals.providers) SYNC_INTERVALS.providers = newIntervals.providers;
  if (newIntervals.fullSync)  SYNC_INTERVALS.fullSync  = newIntervals.fullSync;
  if (syncInterval) startScheduler();
}

module.exports = {
  startScheduler, stopScheduler,
  fullSync, forceSyncAll,
  syncCatalog, syncProviders,
  getStats, configure,
  SYNC_INTERVALS
};
