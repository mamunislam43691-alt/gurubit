/**
 * Agent panel shell — same look as user panel
 */

import { UserLayout } from './UserLayout.js';

export const AGENT_NAV = [
  { id: 'overview', label: 'Dashboard', href: '/agent', icon: 'home' },
  { id: 'numbers', label: 'Number', href: '/numbers', icon: 'mobile-alt' },
  { id: 'live-feed', label: 'Live SMS', href: '/live-feed', icon: 'satellite-dish' },
  { id: 'users', label: 'Users', href: '/agent#users', icon: 'users' },
  { id: 'approve', label: 'User Requests', href: '/agent#approve', icon: 'user-check' },
  { id: 'api', label: 'API', href: '/agent#api', icon: 'key' }
];

export class AgentLayout {
  static renderShell({ activeId, title, bodyHtml, user }) {
    const hash = window.location.hash.replace('#', '');
    const resolved = window.location.pathname === '/numbers'
      ? 'numbers'
      : window.location.pathname === '/live-feed'
      ? 'live-feed'
      : hash === 'users'
      ? 'users'
      : hash === 'approve'
      ? 'approve'
      : hash === 'api'
      ? 'api'
      : activeId || 'overview';

    document.getElementById('app').innerHTML = `
      <motion.div class="user-shell min-h-screen bg-dark text-gray-200">
        <button type="button" id="agentNavToggle" class="user-nav-toggle" aria-label="Menu"><i class="fas fa-bars"></i></button>
        <div id="agentSidebarBackdrop" class="agent-sidebar-backdrop" aria-hidden="true"></div>
        <aside class="user-sidebar" id="agentSidebar">
          <a href="/agent" class="user-sidebar-brand">
            <img src="/assets/logo.svg" alt="" class="w-9 h-9">
            <span class="font-black gradient-text text-sm uppercase">Agent</span>
          </a>
          <nav class="user-sidebar-nav">
            ${AGENT_NAV.map((n) => `
              <a href="${n.href}" class="user-nav-link ${n.id === resolved ? 'is-active' : ''}">
                <i class="fas fa-${n.icon} w-5"></i><span>${n.label}</span>
              </a>
            `).join('')}
          </nav>
        </aside>
        <div class="user-main">
          <header class="user-topbar flex justify-between items-center">
            <h1 class="text-lg font-black text-white uppercase tracking-wide">${title}</h1>
            <div class="flex items-center gap-4">
              <button id="agentThemeToggleBtn" type="button" class="theme-toggle-btn w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                <i class="fas fa-sun text-sm"></i>
              </button>
              ${UserLayout.profileMenuHtml(user)}
            </div>
          </header>
          <main class="user-content px-4 pb-10">${bodyHtml}</main>
        </div>
      </motion.div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');

    UserLayout.bindProfileMenu();
    document.getElementById('agentThemeToggleBtn')?.addEventListener('click', () => {
      window.GURUBIT_THEME.toggle();
    });
    window.GURUBIT_THEME.updateButtons();

    const sidebar = document.getElementById('agentSidebar');
    const backdrop = document.getElementById('agentSidebarBackdrop');
    const toggleBtn = document.getElementById('agentNavToggle');
    const closeNav = () => {
      sidebar?.classList.remove('is-open');
      backdrop?.classList.remove('is-visible');
    };
    const openNav = () => {
      sidebar?.classList.add('is-open');
      backdrop?.classList.add('is-visible');
    };
    toggleBtn?.addEventListener('click', () => {
      if (sidebar?.classList.contains('is-open')) closeNav();
      else openNav();
    });
    backdrop?.addEventListener('click', closeNav);
    document.querySelectorAll('.user-nav-link').forEach((a) => {
      a.addEventListener('click', closeNav);
    });
  }
}
