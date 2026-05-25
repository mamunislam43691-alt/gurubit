/**
 * Admin Movement — posts, groups, announcements & moderation
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminGuru {
  constructor() {
    this.posts = [];
    this.groups = [];
    this.announcements = [];
    this.settings = {};
    this.admin = null;
    this.tab = 'posts'; // posts | groups | announcements | ai
  }

  esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async load() {
    const [postsRes, annRes] = await Promise.all([
      fetch('/api/admin/guru/posts').then((r) => r.json()),
      fetch('/api/social/announcements').then((r) => r.json()).catch(() => ({}))
    ]);
    if (postsRes.success) {
      this.posts = postsRes.posts;
      this.groups = postsRes.groups;
      this.settings = postsRes.settings;
    }
    if (annRes.success) this.announcements = annRes.announcements || [];
    this.render();
  }

  async deletePost(id) {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/admin/guru/posts/${id}`, { method: 'DELETE' });
    await this.load();
  }

  async promote(id) {
    await fetch(`/api/admin/guru/posts/${id}/promote`, { method: 'POST' });
    await this.load();
  }

  async suspendUser(userId) {
    if (!confirm('Suspend this user for 4 days?')) return;
    await fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 4 })
    });
    alert('User suspended');
  }

  async banUser(userId) {
    if (!confirm('Ban this user permanently?')) return;
    await fetch(`/api/admin/users/${userId}/ban`, { method: 'PUT' });
    alert('User banned');
  }

  fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    });
  }

  async adminPost() {
    const text = document.getElementById('adminPostText')?.value?.trim();
    const link = document.getElementById('adminPostLink')?.value?.trim();
    const file = document.getElementById('adminPostImage')?.files?.[0];
    let imageData = null;
    if (file) imageData = await this.fileToDataUrl(file);
    if (!text && !imageData) return alert('Post cannot be empty');
    const res = await fetch('/api/admin/guru/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, link, imageData, isAdminPost: true })
    });
    const data = await res.json();
    if (data.success) { document.getElementById('adminPostText').value = ''; await this.load(); }
    else alert(data.error?.message || 'Failed');
  }

  async createGroup() {
    const name = document.getElementById('newGroupName')?.value?.trim();
    const desc = document.getElementById('newGroupDesc')?.value?.trim();
    if (!name) return alert('Group name required');
    const res = await fetch('/api/admin/guru/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('newGroupName').value = '';
      document.getElementById('newGroupDesc').value = '';
      await this.load();
    } else alert(data.error?.message || 'Failed');
  }

  async deleteGroup(id) {
    if (!confirm('Delete this group and all its messages?')) return;
    await fetch(`/api/admin/guru/groups/${id}`, { method: 'DELETE' });
    await this.load();
  }

  async createAnnouncement() {
    const title = document.getElementById('annTitle')?.value?.trim();
    const body = document.getElementById('annBody')?.value?.trim();
    if (!title) return alert('Title required');
    const res = await fetch('/api/social/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('annTitle').value = '';
      document.getElementById('annBody').value = '';
      await this.load();
    } else alert(data.error?.message || 'Failed');
  }

  async deleteAnnouncement(id) {
    await fetch(`/api/social/announcements/${id}`, { method: 'DELETE' });
    await this.load();
  }

  async saveAi() {
    const aiApiKey = document.getElementById('aiApiKey')?.value || '';
    const aiEnabled = document.getElementById('aiEnabled')?.checked;
    const aiApiUrl = document.getElementById('aiApiUrl')?.value || '';
    const aiModel = document.getElementById('aiModel')?.value || '';
    await fetch('/api/admin/guru/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiApiKey, aiEnabled, aiApiUrl, aiModel })
    });
    await this.load();
  }

  renderPosts() {
    return `
      <!-- Admin post composer -->
      <div class="glass-card p-5 mb-5">
        <h4 class="font-black text-white text-sm uppercase mb-3"><i class="fas fa-pen text-primary mr-2"></i> Post as Admin</h4>
        <textarea id="adminPostText" class="input-field w-full mb-2 min-h-[80px]" placeholder="Announcement or update..."></textarea>
        <input id="adminPostLink" class="input-field w-full mb-2" placeholder="Optional link (admin only)">
        <div class="flex items-center gap-3">
          <label class="text-xs text-primary font-bold uppercase cursor-pointer">
            <i class="fas fa-image mr-1"></i> Image
            <input type="file" id="adminPostImage" accept="image/*" class="hidden">
          </label>
          <button type="button" id="adminPostSubmit" class="neon-btn px-5 py-2 text-xs uppercase ml-auto">Post as Admin</button>
        </div>
      </div>

      <!-- Posts list -->
      <div class="space-y-3">
        ${this.posts.map((p) => `
          <div class="glass-card p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <p class="font-bold text-white text-sm">${this.esc(p.userName)}</p>
                  ${p.isAdmin ? '<span class="text-[10px] text-primary font-black bg-primary/10 px-2 py-0.5 rounded-full uppercase">Admin</span>' : ''}
                  ${p.isPromoted ? '<span class="text-[10px] text-yellow-400 font-black bg-yellow-400/10 px-2 py-0.5 rounded-full uppercase">📌 Pinned</span>' : ''}
                  <span class="text-[10px] text-gray-500 ml-auto">${this.timeAgo(p.createdAt)}</span>
                </div>
                <p class="text-sm text-gray-300 leading-relaxed">${this.esc(p.text)}</p>
                ${p.imageUrl ? '<p class="text-[10px] text-primary mt-1"><i class="fas fa-image mr-1"></i>Has image</p>' : ''}
                ${p.reportCount > 0 ? `<p class="text-[10px] text-red-400 mt-1"><i class="fas fa-flag mr-1"></i>${p.reportCount} report(s)</p>` : ''}
              </div>
              <div class="flex flex-col gap-1 shrink-0">
                <button type="button" data-promote="${p.id}" class="text-[10px] text-primary font-bold uppercase hover:underline">📌 Pin</button>
                <button type="button" data-del="${p.id}" class="text-[10px] text-red-400 font-bold uppercase hover:underline">Delete</button>
                ${p.userId && p.userId !== 'admin' ? `
                  <button type="button" data-suspend="${p.userId}" class="text-[10px] text-orange-400 font-bold uppercase hover:underline">Suspend</button>
                  <button type="button" data-ban="${p.userId}" class="text-[10px] text-red-500 font-bold uppercase hover:underline">Ban</button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('') || '<p class="text-gray-500 text-sm text-center py-8">No posts yet</p>'}
      </div>`;
  }

  renderGroups() {
    return `
      <!-- Create group -->
      <div class="glass-card p-5 mb-5">
        <h4 class="font-black text-white text-sm uppercase mb-3"><i class="fas fa-plus text-primary mr-2"></i> Create Group</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input type="text" id="newGroupName" class="input-field" placeholder="Group name">
          <input type="text" id="newGroupDesc" class="input-field" placeholder="Short description (optional)">
        </div>
        <button type="button" id="createGroupBtn" class="neon-btn px-5 py-2 text-xs uppercase">Create Group</button>
      </div>

      <!-- Groups list -->
      <div class="space-y-3">
        ${this.groups.map((g) => `
          <div class="glass-card p-4 flex items-center justify-between gap-3">
            <div>
              <p class="font-bold text-white">${this.esc(g.name)}</p>
              <p class="text-xs text-gray-400 mt-0.5">${g.memberCount || 0} members · ${g.messageCount || 0} messages · ${g.activeCount || 0} active</p>
            </div>
            <button type="button" data-del-group="${g.id}" class="text-xs text-red-400 font-bold uppercase hover:underline">Delete</button>
          </div>
        `).join('') || '<p class="text-gray-500 text-sm text-center py-8">No groups yet</p>'}
      </div>`;
  }

  renderAnnouncements() {
    return `
      <!-- Create announcement -->
      <div class="glass-card p-5 mb-5">
        <h4 class="font-black text-white text-sm uppercase mb-3"><i class="fas fa-bullhorn text-primary mr-2"></i> New Announcement</h4>
        <input type="text" id="annTitle" class="input-field w-full mb-2" placeholder="Title">
        <textarea id="annBody" class="input-field w-full mb-3 min-h-[80px]" placeholder="Announcement body..."></textarea>
        <button type="button" id="createAnnBtn" class="neon-btn px-5 py-2 text-xs uppercase">Publish Announcement</button>
      </div>

      <!-- Announcements list -->
      <div class="space-y-3">
        ${this.announcements.map((a) => `
          <div class="glass-card p-4 flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">TOP</span>
                <p class="font-bold text-white text-sm">${this.esc(a.title)}</p>
              </div>
              <p class="text-xs text-gray-400">${this.esc(a.body || '')}</p>
              <p class="text-[10px] text-gray-600 mt-1">${this.timeAgo(a.createdAt)}</p>
            </div>
            <button type="button" data-del-ann="${a.id}" class="text-xs text-red-400 font-bold uppercase hover:underline shrink-0">Delete</button>
          </div>
        `).join('') || '<p class="text-gray-500 text-sm text-center py-8">No announcements yet</p>'}
      </div>`;
  }

  renderAi() {
    return `
      <div class="glass-card p-6 max-w-lg">
        <h4 class="font-black text-white text-sm uppercase mb-1">AI Moderation</h4>
        <p class="text-xs text-gray-500 mb-4">OpenAI-compatible API. Scam → 4-day suspend; 3 strikes → ban.</p>
        <label class="flex items-center gap-2 mb-3 text-sm cursor-pointer">
          <input type="checkbox" id="aiEnabled" ${this.settings.aiEnabled ? 'checked' : ''}> Enable AI moderation
        </label>
        <input type="password" id="aiApiKey" class="input-field w-full mb-2" placeholder="${this.settings.aiApiKeySet ? '•••• key saved' : 'Paste API key'}">
        <input type="text" id="aiApiUrl" class="input-field w-full mb-2" placeholder="API URL (optional)" value="${this.esc(this.settings.aiApiUrl || '')}">
        <input type="text" id="aiModel" class="input-field w-full mb-3" placeholder="Model (e.g. gpt-4o-mini)" value="${this.esc(this.settings.aiModel || '')}">
        <button type="button" id="saveAiBtn" class="neon-btn px-5 py-2 text-xs uppercase">Save</button>
      </div>`;
  }

  renderBody() {
    const tabs = [
      { id: 'posts', label: 'Posts', icon: 'comment-dots' },
      { id: 'groups', label: 'Groups', icon: 'users' },
      { id: 'announcements', label: 'Announcements', icon: 'bullhorn' },
      { id: 'ai', label: 'AI Mod', icon: 'robot' }
    ];
    return `
      <div class="flex flex-wrap gap-2 mb-6">
        ${tabs.map((t) => `
          <button type="button" data-tab="${t.id}"
            class="guru-tab flex items-center gap-2 ${this.tab === t.id ? 'is-active' : ''}">
            <i class="fas fa-${t.icon} text-xs"></i> ${t.label}
          </button>
        `).join('')}
      </div>
      ${this.tab === 'posts' ? this.renderPosts()
        : this.tab === 'groups' ? this.renderGroups()
        : this.tab === 'announcements' ? this.renderAnnouncements()
        : this.renderAi()}`;
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'guru',
      title: 'Movement',
      subtitle: 'Posts, groups, announcements & moderation',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.tab; this.render(); });
    });

    // Posts
    document.getElementById('adminPostSubmit')?.addEventListener('click', () => this.adminPost());
    document.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => this.deletePost(btn.dataset.del)));
    document.querySelectorAll('[data-promote]').forEach((btn) => btn.addEventListener('click', () => this.promote(btn.dataset.promote)));
    document.querySelectorAll('[data-suspend]').forEach((btn) => btn.addEventListener('click', () => this.suspendUser(btn.dataset.suspend)));
    document.querySelectorAll('[data-ban]').forEach((btn) => btn.addEventListener('click', () => this.banUser(btn.dataset.ban)));

    // Groups
    document.getElementById('createGroupBtn')?.addEventListener('click', () => this.createGroup());
    document.querySelectorAll('[data-del-group]').forEach((btn) => btn.addEventListener('click', () => this.deleteGroup(btn.dataset.delGroup)));

    // Announcements
    document.getElementById('createAnnBtn')?.addEventListener('click', () => this.createAnnouncement());
    document.querySelectorAll('[data-del-ann]').forEach((btn) => btn.addEventListener('click', () => this.deleteAnnouncement(btn.dataset.delAnn)));

    // AI
    document.getElementById('saveAiBtn')?.addEventListener('click', () => this.saveAi());
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.load();
  }
}
