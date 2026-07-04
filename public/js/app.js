/**
 * Main Application Entry Point
 * Handles routing and component initialization
 * Uses lazy (dynamic) imports so only the current page's code is loaded — faster startup
 */

// ─── Global WebSocket Manager ────────────────────────────────────────────────
// One single WS connection for the entire app lifetime.
// Components subscribe to events instead of creating their own connections.
class GlobalWS {
  constructor() {
    this.ws = null;
    this.userId = null;
    this.listeners = new Map(); // type → Set of callbacks
    this.reconnectAttempts = 0;
    this.maxReconnect = 60;
    this.baseDelay = 2000;
    this._reconnectTimer = null;
    this._connecting = false;
  }

  connect(userId) {
    // If already connected with same userId, do nothing
    if (this.userId === userId &&
        this.ws &&
        (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.userId = userId;
    this._open();
  }

  _open() {
    if (this._connecting) return;
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    this._connecting = true;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      this._connecting = false;
      this.reconnectAttempts = 0;
      this.baseDelay = 2000;
      if (this.userId) {
        this.ws.send(JSON.stringify({ type: 'subscribe_user_updates', userId: this.userId }));
      }
      this._emit('ws_connected', {});
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        this._emit(data.type, data);
        this._emit('*', data); // wildcard listeners
      } catch (_) {}
    };

    this.ws.onclose = () => {
      this._connecting = false;
      this._emit('ws_disconnected', {});
      if (this.reconnectAttempts < this.maxReconnect) {
        this.reconnectAttempts++;
        const delay = Math.min(this.baseDelay * Math.pow(1.5, this.reconnectAttempts - 1), 60000)
          + Math.floor(Math.random() * 1000);
        this._reconnectTimer = setTimeout(() => this._open(), delay);
      }
    };

    this.ws.onerror = () => { this._connecting = false; };
  }

  on(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
    return () => this.listeners.get(type)?.delete(cb); // returns unsubscribe fn
  }

  off(type, cb) {
    this.listeners.get(type)?.delete(cb);
  }

