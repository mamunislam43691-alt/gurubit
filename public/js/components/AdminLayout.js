/**
 * Shared admin shell — left sidebar navigation + RBAC
 */

import { fetchAdminMe, getCachedAdmin, clearAdminCache, adminCanAccess } from '../utils/adminAuth.js';

export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin', icon: 'chart-pie', perm: 'dashboard' },
  { id: 'agents', label: 'Agents', href: '/admin/agents', icon: 'user-tie', perm: 'agents' },
  { id: 'users', label: 'Users', href: '/admin/users', icon: 'users', perm: 'users' },
  { id: 'services', label: 'Service', href: '/admin/services', icon: 'globe', perm: 'services' },
  { id: 'provider', label: 'Provider', href: '/admin/provider', icon: 'server', perm: 'provider' },
  { id: 'sms-feed', label: 'SMS Feed', href: '/admin/sms-feed', icon: 'signal', perm: 'provider' },
  { id: 'leaderboard', label: 'Leaderboard', href: '/admin/leaderboard', icon: 'trophy', perm: 'leaderboard' },
  { id: 'withdraw', label: 'Withdraw', href: '/admin/withdrawals', icon: 'wallet', perm: 'withdraw' },
  { id: 'guru', label: 'Movement', href: '/admin/guru', icon: 'bolt', perm: 'users' },
  { id: 'support', label: 'Support', href: '/admin/support', icon: 'headset', perm: 'support' },
  { id: 'staff', label: 'Admin Management', href: '/admin/staff', icon: 'user-shield', perm: 'staff', superOnly: true },
  { id: 'costs', label: 'Cost Manage', href: '/admin/costs', icon: 'coins', perm: 'costs' },
  { id: 'database', label: 'Database', href: '/admin/database', icon: 'database', perm: 'settings', superOnly: true },
  { id: 'settings', label: 'Settings', href: '/admin/settings', icon: 'sliders', perm: 'settings' }
];

export class AdminLayout {
  static async ensureAuth() {
    // Use cached admin if available — no extra fetch
    const cached = getCachedAdmin();
    if (cached) {
      const path = window.location.pathname;
      if (!adminCanAccess(path, cached)) {
        window.location.href = cached.defaultPath || '/admin/support';
        return null;
      }
      return cached;
    }

    const admin = await fetchAdminMe();
    if (!admin) {
      window.location.href = '/admin';
      return null;
    }
    const path = window.location.pathname;
    if (!adminCanAccess(path, admin)) {
      window.location.href = admin.defaultPath || '/admin/support';
      return null;
    }
    return admin;
  }

  static filterNav(admin) {
    return ADMIN_NAV.filter((item) => {
      if (item.superOnly && admin.role !== 'super_admin') return false;
      if (admin.permissions?.includes('*')) return true;
      return admin.permissions?.includes(item.perm);
    });
  }

  static renderShell({ activeId, title, subtitle, bodyHtml, admin }) {
    const me = admin || getCachedAdmin();
    const nav = AdminLayout.filterNav(me);
    const roleLabel = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      supporter: 'Supporter'
    }[me?.role] || 'Admin';

