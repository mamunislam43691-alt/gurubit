/**
 * Post — Facebook-style For You feed
 */

import { UserLayout } from '../utils/UserLayout.js';
import { AgentLayout } from '../utils/AgentLayout.js';

export class PostFeed {
  constructor() {
    this.user = null;
    this.posts = [];
    this.showComposer = false;
    this.pendingImagePreview = null;
    this.apiKeys = [];
    this.newKeyLabel = '';
  }

  esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  badge(post) {
    if (post.isAdmin) return '<span class="guru-badge guru-badge-admin">Admin</span>';
    if (post.blueVerified) return '<span class="guru-badge guru-badge-blue"><i class="fas fa-check"></i></span>';
    return '';
  }

  async loadFeed() {
    const data = await fetch('/api/social/feed').then((r) => r.json());
    if (data.success) this.posts = data.posts;
  }

  async loadApiKeys() {
    if (!this.user?.isAgent) return;
    const data = await fetch('/api/user/api-keys').then((r) => r.json()).catch(() => ({}));
    if (data.success) this.apiKeys = data.keys || [];
  }

  async createApiKey() {
    const label = document.getElementById('apiKeyLabel')?.value?.trim() || 'Website API';
    const res = await fetch('/api/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    const data = await res.json();
    if (data.success) {
      this.apiKeys.unshift(data.key);
      this.render();
      alert(`API Key created — copy now:\n\n${data.key.apiKey}`);
    } else alert(data.error?.message || 'Failed');
  }

  async revokeApiKey(id) {
    if (!confirm('Revoke this API key?')) return;
    await fetch(`/api/user/api-keys/${id}`, { method: 'DELETE' });
    this.apiKeys = this.apiKeys.filter((k) => k.id !== id);
    this.render();
  }

  renderApiSection() {
    if (!this.user?.isAgent) return '';
    return `
      <section class="glass-card p-5 mt-8 border border-primary/20">
        <h3 class="font-black text-white uppercase text-sm mb-1"><i class="fas fa-key text-primary mr-2"></i> API Access</h3>
        <p class="text-xs text-gray-500 mb-4">Generate API keys to connect your website or tools to GURUBIT (like other platforms).</p>
        <div class="flex flex-wrap gap-2 mb-4">
          <input type="text" id="apiKeyLabel" class="input-field flex-1 min-w-[160px]" placeholder="Key label (e.g. My Site)">
          <button type="button" id="createApiKeyBtn" class="neon-btn px-4 py-2 text-xs uppercase">Generate API Key</button>
        </div>
        <motion.div class="space-y-2">
          ${this.apiKeys.length ? this.apiKeys.map((k) => `
            <div class="flex flex-wrap justify-between gap-2 items-center p-3 rounded-lg bg-black/30 border border-white/10">
              <motion.div>
                <p class="text-white font-bold text-sm">${this.esc(k.label)}</p>
                <p class="font-mono text-xs text-primary break-all">${this.esc(k.apiKey)}</p>
                <p class="text-[10px] text-gray-500">${new Date(k.createdAt).toLocaleString()}</p>
              </motion.div>
              <button type="button" data-revoke-key="${k.id}" class="text-red-400 text-xs font-bold uppercase">Revoke</button>
            </motion.div>
          `).join('') : '<p class="text-gray-500 text-sm">No API keys yet</p>'}
        </motion.div>
      </section>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async submitPost() {
    const text = document.getElementById('postInput')?.value?.trim() || '';
    const file = document.getElementById('postImage')?.files?.[0];
    let imageData = null;
    if (file) imageData = await this.fileToDataUrl(file);
    if (!text && !imageData) return;
    const res = await fetch('/api/social/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, imageData })
    });
    const data = await res.json();
    if (!data.success) return alert(data.error?.message || 'Failed');
    this.showComposer = false;
    this.pendingImagePreview = null;
    await this.loadFeed();
    this.render();
  }

  renderPost(p) {
    return `
      <article class="post-card glass-card p-5 mb-4 ${p.isPromoted ? 'border-primary/40' : ''}">
        <div class="flex items-start gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">${(p.userName || '?').charAt(0)}</div>
          <div class="flex-1">
            <p class="font-bold text-white flex items-center gap-2 flex-wrap">
              <a href="/post/user/${p.userId}" class="hover:text-primary">${this.esc(p.userName)}</a>
              ${this.badge(p)}
            </p>
            <p class="text-[10px] text-gray-500">${new Date(p.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <p class="text-gray-200 whitespace-pre-wrap mb-3">${this.esc(p.text)}</p>
        ${p.imageUrl ? `<img src="${p.imageUrl}" class="rounded-xl max-h-80 w-full object-cover mb-3">` : ''}
        <div class="flex gap-3 pt-2 border-t border-white/5">
          <button type="button" class="follow-post-btn text-xs font-bold uppercase text-primary" data-uid="${p.userId}">Follow</button>
          <button type="button" class="report-post-btn text-xs text-gray-500 uppercase" data-pid="${p.id}">Report</button>
        </div>
      </article>`.replace('<motion.div', '<div').replace('</motion.div>', '</div>');
  }

  renderComposer() {
    if (!this.showComposer) {
      return `<button type="button" id="openComposer" class="post-fab-create" title="Create post"><i class="fas fa-plus"></i></button>`;
    }
    return `
      <div class="glass-card p-4 mb-4 post-composer">
        <textarea id="postInput" class="input-field w-full min-h-[100px] mb-3" placeholder="What's on your mind?"></textarea>
        ${this.pendingImagePreview ? `<img src="${this.pendingImagePreview}" class="rounded-lg max-h-40 mb-3 w-full object-cover">` : ''}
        <div class="flex flex-wrap gap-2">
          <label class="text-xs font-bold text-primary uppercase cursor-pointer"><i class="fas fa-image"></i> Photo<input type="file" id="postImage" accept="image/*" class="hidden"></label>
          <button type="button" id="postSubmit" class="neon-btn px-5 py-2 text-xs uppercase">Post</button>
          <button type="button" id="postCancel" class="text-xs text-gray-500 uppercase">Cancel</button>
        </div>
      </div>`;
  }

  renderBody() {
    return `
      <motion.div class="post-feed-header flex items-center justify-between mb-4">
        <p class="text-gray-400 text-sm">For You — latest from the community</p>
        <a href="/groups" class="text-primary text-xs font-bold uppercase"><i class="fas fa-users"></i> Groups</a>
      </div>
      ${this.renderComposer()}
      ${this.posts.map((p) => this.renderPost(p)).join('') || '<p class="text-gray-500 text-center py-12">No posts yet. Tap + to share.</p>'}
      ${this.renderApiSection()}`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  render() {
    const layout = this.user?.isAgent ? AgentLayout : UserLayout;
    layout.renderShell({ activeId: 'post', title: 'Post', bodyHtml: this.renderBody(), user: this.user });
    document.getElementById('openComposer')?.addEventListener('click', () => {
      this.showComposer = true;
      this.render();
    });
    document.getElementById('postCancel')?.addEventListener('click', () => {
      this.showComposer = false;
      this.render();
    });
    document.getElementById('postSubmit')?.addEventListener('click', () => this.submitPost());
    document.getElementById('postImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      this.pendingImagePreview = f ? await this.fileToDataUrl(f) : null;
      this.render();
    });
    document.querySelectorAll('.follow-post-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/social/users/${btn.dataset.uid}/follow`, { method: 'POST' });
        alert('Follow updated');
      });
    });
    document.querySelectorAll('.report-post-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/social/posts/${btn.dataset.pid}/report`, { method: 'POST' });
        alert('Reported');
      });
    });
    document.getElementById('createApiKeyBtn')?.addEventListener('click', () => this.createApiKey());
    document.querySelectorAll('[data-revoke-key]').forEach((btn) => {
      btn.addEventListener('click', () => this.revokeApiKey(btn.dataset.revokeKey));
    });
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    await this.loadFeed();
    if (this.user.isAgent) await this.loadApiKeys();
    this.render();
  }
}
