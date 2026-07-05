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
      getNumberUrl: '',
      getSmsUrl: '',
      controlUrl: '',
      additionalUrls: [],
      apiKey: '',
      providerType: 'sms_only',
      countryId: '',
      serverId: '',
      apiCountryCode: '',
      cliRange: '',
      fbId: '',
      services: []
    };
    this.countries = [];
    this.servers = [];
    this._serviceBlocks = [];      // in-memory service blocks for integrated form
    this._serversByCountry = {};   // countryId → servers[]
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

    const providerType = document.getElementById('providerTypeSelect')?.value || 'sms_only';
    const isIntegrated = providerType === 'integrated';

    const getNumberUrl = (document.getElementById('getNumberUrlInput')?.value || '').trim();
    const getSmsUrl    = (document.getElementById('getSmsUrlInput')?.value || '').trim();
    const controlUrl   = (document.getElementById('controlUrlInput')?.value || '').trim();
    const apiKey       = (document.getElementById('apiKeyInput')?.value || '').trim();
    const serviceName  = (document.getElementById('serviceName')?.value || '').trim();
    const baseUrl      = (document.getElementById('baseUrlInput')?.value || '').trim();
    const fbId         = (document.getElementById('fbIdInput')?.value || '').trim();

    const effectiveBaseUrl = isIntegrated ? (getNumberUrl || baseUrl) : baseUrl;

    if (!effectiveBaseUrl || !apiKey) {
      alert(isIntegrated ? 'Number Add URL and API key are required' : 'Base URL and API key are required');
      return;
    }

    // Collect additional URLs for sms_only
    const additionalUrls = [];
    document.querySelectorAll('.additional-url-input').forEach(inp => {
      const v = (inp.value || '').trim();
      if (v) additionalUrls.push(v);
    });

    // Collect services for integrated
    let services = [];
    if (isIntegrated) {
      document.querySelectorAll('.service-block').forEach((block, idx) => {
        const cId  = block.querySelector('.svc-country')?.value || '';
        const sId  = block.querySelector('.svc-server')?.value || '';
        const code = (block.querySelector('.svc-api-code')?.value || '').trim();
        const cli  = (block.querySelector('.svc-cli-range')?.value || '').trim();
        const lbl  = (block.querySelector('.svc-label')?.value || '').trim();
        const existingId = block.dataset.svcId || '';
        services.push({ id: existingId || `svc_new_${idx}`, countryId: cId || null, serverId: sId || null, apiCountryCode: code, cliRange: cli || null, label: lbl });
      });
      if (services.length === 0) {
        services = [{ countryId: null, serverId: null, apiCountryCode: '', cliRange: null, label: '' }];
      }
    }

    const payload = {
      serviceName: serviceName || 'Provider',
      baseUrl: effectiveBaseUrl,
      getNumberUrl: isIntegrated ? getNumberUrl : '',
      getSmsUrl: isIntegrated ? getSmsUrl : '',
      controlUrl: isIntegrated ? controlUrl : '',
      apiKey,
      providerType,
      additionalUrls: isIntegrated ? [] : additionalUrls,
      fbId: fbId || null,
      services: isIntegrated ? services : []
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
      this._serviceBlocks = [];
      this.formData = {
        serviceName: '', baseUrl: '', getNumberUrl: '', getSmsUrl: '', controlUrl: '',
        additionalUrls: [], apiKey: '', providerType: 'sms_only',
        countryId: '', serverId: '', apiCountryCode: '', cliRange: '', fbId: '', services: []
      };
      await this.loadData();
    } else {
      alert(data.error?.message || `Failed to ${isEdit ? 'update' : 'save'} provider`);
    }
  }

  async handleEdit(k) {
    this.editingProviderId = k.id;
    // Normalise services — support both new `services[]` and legacy single fields
    let services = Array.isArray(k.services) && k.services.length > 0
      ? k.services
      : (k.countryId || k.serverId || k.apiCountryCode || k.cliRange)
        ? [{ id: 'svc_legacy_0', countryId: k.countryId || '', serverId: k.serverId || '', apiCountryCode: k.apiCountryCode || '', cliRange: k.cliRange || '', label: '' }]
        : [];
    this._serviceBlocks = services;
    this.formData = {
      serviceName:    k.serviceName || '',
      baseUrl:        k.baseUrl || '',
      getNumberUrl:   k.getNumberUrl || k.baseUrl || '',
      getSmsUrl:      k.getSmsUrl   || k.baseUrl || '',
      controlUrl:     k.controlUrl  || '',
      additionalUrls: Array.isArray(k.additionalUrls) ? [...k.additionalUrls] : [],
      apiKey:         k.apiKey  || '',
      providerType:   k.providerType || 'sms_only',
      fbId:           k.fbId || '',
      services
    };
    this.showAddForm = true;
    // Pre-load server lists for each service block that has a countryId
    this._serversByCountry = {};
    for (const svc of services) {
      if (svc.countryId && !this._serversByCountry[svc.countryId]) {
        const res = await fetch(`/api/admin/catalog/countries/${svc.countryId}/platforms`);
        const d = await res.json();
        this._serversByCountry[svc.countryId] = d.success ? (d.servers || []) : [];
      }
    }
    this.render();
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
      const serverName = k.serverId || '—';

      // Build services display — support both new services[] and legacy single fields
      const services = Array.isArray(k.services) && k.services.length > 0
        ? k.services
        : (k.countryId || k.serverId)
          ? [{ countryId: k.countryId, serverId: k.serverId, apiCountryCode: k.apiCountryCode, cliRange: k.cliRange, label: '' }]
          : [];

      const servicesHtml = services.length > 0
        ? `<div class="mt-2 space-y-1.5">
            <p class="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <i class="fas fa-layer-group text-primary text-[9px]"></i> Service Targets (${services.length})
            </p>
            ${services.map((svc, i) => {
              const c = this.countries.find(x => x.id === svc.countryId);
              const cName = c ? `${c.flag || '🌍'} ${c.name}` : (svc.countryId || '—');
              return `<div class="flex items-center gap-2 flex-wrap px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                <span class="text-[10px] text-gray-600 font-black w-4 shrink-0">${i+1}</span>
                ${svc.label ? `<span class="text-[10px] font-bold text-primary">${svc.label}</span>` : ''}
                <span class="text-[10px] text-gray-300">${cName}</span>
                ${svc.serverId ? `<span class="text-[10px] text-gray-500">· ${svc.serverId}</span>` : ''}
                ${svc.apiCountryCode ? `<span class="text-[10px] font-mono text-cyan-400/70">code:${svc.apiCountryCode}</span>` : ''}
                ${svc.cliRange ? `<span class="text-[10px] font-mono text-yellow-400/70 truncate max-w-[120px]" title="${svc.cliRange}">${svc.cliRange}</span>` : '<span class="text-[10px] text-gray-600">auto-range</span>'}
              </div>`;
            }).join('')}
          </div>`
        : '<p class="text-[10px] text-gray-600 mt-1">No target services configured — will use all countries</p>';

      return `
        <div class="glass-card p-5 border-white/5 bg-black/40">
          <div class="flex justify-between items-start gap-4 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap mb-2">
                <h4 class="font-black text-white uppercase text-sm">${k.serviceName || 'Provider'}</h4>
                <span class="px-2 py-0.5 rounded text-[9px] uppercase font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Integrated</span>
                ${services.length > 1 ? `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-bold bg-primary/20 text-primary border border-primary/30">${services.length} services</span>` : ''}
              </div>
              <div class="grid grid-cols-1 gap-y-1.5 mb-2 text-xs">
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">
                    <i class="fas fa-phone-square text-cyan-400 mr-1"></i>Number Add URL
                  </span>
                  <p class="font-mono text-gray-300 break-all text-[11px]">${k.getNumberUrl || k.baseUrl || '—'}</p>
                </div>
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">
                    <i class="fas fa-sms text-green-400 mr-1"></i>OTP Receive URL
                  </span>
                  <p class="font-mono text-gray-300 break-all text-[11px]">${k.getSmsUrl || k.baseUrl || '—'}</p>
                </div>
                <div>
                  <span class="text-gray-500 font-bold uppercase text-[10px]">
                    <i class="fas fa-sliders-h text-yellow-400 mr-1"></i>Control URL
                  </span>
                  <p class="font-mono text-gray-300 break-all text-[11px]">${k.controlUrl || '<span class="text-gray-600">Same as Number URL</span>'}</p>
                </div>
              </div>
              ${servicesHtml}
              <p class="text-xs font-mono text-gray-500 mt-2">API Key: ${this.maskKey(k.apiKey)}</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <a href="/admin/sms-feed" class="sms-hit-btn px-3 py-1.5 text-[10px] font-black uppercase rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition flex items-center gap-1.5">
                <i class="fas fa-signal text-[9px]"></i> SMS HIT
              </a>
              <button type="button" class="test-key-btn px-3 py-1.5 text-[10px] font-black uppercase rounded border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition" data-id="${k.id}">
                <i class="fas fa-plug text-[9px]"></i> Test
              </button>
              <button type="button" class="edit-key-btn text-cyan-400 text-xs font-bold uppercase" data-id="${k.id}">Edit</button>
              <button type="button" class="delete-key-btn text-red-400 text-xs font-bold uppercase" data-id="${k.id}">Delete</button>
            </div>
          </div>
          <div id="test-result-${k.id}" class="hidden mt-3 p-3 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap"></div>
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
            ${k.fbId ? `<p class="text-xs text-gray-500 mt-1"><i class="fab fa-facebook text-blue-400 mr-1"></i>FB ID: <span class="font-mono text-gray-300">${k.fbId}</span></p>` : ''}
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

  // Render one service target block (country + server + api code + cli range)
  renderServiceBlock(svc, idx, serversByCountry) {
    const countryId  = svc.countryId  || '';
    const serverId   = svc.serverId   || '';
    const apiCode    = svc.apiCountryCode || '';
    const cliRange   = svc.cliRange   || '';
    const label      = svc.label      || '';
    const svcId      = svc.id         || `svc_new_${idx}`;

    const countryOpts = this.countries.map(c =>
      `<option value="${c.id}" ${countryId === c.id ? 'selected' : ''}>${c.name} (${c.code || c.id})</option>`
    ).join('');

    const servers = (serversByCountry && countryId && serversByCountry[countryId]) || [];
    const serverOpts = servers.map(s =>
      `<option value="${s.id}" ${serverId === s.id ? 'selected' : ''}>${s.name}</option>`
    ).join('');

    return `
      <div class="service-block rounded-xl border border-white/10 bg-black/30 p-4 space-y-3 relative" data-svc-id="${svcId}" data-idx="${idx}">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
            <i class="fas fa-server text-[9px]"></i> Service #${idx + 1}
          </span>
          ${idx > 0 ? `<button type="button" class="remove-svc-btn text-red-400 hover:text-red-300 text-xs p-1.5 rounded bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition" data-idx="${idx}" title="Remove this service">
            <i class="fas fa-times"></i>
          </button>` : ''}
        </div>

        <div>
          <label class="stat-label block mb-1">Label <span class="text-gray-600 font-normal">(optional, e.g. Guinea Mobile)</span></label>
          <input type="text" class="svc-label input-field w-full text-sm" placeholder="e.g. Guinea Mobile" value="${label}">
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="stat-label block mb-1">Target Country <span class="text-gray-500">(optional)</span></label>
            <select class="svc-country input-field w-full text-sm" data-idx="${idx}">
              <option value="">— Any country —</option>
              ${countryOpts}
            </select>
          </div>
          <div>
            <label class="stat-label block mb-1">Target Server/Range <span class="text-gray-500">(optional)</span></label>
            <select class="svc-server input-field w-full text-sm" ${!countryId ? 'disabled' : ''} data-idx="${idx}">
              <option value="">— Any range —</option>
              ${serverOpts}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="stat-label block mb-1">API Country Code <span class="text-gray-500">(e.g. 93)</span></label>
            <input type="text" class="svc-api-code input-field w-full text-sm font-mono" placeholder="e.g. 224" value="${apiCode}">
          </div>
          <div>
            <label class="stat-label block mb-1">CLI Range Filter <span class="text-gray-500">(blank = auto)</span></label>
            <input type="text" class="svc-cli-range input-field w-full text-sm font-mono" placeholder="e.g. 224654XXXXXX" value="${cliRange}">
          </div>
        </div>
        <p class="text-[10px] text-gray-600">Leave CLI Range blank — system auto-picks the best range from Control URL every 2 hours.</p>
      </div>`;
  }

  renderAddForm() {
    if (!this.showAddForm) return '';
    const type = this.formData.providerType || 'sms_only';
    const isIntegrated = type === 'integrated';

    // Ensure at least one service block
    const serviceBlocks = (this._serviceBlocks && this._serviceBlocks.length > 0)
      ? this._serviceBlocks
      : [{ id: 'svc_new_0', countryId: '', serverId: '', apiCountryCode: '', cliRange: '', label: '' }];

    return `
      <form id="addKeyForm" class="glass-card p-6 mb-8 space-y-5 border-primary/20">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-sm font-black text-white uppercase tracking-wider">
            ${this.editingProviderId ? '✏️ Edit Provider' : '➕ Add New Provider'}
          </h3>
          <button type="button" id="cancelFormBtn" class="text-gray-500 hover:text-white text-xs uppercase font-bold px-3 py-1.5 rounded border border-white/10 hover:border-white/25 transition">Cancel</button>
        </div>

        <!-- Type + Name -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="stat-label block mb-1">Provider Type</label>
            <select id="providerTypeSelect" class="input-field w-full">
              <option value="sms_only"   ${!isIntegrated ? 'selected' : ''}>SMS Only (Webhook/Polling)</option>
              <option value="integrated" ${isIntegrated  ? 'selected' : ''}>Number + SMS Integrated API</option>
            </select>
          </div>
          <div>
            <label class="stat-label block mb-1">Provider Name</label>
            <input type="text" id="serviceName" class="input-field w-full" placeholder="e.g. STEX, Propyter" value="${this.formData.serviceName}" required>
          </div>
        </div>

        ${isIntegrated ? `
        <!-- ── Integrated: API Endpoints ── -->
        <div class="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <p class="text-[10px] text-primary uppercase font-black tracking-widest">API Endpoints</p>
          <div>
            <label class="stat-label block mb-1"><i class="fas fa-phone-square text-cyan-400 mr-1"></i>Number Add URL <span class="text-red-400">*</span></label>
            <input type="text" id="getNumberUrlInput" class="input-field font-mono text-sm w-full"
              placeholder="e.g. https://api.2oo9.cloud/MXS47/@public/api/getnum"
              value="${this.formData.getNumberUrl || this.formData.baseUrl || ''}" required>
            <p class="text-[10px] text-gray-500 mt-1">System will append <code>/numbers?status=assigned&limit=500</code></p>
          </div>
          <div>
            <label class="stat-label block mb-1"><i class="fas fa-sms text-green-400 mr-1"></i>OTP Receive URL <span class="text-red-400">*</span></label>
            <input type="text" id="getSmsUrlInput" class="input-field font-mono text-sm w-full"
              placeholder="e.g. https://api.2oo9.cloud/MXS47/@public/api/success-otp"
              value="${this.formData.getSmsUrl || this.formData.baseUrl || ''}" required>
            <p class="text-[10px] text-gray-500 mt-1">System will append <code>/otp?number=...&since=...&limit=10</code></p>
          </div>
          <div>
            <label class="stat-label block mb-1"><i class="fas fa-sliders-h text-yellow-400 mr-1"></i>Control / Console URL <span class="text-gray-500 font-normal">(optional)</span></label>
            <input type="text" id="controlUrlInput" class="input-field font-mono text-sm w-full"
              placeholder="e.g. https://api.2oo9.cloud/MXS47/@public/api/console"
              value="${this.formData.controlUrl || ''}">
            <p class="text-[10px] text-gray-500 mt-1">Used for <code>/cli-ranges</code> auto best-range. Leave blank to use Number URL.</p>
          </div>
        </div>

        <!-- ── API Key (integrated) ── -->
        <div class="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
          <label class="stat-label block mb-1"><i class="fas fa-key text-yellow-400 mr-1"></i>API Key <span class="text-red-400">*</span></label>
          <input type="password" id="apiKeyInput" class="input-field font-mono w-full" placeholder="Provider API secret token" value="${this.formData.apiKey}" required>
        </div>

        <!-- ── Service Targets ── -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <i class="fas fa-layer-group text-primary text-xs"></i> Service Targets
            </p>
            <button type="button" id="addSvcBlockBtn" class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition">
              <i class="fas fa-plus text-[9px]"></i> Add Service
            </button>
          </div>
          <p class="text-[10px] text-gray-500 mb-3">One provider can serve multiple countries/ranges. Add a service block for each.</p>
          <div id="serviceBlocksContainer" class="space-y-3">
            ${serviceBlocks.map((svc, i) => this.renderServiceBlock(svc, i, this._serversByCountry || {})).join('')}
          </div>
        </div>
        ` : `
        <!-- ── SMS Only: URLs ── -->
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="stat-label block mb-0">API Base URL <span class="text-red-400">*</span></label>
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
        <div>
          <label class="stat-label block mb-1">FB ID / Panel ID <span class="text-gray-500 font-normal">(optional)</span></label>
          <input type="text" id="fbIdInput" class="input-field w-full font-mono" placeholder="e.g. 123456789" value="${this.formData.fbId || ''}">
          <p class="text-[10px] text-gray-500 mt-1">Used to filter SMS from a specific Facebook/panel account.</p>
        </div>
        <!-- SMS Only: API Key -->
        <div>
          <label class="stat-label block mb-1"><i class="fas fa-key text-yellow-400 mr-1"></i>API Key <span class="text-red-400">*</span></label>
          <input type="password" id="apiKeyInput" class="input-field font-mono w-full" placeholder="Provider API secret token" value="${this.formData.apiKey}" required>
        </div>
        `}

        <button type="submit" class="neon-btn w-full py-3.5 text-xs uppercase font-black tracking-widest">
          <i class="fas fa-save mr-2"></i>${this.editingProviderId ? 'Update Provider' : 'Save Provider'}
        </button>
      </form>`;
  }
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

  // Re-render only the service blocks container (no full page re-render)
  _renderServiceBlocks() {
    const container = document.getElementById('serviceBlocksContainer');
    if (!container) { this.render(); return; }
    const blocks = this._serviceBlocks || [];
    container.innerHTML = blocks.map((svc, i) => this.renderServiceBlock(svc, i, this._serversByCountry || {})).join('');
    // Re-bind events for the new blocks
    container.querySelectorAll('.remove-svc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx) && this._serviceBlocks.length > 1) {
          this._serviceBlocks.splice(idx, 1);
          this._renderServiceBlocks();
        }
      });
    });
    container.querySelectorAll('.svc-country').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const idx = parseInt(sel.dataset.idx, 10);
        const countryId = e.target.value;
        if (isNaN(idx)) return;
        if (this._serviceBlocks[idx]) this._serviceBlocks[idx].countryId = countryId;
        if (countryId && !this._serversByCountry[countryId]) {
          const res = await fetch(`/api/admin/catalog/countries/${countryId}/platforms`);
          const d = await res.json();
          this._serversByCountry[countryId] = d.success ? (d.servers || []) : [];
        }
        const block = container.querySelector(`.service-block[data-idx="${idx}"]`);
        if (block) {
          const svrSel = block.querySelector('.svc-server');
          const servers = (countryId && this._serversByCountry[countryId]) || [];
          svrSel.innerHTML = `<option value="">— Any range —</option>` +
            servers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
          svrSel.disabled = servers.length === 0;
        }
      });
    });
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
        this._serviceBlocks = [];
        this.formData = { serviceName: '', baseUrl: '', additionalUrls: [], apiKey: '', providerType: 'sms_only', fbId: '', services: [] };
      }
      this.render();
    });

    // Cancel form
    document.getElementById('cancelFormBtn')?.addEventListener('click', () => {
      this.showAddForm = false;
      this.editingProviderId = null;
      this._serviceBlocks = [];
      this.formData = { serviceName: '', baseUrl: '', additionalUrls: [], apiKey: '', providerType: 'sms_only', fbId: '', services: [] };
      this.render();
    });

    // Form submit
    document.getElementById('addKeyForm')?.addEventListener('submit', e => this.handleAdd(e));

    // Provider type dropdown — re-render form on change
    document.getElementById('providerTypeSelect')?.addEventListener('change', e => {
      this.formData.providerType = e.target.value;
      if (e.target.value === 'integrated' && (!this._serviceBlocks || this._serviceBlocks.length === 0)) {
        this._serviceBlocks = [{ id: 'svc_new_0', countryId: '', serverId: '', apiCountryCode: '', cliRange: '', label: '' }];
      }
      this.render();
    });

    // Common fields
    document.getElementById('serviceName')?.addEventListener('input', e => { this.formData.serviceName = e.target.value; });
    document.getElementById('baseUrlInput')?.addEventListener('input', e => { this.formData.baseUrl = e.target.value; });
    document.getElementById('apiKeyInput')?.addEventListener('input', e => { this.formData.apiKey = e.target.value; });

    // ── Integrated: Service block events ──────────────────────────────
    // "+ Add Service" button
    document.getElementById('addSvcBlockBtn')?.addEventListener('click', () => {
      if (!this._serviceBlocks) this._serviceBlocks = [];
      this._serviceBlocks.push({ id: `svc_new_${Date.now()}`, countryId: '', serverId: '', apiCountryCode: '', cliRange: '', label: '' });
      this._renderServiceBlocks();
    });

    // Remove service block
    document.querySelectorAll('.remove-svc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx) && this._serviceBlocks.length > 1) {
          this._serviceBlocks.splice(idx, 1);
          this._renderServiceBlocks();
        }
      });
    });

    // Country change inside a service block → load servers
    document.querySelectorAll('.svc-country').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const idx = parseInt(sel.dataset.idx, 10);
        const countryId = e.target.value;
        if (isNaN(idx)) return;
        if (this._serviceBlocks[idx]) this._serviceBlocks[idx].countryId = countryId;
        if (countryId && !this._serversByCountry[countryId]) {
          const res = await fetch(`/api/admin/catalog/countries/${countryId}/platforms`);
          const d = await res.json();
          this._serversByCountry[countryId] = d.success ? (d.servers || []) : [];
        }
        // Update the server select in this block
        const block = document.querySelector(`.service-block[data-idx="${idx}"]`);
        if (block) {
          const svrSel = block.querySelector('.svc-server');
          const servers = (countryId && this._serversByCountry[countryId]) || [];
          svrSel.innerHTML = `<option value="">— Any range —</option>` +
            servers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
          svrSel.disabled = servers.length === 0;
        }
      });
    });

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

    // Test provider connection
    document.querySelectorAll('.test-key-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const resultBox = document.getElementById(`test-result-${id}`);
        if (!resultBox) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-[9px]"></i> Testing…';
        resultBox.className = 'mt-3 p-3 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap';
        resultBox.textContent = 'Connecting…';
        try {
          const r = await fetch(`/api/admin/api-keys/${id}/test`, { method: 'POST', credentials: 'include' });
          const data = await r.json().catch(() => ({}));
          const ok = data.connected;
          resultBox.className = `mt-3 p-3 rounded-lg border text-xs font-mono overflow-x-auto whitespace-pre-wrap ${ok ? 'bg-green-500/5 border-green-500/20 text-green-300' : 'bg-red-500/5 border-red-500/20 text-red-300'}`;
          resultBox.textContent = JSON.stringify(data.results || data, null, 2);
        } catch (e) {
          resultBox.className = 'mt-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs font-mono text-red-300';
          resultBox.textContent = `Error: ${e.message}`;
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plug text-[9px]"></i> Test';
      });
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
    // Render shell immediately — data loads in background
    this.render();
    await this.loadData();
    this.setupWebSocket();
  }
}
