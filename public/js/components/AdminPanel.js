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
        ${this.statCard('Failed Numbers', s.failedNumbers ?? 0, 'times-circle', 'red')}
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

      <!-- News Feed -->
      <div id="adminNewsFeed" class="mb-8"></div>

      <!-- Speed Section -->
      <div class="admin-dash-card mb-8">
        <div class="admin-dash-card-head flex items-center justify-between">
          <span><i class="fas fa-bolt mr-2 text-yellow-400"></i>SMS Delivery Speed</span>
          <span class="text-[10px] font-bold text-gray-400 uppercase">Last 24h</span>
        </div>
        <div class="p-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="adminSpeedStats">
            <div class="text-center p-4 rounded-xl bg-black/20 border border-white/5">
              <p class="text-3xl font-black text-primary neon-text">${s.avgSpeed ?? '<2s'}</p>
              <p class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Avg Delivery</p>
            </div>
            <div class="text-center p-4 rounded-xl bg-black/20 border border-white/5">
              <p class="text-3xl font-black text-green-400">${s.successRate ?? '98%'}</p>
              <p class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Success Rate</p>
            </div>
            <div class="text-center p-4 rounded-xl bg-black/20 border border-white/5">
              <p class="text-3xl font-black text-yellow-400">${s.totalSms ?? s.totalOtps ?? 0}</p>
              <p class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Total SMS</p>
            </div>
            <div class="text-center p-4 rounded-xl bg-black/20 border border-white/5">
              <p class="text-3xl font-black text-red-400">${s.failedNumbers ?? 0}</p>
              <p class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Failed</p>
            </div>
          </div>
          <div class="mt-4">
            <p class="stat-label mb-3">Activity overview (7 days)</p>
            <div class="admin-chart-grid">${this.renderChart()}</div>
          </div>
        </div>
      </div>

      <!-- Announcement Section -->
      <div class="admin-dash-card mb-8">
        <div class="admin-dash-card-head flex items-center justify-between">
          <span><i class="fas fa-bullhorn mr-2 text-purple-400"></i>Announcements</span>
          <button id="adminCreateAnnBtn" class="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-all">+ New</button>
        </div>
        <div class="p-4" id="adminAnnList">
          <p class="text-gray-500 text-sm">Loading announcements...</p>
        </div>
      </div>

      <!-- Top Applications & Ranges -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div class="xl:col-span-2 admin-dash-card">
          <div class="admin-dash-card-head">Top Applications Access</div>
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
                  <div>
                    <p class="text-white font-bold truncate">${r.name || r.label || r.country}</p>
                    <p class="text-[10px] text-primary font-semibold">${r.server || '—'}</p>
                  </div>
                </div>
                <span class="font-mono text-primary font-bold shrink-0">${r.count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
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
    // Init news feed after render
    import('./NewsFeed.js?v=1').then(({ NewsFeed }) => {
      NewsFeed.renderSection('adminNewsFeed', 'News & Announcements');
    }).catch(() => {});
    // Load announcements list
    this.loadAnnouncements();
    // Bind create announcement button
    const btn = document.getElementById('adminCreateAnnBtn');
    if (btn) btn.addEventListener('click', () => this.openAnnouncementForm());
  }

  async loadAnnouncements() {
    const container = document.getElementById('adminAnnList');
    if (!container) return;
    try {
      const res = await fetch('/api/social/announcements');
      const data = await res.json();
      const items = data.announcements || [];
      if (!items.length) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No announcements yet.</p>';
        return;
      }
      container.innerHTML = items.slice(0, 5).map(a => `
        <div class="flex items-start gap-3 p-3 rounded-lg bg-black/20 border border-white/5 mb-2">
          <div class="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
            <i class="fas fa-${a.type === 'news' ? 'newspaper' : a.type === 'update' ? 'sync' : a.type === 'alert' ? 'exclamation-triangle' : 'bullhorn'} text-xs"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="text-white text-sm font-bold truncate">${a.title || 'Untitled'}</p>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/25">${a.type || 'announcement'}</span>
              ${a.pinned ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">Pinned</span>' : ''}
            </div>
            <p class="text-gray-400 text-xs mt-0.5 line-clamp-2">${a.body || ''}</p>
            <p class="text-gray-600 text-[10px] mt-1">${a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button data-ann-pin="${a.id}" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-yellow-400 transition-all" title="${a.pinned ? 'Unpin' : 'Pin'}">
              <i class="fas fa-thumbtack text-[10px]"></i>
            </button>
            <button data-ann-del="${a.id}" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/15 flex items-center justify-center text-gray-400 hover:text-red-400 transition-all" title="Delete">
              <i class="fas fa-trash text-[10px]"></i>
            </button>
          </div>
        </div>
      `).join('');
      // Bind pin/delete
      container.querySelectorAll('[data-ann-pin]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.annPin;
          await fetch(`/api/social/announcements/${id}`, { method: 'PUT' });
          this.loadAnnouncements();
        });
      });
      container.querySelectorAll('[data-ann-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this announcement?')) return;
          const id = btn.dataset.annDel;
          await fetch(`/api/social/announcements/${id}`, { method: 'DELETE' });
          this.loadAnnouncements();
        });
      });
    } catch (err) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Failed to load announcements.</p>';
    }
  }

  openAnnouncementForm() {
    const existing = document.getElementById('adminAnnForm');
    if (existing) { existing.remove(); return; }
    const card = document.querySelector('.admin-dash-card:last-child .admin-dash-card-head')?.parentElement;
    if (!card) return;
    const formHtml = `
      <div id="adminAnnForm" class="p-4 border-t border-white/5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input type="text" id="annTitle" class="input-field w-full" placeholder="Title" required>
          <select id="annType" class="input-field w-full">
            <option value="announcement">Announcement</option>
            <option value="news">News</option>
            <option value="update">Update</option>
            <option value="alert">Alert</option>
          </select>
        </div>
        <textarea id="annBody" class="input-field w-full mb-3" rows="3" placeholder="Body text..." required></textarea>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input type="text" id="annImage" class="input-field w-full" placeholder="Image URL (optional)">
          <input type="text" id="annVideo" class="input-field w-full" placeholder="Video URL (optional)">
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input type="text" id="annCtaLabel" class="input-field w-full" placeholder="CTA label (optional)">
          <input type="text" id="annCtaUrl" class="input-field w-full" placeholder="CTA URL (optional)">
        </div>
        <div class="flex items-center gap-3 mb-3">
          <label class="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" id="annPinned" class="rounded"> Pin to top
          </label>
        </div>
        <div class="flex gap-2">
          <button id="annSubmitBtn" class="neon-btn px-4 py-2 text-xs uppercase tracking-widest">Post</button>
          <button id="annCancelBtn" class="px-4 py-2 text-xs font-bold text-gray-400 border border-white/10 rounded-lg hover:border-white/20 transition-all">Cancel</button>
        </div>
      </div>`;
    card.insertAdjacentHTML('beforeend', formHtml);
    document.getElementById('annCancelBtn').addEventListener('click', () => document.getElementById('adminAnnForm')?.remove());
    document.getElementById('annSubmitBtn').addEventListener('click', async () => {
      const title = document.getElementById('annTitle').value.trim();
      const body = document.getElementById('annBody').value.trim();
      const type = document.getElementById('annType').value;
      if (!title || !body) { alert('Title and body required'); return; }
      const payload = {
        title, body, type,
        image: document.getElementById('annImage').value.trim() || null,
        videoUrl: document.getElementById('annVideo').value.trim() || null,
        ctaLabel: document.getElementById('annCtaLabel').value.trim() || null,
        ctaUrl: document.getElementById('annCtaUrl').value.trim() || null,
        pinned: document.getElementById('annPinned').checked
      };
      try {
        const res = await fetch('/api/social/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          document.getElementById('adminAnnForm')?.remove();
          this.loadAnnouncements();
        } else {
          alert('Failed to create announcement');
        }
      } catch { alert('Network error'); }
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
