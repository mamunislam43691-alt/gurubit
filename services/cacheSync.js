/**
 * Cache Sync Scheduler
 * Syncs local cache with Firestore periodically (every 2-5 hours)
 * Reduces Firebase reads and saves quota
 */

const catalogStore = require('./catalogStore');
const providerStore = require('./providerStore');

// Sync intervals in milliseconds
const SYNC_INTERVALS = {
  catalog: 2 * 60 * 60 * 1000,    // 2 hours
  providers: 3 * 60 * 60 * 1000, // 3 hours
  users: 4 * 60 * 60 * 1000,     // 4 hours
  fullSync: 5 * 60 * 60 * 1000   // 5 hours
};

// Track last sync times
const lastSync = {
  catalog: 0,
  providers: 0,
  users: 0,
  fullSync: 0
};

// Sync status for monitoring
const syncStats = {
  lastCatalogSync: null,
  lastProviderSync: null,
  totalSyncs: 0,
  failedSyncs: 0,
  isSyncing: false
};

let syncInterval = null;

/**
 * Sync catalog data (countries, servers, platforms)
 */
async function syncCatalog() {
  const now = Date.now();
  if (now - lastSync.catalog < SYNC_INTERVALS.catalog) {
    return { skipped: true, reason: 'Not due yet' };
  }

  try {
    console.log('[CacheSync] Syncing catalog with Firestore...');
    await catalogStore.loadCatalog();
    lastSync.catalog = now;
    syncStats.lastCatalogSync = new Date().toISOString();
    syncStats.totalSyncs++;
    console.log('[CacheSync] ✅ Catalog synced successfully');
    return { success: true };
  } catch (err) {
    syncStats.failedSyncs++;
    console.error('[CacheSync] ❌ Catalog sync failed:', err.message);
    return { error: err.message };
  }
}

/**
 * Sync provider data
 */
async function syncProviders() {
  const now = Date.now();
  if (now - lastSync.providers < SYNC_INTERVALS.providers) {
    return { skipped: true, reason: 'Not due yet' };
  }

  try {
    console.log('[CacheSync] Syncing providers with Firestore...');
    await providerStore.load();
    lastSync.providers = now;
    syncStats.lastProviderSync = new Date().toISOString();
    syncStats.totalSyncs++;
    console.log('[CacheSync] ✅ Providers synced successfully');
    return { success: true };
  } catch (err) {
    syncStats.failedSyncs++;
    console.error('[CacheSync] ❌ Provider sync failed:', err.message);
    return { error: err.message };
  }
}

/**
 * Full sync - all data
 */
async function fullSync() {
  if (syncStats.isSyncing) {
    return { skipped: true, reason: 'Sync already in progress' };
  }

  syncStats.isSyncing = true;
  console.log('[CacheSync] Starting full sync...');

  const results = {
    catalog: null,
    providers: null,
    timestamp: new Date().toISOString()
  };

  try {
    results.catalog = await syncCatalog();
  } catch (e) {
    results.catalog = { error: e.message };
  }

  try {
    results.providers = await syncProviders();
  } catch (e) {
    results.providers = { error: e.message };
  }

  lastSync.fullSync = Date.now();
  syncStats.isSyncing = false;
  console.log('[CacheSync] Full sync completed');

  return results;
}

/**
 * Force sync (manual trigger)
 */
async function forceSyncAll() {
  lastSync.catalog = 0;
  lastSync.providers = 0;
  lastSync.users = 0;
  return fullSync();
}

/**
 * Start the sync scheduler
 */
function startScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Run full sync every 5 hours
  syncInterval = setInterval(() => {
    fullSync().catch(err => {
      console.error('[CacheSync] Scheduled sync error:', err.message);
    });
  }, SYNC_INTERVALS.fullSync);

  // Also run a sync 30 seconds after startup
  setTimeout(() => {
    fullSync().catch(() => {});
  }, 30000);

  console.log('[CacheSync] Scheduler started - syncing every 5 hours');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  console.log('[CacheSync] Scheduler stopped');
}

/**
 * Get sync statistics
 */
function getStats() {
  return {
    ...syncStats,
    intervals: SYNC_INTERVALS,
    lastSyncTimes: {
      catalog: lastSync.catalog ? new Date(lastSync.catalog).toISOString() : null,
      providers: lastSync.providers ? new Date(lastSync.providers).toISOString() : null,
      fullSync: lastSync.fullSync ? new Date(lastSync.fullSync).toISOString() : null
    }
  };
}

/**
 * Configure sync intervals (optional)
 */
function configure(newIntervals) {
  if (newIntervals.catalog) SYNC_INTERVALS.catalog = newIntervals.catalog;
  if (newIntervals.providers) SYNC_INTERVALS.providers = newIntervals.providers;
  if (newIntervals.users) SYNC_INTERVALS.users = newIntervals.users;
  if (newIntervals.fullSync) SYNC_INTERVALS.fullSync = newIntervals.fullSync;

  // Restart scheduler with new intervals
  if (syncInterval) {
    startScheduler();
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  fullSync,
  forceSyncAll,
  syncCatalog,
  syncProviders,
  getStats,
  configure,
  SYNC_INTERVALS
};
