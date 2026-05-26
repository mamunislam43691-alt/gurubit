/**
 * Number selection page — clean layout with newest-first table
 */

import { UserLayout } from '../utils/UserLayout.js';
import { AgentLayout } from '../utils/AgentLayout.js';
import {
  countryFlag,
  formatPhoneForCopy,
  copyText,
  bindCopyCells,
  countdownText,
  numberStatus,
  detectServiceLabel,
  extractOtpFromSms,
  showToast
} from '../utils/uiHelpers.js';

export class NumberSelection {
  constructor() {
    this.countries = [];
    this.servers = [];
    this.numbers = [];
    this.selectedCountry = null;
    this.selectedServer = null;
    this.numberFormat = 'natural';
    this.isGenerating = false;
    this.user = null;
    this.filterStatus = 'all';
    this.countryMap = {};
    this.tickTimer = null;
    this.highlightId = null;
    this.topSelection = null;
    this.loadingPromises = {};
    this._wsUnsubs = []; // GWS unsubscribe functions
  }

  sortNumbers() {
    this.numbers.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }

  countryOptionLabel(c) {
    const code = (c.code || '').trim();
    const codePart = code ? ` (${code.startsWith('+') ? code : `+${code.replace(/^\+/, '')}`})` : '';
    return `${c.flag || '🌍'} ${c.name}${codePart}`;
  }

  async loadCountries() {
    const data = await fetch('/api/countries').then((r) => r.json());
    if (data.success) {
      this.countries = data.countries;
      this.countries.forEach((c) => { this.countryMap[c.id] = c; });
      this.topSelection = data.topSelection;
    }
  }

  async loadNumbers() {
    const data = await fetch('/api/user/numbers').then((r) => r.json());
    if (data.success) {
      this.numbers = data.numbers || [];
      // Don't load SMS here - only on WebSocket updates to prevent flickering
      // SMS status comes from the server, not from parallel requests
      this.sortNumbers();
    }
  }

  async loadServers(countryId) {
    const data = await fetch(`/api/countries/${countryId}/servers`).then((r) => r.json());
    if (data.success) {
      this.servers = data.servers;
      // Preserve previously selected server if it still exists in the new list
      if (this.selectedServer) {
        const stillExists = this.servers.find((s) => s.id === this.selectedServer.id);
        if (stillExists) {
          this.selectedServer = stillExists;
        } else if (this.servers[0]) {
          this.selectedServer = this.servers[0];
        } else {
          this.selectedServer = null;
        }
      } else if (this.servers[0]) {
        this.selectedServer = this.servers[0];
      }
    }
  }

  countryLabel(n) {
    const flag = countryFlag(n.countryId, this.countryMap);
    const name = n.countryName || this.countryMap[n.countryId]?.name || n.countryId || '—';
    return `<span class="country-cell">${flag} <span>${name}</span></span>`;
  }

  async handleCountryChange(countryId) {
    this.selectedCountry = this.countries.find((c) => c.id === countryId) || null;
    this.servers = [];
    this.selectedServer = null;
    if (countryId) await this.loadServers(countryId);
    this.render();
  }

  async handleServerChange(serverId) {
    this.selectedServer = this.servers.find((s) => s.id === serverId) || null;
    this.render();
  }

  updateWsStatus(connected) {
    const dot = document.getElementById('wsStatusDot');
    const txt = document.getElementById('wsStatusText');
    if (!dot || !txt) return;
    if (connected) {
      dot.className = 'ws-dot ws-dot--on';
      txt.textContent = 'Live';
    } else {
      dot.className = 'ws-dot ws-dot--off';
      txt.textContent = 'Reconnecting...';
    }
  }

