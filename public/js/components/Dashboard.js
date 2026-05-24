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
  }

  rangeFlag(r) {
    if (r.iconData) return `<img src="${r.iconData}" class="country-flag-img" width="22" height="16" alt="">`;
    return `<span class="country-flag-emoji">${r.flag || '🌍'}</span>`;
  }

  async loadData() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;

    const dash = await fetch('/api/user/dashboard').then((r) => r.json()).catch(() => ({}));
    if (dash.success) {
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
    const apps = this.topApplications.slice(0, 10).map((a) => {
      const meta = appIconMeta(a.name);
      return `
        <div class="user-app-tile">
          <div class="user-app-icon" style="background:${a.color || meta.bg}"><i class="${meta.icon}"></i></div>
          <p class="user-app-name">${a.name}</p>
          <p class="user-app-count">${a.count} SMS</p>
        </div>`;
    }).join('');

    const ranges = this.topRanges.length
      ? this.topRanges.map((r) => `
        <div class="user-range-item">
          <span class="user-range-flag">${this.rangeFlag(r)}</span>
          <span class="user-range-name">${r.name || r.label || r.country}</span>
          <span class="user-range-server">${r.server || '—'}</span>
          <span class="user-range-count">${r.count || 0}</span>
        </div>
      `).join('')
      : '<p class="text-gray-500 text-sm p-4">No range data yet</p>';

    return `
      <p class="text-gray-500 text-sm mb-4">Welcome, <strong class="text-white">${this.user?.name || 'User'}</strong>${this.user?.isAgent ? ' <span class="text-primary text-xs">(Agent)</span>' : ''}</p>
      ${this.user?.isAgent ? '<p class="text-xs text-gray-500 mb-4 glass-card p-3 border border-primary/20">Agent controls (Dashboard, Users, Requests, Numbers) are on the <a href="/numbers" class="text-primary font-bold">Number</a> page.</p>' : ''}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div class="glass-card p-4">
          <p class="stat-label">Numbers Taken</p>
          <p class="text-2xl font-black text-white">${this.stats.totalNumbers ?? 0}</p>
        </div>
        <div class="glass-card p-4">
          <p class="stat-label">SMS Received</p>
          <p class="text-2xl font-black text-primary">${this.stats.totalSms ?? 0}</p>
        </div>
        <div class="glass-card p-4">
          <p class="stat-label">Revenue</p>
          <p class="text-2xl font-black text-green-400">$${(this.stats.earningsBalance || 0).toFixed(2)}</p>
        </div>
      </div>

      ${this.renderChart()}

      <div class="user-dash-layout mb-6">
        <div class="user-dash-main">
          <div class="user-dash-card">
            <div class="user-dash-card-head">Top Applications Access</div>
            <div class="user-apps-grid">${apps || '<p class="p-4 text-gray-500 text-sm">No data</p>'}</div>
          </div>
        </div>
        <aside class="user-dash-side user-dash-side--ranges">
          <div class="user-dash-card user-dash-card--ranges">
            <div class="user-dash-card-head">Top Ranges</div>
            <div class="user-ranges-list">${ranges}</div>
          </div>
        </aside>
      </div>

      <a href="/numbers" class="neon-btn inline-flex px-6 py-2.5 text-xs uppercase">Get Number</a>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  render() {
    UserLayout.renderShell({ activeId: 'dashboard', title: 'Dashboard', bodyHtml: this.renderBody(), user: this.user });
  }

  async init() {
    await this.loadData();
  }
}
