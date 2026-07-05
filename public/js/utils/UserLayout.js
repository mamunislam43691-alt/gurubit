/**
 * User shell — desktop sidebar + mobile bottom nav
 * SPA navigation — no full page reloads
 */

export const USER_NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
  { id: 'numbers',   label: 'Number',    href: '/numbers',   icon: 'mobile-alt' },
  { id: 'live-feed', label: 'Live SMS',  href: '/live-feed', icon: 'satellite-dish' },
  { id: 'api',       label: 'API Key',  href: '/api-access', icon: 'key' }
];

// Session cache — avoid repeated /api/auth/session calls
let _cachedSession = null;
let _sessionFetchPromise = null;

// Pre-load from sessionStorage for instant navigation
function _loadSessionFromStorage() {
  try {
    const raw = sessionStorage.getItem('_usession');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Invalidate old caches that don't have apiEnabled — force fresh fetch
    if (parsed && !('apiEnabled' in parsed)) {
      sessionStorage.removeItem('_usession');
      return null;
    }
    return parsed;
  } catch (_) { return null; }
}
function _saveSessionToStorage(user) {
  try { sessionStorage.setItem('_usession', JSON.stringify(user)); } catch (_) {}
}

_cachedSession = _loadSessionFromStorage();

export class UserLayout {
  static async ensureAuth(redirect = '/') {
    // Return cached session immediately — no network call
    if (_cachedSession) return _cachedSession;

    // Deduplicate concurrent calls — with 2s timeout for faster fallback
    if (!_sessionFetchPromise) {
      _sessionFetchPromise = Promise.race([
        fetch('/api/auth/session').then(r => r.json()).catch(() => ({})),
        new Promise(resolve => setTimeout(() => resolve({}), 2000))
      ]).finally(() => { _sessionFetchPromise = null; });
    }

    const session = await _sessionFetchPromise;
    if (!session.authenticated) {
      window.location.href = redirect;
      return null;
    }
    _cachedSession = session.user;
    _saveSessionToStorage(session.user);
    return session.user;
  }

  // Call this on logout to clear cache
  static clearSessionCache() {
    _cachedSession = null;
    _sessionFetchPromise = null;
    try { sessionStorage.removeItem('_usession'); } catch (_) {}
  }

  // Get cached user without network call
  static getCachedUser() {
    return _cachedSession || _loadSessionFromStorage();
  }

  static profileMenuHtml(user) {
    const photo = user?.profilePhotoUrl
      ? `<img src="${user.profilePhotoUrl}" class="w-9 h-9 rounded-full object-cover border-2 border-primary/40">`
      : `<span class="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/30 flex items-center justify-center text-primary text-sm"><i class="fas fa-user"></i></span>`;
    return `
      <div class="user-profile-corner relative">
        <button type="button" id="userProfileBtn" class="flex items-center gap-2 rounded-full hover:bg-white/5 p-1 transition-all">
          ${photo}
          <i class="fas fa-chevron-down text-[9px] text-gray-500 hidden sm:block"></i>
        </button>
        <div id="userProfileMenu" class="user-profile-dropdown hidden">
          <div class="px-4 py-3 border-b border-white/5">
            <p class="text-xs font-bold text-white truncate">${user?.name || 'User'}</p>
            <p class="text-[10px] text-gray-500 truncate">${user?.email || ''}</p>
          </div>
          <a href="/profile" class="user-profile-item spa-link"><i class="fas fa-user w-4"></i> My Account</a>
          <a href="/profile?edit=1" class="user-profile-item spa-link"><i class="fas fa-edit w-4"></i> Edit Profile</a>
          <a href="/withdraw" class="user-profile-item spa-link"><i class="fas fa-wallet w-4"></i> Withdraw</a>
          <div class="border-t border-white/5 mt-1">
            <button type="button" id="userLogoutBtn" class="user-profile-item text-red-400 w-full text-left"><i class="fas fa-sign-out-alt w-4"></i> Logout</button>
          </div>
        </div>
      </div>`;
  }

