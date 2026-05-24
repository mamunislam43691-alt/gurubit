/**

 * Admin Live Support Inbox — reply to visitor chats

 */



import { AdminLayout } from './AdminLayout.js';
import { showToast } from '../utils/uiHelpers.js';



export class AdminSupport {

  constructor() {

    this.sessions = [];

    this.activeId = null;

    this.messages = [];

    this.ws = null;

    this.admin = null;

    this.staff = [];
    
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 60;
    this.reconnectDelay = 5000;
    this.reconnectMultiplier = 2;

  }



  esc(s) {

    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  }



  connectWs() {

    if (this.ws) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.ws.send(JSON.stringify({ type: 'support_admin_join' }));

    };

    this.ws.onmessage = (ev) => {

      try {

        const data = JSON.parse(ev.data);

        if (data.type === 'support_admin_ready') {

          this.sessions = data.sessions || [];

          this.renderPage();

        }

        if (data.type === 'support_session_new' && data.session) {

          const exists = this.sessions.some((s) => s.id === data.session.id);

          if (!exists) this.sessions.unshift(data.session);

          else this.upsertSession(data.session);

          this.renderPage();

        }

        if (data.type === 'support_message') {

          this.upsertSession(data.session);

          if (data.sessionId === this.activeId) {

            if (!this.messages.some((m) => m.id === data.message.id)) {

              this.messages.push(data.message);

            }

            this.renderChat();

          } else {

            this.renderPage();

          }

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



  upsertSession(session) {

    if (!session) return;

    const i = this.sessions.findIndex((s) => s.id === session.id);

    if (i >= 0) this.sessions[i] = session;

    else this.sessions.unshift(session);

    this.sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  }



  async loadStaff() {
    try {
      const res = await fetch('/api/support/admin/staff-list');
      const data = await res.json();
      if (data.success) this.staff = data.staff || [];
    } catch {}
  }

  async transferChat(toUsername) {
    if (!toUsername || !this.activeId) return;
    const res = await fetch(`/api/support/admin/sessions/${this.activeId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUsername })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Transferred to ${toUsername}`);
      const filter = this.admin?.role === 'supporter' ? this.admin.username : null;
      if (filter && filter !== toUsername) {
        this.sessions = this.sessions.filter((s) => s.id !== this.activeId);
        this.activeId = null;
        this.messages = [];
      } else {
        this.upsertSession(data.session);
      }
      this.renderPage();
    } else {
      alert(data.error?.message || 'Transfer failed');
    }
  }

  async loadSessions() {

    try {

      const res = await fetch('/api/support/admin/sessions');

      const data = await res.json();

      if (res.status === 401) {

        window.location.href = '/admin';

        return;

      }

      if (data.success) this.sessions = data.sessions;

    } catch (e) {

      console.error('Failed to load support sessions', e);

    }

  }



  async selectSession(id) {

    this.activeId = id;

    try {

      const res = await fetch(`/api/support/admin/sessions/${id}/messages`);

      const data = await res.json();

      if (data.success) {

        this.messages = data.messages;

        this.upsertSession(data.session);

      }

    } catch (e) {

      console.error('Failed to load messages', e);

    }

    this.renderPage();

  }



  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async deleteMessage(msgId) {
    if (!this.activeId || !msgId) return;
    const res = await fetch(`/api/support/admin/sessions/${this.activeId}/messages/${msgId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      this.messages = this.messages.filter((m) => m.id !== msgId);
      this.renderChat();
      showToast('Message deleted');
    }
  }

  async sendReply(imageData = null) {
    const input = document.getElementById('adminSupportInput');
    const text = input?.value?.trim() || '';
    if ((!text && !imageData) || !this.activeId) return;

    try {
      const res = await fetch(`/api/support/admin/sessions/${this.activeId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageData })
      });

      const data = await res.json();

      if (data.success) {

        if (!this.messages.some((m) => m.id === data.message.id)) {

          this.messages.push(data.message);

        }

        input.value = '';

        this.renderChat();

      }

    } catch (e) {

      console.error('Reply failed', e);

    }

  }



  renderSessionList() {

    if (!this.sessions.length) {

      return '<p class="text-gray-500 text-sm p-6">No conversations yet.</p>';

    }

    return this.sessions.map((s) => {

      const active = s.id === this.activeId;

      const unread = s.unreadAdmin > 0;

      const preview = this.esc(s.lastMessage || 'New conversation');

      return `

        <button type="button" data-session-id="${s.id}" class="w-full text-left px-4 py-4 border-b border-gray-800 hover:bg-black/30 ${active ? 'bg-primary/10 border-l-2 border-l-primary' : ''}">

          <motion.div class="flex justify-between gap-2">

            <div class="min-w-0">

              <p class="font-bold text-white text-sm truncate">${this.esc(s.visitorName)}</p>

              <p class="text-[10px] text-gray-500 truncate">${this.esc(s.visitorEmail)}</p>

              <p class="text-xs text-gray-400 mt-1 truncate">${preview}</p>

            </div>

            ${unread ? `<span class="bg-primary text-dark text-[10px] font-black px-2 py-0.5 rounded-full">${s.unreadAdmin}</span>` : ''}

          </motion.div>

        </button>`;

    }).join('').replaceAll('<motion.', '<').replaceAll('</motion.', '</');

  }



  renderChat() {

    const box = document.getElementById('adminSupportMessages');

    if (!box) return;

    if (!this.activeId) {

      box.innerHTML = '<p class="text-gray-500 text-center py-20">Select a conversation</p>';

      return;

    }

    box.innerHTML = this.messages.map((m) => {
      const isAdmin = m.from === 'admin';
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const img = m.imageUrl ? `<img src="${m.imageUrl}" class="rounded-lg max-w-full mb-2 max-h-48 object-cover">` : '';
      const txt = m.text ? `<p class="text-sm">${this.esc(m.text)}</p>` : '';
      return `
        <div class="flex ${isAdmin ? 'justify-end' : 'justify-start'} mb-3 group">
          <div class="max-w-[80%] rounded-2xl px-4 py-2 relative ${isAdmin ? 'bg-primary text-dark' : 'bg-black/30 border border-gray-800'}">
            ${img}${txt}
            <p class="text-[10px] opacity-60 mt-1 text-right">${time}</p>
            <button type="button" data-admin-del="${m.id}" class="support-admin-del opacity-0 group-hover:opacity-100" title="Delete">×</button>
          </div>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-admin-del]').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteMessage(btn.dataset.adminDel));
    });

    box.scrollTop = box.scrollHeight;

  }



  renderBody() {

    const active = this.sessions.find((s) => s.id === this.activeId);

    return `

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div class="lg:col-span-1 bg-[#0a1e3b] rounded-2xl border border-gray-800 flex flex-col max-h-[65vh]">

          <div class="px-4 py-3 border-b border-gray-800">

            <p class="stat-label">Inbox</p>

            <p class="text-white font-bold text-sm">${this.sessions.length} chat(s)</p>

          </div>

          <div class="flex-1 overflow-y-auto" id="adminSupportList">${this.renderSessionList()}</div>

        </div>

        <div class="lg:col-span-2 bg-[#0a1e3b] rounded-2xl border border-gray-800 flex flex-col max-h-[65vh]">

          <div class="px-5 py-4 border-b border-gray-800">

            ${active ? `
              <p class="font-bold text-white">${this.esc(active.visitorName)}</p>
              <p class="text-xs text-gray-500">${this.esc(active.visitorEmail)}</p>
              <p class="text-[10px] text-primary mt-1">Assigned: ${this.esc(active.assignedTo || 'unassigned')}</p>
              <div class="flex gap-2 mt-3 flex-wrap items-center">
                <button type="button" id="supportTransferBtn" class="neon-btn px-4 py-2 text-[10px] uppercase">Transfer</button>
                ${this.staff.map((s) => `
                  <button type="button" data-transfer="${this.esc(s.username)}" class="transfer-chip">${this.esc(s.displayName || s.username)}</button>
                `).join('')}
              </div>
            ` : '<p class="text-gray-500 text-sm">Select a chat</p>'}

          </div>

          <div id="adminSupportMessages" class="flex-1 overflow-y-auto p-4"></div>

          <div class="p-4 border-t border-gray-800 flex gap-2 items-center">
            <button type="button" id="adminSupportImageBtn" class="support-attach-btn" ${!this.activeId ? 'disabled' : ''} title="Attach image"><i class="fas fa-image"></i></button>
            <input type="file" id="adminSupportImageInput" accept="image/*" class="hidden">
            <input type="text" id="adminSupportInput" class="input-field flex-1" placeholder="Type your reply..." ${!this.activeId ? 'disabled' : ''}>
            <button type="button" id="adminSupportSend" class="neon-btn px-6 py-3 text-xs uppercase" ${!this.activeId ? 'disabled' : ''}>Send</button>
          </div>

        </div>

      </div>

    `;

  }



  renderPage() {

    AdminLayout.renderShell({

      activeId: 'support',

      title: 'Live Support',

      subtitle: 'Reply to website visitors',

      bodyHtml: this.renderBody(),

      admin: this.admin

    });

    document.querySelectorAll('[data-session-id]').forEach((btn) => {

      btn.addEventListener('click', () => this.selectSession(btn.dataset.sessionId));

    });

    document.getElementById('adminSupportSend')?.addEventListener('click', () => this.sendReply());
    document.getElementById('adminSupportInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.sendReply(); }
    });
    document.getElementById('adminSupportImageBtn')?.addEventListener('click', () => {
      document.getElementById('adminSupportImageInput')?.click();
    });
    document.getElementById('adminSupportImageInput')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (f) await this.sendReply(await this.fileToDataUrl(f));
      e.target.value = '';
    });

    document.getElementById('supportTransferBtn')?.addEventListener('click', () => {
      const username = prompt('Transfer to supporter username:');
      if (username?.trim()) this.transferChat(username.trim());
    });
    document.querySelectorAll('[data-transfer]').forEach((btn) => {
      btn.addEventListener('click', () => this.transferChat(btn.dataset.transfer));
    });

    this.renderChat();

  }



  async init() {

    this.admin = await AdminLayout.ensureAuth();

    if (!this.admin) return;

    await this.loadStaff();

    await this.loadSessions();

    this.connectWs();

    this.renderPage();

  }

}


