/**
 * Agent panel shell — same look as user panel
 */

import { UserLayout } from './UserLayout.js';

export const AGENT_NAV = [
  { id: 'overview', label: 'Dashboard', href: '/agent',         icon: 'home'    },
  { id: 'numbers',  label: 'Number',    href: '/numbers',        icon: 'mobile-alt' },
  { id: 'live-feed',label: 'Live SMS',  href: '/live-feed',      icon: 'satellite-dish' },
  { id: 'users',    label: 'Users',     href: '/agent#users',    icon: 'users'   },
  { id: 'pending',  label: 'Pending Users', href: '/agent#pending', icon: 'user-clock' },
  { id: 'api',      label: 'API',       href: '/agent#api',      icon: 'key'     }
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
      : hash === 'pending'
      ? 'pending'
      : hash === 'api'
      ? 'api'
      : activeId || 'overview';

    document.getElementById('app-skeleton')?.remove();
    document.getElementById('app').innerHTML = `
      <div class="user-shell min-h-screen bg-dark text-gray-200">
        <div id="agentSidebarBackdrop" class="agent-sidebar-backdrop"></div>
        <aside class="user-sidebar flex flex-col" id="agentSidebar">
          <a href="/agent" class="user-sidebar-brand">
            <img src="/assets/logo.svg" alt="" class="w-9 h-9">
            <span class="font-black gradient-text text-sm uppercase tracking-widest">GURUBIT</span>
          </a>
          <nav class="user-sidebar-nav flex-1">
            ${AGENT_NAV.map((n) => `
              <a href="${n.href}" class="user-nav-link ${n.id === resolved ? 'is-active' : ''}">
                <i class="fas fa-${n.icon} w-5 text-center"></i><span>${n.label}</span>
              </a>
            `).join('')}
          </nav>
          <div class="p-4 border-t border-white/5">
            <span class="text-[10px] text-primary font-bold uppercase">Agent Panel</span>
          </div>
        </aside>
        <div class="user-main">
          <header class="user-topbar sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b border-white/5"
                  style="background:rgba(2,11,24,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)">
            <button type="button" id="agentNavToggle" class="user-nav-toggle w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-all shrink-0" aria-label="Open menu">
              <i class="fas fa-bars text-sm"></i>
            </button>
            <a href="/agent" class="flex items-center gap-2 md:hidden flex-1 min-w-0">
              <img src="/assets/logo.svg" alt="" class="w-7 h-7 shrink-0">
              <span class="font-black gradient-text text-xs uppercase tracking-widest truncate">GURUBIT</span>
            </a>
            <h1 class="hidden md:block text-base font-black text-white uppercase tracking-wide flex-1">${title}</h1>
            <div class="flex items-center gap-2 shrink-0">
              ${UserLayout.profileMenuHtml(user)}
            </div>
          </header>
          <div class="md:hidden px-4 pt-3 pb-1">
            <h1 class="text-sm font-black text-white uppercase tracking-widest">${title}</h1>
          </div>
          <main class="user-content">${bodyHtml}</main>
        </div>
      </div>`;

    UserLayout.bindProfileMenu();
    window.GURUBIT_THEME.updateButtons();

    const sidebar = document.getElementById('agentSidebar');
    const backdrop = document.getElementById('agentSidebarBackdrop');
    const toggleBtn = document.getElementById('agentNavToggle');
    const closeNav = () => {
      sidebar?.classList.remove('is-open');
      backdrop?.classList.remove('is-visible');
      document.body.style.overflow = '';
    };
    const openNav = () => {
      sidebar?.classList.add('is-open');
      backdrop?.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    };
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar?.classList.contains('is-open') ? closeNav() : openNav();
    });
    backdrop?.addEventListener('click', closeNav);
    document.querySelectorAll('.user-nav-link').forEach((a) => {
      a.addEventListener('click', () => { if (window.innerWidth < 1024) closeNav(); });
    });
  }
}
