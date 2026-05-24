/**
 * Admin Guru — posts & groups management
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminGuru {
  constructor() {
    this.posts = [];
    this.groups = [];
    this.settings = {};
    this.admin = null;
    this.tab = 'posts';
  }

  esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async load() {
    const data = await fetch('/api/admin/guru/posts').then((r) => r.json());
    if (data.success) {
      this.posts = data.posts;
      this.groups = data.groups;
      this.settings = data.settings;
    }
    this.render();
  }

  async deletePost(id) {
    await fetch(`/api/admin/guru/posts/${id}`, { method: 'DELETE' });
    await this.load();
  }

  async suspendUser(userId) {
    if (!confirm('Suspend this user for 4 days?')) return;
    await fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 4 })
    });
    alert('User suspended');
  }

  async banUser(userId) {
    if (!confirm('Ban this user permanently?')) return;
    await fetch(`/api/admin/users/${userId}/ban`, { method: 'PUT' });
    alert('User banned');
  }

  async promote(id) {
    await fetch(`/api/admin/guru/posts/${id}/promote`, { method: 'POST' });
    await this.load();
  }

  async saveAi() {
    const aiApiKey = document.getElementById('aiApiKey')?.value || '';
    const aiEnabled = document.getElementById('aiEnabled')?.checked;
    const aiApiUrl = document.getElementById('aiApiUrl')?.value || '';
    const aiModel = document.getElementById('aiModel')?.value || '';
    await fetch('/api/admin/guru/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiApiKey, aiEnabled, aiApiUrl, aiModel })
    });
    await this.load();
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async adminPost() {
    const text = document.getElementById('adminPostText')?.value;
    const link = document.getElementById('adminPostLink')?.value;
    const file = document.getElementById('adminPostImage')?.files?.[0];
    let imageData = null;
    if (file) imageData = await this.fileToDataUrl(file);
    await fetch('/api/admin/guru/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, link, imageData, isAdminPost: true })
    });
    await this.load();
  }

  renderPosts() {
    return `
      <div class="glass-card p-4 mb-4">
        <p class="stat-label mb-2">Admin post (shows first in For You)</p>
        <textarea id="adminPostText" class="input-field w-full mb-2 min-h-[60px]" placeholder="Announcement..."></textarea>
        <input id="adminPostLink" class="input-field w-full mb-2" placeholder="Optional link (admin only)">
        <label class="block text-xs text-primary font-bold uppercase mb-2 cursor-pointer">
          <i class="fas fa-image"></i> Add image
          <input type="file" id="adminPostImage" accept="image/*" class="hidden">
        </label>
        <button type="button" id="adminPostSubmit" class="neon-btn px-4 py-2 text-xs uppercase">Post as Admin</button>
      </div>
      <div class="space-y-3">
        ${this.posts.map((p) => `
          <div class="glass-card p-4 flex flex-wrap justify-between gap-2 items-start">
            <div>
              <p class="font-bold text-white">${this.esc(p.userName)} ${p.isAdmin ? '<span class="text-primary text-xs">ADMIN</span>' : ''}</p>
              <p class="text-sm text-gray-300 mt-1">${this.esc(p.text)}</p>
              ${p.imageUrl ? '<p class="text-[10px] text-primary mt-1">Has image</p>' : ''}
              <p class="text-[10px] text-gray-500 mt-1">Reports: ${p.reportCount || 0} ${p.isPromoted ? '· PROMOTED' : ''}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-promote="${p.id}" class="text-xs text-primary font-bold uppercase">Promote</button>
              <button type="button" data-del="${p.id}" class="text-xs text-red-400 font-bold uppercase">Delete</button>
              ${p.userId && p.userId !== 'admin' ? `
                <button type="button" data-suspend="${p.userId}" class="text-xs text-orange-400 font-bold uppercase">Suspend</button>
                <button type="button" data-ban="${p.userId}" class="text-xs text-red-500 font-bold uppercase">Ban</button>
              ` : ''}
            </div>
          </div>
        `).join('') || '<p class="text-gray-500">No posts</p>'}
      </div>`;
  }

  renderGroups() {
    return `
      <div class="space-y-3">
        ${this.groups.map((g) => `
          <div class="glass-card p-4">
            <p class="font-bold text-white">${this.esc(g.name)}</p>
            <p class="text-sm text-gray-400">${g.messageCount || 0} messages · ${g.activeCount || 0} active · ${g.inactiveCount || 0} inactive</p>
          </div>
        `).join('')}
      </div>`;
  }

  renderAi() {
    return `
      <div class="glass-card p-6 max-w-lg">
        <p class="stat-label mb-2">AI site control (API key)</p>
        <p class="text-xs text-gray-500 mb-4">OpenAI-compatible API. Scam → 4-day suspend; 3 strikes → ban. Heuristic fallback if API fails.</p>
        <label class="flex items-center gap-2 mb-3 text-sm"><input type="checkbox" id="aiEnabled" ${this.settings.aiEnabled ? 'checked' : ''}> Enable AI moderation</label>
        <input type="password" id="aiApiKey" class="input-field w-full mb-2" placeholder="${this.settings.aiApiKeySet ? '•••• key saved (leave blank to keep)' : 'Paste API key'}">
        <input type="text" id="aiApiUrl" class="input-field w-full mb-2" placeholder="API URL (optional, default OpenAI)" value="${this.esc(this.settings.aiApiUrl || '')}">
        <input type="text" id="aiModel" class="input-field w-full mb-3" placeholder="Model (optional, e.g. gpt-4o-mini)" value="${this.esc(this.settings.aiModel || '')}">
        <button type="button" id="saveAiBtn" class="neon-btn px-4 py-2 text-xs uppercase">Save</button>
      </div>`;
  }

  renderBody() {
    return `
      <div class="flex gap-2 mb-6">
        ${['posts', 'groups', 'ai'].map((t) => `<button type="button" data-tab="${t}" class="guru-tab ${this.tab === t ? 'is-active' : ''}">${t}</button>`).join('')}
      </div>
      ${this.tab === 'posts' ? this.renderPosts() : this.tab === 'groups' ? this.renderGroups() : this.renderAi()}`;
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'guru',
      title: 'Post',
      subtitle: 'Feed & groups moderation',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.tab; this.render(); });
    });
    document.getElementById('adminPostSubmit')?.addEventListener('click', () => this.adminPost());
    document.getElementById('saveAiBtn')?.addEventListener('click', () => this.saveAi());
    document.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => this.deletePost(btn.dataset.del));
    });
    document.querySelectorAll('[data-promote]').forEach((btn) => {
      btn.addEventListener('click', () => this.promote(btn.dataset.promote));
    });
    document.querySelectorAll('[data-suspend]').forEach((btn) => {
      btn.addEventListener('click', () => this.suspendUser(btn.dataset.suspend));
    });
    document.querySelectorAll('[data-ban]').forEach((btn) => {
      btn.addEventListener('click', () => this.banUser(btn.dataset.ban));
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.load();
  }
}
