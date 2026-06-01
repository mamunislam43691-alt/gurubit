/**
 * Live SMS Feed — Real-time SMS from provider API
 * Public: shows masked real data (no demo)
 * Logged-in: shows live real data via WebSocket
 */

import { UserLayout } from '../utils/UserLayout.js';
import { AgentLayout } from '../utils/AgentLayout.js';
import { bindCopyCells, detectServiceLabel } from '../utils/uiHelpers.js';

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
        <td>
          <div class="flex flex-col gap-0.5">
            <span class="sms-service-label">${service}</span>
            <button type="button" class="copy-line text-gray-300 text-xs text-left leading-relaxed" data-copy="${message.replace(/"/g, '&quot;')}" data-copy-msg="SMS copied!">${message || '—'}</button>
            ${time ? `<span class="sms-time">${time} · ${date}</span>` : ''}
          </div>
        </td>
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

    const rows = this.messages;

    // Mobile card view
    const mobileCards = rows.length
      ? rows.map((row) => {
          const service = row.service || row.platformName || detectServiceLabel(row.message || row.smsMessage || '') || 'Verification';
          const message = row.message || row.smsMessage || row.content || '';
          const otp = row.otpCode || row.otp || null;
          const num = row.phoneNumber || '+•• ••• •••';
          const country = row.country || row.countryName || '—';
          const time = row.createdAt || row.receivedAt
            ? new Date(row.createdAt || row.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';
          return `
            <div class="px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-all">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <button type="button" class="copy-line copy-line--phone font-mono text-primary text-sm font-black" data-copy="${num}" data-copy-msg="Number copied!">${num}</button>
                ${otp ? `<button type="button" class="otp-copy-btn copy-line text-sm" data-copy="${otp}" data-copy-msg="OTP copied!">${otp}</button>` : ''}
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="sms-service-label">${service}</span>
                <span class="text-gray-500 text-[10px]">${country}</span>
                ${time ? `<span class="sms-time ml-auto">${time}</span>` : ''}
              </div>
              ${message ? `<button type="button" class="copy-line text-gray-400 text-xs text-left leading-relaxed mt-1 block w-full truncate" data-copy="${message.replace(/"/g, '&quot;')}" data-copy-msg="SMS copied!">${message}</button>` : ''}
            </div>`;
        }).join('')
      : `<div class="p-12 text-center">
          <i class="fas fa-satellite-dish text-3xl text-gray-600 mb-3 block"></i>
          <p class="text-gray-500 text-sm">Waiting for live SMS...</p>
        </div>`;

    return `
      <div class="glass-card live-feed-panel overflow-hidden border-primary/15">
        <div class="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <span class="text-xs font-bold text-green-400 uppercase tracking-widest">Live</span>
            <span class="text-xs text-gray-500" id="liveFeedCount">${rows.length} message${rows.length !== 1 ? 's' : ''}</span>
          </div>
          <span class="text-xs text-gray-600">Tap to copy</span>
        </div>
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
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
              ${rows.length
                ? rows.map(r => this.renderRow(r)).join('')
                : `<tr><td colspan="5" class="p-12 text-center">
                    <div class="flex flex-col items-center gap-3">
                      <i class="fas fa-satellite-dish text-3xl text-gray-600"></i>
                      <p class="text-gray-500 text-sm">Waiting for live SMS...</p>
                    </div>
                  </td></tr>`
              }
            </tbody>
          </table>
        </div>
        <!-- Mobile cards -->
        <div class="md:hidden" id="liveFeedCards">
          ${mobileCards}
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

    // Fast DOM update — prepend row (desktop) and card (mobile) without full re-render
    const tbody = document.getElementById('liveFeedTbody');
    const cardsEl = document.getElementById('liveFeedCards');

    if (tbody) {
      // Remove "no messages" placeholder if present
      const placeholder = tbody.querySelector('td[colspan]');
      if (placeholder) tbody.innerHTML = '';

      const tr = document.createElement('tr');
      tr.className = 'live-sms-row animate-fade-in';
      tr.innerHTML = this.renderRow(msg).replace(/<tr[^>]*>/, '').replace('</tr>', '');
      tbody.prepend(tr);
      bindCopyCells(tbody);
    }

    if (cardsEl) {
      // Remove "no messages" placeholder
      const placeholder = cardsEl.querySelector('.p-12');
      if (placeholder) cardsEl.innerHTML = '';

      const service = msg.service || msg.platformName || detectServiceLabel(msg.message || msg.smsMessage || '') || 'Verification';
      const message = msg.message || msg.smsMessage || msg.content || '';
      const otp = msg.otpCode || msg.otp || null;
      const num = msg.phoneNumber || '+•• ••• •••';
      const country = msg.country || msg.countryName || '—';
      const time = msg.createdAt || msg.receivedAt
        ? new Date(msg.createdAt || msg.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

      const card = document.createElement('div');
      card.className = 'px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-all animate-fade-in';
      card.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <button type="button" class="copy-line copy-line--phone font-mono text-primary text-sm font-black" data-copy="${num}" data-copy-msg="Number copied!">${num}</button>
          ${otp ? `<button type="button" class="otp-copy-btn copy-line text-sm" data-copy="${otp}" data-copy-msg="OTP copied!">${otp}</button>` : ''}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="sms-service-label">${service}</span>
          <span class="text-gray-500 text-[10px]">${country}</span>
          ${time ? `<span class="sms-time ml-auto">${time}</span>` : ''}
        </div>
        ${message ? `<button type="button" class="copy-line text-gray-400 text-xs text-left leading-relaxed mt-1 block w-full truncate" data-copy="${message.replace(/"/g, '&quot;')}" data-copy-msg="SMS copied!">${message}</button>` : ''}`;
      cardsEl.prepend(card);
      bindCopyCells(cardsEl);
    }

    // Update count
    const countEl = document.getElementById('liveFeedCount');
    if (countEl) countEl.textContent = `${this.messages.length} message${this.messages.length !== 1 ? 's' : ''}`;

    if (!tbody && !cardsEl) {
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
    document.getElementById('app-skeleton')?.remove();
    document.getElementById('app').innerHTML = `
      <div class="min-h-screen text-white" style="background: radial-gradient(ellipse at top, #0a1e3b 0%, #020b18 65%);">
        ${this.siteNav()}
        <header class="pt-28 pb-6 px-4 border-b border-white/5">
          <div class="max-w-6xl mx-auto">
            <h1 class="text-3xl font-black gradient-text uppercase">Live SMS Feed</h1>
            <p class="text-gray-400 mt-1 text-sm">Real-time SMS signals from all providers</p>
          </div>
        </header>
        <main class="max-w-6xl mx-auto px-4 py-8 pb-24">${this.renderTable()}</main>
        <!-- Mobile bottom nav for public view -->
        <nav class="mobile-bottom-nav md:hidden" style="position:fixed;bottom:0;left:0;right:0;z-index:50;background:rgba(2,11,24,0.95);backdrop-filter:blur(16px);border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-around;padding:0.5rem 0;">
          <a href="/" class="mobile-nav-item" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:0.4rem 1rem;color:#9ca3af;font-size:10px;font-weight:700;text-transform:uppercase;text-decoration:none;">
            <i class="fas fa-home" style="font-size:1.1rem;"></i><span>Home</span>
          </a>
          <a href="/live-feed" class="mobile-nav-item" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:0.4rem 1rem;color:#00d2ff;font-size:10px;font-weight:700;text-transform:uppercase;text-decoration:none;">
            <i class="fas fa-satellite-dish" style="font-size:1.1rem;"></i><span>Live SMS</span>
          </a>
          <a href="/faq" class="mobile-nav-item" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:0.4rem 1rem;color:#9ca3af;font-size:10px;font-weight:700;text-transform:uppercase;text-decoration:none;">
            <i class="fas fa-question-circle" style="font-size:1.1rem;"></i><span>Help</span>
          </a>
          <button type="button" id="feedNavLoginMobile" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:0.4rem 1rem;color:#9ca3af;font-size:10px;font-weight:700;text-transform:uppercase;background:none;border:none;cursor:pointer;">
            <i class="fas fa-sign-in-alt" style="font-size:1.1rem;"></i><span>Login</span>
          </button>
        </nav>
      </div>`;
    this.attachListeners();
    document.getElementById('feedNavLoginMobile')?.addEventListener('click', () => this.openAuth('login'));
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
    // Use UserLayout session cache for instant render
    const { UserLayout } = await import('../utils/UserLayout.js').catch(() => ({ UserLayout: null }));
    const cached = UserLayout?.getCachedUser?.() || null;
    if (cached) {
      this.authenticated = true;
      this.user = cached;
      // Render immediately with cached user
      this.loading = false;
      this.render();
    }
    // Fetch fresh session in background
    const session = await fetch('/api/auth/session').then(r => r.json()).catch(() => ({}));
    this.authenticated = !!session.authenticated;
    this.user = session.user || this.user;
    await this.loadData();
  }
}
