/**
 * Live SMS Feed — Real-time SMS from provider API
 * Public: shows masked real data (no demo)
 * Logged-in: shows live real data via WebSocket
 */

import { UserLayout } from '../utils/UserLayout.js';
import { AgentLayout } from '../utils/AgentLayout.js';
import { bindCopyCells, detectServiceLabel, appIconMeta } from '../utils/uiHelpers.js';

export class LiveSMSFeed {
  constructor() {
    this.messages = [];
    this.ws = null;
    this.loading = true;
    this.authenticated = false;
    this.user = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 60;
    this.reconnectDelay = 3000;
    this.reconnectMultiplier = 1.5;
  }

  siteNav() {
    return `
      <nav class="fixed top-0 w-full z-40 bg-black/50 backdrop-blur-lg border-b border-white/5">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          <a href="/" class="flex items-center gap-3">
            <img src="/assets/logo.svg" alt="GURUBIT" class="w-10 h-10 logo-glow">
            <span class="text-lg font-black tracking-widest gradient-text uppercase">GURUBIT</span>
          </a>
          <div class="hidden md:flex gap-8 text-xs font-bold text-gray-300 uppercase tracking-widest">
            <a href="/" class="hover:text-primary">Home</a>
            <a href="/live-feed" class="text-primary">Live Feed</a>
            <a href="/faq" class="hover:text-primary">Help</a>
          </div>
          <div class="flex items-center gap-3">
            <button type="button" id="feedNavLogin" class="px-4 py-2 text-xs font-black uppercase border border-white/15 rounded-lg">Login</button>
            <button type="button" id="feedNavSignup" class="neon-btn px-4 py-2 text-xs uppercase">Sign up</button>
          </div>
        </div>
      </nav>`;
  }

