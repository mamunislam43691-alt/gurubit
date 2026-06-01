/**
 * Service Worker Registration & Performance Optimizations
 */

// Register Service Worker for offline support & caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then((reg) => {
        console.log('✅ Service Worker registered');

        // Check for SW updates every 60 seconds (fast pickup of new deployments)
        setInterval(() => { reg.update().catch(() => {}); }, 60000);

        // When a new SW is waiting, activate it immediately without waiting
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Tell new SW to skip waiting and take control immediately
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((err) => {
        console.log('Service Worker registration failed:', err);
      });

    // When SW controller changes (new SW took over), reload once
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

/**
 * Performance: Preload critical resources
 */
const preloadCritical = () => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = '/css/output.css';
  document.head.appendChild(link);
};

document.addEventListener('DOMContentLoaded', preloadCritical);

/**
 * Performance: Lazy load images with intersection observer
 */
const setupLazyLoading = () => {
  if (!('IntersectionObserver' in window)) {
    // Fallback for older browsers
    const images = document.querySelectorAll('[data-src]');
    images.forEach((img) => {
      img.src = img.dataset.src;
    });
    return;
  }

  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        imageObserver.unobserve(img);
      }
    });
  }, { rootMargin: '50px' });

  document.querySelectorAll('img[data-src]').forEach((img) => {
    imageObserver.observe(img);
  });
};

document.addEventListener('DOMContentLoaded', setupLazyLoading);

/**
 * Performance: Optimize DOM updates with RequestAnimationFrame
 */
const throttledUpdate = (() => {
  let pending = false;
  return (callback) => {
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        callback();
        pending = false;
      });
    }
  };
})();

/**
 * Performance: Fast API response caching
 */
const apiCache = new Map();
const cachedFetch = async (url, options = {}) => {
  const cacheKey = `${url}`;
  const cached = apiCache.get(cacheKey);
  
  if (cached && Date.now() - cached.time < 30000) { // 30s cache
    return Promise.resolve(cached.data);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    const data = await response.json();
    apiCache.set(cacheKey, { data, time: Date.now() });
    return data;
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
};

// Expose for use in components
window.cachedFetch = cachedFetch;

/**
 * Performance: Reduce layout thrashing with batched DOM updates
 */
const batchDOMUpdates = (updates) => {
  if (updates.length === 0) return;
  
  requestAnimationFrame(() => {
    updates.forEach((update) => update());
  });
};

window.batchDOMUpdates = batchDOMUpdates;

/**
 * Performance Monitoring
 */
if (window.performance && window.performance.timing) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const timing = window.performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const paintTime = timing.responseStart - timing.navigationStart;
      
      console.log(`⚡ Page Load Time: ${loadTime}ms`);
      console.log(`⚡ First Paint: ${paintTime}ms`);

      // Log to server for monitoring
      if (loadTime > 3000) {
        navigator.sendBeacon('/api/perf', JSON.stringify({
          loadTime,
          paintTime,
          url: window.location.pathname,
          timestamp: new Date().toISOString()
        }));
      }
    }, 0);
  });
}

/**
 * Network Information API - Adaptive loading
 */
if ('connection' in navigator) {
  const connection = navigator.connection;
  const isSlowConnection = () => {
    return connection.effectiveType === '4g' ? false : 
           connection.effectiveType === '3g' ? true :
           connection.saveData ? true : false;
  };
  
  window.isSlowConnection = isSlowConnection;
  
  // Reduce image quality on slow connections
  if (isSlowConnection()) {
    document.documentElement.classList.add('slow-connection');
  }
  
  connection.addEventListener('change', () => {
    if (isSlowConnection()) {
      document.documentElement.classList.add('slow-connection');
    } else {
      document.documentElement.classList.remove('slow-connection');
    }
  });
}

/**
 * Prioritize critical CSS and defer non-critical
 */
const deferNonCriticalCSS = () => {
  const nonCritical = document.querySelectorAll('link[rel="stylesheet"][data-defer]');
  nonCritical.forEach((link) => {
    const href = link.href;
    const media = link.media || 'all';
    
    // Create async link
    const asyncLink = document.createElement('link');
    asyncLink.rel = 'stylesheet';
    asyncLink.href = href;
    asyncLink.media = media;
    
    document.head.appendChild(asyncLink);
    link.remove();
  });
};

document.addEventListener('DOMContentLoaded', deferNonCriticalCSS);

console.log('✨ Performance optimizations loaded');
