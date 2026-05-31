/**
 * Groups — Gate.io style: My Groups + Discover + Announcements
 */

import { UserLayout } from '../utils/UserLayout.js';

export class GroupsPage {
  constructor() {
    this.user = null;
    this.groups = [];
    this.announcements = [];
    this.myGroupIds = new Set();
    this.activeGroup = null;   // null = list view, string = chat view
    this.groupMessages = [];
    this.pendingImagePreview = null;
    this.tab = 'chat';         // chat | announcements (inside group)
    this.mainTab = 'groups';   // groups | announcements (top level)
  }

  esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : `${d}d ago`;
  }

  async loadGroups() {
    const data = await fetch('/api/social/groups').then((r) => r.json());
    if (data.success) {
      this.groups = data.groups;
      this.myGroupIds = new Set(data.myGroupIds || []);
    }
  }

  async loadAnnouncements() {
    const data = await fetch('/api/social/announcements').then((r) => r.json()).catch(() => ({}));
    if (data.success) this.announcements = data.announcements || [];
  }

  async loadMessages() {
    if (!this.activeGroup) return;
    const data = await fetch(`/api/social/groups/${this.activeGroup}/messages`).then((r) => r.json());
    if (data.success) this.groupMessages = data.messages;
  }

  async joinGroup(id) {
    const res = await fetch(`/api/social/groups/${id}/join`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      this.myGroupIds.add(id);
      this.render();
      // Show success toast
      const g = this.groups.find(x => x.id === id);
      this._showToast(`✅ You joined "${g?.name || 'the group'}" successfully!`);
    }
    else this._showToast('❌ ' + (data.error?.message || 'Failed to join'), 'error');
  }

  _showToast(msg, type = 'success') {
    const colors = {
      success: 'linear-gradient(135deg,#00d2ff,#3a7bd5)',
      error: 'linear-gradient(135deg,#ef4444,#dc2626)'
    };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:${colors[type] || colors.success};color:#020b18;font-weight:800;font-size:.82rem;padding:.7rem 1.6rem;border-radius:9999px;opacity:0;pointer-events:none;transition:all .3s cubic-bezier(.4,0,.2,1);z-index:9999;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90vw;text-align:center;`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }

  async leaveGroup(id) {
    if (!confirm('Leave this group?')) return;
    const res = await fetch(`/api/social/groups/${id}/leave`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { this.myGroupIds.delete(id); if (this.activeGroup === id) this.activeGroup = null; this.render(); }
  }

  async sendMsg() {
    const text = document.getElementById('groupMsgInput')?.value?.trim() || '';
    const file = document.getElementById('groupImage')?.files?.[0];
    let imageData = null;
    if (file) {
      imageData = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
      });
    }
    if (!text && !imageData) return;

    const res = await fetch(`/api/social/groups/${this.activeGroup}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, imageData })
    });
    const data = await res.json();
    if (!data.success) {
      if (data.error?.code === 'LINK_DETECTED' || data.error?.message?.toLowerCase().includes('link')) {
        this.showLinkWarning();
      } else {
        alert(data.error?.message || 'Failed');
      }
      return;
    }
    document.getElementById('groupMsgInput').value = '';
    this.pendingImagePreview = null;
    // Clear image input
    const imgInput = document.getElementById('groupImage');
    if (imgInput) imgInput.value = '';
    await this.loadMessages();
    this.renderChat();
  }

  showLinkWarning() {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80';
    m.innerHTML = `
      <div class="glass-card max-w-sm w-full p-6 text-center" style="animation:fadeIn .2s ease">
        <div class="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-ban text-2xl text-red-400"></i>
        </div>
        <h3 class="font-black text-white text-lg mb-2">⚠️ Link Detected</h3>
        <p class="text-sm text-gray-300 mb-3">Sharing links (Telegram, websites, etc.) is strictly prohibited in groups.</p>
        <p class="text-xs text-gray-500 mb-5">Your message has been blocked. Repeated violations will result in a group ban.</p>
        <button type="button" id="warnOk" class="neon-btn w-full py-3 text-sm uppercase">I Understand</button>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#warnOk')?.addEventListener('click', () => m.remove());
  }

  // ── Render: Group list view ──────────────────────────────────────
  renderGroupList() {
    const myGroups = this.groups.filter((g) => this.myGroupIds.has(g.id));
    const discover = this.groups.filter((g) => !this.myGroupIds.has(g.id));

    return `
      <div class="max-w-2xl mx-auto">
        <!-- Top tabs -->
        <div class="flex border-b border-white/10 mb-0 sticky top-[57px] z-30 bg-dark">
          <button type="button" data-main-tab="groups" class="flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 ${this.mainTab === 'groups' ? 'text-primary border-primary' : 'text-gray-500 border-transparent'}">Groups</button>
          <button type="button" data-main-tab="announcements" class="flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 ${this.mainTab === 'announcements' ? 'text-primary border-primary' : 'text-gray-500 border-transparent'}">Announcements</button>
          <a href="/post" class="flex items-center px-4 text-xs text-gray-500 hover:text-primary border-b-2 border-transparent">
            <i class="fas fa-arrow-left mr-1"></i> Feed
          </a>
        </div>

        ${this.mainTab === 'announcements' ? this.renderAnnouncements() : `
          <!-- My Groups -->
          ${myGroups.length ? `
            <div class="px-4 pt-5 pb-2">
              <p class="text-xs font-black text-gray-400 uppercase tracking-widest">My Groups</p>
            </div>
            ${myGroups.map((g) => this.renderGroupRow(g, true)).join('')}
          ` : ''}

          <!-- Discover -->
          <div class="px-4 pt-5 pb-2 flex items-center justify-between">
            <p class="text-xs font-black text-gray-400 uppercase tracking-widest">Groups You Might Like</p>
          </div>
          ${discover.length
            ? discover.map((g) => this.renderGroupRow(g, false)).join('')
            : '<p class="text-center text-gray-600 text-sm py-8">No groups available</p>'}
        `}
      </div>`;
  }

  renderGroupRow(g, isMember) {
    const lastMsg = g.lastMessage || '';
    return `
      <div class="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer group-row" data-gid="${g.id}">
        <!-- Avatar -->
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/20 flex items-center justify-center text-primary font-black text-lg shrink-0 border border-white/10">
          ${g.icon ? `<img src="${g.icon}" class="w-full h-full rounded-2xl object-cover">` : (g.name || 'G').charAt(0).toUpperCase()}
        </div>
        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <p class="font-bold text-white text-sm truncate">${this.esc(g.name)}</p>
            ${g.lastMessageAt ? `<span class="text-[10px] text-gray-500 shrink-0">${this.timeAgo(g.lastMessageAt)}</span>` : ''}
          </div>
          <p class="text-xs text-gray-500 truncate mt-0.5">${lastMsg ? this.esc(lastMsg) : `${g.memberCount || 0} members`}</p>
        </div>
        <!-- Action -->
        <div class="shrink-0">
          ${isMember
            ? `<span class="text-[10px] text-primary font-bold bg-primary/10 px-2 py-1 rounded-full">${g.unread ? `${g.unread}+` : 'Open'}</span>`
            : `<button type="button" class="join-btn px-3 py-1.5 rounded-full border border-primary text-primary text-xs font-bold hover:bg-primary hover:text-dark transition-all" data-gid="${g.id}">Join</button>`}
        </div>
      </div>`;
  }

  renderAnnouncements() {
    if (!this.announcements.length) {
      return '<p class="text-center text-gray-600 text-sm py-12">No announcements yet</p>';
    }
    return this.announcements.map((a) => `
      <div class="px-4 py-4 border-b border-white/5">
        <div class="flex items-start gap-2 mb-1">
          <span class="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">TOP</span>
          <p class="font-bold text-white text-sm leading-snug">${this.esc(a.title)}</p>
        </div>
        <p class="text-xs text-gray-400 leading-relaxed mb-2">${this.esc(a.body || '')}</p>
        <p class="text-[10px] text-gray-600">${this.timeAgo(a.createdAt)}</p>
      </div>
    `).join('');
  }

  // ── Render: Chat view ────────────────────────────────────────────
  renderChat() {
    const g = this.groups.find((x) => x.id === this.activeGroup);
    const app = document.getElementById('app');
    if (!app) return;

    // Build same mobile bottom nav as UserLayout for consistency
    const { USER_NAV } = { USER_NAV: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
      { id: 'numbers',   label: 'Number',    href: '/numbers',   icon: 'mobile-alt' },
      { id: 'live-feed', label: 'Live SMS',  href: '/live-feed', icon: 'satellite-dish' },
      { id: 'post',      label: 'Movement',  href: '/post',      icon: 'bolt' }
    ]};

    const chatHtml = `
      <div class="flex flex-col h-screen bg-dark" id="groupChatView">
        <!-- Header — same style as UserLayout topbar -->
        <header class="flex items-center gap-3 px-4 py-3 border-b border-white/10 sticky top-0 z-30"
                style="background:rgba(2,11,24,0.92);backdrop-filter:blur(16px);">
          <button type="button" id="backToGroups" class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all shrink-0">
            <i class="fas fa-arrow-left text-sm"></i>
          </button>
          <div class="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-black shrink-0">
            ${(g?.name || 'G').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-white text-sm truncate">${this.esc(g?.name || 'Group')}</p>
            <p class="text-[10px] text-gray-500">${g?.memberCount || 0} members · ${g?.activeCount || 0} online</p>
          </div>
          <button type="button" id="leaveGroupBtn" class="text-xs text-red-400 font-bold uppercase hover:text-red-300 transition-all px-2 py-1 rounded-lg hover:bg-red-500/10">Leave</button>
        </header>

        <!-- Messages -->
        <div id="groupMsgBox" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-4">
          ${this.groupMessages.length
            ? this.groupMessages.map((m) => this.renderMessage(m)).join('')
            : '<p class="text-center text-gray-600 text-sm py-8">No messages yet. Say hello!</p>'}
        </div>

        <!-- Image preview -->
        ${this.pendingImagePreview ? `
          <div class="px-4 pb-2">
            <div class="relative inline-block">
              <img src="${this.pendingImagePreview}" class="rounded-xl max-h-24 border border-white/10">
              <button type="button" id="removeGroupImg" class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">&times;</button>
            </div>
          </div>` : ''}

        <!-- Input -->
        <div class="px-3 py-3 border-t border-white/10 flex items-end gap-2" style="background:rgba(2,11,24,0.92);">
          <label class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 cursor-pointer text-gray-400 hover:text-primary transition-all shrink-0">
            <i class="fas fa-image text-sm"></i>
            <input type="file" id="groupImage" accept="image/*" class="hidden">
          </label>
          <input id="groupMsgInput" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary/50 transition-all" placeholder="Let's chat...">
          <button type="button" id="groupSendBtn" class="w-9 h-9 rounded-xl bg-primary text-dark flex items-center justify-center shrink-0 hover:scale-105 transition-transform">
            <i class="fas fa-paper-plane text-sm"></i>
          </button>
        </div>

        <!-- Mobile bottom nav — same as UserLayout -->
        <nav class="mobile-bottom-nav md:hidden" style="position:relative;bottom:auto;">
          <a href="/dashboard" class="mobile-nav-item"><i class="fas fa-home mobile-nav-icon"></i><span class="mobile-nav-label">Dashboard</span></a>
          <a href="/numbers" class="mobile-nav-item"><i class="fas fa-mobile-alt mobile-nav-icon"></i><span class="mobile-nav-label">Number</span></a>
          <a href="/live-feed" class="mobile-nav-item"><i class="fas fa-satellite-dish mobile-nav-icon"></i><span class="mobile-nav-label">Live SMS</span></a>
          <a href="/post" class="mobile-nav-item is-active"><i class="fas fa-bolt mobile-nav-icon"></i><span class="mobile-nav-label">Movement</span></a>
        </nav>
      </div>`;

    // Replace app content directly for full-screen chat
    document.getElementById('app-skeleton')?.remove();
    app.innerHTML = chatHtml;
    this._bindChatEvents();

    // Scroll to bottom
    const box = document.getElementById('groupMsgBox');
    if (box) box.scrollTop = box.scrollHeight;
  }

  renderMessage(m) {
    const isOwn = m.userId === this.user?.id;
    return `
      <div class="flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}">
        ${!isOwn ? `
          <div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            ${(m.userName || '?').charAt(0).toUpperCase()}
          </div>` : ''}
        <div class="max-w-[75%]">
          ${!isOwn ? `<p class="text-[10px] text-primary font-bold mb-1 ml-1">${this.esc(m.userName)}</p>` : ''}
          <div class="rounded-2xl px-3 py-2 ${isOwn ? 'bg-primary text-dark rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}">
            ${m.imageUrl ? `<img src="${m.imageUrl}" class="rounded-xl max-h-48 mb-1 w-full object-cover" loading="lazy" style="display:block;">` : ''}
            ${m.text ? `<p class="text-sm leading-relaxed">${this.esc(m.text)}</p>` : ''}
          </div>
          <p class="text-[9px] text-gray-600 mt-1 ${isOwn ? 'text-right' : 'ml-1'}">${this.timeAgo(m.createdAt)}</p>
        </div>
      </div>`;
  }

  render() {
    UserLayout.renderShell({
      activeId: 'groups',
      title: 'Movement',
      bodyHtml: this.renderGroupList(),
      user: this.user
    });
    this._bindListEvents();
  }

  _bindListEvents() {
    document.querySelectorAll('[data-main-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { this.mainTab = btn.dataset.mainTab; this.render(); });
    });
    document.querySelectorAll('.group-row').forEach((row) => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('.join-btn')) return;
        const gid = row.dataset.gid;
        if (!this.myGroupIds.has(gid)) return;
        this.activeGroup = gid;
        await this.loadMessages();
        this.renderChat();
      });
    });
    document.querySelectorAll('.join-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.joinGroup(btn.dataset.gid); });
    });
  }

  _bindChatEvents() {
    document.getElementById('backToGroups')?.addEventListener('click', () => {
      this.activeGroup = null;
      this.render();
    });
    document.getElementById('leaveGroupBtn')?.addEventListener('click', () => this.leaveGroup(this.activeGroup));
    document.getElementById('groupSendBtn')?.addEventListener('click', () => this.sendMsg());
    document.getElementById('groupMsgInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMsg(); }
    });
    document.getElementById('groupImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      this.pendingImagePreview = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
      });
      this.renderChat();
    });
    document.getElementById('removeGroupImg')?.addEventListener('click', () => {
      this.pendingImagePreview = null;
      this.renderChat();
    });
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    // Render shell immediately — data loads in background
    this.render();
    await Promise.all([this.loadGroups(), this.loadAnnouncements()]);
    this.render();
  }
}