  _emit(type, data) {
    this.listeners.get(type)?.forEach(cb => { try { cb(data); } catch (_) {} });
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  destroy() {
    clearTimeout(this._reconnectTimer);
    this.reconnectAttempts = this.maxReconnect; // prevent reconnect
    try { this.ws?.close(); } catch (_) {}
    this.listeners.clear();
  }
}

// Single global instance — shared across all components
// Don't auto-connect on admin pages
window.GWS = new GlobalWS();
// ─────────────────────────────────────────────────────────────────────────────

// Route → lazy import map (only the needed component is fetched)
const ROUTES = {
  '/':                  () => import('./components/LandingPage.js').then(m => m.LandingPage),
  '/auth':              () => import('./components/AuthPage.js').then(m => m.AuthPage),
  '/login':             () => import('./components/AuthPage.js').then(m => m.AuthPage),
  '/signup':            () => import('./components/AuthPage.js').then(m => m.AuthPage),
  '/forgot-password':   () => import('./components/AuthPage.js').then(m => m.AuthPage),
  '/admin':             () => import('./components/AdminPanel.js').then(m => m.AdminPanel),
  '/dashboard':         () => import('./components/Dashboard.js?v=3').then(m => m.Dashboard),
  '/agent':             () => import('./components/AgentDashboard.js?v=3').then(m => m.AgentDashboard),
  '/profile':           () => import('./components/ProfilePage.js').then(m => m.ProfilePage),
  '/numbers':           () => import('./components/NumberSelection.js?v=4').then(m => m.NumberSelection),
  '/live-feed':         () => import('./components/LiveSMSFeed.js?v=2').then(m => m.LiveSMSFeed),
  '/post':              () => import('./components/PostFeed.js?v=2').then(m => m.PostFeed),
  '/groups':            () => import('./components/GroupsPage.js?v=2').then(m => m.GroupsPage),
  '/movement':          () => import('./components/PostFeed.js?v=2').then(m => m.PostFeed),
  '/guru':              () => import('./components/PostFeed.js?v=2').then(m => m.PostFeed),
  '/withdraw':          () => import('./components/WithdrawPage.js?v=2').then(m => m.WithdrawPage),
  '/admin/users':       () => import('./components/AdminUsers.js?v=4').then(m => m.AdminUsers),
  '/admin/pending-users': () => import('./components/AdminPendingUsers.js').then(m => m.AdminPendingUsers),
  '/admin/agents':      () => import('./components/AdminUsers.js?v=4').then(m => m.AdminUsers),
  '/admin/guru':        () => import('./components/AdminGuru.js?v=2').then(m => m.AdminGuru),
  '/admin/withdrawals': () => import('./components/AdminWithdrawals.js?v=2').then(m => m.AdminWithdrawals),
  '/admin/services':    () => import('./components/AdminServices.js?v=4').then(m => m.AdminServices),
  '/admin/leaderboard': () => import('./components/AdminLeaderboard.js?v=2').then(m => m.AdminLeaderboard),
  '/admin/api-keys':    () => import('./components/AdminApiKeys.js?v=4').then(m => m.AdminApiKeys),
  '/admin/provider':    () => import('./components/AdminApiKeys.js?v=4').then(m => m.AdminApiKeys),
  '/admin/sms-feed':    () => import('./components/AdminSmsFeed.js?v=2').then(m => m.AdminSmsFeed),
  '/admin/support':     () => import('./components/AdminSupport.js?v=2').then(m => m.AdminSupport),
  '/admin/broadcast':   () => import('./components/AdminBroadcast.js?v=2').then(m => m.AdminBroadcast),
  '/admin/staff':       () => import('./components/AdminStaff.js?v=2').then(m => m.AdminStaff),
  '/admin/settings':    () => import('./components/AdminSettings.js?v=2').then(m => m.AdminSettings),
  '/admin/database':    () => import('./components/AdminDatabase.js?v=3').then(m => m.AdminDatabase),
  '/admin/costs':       () => import('./components/AdminCost.js?v=2').then(m => m.AdminCost),
  '/privacy':           () => import('./components/LegalPage.js').then(m => m.LegalPage),
  '/terms':             () => import('./components/LegalPage.js').then(m => m.LegalPage),
  '/faq':               () => import('./components/LegalPage.js').then(m => m.LegalPage),
  '/verify-email':      () => import('./components/VerifyEmailPage.js').then(m => m.VerifyEmailPage),
  '/reset-password':    () => import('./components/ResetPasswordPage.js').then(m => m.ResetPasswordPage),
  '/news':              () => import('./components/NewsFeed.js?v=1').then(m => m.NewsFeed),
  '/api-access':        () => import('./components/UserApiPage.js').then(m => m.UserApiPage),
};

// Simple client-side router
class Router {
  constructor() {
    this.currentComponent = null;
  }

  async init() {
    const path = window.location.pathname;

    // Dynamic routes
    if (path.startsWith('/numbers/') && path !== '/numbers') {
      window.location.replace('/numbers');
      return;
    }

    if (path === '/otp') {
      window.location.replace('/numbers');
      return;
    }

    if (path === '/guru' || (path.startsWith('/guru/') && !path.startsWith('/guru/user'))) {
      const dest = path.includes('groups') ? '/groups' : '/post';
      window.location.replace(dest);
      return;
    }

    if (path.startsWith('/post/user/') || path.startsWith('/guru/user/')) {
      const userId = path.split('/').filter(Boolean)[2];
      this._destroyCurrent();
      const { GuruUserProfile } = await import('./components/GuruUserProfile.js');
      this.currentComponent = new GuruUserProfile(userId);
      const result = this.currentComponent.init();
      if (result && typeof result.then === 'function') {
        await result.catch(err => { console.error('Route init error:', err); throw err; });
      }
      return;
    }

    const loader = ROUTES[path] || ROUTES['/'];
    this._destroyCurrent();

    try {
      const ComponentClass = await loader();
      this.currentComponent = new ComponentClass();
      const result = this.currentComponent.init();
      if (result && typeof result.then === 'function') {
        await result.catch(err => {
          console.error('Route init error:', err);
          this._showErrorFallback(err);
        });
      }
    } catch (err) {
      console.error('Component load error:', err);
      this._showErrorFallback(err);
    }
  }