  setupWs() {
    // Unsubscribe previous listeners
    this._wsUnsubs.forEach(fn => fn());
    this._wsUnsubs = [];

    // Use global WS — connect once for the whole app
    window.GWS.connect(this.user.id);

    // Status indicators
    this.updateWsStatus(window.GWS.isConnected());
    this._wsUnsubs.push(window.GWS.on('ws_connected', () => this.updateWsStatus(true)));
    this._wsUnsubs.push(window.GWS.on('ws_disconnected', () => this.updateWsStatus(false)));

    // Number expired
    this._wsUnsubs.push(window.GWS.on('number_expired', (data) => {
      const idx = this.numbers.findIndex((x) => x.id === data.numberId);
      if (idx > -1) {
        this.numbers[idx] = { ...this.numbers[idx], status: 'failed', otpReceived: false };
        this.render();
      }
    }));

    // OTP / SMS received
    const onSms = (data) => {
      const numberId = data.numberId || data.id || data.message?.numberId || data.message?.id;
      const smsMessage = data.smsMessage || data.message?.smsMessage || data.message?.content || data.content;
      const otp = data.otp || data.otpCode || data.message?.otp || data.message?.otpCode;
      if (!otp && !smsMessage) return;
      if (numberId) {
        const idx = this.numbers.findIndex((x) => x.id === numberId);
        if (idx > -1) {
          this.numbers.splice(idx, 1, {
            ...this.numbers[idx],
            otpReceived: true,
            otp: otp || this.numbers[idx].otp,
            smsMessage: smsMessage || this.numbers[idx].smsMessage,
            status: 'successful'
          });
          this.highlightId = numberId;
          this.render();
          showToast(`📬 OTP received: ${otp || 'SMS received'}`);
          return;
        }
      }
      this.loadNumbers().then(() => { this.render(); showToast('SMS received'); });
    };
    this._wsUnsubs.push(window.GWS.on('otp_success', onSms));
    this._wsUnsubs.push(window.GWS.on('sms_success', onSms));
    this._wsUnsubs.push(window.GWS.on('new_sms', onSms));
  }

