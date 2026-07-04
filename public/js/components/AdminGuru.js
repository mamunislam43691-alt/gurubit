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
      window.optimizedFetch('/api/admin/guru/posts'),
      window.optimizedFetch('/api/social/announcements').catch(() => ({}))
    ]);
    if (postsRes && postsRes.success) {
      this.posts = postsRes.posts;
      this.groups = postsRes.groups;
      this.settings = postsRes.settings;
    }
    if (annRes && annRes.success) this.announcements = annRes.announcements || [];
    this.render();
  }

  async deletePost(id) {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/admin/guru/posts/${id}`, { method: 'DELETE' });
    if (window.apiCache) window.apiCache.clear();
    await this.load();
  }

  async promote(id) {
    await fetch(`/api/admin/guru/posts/${id}/promote`, { method: 'POST' });
    if (window.apiCache) window.apiCache.clear();
    await this.load();
  }

  async suspendUser(userId) {
    if (!confirm('Suspend this user for 4 days?')) return;
    await fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 4 })
    });
    if (window.apiCache) window.apiCache.clear();
    alert('User suspended');
  }

  async banUser(userId) {
    if (!confirm('Ban this user permanently?')) return;
    await fetch(`/api/admin/users/${userId}/ban`, { method: 'PUT' });
    if (window.apiCache) window.apiCache.clear();
    alert('User banned');
  }

  fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    });
  }

  async adminPost() {
    const text = document.getElementById('adminPostText')?.value?.trim();
    const file = document.getElementById('adminPostImage')?.files?.[0];
    let imageData = null;
    if (file) imageData = await this.fileToDataUrl(file);
    if (!text && !imageData) return alert('Post cannot be empty');
    const btn = document.getElementById('adminPostSubmit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Posting...'; }
    const res = await fetch('/api/admin/guru/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, imageData, isAdminPost: true })
    });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.textContent = 'Post as Admin'; }
    if (data.success) {
      if (window.apiCache) window.apiCache.clear();
      document.getElementById('adminPostText').value = '';
      document.getElementById('adminPostImagePreview').innerHTML = '';
      await this.load();
    } else alert(data.error?.message || 'Failed');
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
      if (window.apiCache) window.apiCache.clear();
      document.getElementById('newGroupName').value = '';
      document.getElementById('newGroupDesc').value = '';
      await this.load();
    } else alert(data.error?.message || 'Failed');
  }

  async deleteGroup(id) {
    if (!confirm('Delete this group and all its messages?')) return;
    await fetch(`/api/admin/guru/groups/${id}`, { method: 'DELETE' });
    if (window.apiCache) window.apiCache.clear();
    await this.load();
  }

  async editGroup(id) {
    const form = document.getElementById(`edit-group-${id}`);
    if (form) form.classList.toggle('hidden');
  }

  async saveGroup(id) {
    const name = document.getElementById(`edit-name-${id}`)?.value?.trim();
    const description = document.getElementById(`edit-desc-${id}`)?.value?.trim();
    const logoFile = document.getElementById(`edit-logo-${id}`)?.files?.[0];
    let icon = null;
    if (logoFile) icon = await this.fileToDataUrl(logoFile);
    const body = { name, description };
    if (icon) body.icon = icon;
    const res = await fetch(`/api/admin/guru/groups/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      if (window.apiCache) window.apiCache.clear();
      await this.load();
    }
    else alert(data.error?.message || 'Failed');
  }

  async viewGroupChat(id) {
    const chatDiv = document.getElementById(`group-chat-${id}`);
    if (!chatDiv) return;
    chatDiv.classList.toggle('hidden');
    if (!chatDiv.classList.contains('hidden')) {
      await this.loadGroupMessages(id);
    }
  }

  async loadGroupMessages(groupId) {
    const container = document.getElementById(`group-msgs-${groupId}`);
    if (!container) return;
    const data = await window.optimizedFetch(`/api/social/groups/${groupId}/messages`);
    if (data && data.success && data.messages.length) {
      container.innerHTML = data.messages.map(m => `
        <div class="flex items-start gap-2">
          <div class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[9px] font-black shrink-0">
            ${(m.userName||'?').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 bg-white/5 rounded-xl px-3 py-1.5">
            <p class="text-[10px] font-bold text-primary">${this.esc(m.userName)}</p>
            <p class="text-xs text-gray-300">${this.esc(m.text||'')}</p>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">No messages yet</p>';
    }
  }

  async sendGroupMessage(groupId) {
    const input = document.getElementById(`admin-msg-${groupId}`);
    const text = input?.value?.trim();
    if (!text) return;
    const res = await fetch(`/api/admin/guru/groups/${groupId}/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success) {
      if (window.apiCache) window.apiCache.clear();
      if (input) input.value = '';
      await this.loadGroupMessages(groupId);
    } else alert(data.error?.message || 'Failed');
  }

  async createAnnouncement() {
    const title       = document.getElementById('annTitle')?.value?.trim();
    const body        = document.getElementById('annBody')?.value?.trim();
    const linkLabel   = document.getElementById('annLinkLabel')?.value?.trim();
    const linkUrl     = document.getElementById('annLinkUrl')?.value?.trim();
    const videoUrl    = document.getElementById('annVideoUrl')?.value?.trim();
    const pinned      = document.getElementById('annPinned')?.checked || false;
    const typeRadio   = document.querySelector('.ann-type-radio:checked');
    const type        = typeRadio?.value || 'announcement';
    const file        = document.getElementById('annImage')?.files?.[0];
    if (!title) return alert('Title required');

    let imageData = null;
    if (file) imageData = await this.fileToDataUrl(file);

    const btn = document.getElementById('createAnnBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Publishing...'; }

    const res = await fetch('/api/social/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, imageData, videoUrl: videoUrl || null, linkUrl: linkUrl || null, linkLabel: linkLabel || null, type, pinned })
    });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish'; }
    if (data.success) {
      if (window.apiCache) window.apiCache.clear();
      ['annTitle','annBody','annVideoUrl','annLinkLabel','annLinkUrl'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const pin = document.getElementById('annPinned'); if (pin) pin.checked = false;
      const prev = document.getElementById('annImagePreview'); if (prev) prev.innerHTML = '';
      const fi = document.getElementById('annImage'); if (fi) fi.value = '';
      await this.load();
    } else alert(data.error?.message || 'Failed');
  }

  async deleteAnnouncement(id) {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/social/announcements/${id}`, { method: 'DELETE' });
    if (window.apiCache) window.apiCache.clear();
    await this.load();
  }

  async togglePinAnn(id, currentlyPinned) {
    await fetch(`/api/social/announcements/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !currentlyPinned })
    });
    if (window.apiCache) window.apiCache.clear();
    await this.load();
  }



  renderPosts() {
    return `
      <!-- Admin post composer -->
      <div class="glass-card p-5 mb-5">
        <h4 class="font-black text-white text-sm uppercase mb-3"><i class="fas fa-pen text-primary mr-2"></i> Post as Admin</h4>
        <textarea id="adminPostText" class="input-field w-full mb-2 min-h-[80px]" placeholder="Announcement or update..."></textarea>
        <div class="flex items-center gap-3 mt-2">
          <label class="text-xs text-primary font-bold uppercase cursor-pointer flex items-center gap-1">
            <i class="fas fa-image"></i> Image
            <input type="file" id="adminPostImage" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" class="hidden">
          </label>
          <div id="adminPostImagePreview" class="flex-1"></div>
          <button type="button" id="adminPostSubmit" class="neon-btn px-5 py-2 text-xs uppercase ml-auto">Post as Admin</button>
        </div>
      </div>

      <!-- Posts list — same as user panel -->
      <div class="space-y-0 w-full">
        ${this.posts.length ? this.posts.map((p) => this._renderPost(p)).join('') : '<p class="text-gray-500 text-sm text-center py-8">No posts yet</p>'}
      </div>`;
  }

  _renderPost(p) {
    const likes = p.likes || 0;
    const views = p.views || 0;
    const commentCount = p.commentCount || 0;
    return `
      <div class="border-b border-white/5 px-4 py-4 hover:bg-white/[0.015] transition-all" data-admin-post-id="${p.id}">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-cyan-500/20 flex items-center justify-center text-primary font-black text-sm border border-white/10 shrink-0">
            ${p.profilePhotoUrl
              ? `<img src="${p.profilePhotoUrl}" class="w-10 h-10 rounded-full object-cover">`
              : (p.userName||'?').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-white text-sm">${this.esc(p.userName)}</span>
              ${p.isAdmin ? '<span class="text-[10px] text-primary font-black bg-primary/10 px-2 py-0.5 rounded-full uppercase">Admin</span>' : ''}
              ${p.isPromoted ? '<span class="text-[10px] text-yellow-400 font-black bg-yellow-400/10 px-2 py-0.5 rounded-full uppercase">📌 Pinned</span>' : ''}
              <span class="text-[10px] text-gray-500 ml-auto">${this.timeAgo(p.createdAt)}</span>
              <!-- Three-dot menu -->
              <div class="relative" style="position:relative;">
                <button type="button" class="post-menu-btn w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all" data-pid="${p.id}">
                  <i class="fas fa-ellipsis-v text-xs"></i>
                </button>
                <div class="post-menu-dropdown hidden absolute right-0 top-8 z-50 bg-[#0a1e3b] border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[140px]" id="pmenu-${p.id}">
                  <button type="button" data-promote="${p.id}" class="w-full text-left px-4 py-2.5 text-xs font-bold text-primary hover:bg-white/5 flex items-center gap-2">
                    <i class="fas fa-thumbtack w-4"></i> Pin Post
                  </button>
                  <button type="button" data-del="${p.id}" class="w-full text-left px-4 py-2.5 text-xs font-bold text-red-400 hover:bg-white/5 flex items-center gap-2">
                    <i class="fas fa-trash w-4"></i> Delete
                  </button>
                  ${p.userId && p.userId !== 'admin' ? `
                  <div class="border-t border-white/5"></div>
                  <button type="button" data-suspend="${p.userId}" class="w-full text-left px-4 py-2.5 text-xs font-bold text-orange-400 hover:bg-white/5 flex items-center gap-2">
                    <i class="fas fa-clock w-4"></i> Suspend 4d
                  </button>
                  <button type="button" data-ban="${p.userId}" class="w-full text-left px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-white/5 flex items-center gap-2">
                    <i class="fas fa-ban w-4"></i> Ban User
                  </button>` : ''}
                </div>
              </div>
            </div>
            ${p.text ? `<p class="text-gray-200 text-sm mt-2 whitespace-pre-wrap leading-relaxed">${this.esc(p.text)}</p>` : ''}
            ${p.imageUrl ? `<img src="${p.imageUrl}" class="rounded-xl mt-3 max-h-80 w-full object-cover border border-white/5" loading="lazy">` : ''}
            ${p.reportCount > 0 ? `<p class="text-[10px] text-red-400 mt-1"><i class="fas fa-flag mr-1"></i>${p.reportCount} report(s)</p>` : ''}
            <!-- Stats -->
            <div class="flex items-center justify-between mt-2 mb-1 text-[11px] text-gray-500">
              <span>${likes > 0 ? `<i class="fas fa-thumbs-up text-primary text-[10px] mr-1"></i>${likes}` : ''}</span>
              <span class="flex items-center gap-3">
                ${commentCount > 0 ? `<span>${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>` : ''}
                ${views > 0 ? `<span><i class="fas fa-eye text-[10px] mr-1"></i>${views}</span>` : ''}
              </span>
            </div>
          </div>
        </div>
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
          <div class="glass-card p-4">
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-black text-lg border border-white/10 overflow-hidden">
                  ${g.icon ? `<img src="${g.icon}" class="w-full h-full object-cover">` : (g.name||'G').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p class="font-bold text-white">${this.esc(g.name)}</p>
                  <p class="text-xs text-gray-400 mt-0.5">${g.memberCount||0} members · ${g.messageCount||0} messages · ${g.activeCount||0} active</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" data-view-group="${g.id}" class="text-xs text-primary font-bold uppercase hover:underline">View Chat</button>
                <button type="button" data-edit-group="${g.id}" data-group-name="${this.esc(g.name)}" class="text-xs text-yellow-400 font-bold uppercase hover:underline">Edit</button>
                <button type="button" data-del-group="${g.id}" class="text-xs text-red-400 font-bold uppercase hover:underline">Delete</button>
              </div>
            </div>
            <!-- Edit form (hidden by default) -->
            <div id="edit-group-${g.id}" class="hidden border-t border-white/10 pt-3 mt-1">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <input type="text" id="edit-name-${g.id}" class="input-field text-sm" value="${this.esc(g.name)}" placeholder="Group name">
                <input type="text" id="edit-desc-${g.id}" class="input-field text-sm" value="${this.esc(g.description||'')}" placeholder="Description">
              </div>
              <div class="flex items-center gap-3 mb-2">
                <label class="text-xs text-primary font-bold uppercase cursor-pointer">
                  <i class="fas fa-image mr-1"></i> Change Logo
                  <input type="file" id="edit-logo-${g.id}" accept="image/*" class="hidden">
                </label>
                ${g.icon ? `<img src="${g.icon}" class="w-8 h-8 rounded-lg object-cover border border-white/10">` : ''}
              </div>
              <button type="button" data-save-group="${g.id}" class="neon-btn px-4 py-1.5 text-xs uppercase">Save Changes</button>
            </div>
            <!-- Group messages preview -->
            <div id="group-chat-${g.id}" class="hidden border-t border-white/10 pt-3 mt-1">
              <div class="max-h-64 overflow-y-auto space-y-2 mb-3" id="group-msgs-${g.id}">
                <p class="text-gray-500 text-xs text-center py-4">Loading messages...</p>
              </div>
              <!-- Admin send message -->
              <div class="flex items-center gap-2">
                <input type="text" id="admin-msg-${g.id}" class="input-field flex-1 text-sm py-2" placeholder="Send message as admin...">
                <button type="button" data-send-group="${g.id}" class="neon-btn px-4 py-2 text-xs uppercase shrink-0">Send</button>
              </div>
            </div>
          </div>
        `).join('') || '<p class="text-gray-500 text-sm text-center py-8">No groups yet</p>'}
      </div>`;
  }

  renderAnnouncements() {
    const typeMeta = {
      announcement: { label: '📢 Announcement', color: 'primary' },
      news:         { label: '📰 News',         color: 'cyan' },
      update:       { label: '🔧 Update',       color: 'yellow' },
      alert:        { label: '🚨 Alert',        color: 'red' }
    };

    return `
      <!-- Create / Edit Form -->
      <div class="glass-card p-6 mb-6 border border-primary/20">
        <h4 class="font-black text-white text-sm uppercase mb-4 flex items-center gap-2">
          <i class="fas fa-bullhorn text-primary"></i> New News / Announcement
        </h4>

        <!-- Type selector -->
        <div class="flex gap-2 mb-3 flex-wrap">
          ${Object.entries(typeMeta).map(([k, v]) => `
            <label class="cursor-pointer">
              <input type="radio" name="annType" value="${k}" class="hidden ann-type-radio" ${k === 'announcement' ? 'checked' : ''}>
              <span class="ann-type-pill px-3 py-1.5 rounded-lg text-xs font-bold border transition-all border-white/10 text-gray-400 hover:border-primary/40">${v.label}</span>
            </label>`).join('')}
        </div>

        <input type="text" id="annTitle" class="input-field w-full mb-2" placeholder="Title (required) *">
        <textarea id="annBody" class="input-field w-full mb-3 min-h-[80px]" placeholder="Body text (optional)..."></textarea>

        <!-- Media row -->
        <div class="grid sm:grid-cols-2 gap-2 mb-3">
          <div>
            <label class="text-xs text-primary font-bold uppercase mb-1 flex items-center gap-1 cursor-pointer">
              <i class="fas fa-image"></i> Image
              <input type="file" id="annImage" accept="image/*" class="hidden">
            </label>
            <div id="annImagePreview" class="text-xs text-gray-500"></div>
          </div>
          <div>
            <label class="text-xs text-yellow-400 font-bold uppercase mb-1 block">
              <i class="fab fa-youtube"></i> Video URL (YouTube / direct)
            </label>
            <input type="url" id="annVideoUrl" class="input-field w-full text-sm" placeholder="https://youtube.com/watch?v=...">
          </div>
        </div>

        <!-- CTA Button row -->
        <div class="grid sm:grid-cols-2 gap-2 mb-2">
          <input type="text" id="annLinkLabel" class="input-field text-sm" placeholder="Button text (e.g. Learn More)">
          <input type="url" id="annLinkUrl" class="input-field text-sm" placeholder="Button URL (https://...)">
        </div>
        <p class="text-[10px] text-gray-600 mb-3">Fill both button fields to add a CTA button.</p>

        <!-- Options row -->
        <div class="flex items-center gap-4 mb-4">
          <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" id="annPinned" class="accent-cyan-500">
            <span class="text-xs font-bold uppercase text-primary">📌 Pin to top</span>
          </label>
        </div>

        <div class="flex gap-2">
          <button type="button" id="createAnnBtn" class="neon-btn px-6 py-2.5 text-xs uppercase flex items-center gap-2">
            <i class="fas fa-paper-plane"></i> Publish
          </button>
          <button type="button" id="clearAnnFormBtn" class="px-4 py-2.5 text-xs uppercase border border-white/10 rounded-lg text-gray-400 hover:bg-white/5">
            Clear
          </button>
        </div>
      </div>

      <!-- List -->
      <div class="space-y-4">
        ${this.announcements.length === 0
          ? '<div class="glass-card p-10 text-center text-gray-500"><i class="fas fa-newspaper text-3xl block mb-3 opacity-30"></i>No posts yet — create your first above.</div>'
          : this.announcements.map((a) => {
              const tm = typeMeta[a.type] || typeMeta.announcement;
              const isYt = a.videoUrl && a.videoUrl.includes('youtube.com/embed/');
              return `
              <div class="glass-card p-5 border ${a.pinned ? 'border-primary/30' : 'border-white/5'}">
                <div class="flex items-start justify-between gap-3 mb-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black bg-${tm.color}-500/15 text-${tm.color}-400 uppercase">${tm.label}</span>
                    ${a.pinned ? '<span class="text-[10px] text-primary font-bold">📌 Pinned</span>' : ''}
                    <span class="text-[10px] text-gray-500">${this.timeAgo(a.createdAt)}</span>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button type="button" data-pin-ann="${a.id}" data-pinned="${!!a.pinned}"
                      class="text-xs ${a.pinned ? 'text-primary' : 'text-gray-500'} hover:text-primary font-bold">
                      <i class="fas fa-thumbtack"></i>
                    </button>
                    <button type="button" data-del-ann="${a.id}" class="text-xs text-red-400 font-bold hover:underline">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <h3 class="font-black text-white text-base mb-1">${this.esc(a.title)}</h3>
                ${a.body ? `<p class="text-sm text-gray-300 leading-relaxed mb-3">${this.esc(a.body).replace(/\n/g, '<br>')}</p>` : ''}
                ${a.imageUrl && !a.videoUrl ? `<img src="${a.imageUrl}" class="rounded-xl w-full max-h-72 object-cover border border-white/5 mb-3" loading="lazy">` : ''}
                ${a.videoUrl ? `
                  <div class="mb-3 rounded-xl overflow-hidden border border-white/5 bg-black aspect-video">
                    ${isYt
                      ? `<iframe src="${a.videoUrl}" class="w-full h-full" frameborder="0" allowfullscreen loading="lazy"></iframe>`
                      : `<video src="${a.videoUrl}" controls class="w-full h-full" preload="none"></video>`}
                  </div>` : ''}
                ${a.linkUrl ? `
                  <a href="${this.esc(a.linkUrl)}" target="_blank" rel="noopener"
                    class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30 font-black text-sm hover:bg-primary/30 transition-all">
                    ${a.linkLabel ? this.esc(a.linkLabel) : 'Learn More'}
                    <i class="fas fa-external-link-alt text-xs"></i>
                  </a>` : ''}
              </div>`;
            }).join('')}
      </div>`;
  }

  async togglePinAnn(id, currentlyPinned) {
    await fetch(`/api/social/announcements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !currentlyPinned })
    });
    if (window.apiCache) window.apiCache.clear();
    await this.load();
  }



  renderBody() {
    const tabs = [
      { id: 'posts',         label: 'Movement',      icon: 'bolt' },
      { id: 'groups',        label: 'Groups',         icon: 'users' },
      { id: 'announcements', label: 'Announcements',  icon: 'bullhorn' }
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
        : this.renderAnnouncements()}`;
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
    document.getElementById('adminPostImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const preview = document.getElementById('adminPostImagePreview');
      if (preview) {
        const url = await this.fileToDataUrl(f);
        preview.innerHTML = `<div class="relative inline-block"><img src="${url}" class="rounded-xl max-h-24 border border-white/10"><button type="button" id="removeAdminImg" class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">&times;</button></div>`;
        document.getElementById('removeAdminImg')?.addEventListener('click', () => {
          preview.innerHTML = '';
          e.target.value = '';
        });
      }
    });

    // Three-dot menu toggle
    document.querySelectorAll('.post-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        const menu = document.getElementById(`pmenu-${pid}`);
        // Close all other menus
        document.querySelectorAll('.post-menu-dropdown').forEach(m => {
          if (m.id !== `pmenu-${pid}`) m.classList.add('hidden');
        });
        menu?.classList.toggle('hidden');
      });
    });
    // Close menus on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.post-menu-dropdown').forEach(m => m.classList.add('hidden'));
    }, { once: false });
    document.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => this.deletePost(btn.dataset.del)));
    document.querySelectorAll('[data-promote]').forEach((btn) => btn.addEventListener('click', () => this.promote(btn.dataset.promote)));
    document.querySelectorAll('[data-suspend]').forEach((btn) => btn.addEventListener('click', () => this.suspendUser(btn.dataset.suspend)));
    document.querySelectorAll('[data-ban]').forEach((btn) => btn.addEventListener('click', () => this.banUser(btn.dataset.ban)));

    // Groups
    document.getElementById('createGroupBtn')?.addEventListener('click', () => this.createGroup());
    document.querySelectorAll('[data-del-group]').forEach((btn) => btn.addEventListener('click', () => this.deleteGroup(btn.dataset.delGroup)));
    document.querySelectorAll('[data-edit-group]').forEach((btn) => btn.addEventListener('click', () => this.editGroup(btn.dataset.editGroup)));
    document.querySelectorAll('[data-save-group]').forEach((btn) => btn.addEventListener('click', () => this.saveGroup(btn.dataset.saveGroup)));
    document.querySelectorAll('[data-view-group]').forEach((btn) => btn.addEventListener('click', () => this.viewGroupChat(btn.dataset.viewGroup)));
    document.querySelectorAll('[data-send-group]').forEach((btn) => btn.addEventListener('click', () => this.sendGroupMessage(btn.dataset.sendGroup)));
    this.groups.forEach(g => {
      document.getElementById(`admin-msg-${g.id}`)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.sendGroupMessage(g.id);
      });
    });

    // Announcements
    document.getElementById('createAnnBtn')?.addEventListener('click', () => this.createAnnouncement());

    document.getElementById('clearAnnFormBtn')?.addEventListener('click', () => {
      ['annTitle','annBody','annVideoUrl','annLinkLabel','annLinkUrl'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const pin = document.getElementById('annPinned'); if (pin) pin.checked = false;
      const prev = document.getElementById('annImagePreview'); if (prev) prev.innerHTML = '';
      const fi = document.getElementById('annImage'); if (fi) fi.value = '';
    });

    // Type pill active state
    document.querySelectorAll('.ann-type-radio').forEach(r => {
      r.addEventListener('change', () => {
        document.querySelectorAll('.ann-type-pill').forEach(p => {
          p.classList.remove('border-primary','text-primary','bg-primary/10');
          p.classList.add('border-white/10','text-gray-400');
        });
        const pill = r.nextElementSibling;
        if (pill) { pill.classList.add('border-primary','text-primary','bg-primary/10'); pill.classList.remove('border-white/10','text-gray-400'); }
      });
      if (r.checked) {
        const pill = r.nextElementSibling;
        if (pill) { pill.classList.add('border-primary','text-primary','bg-primary/10'); pill.classList.remove('border-white/10','text-gray-400'); }
      }
    });

    document.getElementById('annImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const preview = document.getElementById('annImagePreview');
      if (preview) {
        const url = await this.fileToDataUrl(f);
        preview.innerHTML = `<div class="relative inline-block mt-1"><img src="${url}" class="rounded-xl max-h-24 border border-white/10"><button type="button" id="removeAnnImg" class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">&times;</button></div>`;
        document.getElementById('removeAnnImg')?.addEventListener('click', () => { preview.innerHTML = ''; e.target.value = ''; });
      }
    });

    document.querySelectorAll('[data-del-ann]').forEach((btn) => btn.addEventListener('click', () => this.deleteAnnouncement(btn.dataset.delAnn)));
    document.querySelectorAll('[data-pin-ann]').forEach((btn) => btn.addEventListener('click', () => this.togglePinAnn(btn.dataset.pinAnn, btn.dataset.pinned === 'true')));

  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    // Render shell immediately — data loads in background
    this.render();
    await this.load();
  }
}
