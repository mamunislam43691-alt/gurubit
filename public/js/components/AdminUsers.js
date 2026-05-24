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
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  async toggleAgent(id, makeAgent) {
    await fetch(`/api/admin/users/${id}/agent`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAgent: makeAgent })
    });
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

  showUnagentModal(agent) {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70';
    m.innerHTML = `
      <div class="glass-card max-w-md w-full p-6">
        <h3 class="font-black text-white uppercase mb-2">Remove agent</h3>
        <p class="text-sm text-gray-400 mb-4">Transfer ${agent.memberCount || 0} member(s) to another agent email. User account stays active.</p>
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
        <table class="w-full text-sm text-left min-w-[800px]">
          <thead class="text-[10px] uppercase text-gray-500 border-b border-gray-800">
            <tr><th class="p-4">Agent</th><th class="p-4">Email</th><th class="p-4">Members</th><th class="p-4">Active</th><th class="p-4">Numbers</th><th class="p-4">SMS</th><th class="p-4">Revenue</th><th class="p-4">Actions</th></tr>
          </thead>
          <tbody>
            ${this.agents.map((a) => `
              <tr class="border-b border-gray-800">
                <td class="p-4 font-bold text-white">${this.esc(a.name)} ${a.blueVerified ? '<i class="fas fa-check-circle text-primary text-xs"></i>' : ''}</td>
                <td class="p-4 text-gray-400">${this.esc(a.email)}</td>
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
            `).join('') || '<tr><td colspan="8" class="p-10 text-gray-500 text-center">No agents</td></tr>'}
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
        <table class="w-full text-sm text-left min-w-[900px]">
          <thead class="text-[10px] uppercase text-gray-500 border-b border-gray-800">
            <tr><th class="p-4">User</th><th class="p-4">Info</th><th class="p-4">Agent Mail</th><th class="p-4">Address</th><th class="p-4">Numbers</th><th class="p-4">SMS</th><th class="p-4">Revenue</th><th class="p-4">Verify</th><th class="p-4">Ban</th></tr>
          </thead>
          <tbody>
            ${this.users.map((u) => `
              <tr class="border-b border-gray-800">
                <td class="p-4"><p class="font-bold text-white">${this.esc(u.name)}</p><p class="text-[10px] text-gray-500">${this.esc(u.email)}</p></td>
                <td class="p-4"><button type="button" class="info-btn text-primary text-xs font-bold uppercase" data-id="${u.id}">View</button></td>
                <td class="p-4 text-xs">${this.esc(u.agentEmail || u.referralEmail || '—')}</td>
                <td class="p-4 text-[10px] font-mono max-w-[100px] truncate">${this.esc(u.cryptoAddress || '—')}</td>
                <td class="p-4 font-bold text-cyan-300">${u.totalNumbers ?? 0}</td>
                <td class="p-4 font-bold">${u.totalOtps || 0}</td>
                <td class="p-4 text-primary font-bold">$${(u.earningsBalance || 0).toFixed(2)}</td>
                <td class="p-4"><button type="button" class="blue-btn text-xs font-bold uppercase text-primary" data-id="${u.id}" data-v="${!!u.blueVerified}">${u.blueVerified ? 'Unverify' : 'Blue ✓'}</button></td>
                <td class="p-4">
                  <button type="button" class="ban-btn px-2 py-1 rounded text-[10px] font-black uppercase ${u.isBanned ? 'bg-green-500 text-dark' : 'bg-red-500 text-white'}" data-id="${u.id}" data-banned="${!!u.isBanned}">${u.isBanned ? 'Unban' : 'Ban'}</button>
                  <button type="button" class="del-user-btn text-[10px] text-red-400 ml-2 uppercase" data-id="${u.id}">Del</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="p-8 text-gray-500 text-center">No users</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  showInfoModal(user) {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60';
    m.innerHTML = `
      <div class="glass-card max-w-md w-full p-6">
        <div class="flex items-center gap-4 mb-6">
          ${user.profilePhotoUrl ? `<img src="${user.profilePhotoUrl}" class="w-16 h-16 rounded-2xl object-cover">` : '<div class="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center"><i class="fas fa-user text-2xl text-primary"></i></div>'}
          <div><p class="font-black text-white">${this.esc(user.name)}</p><p class="text-xs text-gray-500">${this.esc(user.email)}</p></div>
        </div>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-gray-500">SMS</dt><dd>${user.totalOtps || 0}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-500">Revenue</dt><dd class="text-primary">$${(user.earningsBalance || 0).toFixed(2)}</dd></div>
        </dl>
        <button type="button" id="closeInfo" class="mt-6 w-full py-3 border border-white/10 rounded-lg text-gray-400">Close</button>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#closeInfo')?.addEventListener('click', () => m.remove());
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
        if (data.success) {
          m.remove();
          await this.loadData();
        } else {
          alert(data.error?.message || 'Failed to create agent');
          if (submitBtn) submitBtn.disabled = false;
        }
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

    document.getElementById('addAgentBtn')?.addEventListener('click', () => this.showAddAgentModal());

    document.getElementById('userSearchBtn')?.addEventListener('click', () => {
      this.search = document.getElementById('userSearch')?.value?.trim() || '';
      this.loadData();
    });
    document.querySelectorAll('.ban-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleBan(btn.dataset.id, btn.dataset.banned === 'true'));
    });
    document.querySelectorAll('.blue-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.blueVerify(btn.dataset.id, btn.dataset.v !== 'true'));
    });
    document.querySelectorAll('.del-user-btn, .del-agent-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteUser(btn.dataset.id));
    });
    document.querySelectorAll('.unagent-btn').forEach((btn) => {
      const a = this.agents.find((x) => x.id === btn.dataset.id);
      if (a) btn.addEventListener('click', () => this.showUnagentModal(a));
    });
    document.querySelectorAll('.info-btn').forEach((btn) => {
      const u = this.users.find((x) => x.id === btn.dataset.id);
      if (u) btn.addEventListener('click', () => this.showInfoModal(u));
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
  }
}
