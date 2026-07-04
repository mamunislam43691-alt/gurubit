/**
 * Floating live support widget (GURUBIT branded)
 */

import { showToast } from '../utils/uiHelpers.js';

export class LiveSupportWidget {

  constructor() {

    this.open = false;

    this.view = 'teaser';

    this.sessionId = localStorage.getItem('gurubit_support_session') || null;

    this.messages = [];

    this.ws = null;

    this.visitor = { name: '', email: '' };
    this.loggedInUser = null;
    this.hasUnread = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 60;
    this.reconnectDelay = 5000;
    this.reconnectMultiplier = 2;
  }

  shouldShowTeaser() {
    if (this.open) return false;
    if (this.sessionId || localStorage.getItem('gurubit_support_session')) return false;
    const until = parseInt(localStorage.getItem('gurubit_support_teaser_until') || '0', 10);
    if (until && Date.now() < until) return false;
    return true;
  }



  connectWs() {

    if (this.ws) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.sessionId) {
        this.ws.send(JSON.stringify({ type: 'support_visitor_join', sessionId: this.sessionId }));
      }
    };

    this.ws.onmessage = (ev) => {

      try {

        const data = JSON.parse(ev.data);

        if (data.type === 'support_message' && data.sessionId === this.sessionId) {

          const msg = data.message;

          const last = this.messages[this.messages.length - 1];

          if (msg.from === 'visitor' && last?.id?.startsWith('local_') && last.text === msg.text) {

            this.messages[this.messages.length - 1] = msg;

          } else if (!this.messages.some((m) => m.id === msg.id)) {
            const dupImg = msg.imageUrl && this.messages.some(
              (m) => m.imageUrl === msg.imageUrl && m.from === msg.from
            );
            if (!dupImg) this.messages.push(msg);
          }

          if (msg.from === 'admin' && !this.open) {
            this.hasUnread = true;
            showToast('Support replied — open chat');
          }

          this.render();

        }

      } catch {}

    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const baseDelay = Math.min(this.reconnectDelay * Math.pow(this.reconnectMultiplier || 2, this.reconnectAttempts - 1), 120000);
        const jitter = Math.floor(Math.random() * Math.min(5000, Math.floor(baseDelay * 0.2)));
        const delay = baseDelay + jitter;
        setTimeout(() => this.connectWs(), delay);
      }
    };

  }



  sendWs(text, imageUrl = null) {
    if (!this.ws || this.ws.readyState !== 1) this.connectWs();
    const payload = { type: 'support_send', sessionId: this.sessionId, text: text || '', imageUrl };
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(payload));
    else this.ws.addEventListener('open', () => this.ws.send(JSON.stringify(payload)), { once: true });
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async postMessage(text, imageUrl = null) {
    if (!this.sessionId) return;
    if (!text?.trim() && !imageUrl) return;
    const res = await fetch(`/api/support/session/${this.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || '', imageData: imageUrl })
    });
    const data = await res.json();
    if (data.success && data.message) {
      const i = this.messages.findIndex((m) => m.id?.startsWith('local_'));
      if (i >= 0) this.messages[i] = data.message;
      else if (!this.messages.some((m) => m.id === data.message.id)) this.messages.push(data.message);
      this.render();
    }
  }

  async deleteMessage(msgId) {
    if (!this.sessionId || !msgId) return;
    const res = await fetch(`/api/support/session/${this.sessionId}/messages/${msgId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      this.messages = this.messages.filter((m) => m.id !== msgId);
      this.render();
      showToast('Message deleted');
    }
  }



  async startChat() {

    let name, email;

    if (this.loggedInUser) {
      name = this.loggedInUser.name || this.loggedInUser.displayName || '';
      email = this.loggedInUser.email || '';
    } else {
      name = document.getElementById('supportName')?.value?.trim();
      email = document.getElementById('supportEmail')?.value?.trim();
      if (!name || !email) return;
    }

    this.visitor = { name, email };

    const res = await fetch('/api/support/start', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ name, email })

    });

    const data = await res.json();

    if (!res.ok) {

      alert(data.error?.message || 'Could not start chat');

      return;

    }



    this.sessionId = data.session.id;

    localStorage.setItem('gurubit_support_session', this.sessionId);
    localStorage.setItem('gurubit_support_has_chatted', '1');

    this.messages = data.messages || [];

    this.view = 'chat';

    this.connectWs();

    this.render();

  }



  async sendMessage() {

    const input = document.getElementById('supportChatInput');

    const text = input?.value?.trim();

    if (!text || !this.sessionId) return;



    const optimistic = {

      id: `local_${Date.now()}`,

      from: 'visitor',

      text,

      createdAt: new Date().toISOString()

    };

    this.messages.push(optimistic);

    input.value = '';

    this.render();
    this.postMessage(text).catch(() => {});
  }

  async sendImage(file) {
    if (!file || !this.sessionId) return;
    const imageUrl = await this.fileToDataUrl(file);
    const optimistic = {
      id: `local_${Date.now()}`,
      from: 'visitor',
      text: '',
      imageUrl,
      createdAt: new Date().toISOString()
    };
    this.messages.push(optimistic);
    this.render();
    await this.postMessage('', imageUrl);
  }

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.hasUnread = false;
      this.view = this.sessionId ? 'chat' : 'start';
      if (this.sessionId) this.connectWs();
    }
    this.render();
  }



  render() {

    let root = document.getElementById('liveSupportRoot');

    if (!root) {

      root = document.createElement('div');

      root.id = 'liveSupportRoot';

      document.body.appendChild(root);

    }



    const teaser = this.shouldShowTeaser() ? `

      <div class="support-teaser" id="supportTeaser">

        <button type="button" class="support-teaser-close" id="supportTeaserClose" aria-label="Close">×</button>

        <div class="support-teaser-inner">

          <img src="/assets/logo-icon.svg" alt="" class="w-8 h-8">

          <div>

            <p class="font-bold text-sm text-gray-900">GURUBIT Support</p>

            <p class="text-xs text-gray-600">👋 Hi! Need help? We're online.</p>

          </div>

        </div>

      </div>

    ` : '';



    const panel = this.open ? `

      <div class="support-panel glass-card">

        <div class="support-panel-header">

          <div class="flex items-center gap-3">

            <img src="/assets/logo-icon.svg" alt="" class="w-9 h-9">

            <div>

              <p class="font-black text-sm text-white">GURUBIT Support</p>

              <p class="text-[10px] text-primary font-bold"><span class="support-dot"></span> Online · Powered by Riyad Al Mamun</p>

            </div>

          </div>

          <div class="flex gap-2">

            <button type="button" class="support-icon-btn" id="supportMinimize" title="Minimize">−</button>

            <button type="button" class="support-icon-btn" id="supportClose" title="Close">×</button>

          </div>

        </div>

        <div class="support-panel-body">

          ${this.view === 'start' ? this.renderStart() : this.renderChat()}

        </div>

        <p class="support-powered">Powered by <strong>GURUBIT</strong></p>

      </div>

    ` : '';



    root.innerHTML = `

      <div class="live-support-wrap">

        ${teaser}

        ${panel}

        <button type="button" class="support-fab ${this.open ? 'is-open' : ''} ${this.hasUnread ? 'has-reply' : ''}" id="supportFab" aria-label="Live support">

          <i class="fas ${this.open ? 'fa-times' : 'fa-comment-dots'}"></i>

        </button>

      </div>

    `;



    document.getElementById('supportFab')?.addEventListener('click', () => this.toggle());

    document.getElementById('supportClose')?.addEventListener('click', () => this.toggle());

    document.getElementById('supportMinimize')?.addEventListener('click', () => this.toggle());

    document.getElementById('supportTeaser')?.addEventListener('click', () => {

      this.open = true;

      this.view = this.sessionId ? 'chat' : 'start';

      this.render();

    });

    document.getElementById('supportTeaserClose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem('gurubit_support_teaser_until', String(Date.now() + 2 * 60 * 60 * 1000));
      document.getElementById('supportTeaser')?.remove();
    });

    document.getElementById('supportStartBtn')?.addEventListener('click', () => this.startChat());

    document.getElementById('supportSendBtn')?.addEventListener('click', () => this.sendMessage());
    document.getElementById('supportChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.sendMessage(); }
    });
    document.getElementById('supportImageBtn')?.addEventListener('click', () => {
      document.getElementById('supportImageInput')?.click();
    });
    document.getElementById('supportImageInput')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) this.sendImage(f);
      e.target.value = '';
    });
    document.getElementById('supportCloseChatBtn')?.addEventListener('click', () => this.closeChat());
    if (this.view === 'chat') {

      const box = document.getElementById('supportMessages');

      if (box) box.scrollTop = box.scrollHeight;

    }

  }



  renderStart() {

    if (this.loggedInUser) {
      const displayName = this.loggedInUser.name || this.loggedInUser.displayName || 'there';
      return `
        <div class="support-start">
          <h3 class="text-xl font-black text-gray-900 mb-1">Hi ${displayName} 👋</h3>
          <p class="text-gray-600 text-sm mb-6">How can we help you today?</p>
          <button type="button" id="supportStartBtn" class="neon-btn w-full py-3 text-xs uppercase tracking-widest mt-2">Start Chat →</button>
        </div>`;
    }

    return `

      <div class="support-start">

        <h3 class="text-xl font-black text-gray-900 mb-1">Hi there 👋</h3>

        <p class="text-gray-600 text-sm mb-6">How can we help you today?</p>

        <input type="text" id="supportName" class="support-input" placeholder="Your name" value="${this.visitor.name}">

        <input type="email" id="supportEmail" class="support-input" placeholder="Your email" value="${this.visitor.email}">

        <button type="button" id="supportStartBtn" class="neon-btn w-full py-3 text-xs uppercase tracking-widest mt-2">Start Chat →</button>

      </div>`;

  }



  renderChat() {

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const msgs = this.messages.map((m) => {

      const isVisitor = m.from === 'visitor';

      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `

        <div class="support-msg ${isVisitor ? 'support-msg-visitor' : 'support-msg-admin'}">

          ${!isVisitor ? '<img src="/assets/logo-icon.svg" alt="" class="support-msg-avatar">' : ''}

          <div class="support-msg-bubble" style="word-break:break-word;overflow-wrap:anywhere;min-width:0;max-width:80%">

            ${m.imageUrl ? `<img src="${m.imageUrl}" alt="" class="support-msg-image rounded-lg max-w-full mb-1">` : ''}
            ${m.text ? `<p>${esc(m.text)}</p>` : ''}
            <span class="support-msg-time">${time}</span>

          </div>
        </div>`;

    }).join('');



    return `

      <div class="support-chat">

        <div class="support-date">Today</div>

        <div class="support-chat-actions" style="display:flex;justify-content:flex-end;padding:4px 8px;">
          <button type="button" id="supportCloseChatBtn" style="font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;cursor:pointer;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;" title="End this chat session">Close ✕</button>
        </div>

        <div id="supportMessages" class="support-messages" style="min-width:0;overflow-x:hidden">${msgs}</div>

        <div class="support-compose">
          <button type="button" id="supportImageBtn" class="support-attach-btn" title="Send screenshot"><i class="fas fa-image"></i></button>
          <input type="file" id="supportImageInput" accept="image/*" class="hidden">
          <input type="text" id="supportChatInput" class="support-input flex-1" placeholder="Type a message...">
          <button type="button" id="supportSendBtn" class="support-send-btn"><i class="fas fa-paper-plane"></i></button>
        </div>

      </div>`;

  }

  async closeChat() {
    if (!this.sessionId) return;
    try {
      await fetch(`/api/support/session/${this.sessionId}/close`, { method: 'DELETE' });
    } catch {}
    localStorage.removeItem('gurubit_support_session');
    this.sessionId = null;
    this.messages = [];
    this.view = 'start';
    this.open = false;
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.render();
  }



  async init() {

    // Fetch current user session for auto-fill
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.loggedInUser = data.user;
        }
      }
    } catch {}

    if (this.sessionId) {
      localStorage.setItem('gurubit_support_has_chatted', '1');
      fetch(`/api/support/session/${this.sessionId}/messages`)

        .then((r) => r.json())

        .then((d) => {

          if (d.success) {

            this.messages = d.messages;

            this.view = 'chat';

          } else {

            localStorage.removeItem('gurubit_support_session');

            this.sessionId = null;

          }

          this.render();

        })

        .catch(() => this.render());

    } else {

      this.render();

    }

  }
}


