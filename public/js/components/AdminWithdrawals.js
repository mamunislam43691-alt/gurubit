/**
 * Admin Withdrawals
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminWithdrawals {
  constructor() {
    this.withdrawals = [];
    this.admin = null;
  }

  async loadData() {
    const data = await fetch('/api/admin/withdrawals').then((r) => r.json());
    if (data.success) this.withdrawals = data.withdrawals;
    this.render();
  }

  async handleApprove(id) {
    if (!confirm('Approve withdrawal?')) return;
    const res = await fetch(`/api/admin/withdrawals/${id}/approve`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) this.loadData();
    else alert(data.error?.message || 'Failed');
  }

  async handleReject(id) {
    if (!confirm('Reject withdrawal?')) return;
    await fetch(`/api/admin/withdrawals/${id}/reject`, { method: 'PUT' });
    this.loadData();
  }

  renderCard(w) {
    const isPending = w.status === 'pending';
    return `
      <div class="glass-card p-6 mb-4 flex flex-wrap justify-between gap-4 items-center">
        <div>
          <p class="text-2xl font-black text-white">$${(w.amount || 0).toFixed(2)}</p>
          <p class="text-xs text-gray-500">${w.userName || w.userId} · ${new Date(w.createdAt).toLocaleString()}</p>
          <span class="text-[10px] uppercase font-bold ${w.status === 'pending' ? 'text-yellow-400' : w.status === 'approved' ? 'text-green-400' : 'text-red-400'}">${w.status}</span>
        </div>
        ${isPending ? `
          <motion.div class="flex gap-2">
            <button type="button" class="approve-btn neon-btn px-4 py-2 text-xs" data-id="${w.id}">Approve</button>
            <button type="button" class="reject-btn text-red-400 text-xs font-bold uppercase" data-id="${w.id}">Reject</button>
          </div>
        ` : ''}
      </div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  renderBody() {
    const pending = this.withdrawals.filter((w) => w.status === 'pending').length;
    return `
      <p class="text-gray-500 text-sm mb-4">${pending} pending request(s)</p>
      ${this.withdrawals.length ? this.withdrawals.map((w) => this.renderCard(w)).join('') : '<p class="text-gray-500">No withdrawals</p>'}
    `;
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'withdraw',
      title: 'Withdraw',
      subtitle: 'Approve or reject payout requests',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });
    document.querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.handleApprove(btn.dataset.id));
    });
    document.querySelectorAll('.reject-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.handleReject(btn.dataset.id));
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
  }
}
