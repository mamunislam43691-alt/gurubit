/**
 * Client-side API Caching Layer
 * Caches API responses to reduce server load and improve speed
 */

class APICache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
    this.defaults = {
      dashboard: 30000,        // 30 seconds
      numbers: 10000,          // 10 seconds
      sms: 5000,              // 5 seconds
      user: 60000,            // 1 minute
      countries: 3600000,     // 1 hour
      default: 30000          // 30 seconds default
    };
  }

  /**
   * Get cached data or fetch fresh if expired
   */
  async get(url, fetchFn, ttl = null) {
    const cached = this.cache.get(url);
    const now = Date.now();

    // Return cached if still valid
    if (cached && cached.expiry > now) {
      return cached.data;
    }

    // Remove expired entry
    if (cached) {
      this.cache.delete(url);
      clearTimeout(this.timers.get(url));
      this.timers.delete(url);
    }

    // Fetch fresh data
    try {
      const data = await fetchFn();
      this.set(url, data, ttl);
      return data;
    } catch (err) {
      // Return stale cache if available and network fails
      if (cached) {
        return cached.data;
      }
      throw err;
    }
  }

  /**
   * Manually set cache value
   */
  set(url, data, ttl = null) {
    const determinedTTL = ttl || this.getTTL(url);
    const expiry = Date.now() + determinedTTL;

    this.cache.set(url, { data, expiry });

    // Auto-clear after TTL
    const existingTimer = this.timers.get(url);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.cache.delete(url);
      this.timers.delete(url);
    }, determinedTTL);

    this.timers.set(url, timer);
  }

  /**
   * Determine TTL based on URL pattern
   */
  getTTL(url) {
    if (url.includes('/dashboard')) return this.defaults.dashboard;
    if (url.includes('/numbers')) return this.defaults.numbers;
    if (url.includes('/sms')) return this.defaults.sms;
    if (url.includes('/user')) return this.defaults.user;
    if (url.includes('/countries')) return this.defaults.countries;
    return this.defaults.default;
  }

  /**
   * Clear specific cache entry
   */
  invalidate(url) {
    const timer = this.timers.get(url);
    if (timer) clearTimeout(timer);
    this.cache.delete(url);
    this.timers.delete(url);
    console.log(`\u274c Cache invalidated: ${url}`);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.cache.clear();
    this.timers.clear();
    console.log('\uD83D\uDDD1\uFE0F  All cache cleared');
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      entries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Global cache instance
window.apiCache = new APICache();

/**
 * Optimized fetch wrapper with caching and timeout
 */
window.optimizedFetch = async (url, options = {}) => {
  const { useCache = true, timeout = 10000 } = options;

  const fetchWithTimeout = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  if (useCache) {
    return window.apiCache.get(url, fetchWithTimeout);
  }

  return fetchWithTimeout();
};

/**
 * Batch fetch multiple URLs in parallel
 */
window.batchFetch = async (urls, useCache = true) => {
  const promises = urls.map((url) =>
    window.optimizedFetch(url, { useCache }).catch((err) => ({
      url,
      error: err.message
    }))
  );

  return Promise.all(promises);
};

console.log('✨ API Cache layer initialized');
