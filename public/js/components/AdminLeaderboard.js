/**
 * Admin Leaderboard — SMS & Revenue
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminLeaderboard {
  constructor() {
    this.leaderboard = [];
    this.admin = null;
  }

  async loadData() {
    const data = await fetch('/api/admin/leaderboard').then((r) => r.json());
    if (data.success) this.leaderboard = data.leaderboard;
    this.render();
  }

  renderRow(user, rank) {
    const medals = ['🥇', '🥈', '🥉'];
    return `
      <div class="glass-card p-5 mb-3 flex justify-between items-center">
        <div class="flex items-center gap-4">
          <span class="text-xl font-black w-8 text-center">${rank <= 3 ? medals[rank - 1] : rank}</span>
          <div>
            <p class="font-black text-white uppercase text-sm">${user.name || 'Unknown'}</p>
            <p class="text-[10px] text-gray-500 font-mono">${user.email || ''}</p>
          </div>
        </div>
        <div class="flex gap-8 text-right">
          <div><p class="stat-label">SMS</p><p class="font-black text-white">${user.totalOtps || 0}</p></div>
          <div><p class="stat-label">Revenue</p><p class="font-black text-primary">$${(user.earningsBalance || 0).toFixed(2)}</p></div>
        </div>
      </div>`;
  }

  renderBody() {
    return this.leaderboard.length
      ? this.leaderboard.map((u, i) => this.renderRow(u, i + 1)).join('')
      : '<p class="text-gray-500">No data yet</p>';
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'leaderboard',
      title: 'Leaderboard',
      subtitle: `Top ${this.leaderboard.length} performers`,
      bodyHtml: this.renderBody(),
      admin: this.admin
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
  }
}
