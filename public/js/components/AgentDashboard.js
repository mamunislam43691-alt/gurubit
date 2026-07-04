/**
 * Agent panel — overview, users, approvals, and API keys
 */

import { AgentLayout } from '../utils/AgentLayout.js';

export class AgentDashboard {
  constructor() {
    this.data = null;
    this.user = null;
    this.apiKeys = [];
    this._searchQuery = '';
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

    try {
      const fetchFn = window.optimizedFetch || ((url) => fetch(url).then(r => r.json()));
      this.data = await fetchFn('/api/agent/dashboard');
    } catch (err) {
      console.error(err);
      window.location.href = '/numbers';
      return;
    }

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
    const res = await fetch(`/api/agent/approve-user/${userId}`, { method: 'POST' }).then((r) => r.json());
    if (res.success) {
      if (window.apiCache) window.apiCache.clear();
      await this.load();
    } else {
      alert(res.error?.message || 'Failed to approve user');
    }
  }

  async deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    const res = await fetch(`/api/agent/users/${userId}`, { method: 'DELETE' }).then((r) => r.json());
    if (res.success) {
      if (window.apiCache) window.apiCache.clear();
      await this.load();
    } else {
      alert(res.error?.message || 'Failed to delete user');
    }
  }

  async toggleBan(userId) {
    const res = await fetch(`/api/agent/users/${userId}/toggle-ban`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      if (window.apiCache) window.apiCache.clear();
      await this.load();
    } else {
      alert(data.error?.message || 'Failed to toggle ban status');
    }
  }

  async loadApiKeys() {
    const fetchFn = window.optimizedFetch || ((url) => fetch(url).then(r => r.json()));
    const data = await fetchFn('/api/user/api-keys').catch(() => ({}));
    if (data && data.success) this.apiKeys = data.keys || [];
  }

  async createApiKey() {
    const label = `GURUBIT API Key ${this.apiKeys.length + 1}`;
    const res = await fetch('/api/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    const data = await res.json();
    if (data.success) {
      if (window.apiCache) window.apiCache.clear();
      await this.loadApiKeys();
      this.render();
    } else {
      alert(data.error?.message || 'Failed to create API key');
    }
  }

  async revokeApiKey(id) {
    if (!confirm('Revoke this API key?')) return;
    const res = await fetch(`/api/user/api-keys/${id}`, { method: 'DELETE' }).then((r) => r.json());
    if (res.success) {
      if (window.apiCache) window.apiCache.clear();
      this.apiKeys = this.apiKeys.filter((k) => k.id !== id);
      this.render();
    } else {
      alert(res.error?.message || 'Failed to revoke API key');
    }
  }

  async copyToClipboard(text, element) {
    try {
      await navigator.clipboard.writeText(text);
      const icon = element.querySelector('i');
      const label = element.querySelector('span');
      
      const origIconClass = icon ? icon.className : null;
      const origText = label ? label.textContent : null;
      
      if (icon) {
        icon.className = 'fas fa-check text-green-400';
      }
      if (label) {
        label.textContent = 'Copied!';
        label.classList.add('text-green-400');
      }
      
      setTimeout(() => {
        if (icon) icon.className = origIconClass;
        if (label) {
          label.textContent = origText;
          label.classList.remove('text-green-400');
        }
      }, 1500);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }

  async initApiUrlBuilder() {
    const countrySelect = document.getElementById('apiCountrySelect');
    const serverSelect = document.getElementById('apiServerSelect');
    const platformSelect = document.getElementById('apiPlatformSelect');
    const confirmBtn = document.getElementById('confirmApiConnectionBtn');
    const resultBox = document.getElementById('apiConnectionResult');
    const urlText = document.getElementById('generatedApiUrlText');
    const copyUrlBtn = document.getElementById('copyGeneratedUrlBtn');

    if (!countrySelect) return;

    try {
      const data = await window.optimizedFetch('/api/countries').catch(() => ({}));
      if (data && data.success && data.countries) {
        countrySelect.innerHTML = '<option value="">-- Choose Country --</option>' + 
          data.countries.map(c => `<option value="${c.id}">${this.esc(c.name)}</option>`).join('');
      }
    } catch (e) {
      console.error('Error loading countries for builder:', e);
    }

    countrySelect.addEventListener('change', async () => {
      const countryId = countrySelect.value;
      serverSelect.innerHTML = '<option value="">-- Select Server/Range --</option>';
      platformSelect.innerHTML = '<option value="">-- Select Server First --</option>';
      serverSelect.disabled = true;
      platformSelect.disabled = true;
      confirmBtn.disabled = true;
      resultBox.classList.add('hidden');

      if (!countryId) return;

      try {
        const data = await window.optimizedFetch(`/api/countries/${countryId}/servers`).catch(() => ({}));
        if (data && data.success && data.servers) {
          serverSelect.innerHTML = '<option value="">-- Choose Server Range --</option>' + 
            data.servers.map(s => `<option value="${s.id}">${this.esc(s.name)}</option>`).join('');
          serverSelect.disabled = false;
        }
      } catch (e) {
        console.error('Error loading servers for builder:', e);
      }
    });

    serverSelect.addEventListener('change', async () => {
      const serverId = serverSelect.value;
      platformSelect.innerHTML = '<option value="">-- Select Platform (Optional) --</option>';
      platformSelect.disabled = true;
      confirmBtn.disabled = !serverId;
      resultBox.classList.add('hidden');

      if (!serverId) return;

      try {
        const data = await window.optimizedFetch(`/api/servers/${serverId}/platforms`).catch(() => ({}));
        if (data && data.success && data.platforms) {
          platformSelect.innerHTML = '<option value="">-- Select Platform (Optional) --</option>' + 
            data.platforms.map(p => `<option value="${p.id}">${this.esc(p.name || p.id)}</option>`).join('');
          platformSelect.disabled = false;
        }
      } catch (e) {
        console.error('Error loading platforms for builder:', e);
      }
    });

    confirmBtn.addEventListener('click', () => {
      const countryId = countrySelect.value;
      const serverId = serverSelect.value;
      const platformId = platformSelect.value;
      if (!countryId || !serverId) return;

      const apiKey = this.apiKeys[0]?.apiKey || 'YOUR_API_KEY';
      const host = window.location.origin;
      let url = `${host}/api/open/generate?apiKey=${apiKey}&countryId=${countryId}&serverId=${serverId}`;
      if (platformId) {
        url += `&platformId=${platformId}`;
      }

      urlText.textContent = url;
      resultBox.classList.remove('hidden');
      
      // Auto-focus/scroll to result
      setTimeout(() => resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    });

    copyUrlBtn?.addEventListener('click', () => {
      this.copyToClipboard(urlText.textContent, copyUrlBtn);
    });
  }

  filterUsersTable() {
    const q = document.getElementById('userSearchInput')?.value?.toLowerCase()?.trim() || '';
    const rows = document.querySelectorAll('#usersTableBody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
      if (row.id === 'noMatchingUsersRow') return;
      const text = row.textContent.toLowerCase();
      if (text.includes(q)) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });

    const noMatchRow = document.getElementById('noMatchingUsersRow');
    if (noMatchRow) {
      noMatchRow.style.display = visibleCount === 0 ? '' : 'none';
    }
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
          <div class="flex justify-between items-center mb-6">
            <h3 class="stat-label text-white m-0">Manage API Keys</h3>
            <button type="button" id="createApiKeyBtn" class="neon-btn px-6 py-3 text-xs uppercase font-bold shrink-0">Generate Key</button>
          </div>
          <div class="space-y-3">
            ${this.apiKeys.length ? this.apiKeys.map((k) => `
              <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <div class="min-w-0 flex-1 pr-4">
                  <p class="text-white font-bold text-sm">${this.esc(k.label)}</p>
                  <div class="flex items-center gap-2 mt-1.5 max-w-full">
                    <div class="flex-1 bg-black/50 border border-white/5 rounded-lg px-3 py-2 font-mono text-xs text-primary overflow-x-auto select-all whitespace-nowrap min-w-0">
                      ${k.apiKey}
                    </div>
                    <button type="button" data-copy-key="${k.apiKey}" class="btn-copy px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all flex items-center gap-1.5 shrink-0">
                      <i class="far fa-copy"></i><span>Copy</span>
                    </button>
                  </div>
                  <p class="text-[10px] text-gray-500 mt-2">Created: ${new Date(k.createdAt).toLocaleString()}</p>
                </div>
                <button type="button" data-revoke-key="${k.id}" class="text-red-400 hover:text-red-300 text-xs font-black uppercase tracking-wider shrink-0">Revoke</button>
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
              <div class="relative group mb-3">
                <pre class="bg-black/50 p-3 pr-20 rounded-lg font-mono text-xs text-green-400 border border-white/5 overflow-x-auto select-all">?apiKey=YOUR_API_KEY</pre>
                <button type="button" class="btn-copy-doc absolute top-2 right-2 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="?apiKey=YOUR_API_KEY">
                  <i class="far fa-copy"></i><span>Copy</span>
                </button>
              </div>
              <div class="flex justify-between items-center">
                <p class="text-xs text-gray-500 font-bold">Alternatively, use the header: <code class="text-primary font-mono text-[11px]">Authorization: Bearer YOUR_API_KEY</code></p>
                <button type="button" class="btn-copy-doc px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="Authorization: Bearer YOUR_API_KEY">
                  <i class="far fa-copy"></i><span>Copy Header</span>
                </button>
              </div>
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
                  <div class="relative group">
                    <pre class="bg-black/50 p-2.5 pr-20 rounded font-mono text-[11px] text-gray-400 overflow-x-auto select-all">${host}/api/open/countries?apiKey=${exampleKey}</pre>
                    <button type="button" class="btn-copy-doc absolute top-1.5 right-2 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="${host}/api/open/countries?apiKey=${exampleKey}">
                      <i class="far fa-copy"></i><span>Copy</span>
                    </button>
                  </div>
                </div>

                <!-- Endpoint 2 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/servers</p>
                  <p class="text-xs text-gray-400 mb-2">Get available SMS server nodes under a specific country.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">countryId</code> (e.g., <code class="text-gray-400">12</code>)</p>
                  <div class="relative group">
                    <pre class="bg-black/50 p-2.5 pr-20 rounded font-mono text-[11px] text-gray-400 overflow-x-auto select-all">${host}/api/open/servers?apiKey=${exampleKey}&countryId=YOUR_COUNTRY_ID</pre>
                    <button type="button" class="btn-copy-doc absolute top-1.5 right-2 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="${host}/api/open/servers?apiKey=${exampleKey}&countryId=YOUR_COUNTRY_ID">
                      <i class="far fa-copy"></i><span>Copy</span>
                    </button>
                  </div>
                </div>

                <!-- Endpoint 3 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/platforms</p>
                  <p class="text-xs text-gray-400 mb-2">List all supported applications/services (Telegram, WhatsApp, etc.) on a server node.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">serverId</code> (e.g., <code class="text-gray-400">srv_123</code>)</p>
                  <div class="relative group">
                    <pre class="bg-black/50 p-2.5 pr-20 rounded font-mono text-[11px] text-gray-400 overflow-x-auto select-all">${host}/api/open/platforms?apiKey=${exampleKey}&serverId=YOUR_SERVER_ID</pre>
                    <button type="button" class="btn-copy-doc absolute top-1.5 right-2 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="${host}/api/open/platforms?apiKey=${exampleKey}&serverId=YOUR_SERVER_ID">
                      <i class="far fa-copy"></i><span>Copy</span>
                    </button>
                  </div>
                </div>

                <!-- Endpoint 4 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/generate</p>
                  <p class="text-xs text-gray-400 mb-2">Generate a temporary verification phone number. The system automatically selects the best available country and range configured by the admin.</p>
                  <div class="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                    <p class="text-[11px] text-primary font-bold flex items-center gap-1.5">
                      <i class="fas fa-info-circle"></i> How it works
                    </p>
                    <p class="text-[11px] text-gray-400 mt-1">The admin configures available countries and server ranges in the admin panel. When you call this endpoint, the system automatically picks the best available number from the configured pool — you don't need to specify country or range manually.</p>
                  </div>
                  <p class="text-[10px] text-gray-500 mb-1">Optional: <code class="text-primary font-mono">countryId</code>, <code class="text-primary font-mono">serverId</code> — if not provided, system auto-selects. <code class="text-primary font-mono">format</code>: <code class="text-gray-400">remove_plus</code> to strip the + prefix.</p>
                  <div class="relative group">
                    <pre class="bg-black/50 p-2.5 pr-20 rounded font-mono text-[11px] text-gray-400 overflow-x-auto select-all">${host}/api/open/generate?apiKey=${exampleKey}</pre>
                    <button type="button" class="btn-copy-doc absolute top-1.5 right-2 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="${host}/api/open/generate?apiKey=${exampleKey}">
                      <i class="far fa-copy"></i><span>Copy</span>
                    </button>
                  </div>
                </div>

                <!-- Endpoint 5 -->
                <div class="border-l-2 border-primary pl-3 py-1">
                  <p class="font-bold text-xs text-white uppercase tracking-wider mb-1"><span class="text-primary font-black">GET</span> /api/open/sms</p>
                  <p class="text-xs text-gray-400 mb-2">Check for incoming SMS and active verification codes (OTP) on your generated number.</p>
                  <p class="text-[10px] text-gray-500 mb-1">Parameters: <code class="text-primary font-mono">numberId</code> (returned when generating number)</p>
                  <div class="relative group">
                    <pre class="bg-black/50 p-2.5 pr-20 rounded font-mono text-[11px] text-gray-400 overflow-x-auto select-all">${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID</pre>
                    <button type="button" class="btn-copy-doc absolute top-1.5 right-2 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID">
                      <i class="far fa-copy"></i><span>Copy</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <hr class="border-white/5">

            <!-- Code Integration Examples -->
            <div>
              <h4 class="font-bold text-white mb-3">Quick Integration Snippets</h4>
              <p class="text-xs text-gray-400 mb-4">The system automatically selects the best available country and range. Just use your API key — no country or range parameters needed.</p>
              
              <div class="space-y-4">
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <p class="text-xs font-bold text-primary">Option A: Node.js / JavaScript Fetch</p>
                    <button type="button" class="btn-copy-doc px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="// 1. Generate number (system auto-selects country & range)
const genRes = await fetch(\`${host}/api/open/generate?apiKey=${exampleKey}\`);
const genData = await genRes.json();

if (genData.success) {
  const { id, phoneNumber } = genData.number;
  console.log(\`Number: \${phoneNumber} | ID: \${id}\`);

  // 2. Poll for OTP (every 5 seconds, up to 20 min)
  const checkSms = setInterval(async () => {
    const smsRes = await fetch(\`${host}/api/open/sms?apiKey=${exampleKey}&numberId=\${id}\`);
    const smsData = await smsRes.json();
    if (smsData.otpReceived) {
      clearInterval(checkSms);
      console.log(\`OTP: \${smsData.otp}\`);
      console.log(\`SMS: \${smsData.smsMessage}\`);
    }
  }, 5000);
}">
                      <i class="far fa-copy"></i><span>Copy Code</span>
                    </button>
                  </div>
                  <pre class="bg-black/60 p-4 rounded-xl font-mono text-xs text-cyan-300 border border-white/5 overflow-x-auto select-all">
// 1. Generate number (system auto-selects country & range)
const genRes = await fetch(\`${host}/api/open/generate?apiKey=${exampleKey}\`);
const genData = await genRes.json();

if (genData.success) {
  const { id, phoneNumber } = genData.number;
  console.log(\`Number: \${phoneNumber} | ID: \${id}\`);

  // 2. Poll for OTP (every 5 seconds, up to 20 min)
  const checkSms = setInterval(async () => {
    const smsRes = await fetch(\`${host}/api/open/sms?apiKey=${exampleKey}&numberId=\${id}\`);
    const smsData = await smsRes.json();
    if (smsData.otpReceived) {
      clearInterval(checkSms);
      console.log(\`OTP: \${smsData.otp}\`);
      console.log(\`SMS: \${smsData.smsMessage}\`);
    }
  }, 5000);
}</pre>
                </div>

                <div>
                  <div class="flex justify-between items-center mb-2">
                    <p class="text-xs font-bold text-primary">Option B: Curl Command Line</p>
                    <button type="button" class="btn-copy-doc px-2.5 py-1 rounded bg-black/40 border border-white/10 text-gray-400 hover:text-white text-xs transition-all flex items-center gap-1" data-copy-text="# Step 1: Generate number
curl &quot;${host}/api/open/generate?apiKey=${exampleKey}&quot;

# Step 2: Check for OTP (use numberId from step 1 response)
curl &quot;${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID&quot;">
                      <i class="far fa-copy"></i><span>Copy Commands</span>
                    </button>
                  </div>
                  <pre class="bg-black/60 p-4 rounded-xl font-mono text-xs text-cyan-300 border border-white/5 overflow-x-auto select-all">
# Step 1: Generate number (auto-selects best available range)
curl "${host}/api/open/generate?apiKey=${exampleKey}"

# Step 2: Check for OTP (use numberId from step 1 response)
curl "${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID"</pre>
                </div>

                <!-- Response example -->
                <div class="p-4 rounded-xl bg-black/40 border border-white/5">
                  <p class="text-xs font-bold text-gray-400 uppercase mb-3">Example Response (generate)</p>
                  <pre class="font-mono text-xs text-green-400 overflow-x-auto select-all">{
  "success": true,
  "number": {
    "id": "num_1234567890_abc",
    "phoneNumber": "+251718680120",
    "countryName": "Ethiopia",
    "status": "pending",
    "expiresAt": "2026-01-01T12:20:00.000Z"
  }
}</pre>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>`;
  }

  renderBody() {
    if (!this.data?.success) return `
      <div class="flex items-center justify-center py-20 text-gray-500">
        <i class="fas fa-spinner fa-spin mr-3"></i> Loading...
      </div>`;

    const hash = window.location.hash.replace('#', '');

    if (hash === 'api')     return this.renderApiSection();
    if (hash === 'pending') return this.renderPendingSection();
    if (hash === 'users')   return this.renderUsersSection();
    return this.renderDashboard();
  }

  renderDashboard() {
    const { stats, members } = this.data;

    // Revenue trend (last 7 days earnings estimate)
    const totalRevenue = members.reduce((s, m) => s + (m.revenue || 0), 0);
    const avgPerMember = members.length ? (totalRevenue / members.length).toFixed(2) : '0.00';

    // Top earners (top 3)
    const topEarners = [...members]
      .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
      .slice(0, 5);

    // Recent activity
    const recentActive = [...members]
      .filter(m => m.agentApproved && !m.isBanned)
      .slice(0, 5);

    return `
      <section class="agent-page-section scroll-mt-24 mb-8">
        <div class="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
          <div>
            <p class="stat-label mb-1">Overview</p>
            <p class="text-gray-400 text-xs">Agent analytics — members, revenue, and team activity.</p>
          </div>
          <a href="/numbers" class="neon-btn px-5 py-2.5 text-xs uppercase font-bold flex items-center gap-2">
            <i class="fas fa-sim-card"></i> Get Number
          </a>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
          <div class="glass-card p-5">
            <p class="stat-label">Members</p>
            <p class="text-2xl font-black text-white">${stats.totalMembers}</p>
          </div>
          <div class="glass-card p-5">
            <p class="stat-label">Active</p>
            <p class="text-2xl font-black text-green-400">${stats.activeMembers}</p>
          </div>
          <div class="glass-card p-5">
            <p class="stat-label">Banned</p>
            <p class="text-2xl font-black text-red-500">${stats.bannedMembers ?? 0}</p>
          </div>
          <div class="glass-card p-5">
            <p class="stat-label">Pending</p>
            <p class="text-2xl font-black text-orange-400">
              ${stats.pendingApprovals}
              ${stats.pendingApprovals > 0 ? `<a href="/agent#pending" class="text-[10px] text-orange-400 font-bold ml-1 hover:underline">View →</a>` : ''}
            </p>
          </div>
          <div class="glass-card p-5">
            <p class="stat-label">Numbers</p>
            <p class="text-2xl font-black text-cyan-300">${stats.totalNumbers ?? 0}</p>
          </div>
          <div class="glass-card p-5">
            <p class="stat-label">Team SMS</p>
            <p class="text-2xl font-black text-primary">${stats.totalSms}</p>
          </div>
          <div class="glass-card p-5 border border-red-500/20">
            <p class="stat-label flex items-center gap-1">
              <i class="fas fa-times-circle text-red-400 text-xs"></i> Failed Numbers
            </p>
            <p class="text-2xl font-black text-red-400">${stats.failedNumbers ?? 0}</p>
          </div>
        </div>

        <!-- Analytics Row -->
        <div class="grid md:grid-cols-2 gap-4 mb-8">

          <!-- Revenue Summary -->
          <div class="glass-card p-5">
            <h3 class="stat-label mb-4 flex items-center gap-2">
              <i class="fas fa-chart-line text-primary"></i> Revenue Summary
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center py-2 border-b border-white/5">
                <span class="text-xs text-gray-400">Total Team Revenue</span>
                <span class="text-primary font-black text-sm">$${totalRevenue.toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-white/5">
                <span class="text-xs text-gray-400">Avg Revenue / Member</span>
                <span class="text-white font-bold text-sm">$${avgPerMember}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-white/5">
                <span class="text-xs text-gray-400">Total Team SMS</span>
                <span class="text-cyan-300 font-bold text-sm">${stats.totalSms}</span>
              </div>
              <div class="flex justify-between items-center py-2">
                <span class="text-xs text-gray-400">Numbers Used</span>
                <span class="text-yellow-400 font-bold text-sm">${stats.totalNumbers ?? 0}</span>
              </div>
            </div>
          </div>

          <!-- Member Status Breakdown -->
          <div class="glass-card p-5">
            <h3 class="stat-label mb-4 flex items-center gap-2">
              <i class="fas fa-users text-primary"></i> Member Status
            </h3>
            <div class="space-y-3">
              <!-- Active bar -->
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-gray-400">Active</span>
                  <span class="text-green-400 font-bold">${stats.activeMembers} / ${stats.totalMembers}</span>
                </div>
                <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full bg-green-400 rounded-full transition-all" style="width:${stats.totalMembers ? Math.round((stats.activeMembers/stats.totalMembers)*100) : 0}%"></div>
                </div>
              </div>
              <!-- Pending bar -->
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-gray-400">Pending Approval</span>
                  <span class="text-orange-400 font-bold">${stats.pendingApprovals}</span>
                </div>
                <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full bg-orange-400 rounded-full transition-all" style="width:${stats.totalMembers ? Math.round((stats.pendingApprovals/Math.max(stats.totalMembers,1))*100) : 0}%"></div>
                </div>
              </div>
              <!-- Banned bar -->
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-gray-400">Banned</span>
                  <span class="text-red-400 font-bold">${stats.bannedMembers ?? 0}</span>
                </div>
                <div class="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full bg-red-500 rounded-full transition-all" style="width:${stats.totalMembers ? Math.round(((stats.bannedMembers??0)/stats.totalMembers)*100) : 0}%"></div>
                </div>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t border-white/5 text-center">
              <a href="/agent#users" class="text-xs text-primary font-bold hover:underline">
                <i class="fas fa-arrow-right mr-1"></i>Manage Members
              </a>
            </div>
          </div>
        </div>

        <!-- Top Earners -->
        ${topEarners.length > 0 ? `
          <div class="glass-card p-5 mb-4">
            <h3 class="stat-label mb-4 flex items-center gap-2">
              <i class="fas fa-trophy text-yellow-400"></i> Top Earners
            </h3>
            <div class="space-y-2">
              ${topEarners.map((m, i) => `
                <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span class="text-${i===0?'yellow':i===1?'gray':i===2?'orange':'gray'}-400 font-black text-sm w-6">#${i+1}</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-xs truncate">${this.esc(m.name)}</p>
                    <p class="text-gray-500 text-[10px] truncate">${this.esc(m.email)}</p>
                  </div>
                  <span class="text-primary font-black text-sm">$${(m.revenue || 0).toFixed(2)}</span>
                  <span class="text-gray-500 text-xs">${m.totalSms} SMS</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- News Feed -->
        <div id="agentNewsFeed"></div>
      </section>`;
  }

  renderUsersSection() {
    const { members } = this.data;
    const activeMembers = members.filter(m => m.agentApproved && !m.isBanned);
    const q = this._searchQuery || '';

    const filteredMembers = q
      ? members.filter(m =>
          m.name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          (m.agentApproved ? 'active' : m.isBanned ? 'banned' : 'pending').includes(q))
      : members;

    return `
      <section class="agent-page-section scroll-mt-24">
        <div class="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
          <div>
            <h3 class="stat-label">Members</h3>
            <p class="text-xs text-gray-400">Manage your members — approve, ban, or delete.</p>
          </div>
          <span class="text-xs text-primary font-bold">Active: ${activeMembers.length} / ${members.length}</span>
        </div>

        <div class="mb-4">
          <input type="text" id="userSearchInput" class="input-field w-full md:max-w-sm"
            placeholder="Search by name, email, status…" value="${this.esc(q)}">
        </div>

        <div class="glass-card overflow-x-auto">
          <table class="number-history-table w-full text-sm text-left min-w-[700px]">
            <thead><tr>
              <th>Name</th><th>Email</th><th>SMS</th><th>Revenue</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="usersTableBody">
              ${filteredMembers.map((m) => `
                <tr>
                  <td class="text-white font-bold">${this.esc(m.name)}</td>
                  <td class="text-gray-400 text-xs">${this.esc(m.email)}</td>
                  <td class="font-bold text-cyan-300">${m.totalSms}</td>
                  <td class="text-primary font-bold">$${(m.revenue || 0).toFixed(2)}</td>
                  <td>
                    ${m.isBanned
                      ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-red-500/20 text-red-400">Banned</span>'
                      : m.agentApproved
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-green-500/20 text-green-400">Active</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-orange-500/20 text-orange-400">Pending</span>'}
                  </td>
                  <td class="py-3">
                    <div class="flex items-center gap-2 flex-wrap">
                      ${(!m.agentApproved && !m.isBanned)
                        ? `<button type="button" data-user-approve="${m.id}" class="neon-btn px-3 py-1.5 text-[10px] uppercase">Approve</button>`
                        : ''}
                      <button type="button" data-toggle-ban="${m.id}"
                        class="px-3 py-1.5 rounded text-[10px] font-black uppercase
                        ${m.isBanned ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">
                        ${m.isBanned ? 'Unban' : 'Ban'}
                      </button>
                      <button type="button" data-user-delete="${m.id}"
                        class="px-3 py-1.5 rounded text-[10px] font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
              ${filteredMembers.length === 0 ? `
                <tr><td colspan="6" class="p-8 text-gray-500 text-center">
                  ${q ? 'No matching users found' : 'No members yet'}
                </td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  renderPendingSection() {
    const { pending = [], stats } = this.data;

    return `
      <section class="agent-page-section scroll-mt-24">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="stat-label flex items-center gap-2">
              <i class="fas fa-user-clock text-orange-400"></i> Pending Users
              ${pending.length > 0
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500/20 text-orange-400">${pending.length}</span>`
                : ''}
            </h3>
            <p class="text-xs text-gray-400 mt-1">Users who sent a join request — approve or reject them.</p>
          </div>
        </div>

        ${pending.length === 0 ? `
          <div class="glass-card p-12 text-center">
            <i class="fas fa-check-circle text-3xl text-green-400/40 mb-3 block"></i>
            <p class="text-gray-500 text-sm font-bold">No pending requests</p>
            <p class="text-gray-600 text-xs mt-1">All caught up!</p>
          </div>
        ` : `
          <div class="space-y-3">
            ${pending.map(p => `
              <div class="glass-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 border border-orange-500/10 hover:border-orange-500/25 transition-all">
                <div class="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
                  <i class="fas fa-user text-orange-400"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <p class="text-white font-bold">${this.esc(p.name || p.email)}</p>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500/20 text-orange-400">Pending</span>
                  </div>
                  <p class="text-gray-400 text-xs mb-2">${this.esc(p.email)}</p>
                  <div class="flex gap-4 text-[11px] text-gray-500 flex-wrap">
                    ${p.phone && p.phone !== '—' ? `<span><i class="fas fa-phone mr-1 text-gray-600"></i>${this.esc(p.phone)}</span>` : ''}
                    ${p.telegram && p.telegram !== '—' ? `<span><i class="fab fa-telegram mr-1 text-gray-600"></i>${this.esc(p.telegram)}</span>` : ''}
                    ${p.cryptoAddress && p.cryptoAddress !== '—' ? `<span><i class="fas fa-wallet mr-1 text-gray-600"></i>${this.esc(p.cryptoAddress.substring(0,14))}…</span>` : ''}
                    <span class="text-gray-600"><i class="fas fa-clock mr-1"></i>${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button type="button"
                    data-approve-pending="${p.id || p.userId}"
                    data-is-approval="${p.id ? 'true' : 'false'}"
                    class="neon-btn px-5 py-2 text-xs uppercase">
                    <i class="fas fa-check mr-1"></i>Approve
                  </button>
                  <button type="button"
                    data-reject-pending="${p.id}"
                    class="px-5 py-2 text-xs uppercase rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all">
                    <i class="fas fa-times mr-1"></i>Reject
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>`;
  }

  render() {
    const hash = window.location.hash.replace('#', '');
    const activeId = hash === 'users'   ? 'users'
                   : hash === 'pending' ? 'pending'
                   : hash === 'api'     ? 'api'
                   : 'overview';
    const titleMap = { users: 'Users', pending: 'Pending Users', api: 'GURUBIT API', overview: 'Agent Panel' };
    AgentLayout.renderShell({
      activeId,
      title: titleMap[activeId] || 'Agent Panel',
      bodyHtml: this.renderBody(),
      user: this.user
    });

    // Init news feed on dashboard tab
    if (activeId === 'overview') {
      import('./NewsFeed.js?v=1').then(({ NewsFeed }) => {
        NewsFeed.renderSection('agentNewsFeed', 'News & Announcements');
      }).catch(() => {});
    }

    this._bindUserEvents();

    // Search filter (users tab only)
    document.getElementById('userSearchInput')?.addEventListener('input', (e) => {
      this._searchQuery = e.target.value.toLowerCase().trim();
      const content = document.querySelector('.user-content');
      if (content) {
        content.innerHTML = this.renderUsersSection();
        this._bindUserEvents();
      }
    });

    if (activeId === 'api') {
      document.getElementById('createApiKeyBtn')?.addEventListener('click', () => this.createApiKey());
      document.querySelectorAll('[data-revoke-key]').forEach((btn) => {
        btn.addEventListener('click', () => this.revokeApiKey(btn.dataset.revokeKey));
      });
      document.querySelectorAll('[data-copy-key], .btn-copy').forEach((btn) => {
        btn.addEventListener('click', () => this.copyToClipboard(btn.dataset.copyKey || btn.dataset.copyText, btn));
      });
      document.querySelectorAll('.btn-copy-doc').forEach((btn) => {
        btn.addEventListener('click', () => this.copyToClipboard(btn.dataset.copyText, btn));
      });
      this.initApiUrlBuilder();
    }
  }

  _bindUserEvents() {
    document.querySelectorAll('[data-user-approve]').forEach((btn) => {
      btn.addEventListener('click', () => this.approveUser(btn.dataset.userApprove));
    });
    document.querySelectorAll('[data-toggle-ban]').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleBan(btn.dataset.toggleBan));
    });
    document.querySelectorAll('[data-user-delete]').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteUser(btn.dataset.userDelete));
    });
    // Approve pending (by approvalId or userId)
    document.querySelectorAll('[data-approve-pending]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const isApproval = btn.dataset.isApproval === 'true';
        const id = btn.dataset.approvePending;
        try {
          if (isApproval) {
            const res = await fetch(`/api/agent/approve/${id}`, { method: 'POST' }).then(r => r.json());
            if (!res.success) { alert(res.error?.message || 'Failed'); return; }
          } else {
            await this.approveUser(id);
            return;
          }
          if (window.apiCache) window.apiCache.clear();
          await this.load();
        } catch (e) { alert('Network error'); }
      });
    });
    // Reject pending
    document.querySelectorAll('[data-reject-pending]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Reject this user request?')) return;
        const res = await fetch(`/api/agent/reject/${btn.dataset.rejectPending}`, { method: 'POST' }).then(r => r.json());
        if (res.success) { if (window.apiCache) window.apiCache.clear(); await this.load(); }
        else alert(res.error?.message || 'Failed');
      });
    });
  }

  async init() {
    window.addEventListener('hashchange', () => this.load());
    await this.load();
  }
}
