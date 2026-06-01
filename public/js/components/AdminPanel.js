/**
 * Admin Dashboard — stats, top apps/ranges, activity chart
 */

import { AdminLayout } from './AdminLayout.js';
import { clearAdminCache } from '../utils/adminAuth.js';
import { appIconMeta } from '../utils/uiHelpers.js';

export class AdminPanel {
  constructor() {
    this.isAuthenticated = false;
    this.admin = null;
    this.stats = {};
    this.topApplications = [];
    this.topRanges = [];
    this.chart = [];
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/admin/check-auth');
      if (response.ok) {
        const data = await response.json();
        this.isAuthenticated = true;
        this.admin = data.admin;
        await this.loadStats();
      }
    } catch (err) {
      console.warn('Admin auth check failed:', err.message);
      this.isAuthenticated = false;
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const username = document.getElementById('adminUsername')?.value?.trim();
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, username: username || undefined })
    });
    const data = await response.json();
    if (response.ok) {
      clearAdminCache();
      window.location.href = data.redirect || '/admin';
    } else {
      alert(data.error?.message || 'Invalid credentials');
    }
  }

  async loadStats() {
    try {
      const response = await fetch('/api/admin/dashboard');
      if (!response.ok) return;
      const data = await response.json();
      this.stats = data.stats || {};
      this.topApplications = data.topApplications || [];
      this.topRanges = data.topRanges || [];
      this.chart = data.chart || [];
    } catch (err) {
      console.warn('Admin stats load failed:', err.message);
    }
  }

  rangeFlag(r) {
    if (r.iconData) return `<img src="${r.iconData}" class="country-flag-img" width="24" height="18" alt="">`;
    return `<span class="country-flag-emoji text-xl">${r.flag || '🌍'}</span>`;
  }

  statCard(label, value, icon, color) {
    return `
      <div class="glass-card p-4 border-white/5">
        <motion.div class="flex items-center gap-3 mb-2">
          <div class="w-9 h-9 rounded-lg bg-${color}-500/15 flex items-center justify-center text-${color}-400">
            <i class="fas fa-${icon} text-sm"></i>
          </div>
          <p class="stat-label mb-0">${label}</p>
        </div>
        <p class="text-2xl font-black text-white">${value}</p>
      </div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  renderChart() {
    return this.chart.map((c) => {
      const max = Math.max(...c.series, 1);
      const bars = c.series.map((v, i) => {
        const h = Math.round((v / max) * 100);
        return `<div class="admin-chart-bar" style="height:${h}%" title="Day ${i + 1}: ${v}"></div>`;
      }).join('');
      return `
        <div class="admin-chart-col">
          <p class="text-[10px] font-bold text-gray-500 uppercase mb-2 text-center">${c.label}</p>
          <div class="admin-chart-bars">${bars}</div>
          <p class="text-center text-primary font-black text-sm mt-2">${c.value}</p>
        </div>`;
    }).join('');
  }

  renderDashboardBody() {
    const s = this.stats;
    return `
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        ${this.statCard('Total Users', s.totalUsers ?? 0, 'users', 'blue')}
        ${this.statCard('Active Users', s.activeUsers ?? 0, 'broadcast-tower', 'green')}
        ${this.statCard('Banned Users', s.bannedUsers ?? 0, 'user-slash', 'red')}
        ${this.statCard('Total SMS', s.totalSms ?? s.totalOtps ?? 0, 'comment-sms', 'cyan')}
        ${this.statCard('Numbers', s.totalNumbers ?? 0, 'phone', 'yellow')}
        ${this.statCard('Providers', s.providers ?? 0, 'server', 'purple')}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        ${this.statCard('Agents', s.agents ?? 0, 'user-tie', 'blue')}
        ${this.statCard('Active Agents', s.activeAgents ?? 0, 'user-check', 'green')}
        ${this.statCard('Withdraw OK', s.withdrawalsSuccess ?? 0, 'check-circle', 'green')}
        ${this.statCard('Withdraw Pending', s.withdrawalsPending ?? 0, 'clock', 'yellow')}
        ${this.statCard('Support Chats', s.supportChats ?? 0, 'headset', 'cyan')}
        ${this.statCard('Broadcasts', s.broadcasts ?? 0, 'bullhorn', 'purple')}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div class="xl:col-span-2 admin-dash-card">
          <motion.div class="admin-dash-card-head">Top Applications Access</div>
          <div class="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            ${this.topApplications.map((a) => {
              const meta = appIconMeta(a.name);
              return `
              <div class="text-center p-3 rounded-xl bg-black/20 border border-white/5">
                <div class="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2 text-white text-lg" style="background:${a.color || meta.bg}">
                  <i class="${meta.icon}"></i>
                </div>
                <p class="text-xs font-bold text-white truncate">${a.name}</p>
                <p class="text-[10px] text-gray-500">${a.count} SMS</p>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="admin-dash-card">
          <div class="admin-dash-card-head">Top Ranges</div>
          <div class="max-h-[280px] overflow-y-auto divide-y divide-gray-800">
            ${this.topRanges.map((r) => `
              <div class="px-4 py-3 flex justify-between items-center text-sm gap-3">
                <div class="min-w-0 flex items-start gap-2">
                  ${this.rangeFlag(r)}
                  <motion.div>
                    <p class="text-white font-bold truncate">${r.name || r.label || r.country}</p>
                    <p class="text-[10px] text-primary font-semibold">${r.server || '—'}</p>
                  </div>
                </div>
                <span class="font-mono text-primary font-bold shrink-0">${r.count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </motion.div>

      <div class="admin-dash-card p-4">
        <p class="stat-label mb-4">Activity overview (7 days)</p>
        <div class="admin-chart-grid">${this.renderChart()}</div>
      </div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  render() {
    if (!this.isAuthenticated) {
      AdminLayout.renderLogin((e) => this.handleLogin(e));
      return;
    }
    AdminLayout.renderShell({
      activeId: 'dashboard',
      title: 'Dashboard',
      subtitle: 'Overview & analytics',
      bodyHtml: this.renderDashboardBody(),
      admin: this.admin
    });
  }

  async init() {
    try {
      await this.checkAuth();
      if (this.isAuthenticated && this.admin?.role === 'supporter') {
        window.location.href = '/admin/support';
        return;
      }
      this.render();
    } catch (err) {
      console.error('AdminPanel init error:', err);
      // Fallback: show login form
      this.isAuthenticated = false;
      this.render();
    }
  }
}
