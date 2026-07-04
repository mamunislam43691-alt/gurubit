/**
 * NewsFeed — Announcement & News widget
 * Used in User, Agent, and Admin dashboards
 * Fetches from /api/social/announcements
 */

export class NewsFeed {
  constructor(containerId = 'newsFeedRoot') {
    this.containerId = containerId;
    this.items = [];
    this.expanded = new Set();
    this._wsUnsub = null;
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  typeMeta(type) {
    const map = {
      announcement: { label: '📢 Announcement', bg: 'bg-primary/15',   text: 'text-primary'  },
      news:         { label: '📰 News',          bg: 'bg-cyan-500/15',  text: 'text-cyan-400' },
      update:       { label: '🔧 Update',        bg: 'bg-yellow-500/15',text: 'text-yellow-400' },
      alert:        { label: '🚨 Alert',         bg: 'bg-red-500/15',   text: 'text-red-400'  }
    };
    return map[type] || map.announcement;
  }

  async load() {
    try {
      const res = await fetch('/api/social/announcements');
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        // Filter out expired items
        const now = new Date();
        this.items = (data.announcements || []).filter(a => {
          if (a.active === false) return false;
          if (a.expiresAt && new Date(a.expiresAt) < now) return false;
          return true;
        });
      }
    } catch (_) {}
    this.render();
  }

  renderItem(a) {
    const tm = this.typeMeta(a.type);
    const isYt = a.videoUrl && a.videoUrl.includes('youtube.com/embed/');
    const isExpanded = this.expanded.has(a.id);
    const hasLong = (a.body || '').length > 200;

    return `
      <article class="news-item ${a.pinned ? 'news-item--pinned' : ''}" data-ann-id="${a.id}">
        <!-- Header -->
        <div class="news-item-header">
          <span class="news-type-badge ${tm.bg} ${tm.text}">${tm.label}</span>
          ${a.pinned ? '<span class="news-pin-badge">📌</span>' : ''}
          <span class="news-time">${this.timeAgo(a.createdAt)}</span>
        </div>

        <!-- Title -->
        <h3 class="news-title">${this.esc(a.title)}</h3>

        <!-- Body text -->
        ${a.body ? `
          <div class="news-body ${!isExpanded && hasLong ? 'news-body--collapsed' : ''}">
            <p>${this.esc(a.body).replace(/\n/g, '<br>')}</p>
          </div>
          ${hasLong ? `<button type="button" class="news-expand-btn" data-expand="${a.id}">
            ${isExpanded ? '▲ Show less' : '▼ Read more'}
          </button>` : ''}
        ` : ''}

        <!-- Image -->
        ${a.imageUrl && !a.videoUrl ? `
          <div class="news-media">
            <img src="${a.imageUrl}" alt="${this.esc(a.title)}" class="news-image" loading="lazy">
          </div>` : ''}

        <!-- Video (YouTube embed or direct) -->
        ${a.videoUrl ? `
          <div class="news-media news-video-wrap">
            ${isYt
              ? `<iframe src="${a.videoUrl}" class="news-video" frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen loading="lazy" title="${this.esc(a.title)}"></iframe>`
              : `<video src="${a.videoUrl}" controls class="news-video" preload="none"></video>`}
          </div>` : ''}

        <!-- CTA Button -->
        ${a.linkUrl ? `
          <div class="news-cta">
            <a href="${this.esc(a.linkUrl)}" target="_blank" rel="noopener noreferrer" class="news-cta-btn">
              ${a.linkLabel ? this.esc(a.linkLabel) : 'Learn More'}
              <i class="fas fa-external-link-alt text-xs ml-1"></i>
            </a>
          </div>` : ''}
      </article>`;
  }

  render() {
    const root = document.getElementById(this.containerId);
    if (!root) return;

    if (this.items.length === 0) {
      root.innerHTML = `
        <div class="news-empty">
          <i class="fas fa-newspaper text-2xl opacity-20 block mb-2"></i>
          <p class="text-xs text-gray-600">No news or announcements yet</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="news-feed-list">
        ${this.items.map(a => this.renderItem(a)).join('')}
      </div>`;

    // Bind expand/collapse
    root.querySelectorAll('[data-expand]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.expand;
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        this.render();
      });
    });
  }

  // Subscribe to live WebSocket updates
  subscribeWs() {
    if (!window.GWS) return;
    this._wsUnsub = window.GWS.on('new_announcement', (data) => {
      if (data.announcement) {
        // Prepend or replace
        const idx = this.items.findIndex(a => a.id === data.announcement.id);
        if (idx >= 0) this.items[idx] = data.announcement;
        else this.items.unshift(data.announcement);
        // Re-sort: pinned first, then newest
        this.items.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        this.render();
        // Show toast
        if (window.showToast) window.showToast(`📢 ${data.announcement.title}`);
      }
    });
  }

  destroy() {
    if (this._wsUnsub) this._wsUnsub();
  }

  async init() {
    await this.load();
    this.subscribeWs();
  }

  // Static helper — render as a section with heading
  static async renderSection(containerId, title = 'News & Announcements') {
    const wrapper = document.getElementById(containerId);
    if (!wrapper) return null;
    wrapper.innerHTML = `
      <section class="news-feed-section">
        <div class="news-feed-heading">
          <i class="fas fa-newspaper text-primary mr-2"></i>${title}
        </div>
        <div id="${containerId}_inner"></div>
      </section>`;
    const feed = new NewsFeed(`${containerId}_inner`);
    await feed.init();
    return feed;
  }
}
