/**
 * Withdraw Page — user payout requests
 */

import { UserLayout } from '../utils/UserLayout.js';

export class WithdrawPage {
  constructor() {
    this.user = null;
    this.history = [];
    this.userProfile = null;
  }

  async loadData() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;

    const profileData = await fetch('/api/user/profile').then((r) => r.json());
    this.userProfile = profileData.profile;

    const historyData = await fetch('/api/user/withdrawal-history').then((r) => r.json());
    this.history = historyData.withdrawals || [];

    this.render();
  }

  async handleSubmit(e) {
    e.preventDefault();
    const amount = document.getElementById('withdrawAmount').value;
    if (amount < 30) {
      alert('Minimum withdrawal is 30 USD');
      return;
    }
    const res = await fetch('/api/user/withdrawal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    if (data.success) {
      alert('Withdrawal request submitted');
      this.loadData();
    } else {
      alert(data.error?.message || 'Failed');
    }
  }

  renderBody() {
    return `
      <div class="max-w-3xl space-y-6">
        <div class="glass-card p-8 text-center">
          <p class="stat-label">Available Revenue</p>
          <p class="text-4xl font-black text-primary">$${(this.userProfile?.earningsBalance || 0).toFixed(2)}</p>
        </div>
        <div class="glass-card p-8">
          <h2 class="font-black text-white uppercase text-sm mb-6 text-center">Request Withdrawal</h2>
          <form id="withdrawForm" class="space-y-4">
            <div>
              <label class="stat-label block mb-1">Amount (USD)</label>
              <input type="number" id="withdrawAmount" min="30" value="30" class="input-field w-full" required>
              <p class="text-[10px] text-gray-500 mt-1">Minimum $30</p>
            </div>
            <div class="glass-card p-4 border-white/5">
              <p class="stat-label mb-2">USDT TRC20</p>
              <p class="font-mono text-sm text-white break-all">${this.userProfile?.cryptoAddress || 'Set address in Profile'}</p>
              ${!this.userProfile?.cryptoAddress ? '<a href="/profile" class="text-primary text-xs font-bold uppercase mt-2 inline-block">Edit Profile →</a>' : ''}
            </div>
            <button type="submit" class="neon-btn w-full py-3 text-xs uppercase">Submit Request</button>
          </form>
        </div>
        <div class="glass-card p-8">
          <h2 class="font-black text-white uppercase text-sm mb-4">History</h2>
          ${this.history.length ? this.history.map((item) => `
            <div class="flex justify-between items-center py-3 border-b border-white/5">
              <div>
                <p class="font-black text-white">$${item.amount.toFixed(2)}</p>
                <p class="text-[10px] text-gray-500">${new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
              <span class="text-[10px] font-bold uppercase ${item.status === 'pending' ? 'text-yellow-400' : item.status === 'approved' ? 'text-green-400' : 'text-red-400'}">${item.status}</span>
            </div>
          `).join('') : '<p class="text-gray-500 text-sm">No records</p>'}
        </div>
      </div>`;
  }

  render() {
    UserLayout.renderShell({
      activeId: 'profile',
      title: 'Withdraw',
      bodyHtml: this.renderBody(),
      user: this.user
    });
    document.getElementById('withdrawForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  async init() {
    await this.loadData();
  }
}
