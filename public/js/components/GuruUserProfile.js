/**
 * Guru — public user profile (SMS, revenue, posts, follow)
 */

import { UserLayout } from '../utils/UserLayout.js';

export class GuruUserProfile {
  constructor(userId) {
    this.userId = userId;
    this.user = null;
    this.profile = null;
    this.posts = [];
    this.following = false;
  }

  esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  badge() {
    if (this.profile?.blueVerified) {
      return '<span class="guru-badge guru-badge-blue"><i class="fas fa-check"></i></span>';
    }
    return '';
  }

  async load() {
    const data = await fetch(`/api/social/users/${this.userId}/profile`).then((r) => r.json());
    if (!data.success) {
      window.location.href = '/guru';
      return;
    }
    this.profile = data.profile;
    this.posts = data.posts || [];
    this.following = data.following;
  }

  renderPost(p) {
    return `
      <article class="guru-post glass-card p-5 mb-4">
        <p class="text-gray-200 whitespace-pre-wrap">${this.esc(p.text)}</p>
        ${p.imageUrl ? `<img src="${p.imageUrl}" class="rounded-xl max-h-64 w-full object-cover mt-3">` : ''}
        <p class="text-[10px] text-gray-500 mt-2">${new Date(p.createdAt).toLocaleString()}</p>
      </article>`;
  }

  renderBody() {
    const p = this.profile;
    if (!p) return '<p class="text-gray-500">Loading...</p>';
    const photo = p.profilePhotoUrl
      ? `<img src="${p.profilePhotoUrl}" class="w-20 h-20 rounded-full object-cover border border-primary/30">`
      : `<div class="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-black">${(p.name || '?').charAt(0)}</div>`;
    return `
      <a href="/guru" class="text-primary text-sm font-bold uppercase mb-4 inline-block"><i class="fas fa-arrow-left"></i> Guru</a>
      <div class="glass-card p-6 mb-6 flex flex-wrap items-center gap-4">
        ${photo}
        <div class="flex-1 min-w-0">
          <h2 class="text-xl font-black text-white flex items-center gap-2">${this.esc(p.name)} ${this.badge()}</h2>
          ${p.isAgent ? '<p class="text-xs text-primary uppercase font-bold">Agent</p>' : ''}
        </div>
        <button type="button" id="followUserBtn" class="neon-btn px-5 py-2 text-xs uppercase">
          ${this.following ? 'Unfollow' : 'Follow'}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="glass-card p-4 text-center"><p class="stat-label">Total SMS</p><p class="text-xl font-black text-white">${p.totalSms || 0}</p></div>
        <div class="glass-card p-4 text-center"><p class="stat-label">Revenue</p><p class="text-xl font-black text-primary">$${(p.revenue || 0).toFixed(2)}</p></div>
      </div>
      <p class="stat-label mb-3">Posts</p>
      ${this.posts.length ? this.posts.map((post) => this.renderPost(post)).join('') : '<p class="text-gray-500">No posts yet</p>'}`;
  }

  render() {
    UserLayout.renderShell({
      activeId: 'guru',
      title: this.profile?.name || 'Profile',
      bodyHtml: this.renderBody(),
      user: this.user
    });
    document.getElementById('followUserBtn')?.addEventListener('click', async () => {
      const res = await fetch(`/api/social/users/${this.userId}/follow`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.following = data.following;
        this.render();
      }
    });
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    await this.load();
    this.render();
  }
}
