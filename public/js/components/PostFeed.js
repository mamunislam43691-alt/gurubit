/**
 * Movement — Facebook-style social feed
 * Like, Comment, Views, Follow on profile, Report
 */

import { UserLayout } from '../utils/UserLayout.js';
import { AgentLayout } from '../utils/AgentLayout.js';

export class PostFeed {
  constructor() {
    this.user = null;
    this.posts = [];
    this.announcements = [];
    this.ads = null;
    this.tab = 'discover';
    this.showComposer = false;
    this.pendingImagePreview = null;
    this.composerText = '';
    this.expandedComments = new Set();
    this.commentInputs = {};
    this._groupsData = null;
    this._myGroupIds = new Set();
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  parseText(text) {
    return this.esc(text)
      .replace(/#(\w+)/g, '<span class="text-primary font-bold">#$1</span>')
      .replace(/@(\w+)/g, '<span class="text-cyan-400 font-bold">@$1</span>');
  }

  badge(post) {
    if (post.isAdmin === true) return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-primary/20 text-primary uppercase">Admin</span>';
    if (post.isAgent === true) return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-500/20 text-yellow-400 uppercase">Agent</span>';
    if (post.blueVerified === true) return '<i class="fas fa-check-circle text-primary text-xs"></i>';
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
    const data = await fetch('/api/social/feed').then((r) => r.json()).catch(() => ({}));
    if (data.success) this.posts = data.posts || [];
  }

  async loadAnnouncements() {
    const data = await fetch('/api/social/announcements').then((r) => r.json()).catch(() => ({}));
    if (data.success) this.announcements = data.announcements || [];
  }

  async loadAds() {
    const data = await fetch('/api/social/ads').then(r => r.json()).catch(() => ({}));
    if (data.success && data.ads?.enabled) this.ads = data.ads;
    else this.ads = null;
  }

  async submitPost() {
    const text = document.getElementById('postInput')?.value?.trim() || '';
    const file = document.getElementById('postImage')?.files?.[0];
    let imageData = null;
    if (file) {
      imageData = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
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
        this._showLinkWarning(data.error.message);
      } else {
        this._toast('❌ ' + (data.error?.message || 'Failed to post'), 'error');
      }
      return;
    }
    this.showComposer = false;
    this.pendingImagePreview = null;
    this.composerText = '';
    await this.loadFeed();
    this.render();
    this._toast('✅ Post published!');
  }

  async toggleLike(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;
    // Optimistic update — instant feedback
    const wasLiked = post._liked;
    post._liked = !wasLiked;
    post.likes = Math.max(0, (post.likes || 0) + (wasLiked ? -1 : 1));
    this._rerenderPost(postId);

    const res = await fetch(`/api/social/posts/${postId}/like`, { method: 'POST' }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      if (data?.success) {
        // Sync with server count
        post._liked = data.liked;
        post.likes = data.likes;
        this._rerenderPost(postId);
      }
    } else {
      // Revert on failure
      post._liked = wasLiked;
      post.likes = Math.max(0, (post.likes || 0) + (wasLiked ? 1 : -1));
      this._rerenderPost(postId);
    }
  }

  async submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input?.value?.trim();
    if (!text) return;

    const res = await fetch(`/api/social/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).catch(() => null);

    if (res?.ok) {
      const data = await res.json();
      if (data.success) {
        const post = this.posts.find(p => p.id === postId);
        if (post) {
          if (!post._comments) post._comments = [];
          post._comments.push(data.comment);
          post.commentCount = (post.commentCount || 0) + 1;
        }
        if (input) input.value = '';
        this._rerenderPost(postId);
      }
    }
  }

  async loadComments(postId) {
    const res = await fetch(`/api/social/posts/${postId}/comments`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      if (data.success) {
        const post = this.posts.find(p => p.id === postId);
        if (post) post._comments = data.comments || [];
      }
    }
  }

  _rerenderPost(postId) {
    const el = document.querySelector(`[data-post-id="${postId}"]`);
    if (!el) return;
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this.renderPost(post);
    el.replaceWith(tmp.firstElementChild);
    this._bindPostEvents(postId);
  }

  _toast(msg, type = 'success') {
    const colors = {
      success: 'linear-gradient(135deg,#00d2ff,#3a7bd5)',
      error: 'linear-gradient(135deg,#ef4444,#dc2626)'
    };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:${colors[type]||colors.success};color:#020b18;font-weight:800;font-size:.82rem;padding:.7rem 1.6rem;border-radius:9999px;opacity:0;pointer-events:none;transition:all .3s;z-index:9999;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4);`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; setTimeout(()=>t.remove(),300); }, 2800);
  }

  _showLinkWarning(msg) {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80';
    m.innerHTML = `
      <div class="glass-card max-w-sm w-full p-6 text-center" style="animation:fadeIn .2s ease">
        <div class="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-exclamation-triangle text-2xl text-red-400"></i>
        </div>
        <h3 class="font-black text-white text-lg mb-2">⚠️ Warning</h3>
        <p class="text-sm text-gray-300 mb-4">${this.esc(msg || 'Links are not allowed.')}</p>
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
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              ${(this.user?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="font-bold text-white text-sm">${this.esc(this.user?.name || 'You')}</p>
              <p class="text-[10px] text-gray-500">Public post</p>
            </div>
            <button type="button" id="postCancel" class="ml-auto text-gray-500 hover:text-white text-xl leading-none">&times;</button>
          </div>
          <textarea id="postInput" class="w-full bg-transparent text-white text-sm resize-none outline-none min-h-[120px] placeholder-gray-600 mb-3"
            placeholder="What's on your mind? Use #hashtag or @mention...">${this.esc(this.composerText)}</textarea>
          ${this.pendingImagePreview ? `
            <div class="relative mb-3">
              <img src="${this.pendingImagePreview}" class="rounded-xl max-h-48 w-full object-cover">
              <button type="button" id="removeImg" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">&times;</button>
            </div>` : ''}
          <div class="flex items-center gap-3 pt-3 border-t border-white/10">
            <label class="cursor-pointer text-gray-400 hover:text-primary transition-all" title="Add photo (image only)">
              <i class="fas fa-image text-lg"></i>
              <input type="file" id="postImage" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" class="hidden">
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
    const liked = p._liked === true;
    const likes = p.likes || 0;
    const views = p.views || 0;
    const commentCount = p.commentCount || (p._comments?.length) || 0;
    const showComments = this.expandedComments.has(p.id);
    const comments = p._comments || [];

    return `
      <article class="movement-post border-b border-white/5 px-4 py-4 hover:bg-white/[0.015] transition-all" data-post-id="${p.id}">
        <!-- Author row -->
        <div class="flex items-start gap-3">
          <a href="/post/user/${p.userId}" class="spa-link shrink-0">
            ${p.profilePhotoUrl
              ? `<img src="${p.profilePhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-white/10">`
              : `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-cyan-500/20 flex items-center justify-center text-primary font-black text-sm border border-white/10">${(p.userName||'?').charAt(0).toUpperCase()}</div>`}
          </a>
          <div class="flex-1 min-w-0">
            <!-- Name + badge + follow + time -->
            <div class="flex items-center gap-2 flex-wrap">
              <a href="/post/user/${p.userId}" class="spa-link font-bold text-white text-sm hover:text-primary transition-all">${this.esc(p.userName)}</a>
              ${this.badge(p)}
              ${!isOwn ? `
              <button type="button" class="follow-post-btn flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all
                ${p.following ? 'border-primary/40 text-primary bg-primary/10' : 'border-white/15 text-gray-400 hover:border-primary/40 hover:text-primary'}"
                data-uid="${p.userId}" data-following="${p.following ? '1' : ''}">
                <i class="fas fa-${p.following ? 'user-check' : 'user-plus'} text-[9px]"></i>
                <span>${p.following ? 'Following' : 'Follow'}</span>
              </button>` : ''}
              <span class="text-[10px] text-gray-500 ml-auto">${this.timeAgo(p.createdAt)}</span>
            </div>

            <!-- Post content -->
            ${p.text ? `<p class="text-gray-200 text-sm mt-2 whitespace-pre-wrap leading-relaxed">${this.parseText(p.text)}</p>` : ''}
            ${p.imageUrl ? `<img src="${p.imageUrl}" class="rounded-xl mt-3 max-h-80 w-full object-cover border border-white/5 cursor-pointer post-img" loading="lazy">` : ''}
            ${p.isPromoted ? '<div class="mt-2"><span class="text-[10px] text-primary font-bold uppercase bg-primary/10 px-2 py-0.5 rounded-full">📌 Pinned</span></div>' : ''}

            <!-- Stats row: views + comment count -->
            <div class="flex items-center justify-between mt-2 mb-1 text-[11px] text-gray-500">
              <div class="flex items-center gap-3">
                ${likes > 0 ? `<span class="flex items-center gap-1"><i class="fas fa-thumbs-up text-primary text-[10px]"></i> ${likes}</span>` : ''}
              </div>
              <div class="flex items-center gap-3">
                ${commentCount > 0 ? `<button type="button" class="comment-count-btn hover:text-gray-300 transition-all" data-pid="${p.id}">${commentCount} comment${commentCount !== 1 ? 's' : ''}</button>` : ''}
                ${views > 0 ? `<span class="flex items-center gap-1"><i class="fas fa-eye text-[10px]"></i> ${views}</span>` : ''}
              </div>
            </div>

            <!-- Action bar: Like · Comment · Share | Views -->
            <div class="flex items-center border-t border-white/5 pt-1">
              <!-- Left: Like, Comment, Share -->
              <div class="flex items-center gap-0 flex-1">
                <button type="button" class="like-btn flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all flex-1 justify-center
                  ${liked ? 'text-primary' : 'text-gray-500 hover:bg-white/5 hover:text-primary'}"
                  data-pid="${p.id}">
                  <i class="fas fa-thumbs-up text-[12px]"></i>
                  <span>${liked ? 'Liked' : 'Like'}</span>
                </button>
                <button type="button" class="comment-toggle-btn flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-white/5 hover:text-primary transition-all flex-1 justify-center"
                  data-pid="${p.id}">
                  <i class="fas fa-comment text-[12px]"></i>
                  <span>Comment</span>
                </button>
                <button type="button" class="share-btn flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-white/5 hover:text-cyan-400 transition-all flex-1 justify-center"
                  data-pid="${p.id}" data-phone="${this.esc(p.text || '')}">
                  <i class="fas fa-share text-[12px]"></i>
                  <span>Share</span>
                </button>
              </div>
              <!-- Right: Report (not own) -->
              ${!isOwn ? `
              <button type="button" class="report-post-btn flex items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-bold text-gray-600 hover:text-red-400 transition-all"
                data-pid="${p.id}" title="Report">
                <i class="fas fa-flag text-[10px]"></i>
              </button>` : ''}
            </div>

            <!-- Comments section -->
            ${showComments ? `
            <div class="mt-3 space-y-2 border-t border-white/5 pt-3" id="comments-${p.id}">
              ${comments.map(c => `
                <div class="flex items-start gap-2">
                  <div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black shrink-0">
                    ${(c.userName||'?').charAt(0).toUpperCase()}
                  </div>
                  <div class="flex-1 bg-white/5 rounded-xl px-3 py-2">
                    <p class="text-[11px] font-bold text-primary mb-0.5">${this.esc(c.userName)}</p>
                    <p class="text-xs text-gray-300">${this.esc(c.text)}</p>
                  </div>
                </div>
              `).join('')}
              <!-- Comment input -->
              <div class="flex items-center gap-2 mt-2">
                <div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black shrink-0">
                  ${(this.user?.name||'?').charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/10 focus-within:border-primary/40">
                  <input type="text" id="comment-input-${p.id}" class="flex-1 bg-transparent text-xs text-white outline-none placeholder-gray-600" placeholder="Write a comment...">
                  <button type="button" class="comment-submit-btn text-primary text-xs font-bold" data-pid="${p.id}">
                    <i class="fas fa-paper-plane"></i>
                  </button>
                </div>
              </div>
            </div>` : ''}
          </div>
        </div>
      </article>`;
  }

  renderAdCard(ad) {
    return `
      <div class="movement-post border-b border-white/5 px-4 py-4 bg-yellow-500/[0.03]">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[9px] font-black text-yellow-400/80 bg-yellow-400/10 px-2 py-0.5 rounded uppercase tracking-widest">${this.esc(this.ads?.label || 'Sponsored')}</span>
        </div>
        <div class="flex items-start gap-3">
          ${ad.imageUrl ? `<img src="${ad.imageUrl}" class="w-20 h-16 rounded-xl object-cover border border-white/10 shrink-0">` : ''}
          <div class="flex-1 min-w-0">
            <p class="font-bold text-white text-sm">${this.esc(ad.title)}</p>
            ${ad.description ? `<p class="text-xs text-gray-400 mt-0.5 leading-relaxed">${this.esc(ad.description)}</p>` : ''}
            ${ad.linkUrl ? `
              <a href="${this.esc(ad.linkUrl)}" target="_blank" rel="noopener sponsored"
                class="inline-flex items-center gap-1.5 mt-2 px-4 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 text-xs font-bold hover:bg-yellow-500/30 transition-all">
                Learn More <i class="fas fa-arrow-right text-[9px]"></i>
              </a>` : ''}
          </div>
        </div>
      </div>`;
  }

  renderFeedWithAds(posts) {
    if (!posts.length) {
      return `<div class="text-center py-16 text-gray-600">
        <i class="fas fa-wind text-4xl mb-3 block"></i>
        <p class="text-sm">${this.tab === 'following' ? 'Follow someone to see their posts here' : 'No posts yet. Be the first!'}</p>
      </div>`;
    }

    const freq = this.ads?.frequency || 5;
    const adItems = this.ads?.items || [];
    if (!adItems.length || !this.ads?.enabled) {
      return posts.map(p => this.renderPost(p)).join('');
    }

    let adIndex = 0;
    return posts.map((p, i) => {
      const postHtml = this.renderPost(p);
      // Insert ad after every `freq` posts
      if ((i + 1) % freq === 0 && adItems.length > 0) {
        const ad = adItems[adIndex % adItems.length];
        adIndex++;
        return postHtml + this.renderAdCard(ad);
      }
      return postHtml;
    }).join('');
  }

  renderAnnouncements() {
    if (!this.announcements.length) {
      return `<div class="text-center py-16 text-gray-600">
        <i class="fas fa-bullhorn text-4xl mb-3 block"></i>
        <p class="text-sm">No announcements yet</p>
      </div>`;
    }
    return this.announcements.map((a) => `
      <div class="movement-post border-b border-white/5 px-4 py-5">
        <!-- Header -->
        <div class="flex items-start gap-2 mb-3">
          <div class="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <i class="fas fa-bullhorn text-primary text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">📢 Announcement</span>
              <span class="text-[10px] text-gray-500 ml-auto">${this.timeAgo(a.createdAt)}</span>
            </div>
            <p class="font-black text-white text-base leading-snug mt-1">${this.esc(a.title || '')}</p>
          </div>
        </div>
        <!-- Body -->
        ${a.body ? `<p class="text-sm text-gray-300 leading-relaxed mb-3 ml-10">${this.esc(a.body)}</p>` : ''}
        <!-- Image -->
        ${a.imageUrl ? `<img src="${a.imageUrl}" class="rounded-xl w-full max-h-80 object-cover border border-white/5 mb-3 ml-10" style="max-width:calc(100% - 2.5rem);" loading="lazy">` : ''}
        <!-- Link button -->
        ${a.linkUrl ? `
          <div class="ml-10 mb-1">
            <a href="${this.esc(a.linkUrl)}" target="_blank" rel="noopener"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-dark font-black text-sm hover:opacity-90 transition-all">
              ${a.linkLabel ? this.esc(a.linkLabel) : 'Learn More'}
              <i class="fas fa-arrow-right text-xs"></i>
            </a>
          </div>` : ''}
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
          ? this.renderFeedWithAds(filtered)
          : `<div class="text-center py-16 text-gray-600">
              <i class="fas fa-wind text-4xl mb-3 block"></i>
              <p class="text-sm">${this.tab === 'following' ? 'Follow someone to see their posts here' : 'No posts yet. Be the first!'}</p>
            </div>`);

    return `
      <div class="movement-feed max-w-2xl mx-auto">
        <!-- Tabs — same style as admin panel -->
        <div class="flex border-b border-white/10 mb-0 sticky top-[57px] z-30 bg-dark">
          ${[
            { id: 'discover',      label: 'Discover',       icon: 'compass' },
            { id: 'following',     label: 'Following',      icon: 'user-friends' },
            { id: 'announcements', label: 'Announcements',  icon: 'bullhorn' }
          ].map((t) => `
            <button type="button" data-feed-tab="${t.id}"
              class="flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all border-b-2 flex items-center justify-center gap-1.5
              ${this.tab === t.id ? 'text-primary border-primary' : 'text-gray-500 border-transparent hover:text-gray-300'}">
              <i class="fas fa-${t.icon} text-[10px]"></i>
              <span class="hidden sm:inline">${t.label}</span>
              <span class="sm:hidden">${t.label.split(' ')[0]}</span>
            </button>
          `).join('')}
          <!-- Groups SPA link -->
          <button type="button" data-feed-tab="groups"
            class="flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-all
            ${this.tab === 'groups' ? 'text-primary border-primary' : 'text-gray-500 border-transparent hover:text-gray-300'}">
            <i class="fas fa-users text-[10px]"></i>
            <span class="hidden sm:inline">Groups</span>
          </button>
        </div>

        <!-- Feed -->
        <div id="feedList">
          ${this.tab === 'groups' ? this._renderGroupsInline() : feedContent}
        </div>
      </div>

      <!-- Composer modal -->
      ${this.renderComposerModal()}

      <!-- FAB -->
      ${!this.showComposer && this.tab !== 'announcements' && this.tab !== 'groups' ? `
        <button type="button" id="openComposer"
          class="fixed bottom-20 right-5 md:bottom-8 md:right-8 w-14 h-14 rounded-full bg-primary text-dark font-black text-2xl shadow-2xl shadow-primary/40 flex items-center justify-center z-40 hover:scale-110 transition-transform">
          <i class="fas fa-plus"></i>
        </button>` : ''}`;
  }

  _renderGroupsInline() {
    // Load groups inline — same page, no navigation
    if (!this._groupsData) {
      // Fetch groups and re-render
      fetch('/api/social/groups')
        .then(r => r.json())
        .then(data => {
          this._groupsData = data.success ? data : { groups: [], myGroupIds: [] };
          this._myGroupIds = new Set(data.myGroupIds || []);
          // Re-render the feed list only
          const feedList = document.getElementById('feedList');
          if (feedList) feedList.innerHTML = this._renderGroupsList();
          this._bindGroupEvents();
        })
        .catch(() => {
          const feedList = document.getElementById('feedList');
          if (feedList) feedList.innerHTML = '<p class="text-center text-gray-500 py-8">Failed to load groups</p>';
        });
      return '<div class="p-8 text-center text-gray-500 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Loading groups...</div>';
    }
    return this._renderGroupsList();
  }

  _renderGroupsList() {
    const groups = this._groupsData?.groups || [];
    const myIds = this._myGroupIds || new Set();
    const myGroups = groups.filter(g => myIds.has(g.id));
    const discover = groups.filter(g => !myIds.has(g.id));

    const renderRow = (g, isMember) => `
      <div class="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer group-inline-row" data-gid="${g.id}">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/20 flex items-center justify-center text-primary font-black text-lg shrink-0 border border-white/10 overflow-hidden">
          ${g.icon ? `<img src="${g.icon}" class="w-full h-full object-cover rounded-2xl">` : (g.name||'G').charAt(0).toUpperCase()}
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-white text-sm truncate">${this.esc(g.name)}</p>
          <p class="text-xs text-gray-500 mt-0.5">${g.memberCount||0} members</p>
        </div>
        <div class="shrink-0">
          ${isMember
            ? `<span class="text-[10px] text-primary font-bold bg-primary/10 px-2 py-1 rounded-full">Open</span>`
            : `<button type="button" class="join-inline-btn px-3 py-1.5 rounded-full border border-primary text-primary text-xs font-bold hover:bg-primary hover:text-dark transition-all" data-gid="${g.id}">Join</button>`}
        </div>
      </div>`;

    return `
      <div class="max-w-2xl mx-auto">
        ${myGroups.length ? `
          <div class="px-4 pt-4 pb-2"><p class="text-xs font-black text-gray-400 uppercase tracking-widest">My Groups</p></div>
          ${myGroups.map(g => renderRow(g, true)).join('')}
        ` : ''}
        <div class="px-4 pt-4 pb-2"><p class="text-xs font-black text-gray-400 uppercase tracking-widest">Groups You Might Like</p></div>
        ${discover.length ? discover.map(g => renderRow(g, false)).join('') : '<p class="text-center text-gray-600 text-sm py-6">No groups available</p>'}
      </div>`;
  }

  _bindGroupEvents() {
    // Open group chat INLINE — no page navigation
    document.querySelectorAll('.group-inline-row').forEach(row => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('.join-inline-btn')) return;
        const gid = row.dataset.gid;
        if (!this._myGroupIds?.has(gid)) return;
        // Open inline chat in the feed list
        await this._openInlineGroupChat(gid);
      });
    });
    // Join group
    document.querySelectorAll('.join-inline-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gid = btn.dataset.gid;
        const res = await fetch(`/api/social/groups/${gid}/join`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          if (!this._myGroupIds) this._myGroupIds = new Set();
          this._myGroupIds.add(gid);
          const feedList = document.getElementById('feedList');
          if (feedList) feedList.innerHTML = this._renderGroupsList();
          this._bindGroupEvents();
          this._toast('✅ Joined group!');
        }
      });
    });
  }

  async _openInlineGroupChat(gid) {
    const group = this._groupsData?.groups?.find(g => g.id === gid);
    if (!group) return;

    // Load messages
    const data = await fetch(`/api/social/groups/${gid}/messages`).then(r => r.json()).catch(() => ({}));
    const messages = data.messages || [];

    const feedList = document.getElementById('feedList');
    if (!feedList) return;

    feedList.innerHTML = `
      <div class="flex flex-col" style="height:calc(100vh - 160px);">
        <!-- Chat header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-white/10 sticky top-0 bg-dark z-10">
          <button type="button" id="backToGroupList" class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all shrink-0">
            <i class="fas fa-arrow-left text-sm"></i>
          </button>
          <div class="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-black shrink-0 overflow-hidden">
            ${group.icon ? `<img src="${group.icon}" class="w-full h-full object-cover">` : (group.name||'G').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-white text-sm truncate">${this.esc(group.name)}</p>
            <p class="text-[10px] text-gray-500">${group.memberCount||0} members</p>
          </div>
        </div>

        <!-- Messages -->
        <div id="inlineGroupMsgs" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          ${messages.length ? messages.map(m => this._renderGroupMsg(m)).join('') : '<p class="text-center text-gray-600 text-sm py-8">No messages yet. Say hello!</p>'}
        </div>

        <!-- Input -->
        <div class="px-3 py-3 border-t border-white/10 flex items-end gap-2 bg-dark">
          <label class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 cursor-pointer text-gray-400 hover:text-primary transition-all shrink-0">
            <i class="fas fa-image text-sm"></i>
            <input type="file" id="groupChatImage" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" class="hidden">
          </label>
          <input id="groupChatInput" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary/50 transition-all" placeholder="Message...">
          <button type="button" id="groupChatSend" class="w-9 h-9 rounded-xl bg-primary text-dark flex items-center justify-center shrink-0 hover:scale-105 transition-transform">
            <i class="fas fa-paper-plane text-sm"></i>
          </button>
        </div>
      </div>`;

    // Scroll to bottom
    const msgBox = document.getElementById('inlineGroupMsgs');
    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

    // Back button
    document.getElementById('backToGroupList')?.addEventListener('click', () => {
      const feedList = document.getElementById('feedList');
      if (feedList) feedList.innerHTML = this._renderGroupsList();
      this._bindGroupEvents();
    });

    // Send message
    const sendMsg = async () => {
      const input = document.getElementById('groupChatInput');
      const text = input?.value?.trim() || '';
      const fileInput = document.getElementById('groupChatImage');
      const file = fileInput?.files?.[0];
      let imageData = null;
      if (file) {
        imageData = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
        });
      }
      if (!text && !imageData) return;

      // Optimistic: show sending state
      const sendBtn = document.getElementById('groupChatSend');
      if (sendBtn) sendBtn.disabled = true;

      const res = await fetch(`/api/social/groups/${gid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageData })
      });
      const data = await res.json();

      if (sendBtn) sendBtn.disabled = false;

      if (!data.success) {
        if (data.error?.code === 'LINK_DETECTED') this._showLinkWarning(data.error.message);
        return;
      }
      if (input) input.value = '';
      if (fileInput) fileInput.value = '';

      // Append message to chat
      const msgBox = document.getElementById('inlineGroupMsgs');
      if (msgBox) {
        const tmp = document.createElement('div');
        tmp.innerHTML = this._renderGroupMsg(data.message);
        if (tmp.firstElementChild) {
          msgBox.appendChild(tmp.firstElementChild);
          msgBox.scrollTop = msgBox.scrollHeight;
        }
      }
    };

    document.getElementById('groupChatSend')?.addEventListener('click', sendMsg);
    document.getElementById('groupChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
  }

  _renderGroupMsg(m) {
    const isOwn = m.userId === this.user?.id;
    const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
    return `
      <div class="flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}">
        ${!isOwn ? `<div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">${(m.userName||'?').charAt(0).toUpperCase()}</div>` : ''}
        <div class="max-w-[75%]">
          ${!isOwn ? `<p class="text-[10px] text-primary font-bold mb-1 ml-1">${this.esc(m.userName)}</p>` : ''}
          <div class="rounded-2xl px-3 py-2 ${isOwn ? 'bg-primary text-dark rounded-br-sm' : 'bg-white/8 text-white rounded-bl-sm'}">
            ${m.imageUrl ? `<img src="${m.imageUrl}" class="rounded-xl max-h-48 mb-1 w-full object-cover">` : ''}
            ${m.text ? `<p class="text-sm leading-relaxed">${this.esc(m.text)}</p>` : ''}
          </div>
          <p class="text-[9px] text-gray-600 mt-1 ${isOwn ? 'text-right' : 'ml-1'}">${time}</p>
        </div>
      </div>`;
  }

  render() {
    const layout = this.user?.isAgent ? AgentLayout : UserLayout;
    layout.renderShell({ activeId: 'post', title: 'Movement', bodyHtml: this.renderBody(), user: this.user });
    this._bindEvents();
    // Bind per-post events
    this.posts.forEach(p => this._bindPostEvents(p.id));
    // If groups tab, bind group events after render
    if (this.tab === 'groups') {
      this._bindGroupEvents();
    }
  }

  _bindPostEvents(postId) {
    const el = document.querySelector(`[data-post-id="${postId}"]`);
    if (!el) return;

    // Increment view count — once per user per session (client-side dedup)
    if (!this._viewedPosts) this._viewedPosts = new Set();
    if (!this._viewedPosts.has(postId)) {
      this._viewedPosts.add(postId);
      // Server also deduplicates per userId
      fetch(`/api/social/posts/${postId}/view`, { method: 'POST' }).then(r => r.json()).then(data => {
        if (data.views) {
          const post = this.posts.find(p => p.id === postId);
          if (post) { post.views = data.views; this._rerenderPost(postId); }
        }
      }).catch(() => {});
    }

    // Like — optimistic update, instant feedback
    el.querySelector('.like-btn')?.addEventListener('click', () => this.toggleLike(postId));

    // Comment count click — toggle comments
    el.querySelector('.comment-count-btn')?.addEventListener('click', async () => {
      if (this.expandedComments.has(postId)) {
        this.expandedComments.delete(postId);
      } else {
        this.expandedComments.add(postId);
        await this.loadComments(postId);
      }
      this._rerenderPost(postId);
    });

    // Comment toggle button
    el.querySelector('.comment-toggle-btn')?.addEventListener('click', async () => {
      if (this.expandedComments.has(postId)) {
        this.expandedComments.delete(postId);
      } else {
        this.expandedComments.add(postId);
        await this.loadComments(postId);
      }
      this._rerenderPost(postId);
    });

    // Comment submit
    el.querySelector('.comment-submit-btn')?.addEventListener('click', () => this.submitComment(postId));
    el.querySelector(`#comment-input-${postId}`)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submitComment(postId); }
    });

    // Share — copy link to clipboard
    el.querySelector('.share-btn')?.addEventListener('click', async () => {
      const url = `${window.location.origin}/post`;
      try {
        await navigator.clipboard.writeText(url);
        this._toast('🔗 Link copied!');
      } catch (_) {
        this._toast('🔗 Share: ' + url);
      }
    });

    // Image lightbox
    el.querySelector('.post-img')?.addEventListener('click', (e) => {
      const src = e.target.src;
      if (!src) return;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
      overlay.innerHTML = `<img src="${src}" style="max-width:95vw;max-height:95vh;object-fit:contain;border-radius:12px;">`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });

    // Follow
    el.querySelector('.follow-post-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const uid = btn.dataset.uid;
      const res = await fetch(`/api/social/users/${uid}/follow`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const post = this.posts.find(p => p.userId === uid);
        if (post) post.following = data.following;
        this._rerenderPost(postId);
      }
    });

    // Report
    el.querySelector('.report-post-btn')?.addEventListener('click', async (e) => {
      const pid = e.currentTarget.dataset.pid;
      if (!confirm('Report this post?')) return;
      const res = await fetch(`/api/social/posts/${pid}/report`, { method: 'POST' });
      const data = await res.json();
      if (data.success) this._toast('Post reported');
    });
  }

  _bindEvents() {
    // Tabs
    document.querySelectorAll('[data-feed-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.feedTab;
        if (this.tab === 'groups') {
          this._groupsData = null; // reset so fresh load
        }
        this.render();
      });
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
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    // Render shell immediately — feed loads in background
    this.render();
    await Promise.all([this.loadFeed(), this.loadAnnouncements(), this.loadAds()]);
    this.render();
  }
}
