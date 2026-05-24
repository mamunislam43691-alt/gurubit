/**
 * Active number view with live SMS feed
 */

import { UserLayout } from '../utils/UserLayout.js';

export class NumberResultGrid {
  constructor(numberId) {
    this.numberId = numberId;
    this.number = null;
    this.messages = [];
    this.ws = null;
    this.countdown = 300;
    this.timer = null;
    this.user = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 60;
    this.reconnectDelay = 5000;
    this.reconnectMultiplier = 2;
  }

  async loadNumber() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;

    const response = await fetch(`/api/numbers/${this.numberId}`);
    const data = await response.json();
    if (data.success) {
      this.number = data.number;
      await this.loadMessages();
      this.render();
      this.setupWebSocket();
      this.startCountdown();
    } else {
      alert('Number not found');
      window.location.href = '/numbers';
    }
  }

  async loadMessages() {
    const response = await fetch(`/api/numbers/${this.numberId}/messages`);
    const data = await response.json();
    if (data.success) {
      // Filter messages to only show those within 10-minute window (600 seconds)
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      
      this.messages = data.messages.filter(msg => {
        const msgTime = msg.receivedAt ? new Date(msg.receivedAt) : new Date(msg.createdAt);
        return msgTime >= tenMinutesAgo;
      });
    }
  }

  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.ws.send(JSON.stringify({ type: 'subscribe_number', numberId: this.numberId }));
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_sms' && data.message?.numberId === this.numberId) {
          const msg = data.message;
          const expiresAt = msg.expiresAt ? new Date(msg.expiresAt) : new Date(Date.now() + 10 * 60 * 1000);
          const now = new Date();
          if (now <= expiresAt) {
            // Add new message to the top (latest)
            this.messages.unshift(msg);
            
            // Update the main SMS display immediately with the new OTP
            this.updateLatestOTP();
            
            // Update the full messages feed
            this.updateMessagesFeed();
            
            // Flash the new OTP code
            this.flashSms(msg.otpCode);
          }
        }
      } catch {}
    };
    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const baseDelay = Math.min(this.reconnectDelay * Math.pow(this.reconnectMultiplier || 2, this.reconnectAttempts - 1), 120000);
        const jitter = Math.floor(Math.random() * Math.min(5000, Math.floor(baseDelay * 0.2)));
        const delay = baseDelay + jitter;
        setTimeout(() => this.setupWebSocket(), delay);
      }
    };
  }

  startCountdown() {
    this.timer = setInterval(() => {
      this.countdown--;
      const el = document.getElementById('countdown');
      if (el) el.textContent = this.formatTime(this.countdown);
      if (this.countdown <= 0) {
        clearInterval(this.timer);
        if (el) el.textContent = 'EXPIRED';
      }
    }, 1000);
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyFeedback');
      if (btn) { btn.textContent = 'COPIED!'; setTimeout(() => { btn.textContent = 'COPY'; }, 2000); }
    }).catch(() => {});
  }

  updateLatestOTP() {
    const el = document.getElementById('smsDisplay');
    const senderEl = document.getElementById('smsSender');
    if (el && this.messages.length > 0) {
      const latestMsg = this.messages[0];
      el.textContent = latestMsg.otpCode || '——';
      el.classList.add('text-green-400');
      if (senderEl) {
        senderEl.textContent = latestMsg.senderNumber || '';
      }
    }
  }

  flashSms(code) {
    const el = document.getElementById('smsDisplay');
    if (el) {
      el.textContent = code;
      el.classList.add('text-green-400');
      el.style.transition = 'all 0.3s ease';
      el.style.transform = 'scale(1.05)';
      setTimeout(() => { el.style.transform = 'scale(1)'; }, 300);
    }
  }

  updateMessagesFeed() {
    const feed = document.getElementById('messagesFeed');
    if (feed) {
      const now = new Date();
      const validMessages = this.messages.filter(m => {
        if (!m.expiresAt) return true;
        return new Date(m.expiresAt) > now;
      });
      feed.innerHTML = validMessages.map((m) => this.renderMessage(m)).join('');
    }
  }

  renderBody() {
    const displayNumber = this.number?.phoneNumber || 'Generating...';
    return `
      <div class="space-y-6">
        <a href="/numbers" class="text-primary text-xs font-bold uppercase"><i class="fas fa-arrow-left"></i> Back to numbers</a>
        <div class="glass-card p-8 text-center">
          <p class="stat-label mb-2">Your Virtual Number</p>
          <p class="text-4xl font-black text-white font-mono tracking-wider mb-4">${displayNumber}</p>
          <div class="flex justify-center gap-3 flex-wrap">
            <button type="button" id="copyNumberBtn" class="neon-btn px-8 py-2 text-xs uppercase"><span id="copyFeedback">COPY</span></button>
            <span class="glass-card px-4 py-2 text-sm font-mono text-white"><i class="fas fa-clock text-gray-500 mr-2"></i><span id="countdown">${this.formatTime(this.countdown)}</span></span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="glass-card p-4 text-center"><p class="stat-label">Country</p><p class="text-sm font-bold text-white">${this.number?.countryName || this.number?.countryId || '—'}</p></div>
          <div class="glass-card p-4 text-center"><p class="stat-label">Status</p><p class="text-sm font-bold text-green-400">${this.number?.status === 'pending' ? 'Active' : (this.number?.status || 'Active')}</p></div>
        </div>
        <div class="glass-card p-8 text-center border-primary/20">
          <p class="stat-label mb-3">Latest SMS Code</p>
          ${this.messages.length ? `
            <p class="text-5xl font-black font-mono tracking-[0.3em] text-white" id="smsDisplay">${this.messages[0]?.otpCode || '——'}</p>
            <p class="text-xs text-gray-500 mt-2 font-mono" id="smsSender">${this.messages[0]?.senderNumber || ''}</p>
          ` : `
            <p id="smsDisplay" class="text-gray-400 py-6"><i class="fas fa-satellite-dish text-primary text-2xl block mb-3"></i>Listening for incoming SMS...</p>
            <p id="smsSender" class="hidden"></p>
          `}
        </div>
        <div>
          <h3 class="stat-label mb-3">Incoming Messages (${this.messages.length})</h3>
          <div id="messagesFeed" class="space-y-3">
            ${this.messages.length ? this.messages.map((m) => this.renderMessage(m)).join('') : '<p class="text-gray-500 text-sm">No messages yet</p>'}
          </div>
        </div>
      </div>`;
  }

  renderMessage(msg) {
    const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `
      <div class="glass-card p-4 border-white/5">
        <div class="flex justify-between mb-2">
          <span class="text-xs text-gray-500">${msg.senderNumber || 'Unknown'}</span>
          <span class="text-xs text-primary font-mono">${time}</span>
        </div>
        <p class="text-sm text-white">${msg.messageText || msg.fullSms || ''}</p>
        ${msg.otpCode ? `<p class="mt-2 text-xl font-black text-green-400 font-mono tracking-widest">${msg.otpCode}</p>` : ''}
      </div>`;
  }

  render() {
    UserLayout.renderShell({
      activeId: 'numbers',
      title: 'Active Number',
      bodyHtml: this.renderBody(),
      user: this.user
    });
    document.getElementById('copyNumberBtn')?.addEventListener('click', () => {
      this.copyToClipboard(this.number?.phoneNumber || '');
    });
  }

  destroy() {
    if (this.ws) this.ws.close();
    if (this.timer) clearInterval(this.timer);
  }

  async init() {
    await this.loadNumber();
  }
}
