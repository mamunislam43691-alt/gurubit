/**
 * MongoDB Read Cache — reduces read usage dramatically
 * Caches collection reads in memory for configurable TTL
 */

const cache = new Map(); // key → { data, expiresAt }
const DEFAULT_TTL = 30 * 1000; // 30 seconds

/**
 * Cached get for a single document
 */
async function cachedDocGet(ref, ttl = DEFAULT_TTL) {
  const key = `doc:${ref.path || ref._path?.segments?.join('/')}`;
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const snap = await ref.get();
  const result = { exists: snap.exists, data: () => snap.data(), id: snap.id };
  cache.set(key, { data: result, expiresAt: Date.now() + ttl });
  return result;
}

/**
 * Cached collection get
 */
async function cachedCollectionGet(ref, key, ttl = DEFAULT_TTL) {
  const cacheKey = `col:${key}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const snap = await ref.get();
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
  const result = {
    size: docs.length,
    empty: docs.length === 0,
    docs: docs.map(d => ({ id: d.id, data: () => d, exists: true })),
    forEach: (fn) => docs.forEach((d, i) => fn({ id: d.id, data: () => d, exists: true }))
  };
  cache.set(cacheKey, { data: result, expiresAt: Date.now() + ttl });
  return result;
}

/**
 * Invalidate cache for a key pattern
 */
function invalidate(keyPattern) {
  for (const key of cache.keys()) {
    if (key.includes(keyPattern)) cache.delete(key);
  }
}

/**
 * Clear all cache
 */
function clearAll() {
  cache.clear();
}

/**
 * Wrap a MongoDB write to also invalidate related cache
 */
async function cachedWrite(ref, data, method = 'set') {
  if (method === 'set') await ref.set(data);
  else if (method === 'update') await ref.update(data);
  else if (method === 'delete') await ref.delete();
  // Invalidate cache for this document
  const path = ref.path || ref._path?.segments?.join('/') || '';
  if (path) {
    invalidate(path.split('/')[0]); // invalidate whole collection
  }
}

module.exports = { cachedDocGet, cachedCollectionGet, invalidate, clearAll, cachedWrite };
