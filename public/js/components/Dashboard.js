/**
 * User Dashboard — top ranges, agent panel at top (not bottom)
 */

import { UserLayout } from '../utils/UserLayout.js';
import { appIconMeta } from '../utils/uiHelpers.js';

export class Dashboard {
  constructor() {
    this.stats = { totalNumbers: 0, totalSms: 0, earningsBalance: 0, successRate: 0 };
    this.topApplications = [];
    this.topRanges = [];
    this.chartSeries = [];
    this.user = null;
    this._wsUnsubs = [];
    this._welcomeTimer = null;
    this._welcomeCountdown = null;
  }

  rangeFlag(r) {
    if (r.iconData) return `<img src="${r.iconData}" class="country-flag-img" width="22" height="16" alt="">`;
    return `<span class="country-flag-emoji">${r.flag || '🌍'}</span>`;
  }

  async loadData() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;

    const dash = await window.optimizedFetch('/api/user/dashboard').catch(() => ({}));
    if (dash && dash.success) {
      this.stats = dash.dashboard;
      this.topApplications = dash.dashboard.topApplications || [];
      this.topRanges = dash.dashboard.topRanges || [];
      this.chartSeries = dash.dashboard.chartSeries || this.mockChart();
    }

    this.render();
    this.setupWebSocket();
  }

  mockChart() {
    const v = this.stats.totalSms || 3;
    return Array.from({ length: 7 }, (_, i) => Math.max(0, Math.round(v * (0.25 + i * 0.1))));
  }

  setupWebSocket() {
    this._wsUnsubs.forEach(fn => fn());
    this._wsUnsubs = [];
    window.GWS.connect(this.user.id);
    this._wsUnsubs.push(window.GWS.on('otp_success', () => {
      this.stats.totalSms = (this.stats.totalSms || 0) + 1;
      this.render();
    }));
    this._wsUnsubs.push(window.GWS.on('sms_success', () => {
      this.stats.totalSms = (this.stats.totalSms || 0) + 1;
      this.render();
    }));
  }

  destroy() {
    this._wsUnsubs.forEach(fn => fn());
    this._wsUnsubs = [];
  }

  renderChart() {
    const series = this.chartSeries;
    const max = Math.max(...series, 1);
    return `
      <div class="glass-card p-5 mb-6 user-market-chart">
        <p class="stat-label mb-1">Activity overview (7 days)</p>
        <p class="text-xs text-gray-500 mb-4">SMS received trend</p>
        <div class="user-chart-bars">
          ${series.map((v, i) => `
            <div class="user-chart-col">
              <div class="user-chart-bar" style="height:${Math.max(8, (v / max) * 100)}%"></div>
              <span class="text-[9px] text-gray-600 mt-1">D${i + 1}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  renderBody() {
    const s = this.stats;
    const apps = this.topApplications.slice(0, 8).map((a) => {
      const meta = appIconMeta(a.name);
      return `
        <div class="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-all">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm shrink-0" style="background:${a.color || meta.bg}">
            <i class="${meta.icon}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-white truncate">${a.name}</p>
            <div class="w-full bg-white/5 rounded-full h-1 mt-1">
              <div class="h-1 rounded-full bg-primary" style="width:${Math.min(100, Math.round((a.count / (this.topApplications[0]?.count || 1)) * 100))}%"></div>
            </div>
          </div>
          <span class="text-xs font-black text-primary shrink-0">${a.count}</span>
        </div>`;
    }).join('');

    const ranges = this.topRanges.length
      ? this.topRanges.slice(0, 6).map((r, i) => `
        <div class="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-all">
          <span class="text-[10px] font-black text-gray-600 w-4 shrink-0">${i + 1}</span>
          <span class="text-lg shrink-0">${r.iconData ? `<img src="${r.iconData}" class="w-6 h-4 rounded object-cover">` : (r.flag || '🌍')}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-white truncate">${r.name || r.label || r.country}</p>
            <p class="text-[10px] text-gray-500 truncate">${r.server || '—'}</p>
          </div>
          <span class="text-xs font-black text-primary shrink-0">${r.count}</span>
        </div>`).join('')
      : '<p class="text-gray-500 text-sm p-4 text-center">No data yet</p>';

    const chartMax = Math.max(...(this.chartSeries || [1]), 1);

    return `
      <!-- Welcome banner -->
      <div class="glass-card p-5 mb-5 flex items-center gap-4 border border-primary/10">
        <div class="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center text-primary text-xl shrink-0">
          <i class="fas fa-user-circle"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-black text-white text-base truncate">Welcome, ${this.user?.name || 'User'} ${this.user?.isAgent ? '<span class="text-xs text-primary font-bold">(Agent)</span>' : ''}</p>
          <p class="text-xs text-gray-500 mt-0.5">Your SMS verification dashboard</p>
        </div>
        <a href="/numbers" class="neon-btn px-4 py-2 text-xs uppercase shrink-0">Get Number</a>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class="glass-card p-4 text-center">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 mx-auto mb-2">
            <i class="fas fa-mobile-alt"></i>
          </div>
          <p class="text-2xl font-black text-white">${s.totalNumbers ?? 0}</p>
          <p class="text-[10px] text-gray-500 uppercase mt-1">Numbers</p>
        </div>
        <div class="glass-card p-4 text-center">
          <div class="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary mx-auto mb-2">
            <i class="fas fa-comment-sms"></i>
          </div>
          <p class="text-2xl font-black text-primary">${s.totalSms ?? 0}</p>
          <p class="text-[10px] text-gray-500 uppercase mt-1">SMS Received</p>
        </div>
        <div class="glass-card p-4 text-center">
          <div class="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center text-green-400 mx-auto mb-2">
            <i class="fas fa-dollar-sign"></i>
          </div>
          <p class="text-2xl font-black text-green-400">$${(s.earningsBalance || 0).toFixed(2)}</p>
          <p class="text-[10px] text-gray-500 uppercase mt-1">Revenue</p>
        </div>
        <div class="glass-card p-4 text-center">
          <div class="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center text-yellow-400 mx-auto mb-2">
            <i class="fas fa-percentage"></i>
          </div>
          <p class="text-2xl font-black text-yellow-400">${s.successRate ?? 0}%</p>
          <p class="text-[10px] text-gray-500 uppercase mt-1">Success Rate</p>
        </div>
      </div>

      <!-- Chart + Top Ranges -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <!-- Activity chart -->
        <div class="lg:col-span-2 glass-card p-5">
          <div class="flex items-center justify-between mb-4">
            <p class="font-black text-white text-sm uppercase tracking-wide">Activity (7 days)</p>
            <span class="text-xs text-gray-500">${s.totalSms || 0} total SMS</span>
          </div>
          <div class="flex items-end gap-2 h-24">
            ${(this.chartSeries || Array(7).fill(0)).map((v, i) => {
              const h = Math.max(4, Math.round((v / chartMax) * 100));
              const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
              return `<div class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full rounded-t-md transition-all" style="height:${h}%;background:linear-gradient(to top,rgba(0,210,255,0.8),rgba(0,210,255,0.3));min-height:4px;" title="${v} SMS"></div>
                <span class="text-[9px] text-gray-600">${days[i] || `D${i+1}`}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <!-- Top Ranges -->
        <div class="glass-card overflow-hidden">
          <div class="px-4 py-3 border-b border-white/5">
            <p class="font-black text-white text-sm uppercase tracking-wide">Top Ranges</p>
          </div>
          <div class="divide-y divide-white/5">${ranges}</div>
        </div>
      </div>

      <!-- Top Applications -->
      <div class="glass-card overflow-hidden mb-5">
        <div class="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <p class="font-black text-white text-sm uppercase tracking-wide">Top Applications</p>
          <span class="text-xs text-gray-500">${this.topApplications.length} apps</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
          <div class="divide-y divide-white/5">${apps || '<p class="p-4 text-gray-500 text-sm">No data yet</p>'}</div>
          <div class="divide-y divide-white/5">
            ${this.topApplications.slice(8, 16).map((a) => {
              const meta = appIconMeta(a.name);
              return `
                <div class="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-all">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm shrink-0" style="background:${a.color || meta.bg}">
                    <i class="${meta.icon}"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-white truncate">${a.name}</p>
                    <div class="w-full bg-white/5 rounded-full h-1 mt-1">
                      <div class="h-1 rounded-full bg-primary" style="width:${Math.min(100, Math.round((a.count / (this.topApplications[0]?.count || 1)) * 100))}%"></div>
                    </div>
                  </div>
                  <span class="text-xs font-black text-primary shrink-0">${a.count}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <a href="/numbers" class="glass-card p-4 text-center hover:border-primary/30 transition-all border border-white/5 group">
          <i class="fas fa-mobile-alt text-2xl text-primary mb-2 block group-hover:scale-110 transition-transform"></i>
          <p class="text-xs font-bold text-white uppercase">Get Number</p>
        </a>
        <a href="/live-feed" class="glass-card p-4 text-center hover:border-cyan-500/30 transition-all border border-white/5 group">
          <i class="fas fa-satellite-dish text-2xl text-cyan-400 mb-2 block group-hover:scale-110 transition-transform"></i>
          <p class="text-xs font-bold text-white uppercase">Live SMS</p>
        </a>
        <a href="/post" class="glass-card p-4 text-center hover:border-yellow-500/30 transition-all border border-white/5 group">
          <i class="fas fa-bolt text-2xl text-yellow-400 mb-2 block group-hover:scale-110 transition-transform"></i>
          <p class="text-xs font-bold text-white uppercase">Movement</p>
        </a>
        <a href="/withdraw" class="glass-card p-4 text-center hover:border-green-500/30 transition-all border border-white/5 group">
          <i class="fas fa-wallet text-2xl text-green-400 mb-2 block group-hover:scale-110 transition-transform"></i>
          <p class="text-xs font-bold text-white uppercase">Withdraw</p>
        </a>
      </div>

      <!-- News Feed -->
      <div id="dashNewsFeed"></div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  render() {
    UserLayout.renderShell({ activeId: 'dashboard', title: 'Dashboard', bodyHtml: this.renderBody(), user: this.user });
    // Init news feed after final render (delay to avoid wipe on re-render)
    clearTimeout(this._newsFeedTimer);
    this._newsFeedTimer = setTimeout(() => {
      import('./NewsFeed.js?v=1').then(({ NewsFeed }) => {
        NewsFeed.renderSection('dashNewsFeed', 'News & Announcements');
      }).catch(() => {});
    }, 100);
    // Show welcome modal for first-time / daily login
    this.showWelcomeModal();
  }

  showWelcomeModal() {
    const today = new Date().toISOString().slice(0, 10);
    const dismissed = localStorage.getItem('welcomeDismissed');
    if (dismissed === today) return;

    const existing = document.getElementById('welcomeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'welcomeModal';
    modal.innerHTML = `
      <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4" style="background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);">
        <div class="glass-card border-primary/20 w-full max-w-md relative overflow-hidden" style="animation:fadeIn 0.3s ease;">
          <!-- Close button -->
          <button id="welcomeClose" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-400 hover:text-white transition-all z-10">
            <i class="fas fa-times text-xs"></i>
          </button>

          <!-- Header -->
          <div class="p-6 pb-3 text-center">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center text-primary text-3xl mb-4">
              <i class="fas fa-rocket"></i>
            </div>
            <h2 class="text-xl font-black text-white uppercase tracking-wide mb-2">Welcome to GURUBIT!</h2>
            <p class="text-gray-400 text-sm leading-relaxed">
              Join our community to get <strong class="text-primary">instant updates</strong>, 
              <strong class="text-primary">exclusive tips</strong>, and 
              <strong class="text-primary">24/7 support</strong> from our team.
            </p>
          </div>

          <!-- Social links -->
          <div class="px-6 pb-4 space-y-3">
            <!-- YouTube -->
            <a href="https://youtube.com/@riadalmamun4363?si=FxK0uXgy-tLoO7By" target="_blank" rel="noopener noreferrer" 
               class="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group">
              <div class="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                <i class="fab fa-youtube text-lg"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm">YouTube Channel</p>
                <p class="text-gray-500 text-[10px]">Tutorials, tips & updates</p>
              </div>
              <span class="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-black uppercase tracking-wider">Subscribe</span>
            </a>

            <!-- Telegram -->
            <a href="https://t.me/Riad_Al_MamunEn" target="_blank" rel="noopener noreferrer"
               class="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all group">
              <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <i class="fab fa-telegram-plane text-lg"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm">Telegram Group</p>
                <p class="text-gray-500 text-[10px]">Live support & community</p>
              </div>
              <span class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[10px] font-black uppercase tracking-wider">Join</span>
            </a>
          </div>

          <!-- Footer -->
          <div class="px-6 pb-5 flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" id="welcomeDontToday" class="w-4 h-4 rounded border-gray-600 bg-black/30 text-primary focus:ring-primary/50">
              <span class="text-gray-400 text-xs">Don't show today</span>
            </label>
            <div class="flex items-center gap-2">
              <span id="welcomeCountdown" class="text-gray-500 text-[10px] font-mono">10s</span>
              <button id="welcomeAccept" class="neon-btn px-4 py-2 text-xs uppercase tracking-widest">Got it!</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Auto-close countdown
    let remaining = 10;
    const countdownEl = document.getElementById('welcomeCountdown');
    this._welcomeCountdown = setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.textContent = `${remaining}s`;
      if (remaining <= 0) this.closeWelcomeModal();
    }, 1000);

    // Close handlers
    const close = () => this.closeWelcomeModal();
    document.getElementById('welcomeClose')?.addEventListener('click', () => {
      if (document.getElementById('welcomeDontToday')?.checked) {
        localStorage.setItem('welcomeDismissed', today);
      }
      close();
    });
    document.getElementById('welcomeAccept')?.addEventListener('click', () => {
      if (document.getElementById('welcomeDontToday')?.checked) {
        localStorage.setItem('welcomeDismissed', today);
      }
      close();
    });
    // Click backdrop to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  closeWelcomeModal() {
    clearInterval(this._welcomeCountdown);
    clearTimeout(this._welcomeTimer);
    const modal = document.getElementById('welcomeModal');
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.3s ease';
      setTimeout(() => modal.remove(), 300);
    }
  }

  async init() {
    await this.loadData();
  }
}
