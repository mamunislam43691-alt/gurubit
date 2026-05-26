/**
 * Movement — Gate.io style social feed (renamed from Post)
 */

import { UserLayout } from '../utils/UserLayout.js';
import { AgentLayout } from '../utils/AgentLayout.js';

export class PostFeed {
  constructor() {
    this.user = null;
    this.posts = [];
    this.announcements = [];
    this.tab = 'discover';
    this.showComposer = false;
    this.pendingImagePreview = null;
    this.composerText = '';
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Parse hashtags and @mentions in text
  parseText(text) {
    return this.esc(text)
      .replace(/#(\w+)/g, '<span class="text-primary font-bold cursor-pointer">#$1</span>')
      .replace(/@(\w+)/g, '<span class="text-cyan-400 font-bold cursor-pointer">@$1</span>');
  }

  badge(post) {
    if (post.isAdmin) return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-primary/20 text-primary uppercase">Admin</span>';
    if (post.isAgent) return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-500/20 text-yellow-400 uppercase">Agent</span>';
    if (post.blueVerified) return '<i class="fas fa-check-circle text-primary text-xs"></i>';
    return '';
  }

  timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async loadFeed() {
    const data = await fetch('/api/social/feed').then((r) => r.json());
    if (data.success) this.posts = data.posts;
  }

  async loadAnnouncements() {
    const data = await fetch('/api/social/announcements').then((r) => r.json()).catch(() => ({}));
    if (data.success) this.announcements = data.announcements || [];
  }

  async submitPost() {
    const text = document.getElementById('postInput')?.value?.trim() || '';
    const file = document.getElementById('postImage')?.files?.[0];
    let imageData = null;
    if (file) {
      imageData = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    }
    if (!text && !imageData) return;

    const btn = document.getElementById('postSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Posting...'; }

    const res = await fetch('/api/social/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, imageData })
    });
    const data = await res.json();

    if (btn) { btn.disabled = false; btn.textContent = 'Post'; }

    if (!data.success) {
      if (data.error?.code === 'LINK_DETECTED') {
        this.showLinkWarning(data.error.message);
      } else {
        alert(data.error?.message || 'Failed to post');
      }
      return;
    }
    this.showComposer = false;
    this.pendingImagePreview = null;
    await this.loadFeed();
    this.render();
    // Show success toast
    this._showSuccessToast('✅ Post published successfully!');
  }

  _showSuccessToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:linear-gradient(135deg,#00d2ff,#3a7bd5);color:#020b18;font-weight:800;font-size:.8rem;padding:.65rem 1.5rem;border-radius:9999px;opacity:0;pointer-events:none;transition:all .3s;z-index:9999;white-space:nowrap;';
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
    }, 2500);
  }

  showLinkWarning(msg) {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80';
    m.innerHTML = `
      <div class="glass-card max-w-sm w-full p-6 text-center" style="animation:fadeIn .2s ease">
        <div class="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-exclamation-triangle text-2xl text-red-400"></i>
        </div>
        <h3 class="font-black text-white text-lg mb-2">⚠️ Warning</h3>
        <p class="text-sm text-gray-300 mb-4">${this.esc(msg || 'Links are not allowed in posts.')}</p>
        <p class="text-xs text-gray-500 mb-5">Sharing links (Telegram, websites, etc.) is prohibited. Repeated violations may result in account suspension.</p>
        <button type="button" id="warnOk" class="neon-btn w-full py-3 text-sm uppercase">I Understand</button>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#warnOk')?.addEventListener('click', () => m.remove());
  }

  renderComposerModal() {
    if (!this.showComposer) return '';
    return `
      <div class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 p-4" id="composerOverlay">
        <div class="glass-card w-full max-w-lg rounded-2xl p-5" style="animation:slideUp .25s ease">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              ${(this.user?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="font-bold text-white text-sm">${this.esc(this.user?.name || 'You')}</p>
              <p class="text-[10px] text-gray-500">Public post</p>
            </div>
            <button type="button" id="postCancel" class="ml-auto text-gray-500 hover:text-white text-xl leading-none">&times;</button>
          </div>

          <!-- Text area -->
          <textarea id="postInput" class="w-full bg-transparent text-white text-sm resize-none outline-none min-h-[120px] placeholder-gray-600 mb-3"
            placeholder="What's on your mind? Use #hashtag or @username...">${this.esc(this.composerText)}</textarea>

          <!-- Image preview -->
          ${this.pendingImagePreview ? `
            <div class="relative mb-3">
              <img src="${this.pendingImagePreview}" class="rounded-xl max-h-48 w-full object-cover">
              <button type="button" id="removeImg" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">&times;</button>
            </div>` : ''}

          <!-- Toolbar -->
          <div class="flex items-center gap-3 pt-3 border-t border-white/10">
            <label class="cursor-pointer text-gray-400 hover:text-primary transition-all" title="Add photo">
              <i class="fas fa-image text-lg"></i>
              <input type="file" id="postImage" accept="image/*" class="hidden">
            </label>
            <span class="text-xs text-gray-600">#hashtag @mention</span>
            <div class="ml-auto flex gap-2">
              <button type="button" id="postCancel2" class="px-4 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:bg-white/5">Cancel</button>
              <button type="button" id="postSubmitBtn" class="neon-btn px-5 py-2 text-xs uppercase">Post</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  renderPost(p) {
    const isOwn = p.userId === this.user?.id;
    return `
      <article class="movement-post bg-dark-card border-b border-white/5 px-4 py-4 hover:bg-white/[0.02] transition-all">
        <!-- Author row -->
        <div class="flex items-start gap-3">
          <a href="/post/user/${p.userId}" class="shrink-0">
            ${p.profilePhotoUrl
              ? `<img src="${p.profilePhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-white/10">`
              : `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-cyan-500/20 flex items-center justify-center text-primary font-black text-sm">${(p.userName || '?').charAt(0).toUpperCase()}</div>`}
          </a>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <a href="/post/user/${p.userId}" class="font-bold text-white text-sm hover:text-primary transition-all">${this.esc(p.userName)}</a>
              ${this.badge(p)}
              <span class="text-[10px] text-gray-500 ml-auto">${this.timeAgo(p.createdAt)}</span>
            </div>
            <!-- Post text -->
            ${p.text ? `<p class="text-gray-200 text-sm mt-1 whitespace-pre-wrap leading-relaxed">${this.parseText(p.text)}</p>` : ''}
            <!-- Image -->
            ${p.imageUrl ? `<img src="${p.imageUrl}" class="rounded-xl mt-3 max-h-80 w-full object-cover border border-white/5">` : ''}
            <!-- Promoted badge -->
            ${p.isPromoted ? '<div class="mt-2"><span class="text-[10px] text-primary font-bold uppercase bg-primary/10 px-2 py-0.5 rounded-full">📌 Pinned</span></div>' : ''}
            <!-- Actions -->
            <div class="flex items-center gap-4 mt-3">
              <button type="button" class="follow-post-btn flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition-all" data-uid="${p.userId}" data-following="${p.following}">
                <i class="fas fa-user-plus text-[11px]"></i>
                <span>${p.following ? 'Following' : 'Follow'}</span>
              </button>
              ${!isOwn ? `
              <button type="button" class="report-post-btn flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-all" data-pid="${p.id}">
                <i class="fas fa-flag text-[11px]"></i>
                <span>Report</span>
              </button>` : ''}
            </div>
          </div>
        </div>
      </article>`;
  }

  renderAnnouncements() {
    if (!this.announcements.length) {
      return `<div class="text-center py-16 text-gray-600">
        <i class="fas fa-bullhorn text-4xl mb-3 block"></i>
        <p class="text-sm">No announcements yet</p>
      </div>`;
    }
    return this.announcements.map((a) => `
      <div class="px-4 py-4 border-b border-white/5">
        <div class="flex items-start gap-2 mb-1">
          <span class="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded uppercase shrink-0">📢 Announcement</span>
        </div>
        <p class="font-bold text-white text-sm leading-snug mt-1">${String(a.title || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        <p class="text-xs text-gray-400 leading-relaxed mt-1">${String(a.body || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        <p class="text-[10px] text-gray-600 mt-2">${this.timeAgo(a.createdAt)}</p>
      </div>
    `).join('');
  }

  renderBody() {
    const filtered = this.tab === 'following'
      ? this.posts.filter((p) => p.following)
      : this.posts;

    const feedContent = this.tab === 'announcements'
      ? this.renderAnnouncements()
      : (filtered.length
          ? filtered.map((p) => this.renderPost(p)).join('')
          : `<div class="text-center py-16 text-gray-600">
              <i class="fas fa-wind text-4xl mb-3 block"></i>
              <p class="text-sm">${this.tab === 'following' ? 'Follow someone to see their posts here' : 'No posts yet. Be the first!'}</p>
            </div>`);

    return `
      <div class="movement-feed max-w-2xl mx-auto">
        <!-- Tabs -->
        <div class="flex border-b border-white/10 mb-0 sticky top-[57px] z-30 bg-dark">
          ${[
            { id: 'discover', label: 'Discover' },
            { id: 'following', label: 'Following' },
            { id: 'announcements', label: 'Announcements' }
          ].map((t) => `
            <button type="button" data-feed-tab="${t.id}"
              class="flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all border-b-2 ${this.tab === t.id ? 'text-primary border-primary' : 'text-gray-500 border-transparent hover:text-gray-300'}">
              ${t.label}
            </button>
          `).join('')}
          <a href="/groups" class="flex items-center px-4 text-xs text-gray-500 hover:text-primary transition-all border-b-2 border-transparent">
            <i class="fas fa-users mr-1"></i> Groups
          </a>
        </div>

        <!-- Feed -->
        <div id="feedList">
          ${feedContent}
        </div>
      </div>

      <!-- Composer modal -->
      ${this.renderComposerModal()}

      <!-- FAB create button — only show on non-announcements tabs -->
      ${!this.showComposer && this.tab !== 'announcements' ? `
        <button type="button" id="openComposer"
          class="fixed bottom-20 right-5 md:bottom-8 md:right-8 w-14 h-14 rounded-full bg-primary text-dark font-black text-2xl shadow-2xl shadow-primary/40 flex items-center justify-center z-40 hover:scale-110 transition-transform">
          <i class="fas fa-plus"></i>
        </button>` : ''}`;
  }

  render() {
    const layout = this.user?.isAgent ? AgentLayout : UserLayout;
    layout.renderShell({ activeId: 'post', title: 'Movement', bodyHtml: this.renderBody(), user: this.user });
    this._bindEvents();
  }

  _bindEvents() {
    // Tabs
    document.querySelectorAll('[data-feed-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.feedTab; this.render(); });
    });

    // FAB
    document.getElementById('openComposer')?.addEventListener('click', () => {
      this.showComposer = true;
      this.render();
    });

    // Composer
    document.getElementById('postCancel')?.addEventListener('click', () => { this.showComposer = false; this.render(); });
    document.getElementById('postCancel2')?.addEventListener('click', () => { this.showComposer = false; this.render(); });
    document.getElementById('composerOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'composerOverlay') { this.showComposer = false; this.render(); }
    });
    document.getElementById('postSubmitBtn')?.addEventListener('click', () => this.submitPost());
    document.getElementById('postImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      this.composerText = document.getElementById('postInput')?.value || '';
      this.pendingImagePreview = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
      });
      this.render();
    });
    document.getElementById('removeImg')?.addEventListener('click', () => {
      this.pendingImagePreview = null;
      this.composerText = document.getElementById('postInput')?.value || '';
      this.render();
    });

    // Follow
    document.querySelectorAll('.follow-post-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = await fetch(`/api/social/users/${btn.dataset.uid}/follow`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          const post = this.posts.find((p) => p.userId === btn.dataset.uid);
          if (post) post.following = data.following;
          btn.dataset.following = data.following;
          btn.querySelector('span').textContent = data.following ? 'Following' : 'Follow';
        }
      });
    });

    // Report
    document.querySelectorAll('.report-post-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Report this post?')) return;
        const res = await fetch(`/api/social/posts/${btn.dataset.pid}/report`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          btn.textContent = 'Reported';
          btn.disabled = true;
        }
      });
    });
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    await Promise.all([this.loadFeed(), this.loadAnnouncements()]);
    this.render();
  }
}