  static bindProfileMenu() {
    const btn = document.getElementById('userProfileBtn');
    const menu = document.getElementById('userProfileMenu');
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu?.classList.toggle('hidden');
    });
    document.addEventListener('click', () => menu?.classList.add('hidden'));
    menu?.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('userLogoutBtn')?.addEventListener('click', async () => {
      UserLayout.clearSessionCache();
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }

  static renderShell({ activeId, title, bodyHtml, user }) {
    const app = document.getElementById('app');
    document.getElementById('app-skeleton')?.remove();
    app.innerHTML = `
      <div class="user-shell min-h-screen bg-dark text-gray-200">

        <!-- ── Sidebar backdrop (mobile overlay) ── -->
        <div class="user-sidebar-backdrop" id="userSidebarBackdrop"></div>

        <!-- ── Sidebar (desktop always visible, mobile slide-in) ── -->
        <aside class="user-sidebar flex flex-col" id="userSidebar">
          <a href="/dashboard" class="user-sidebar-brand spa-link">
            <img src="/assets/logo.svg" alt="" class="w-9 h-9">
            <span class="font-black gradient-text text-sm uppercase tracking-widest">GURUBIT</span>
          </a>
          <nav class="user-sidebar-nav flex-1">
            ${USER_NAV.map((n) => `
              <a href="${n.href}" class="user-nav-link spa-link ${n.id === activeId ? 'is-active' : ''}">
                <i class="fas fa-${n.icon} w-5 text-center"></i>
                <span>${n.label}</span>
              </a>
            `).join('')}
          </nav>
          <div class="p-4 border-t border-white/5">
            <p class="text-[10px] text-gray-600 truncate">${user?.name || ''}</p>
          </div>
        </aside>

        <!-- ── Main content ── -->
        <div class="user-main">

          <!-- Top bar -->
          <header class="user-topbar sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b border-white/5"
                  style="background:rgba(2,11,24,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)">
            <!-- Mobile: hamburger button -->
            <button type="button" id="userNavToggle" class="user-nav-toggle w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-all shrink-0" aria-label="Open menu">
              <i class="fas fa-bars text-sm"></i>
            </button>
            <!-- Logo (mobile only) -->
            <a href="/dashboard" class="flex items-center gap-2 md:hidden spa-link flex-1 min-w-0">
              <img src="/assets/logo.svg" alt="" class="w-7 h-7 shrink-0">
              <span class="font-black gradient-text text-xs uppercase tracking-widest truncate">GURUBIT</span>
            </a>
            <!-- Desktop: page title -->
            <h1 class="hidden md:block text-base font-black text-white uppercase tracking-wide flex-1">${title}</h1>
            <!-- Right actions -->
            <div class="flex items-center gap-2 shrink-0">
              ${UserLayout.profileMenuHtml(user)}
            </div>
          </header>

          <!-- Mobile page title -->
          <div class="md:hidden px-4 pt-3 pb-1">
            <h1 class="text-sm font-black text-white uppercase tracking-widest">${title}</h1>
          </div>

          <!-- Page body -->
          <main class="user-content pb-6">${bodyHtml}</main>
        </div>

      </div>`;

    UserLayout.bindProfileMenu();
    UserLayout.bindSidebarToggle();
    UserLayout.bindSpaLinks();
    window.GURUBIT_THEME.updateButtons();
  }

  // Sidebar toggle — hamburger opens/closes sidebar on mobile
  static bindSidebarToggle() {
    const toggle = document.getElementById('userNavToggle');
    const sidebar = document.getElementById('userSidebar');
    const backdrop = document.getElementById('userSidebarBackdrop');

    function openSidebar() {
      sidebar?.classList.add('is-open');
      backdrop?.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
      sidebar?.classList.remove('is-open');
      backdrop?.classList.remove('is-visible');
      document.body.style.overflow = '';
    }

    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar?.classList.contains('is-open') ? closeSidebar() : openSidebar();
    });
    backdrop?.addEventListener('click', closeSidebar);

    // Close on nav link click (mobile)
    sidebar?.querySelectorAll('a.spa-link').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth < 1024) closeSidebar();
      });
    });
  }

  // SPA navigation — intercept clicks, use history API, no full reload
  static bindSpaLinks() {
    document.querySelectorAll('a.spa-link').forEach(a => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('#')) return;
        e.preventDefault();
        if (window.location.pathname === href.split('?')[0]) return; // already here
        window.history.pushState({}, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
  }
}
