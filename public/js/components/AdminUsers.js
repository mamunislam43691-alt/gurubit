/**
 * Admin Users & Agents (separate views)
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminUsers {
  constructor() {
    this.users = [];
    this.agents = [];
    this.admin = null;
    this.search = '';
    this.agentsOnly = window.location.pathname === '/admin/agents';
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async loadData() {
    if (this.agentsOnly) {
      const aData = await fetch('/api/admin/agents/stats').then((r) => r.json());
      if (aData.success) this.agents = aData.agents;
    } else {
      const q = this.search ? `?q=${encodeURIComponent(this.search)}` : '';
      const uData = await fetch(`/api/admin/users/search${q}`).then((r) => r.json());
      if (uData.success) this.users = uData.users.filter((u) => !u.isAgent);
    }
    this.render();
  }

  async toggleBan(id, isBanned) {
    await fetch(`/api/admin/users/${id}/${isBanned ? 'unban' : 'ban'}`, { method: 'PUT' });
    await this.loadData();
  }

  async blueVerify(id, verified) {
    await fetch(`/api/admin/users/${id}/blue-verify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified })
    });
    await this.loadData();
  }

  async deleteUser(id) {
    if (!confirm('Delete this account permanently?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    await this.loadData();
  }

  // ── Agent VIEW modal ──────────────────────────────────────────────
  showAgentViewModal(agent) {
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
        <!-- Header -->
        <div class="flex items-center gap-4 mb-5">
          ${agent.profilePhotoUrl
            ? `<img src="${this.esc(agent.profilePhotoUrl)}" class="w-16 h-16 rounded-2xl object-cover border border-white/10">`
            : `<div class="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center"><i class="fas fa-user-tie text-2xl text-primary"></i></div>`}
          <div>
            <p class="font-black text-white text-lg">${this.esc(agent.name)}
              ${agent.blueVerified ? '<i class="fas fa-check-circle text-primary text-sm ml-1"></i>' : ''}
            </p>
            <p class="text-xs text-gray-400">${this.esc(agent.email)}</p>
            <div class="flex gap-1 mt-1 flex-wrap">
              ${badge('Agent', 'cyan')}
              ${agent.blueVerified ? badge('Verified', 'blue') : badge('Unverified', 'gray')}
              ${agent.isBanned ? badge('Banned', 'red') : badge('Active', 'green')}
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="glass-card p-3 text-center">
            <p class="text-xl font-black text-primary">${agent.memberCount || 0}</p>
            <p class="text-[10px] text-gray-400 uppercase">Members</p>
          </div>
          <div class="glass-card p-3 text-center">
            <p class="text-xl font-black text-green-400">${agent.totalSms || 0}</p>
            <p class="text-[10px] text-gray-400 uppercase">SMS</p>
          </div>
          <div class="glass-card p-3 text-center">
            <p class="text-xl font-black text-yellow-400">$${(agent.revenue || 0).toFixed(2)}</p>
            <p class="text-[10px] text-gray-400 uppercase">Revenue</p>
          </div>
        </div>

        <!-- Details -->
        <dl class="space-y-0 mb-5">
          ${row('User ID', agent.id, 'text-gray-300 font-mono text-xs')}
          ${row('Email', agent.email)}
          ${row('Phone', agent.phone || agent.identificationNumber)}
          ${row('Telegram', agent.telegram)}
          ${row('USDT Wallet', agent.cryptoAddress, 'font-mono text-xs text-cyan-300')}
          ${row('Active Members', agent.activeMembers ?? 0, 'text-green-400')}
          ${row('Total Numbers', agent.totalNumbers ?? 0, 'text-cyan-300')}
          ${row('Earnings Balance', `$${(agent.earningsBalance || 0).toFixed(2)}`, 'text-primary')}
          ${row('Total OTPs', agent.totalOtps || 0)}
          ${row('Failed OTPs', agent.failedOtps || 0, 'text-red-400')}
          ${row('Agent Since', agent.agentSince ? new Date(agent.agentSince).toLocaleString() : (agent.createdAt ? new Date(agent.createdAt).toLocaleString() : '—'))}
          ${row('Last Updated', agent.updatedAt ? new Date(agent.updatedAt).toLocaleString() : '—')}
          ${row('Email Verified', agent.emailVerified ? '✅ Yes' : '❌ No')}
          ${row('Banned', agent.isBanned ? '🚫 Yes' : '✅ No')}
        </dl>

        <button type="button" id="closeAgentView" class="w-full py-3 border border-white/10 rounded-xl text-gray-400 text-sm hover:bg-white/5 transition-all">
          Close
        </button>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#closeAgentView')?.addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  // ── User VIEW modal ───────────────────────────────────────────────
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
        <!-- Header -->
        <div class="flex items-center gap-4 mb-5">
          ${user.profilePhotoUrl
            ? `<img src="${this.esc(user.profilePhotoUrl)}" class="w-16 h-16 rounded-2xl object-cover border border-white/10">`
            : `<div class="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center"><i class="fas fa-user text-2xl text-primary"></i></div>`}
          <div>
            <p class="font-black text-white text-lg">${this.esc(user.name)}
              ${user.blueVerified ? '<i class="fas fa-check-circle text-primary text-sm ml-1"></i>' : ''}
            </p>
            <p class="text-xs text-gray-400">${this.esc(user.email)}</p>
            <div class="flex gap-1 mt-1 flex-wrap">
              ${badge('User', 'purple')}
              ${user.blueVerified ? badge('Verified', 'blue') : badge('Unverified', 'gray')}
              ${user.isBanned ? badge('Banned', 'red') : badge('Active', 'green')}
              ${user.isGuest ? badge('Guest', 'yellow') : ''}
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="glass-card p-3 text-center">
            <p class="text-xl font-black text-cyan-300">${user.totalNumbers ?? 0}</p>
            <p class="text-[10px] text-gray-400 uppercase">Numbers</p>
          </div>
          <div class="glass-card p-3 text-center">
            <p class="text-xl font-black text-green-400">${user.totalOtps || 0}</p>
            <p class="text-[10px] text-gray-400 uppercase">SMS</p>
          </div>
          <div class="glass-card p-3 text-center">
            <p class="text-xl font-black text-primary">$${(user.earningsBalance || 0).toFixed(2)}</p>
            <p class="text-[10px] text-gray-400 uppercase">Balance</p>
          </div>
        </div>

        <!-- Details -->
        <dl class="space-y-0 mb-5">
          ${row('User ID', user.id, 'text-gray-300 font-mono text-xs')}
          ${row('Email', user.email)}
          ${row('Phone', user.phone || user.identificationNumber)}
          ${row('Telegram', user.telegram)}
          ${row('USDT Wallet', user.cryptoAddress, 'font-mono text-xs text-cyan-300')}
          ${row('Agent Email', user.agentEmail || user.referralEmail)}
          ${row('Agent Approved', user.agentApproved ? '✅ Yes' : '❌ Pending')}
          ${row('Earnings Balance', `$${(user.earningsBalance || 0).toFixed(2)}`, 'text-primary')}
          ${row('Failed OTPs', user.failedOtps || 0, 'text-red-400')}
          ${row('Email Verified', user.emailVerified ? '✅ Yes' : '❌ No')}
          ${row('Banned', user.isBanned ? '🚫 Yes' : '✅ No')}
          ${row('Joined', user.createdAt ? new Date(user.createdAt).toLocaleString() : '—')}
          ${row('Last Updated', user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '—')}
        </dl>

        <button type="button" id="closeInfo" class="w-full py-3 border border-white/10 rounded-xl text-gray-400 text-sm hover:bg-white/5 transition-all">
          Close
        </button>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#closeInfo')?.addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  showUnagentModal(agent) {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70';
    m.innerHTML = `
      <div class="glass-card max-w-md w-full p-6">
        <h3 class="font-black text-white uppercase mb-2">Remove agent</h3>
        <p class="text-sm text-gray-400 mb-4">Transfer ${agent.memberCount || 0} member(s) to another agent email.</p>
        <input type="email" id="transferEmail" class="input-field w-full mb-4" placeholder="Target agent email">
        <div class="flex gap-2">
          <button type="button" id="confirmUnagent" class="neon-btn flex-1 py-2 text-xs uppercase">Transfer & Un-agent</button>
          <button type="button" id="cancelUnagent" class="flex-1 py-2 text-xs border border-white/10 rounded-lg text-gray-400">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#cancelUnagent')?.addEventListener('click', () => m.remove());
    m.querySelector('#confirmUnagent')?.addEventListener('click', async () => {
      const transferToEmail = m.querySelector('#transferEmail')?.value?.trim();
      if (!transferToEmail) return alert('Enter target agent email');
      const res = await fetch(`/api/admin/agents/${agent.id}/unagent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferToEmail })
      });
      const data = await res.json();
      if (data.success) { m.remove(); await this.loadData(); }
      else alert(data.error?.message || 'Failed');
    });
  }

  renderAgents() {
    return `
      <div class="mb-4 flex justify-between items-center">
        <div></div>
        <button type="button" id="addAgentBtn" class="neon-btn px-6 py-3 text-xs uppercase flex items-center gap-2">
          <i class="fas fa-user-plus"></i> Add Agent
        </button>
      </div>
      <div class="overflow-x-auto glass-card border border-gray-800 rounded-2xl">
        <table class="w-full text-sm text-left min-w-[900px]">
          <thead class="text-[10px] uppercase text-gray-500 border-b border-gray-800">
            <tr>
              <th class="p-4">Agent</th>
              <th class="p-4">Email</th>
              <th class="p-4">View</th>
              <th class="p-4">Members</th>
              <th class="p-4">Active</th>
              <th class="p-4">Numbers</th>
              <th class="p-4">SMS</th>
              <th class="p-4">Revenue</th>
              <th class="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.agents.map((a) => `
              <tr class="border-b border-gray-800 hover:bg-white/2 transition-all">
                <td class="p-4 font-bold text-white">
                  ${this.esc(a.name)}
                  ${a.blueVerified ? '<i class="fas fa-check-circle text-primary text-xs ml-1"></i>' : ''}
                </td>
                <td class="p-4 text-gray-400 text-xs">${this.esc(a.email)}</td>
                <td class="p-4">
                  <button type="button" class="agent-view-btn text-primary text-xs font-bold uppercase hover:underline" data-id="${a.id}">
                    View
                  </button>
                </td>
                <td class="p-4 text-primary font-black text-lg">${a.memberCount || 0}</td>
                <td class="p-4 text-green-400 font-black text-lg">${a.activeMembers ?? 0}</td>
                <td class="p-4 text-cyan-300 font-black text-lg">${a.totalNumbers ?? 0}</td>
                <td class="p-4 text-base">${a.totalSms || 0}</td>
                <td class="p-4 text-primary font-bold text-base">$${(a.revenue || 0).toFixed(2)}</td>
                <td class="p-4">
                  <div class="agent-actions">
                    <button type="button" class="agent-pill agent-pill--blue blue-btn" data-id="${a.id}" data-v="${!!a.blueVerified}">${a.blueVerified ? 'Unverify' : 'Blue ✓'}</button>
                    <button type="button" class="agent-pill agent-pill--orange unagent-btn" data-id="${a.id}">Un-agent</button>
                    <button type="button" class="agent-pill agent-pill--red del-agent-btn" data-id="${a.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="p-10 text-gray-500 text-center">No agents</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  renderUsers() {
    return `
      <div class="mb-4 flex gap-3">
        <input type="search" id="userSearch" class="input-field flex-1" placeholder="Search user or agent email..." value="${this.esc(this.search)}">
        <button type="button" id="userSearchBtn" class="neon-btn px-6 py-3 text-xs uppercase">Search</button>
      </div>
      <div class="overflow-x-auto glass-card border border-gray-800 rounded-2xl">
        <table class="w-full text-sm text-left min-w-[800px]">
          <thead class="text-[10px] uppercase text-gray-500 border-b border-gray-800">
            <tr>
              <th class="p-4">User</th>
              <th class="p-4">Info</th>
              <th class="p-4">Agent Mail</th>
              <th class="p-4">Numbers</th>
              <th class="p-4">SMS</th>
              <th class="p-4">Revenue</th>
              <th class="p-4">Verify</th>
              <th class="p-4">Ban</th>
            </tr>
          </thead>
          <tbody>
            ${this.users.map((u) => `
              <tr class="border-b border-gray-800 hover:bg-white/2 transition-all">
                <td class="p-4">
                  <p class="font-bold text-white">${this.esc(u.name)}</p>
                  <p class="text-[10px] text-gray-500">${this.esc(u.email)}</p>
                </td>
                <td class="p-4">
                  <button type="button" class="info-btn text-primary text-xs font-bold uppercase hover:underline" data-id="${u.id}">View</button>
                </td>
                <td class="p-4 text-xs text-gray-400">${this.esc(u.agentEmail || u.referralEmail || '—')}</td>
                <td class="p-4 font-bold text-cyan-300">${u.totalNumbers ?? 0}</td>
                <td class="p-4 font-bold">${u.totalOtps || 0}</td>
                <td class="p-4 text-primary font-bold">$${(u.earningsBalance || 0).toFixed(2)}</td>
                <td class="p-4">
                  <button type="button" class="blue-btn text-xs font-bold uppercase text-primary" data-id="${u.id}" data-v="${!!u.blueVerified}">
                    ${u.blueVerified ? 'Unverify' : 'Blue ✓'}
                  </button>
                </td>
                <td class="p-4">
                  <button type="button" class="ban-btn px-2 py-1 rounded text-[10px] font-black uppercase ${u.isBanned ? 'bg-green-500 text-dark' : 'bg-red-500 text-white'}" data-id="${u.id}" data-banned="${!!u.isBanned}">
                    ${u.isBanned ? 'Unban' : 'Ban'}
                  </button>
                  <button type="button" class="del-user-btn text-[10px] text-red-400 ml-2 uppercase" data-id="${u.id}">Del</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="8" class="p-8 text-gray-500 text-center">No users</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  showAddAgentModal() {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70';
    m.innerHTML = `
      <div class="glass-card max-w-md w-full p-6" style="animation: fadeIn 0.3s ease;">
        <h3 class="font-black text-white uppercase mb-4 text-lg">Add New Agent</h3>
        <form id="addAgentForm" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Name</label>
            <input type="text" id="agentName" class="input-field w-full" placeholder="Agent Full Name" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Email</label>
            <input type="email" id="agentEmail" class="input-field w-full" placeholder="agent@email.com" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Password</label>
            <input type="password" id="agentPassword" class="input-field w-full" placeholder="Min. 8 characters" required minlength="8">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Phone Number (Optional)</label>
            <input type="text" id="agentPhone" class="input-field w-full" placeholder="+8801...">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Telegram (Optional)</label>
            <input type="text" id="agentTelegram" class="input-field w-full" placeholder="username">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">USDT TRC20 Wallet (Optional)</label>
            <input type="text" id="agentWallet" class="input-field w-full" placeholder="T...">
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" id="submitAddAgent" class="neon-btn flex-1 py-3 text-xs uppercase flex items-center justify-center gap-2">
              <i class="fas fa-check"></i> Create Agent
            </button>
            <button type="button" id="cancelAddAgent" class="flex-1 py-3 text-xs border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition-all">
              Cancel
            </button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#cancelAddAgent')?.addEventListener('click', () => m.remove());
    m.querySelector('#addAgentForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = m.querySelector('#submitAddAgent');
      if (submitBtn) submitBtn.disabled = true;
      const name = m.querySelector('#agentName')?.value?.trim();
      const email = m.querySelector('#agentEmail')?.value?.trim();
      const password = m.querySelector('#agentPassword')?.value;
      const phone = m.querySelector('#agentPhone')?.value?.trim();
      const telegram = m.querySelector('#agentTelegram')?.value?.trim();
      const cryptoAddress = m.querySelector('#agentWallet')?.value?.trim();
      try {
        const res = await fetch('/api/admin/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, phone, telegram, cryptoAddress })
        });
        const data = await res.json();
        if (data.success) { m.remove(); await this.loadData(); }
        else { alert(data.error?.message || 'Failed to create agent'); if (submitBtn) submitBtn.disabled = false; }
      } catch (err) {
        alert('Network error. Failed to create agent.');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  render() {
    AdminLayout.renderShell({
      activeId: this.agentsOnly ? 'agents' : 'users',
      title: this.agentsOnly ? 'Agents' : 'Users',
      subtitle: this.agentsOnly ? 'Agent list, SMS & revenue totals' : 'Search, ban, verify',
      bodyHtml: this.agentsOnly ? this.renderAgents() : this.renderUsers(),
      admin: this.admin
    });

    // Agent page events
    document.getElementById('addAgentBtn')?.addEventListener('click', () => this.showAddAgentModal());
    document.querySelectorAll('.agent-view-btn').forEach((btn) => {
      const a = this.agents.find((x) => x.id === btn.dataset.id);
      if (a) btn.addEventListener('click', () => this.showAgentViewModal(a));
    });
    document.querySelectorAll('.unagent-btn').forEach((btn) => {
      const a = this.agents.find((x) => x.id === btn.dataset.id);
      if (a) btn.addEventListener('click', () => this.showUnagentModal(a));
    });

    // User page events
    document.getElementById('userSearchBtn')?.addEventListener('click', () => {
      this.search = document.getElementById('userSearch')?.value?.trim() || '';
      this.loadData();
    });
    document.getElementById('userSearch')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.search = e.target.value.trim(); this.loadData(); }
    });
    document.querySelectorAll('.info-btn').forEach((btn) => {
      const u = this.users.find((x) => x.id === btn.dataset.id);
      if (u) btn.addEventListener('click', () => this.showInfoModal(u));
    });

    // Shared events
    document.querySelectorAll('.ban-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleBan(btn.dataset.id, btn.dataset.banned === 'true'));
    });
    document.querySelectorAll('.blue-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.blueVerify(btn.dataset.id, btn.dataset.v !== 'true'));
    });
    document.querySelectorAll('.del-user-btn, .del-agent-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteUser(btn.dataset.id));
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
  }
}
