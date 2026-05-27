/**
 * Cache Sync Scheduler
 * Syncs local cache with Firestore periodically (every 2-5 hours)
 * Reduces Firebase reads and saves quota
 * Gracefully handles RESOURCE_EXHAUSTED (quota exceeded) errors
 */

const catalogStore = require('./catalogStore');
const providerStore = require('./providerStore');

// Sync intervals in milliseconds
const SYNC_INTERVALS = {
  catalog:   2 * 60 * 60 * 1000,  // 2 hours
  providers: 3 * 60 * 60 * 1000,  // 3 hours
  fullSync:  5 * 60 * 60 * 1000   // 5 hours
};

const lastSync = { catalog: 0, providers: 0, fullSync: 0 };

const syncStats = {
  lastCatalogSync: null,
  lastProviderSync: null,
  totalSyncs: 0,
  failedSyncs: 0,
  isSyncing: false,
  quotaExceeded: false,
  quotaResetAt: null
};

let syncInterval = null;

function isQuotaError(err) {
  return err && (
    err.code === 8 ||
    String(err.message || '').includes('RESOURCE_EXHAUSTED') ||
    String(err.message || '').includes('Quota exceeded')
  );
}

async function syncCatalog() {
  // Catalog is stored in local catalog.json — no Firestore sync needed.
  // Just reload from disk to pick up any external changes.
  try {
    await catalogStore.loadCatalog();
    lastSync.catalog = Date.now();
    syncStats.lastCatalogSync = new Date().toISOString();
    return { success: true };
  } catch (err) {
    syncStats.failedSyncs++;
    console.error('[CacheSync] ❌ Catalog reload failed:', err.message);
    return { error: err.message };
  }
}

async function syncProviders() {
  const now = Date.now();
  if (now - lastSync.providers < SYNC_INTERVALS.providers) return { skipped: true };
  if (syncStats.quotaExceeded) return { skipped: true, reason: 'quota_exceeded' };
  try {
    console.log('[CacheSync] Syncing providers...');
    await providerStore.load();
    lastSync.providers = now;
    syncStats.lastProviderSync = new Date().toISOString();
    syncStats.totalSyncs++;
    syncStats.quotaExceeded = false;
    console.log('[CacheSync] ✅ Providers synced');
    return { success: true };
  } catch (err) {
    syncStats.failedSyncs++;
    if (isQuotaError(err)) {
      syncStats.quotaExceeded = true;
      console.warn('[CacheSync] ⚠️  Quota exceeded — pausing sync');
      return { skipped: true, reason: 'quota_exceeded' };
    }
    console.error('[CacheSync] ❌ Provider sync failed:', err.message);
    return { error: err.message };
  }
}

async function fullSync() {
  if (syncStats.isSyncing) return { skipped: true, reason: 'already_running' };

  // Auto-reset quota flag after 24 hours
  if (syncStats.quotaExceeded && syncStats.quotaResetAt && new Date() > new Date(syncStats.quotaResetAt)) {
    syncStats.quotaExceeded = false;
    syncStats.quotaResetAt = null;
    console.log('[CacheSync] Quota reset — resuming sync');
  }

  if (syncStats.quotaExceeded) return { skipped: true, reason: 'quota_exceeded' };

  syncStats.isSyncing = true;
  const results = { catalog: null, providers: null, timestamp: new Date().toISOString() };
  try { results.catalog = await syncCatalog(); } catch (e) { results.catalog = { error: e.message }; }
  try { results.providers = await syncProviders(); } catch (e) { results.providers = { error: e.message }; }
  lastSync.fullSync = Date.now();
  syncStats.isSyncing = false;
  return results;
}

async function forceSyncAll() {
  syncStats.quotaExceeded = false;
  syncStats.quotaResetAt = null;
  lastSync.catalog = 0;
  lastSync.providers = 0;
  return fullSync();
}

function startScheduler() {
  if (syncInterval) clearInterval(syncInterval);

  // Periodic sync every 5 hours
  syncInterval = setInterval(() => {
    fullSync().catch(err => {
      if (!isQuotaError(err)) console.error('[CacheSync] Scheduled sync error:', err.message);
    });
  }, SYNC_INTERVALS.fullSync);

  // First sync: 10 minutes after startup — avoids quota burst on restart
  setTimeout(() => {
    fullSync().catch(() => {});
  }, 10 * 60 * 1000);

  console.log('[CacheSync] Scheduler started — first sync in 10 min, then every 5 hours');
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
