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
    const data = await window.optimizedFetch('/api/countries').catch(() => ({}));
    if (data && data.success) {
      this.countries = data.countries;
      this.countries.forEach((c) => { this.countryMap[c.id] = c; });
      this.topSelection = data.topSelection;
    }
  }

  async loadNumbers() {
    const data = await window.optimizedFetch('/api/user/numbers').catch(() => ({}));
    if (data && data.success) {
      this.numbers = data.numbers || [];
      // Don't load SMS here - only on WebSocket updates to prevent flickering
      // SMS status comes from the server, not from parallel requests
      this.sortNumbers();
    }
  }

  async loadServers(countryId) {
    const data = await window.optimizedFetch(`/api/countries/${countryId}/servers`).catch(() => ({}));
    if (data && data.success) {
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
      this._showNotification('⚠️ Please select a country and range first', 'warning');
      return;
    }
    this.isGenerating = true;
    this.render();
    // Show "please wait" notification while generating
    this._showNotification('⏳ Please wait, finding a number...', 'info');
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
        if (window.apiCache) window.apiCache.clear();
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
        // Copy silently — no toast popup
        try { await navigator.clipboard.writeText(copyVal); } catch (_) {}
        // Don't recreate WS — it's already running from init()
        this.render();
        this._showNotification('✅ Number generated & copied!', 'success');
      } else {
        const errMsg = data.error?.message || 'Failed to generate number';
        const isNoNumbers = errMsg.toLowerCase().includes('no number') || errMsg.toLowerCase().includes('not available') || errMsg.toLowerCase().includes('no range');
        if (isNoNumbers) {
          this._showNoNumbersNotification();
        } else {
          this._showNotification(`⚠️ ${errMsg}`, 'warning');
        }
      }
    } catch {
      this._showNotification('⚠️ Request failed. Please check your connection.', 'warning');
    } finally {
      this.isGenerating = false;
      this.render();
    }
  }

  _showNotification(msg, type = 'info') {
    // Remove existing
    document.getElementById('numNotification')?.remove();
    const colors = {
      success: 'linear-gradient(135deg,#00d2ff,#3a7bd5)',
      warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
      error: 'linear-gradient(135deg,#ef4444,#dc2626)',
      info: 'linear-gradient(135deg,#6366f1,#4f46e5)'
    };
    const t = document.createElement('div');
    t.id = 'numNotification';
    t.style.cssText = `position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-20px);background:${colors[type] || colors.info};color:#020b18;font-weight:800;font-size:.8rem;padding:.65rem 1.5rem;border-radius:9999px;opacity:0;pointer-events:none;transition:all .3s;z-index:9999;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4);`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }

  _showNoNumbersNotification() {
    // Remove existing
    document.getElementById('noNumModal')?.remove();
    const m = document.createElement('div');
    m.id = 'noNumModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);animation:fadeIn .2s ease;';
    m.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(10,30,59,0.98),rgba(5,22,45,0.98));border:1px solid rgba(245,158,11,.3);border-radius:1.5rem;padding:2rem;max-width:340px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,.6);">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(245,158,11,.15);border:2px solid rgba(245,158,11,.3);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;">
          <i class="fas fa-exclamation-triangle" style="color:#f59e0b;font-size:1.5rem;"></i>
        </div>
        <h3 style="color:#fff;font-weight:900;font-size:1rem;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.08em;">Number Not Available</h3>
        <p style="color:#94a3b8;font-size:.82rem;line-height:1.65;margin-bottom:.4rem;">No numbers are available in this range right now.</p>
        <p style="color:#64748b;font-size:.75rem;line-height:1.55;margin-bottom:1.5rem;">Please select a <strong style="color:#f59e0b;">different country or range</strong> and try again.</p>
        <button id="noNumClose" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#020b18;border:none;padding:.75rem 2rem;border-radius:.75rem;font-weight:900;cursor:pointer;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;width:100%;transition:opacity .2s;">Try Another Range</button>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#noNumClose')?.addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    // Auto-dismiss after 6s
    setTimeout(() => {
      if (m.parentNode) {
        m.style.opacity = '0';
        m.style.transition = 'opacity .3s';
        setTimeout(() => m.remove(), 300);
      }
    }, 6000);
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
      // Detect platform from SMS content (most reliable source)
      const platform = detectServiceLabel(message) || 'Verification';
      return `<span class="text-emerald-400 text-xs font-medium">${this.esc(platform)} <span class="text-gray-400 font-normal">Your verification code is</span> <span class="text-white font-black font-mono">****</span></span>`;
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
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-white/10">
              <th class="px-5 py-3 text-[10px] uppercase tracking-widest text-gray-500 font-bold">Number Info</th>
              <th class="px-5 py-3 text-[10px] uppercase tracking-widest text-gray-500 font-bold">Country / Operator</th>
              <th class="px-5 py-3 text-[10px] uppercase tracking-widest text-gray-500 font-bold">Activity</th>
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
              const st = numberStatus(n);
              const flag = countryFlag(n.countryId, this.countryMap);
              const countryName = n.countryName || this.countryMap[n.countryId]?.name || n.countryId || '—';
              const rangeName = n.serverName || '—';
              let statusBadge = '';
              if (st === 'successful') statusBadge = '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Delivered</span>';
              else if (st === 'failed') statusBadge = '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/15 text-red-400 border border-red-500/20">Failed</span>';
              else statusBadge = '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">Pending</span>';

              return `<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors ${hl}">
                <td class="px-5 py-4">
                  <div class="flex flex-col gap-1">
                    <button type="button" class="copy-line copy-line--phone text-sm font-bold text-white hover:text-primary transition-colors text-left font-mono tracking-wide" data-copy="${phoneCopy}" data-number-id="${n.id}" data-copy-msg="Number copied!">${n.phoneNumber || '—'}</button>
                    ${statusBadge}
                  </div>
                </td>
                <td class="px-5 py-4">
                  <div class="flex items-center gap-2">
                    <span class="text-base">${flag}</span>
                    <div class="flex flex-col">
                      <span class="text-white text-sm font-medium">${countryName}</span>
                      <span class="text-gray-500 text-[11px]"><i class="fas fa-signal text-[9px] mr-1"></i>${rangeName}</span>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-4">
                  <span class="text-gray-400 text-xs">${this.formatRelative(n.createdAt)}</span>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="3" class="px-5 py-16 text-center text-gray-500">
              <div class="flex flex-col items-center gap-3">
                <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-gray-600 text-2xl"><i class="fas fa-inbox"></i></div>
                <p class="text-sm font-medium">No numbers yet</p>
                <p class="text-[11px] text-gray-600">Select a range above and click Get Number</p>
              </div>
            </td></tr>`}
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
          const flag = countryFlag(n.countryId, this.countryMap);
          const countryName = n.countryName || this.countryMap[n.countryId]?.name || n.countryId || '—';
          const otp = this.renderOtpCell(n);
          let statusBadge = '';
          if (st === 'successful') statusBadge = '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-400">Delivered</span>';
          else if (st === 'failed') statusBadge = '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/15 text-red-400">Failed</span>';
          else statusBadge = '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-400">Pending</span>';

          return `<div class="px-4 py-3 ${hl}">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span>${flag}</span>
                <button type="button" class="copy-line copy-line--phone text-sm font-bold text-white font-mono tracking-wide truncate" data-copy="${phoneCopy}" data-number-id="${n.id}" data-copy-msg="Number copied!">${n.phoneNumber || '—'}</button>
              </div>
              ${statusBadge}
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-500 text-[11px]">${countryName} · Mobile</span>
              <span class="text-gray-600 text-[11px]">${this.formatRelative(n.createdAt)}</span>
            </div>
            ${st === 'successful' && otp !== '<span class="text-gray-500 text-xs">—</span>' ? `<div class="mt-2">${otp}</div>` : ''}
          </div>`;
        }).join('') : '<div class="p-12 text-center text-gray-500 text-sm"><i class="fas fa-inbox text-2xl block mb-2 text-gray-700"></i>No numbers yet</div>'}
      </div>`;

    return `
      <div class="bg-[#0a1e3b] rounded-2xl border border-white/[0.06] overflow-hidden mt-4">
        <div class="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div class="flex items-center gap-3">
            <p class="text-white text-sm font-bold">${rows.length ? `1–${rows.length} of ${rows.length}` : '0 results'}</p>
          </div>
          <button type="button" id="refreshNumbersBtn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-all">
            <i class="fas fa-sync-alt text-[10px]"></i> Refresh
          </button>
        </div>
        <div class="hidden md:block">
          ${renderDesktopTable()}
        </div>
        <div class="md:hidden">
          ${renderMobileCards()}
        </div>
      </div>`;
  }

  renderBody() {
    const countryOpts = this.countries.map((c) =>
      `<option value="${c.id}" ${this.selectedCountry?.id === c.id ? 'selected' : ''}>${this.countryOptionLabel(c)}</option>`
    ).join('');
    const serverOpts = this.servers.map((s) => {
      return `<option value="${s.id}" ${this.selectedServer?.id === s.id ? 'selected' : ''}>${s.name}</option>`;
    }).join('');

    const activeTab = this._activeTab || 'range';
    const rangeName = this.selectedServer?.name || this.selectedCountry?.name || '';
    const rangeCode = this.selectedCountry?.code ? (this.selectedCountry.code.startsWith('+') ? this.selectedCountry.code : `+${this.selectedCountry.code}`) : '';
    const displayRange = rangeCode ? `${rangeCode}${rangeName ? ' ' + rangeName : ''}` : rangeName;

    return `
      <section class="py-2">

        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-black text-white flex items-center gap-2">
              <span class="text-2xl">📱</span> Get Number
            </h1>
            <p class="text-gray-500 text-xs mt-0.5">Allocate numbers from a prefix range and watch incoming OTPs.</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="ws-status-badge" id="wsStatusBadge">
              <span class="ws-dot ws-dot--off" id="wsStatusDot"></span>
              <span class="text-xs text-gray-400 hidden sm:inline" id="wsStatusText">Connecting...</span>
            </span>
          </div>
        </div>

        <div class="bg-[#0a1e3b] rounded-2xl border border-white/[0.06] p-4 mb-4">
          <button type="button" id="toggleFiltersBtn" class="flex items-center gap-2 text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors w-full">
            <i class="fas fa-sliders-h"></i> Show filters & stats
            <span class="ml-auto px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-black">${this.numbers.length}</span>
            <i class="fas fa-chevron-down text-[10px] ml-1 transition-transform" id="filterChevron"></i>
          </button>
          <div id="filtersPanel" class="hidden mt-4 pt-4 border-t border-white/[0.06]">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="bg-white/[0.03] rounded-xl p-3 text-center">
                <p class="text-2xl font-black text-white">${this.numbers.length}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Total Numbers</p>
              </div>
              <div class="bg-white/[0.03] rounded-xl p-3 text-center">
                <p class="text-2xl font-black text-emerald-400">${this.numbers.filter(n => numberStatus(n) === 'successful').length}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Delivered</p>
              </div>
              <div class="bg-white/[0.03] rounded-xl p-3 text-center">
                <p class="text-2xl font-black text-red-400">${this.numbers.filter(n => numberStatus(n) === 'failed').length}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Failed</p>
              </div>
              <div class="bg-white/[0.03] rounded-xl p-3 text-center">
                <p class="text-2xl font-black text-amber-400">${this.numbers.filter(n => numberStatus(n) === 'pending').length}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Pending</p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-none">
          <span class="text-gray-500 text-[10px] uppercase tracking-widest font-bold whitespace-nowrap">Enter Number Range</span>
          <div class="flex bg-[#0a1e3b] rounded-xl border border-white/[0.06] p-1">
            <button type="button" data-tab="range" class="tab-btn px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === 'range' ? 'bg-primary text-dark' : 'text-gray-400 hover:text-white'}">Range</button>
            <button type="button" data-tab="search" class="tab-btn px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === 'search' ? 'bg-primary text-dark' : 'text-gray-400 hover:text-white'}">Search</button>
            <button type="button" data-tab="access" class="tab-btn px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === 'access' ? 'bg-primary text-dark' : 'text-gray-400 hover:text-white'}">Access</button>
          </div>
          <div class="ml-auto flex items-center gap-2 shrink-0">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" id="syncModeToggle" checked class="w-0 h-0 sr-only peer">
              <div class="relative w-9 h-5 bg-gray-700 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              <span class="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Sync Mode</span>
            </label>
          </div>
        </div>

        <div class="bg-[#0a1e3b] rounded-2xl border border-white/[0.06] p-5 mb-4">
          <div class="mb-4">
            <label class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block"># Number Range</label>
            <div class="flex items-center gap-3">
              <span class="text-gray-600 text-lg font-bold">#</span>
              <input type="text" id="rangeInput" class="flex-1 bg-transparent border-0 border-b-2 border-white/10 focus:border-primary text-white text-lg font-mono font-bold tracking-widest py-2 outline-none transition-colors placeholder-gray-700" placeholder="${this.selectedCountry?.code ? this.selectedCountry.code.replace('+','') + 'XXXXXXX' : 'e.g. 22465XXX'}" value="${displayRange}">
            </div>
            <p class="text-gray-600 text-[11px] mt-2"><i class="fas fa-info-circle mr-1"></i>Select a country and range below. Sync mode keeps this range across all your tabs.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div class="md:col-span-4">
              <label class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Country</label>
              <select id="countrySelect" class="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:outline-none transition-colors appearance-none">
                <option value="">Select country...</option>${countryOpts}
              </select>
            </div>
            <div class="md:col-span-4">
              <label class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Range</label>
              <select id="serverSelect" class="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:outline-none transition-colors appearance-none" ${!this.servers.length ? 'disabled' : ''}>
                <option value="">Select range...</option>${serverOpts}
              </select>
            </div>
            <div class="md:col-span-2">
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" id="nationalFormatCheck" class="w-0 h-0 sr-only peer" ${this.numberFormat === 'natural' ? 'checked' : ''}>
                  <div class="relative w-5 h-5 rounded-md bg-white/10 border border-white/20 peer-checked:bg-primary peer-checked:border-primary flex items-center justify-center transition-all after:content-['✓'] after:text-dark after:text-xs after:font-black after:hidden peer-checked:after:block"></div>
                  <span class="text-xs text-gray-400">National Format</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" id="removePlusCheck" class="w-0 h-0 sr-only peer" ${this.numberFormat === 'remove_plus' ? 'checked' : ''}>
                  <div class="relative w-5 h-5 rounded-md bg-white/10 border border-white/20 peer-checked:bg-primary peer-checked:border-primary flex items-center justify-center transition-all after:content-['✓'] after:text-dark after:text-xs after:font-black after:hidden peer-checked:after:block"></div>
                  <span class="text-xs text-gray-400">Remove (+)</span>
                </label>
              </div>
            </div>
            <div class="md:col-span-2">
              <button type="button" id="generateBtn" class="w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/20 transition-all ${this.isGenerating ? 'opacity-60 pointer-events-none' : ''}">
                ${this.isGenerating ? '<i class="fas fa-spinner fa-spin mr-1"></i> Getting...' : '<i class="fas fa-magic mr-1"></i> Get Number'}
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
    // Restore WS status after re-render — use GWS, not this.ws
    this.updateWsStatus(window.GWS?.isConnected() === true);
    document.getElementById('countrySelect')?.addEventListener('change', (e) => this.handleCountryChange(e.target.value));
    document.getElementById('serverSelect')?.addEventListener('change', (e) => this.handleServerChange(e.target.value));
    document.getElementById('nationalFormatCheck')?.addEventListener('change', (e) => {
      if (e.target.checked) { this.numberFormat = 'natural'; document.getElementById('removePlusCheck').checked = false; }
      else { this.numberFormat = 'remove_plus'; document.getElementById('removePlusCheck').checked = true; }
    });
    document.getElementById('removePlusCheck')?.addEventListener('change', (e) => {
      if (e.target.checked) { this.numberFormat = 'remove_plus'; document.getElementById('nationalFormatCheck').checked = false; }
      else { this.numberFormat = 'natural'; document.getElementById('nationalFormatCheck').checked = true; }
    });
    document.getElementById('generateBtn')?.addEventListener('click', () => this.generateNumber());
    document.getElementById('refreshNumbersBtn')?.addEventListener('click', async () => {
      await this.loadNumbers();
      this.render();
      showToast('Numbers refreshed');
    });
    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { this.filterStatus = btn.dataset.filter; this.render(); });
    });
    document.getElementById('toggleFiltersBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('filtersPanel');
      const chevron = document.getElementById('filterChevron');
      if (panel) panel.classList.toggle('hidden');
      if (chevron) chevron.style.transform = panel?.classList.contains('hidden') ? '' : 'rotate(180deg)';
    });
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { this._activeTab = btn.dataset.tab; this.render(); });
    });
    bindCopyCells(document.getElementById('app'));
    this.startTick();
  }

  destroy() {
    this._wsUnsubs.forEach(fn => fn());
    this._wsUnsubs = [];
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.closeWelcomeModal();
  }

  showWelcomeModal() {
    const today = new Date().toISOString().slice(0, 10);
    const dismissed = localStorage.getItem('welcomeDismissed');
    if (dismissed === today) return;

    const existing = document.getElementById('welcomeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'welcomeModal';
    modal.innerHTML = `
      <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4" style="background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);">
        <div class="glass-card border-primary/20 w-full max-w-md relative overflow-hidden" style="animation:fadeIn 0.3s ease;">
          <button id="welcomeClose" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-400 hover:text-white transition-all z-10">
            <i class="fas fa-times text-xs"></i>
          </button>

          <div class="p-6 pb-3 text-center">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center text-primary text-3xl mb-4">
              <i class="fas fa-rocket"></i>
            </div>
            <h2 class="text-xl font-black text-white uppercase tracking-wide mb-2">Welcome to GURUBIT!</h2>
            <p class="text-gray-400 text-sm leading-relaxed">
              Get your <strong class="text-primary">free virtual number</strong> now and start receiving SMS instantly. 
              Join our community for <strong class="text-primary">updates</strong>, 
              <strong class="text-primary">tips</strong>, and <strong class="text-primary">24/7 support</strong>.
            </p>
          </div>

          <div class="px-6 pb-4 space-y-3">
            <a href="https://youtube.com/@riadalmamun4363?si=FxK0uXgy-tLoO7By" target="_blank" rel="noopener noreferrer" 
               class="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group">
              <div class="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                <i class="fab fa-youtube text-lg"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm">YouTube Channel</p>
                <p class="text-gray-500 text-[10px]">Tutorials, tips & updates</p>
              </div>
              <span class="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-black uppercase tracking-wider">Subscribe</span>
            </a>

            <a href="https://t.me/Riad_Al_MamunEn" target="_blank" rel="noopener noreferrer"
               class="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all group">
              <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <i class="fab fa-telegram-plane text-lg"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-white font-bold text-sm">Telegram Group</p>
                <p class="text-gray-500 text-[10px]">Live support & community</p>
              </div>
              <span class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[10px] font-black uppercase tracking-wider">Join</span>
            </a>
          </div>

          <div class="px-6 pb-5 flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" id="welcomeDontToday" class="w-4 h-4 rounded border-gray-600 bg-black/30 text-primary focus:ring-primary/50">
              <span class="text-gray-400 text-xs">Don't show today</span>
            </label>
            <div class="flex items-center gap-2">
              <span id="welcomeCountdown" class="text-gray-500 text-[10px] font-mono">10s</span>
              <button id="welcomeAccept" class="neon-btn px-4 py-2 text-xs uppercase tracking-widest">Got it!</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    let remaining = 10;
    const countdownEl = document.getElementById('welcomeCountdown');
    this._welcomeCountdown = setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.textContent = `${remaining}s`;
      if (remaining <= 0) this.closeWelcomeModal();
    }, 1000);

    const close = () => this.closeWelcomeModal();
    document.getElementById('welcomeClose')?.addEventListener('click', () => {
      if (document.getElementById('welcomeDontToday')?.checked) localStorage.setItem('welcomeDismissed', today);
      close();
    });
    document.getElementById('welcomeAccept')?.addEventListener('click', () => {
      if (document.getElementById('welcomeDontToday')?.checked) localStorage.setItem('welcomeDismissed', today);
      close();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }

  closeWelcomeModal() {
    clearInterval(this._welcomeCountdown);
    const modal = document.getElementById('welcomeModal');
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.3s ease';
      setTimeout(() => modal.remove(), 300);
    }
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
    // Show welcome modal once per day
    this.showWelcomeModal();
  }
}
