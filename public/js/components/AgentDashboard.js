/**
 * Agent panel — overview, users, approvals, and API keys
 */

import { AgentLayout } from '../utils/AgentLayout.js';

export class AgentDashboard {
  constructor() {
    this.data = null;
    this.user = null;
    this.apiKeys = [];
  }

  async load() {
    // Use UserLayout session cache for instant auth check
    const { UserLayout } = await import('../utils/UserLayout.js');
    const cached = UserLayout.getCachedUser?.();
    if (cached) {
      this.user = cached;
      if (!this.user.isAgent) { window.location.href = '/'; return; }
    } else {
      const session = await fetch('/api/auth/session').then((r) => r.json());
      if (!session.authenticated || !session.user?.isAgent) {
        window.location.href = '/';
        return;
      }
      this.user = session.user;
    }

    const res = await fetch('/api/agent/dashboard');
    if (res.status === 403) {
      window.location.href = '/numbers';
      return;
    }
    this.data = await res.json();

    const hash = window.location.hash.replace('#', '');
    if (hash === 'api') {
      await this.loadApiKeys();
    }

    this.render();
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async approveUser(userId) {
    await fetch(`/api/agent/approve-user/${userId}`, { method: 'POST' });
    await this.load();
  }

  async approvePending(id) {
    await fetch(`/api/agent/approve/${id}`, { method: 'POST' });
    await this.load();
  }

  async rejectPending(id) {
    await fetch(`/api/agent/reject/${id}`, { method: 'POST' });
    await this.load();
  }

  async toggleBan(userId) {
    const res = await fetch(`/api/agent/users/${userId}/toggle-ban`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      await this.load();
    } else {
      alert(data.error?.message || 'Failed to toggle ban status');
    }
  }

  async loadApiKeys() {
    const data = await fetch('/api/user/api-keys').then((r) => r.json()).catch(() => ({}));
    if (data.success) this.apiKeys = data.keys || [];
  }

  async createApiKey() {
    const label = document.getElementById('apiKeyLabel')?.value?.trim() || 'GURUBIT API';
    const res = await fetch('/api/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    const data = await res.json();
    if (data.success) {
      this.apiKeys.unshift(data.key);
      this.render();
      alert(`API Key created — copy now:\n\n${data.key.apiKey}`);
    } else {
      alert(data.error?.message || 'Failed to create API key');
    }
  }

  async revokeApiKey(id) {
    if (!confirm('Revoke this API key?')) return;
    await fetch(`/api/user/api-keys/${id}`, { method: 'DELETE' });
    this.apiKeys = this.apiKeys.filter((k) => k.id !== id);
    this.render();
  }

  renderApiSection() {
    const host = window.location.origin;
    const exampleKey = this.apiKeys[0]?.apiKey || 'gurubit_xxxxxxxxxxxxxxxxxxxxxxxx';
    return `
      <section class="agent-page-section">
        <div class="mb-6">
          <h2 class="agent-section-title"><i class="fas fa-key mr-2"></i>GURUBIT API Integration</h2>
          <p class="text-gray-400 text-sm">Generate secure API keys to connect your website, Telegram bots, or programmatic software to GURUBIT's SMS/OTP services.</p>
        </div>

        <!-- API Key Manager Card -->
        <div class="glass-card p-6 mb-8 border-white/10">
          <h3 class="stat-label text-white mb-4">Manage API Keys</h3>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <input id="apiKeyLabel" type="text" class="input-field w-full sm:max-w-[360px]" placeholder="Key label (e.g., My Telegram Bot)">
            <button type="button" id="createApiKeyBtn" class="neon-btn px-6 py-3 text-xs uppercase font-bold shrink-0">Generate Key</button>
          </div>
          <div class="space-y-3">
            ${this.apiKeys.length ? this.apiKeys.map((k) => `
              <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <div class="min-w-0">
                  <p class="text-white font-bold text-sm">${this.esc(k.label)}</p>
                  <p class="font-mono text-xs text-primary select-all break-all">${k.apiKey}</p>
                  <p class="text-[10px] text-gray-500 mt-1">Created: ${new Date(k.createdAt).toLocaleString()}</p>
                </div>
                <button type="button" data-revoke-key="${k.id}" class="text-red-400 hover:text-red-300 text-xs font-black uppercase tracking-wider">Revoke</button>
              </div>
            `).join('') : '<p class="text-gray-500 text-sm py-4">No API keys generated yet.</p>'}
          </div>
        </div>

        <!-- Documentation Card -->
        <div class="glass-card p-6 border-white/10">
          <h3 class="stat-label text-white mb-4">API Documentation</h3>
          
          <div class="space-y-6 text-sm text-gray-300">
            <div>
              <h4 class="font-bold text-white mb-2">Authentication</h4>
              <p class="text-xs text-gray-400 mb-3">All API requests must include your API key as a query parameter or inside the HTTP headers:</p>
              <pre class="bg-black/50 p-3 rounded-lg font-mono text-xs text-green-400 border border-white/5 mb-2">?apiKey=YOUR_API_KEY</pre>
              <p class="text-xs text-gray-500 font-bold">Alternatively, use the header: <code class="text-primary font-mono text-[11px]">Authorization: Bearer YOUR_API_KEY</code></p>
            </div>

            <hr class="border-white/5">

            <!-- Endpoints Details -->
            <div>
              <h4 class="font-bold text-white mb-3">Available Endpoints</h4>
              
              <div class="space-y-4">
                <!-- Endpoint 1 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/countries</p>
                  <p class="text-xs text-gray-400 mb-2">List all active countries and regions supported on GURUBIT.</p>
                  <pre class="bg-black/50 p-2.5 rounded font-mono text-[11px] text-gray-400 overflow-x-auto">${host}/api/open/countries?apiKey=${exampleKey}</pre>
                </div>

                <!-- Endpoint 2 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/servers</p>
                  <p class="text-xs text-gray-400 mb-2">Get available SMS server nodes under a specific country.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">countryId</code> (e.g., <code class="text-gray-400">12</code>)</p>
                  <pre class="bg-black/50 p-2.5 rounded font-mono text-[11px] text-gray-400 overflow-x-auto">${host}/api/open/servers?apiKey=${exampleKey}&countryId=YOUR_COUNTRY_ID</pre>
                </div>

                <!-- Endpoint 3 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/platforms</p>
                  <p class="text-xs text-gray-400 mb-2">List all supported applications/services (Telegram, WhatsApp, etc.) on a server node.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">serverId</code> (e.g., <code class="text-gray-400">srv_123</code>)</p>
                  <pre class="bg-black/50 p-2.5 rounded font-mono text-[11px] text-gray-400 overflow-x-auto">${host}/api/open/platforms?apiKey=${exampleKey}&serverId=YOUR_SERVER_ID</pre>
                </div>

                <!-- Endpoint 4 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/generate</p>
                  <p class="text-xs text-gray-400 mb-2">Generate and purchase a temporary verification phone number.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">countryId</code>, <code class="text-primary font-mono">serverId</code>, <code class="text-primary font-mono">platformId</code>, <code class="text-primary font-mono">format</code> (optional: <code class="text-gray-400">remove_plus</code>)</p>
                  <pre class="bg-black/50 p-2.5 rounded font-mono text-[11px] text-gray-400 overflow-x-auto">${host}/api/open/generate?apiKey=${exampleKey}&countryId=YOUR_COUNTRY_ID&serverId=YOUR_SERVER_ID&platformId=YOUR_PLATFORM_ID&format=remove_plus</pre>
                </div>

                <!-- Endpoint 5 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/sms</p>
                  <p class="text-xs text-gray-400 mb-2">Check for incoming SMS and active verification codes (OTP) on your generated number.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">numberId</code> (returned when generating number)</p>
                  <pre class="bg-black/50 p-2.5 rounded font-mono text-[11px] text-gray-400 overflow-x-auto">${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID</pre>
                </div>
              </div>
            </div>

            <hr class="border-white/5">

            <!-- Code Integration Examples -->
            <div>
              <h4 class="font-bold text-white mb-3">Quick Integration Snippets</h4>
              
              <div class="space-y-4">
                <div>
                  <p class="text-xs font-bold text-primary mb-2">Option A: Node.js / JavaScript Fetch</p>
                  <pre class="bg-black/60 p-4 rounded-xl font-mono text-xs text-cyan-300 border border-white/5 overflow-x-auto">
// 1. Generate number
const genRes = await fetch(\`${host}/api/open/generate?apiKey=${exampleKey}&countryId=12&serverId=srv_1&platformId=tg\`);
const genData = await genRes.json();

if (genData.success) {
  const { id, phoneNumber } = genData.number;
  console.log(\`Generated number: \${phoneNumber} (ID: \${id})\`);

  // 2. Poll for SMS OTP
  const checkSms = setInterval(async () => {
    const smsRes = await fetch(\`${host}/api/open/sms?apiKey=${exampleKey}&numberId=\${id}\`);
    const smsData = await smsRes.json();
    if (smsData.otpReceived) {
      clearInterval(checkSms);
      console.log(\`Received OTP Code: \${smsData.otp}\`);
      console.log(\`Full message: \${smsData.smsMessage}\`);
    }
  }, 5000);
}</pre>
                </div>

                <div>
                  <p class="text-xs font-bold text-primary mb-2">Option B: Curl Command Line</p>
                  <pre class="bg-black/60 p-4 rounded-xl font-mono text-xs text-cyan-300 border border-white/5 overflow-x-auto">
# Generate number:
curl "${host}/api/open/generate?apiKey=${exampleKey}&countryId=12&serverId=srv_1&platformId=tg"

# Poll for SMS Code:
curl "${host}/api/open/sms?apiKey=${exampleKey}&numberId=num_xxxxxxxx"</pre>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>`;
  }

  renderBody() {
    if (!this.data?.success) return '<p class="text-gray-500 font-bold">Loading...</p>';
    const hash = window.location.hash.replace('#', '');
    
    if (hash === 'api') {
      return this.renderApiSection();
    }

    const { stats, members, pending } = this.data;
    const activeMembers = members.filter((m) => m.agentApproved && !m.isBanned);

    return `
      <section id="overview" class="agent-page-section scroll-mt-24 mb-10">
        <div class="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-5">
          <div>
            <p class="stat-label mb-3">Overview</p>
            <p class="text-gray-400 text-sm">Agent dashboard with your member stats, approvals and team number activity.</p>
          </div>
          <a href="/numbers" class="neon-btn px-5 py-2 text-xs uppercase font-bold">Get Number</a>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div class="glass-card p-5"><p class="stat-label">Members</p><p class="text-2xl font-black text-white">${stats.totalMembers}</p></div>
          <div class="glass-card p-5"><p class="stat-label">Active</p><p class="text-2xl font-black text-green-400">${stats.activeMembers}</p></div>
          <div class="glass-card p-5"><p class="stat-label">Banned</p><p class="text-2xl font-black text-red-500">${stats.bannedMembers ?? 0}</p></div>
          <div class="glass-card p-5"><p class="stat-label">Pending</p><p class="text-2xl font-black text-orange-400">${stats.pendingApprovals}</p></div>
          <div class="glass-card p-5"><p class="stat-label">Numbers</p><p class="text-2xl font-black text-cyan-300">${stats.totalNumbers ?? 0}</p></div>
          <div class="glass-card p-5"><p class="stat-label">Team SMS</p><p class="text-2xl font-black text-primary">${stats.totalSms}</p></div>
        </div>
      </section>

      <section id="users" class="agent-page-section scroll-mt-24 mb-10">
        <div class="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
          <div>
            <h3 class="stat-label">Users</h3>
            <p class="text-xs text-gray-400">Manage your agent users and approve new members.</p>
          </div>
          <span class="text-xs text-primary font-bold">Active Members: ${activeMembers.length}</span>
        </div>
        <div class="glass-card agent-table-scroll overflow-x-auto">
          <table class="number-history-table w-full text-sm text-left">
            <thead><tr>
              <th>Name</th><th>Email</th><th>SMS</th><th>Revenue</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${members.map((m) => `
                <tr>
                  <td class="text-white font-bold">${this.esc(m.name)}</td>
                  <td class="text-gray-400 text-xs">${this.esc(m.email)}</td>
                  <td>${m.totalSms}</td>
                  <td class="text-primary font-bold">$${(m.revenue || 0).toFixed(2)}</td>
                  <td>
                    ${m.isBanned 
                      ? '<span class="text-red-500 font-bold">Banned</span>' 
                      : m.agentApproved 
                        ? '<span class="text-green-400 font-bold">Active</span>' 
                        : '<span class="text-orange-400 font-bold">Pending</span>'}
                  </td>
                  <td class="py-3 flex items-center gap-2">
                    ${(!m.agentApproved && !m.isBanned) ? `<button type="button" data-user-approve="${m.id}" class="neon-btn px-4 py-2 text-xs">Approve</button>` : ''}
                    <button type="button" data-toggle-ban="${m.id}" class="px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all duration-200 ${m.isBanned ? 'bg-green-500 hover:bg-green-600 text-dark' : 'bg-red-500 hover:bg-red-600 text-white'}">
                      ${m.isBanned ? 'Unban' : 'Ban'}
                    </button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="p-8 text-gray-500 text-center">No users found</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section id="approve" class="agent-page-section scroll-mt-24">
        <div class="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-3">
          <div>
            <h3 class="stat-label">User Requests</h3>
            <p class="text-gray-500 text-xs">New signups waiting for approval</p>
          </div>
          <span class="text-xs text-primary font-bold">Pending requests: ${pending.length}</span>
        </div>
        <div class="glass-card agent-table-scroll overflow-x-auto">
          ${pending.length ? `
            <table class="number-history-table w-full text-sm text-left">
              <thead><tr><th>User</th><th>Email</th><th>Actions</th></tr></thead>
              <tbody>
                ${pending.map((p) => `
                  <tr>
                    <td class="text-white font-bold">${this.esc(p.name)}</td>
                    <td class="text-gray-400 text-xs">${this.esc(p.email)}</td>
                    <td class="flex flex-wrap gap-2 py-3">
                      <button type="button" data-approve-id="${p.id}" class="neon-btn px-4 py-2 text-xs font-bold">Accept</button>
                      <button type="button" data-reject-id="${p.id}" class="text-red-400 hover:text-red-300 text-[10px] font-black uppercase tracking-wider">Reject</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="p-6 text-gray-500 text-sm">No pending requests</p>'}
        </div>
      </section>`;
  }

  render() {
    const hash = window.location.hash.replace('#', '');
    const activeId = hash === 'users' ? 'users' : hash === 'approve' ? 'approve' : hash === 'api' ? 'api' : 'overview';
    AgentLayout.renderShell({
      activeId,
      title: activeId === 'api' ? 'GURUBIT API' : 'Agent Panel',
      bodyHtml: this.renderBody(),
      user: this.user
    });

    if (activeId === 'api') {
      document.getElementById('createApiKeyBtn')?.addEventListener('click', () => this.createApiKey());
      document.querySelectorAll('[data-revoke-key]').forEach((btn) => {
        btn.addEventListener('click', () => this.revokeApiKey(btn.dataset.revokeKey));
      });
      return;
    }

    document.querySelectorAll('[data-approve-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.approvePending(btn.dataset.approveId));
    });
    document.querySelectorAll('[data-reject-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.rejectPending(btn.dataset.rejectId));
    });
    document.querySelectorAll('[data-user-approve]').forEach((btn) => {
      btn.addEventListener('click', () => this.approveUser(btn.dataset.userApprove));
    });
    document.querySelectorAll('[data-toggle-ban]').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleBan(btn.dataset.toggleBan));
    });

    const id = window.location.hash.replace('#', '');
    if (id && id !== 'api') {
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  async init() {
    window.addEventListener('hashchange', () => this.load());
    await this.load();
  }
}