  startTick() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      let needsRender = false;
      document.querySelectorAll('[data-countdown], .sms-timer[data-countdown]').forEach((el) => {
        const exp = el.getAttribute('data-expires');
        if (!exp) return;
        if (el.getAttribute('data-status') !== 'pending') return;
        el.textContent = countdownText(exp);
        if (new Date(exp) < new Date()) {
          needsRender = true;
        }
      });
      if (needsRender) {
        this.render();
      }
    }, 1000);
  }

  async generateNumber() {
    if (!this.selectedCountry || !this.selectedServer) {
      showToast('Please select a country and range.', 'error');
      return;
    }
    this.isGenerating = true;
    this.render();
    try {
      const res = await fetch('/api/numbers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryId: this.selectedCountry.id,
          serverId: this.selectedServer.id,
          format: this.numberFormat === 'remove_plus' ? 'remove_plus' : 'natural'
        })
      });
      const data = await res.json();
      if (data.success) {
        const num = data.number;
        this.highlightId = num.id;
        // Preserve current country/server selection — only reload servers list, don't reset selection
        if (this.selectedCountry?.id) {
          const prevServerId = this.selectedServer?.id;
          await this.loadServers(this.selectedCountry.id);
          // Restore server selection after reload
          if (prevServerId) {
            const found = this.servers.find((s) => s.id === prevServerId);
            if (found) this.selectedServer = found;
          }
        }
        await this.loadNumbers();
        if (num && !this.numbers.find((x) => x.id === num.id)) {
          this.numbers.unshift(num);
        }
        this.sortNumbers();
        const copyVal = formatPhoneForCopy(
          num.phoneNumber,
          num.format || this.numberFormat,
          this.selectedCountry?.code
        );
        await copyText(copyVal, 'Number generated and copied! 📋');
        // Don't recreate WS — it's already running from init()
        this.render();
      } else {
        showToast('Number not available, please wait. Select another country or range and try.', 'error');
      }
    } catch {
      showToast('Request failed. Select another country or range and try again.', 'error');
    } finally {
      this.isGenerating = false;
      this.render();
    }
  }

  formatRelative(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    return new Date(iso).toLocaleString();
  }

  filteredNumbers() {
    const list = this.filterStatus === 'all'
      ? this.numbers
      : this.numbers.filter((n) => numberStatus(n) === this.filterStatus);
    return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  renderOtpCell(n) {
    const otp = extractOtpFromSms(n);
    if (otp) {
      return `<button type="button" class="copy-line copy-line--otp font-mono font-black text-base" data-copy="${otp}" data-copy-msg="OTP copied!" style="letter-spacing:2px">${otp}</button>`;
    }
    return '<span class="text-gray-500 text-xs">—</span>';
  }

  renderSmsCell(n) {
    const st = numberStatus(n);
    if (st === 'successful') {
      const message = n.smsMessage || '';
      const platform = detectServiceLabel(message) || 'Verification';
      const meta = appIconMeta(platform);
      return `
        <div class="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 max-w-xs shadow-lg shadow-emerald-500/5 animate-pulse-slow">
          <div class="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] shrink-0" style="background: ${meta.bg}">
            <i class="${meta.icon}"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[9px] font-bold text-emerald-400 uppercase tracking-widest leading-none mb-0.5">${platform}</p>
            <p class="text-[11px] text-gray-300 truncate leading-tight font-medium">${this.esc(message)}</p>
          </div>
        </div>`;
    }
    if (st === 'failed') {
      return '<span class="text-red-400 text-xs">—</span>';
    }
    // Pending: show countdown
    const cd = countdownText(n.expiresAt);
    return `<span class="text-orange-400 font-bold font-mono text-xs" data-countdown data-expires="${n.expiresAt || ''}" data-status="pending">${cd}</span>`;
  }

  renderStatusCell(n) {
    const st = numberStatus(n);
    if (st === 'successful') {
      return '<span class="text-green-400 font-bold uppercase text-xs">Success</span>';
    }
    if (st === 'failed') {
      return '<span class="text-red-400 font-bold uppercase text-xs">Failed</span>';
    }
    return '<span class="text-orange-400 font-bold uppercase text-xs">Pending</span>';
  }

  renderTable() {
    const rows = this.filteredNumbers();
    const renderDesktopTable = () => `
      <div class="overflow-x-auto">
        <table class="number-history-table w-full text-left text-sm">
          <thead>
            <tr>
              <th>Country</th>
              <th>Range</th>
              <th>Phone Number</th>
              <th>Status</th>
              <th>OTP</th>
              <th>SMS</th>
              <th>DateTime</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((n) => {
              const hl = n.id === this.highlightId ? 'number-row--new' : '';
              const phoneCopy = formatPhoneForCopy(
                n.phoneNumber,
                n.format || this.numberFormat,
                this.countryMap[n.countryId]?.code
              );
              return `<tr class="${hl}">
                <td>${this.countryLabel(n)}</td>
                <td class="server-col">${n.serverName || '—'}</td>
                <td>
                  <button type="button" class="copy-line copy-line--phone" data-copy="${phoneCopy}" data-number-id="${n.id}" data-copy-msg="Number copied!">${n.phoneNumber || '—'}</button>
                </td>
                <td>${this.renderStatusCell(n)}</td>
                <td>${this.renderOtpCell(n)}</td>
                <td style="max-width:280px;word-break:break-word;white-space:normal">${this.renderSmsCell(n)}</td>
                <td class="text-gray-500 text-xs">${this.formatRelative(n.createdAt)}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="7" class="p-8 text-center text-gray-500">No numbers yet — click Get SMS Number</td></tr>'}
          </tbody>
        </table>
      </div>`;
    
    const renderMobileCards = () => `
      <div class="divide-y divide-white/5">
        ${rows.length ? rows.map((n) => {
          const hl = n.id === this.highlightId ? 'number-row--new' : '';
          const phoneCopy = formatPhoneForCopy(
            n.phoneNumber,
            n.format || this.numberFormat,
            this.countryMap[n.countryId]?.code
          );
          const st = numberStatus(n);
          const otp = this.renderOtpCell(n);
          const sms = this.renderSmsCell(n);
          return `<div class="px-3 py-3 ${hl}">
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <div class="flex items-center gap-1.5 min-w-0">
                ${this.countryLabel(n)}
                <span class="text-gray-600 text-[10px]">·</span>
                <span class="text-gray-400 text-[11px] truncate">${n.serverName || '—'}</span>
              </div>
              <div class="shrink-0">${this.renderStatusCell(n)}</div>
            </div>
            <button type="button" class="copy-line copy-line--phone block text-lg font-black text-primary mb-1.5" data-copy="${phoneCopy}" data-number-id="${n.id}" data-copy-msg="Number copied!">${n.phoneNumber || '—'}</button>
            ${st === 'successful' ? `
            <div class="flex items-center gap-3 flex-wrap">
              ${otp !== '<span class="text-gray-500 text-xs">—</span>' ? `<div class="flex items-center gap-1.5">${otp}</div>` : ''}
              <div class="text-xs">${sms}</div>
            </div>` : st === 'pending' ? `<div>${sms}</div>` : ''}
            <p class="text-[10px] text-gray-600 mt-1">${this.formatRelative(n.createdAt)}</p>
          </div>`;
        }).join('') : '<div class="p-8 text-center text-gray-500 text-sm">No numbers yet</div>'}
      </div>`;

    return `
      <div class="number-table-wrap glass-card overflow-hidden mt-4">
        <div class="flex gap-2 p-3 border-b border-white/5 overflow-x-auto scrollbar-none">
          ${['all', 'successful', 'failed', 'pending'].map((f) => `
            <button type="button" data-filter="${f}" class="number-filter-btn shrink-0 ${this.filterStatus === f ? 'is-active' : ''}">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
          `).join('')}
        </div>
        <div class="hidden md:block">
          ${renderDesktopTable()}
        </div>
        <div class="md:hidden">
          ${renderMobileCards()}
        </div>
        <p class="text-xs text-gray-500 p-3 border-t border-white/5">Showing ${rows.length} of ${this.numbers.length} · Tap to copy</p>
      </div>`;
  }

  renderBody() {
    const countryOpts = this.countries.map((c) =>
      `<option value="${c.id}" ${this.selectedCountry?.id === c.id ? 'selected' : ''}>${this.countryOptionLabel(c)}</option>`
    ).join('');
    const serverOpts = this.servers.map((s) => {
      // Show only the server name — no API/count info for users
      return `<option value="${s.id}" ${this.selectedServer?.id === s.id ? 'selected' : ''}>${s.name}</option>`;
    }).join('');

    const isApiConnection = false; // hide API connection notice from user panel

    return `
      <section class="agent-page-section">
        <h2 class="agent-section-title text-sm"><i class="fas fa-mobile-alt mr-2"></i>Number
          <span class="ws-status-badge ml-3" id="wsStatusBadge">
            <span class="ws-dot ws-dot--off" id="wsStatusDot"></span>
            <span class="text-xs text-gray-400" id="wsStatusText">Connecting...</span>
          </span>
        </h2>
        <div class="number-controls glass-card p-3 mb-3">
          <!-- Mobile layout: stacked compact -->
          <div class="grid grid-cols-2 gap-2 md:hidden mb-2">
            <div>
              <label class="stat-label block mb-1">Country</label>
              <select id="countrySelect" class="input-field w-full text-sm py-2.5 px-3"><option value="">Select...</option>${countryOpts}</select>
            </div>
            <div>
              <label class="stat-label block mb-1">Range</label>
              <select id="serverSelect" class="input-field w-full text-sm py-2.5 px-3" ${!this.servers.length ? 'disabled' : ''}>
                <option value="">Select...</option>${serverOpts}
              </select>
            </div>
          </div>
          <div class="flex items-center gap-2 md:hidden mb-2">
            <label class="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="radio" name="numFormat" value="natural" ${this.numberFormat === 'natural' ? 'checked' : ''}> +code
            </label>
            <label class="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="radio" name="numFormat" value="remove_plus" ${this.numberFormat === 'remove_plus' ? 'checked' : ''}> No +
            </label>
          </div>
          <button type="button" id="generateBtn" class="w-full md:hidden py-3 rounded-xl font-black text-sm uppercase bg-violet-600 hover:bg-violet-500 text-white ${this.isGenerating ? 'opacity-60' : ''}">
            ${this.isGenerating ? '<i class="fas fa-spinner fa-spin mr-1"></i> Getting...' : '<i class="fas fa-paper-plane mr-1"></i> Get SMS Number'}
          </button>
          <!-- Desktop layout: grid -->
          <div class="hidden md:grid md:grid-cols-12 gap-3 items-end">
            <div class="md:col-span-4">
              <label class="stat-label block mb-1">Country</label>
              <select id="countrySelectDesktop" class="input-field w-full"><option value="">Select...</option>${countryOpts}</select>
            </div>
            <div class="md:col-span-4">
              <label class="stat-label block mb-1">Range</label>
              <select id="serverSelectDesktop" class="input-field w-full" ${!this.servers.length ? 'disabled' : ''}>
                <option value="">Select range...</option>${serverOpts}
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="stat-label block mb-1">Format</label>
              <div class="flex flex-col gap-1 pt-1 text-sm">
                <label class="flex items-center gap-2"><input type="radio" name="numFormatD" value="natural" ${this.numberFormat === 'natural' ? 'checked' : ''}> National (+code)</label>
                <label class="flex items-center gap-2"><input type="radio" name="numFormatD" value="remove_plus" ${this.numberFormat === 'remove_plus' ? 'checked' : ''}> Remove Plus</label>
              </div>
            </div>
            <div class="md:col-span-2">
              <button type="button" id="generateBtnDesktop" class="w-full py-3 rounded-xl font-black text-sm uppercase bg-violet-600 hover:bg-violet-500 text-white ${this.isGenerating ? 'opacity-60' : ''}">
                ${this.isGenerating ? '...' : '<i class="fas fa-paper-plane mr-1"></i> Get SMS Number'}
              </button>
            </div>
          </div>
        </div>
        ${this.renderTable()}
      </section>`;
  }

  render() {
    const layout = this.user?.isAgent ? AgentLayout : UserLayout;
    layout.renderShell({ activeId: 'numbers', title: 'Number', bodyHtml: this.renderBody(), user: this.user });
    // Restore WS status after re-render
    const isConnected = this.ws && this.ws.readyState === WebSocket.OPEN;
    this.updateWsStatus(isConnected);
    document.getElementById('countrySelect')?.addEventListener('change', (e) => this.handleCountryChange(e.target.value));
    document.getElementById('serverSelect')?.addEventListener('change', (e) => this.handleServerChange(e.target.value));
    document.getElementById('countrySelectDesktop')?.addEventListener('change', (e) => this.handleCountryChange(e.target.value));
    document.getElementById('serverSelectDesktop')?.addEventListener('change', (e) => this.handleServerChange(e.target.value));
    document.querySelectorAll('input[name="numFormat"], input[name="numFormatD"]').forEach((el) => {
      el.addEventListener('change', () => { this.numberFormat = el.value; });
    });
    document.getElementById('generateBtn')?.addEventListener('click', () => this.generateNumber());
    document.getElementById('generateBtnDesktop')?.addEventListener('click', () => this.generateNumber());
    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { this.filterStatus = btn.dataset.filter; this.render(); });
    });
    bindCopyCells(document.getElementById('app'));
    this.startTick();
  }

  destroy() {
    this._wsUnsubs.forEach(fn => fn());
    this._wsUnsubs = [];
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    await this.loadCountries();
    await this.loadNumbers();

    // Auto-select top country and server from aggregated data
    if (this.countries.length > 0 && !this.selectedCountry) {
      const top = this.topSelection || {};
      const targetCountryId = top.countryId || this.countries[0]?.id;
      this.selectedCountry = this.countries.find((c) => c.id === targetCountryId) || this.countries[0];
      if (this.selectedCountry) {
        await this.loadServers(this.selectedCountry.id);
        const targetServerId = top.serverId;
        if (targetServerId && this.servers.find((s) => s.id === targetServerId)) {
          this.selectedServer = this.servers.find((s) => s.id === targetServerId);
        } else {
          this.selectedServer = this.servers[0] || null;
        }
      }
    }

    this.setupWs();
    this.render();
  }
}