  _showErrorFallback(err) {
    const app = document.getElementById('app');
    if (!app) return;
    // Don't override if content already rendered
    if (app.innerHTML.trim().length > 50) return;
    app.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;background:#020b18;color:#fff;font-family:sans-serif;padding:2rem;text-align:center">
        <div style="font-size:3rem">⚡</div>
        <h2 style="color:#00d2ff;font-size:1.25rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em">Loading Error</h2>
        <p style="color:#94a3b8;font-size:.875rem;max-width:400px">${err?.message || 'Something went wrong. Please refresh.'}</p>
        <button onclick="location.reload()" style="background:#00d2ff;color:#020b18;border:none;padding:10px 28px;border-radius:8px;font-weight:800;cursor:pointer;font-size:.875rem;text-transform:uppercase;letter-spacing:.05em">Refresh Page</button>
        <a href="/" style="color:#475569;font-size:.75rem;text-decoration:none">← Back to Home</a>
      </div>`;
  }

  _destroyCurrent() {
    if (this.currentComponent && typeof this.currentComponent.destroy === 'function') {
      this.currentComponent.destroy();
    }
    this.currentComponent = null;
  }

  renderNumberResult(numberId) {
    this._destroyCurrent();
    import('./components/NumberResultGrid.js').then(({ NumberResultGrid }) => {
      this.currentComponent = new NumberResultGrid(numberId);
      this.currentComponent.init();
    });
  }
}

// Initialize app
let liveSupportWidget = null;
let _appRouter = null; // global router reference for SPA navigation

window.GURUBIT_APP_READY = new Promise((resolve, reject) => {
  window.__GURUBIT_APP_RESOLVE__ = resolve;
  window.__GURUBIT_APP_REJECT__ = reject;
});

function hideLiveSupportWidget() {
  document.getElementById('liveSupportRoot')?.remove();
  liveSupportWidget = null;
}

async function initLiveSupport() {
  const path = window.location.pathname;
  // Show ONLY on dashboard (/dashboard) — hide everywhere else
  const allowedPaths = ['/dashboard'];
  if (!allowedPaths.includes(path)) {
    hideLiveSupportWidget();
    return;
  }
  if (liveSupportWidget) return;
  const { LiveSupportWidget } = await import('./components/LiveSupportWidget.js');
  liveSupportWidget = new LiveSupportWidget();
  liveSupportWidget.init();
}

// Loading skeleton removed for instant navigation

async function startApp() {
  try {
    _appRouter = new Router();
    await _appRouter.init();

    // SPA popstate handler — fires when spa-link navigation happens
    window.addEventListener('popstate', async () => {
      // Show instant loading state — prevents blank screen
      const app = document.getElementById('app');
      if (app && app.innerHTML.trim().length < 100) {
        app.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020b18;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border:3px solid rgba(0,210,255,0.2);border-top-color:#00d2ff;border-radius:50%;animation:spin 0.7s linear infinite;"></div>
          </div>
        </div>`;
      }
      try {
        await _appRouter.init();
      } finally {
        // Navigation complete
      }
      // Re-init live support if needed
      initLiveSupport().catch(() => {});
    });

    // Load live support widget after main content — non-blocking
    initLiveSupport().catch(() => {});
    window.__GURUBIT_APP_RESOLVE__?.();
  } catch (err) {
    console.error('App startup error:', err);
    const app = document.getElementById('app');
    if (app && app.innerHTML.trim().length < 50) {
      app.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;background:#020b18;color:#fff;font-family:sans-serif;padding:2rem;text-align:center">
          <div style="font-size:3rem">⚡</div>
          <h2 style="color:#00d2ff;font-size:1.25rem;font-weight:900;text-transform:uppercase">App Error</h2>
          <p style="color:#94a3b8;font-size:.875rem">${err?.message || 'Failed to start. Please refresh.'}</p>
          <button onclick="location.reload()" style="background:#00d2ff;color:#020b18;border:none;padding:10px 28px;border-radius:8px;font-weight:800;cursor:pointer">Refresh</button>
        </div>`;
    }
    window.__GURUBIT_APP_REJECT__?.(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