  renderRow(row) {
    const service = row.service || row.platformName || detectServiceLabel(row.message || row.smsMessage || '') || 'Verification';
    const message = row.message || row.smsMessage || row.content || '';
    const otp = row.otpCode || row.otp || null;
    const num = row.phoneNumber || '+•• ••• •••';
    const country = row.country || row.countryName || '—';
    const server = row.server || row.serverName || '—';
    const time = row.createdAt || row.receivedAt
      ? new Date(row.createdAt || row.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '';
    const date = row.createdAt || row.receivedAt
      ? new Date(row.createdAt || row.receivedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : '';

    const meta = appIconMeta(service);
    const smsHtml = `
      <div class="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 max-w-xs shadow-lg shadow-emerald-500/5 animate-pulse-slow">
        <div class="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] shrink-0" style="background: ${meta.bg}">
          <i class="${meta.icon}"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[9px] font-bold text-emerald-400 uppercase tracking-widest leading-none mb-0.5">${service}</p>
          <button type="button" class="copy-line text-left text-[11px] text-gray-300 truncate leading-tight font-medium w-full" data-copy="${message.replace(/"/g, '&quot;')}" data-copy-msg="SMS copied!">${message || '—'}</button>
          ${time ? `<p class="text-[8px] text-gray-500 mt-0.5 leading-none">${time} · ${date}</p>` : ''}
        </div>
      </div>`;

    return `
      <tr class="live-sms-row">
        <td>
          <button type="button" class="copy-line copy-line--phone font-mono text-primary text-xs" data-copy="${num}" data-copy-msg="Number copied!">${num}</button>
        </td>
        <td class="text-gray-200 text-xs">${country}</td>
        <td class="text-gray-400 text-xs font-semibold">${server}</td>
        <td>
          ${otp
            ? `<button type="button" class="otp-copy-btn copy-line" data-copy="${otp}" data-copy-msg="OTP copied!">${otp}</button>`
            : '<span class="text-gray-500 text-xs font-mono">——</span>'
          }
        </td>
        <td>${smsHtml}</td>
      </tr>`;
  }

  renderTable() {
    if (this.loading) {
      return `
        <div class="glass-card p-16 text-center live-feed-panel">
          <div class="spinner mx-auto mb-4"></div>
          <p class="text-gray-400 text-sm">Connecting to live feed...</p>
        </div>`;
    }

    return `
      <div class="glass-card live-feed-panel overflow-hidden border-primary/15">
        <div class="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <span class="text-xs font-bold text-green-400 uppercase tracking-widest">Live</span>
            <span class="text-xs text-gray-500">${this.messages.length} message${this.messages.length !== 1 ? 's' : ''}</span>
          </div>
          <span class="text-xs text-gray-600">Tap to copy</span>
        </div>
        <div class="overflow-x-auto">
          <table class="live-sms-table w-full text-left">
            <thead>
              <tr>
                <th>Number</th>
                <th>Country</th>
                <th>Server</th>
                <th>OTP</th>
                <th>SMS</th>
              </tr>
            </thead>
            <tbody id="liveFeedTbody">
              ${this.messages.length
                ? this.messages.map(r => this.renderRow(r)).join('')
                : `<tr><td colspan="5" class="p-12 text-center">
                    <div class="flex flex-col items-center gap-3">
                      <i class="fas fa-satellite-dish text-3xl text-gray-600"></i>
                      <p class="text-gray-500 text-sm">Waiting for live SMS...</p>
                      <p class="text-gray-600 text-xs">Messages will appear here as they arrive from providers</p>
                    </div>
                  </td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>`;
  }

  async loadData() {
    this.loading = true;
    this.render();

    try {
      const response = await fetch('/api/sms/live-feed');
      const data = await response.json().catch(() => ({}));
      if (data.success && Array.isArray(data.messages)) {
        this.messages = data.messages;
      } else {
        this.messages = [];
      }
    } catch {
      this.messages = [];
    }

    this.loading = false;
    this.render();
    this.setupWebSocket();
  }

  setupWebSocket() {
    try {
      if (this.ws) { try { this.ws.close(); } catch {} }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${window.location.host}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.ws.send(JSON.stringify({ type: 'subscribe_sms_feed' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // New SMS arrived from provider
          if (data.type === 'new_sms' && data.message) {
            this._prependMessage(data.message);
          }

          // OTP matched to a user number
          if (data.type === 'otp_success' && data.otp) {
            const msg = {
              id: `ws_${Date.now()}`,
              phoneNumber: data.phoneNumber,
              otp: data.otp,
              otpCode: data.otp,
              message: data.smsMessage || data.message || '',
              country: data.country || '—',
              server: data.server || '—',
              createdAt: new Date().toISOString()
            };
            this._prependMessage(msg);
          }
        } catch {}
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

  _prependMessage(msg) {
    // Avoid duplicates
    if (this.messages.some(m => m.id === msg.id)) return;
    this.messages.unshift(msg);
    if (this.messages.length > 100) this.messages.pop();

    // Fast DOM update — just prepend row without full re-render
    const tbody = document.getElementById('liveFeedTbody');
    if (tbody) {
      // Remove "no messages" placeholder if present
      const placeholder = tbody.querySelector('td[colspan]');
      if (placeholder) tbody.innerHTML = '';

      const tr = document.createElement('tr');
      tr.className = 'live-sms-row animate-fade-in';
      tr.innerHTML = this.renderRow(msg).replace(/<tr[^>]*>/, '').replace('</tr>', '');
      tbody.prepend(tr);

      // Update count
      const countEl = document.querySelector('.live-feed-panel .text-gray-500');
      if (countEl) countEl.textContent = `${this.messages.length} message${this.messages.length !== 1 ? 's' : ''}`;

      bindCopyCells(tbody);
    } else {
      this.render();
    }
  }

  destroy() {
    if (this.ws) { try { this.ws.close(); } catch {} }
  }

  attachListeners() {
    bindCopyCells(document.getElementById('app'));
    document.getElementById('feedNavLogin')?.addEventListener('click', () => this.openAuth('login'));
    document.getElementById('feedNavSignup')?.addEventListener('click', () => this.openAuth('signup'));
  }

  openAuth(mode) {
    import('./AuthPage.js').then(({ AuthPage }) => {
      const auth = new AuthPage();
      auth.isLoginMode = mode === 'login';
      auth.init();
    });
  }

  renderPublic() {
    document.getElementById('app').innerHTML = `
      <div class="min-h-screen text-white" style="background: radial-gradient(ellipse at top, #0a1e3b 0%, #020b18 65%);">
        ${this.siteNav()}
        <header class="pt-28 pb-6 px-4 border-b border-white/5">
          <div class="max-w-6xl mx-auto">
            <h1 class="text-3xl font-black gradient-text uppercase">Live SMS Feed</h1>
            <p class="text-gray-400 mt-1 text-sm">Real-time SMS signals from all providers</p>
          </div>
        </header>
        <main class="max-w-6xl mx-auto px-4 py-8">${this.renderTable()}</main>
      </div>`;
    this.attachListeners();
  }

  renderInApp() {
    const layout = this.user?.isAgent ? AgentLayout : UserLayout;
    layout.renderShell({
      activeId: 'live-feed',
      title: 'Live SMS',
      bodyHtml: `
        <p class="text-gray-400 text-sm mb-4">Real-time SMS signals</p>
        ${this.renderTable()}`,
      user: this.user
    });
    this.attachListeners();
  }

  render() {
    if (this.authenticated) this.renderInApp();
    else this.renderPublic();
  }

  async init() {
    const session = await fetch('/api/auth/session').then(r => r.json()).catch(() => ({}));
    this.authenticated = !!session.authenticated;
    this.user = session.user;
    await this.loadData();
  }
}
