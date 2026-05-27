/**
 * Admin SMS Feed — Dedicated full page
 * Shows all real-time SMS from provider APIs
 * Route: /admin/sms-feed
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminSmsFeed {
  constructor() {
    this.admin = null;
    this.messages = [];
    this.filter = 'all';
    this.numberRequests = [];
    this.rangeData = [];
    this.rangeLiveRows = [];
    this.apiRangeData = [];      // ← new: integrated API range data
    this.apiRangeLoading = false;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 60;
    this.reconnectDelay = 3000;
    this.reconnectMultiplier = 1.5;
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  _tabs() {
    const all       = this.messages.length;
    const matched   = this.messages.filter(m => m.matched === true).length;
    const unmatched = this.messages.filter(m => m.matched === false).length;

    return [
      { id: 'all',             label: 'All SMS',         count: all },
      { id: 'matched',         label: 'Matched',         count: matched },
      { id: 'unmatched',       label: 'Unmatched',       count: unmatched },
      { id: 'number_requests', label: 'Number Requests', count: this.numberRequests.length },
      { id: 'range',           label: 'Range',           count: this.rangeData.length },
      { id: 'range_live',      label: 'Range Live',      count: this.rangeLiveRows.length },
      { id: 'api_range_live',  label: 'API Range Live',  count: this.apiRangeData.length }
    ];
  }

  _filtered() {
    if (this.filter === 'matched')   return this.messages.filter(m => m.matched === true);
    if (this.filter === 'unmatched') return this.messages.filter(m => m.matched === false);
    if (this.filter === 'number_requests') {
      // Map numberRequests to feed-like rows for table rendering
      return this.numberRequests.map(r => ({
        id: r.numberId || r.id || '',
        country: r.countryName || '—',
        phoneNumber: r.phoneNumber || '—',
        otp: null,
        content: r.phoneNumber || '',
        matched: null,
        createdAt: r.createdAt || new Date().toISOString()
      }));
    }
    return this.messages;
  }

  _renderRow(m) {
    // Format time properly
    let time = '—';
    try {
      const timestamp = m.receivedAt || m.createdAt;
      if (timestamp) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      }
    } catch (e) {
      console.warn('Time parsing error:', e);
    }

    // Extract OTP from content if not directly provided
    const otp = m.otp || m.otpCode || this._extractOTP(m.content || m.message || '');
    
    // Get full SMS content (not truncated for display)
    const sms = (m.content || m.message || '').slice(0, 140);
    
    // Determine status badge - handle number request rows (matched is null)
    let statusBadge;
    if (m.matched === true) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-green-500/15 text-green-400 border border-green-500/25 whitespace-nowrap">✓ Matched</span>`;
    } else if (m.matched === false) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-gray-500/15 text-gray-500 border border-gray-500/25 whitespace-nowrap">No Match</span>`;
    } else {
      // For number requests and other pending items
      statusBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/15 text-blue-400 border border-blue-500/25 whitespace-nowrap">🔔 Pending</span>`;
    }

    return `
      <tr class="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer" data-id="${m.id || ''}">
        <td class="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">${m.country || '—'}</td>
        <td class="px-4 py-3 font-mono text-xs text-primary whitespace-nowrap">${m.phoneNumber || '—'}</td>
        <td class="px-4 py-3 whitespace-nowrap">
          ${otp
            ? `<span class="font-mono text-sm font-black text-white bg-primary/10 border border-primary/25 px-2 py-0.5 rounded">${otp}</span>`
            : `<span class="text-gray-600 text-xs">—</span>`}
        </td>
        <td class="px-4 py-3 text-xs text-gray-400 max-w-sm">${sms || '—'}</td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3 text-xs text-gray-600 font-mono whitespace-nowrap">${time}</td>
      </tr>`;
  }

  _extractOTP(text) {
    if (!text) return null;
    // Extract 4-6 digit codes from SMS content
    const match = text.replace(/\s+/g, '').match(/\d{4,6}/);
    return match ? match[0] : null;
  }

  _renderBody() {
    const tabs     = this._tabs();
    const filtered = this._filtered();

    return `
      <!-- Header bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-black uppercase">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>Live
          </span>
          <span class="text-xs text-gray-500">${this.messages.length} total message${this.messages.length !== 1 ? 's' : ''}</span>
        </div>
        <button type="button" id="smsFeedClearBtn"
          class="px-3 py-1.5 text-[10px] font-bold uppercase text-red-400 hover:text-red-300 border border-red-500/20 rounded hover:bg-red-500/10 transition flex items-center gap-1.5">
          <i class="fas fa-trash-alt"></i> Clear
        </button>
      </div>

      <!-- Filter tabs -->
      <div class="flex items-center gap-1 mb-4 flex-wrap">
        ${tabs.map(t => `
          <button type="button" class="sms-feed-tab px-4 py-2 rounded-lg text-[10px] font-black uppercase transition
            ${this.filter === t.id
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/10'}"
            data-tab="${t.id}">
            ${t.label}
            <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px]
              ${this.filter === t.id ? 'bg-primary/30' : 'bg-white/5'}">
              ${t.count}
            </span>
          </button>
        `).join('')}
      </div>

      <!-- Table -->
      <div class="glass-card overflow-hidden border-white/5">
        <div class="overflow-x-auto">
          ${this.filter === 'range' ? this._renderRange() :
            this.filter === 'range_live' ? this._renderRangeLive() :
            this.filter === 'api_range_live' ? this._renderApiRangeLive() :
          `<table class="w-full text-left" style="border-collapse:collapse; min-width:720px;">
            <thead style="background:rgba(10,30,59,0.9);">
              <tr>
                <th class="px-4 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Country</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Number</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">OTP</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">SMS</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Status</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Time</th>
              </tr>
            </thead>
            <tbody id="smsFeedTbody">
              ${this.filter === 'number_requests'
                ? this._renderNumberRequests()
                : (this._filtered().length
                  ? this._filtered().map(m => this._renderRow(m)).join('')
                  : `<tr><td colspan="6" class="px-4 py-20 text-center">
                      <div class="flex flex-col items-center gap-3">
                        <i class="fas fa-satellite-dish text-5xl text-gray-700"></i>
                        <p class="text-gray-500 text-sm font-semibold">Waiting for SMS from providers...</p>
                        <p class="text-gray-600 text-xs">Messages will appear here in real-time as they arrive</p>
                      </div>
                    </td></tr>`)}
            </tbody>
          </table>`}
        </div>

        <!-- Footer stats -->
        <div id="smsFeedStats" class="px-5 py-3 border-t border-white/5 flex flex-wrap items-center gap-6 text-xs text-gray-500">
          <span>Total: <strong class="text-white">${this.messages.length}</strong></span>
          <span>Matched: <strong class="text-green-400">${this.messages.filter(m => m.matched === true).length}</strong></span>
          <span>Unmatched: <strong class="text-gray-400">${this.messages.filter(m => m.matched === false).length}</strong></span>
          <span class="ml-auto text-gray-600">Showing last 500 messages · Auto-updates live</span>
        </div>
      </div>
      
      <!-- Number Request Detail Modal -->
      <div id="numberRequestModal" class="fixed inset-0 flex items-center justify-center hidden z-[100]">
        <div class="absolute inset-0 bg-black/60"></div>
        <div class="relative max-w-2xl w-full bg-zinc-900 rounded-lg p-6 glass-card border-white/5">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-black">Number Request</h3>
            <button id="numberRequestCloseBtn" class="text-gray-400 hover:text-gray-200">✕</button>
          </div>
          <div id="numberRequestDetail" class="text-sm text-gray-300">
            <p class="mb-2"><strong>Number:</strong> <span id="nr_number">—</span></p>
            <p class="mb-2"><strong>Country:</strong> <span id="nr_country">—</span></p>
            <p class="mb-2"><strong>Server:</strong> <span id="nr_server">—</span></p>
            <p class="mb-2"><strong>Platform:</strong> <span id="nr_platform">—</span></p>
            <p class="mb-2"><strong>User:</strong> <span id="nr_user">—</span></p>
            <p class="mb-2"><strong>Created:</strong> <span id="nr_created">—</span></p>
            <div class="mt-4 text-xs text-gray-400">You can monitor incoming SMS for this number in the main feed.</div>
            <div class="mt-4 flex gap-2">
              <button id="nr_showInFeed" class="px-3 py-1 rounded bg-primary text-black text-sm font-bold">Show in Feed</button>
              <button id="nr_copyNumber" class="px-3 py-1 rounded border border-white/10 text-sm">Copy Number</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderRange() {
    if (!this.rangeData.length) {
      return `<div class="p-12 text-center text-gray-500">
        <i class="fas fa-chart-bar text-4xl mb-3 block text-gray-700"></i>
        <p>No range data yet. Add countries & servers in Service section.</p>
      </div>`;
    }
    return `<div class="p-4 space-y-6">
      ${this.rangeData.map(country => `
        <div class="glass-card p-4">
          <!-- Country header -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              ${country.iconData
                ? `<img src="${country.iconData}" class="w-8 h-6 rounded object-cover">`
                : `<span class="text-2xl">${country.flag}</span>`}
              <div>
                <p class="font-black text-white text-sm">${country.countryName}</p>
                <p class="text-[10px] text-gray-500">${country.totalSuccess} total OTPs</p>
              </div>
            </div>
            <span class="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
              ${country.ranges.length} range${country.ranges.length !== 1 ? 's' : ''}
            </span>
          </div>
          <!-- Ranges table -->
          <div class="overflow-x-auto">
            <table class="w-full text-xs" style="border-collapse:collapse; min-width:600px;">
              <thead>
                <tr class="text-[10px] uppercase text-gray-500 border-b border-white/5">
                  <th class="py-2 px-3 text-left">Range / Server</th>
                  <th class="py-2 px-3 text-center">Available</th>
                  <th class="py-2 px-3 text-center">OTPs ✅</th>
                  <th class="py-2 px-3 text-center">Pending ⏳</th>
                  <th class="py-2 px-3 text-center">Failed ❌</th>
                  <th class="py-2 px-3 text-center">Rate</th>
                  <th class="py-2 px-3 text-left">Provider</th>
                </tr>
              </thead>
              <tbody>
                ${country.ranges.map((r, i) => `
                  <tr class="border-b border-white/5 hover:bg-white/[0.02] ${i === 0 ? 'bg-primary/5' : ''}">
                    <td class="py-2 px-3">
                      <p class="font-bold text-white">${r.serverName}</p>
                      ${i === 0 ? '<span class="text-[9px] text-primary font-black uppercase bg-primary/10 px-1.5 py-0.5 rounded">Best</span>' : ''}
                    </td>
                    <td class="py-2 px-3 text-center">
                      <span class="${r.available > 0 ? 'text-green-400' : 'text-red-400'} font-bold">${r.available}</span>
                    </td>
                    <td class="py-2 px-3 text-center text-green-400 font-bold">${r.success}</td>
                    <td class="py-2 px-3 text-center text-yellow-400">${r.pending}</td>
                    <td class="py-2 px-3 text-center text-red-400">${r.failed}</td>
                    <td class="py-2 px-3 text-center">
                      <div class="flex items-center gap-1 justify-center">
                        <div class="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div class="h-full rounded-full ${r.rate >= 70 ? 'bg-green-400' : r.rate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}"
                            style="width:${r.rate}%"></div>
                        </div>
                        <span class="font-bold ${r.rate >= 70 ? 'text-green-400' : r.rate >= 40 ? 'text-yellow-400' : 'text-gray-500'}">${r.rate}%</span>
                      </div>
                    </td>
                    <td class="py-2 px-3 text-gray-400 text-[10px]">${r.providerName || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  _renderRangeLive() {
    if (!this.rangeLiveRows.length) {
      return `<div class="p-12 text-center text-gray-500">
        <i class="fas fa-broadcast-tower text-4xl mb-3 block text-gray-700"></i>
        <p>No SMS data yet. Waiting for incoming messages...</p>
      </div>`;
    }
    return `<table class="w-full text-left" style="border-collapse:collapse; min-width:900px;">
      <thead style="background:rgba(10,30,59,0.9);">
        <tr>
          <th class="px-3 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">#</th>
          <th class="px-3 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Country</th>
          <th class="px-3 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Platform</th>
          <th class="px-3 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Range</th>
          <th class="px-3 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">Number</th>
          <th class="px-3 py-3 text-[10px] font-black uppercase text-primary tracking-widest border-b border-white/5">SMS / OTP</th>
        </tr>
      </thead>
      <tbody>
        ${this.rangeLiveRows.map(r => `
          <tr class="border-b border-white/[0.04] hover:bg-white/[0.02]">
            <td class="px-3 py-2 text-gray-600 text-xs">${r.no}</td>
            <td class="px-3 py-2 text-xs text-gray-300">${r.country}</td>
            <td class="px-3 py-2 text-xs text-gray-400">${r.platform}</td>
            <td class="px-3 py-2 text-xs text-cyan-300 font-mono">${r.server}</td>
            <td class="px-3 py-2 font-mono text-xs text-primary">${r.phone}</td>
            <td class="px-3 py-2 text-xs">
              ${r.otp ? `<span class="font-mono font-black text-white bg-primary/10 border border-primary/25 px-2 py-0.5 rounded mr-2">${r.otp}</span>` : ''}
              <span class="text-gray-400">${(r.sms || '').slice(0, 80)}</span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  }

  _renderApiRangeLive() {
    if (this.apiRangeLoading) {
      return `<div class="p-12 text-center text-gray-500">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-3 block text-primary"></i>
        <p>Fetching live data from API providers...</p>
      </div>`;
    }
    if (!this.apiRangeData.length) {
      return `<div class="p-12 text-center text-gray-500">
        <i class="fas fa-plug text-4xl mb-3 block text-gray-700"></i>
        <p class="font-semibold">No integrated API providers configured.</p>
        <p class="text-xs mt-1">Add an integrated provider in the Provider section.</p>
      </div>`;
    }

    return `<div class="p-4 space-y-6">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs text-gray-500">Fetched: <span class="text-primary font-mono">${this._apiRangeFetchedAt || '—'}</span></p>
        <button type="button" id="apiRangeRefreshBtn"
          class="px-3 py-1.5 text-[10px] font-bold uppercase text-primary hover:text-white border border-primary/30 rounded hover:bg-primary/10 transition flex items-center gap-1.5">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
      </div>

      ${this.apiRangeData.map(prov => `
        <div class="glass-card p-4 border-white/5">
          <!-- Provider header -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <i class="fas fa-server text-primary"></i>
              </div>
              <div>
                <p class="font-black text-white">${prov.providerName}</p>
                <p class="text-[10px] text-gray-500">${prov.countryName} · ${prov.baseUrl}</p>
              </div>
            </div>
            <div class="flex gap-4 text-center">
              <div>
                <p class="text-lg font-black text-primary">${prov.totalNumbers}</p>
                <p class="text-[9px] text-gray-500 uppercase">Numbers</p>
              </div>
              <div>
                <p class="text-lg font-black text-green-400">${prov.totalOtps}</p>
                <p class="text-[9px] text-gray-500 uppercase">OTPs</p>
              </div>
              <div>
                <p class="text-lg font-black text-cyan-400">${prov.ranges.length}</p>
                <p class="text-[9px] text-gray-500 uppercase">Ranges</p>
              </div>
            </div>
          </div>

          <!-- CLI Ranges table -->
          ${prov.ranges.length ? `
          <div class="mb-4">
            <p class="text-[10px] font-black uppercase text-gray-500 mb-2 tracking-widest">CLI Ranges</p>
            <div class="overflow-x-auto">
              <table class="w-full text-xs" style="border-collapse:collapse; min-width:500px;">
                <thead>
                  <tr class="text-[10px] uppercase text-gray-500 border-b border-white/5">
                    <th class="py-2 px-3 text-left">Range / CLI</th>
                    <th class="py-2 px-3 text-center">Numbers</th>
                    <th class="py-2 px-3 text-center">OTPs</th>
                    <th class="py-2 px-3 text-center">Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  ${prov.ranges.map((r, i) => `
                    <tr class="border-b border-white/5 hover:bg-white/[0.02] ${i === 0 ? 'bg-primary/5' : ''}">
                      <td class="py-2 px-3">
                        <span class="font-mono font-bold text-white">${r.name}</span>
                        ${i === 0 ? '<span class="ml-2 text-[9px] text-primary font-black uppercase bg-primary/10 px-1.5 py-0.5 rounded">Best</span>' : ''}
                      </td>
                      <td class="py-2 px-3 text-center text-cyan-300 font-bold">${r.count}</td>
                      <td class="py-2 px-3 text-center text-green-400 font-bold">${r.otpCount}</td>
                      <td class="py-2 px-3 text-center">
                        ${r.successRate != null
                          ? `<span class="font-bold ${r.successRate >= 70 ? 'text-green-400' : r.successRate >= 40 ? 'text-yellow-400' : 'text-red-400'}">${r.successRate}%</span>`
                          : '<span class="text-gray-600">—</span>'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}

          <!-- Recent OTPs -->
          ${prov.recentOtps?.length ? `
          <div class="mb-4">
            <p class="text-[10px] font-black uppercase text-gray-500 mb-2 tracking-widest">Recent OTPs (last 1h)</p>
            <div class="overflow-x-auto">
              <table class="w-full text-xs" style="border-collapse:collapse; min-width:600px;">
                <thead>
                  <tr class="text-[10px] uppercase text-gray-500 border-b border-white/5">
                    <th class="py-2 px-3 text-left">Number</th>
                    <th class="py-2 px-3 text-left">CLI</th>
                    <th class="py-2 px-3 text-left">OTP</th>
                    <th class="py-2 px-3 text-left">Message</th>
                    <th class="py-2 px-3 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${prov.recentOtps.map(m => {
                    const t = m.receivedAt ? new Date(m.receivedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
                    return `<tr class="border-b border-white/5 hover:bg-white/[0.02]">
                      <td class="py-2 px-3 font-mono text-primary">+${m.number}</td>
                      <td class="py-2 px-3 text-cyan-300 font-mono text-[10px]">${m.cli}</td>
                      <td class="py-2 px-3">
                        ${m.otp ? `<span class="font-mono font-black text-white bg-primary/10 border border-primary/25 px-2 py-0.5 rounded">${m.otp}</span>` : '<span class="text-gray-600">—</span>'}
                      </td>
                      <td class="py-2 px-3 text-gray-400 max-w-xs truncate">${(m.content || '').slice(0, 80)}</td>
                      <td class="py-2 px-3 text-gray-600 font-mono whitespace-nowrap">${t}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}

          <!-- Assigned Numbers sample -->
          ${prov.numbers?.length ? `
          <div>
            <p class="text-[10px] font-black uppercase text-gray-500 mb-2 tracking-widest">
              Assigned Numbers (showing ${prov.numbers.length} of ${prov.totalNumbers})
            </p>
            <div class="flex flex-wrap gap-2">
              ${prov.numbers.slice(0, 30).map(n => `
                <span class="font-mono text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300">
                  +${n.number}
                  ${n.cli && n.cli !== '—' ? `<span class="text-primary ml-1">${n.cli}</span>` : ''}
                </span>
              `).join('')}
              ${prov.numbers.length > 30 ? `<span class="text-[10px] text-gray-600 self-center">+${prov.numbers.length - 30} more</span>` : ''}
            </div>
          </div>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  _renderNumberRequests() {    if (!this.numberRequests.length) {
      return `<tr><td colspan="6" class="px-4 py-20 text-center">
        <div class="flex flex-col items-center gap-3">
          <i class="fas fa-bell text-5xl text-gray-700"></i>
          <p class="text-gray-500 text-sm font-semibold">No number requests yet</p>
          <p class="text-gray-600 text-xs">Requests will appear here when users take numbers</p>
        </div>
      </td></tr>`;
    }
    return this.numberRequests.map(r => {
      const time = r.createdAt
        ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';
      const statusBadge = r.status === 'successful'
        ? `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-green-500/15 text-green-400 border border-green-500/25">✓ SMS Received</span>`
        : r.status === 'failed'
          ? `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/15 text-red-400 border border-red-500/25">✗ Failed</span>`
          : `<span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/15 text-blue-400 border border-blue-500/25 animate-pulse">⏳ Pending</span>`;
      return `
        <tr class="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer" data-id="${r.numberId || r.id || ''}">
          <td class="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">${r.countryName || '—'}</td>
          <td class="px-4 py-3 font-mono text-xs text-primary whitespace-nowrap">${r.phoneNumber || '—'}</td>
          <td class="px-4 py-3 text-xs text-gray-500">—</td>
          <td class="px-4 py-3 text-xs text-gray-400">${r.serverId || r.serverName || '—'} · User: ${(r.userId || '').slice(0, 16)}...</td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3 text-xs text-gray-600 font-mono whitespace-nowrap">${time}</td>
        </tr>`;
    }).join('');
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'sms-feed',
      title: 'SMS Feed',
      subtitle: 'Real-time SMS from all provider APIs',
      bodyHtml: this._renderBody(),
      admin: this.admin
    });
    this._attachListeners();
  }

  _attachListeners() {
    // Filter tabs
    document.querySelectorAll('.sms-feed-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.filter = btn.dataset.tab;
        // Refresh range data on tab click
        if (this.filter === 'range') {
          try {
            const ra = await fetch('/api/admin/range-analytics').then(r => r.json()).catch(() => ({}));
            if (ra.success) this.rangeData = ra.rangeData || [];
          } catch {}
        }
        if (this.filter === 'range_live') {
          try {
            const rl = await fetch('/api/admin/range-live').then(r => r.json()).catch(() => ({}));
            if (rl.success) this.rangeLiveRows = rl.rows || [];
          } catch {}
        }
        if (this.filter === 'api_range_live') {
          await this._loadApiRangeLive();
        }
        this.render();
      });
    });

    // Clear button
    document.getElementById('smsFeedClearBtn')?.addEventListener('click', () => {
      this.messages = [];
      this.render();
    });

    // Click on a feed row to open details (works for number request rows too)
    document.getElementById('smsFeedTbody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const id = tr.getAttribute('data-id');
      if (!id) return;
      
      // For number requests, find by numberId or id
      const nr = this.numberRequests.find(r => (r.numberId === id || r.id === id));
      if (nr) {
        this._openNumberRequestModal(nr);
        return;
      }
      
      // For SMS rows, you could add SMS modal here if needed
    });

    // Modal close
    document.getElementById('numberRequestCloseBtn')?.addEventListener('click', () => {
      document.getElementById('numberRequestModal')?.classList.add('hidden');
      // Restore body scrolling
      document.body.style.overflow = '';

    });

    // Also close on backdrop click
    document.getElementById('numberRequestModal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('numberRequestModal')) {
        document.getElementById('numberRequestModal')?.classList.add('hidden');
        // Restore scrolling
        document.body.style.overflow = '';
      }

    });

    // Show in Feed button
    document.getElementById('nr_showInFeed')?.addEventListener('click', () => {
      const nr = this.currentNr;
      if (!nr) return;
      this._focusOnRequest(nr.numberId || nr.id);
      document.getElementById('numberRequestModal')?.classList.add('hidden');
    });

    // Copy number button
    document.getElementById('nr_copyNumber')?.addEventListener('click', () => {
      const txt = document.getElementById('nr_number')?.textContent || '';
      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt);
        } else {
          const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
      } catch (e) {}
    });
    // API Range Live refresh button
    document.getElementById('apiRangeRefreshBtn')?.addEventListener('click', async () => {
      await this._loadApiRangeLive();
      this.render();
    });
  }

  async _loadApiRangeLive() {
    this.apiRangeLoading = true;
    this.render();
    try {
      const res = await fetch('/api/admin/api-range-live').then(r => r.json()).catch(() => ({}));
      if (res.success) {
        this.apiRangeData = res.providers || [];
        this._apiRangeFetchedAt = res.fetchedAt
          ? new Date(res.fetchedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})
          : new Date().toLocaleTimeString();
      }
    } catch (_) {}
    this.apiRangeLoading = false;
  }
    try {
      document.getElementById('nr_number').textContent = nr.phoneNumber || '—';
      document.getElementById('nr_country').textContent = nr.countryName || '—';
      document.getElementById('nr_server').textContent = nr.serverId || nr.serverName || '—';
      document.getElementById('nr_platform').textContent = nr.platformId || '—';
      document.getElementById('nr_user').textContent = nr.userId || '—';
      document.getElementById('nr_created').textContent = nr.createdAt ? new Date(nr.createdAt).toLocaleString() : '—';
      this.currentNr = nr;
      const modal = document.getElementById('numberRequestModal');
      if (modal) {
        modal.classList.remove('hidden');
        // Ensure modal appears above other layers
        modal.style.zIndex = '100';
        // Prevent background scroll
        document.body.style.overflow = 'hidden';
      }

    } catch (e) {
      // ignore
    }
  }

  _focusOnRequest(id) {
    try {
      this.filter = 'number_requests';
      this.render();
      // small delay to allow DOM to render
      setTimeout(() => {
        const tbody = document.getElementById('smsFeedTbody');
        if (!tbody) return;
        const row = tbody.querySelector(`tr[data-id="${id}"]`);
        if (row) {
          row.classList.add('bg-primary/20','animate-pulse');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => row.classList.remove('bg-primary/20','animate-pulse'), 4000);
        }
      }, 50);
    } catch (e) {
      // ignore
    }
  }

  // ─── Live message injection ───────────────────────────────────────────────

  _addMessage(msg) {
    // Deduplicate by id
    if (this.messages.some(m => m.id === msg.id)) return;

    this.messages.unshift(msg);
    if (this.messages.length > 500) this.messages.pop();

    const tbody = document.getElementById('smsFeedTbody');
    if (!tbody) return;

    // Remove placeholder row if present
    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';

    const tr = document.createElement('tr');
    tr.className = 'border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors animate-fade-in';
    tr.setAttribute('data-id', msg.id || '');
    // Strip outer <tr> tags from _renderRow output
    const rowHtml = this._renderRow(msg);
    const inner = rowHtml.replace(/^[\s\S]*?<tr[^>]*>/, '').replace(/<\/tr>[\s\S]*$/, '');
    tr.innerHTML = inner;
    tbody.prepend(tr);

    this._updateStats();
    this._updateTabCounts();
  }

  _updateStats() {
    const el = document.getElementById('smsFeedStats');
    if (!el) return;
    el.innerHTML = `
      <span>Total: <strong class="text-white">${this.messages.length}</strong></span>
      <span>Matched: <strong class="text-green-400">${this.messages.filter(m => m.matched === true).length}</strong></span>
      <span>Unmatched: <strong class="text-gray-400">${this.messages.filter(m => m.matched === false).length}</strong></span>
      <span class="ml-auto text-gray-600">Showing last 500 messages · Auto-updates live</span>`;
  }

  _updateTabCounts() {
    const tabs = this._tabs();
    tabs.forEach(t => {
      const btn = document.querySelector(`.sms-feed-tab[data-tab="${t.id}"]`);
      if (btn) {
        const badge = btn.querySelector('span');
        if (badge) badge.textContent = t.count;
      }
    });
    // Update header count
    const headerCount = document.querySelector('.admin-content .text-gray-500');
    if (headerCount && headerCount.textContent.includes('total message')) {
      headerCount.textContent = `${this.messages.length} total message${this.messages.length !== 1 ? 's' : ''}`;
    }
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────

  setupWebSocket() {
    try {
      if (this.ws) { try { this.ws.close(); } catch {} }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect to backend WebSocket server on the known backend port (default 3000) regardless of dev server port
      const host = window.location.hostname;
      const port = 3000; // backend server port for WebSocket
      this.ws = new WebSocket(`${protocol}//${host}:${port}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.ws.send(JSON.stringify({ type: 'subscribe_sms_feed' }));
        this.ws.send(JSON.stringify({ type: 'subscribe_admin_updates' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // New SMS from provider — show in feed (unmatched by default)
          if (data.type === 'new_sms' && data.message) {
            // Check if same phone number already exists — update it instead of adding duplicate
            const existingIdx = this.messages.findIndex(
              m => m.phoneNumber === data.message.phoneNumber || 
                   m.phoneNumber === `+${data.message.phoneNumber}` ||
                   String(m.phoneNumber).replace(/\D/g,'') === String(data.message.phoneNumber).replace(/\D/g,'')
            );
            if (existingIdx !== -1) {
              // Update existing entry with new OTP/SMS content
              const updated = {
                ...this.messages[existingIdx],
                ...data.message,
                otp: data.message.otp || data.message.otpCode || this.messages[existingIdx].otp,
                otpCode: data.message.otp || data.message.otpCode || this.messages[existingIdx].otpCode,
                content: data.message.content || data.message.message || this.messages[existingIdx].content,
                message: data.message.content || data.message.message || this.messages[existingIdx].message,
                receivedAt: data.message.receivedAt || data.message.createdAt || new Date().toISOString(),
                matched: data.message.matched !== undefined ? data.message.matched : this.messages[existingIdx].matched
              };
              this.messages[existingIdx] = updated;
              // Move to top
              this.messages.splice(existingIdx, 1);
              this.messages.unshift(updated);
              // Update DOM row
              const tbody = document.getElementById('smsFeedTbody');
              if (tbody) {
                const row = tbody.querySelector(`tr[data-id="${updated.id}"]`);
                if (row) {
                  row.innerHTML = this._renderRow(updated).replace(/^[\s\S]*?<tr[^>]*>/, '').replace(/<\/tr>[\s\S]*$/, '');
                  tbody.prepend(row);
                } else {
                  // Row not in DOM yet, add it
                  this._addMessage(updated);
                }
              }
              this._updateStats();
              this._updateTabCounts();
            } else {
              this._addMessage({
                ...data.message,
                matched: data.message.matched !== undefined ? data.message.matched : false,
                receivedAt: data.message.receivedAt || data.message.createdAt || new Date().toISOString()
              });
            }
          }

          // Number expired — mark request as failed
          if (data.type === 'number_expired') {
            const nr = this.numberRequests.find(r => r.numberId === data.numberId);
            if (nr) {
              nr.status = 'failed';
              if (this.filter === 'number_requests') {
                const tbody = document.getElementById('smsFeedTbody');
                if (tbody) tbody.innerHTML = this._renderNumberRequests();
              }
              this._updateTabCounts();
            }
          }

          // New number request (API or UI generated)
          if (data.type === 'number_request' && data.phoneNumber) {
            // Keep recent 50
            this.numberRequests.unshift({
              numberId: data.numberId,
              phoneNumber: data.phoneNumber,
              userId: data.userId || null,
              providerId: data.providerId || null,
              providerSessionId: data.providerSessionId || null,
              platformId: data.platformId || null,
              serverId: data.serverId || null,
              countryName: data.countryName || null,
              createdAt: data.createdAt || new Date().toISOString()
            });
            if (this.numberRequests.length > 50) this.numberRequests.pop();

            // Update badge and dropdown if present
            const badge = document.getElementById('numberRequestsBadge');
            if (badge) badge.textContent = String(this.numberRequests.length);
            const list = document.getElementById('numberRequestsList');
            if (list) {
              // Re-render simple list HTML
              list.innerHTML = this.numberRequests.length ? this.numberRequests.map(r => `
                <div class="py-2 border-b border-white/5 text-xs">
                  <div class="font-mono text-sm text-primary">${r.phoneNumber}</div>
                  <div class="text-gray-400 text-[11px]">${r.countryName || '—'} · ${r.serverId || ''} · ${r.platformId || ''}</div>
                  <div class="text-gray-500 text-[11px]">Requested: ${new Date(r.createdAt).toLocaleTimeString()}</div>
                </div>
              `).join('') : `<div class="text-gray-500 text-xs p-3">No recent requests</div>`;
            }
          }

          // Feed row update — mark as matched when user number gets SMS
          if (data.type === 'sms_feed_update') {
            const existing = this.messages.find(
              m => (data.sourceId && m.id === data.sourceId) ||
                   (m.phoneNumber === data.phoneNumber && m.matched !== true)
            );
            if (existing) {
              existing.matched = true;
              existing.otp = data.otp || existing.otp;
              existing.otpCode = data.otp || existing.otpCode;
              existing.country = data.country || existing.country;
              // Update DOM row
              const tbody = document.getElementById('smsFeedTbody');
              if (tbody) {
                const row = tbody.querySelector(`tr[data-id="${existing.id}"]`);
                if (row) {
                  row.innerHTML = this._renderRow(existing).replace(/<tr[^>]*>/, '').replace('</tr>', '');
                  row.setAttribute('data-id', existing.id);
                }
              }
              this._updateStats();
              this._updateTabCounts();
            }
          }

          // otp_success — also update feed row
          if (data.type === 'otp_success' && data.otp) {
            // Update number request status
            const nr = this.numberRequests.find(r => r.numberId === data.numberId || r.phoneNumber === data.phoneNumber);
            if (nr) {
              nr.status = 'successful';
              nr.otp = data.otp;
              if (this.filter === 'number_requests') {
                const tbody = document.getElementById('smsFeedTbody');
                if (tbody) tbody.innerHTML = this._renderNumberRequests();
              }
              this._updateTabCounts();
            }
            // Also update SMS feed row
            const existing = this.messages.find(
              m => (data.sourceId && m.id === data.sourceId) ||
                   (m.phoneNumber === data.phoneNumber && m.matched !== true)
            );
            if (existing) {
              existing.matched = true;
              existing.otp = data.otp;
              existing.otpCode = data.otp;
              existing.country = data.country || existing.country;
              const tbody = document.getElementById('smsFeedTbody');
              if (tbody) {
                const row = tbody.querySelector(`tr[data-id="${existing.id}"]`);
                if (row) {
                  row.innerHTML = this._renderRow(existing).replace(/<tr[^>]*>/, '').replace('</tr>', '');
                  row.setAttribute('data-id', existing.id);
                }
              }
              this._updateStats();
              this._updateTabCounts();
            }
          }

        } catch (e) {
          console.warn('SMS Feed WS parse error:', e.message);
        }
      };

      this.ws.onclose = () => {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(
            this.reconnectDelay * Math.pow(this.reconnectMultiplier, this.reconnectAttempts - 1),
            30000
          );
          setTimeout(() => this.setupWebSocket(), delay);
        }
      };
    } catch {}
  }

  destroy() {
    if (this.ws) { try { this.ws.close(); } catch {} }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;

    // Render shell immediately — data loads in background
    this.render();

    // Load recent SMS directly from provider API via live-feed endpoint
    try {
      const res = await fetch('/api/sms/live-feed');
      const data = await res.json().catch(() => ({}));
      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        this.messages = data.messages;
      }
    } catch (e) {}

    // Load recent number requests for initial badge/list
    try {
      const nr = await fetch('/api/admin/number-requests').then(r => r.json()).catch(() => ({}));
      if (nr.success && Array.isArray(nr.requests)) {
        this.numberRequests = nr.requests;
      }
    } catch (e) {}

    // Load range analytics
    try {
      const ra = await fetch('/api/admin/range-analytics').then(r => r.json()).catch(() => ({}));
      if (ra.success) this.rangeData = ra.rangeData || [];
    } catch (e) {}

    // Load range live
    try {
      const rl = await fetch('/api/admin/range-live').then(r => r.json()).catch(() => ({}));
      if (rl.success) this.rangeLiveRows = rl.rows || [];
    } catch (e) {}

    this.render();
    this.setupWebSocket();
  }
}
