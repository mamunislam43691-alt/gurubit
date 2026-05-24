/**
 * Simple in-memory response cache for frequently accessed endpoints
 */

const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 minute default TTL

function set(key, value, ttl = TTL) {
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttl
    });
}

function get(key) {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
        cache.delete(key);
        return null;
    }
    
    return item.value;
}

function clear(key) {
    if (key) {
        cache.delete(key);
    } else {
        cache.clear();
    }
}

function invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of cache.keys()) {
        if (regex.test(key)) {
            cache.delete(key);
        }
    }
}

module.exports = { set, get, clear, invalidatePattern };
