/**
 * Admin Pending Users — shows users with unverified email
 */

import { AdminLayout } from './AdminLayout.js';
import { adminFetch } from '../utils/adminAuth.js';

export class AdminPendingUsers {
  constructor() {
    this.users = [];
    this.admin = null;
    this.search = '';
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async loadData() {
    const q = this.search ? `?q=${encodeURIComponent(this.search)}` : '';
    const uData = await adminFetch(`/api/admin/users/pending${q}`).then((r) => r.json());
    if (uData.success) this.users = uData.users;
    this.render();
  }

  async verifyEmail(id) {
    if (!confirm('Manually verify this user\'s email?')) return;
    await adminFetch(`/api/admin/users/${id}/blue-verify`, {
      method: 'PUT',
      body: JSON.stringify({ verified: true })
    });
    await this.loadData();
  }

  async deleteUser(id) {
    if (!confirm('Delete this account permanently? This cannot be undone.')) return;
    try {
      const res = await adminFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        alert(data.error?.message || 'Failed to delete user');
        return;
      }
      await this.loadData();
    } catch (err) {
      if (!err.message.includes('Session expired')) alert('Network error. Failed to delete user.');
    }
  }

  showInfoModal(user) {
    const row = (label, value, color = '') => `
      <div class="flex justify-between items-center py-2 border-b border-white/5">
        <dt class="text-xs text-gray-400 uppercase">${label}</dt>
        <dd class="text-sm font-bold ${color || 'text-white'} text-right max-w-[60%] break-all">${value ?? '—'}</dd>
      </div>`;

    const badge = (text, color) => `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-${color}-500/20 text-${color}-400">${text}</span>`;

    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 overflow-y-auto';
    m.innerHTML = `
      <div class="glass-card w-full max-w-lg p-6 my-4" style="animation:fadeIn .2s ease">
        <div class="flex items-center gap-4 mb-5">
          ${user.profilePhotoUrl
            ? `<img src="${this.esc(user.profilePhotoUrl)}" class="w-16 h-16 rounded-2xl object-cover border border-white/10">`
            : `<div class="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center"><i class="fas fa-user text-2xl text-primary"></i></div>`}
          <div>
            <p class="font-black text-white text-lg">${this.esc(user.name)}</p>
            <p class="text-xs text-gray-400">${this.esc(user.email)}</p>
            <div class="flex gap-1 mt-1 flex-wrap">
              ${badge('Pending', 'yellow')}
              ${user.blueVerified ? badge('Verified', 'blue') : badge('Unverified', 'gray')}
              ${user.isBanned ? badge('Banned', 'red') : badge('Active', 'green')}
            </div>
          </div>
        </div>

        <dl class="space-y-0 mb-5">
          ${row('User ID', user.id, 'text-gray-300 font-mono text-xs')}
          ${row('Email', user.email)}
          ${row('Phone', user.phone || '—')}
          ${row('Telegram', user.telegram || '—')}
          ${row('Agent Email', user.agentEmail || user.referralEmail || '—')}
          ${row('Email Verified', user.emailVerified ? '✅ Yes' : '❌ No')}
          ${row('Joined', user.createdAt ? new Date(user.createdAt).toLocaleString() : '—')}
        </dl>

        <div class="flex gap-2">
          <button type="button" id="verifyUserBtn" class="neon-btn flex-1 py-3 text-xs uppercase flex items-center justify-center gap-2">
            <i class="fas fa-check-circle"></i> Verify Email
          </button>
          <button type="button" id="closeInfo" class="flex-1 py-3 text-xs border border-white/10 rounded-xl text-gray-400 hover:bg-white/5 transition-all">
            Close
          </button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#closeInfo')?.addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    m.querySelector('#verifyUserBtn')?.addEventListener('click', async () => {
      m.remove();
      await this.verifyEmail(user.id);
    });
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'pending-users',
      title: 'Pending Users',
      subtitle: 'Users with unverified email — awaiting activation',
      bodyHtml: this.renderTable(),
      admin: this.admin
    });

    document.getElementById('pendingSearchBtn')?.addEventListener('click', () => {
      this.search = document.getElementById('pendingSearch')?.value?.trim() || '';
      this.loadData();
    });
    document.getElementById('pendingSearch')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.search = e.target.value.trim(); this.loadData(); }
    });
    document.querySelectorAll('.pending-view-btn').forEach((btn) => {
      const u = this.users.find((x) => x.id === btn.dataset.id);
      if (u) btn.addEventListener('click', () => this.showInfoModal(u));
    });
    document.querySelectorAll('.pending-verify-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.verifyEmail(btn.dataset.id));
    });
    document.querySelectorAll('.pending-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteUser(btn.dataset.id));
    });
  }

  renderTable() {
    return `
      <div class="mb-4 flex gap-3 items-center flex-wrap">
        <input type="search" id="pendingSearch" class="input-field flex-1" placeholder="Search by name or email..." value="${this.esc(this.search)}">
        <button type="button" id="pendingSearchBtn" class="neon-btn px-6 py-3 text-xs uppercase">Search</button>
        <div class="text-xs text-gray-500 font-bold uppercase">
          ${this.users.length} pending
        </div>
      </div>
      <div class="overflow-x-auto glass-card border border-gray-800 rounded-2xl">
        <table class="w-full text-sm text-left min-w-[700px]">
          <thead class="text-[10px] uppercase text-gray-500 border-b border-gray-800">
            <tr>
              <th class="p-4">User</th>
              <th class="p-4">Joined</th>
              <th class="p-4">Agent Email</th>
              <th class="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.users.map((u) => `
              <tr class="border-b border-gray-800 hover:bg-white/2 transition-all">
                <td class="p-4">
                  <p class="font-bold text-white">${this.esc(u.name)}</p>
                  <p class="text-[10px] text-gray-500">${this.esc(u.email)}</p>
                </td>
                <td class="p-4 text-xs text-gray-400">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                <td class="p-4 text-xs text-gray-400">${this.esc(u.agentEmail || u.referralEmail || '—')}</td>
                <td class="p-4">
                  <div class="flex gap-2 flex-wrap items-center">
                    <button type="button" class="pending-view-btn text-primary text-xs font-bold uppercase hover:underline" data-id="${u.id}">View</button>
                    <button type="button" class="pending-verify-btn px-2 py-1 rounded text-[10px] font-black uppercase bg-green-500/20 text-green-400 hover:bg-green-500/30" data-id="${u.id}">
                      <i class="fas fa-check"></i> Verify
                    </button>
                    <button type="button" class="pending-del-btn text-[10px] text-red-400 uppercase hover:underline" data-id="${u.id}">
                      <i class="fas fa-trash"></i> Del
                    </button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="p-10 text-gray-500 text-center">No pending users — all verified!</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    this.render();
    await this.loadData();
  }
}
