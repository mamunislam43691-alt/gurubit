/**
 * Admin Provider — Manage webhook and integrated SMS providers
 * SMS HIT button navigates to /admin/sms-feed (dedicated page)
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminApiKeys {
  constructor() {
    this.keys = [];
    this.showAddForm = false;
    this.editingProviderId = null;
    this.formData = {
      serviceName: '',
      baseUrl: '',
      additionalUrls: [],
      apiKey: '',
      providerType: 'sms_only',
      countryId: '',
      serverId: '',
      apiCountryCode: '',
      cliRange: ''
    };
    this.countries = [];
    this.servers = [];
    this.admin = null;
    this.search = '';
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 60;
    this.reconnectDelay = 5000;
    this.reconnectMultiplier = 2;
  }

  async loadData() {
    const response = await fetch('/api/admin/api-keys');
    const data = await response.json();
    if (data.success) this.keys = data.keys || [];
    if (!this.countries || this.countries.length === 0) {
      const res = await fetch('/api/admin/catalog/countries');
      const cData = await res.json();
      if (cData.success) this.countries = cData.countries || [];
    }
    this.render();
  }

  async loadServers(countryId) {
    if (!countryId) { this.servers = []; this.render(); return; }
    const res = await fetch(`/api/admin/catalog/countries/${countryId}/platforms`);
    const data = await res.json();
    this.servers = data.success ? (data.servers || []) : [];
    this.render();
  }

  async handleAdd(e) {
    e.preventDefault();

    // Read directly from DOM at submit time — avoids stale formData issues
    const baseUrl = (document.getElementById('baseUrlInput')?.value || '').trim();
    const apiKey = (document.getElementById('apiKeyInput')?.value || '').trim();
    const serviceName = (document.getElementById('serviceName')?.value || '').trim();
    const providerType = document.getElementById('providerTypeSelect')?.value || this.formData.providerType || 'sms_only';
    const countryId = document.getElementById('providerCountryId')?.value || this.formData.countryId || '';
    const serverId = document.getElementById('providerServerId')?.value || this.formData.serverId || '';
    const apiCountryCode = (document.getElementById('apiCountryCodeInput')?.value || '').trim();
    const cliRange = (document.getElementById('cliRangeInput')?.value || '').trim();

    // Collect additional URLs for sms_only
    const additionalUrls = [];
    document.querySelectorAll('.additional-url-input').forEach(inp => {
      const v = (inp.value || '').trim();
      if (v) additionalUrls.push(v);
    });

    if (!baseUrl || !apiKey) {
      alert('Base URL and API key are required');
      return;
    }

    const payload = {
      serviceName: serviceName || 'Provider',
      baseUrl,
      apiKey,
      providerType,
      additionalUrls: providerType === 'integrated' ? [] : additionalUrls,
      countryId: countryId || null,
      serverId: serverId || null,
      apiCountryCode,
      cliRange: cliRange || null
    };

    const isEdit = !!this.editingProviderId;
    const url = isEdit ? `/api/admin/api-keys/${this.editingProviderId}` : '/api/admin/api-keys';
    const response = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success !== false) {
      this.showAddForm = false;
      this.editingProviderId = null;
      this.formData = { serviceName: '', baseUrl: '', additionalUrls: [], apiKey: '', providerType: 'sms_only', countryId: '', serverId: '', apiCountryCode: '', cliRange: '' };
      await this.loadData();
    } else {
      alert(data.error?.message || `Failed to ${isEdit ? 'update' : 'save'} provider`);
    }
  }

  async handleEdit(k) {
    this.editingProviderId = k.id;
    this.formData = {
      serviceName: k.serviceName || '',
      baseUrl: k.baseUrl || '',
      additionalUrls: Array.isArray(k.additionalUrls) ? [...k.additionalUrls] : [],
      apiKey: k.apiKey || '',
      providerType: k.providerType || 'sms_only',
      countryId: k.countryId || '',
      serverId: k.serverId || '',
      apiCountryCode: k.apiCountryCode || '',
      cliRange: k.cliRange || ''
    };
    this.showAddForm = true;
    if (this.formData.countryId) await this.loadServers(this.formData.countryId);
    else { this.servers = []; this.render(); }
  }

  async handleDelete(id) {
    if (!confirm('Delete this provider?')) return;
    await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
    await this.loadData();
  }

  maskKey(key) {
    if (!key || key.length < 10) return '••••••••';
    return key.substring(0, 6) + '••••••' + key.substring(key.length - 4);
  }

  renderStatusBadge(statusObj) {
    const status = statusObj?.status || 'unknown';
    const lastError = statusObj?.lastError || '';
    if (status === 'connected') return `
      <span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>Connection Successful
      </span>`;
    if (status === 'disconnected') return `
      <span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 cursor-help" title="${lastError.replace(/"/g, '&quot;')}">
        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Disconnected
      </span>`;
    return `
      <span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>Checking...
      </span>`;
  }

  renderKeyCard(k) {
    const type = k.providerType || 'sms_only';

    if (type === 'integrated') {
      // Find country/server names
      const country = this.countries.find(c => c.id === k.countryId);
      const countryName = country ? country.name : (k.countryId || '—');
      // We may not have servers loaded for all countries; show id as fallback
      const serverName = k.serverId || '—';

      return `
        <div class="glass-card p-5 border-white/5 bg-black/40">
          <div class="flex justify-between items-start gap-4 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap mb-2">
                <h4 class="font-black text-white uppercase text-sm">${k.serviceName || 'Provider'}</h4>
                <span class="px-2 py-0.5 rounded text-[9px] uppercase font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Integrated</span>
              </div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 mb-2 text-xs">
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">Base URL</span>
                  <p class="font-mono text-gray-300 break-all">${k.baseUrl || '—'}</p>
                </div>
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">Country</span>
                  <p class="text-gray-300">${countryName}</p>
                </div>
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">Server/Range</span>
                  <p class="text-gray-300">${serverName}</p>
                </div>
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">API Country Code</span>
                  <p class="text-gray-300">${k.apiCountryCode || '—'}</p>
                </div>
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">CLI Range</span>
                  <p class="text-gray-300 font-mono text-[11px]">${k.cliRange || '<span class="text-gray-600">Auto (best range)</span>'}</p>
                </div>
              </div>
              <p class="text-xs font-mono text-gray-500">API Key: ${this.maskKey(k.apiKey)}</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <a href="/admin/sms-feed" class="sms-hit-btn px-3 py-1.5 text-[10px] font-black uppercase rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition flex items-center gap-1.5">
                <i class="fas fa-signal text-[9px]"></i> SMS HIT
              </a>
              <button type="button" class="edit-key-btn text-cyan-400 text-xs font-bold uppercase" data-id="${k.id}">Edit</button>
              <button type="button" class="delete-key-btn text-red-400 text-xs font-bold uppercase" data-id="${k.id}">Delete</button>
            </div>
          </div>
        </div>`;
    }

    // sms_only card
    const urls = [k.baseUrl, ...(k.additionalUrls || [])].filter(u => u && u.trim());
    const urlRows = urls.map(u => {
      const statusObj = (k.urlStatuses || {})[u] || { status: 'unknown' };
      return `
        <div class="flex items-center gap-2 flex-wrap mt-1">
          <code class="text-xs font-mono text-gray-400 break-all">${u}</code>
          ${this.renderStatusBadge(statusObj)}
        </div>`;
    }).join('');

    return `
      <div class="glass-card p-5 border-white/5 bg-black/40">
        <div class="flex justify-between items-start gap-4 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap mb-2">
              <h4 class="font-black text-white uppercase text-sm">${k.serviceName || 'Provider'}</h4>
              <span class="px-2 py-0.5 rounded text-[9px] uppercase font-bold bg-gray-700 text-gray-300">SMS Webhook</span>
            </div>
            <div class="space-y-1 mb-2">
              <p class="text-[10px] font-black text-gray-500 uppercase tracking-wider">API URL(s)</p>
              ${urlRows || '<p class="text-xs text-gray-600">No URL configured</p>'}
            </div>
            <p class="text-xs font-mono text-gray-500">API Key: ${this.maskKey(k.apiKey)}</p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <a href="/admin/sms-feed" class="sms-hit-btn px-3 py-1.5 text-[10px] font-black uppercase rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition flex items-center gap-1.5">
              <i class="fas fa-signal text-[9px]"></i> SMS HIT
            </a>
            <button type="button" class="edit-key-btn text-cyan-400 text-xs font-bold uppercase" data-id="${k.id}">Edit</button>
            <button type="button" class="delete-key-btn text-red-400 text-xs font-bold uppercase" data-id="${k.id}">Delete</button>
          </div>
        </div>
      </div>`;
  }

  renderAddForm() {
    if (!this.showAddForm) return '';
    const type = this.formData.providerType || 'sms_only';
    const isIntegrated = type === 'integrated';

    const countryOptions = this.countries.map(c =>
      `<option value="${c.id}" ${this.formData.countryId === c.id ? 'selected' : ''}>${c.name} (${c.code || c.id})</option>`
    ).join('');

    const serverOptions = this.servers.map(s =>
      `<option value="${s.id}" ${this.formData.serverId === s.id ? 'selected' : ''}>${s.name}</option>`
    ).join('');

    return `
      <form id="addKeyForm" class="glass-card p-6 mb-8 space-y-4 border-primary/20">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-2">
          ${this.editingProviderId ? 'Edit Provider' : 'Add New Provider'}
        </h3>

        <div>
          <label class="stat-label block mb-1">Provider Type</label>
          <select id="providerTypeSelect" class="input-field w-full">
            <option value="sms_only" ${!isIntegrated ? 'selected' : ''}>SMS Only (Webhook/Polling)</option>
            <option value="integrated" ${isIntegrated ? 'selected' : ''}>Number + SMS Integrated API</option>
          </select>
        </div>

        <div>
          <label class="stat-label block mb-1">Provider Name</label>
          <input type="text" id="serviceName" class="input-field w-full" placeholder="e.g. Propyter, SMS-Activate, Webhook Gate" value="${this.formData.serviceName}" required>
        </div>

        ${isIntegrated ? `
        <div>
          <label class="stat-label block mb-1">Base URL</label>
          <input type="text" id="baseUrlInput" class="input-field font-mono text-sm w-full" placeholder="e.g. http://203.161.58.20:3001/api/functions/agent-api" value="${this.formData.baseUrl}" required>
          <p class="text-[10px] text-gray-500 mt-1">The system will append <code>/numbers</code> and <code>/otp</code> automatically.</p>
        </div>

        <div>
          <label class="stat-label block mb-1">Target Country <span class="text-gray-500">(optional)</span></label>
          <select id="providerCountryId" class="input-field w-full">
            <option value="">— Select country —</option>
            ${countryOptions}
          </select>
        </div>

        <div>
          <label class="stat-label block mb-1">Target Server/Range <span class="text-gray-500">(optional)</span></label>
          <select id="providerServerId" class="input-field w-full" ${!this.formData.countryId ? 'disabled' : ''}>
            <option value="">— Select server —</option>
            ${serverOptions}
          </select>
        </div>

        <div>
          <label class="stat-label block mb-1">API Country Code <span class="text-gray-500">(e.g. 93 for Afghanistan)</span></label>
          <input type="text" id="apiCountryCodeInput" class="input-field w-full" placeholder="e.g. 93" value="${this.formData.apiCountryCode}">
        </div>

        <div>
          <label class="stat-label block mb-1">CLI Range Filter <span class="text-gray-500">(optional — leave blank for auto-select)</span></label>
          <input type="text" id="cliRangeInput" class="input-field w-full font-mono" placeholder="e.g. AFGHANISTAN_POXY_24002026" value="${this.formData.cliRange || ''}">
          <p class="text-[10px] text-gray-500 mt-1">
            If set, numbers will only be taken from this range. Leave blank to auto-select the best range every 2 hours.
            <span id="activeRangeDisplay" class="text-primary ml-1"></span>
          </p>
        </div>
        ` : `
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="stat-label block mb-0">API Base URL</label>
            <button type="button" id="addUrlBtn" class="px-2.5 py-1 text-[10px] uppercase font-bold bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/35 transition flex items-center gap-1">
              <i class="fas fa-plus text-[8px]"></i> Add URL
            </button>
          </div>
          <input type="text" id="baseUrlInput" class="input-field font-mono text-sm w-full" placeholder="e.g. http://203.161.58.20/api/functions/agent-api/otp" value="${this.formData.baseUrl}" required>
          <div id="additionalUrlsContainer" class="space-y-2">
            ${(this.formData.additionalUrls || []).map((url, idx) => `
              <div class="flex items-center gap-2">
                <input type="text" class="additional-url-input input-field font-mono text-sm flex-1" value="${url}" data-index="${idx}">
                <button type="button" class="remove-url-btn text-red-400 p-2.5 bg-red-500/10 border border-red-500/20 rounded shrink-0" data-index="${idx}">
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>`).join('')}
          </div>
        </div>
        `}

        <div>
          <label class="stat-label block mb-1">API Key</label>
          <input type="password" id="apiKeyInput" class="input-field font-mono w-full" placeholder="Provider API secret token" value="${this.formData.apiKey}" required>
        </div>

        <button type="submit" class="neon-btn w-full py-3 text-xs uppercase">
          ${this.editingProviderId ? 'Update Provider' : 'Save Provider'}
        </button>
      </form>`;
  }

  renderBody() {
    const filtered = this.search
      ? this.keys.filter(k =>
          (k.serviceName || '').toLowerCase().includes(this.search.toLowerCase()) ||
          (k.baseUrl || '').toLowerCase().includes(this.search.toLowerCase()))
      : this.keys;

    const webhookKeys    = filtered.filter(k => (k.providerType || 'sms_only') === 'sms_only');
    const integratedKeys = filtered.filter(k => k.providerType === 'integrated');

    return `
      <p class="text-gray-500 text-sm mb-4">Manage SMS providers. Configure webhooks or integrate Number + SMS API ranges.</p>
      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <input type="search" id="providerSearch" class="input-field flex-1" placeholder="Search provider..." value="${this.search}">
        <button type="button" id="toggleAddBtn" class="neon-btn px-6 py-3 text-xs uppercase">
          ${this.showAddForm ? 'Cancel' : '+ Provider'}
        </button>
      </div>

      ${this.renderAddForm()}

      <div class="space-y-8">
        <div>
          <h3 class="text-sm font-black text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-4">
            <i class="fas fa-satellite-dish mr-2 text-primary"></i>SMS Webhook / Polling Providers
          </h3>
          ${webhookKeys.length
            ? `<div class="space-y-3">${webhookKeys.map(k => this.renderKeyCard(k)).join('')}</div>`
            : '<p class="text-gray-500 text-xs">No webhook providers configured.</p>'}
        </div>

        <div>
          <h3 class="text-sm font-black text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-4">
            <i class="fas fa-plug mr-2 text-blue-400"></i>Number + SMS Integrated API Providers
          </h3>
          ${integratedKeys.length
            ? `<div class="space-y-3">${integratedKeys.map(k => this.renderKeyCard(k)).join('')}</div>`
            : '<p class="text-gray-500 text-xs">No integrated providers configured.</p>'}
        </div>
      </div>
      <p class="text-xs text-gray-600 mt-8">Webhook body layout: <code class="text-primary">{"phoneNumber":"937...","message":"Your code is 123456"}</code> + header <code>X-API-Key</code></p>`;
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'provider',
      title: 'Provider',
      subtitle: 'Manage Webhook and SMS-Activate integrated range APIs',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    // Search
    document.getElementById('providerSearch')?.addEventListener('input', e => {
      this.search = e.target.value; this.render();
    });

    // Toggle add form
    document.getElementById('toggleAddBtn')?.addEventListener('click', () => {
      this.showAddForm = !this.showAddForm;
      if (!this.showAddForm) {
        this.editingProviderId = null;
        this.formData = { serviceName: '', baseUrl: '', additionalUrls: [], apiKey: '', providerType: 'sms_only', countryId: '', serverId: '', apiCountryCode: '', cliRange: '' };
      }
      this.render();
    });

    // Form submit
    document.getElementById('addKeyForm')?.addEventListener('submit', e => this.handleAdd(e));

    // Provider type dropdown — re-render form on change
    document.getElementById('providerTypeSelect')?.addEventListener('change', e => {
      this.formData.providerType = e.target.value;
      this.render();
    });

    // Common fields
    document.getElementById('serviceName')?.addEventListener('input', e => { this.formData.serviceName = e.target.value; });
    document.getElementById('baseUrlInput')?.addEventListener('input', e => { this.formData.baseUrl = e.target.value; });
    document.getElementById('apiKeyInput')?.addEventListener('input', e => { this.formData.apiKey = e.target.value; });

    // Integrated-only fields
    document.getElementById('providerCountryId')?.addEventListener('change', async e => {
      this.formData.countryId = e.target.value;
      this.formData.serverId = '';
      await this.loadServers(e.target.value);
    });
    document.getElementById('providerServerId')?.addEventListener('change', e => { this.formData.serverId = e.target.value; });
    document.getElementById('apiCountryCodeInput')?.addEventListener('input', e => { this.formData.apiCountryCode = e.target.value; });
    document.getElementById('cliRangeInput')?.addEventListener('input', e => { this.formData.cliRange = e.target.value; });

    // SMS-only: Add extra URL
    document.getElementById('addUrlBtn')?.addEventListener('click', () => {
      if (!Array.isArray(this.formData.additionalUrls)) this.formData.additionalUrls = [];
      this.formData.additionalUrls.push('');
      this.render();
    });
    document.querySelectorAll('.additional-url-input').forEach(input => {
      input.addEventListener('input', e => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (!isNaN(idx)) this.formData.additionalUrls[idx] = e.target.value;
      });
    });
    document.querySelectorAll('.remove-url-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        if (!isNaN(idx)) { this.formData.additionalUrls.splice(idx, 1); this.render(); }
      });
    });

    // Edit / Delete
    document.querySelectorAll('.edit-key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = this.keys.find(x => x.id === btn.dataset.id);
        if (k) this.handleEdit(k);
      });
    });
    document.querySelectorAll('.delete-key-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleDelete(btn.dataset.id));
    });
  }

  setupWebSocket() {
    try {
      if (this.ws) { try { this.ws.close(); } catch {} }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${window.location.host}`);
      this.ws.onopen = () => { this.reconnectAttempts = 0; };
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'provider_status_changed') {
            const k = this.keys.find(x => x.id === data.providerId);
            if (k && data.url) {
              if (!k.urlStatuses) k.urlStatuses = {};
              k.urlStatuses[data.url] = { status: data.status, lastPollTime: data.lastPollTime, lastError: data.lastError };
              this.render();
            }
          }
        } catch {}
      };
      this.ws.onclose = () => {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectDelay * Math.pow(this.reconnectMultiplier, this.reconnectAttempts - 1), 120000);
          setTimeout(() => this.setupWebSocket(), delay);
        }
      };
    } catch {}
  }

  destroy() {
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
    this.setupWebSocket();
  }
}