    const container = document.getElementById('app');
    document.getElementById('app-skeleton')?.remove();
    container.innerHTML = `
      <div class="admin-shell min-h-screen bg-dark text-gray-200">
        <div id="adminSidebarBackdrop" class="admin-sidebar-backdrop" aria-hidden="true"></div>
        <aside id="adminSidebar" class="admin-sidebar">
          <div class="admin-sidebar-brand">
            <img src="/assets/logo.svg" alt="" class="w-9 h-9 logo-glow">
            <div>
              <p class="font-black gradient-text text-sm uppercase tracking-widest">Admin.OS</p>
              <p class="text-[9px] text-gray-500 uppercase tracking-wider">${roleLabel}</p>
            </div>
          </div>
          <nav class="admin-sidebar-nav">
            ${nav.map((item) => `
              <a href="${item.href}" class="admin-nav-link spa-link ${item.id === activeId ? 'is-active' : ''}">
                <i class="fas fa-${item.icon} w-5"></i>
                <span>${item.label}</span>
              </a>
            `).join('')}
          </nav>
          <div class="admin-sidebar-footer">
            <p class="text-[10px] text-gray-600 truncate">${me?.displayName || me?.username || ''}</p>
            <button type="button" id="adminShellLogout" class="text-[10px] font-bold text-red-400/80 hover:text-red-400 uppercase tracking-widest mt-2">Logout</button>
          </div>
        </aside>

        <div class="admin-main">
          <header class="admin-topbar">
            <button type="button" id="adminSidebarToggle" class="admin-menu-btn md:hidden" aria-label="Menu">
              <i class="fas fa-bars"></i>
            </button>
            <div class="flex-1 min-w-0">
              <h1 class="text-xl sm:text-2xl font-black text-white uppercase tracking-tight truncate">${title}</h1>
              ${subtitle ? `<p class="text-xs text-gray-500 mt-0.5">${subtitle}</p>` : ''}
            </div>
            <div class="flex items-center gap-4">
              <div class="hidden sm:flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase">
                <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                System Online
              </div>
            </div>
          </header>
          <main class="admin-content">${bodyHtml}</main>
        </div>
      </div>
    `;
    document.getElementById('adminShellLogout')?.addEventListener('click', async () => {
      clearAdminCache();
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.href = '/admin';
    });
    window.GURUBIT_THEME.updateButtons();
    const adminSidebar = document.getElementById('adminSidebar');
    const adminBackdrop = document.getElementById('adminSidebarBackdrop');
    const closeAdminNav = () => {
      adminSidebar?.classList.remove('is-open');
      adminBackdrop?.classList.remove('is-visible');
    };
    const openAdminNav = () => {
      adminSidebar?.classList.add('is-open');
      adminBackdrop?.classList.add('is-visible');
    };
    document.getElementById('adminSidebarToggle')?.addEventListener('click', () => {
      if (adminSidebar?.classList.contains('is-open')) closeAdminNav();
      else openAdminNav();
    });
    adminBackdrop?.addEventListener('click', closeAdminNav);
    document.querySelectorAll('.admin-nav-link').forEach((a) => {
      a.addEventListener('click', closeAdminNav);
    });

    // SPA navigation for admin links
    document.querySelectorAll('a.spa-link').forEach(a => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('#')) return;
        e.preventDefault();
        closeAdminNav();
        if (window.location.pathname === href.split('?')[0]) return;
        window.history.pushState({}, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
  }

  static renderLogin(onSubmit) {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="min-h-screen flex items-center justify-center px-4 bg-dark">
        <div class="w-full max-w-md animate-fade-in">
          <div class="text-center mb-10">
            <img src="/assets/logo.svg" alt="GURUBIT" class="w-20 h-20 mx-auto mb-6 logo-glow animate-float">
            <h1 class="text-4xl font-black gradient-text uppercase tracking-[0.2em]">Command Center</h1>
            <p class="text-gray-500 text-xs mt-2 uppercase tracking-widest">Super Admin · Admin · Supporter</p>
          </motion.div>
          <motion.div class="glass-card p-10 premium-shadow">
            <form id="adminLoginForm" class="space-y-5">
              <div class="space-y-2">
                <label class="stat-label ml-1">Username <span class="text-gray-600">(staff only)</span></label>
                <input type="text" id="adminUsername" class="input-field" placeholder="Leave empty for super admin" autocomplete="username">
              </div>
              <div class="space-y-2">
                <label class="stat-label ml-1">Password</label>
                <input type="password" id="adminPassword" class="input-field" placeholder="••••••••••••" required autocomplete="current-password">
              </div>
              <button type="submit" class="neon-btn w-full py-4 text-sm uppercase tracking-[0.2em]">Authenticate</button>
            </form>
            <p class="text-[10px] text-gray-600 text-center mt-6 uppercase tracking-widest">Supporters: username + password only</p>
            <div class="mt-6 text-center">
              <a href="/" class="text-[10px] font-bold text-gray-600 hover:text-primary uppercase tracking-widest">← Back to site</a>
            </div>
          </div>
        </div>
      </div>
    `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
    document.getElementById('adminLoginForm')?.addEventListener('submit', onSubmit);
  }
}
