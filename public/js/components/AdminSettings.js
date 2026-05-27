import { AdminLayout } from './AdminLayout.js';

export class AdminSettings {
  constructor() {
    this.system = null;
    this.config = null;
    this.ads = null;
    this.admin = null;
  }

  async loadData() {
    try {
      const [sysRes, confRes, adsRes] = await Promise.all([
        fetch('/api/admin/settings/system'),
        fetch('/api/admin/settings/config'),
        fetch('/api/admin/settings/ads')
      ]).catch(e => {
        console.error('Fetch error:', e);
        return [null, null, null];
      });

      if (sysRes && sysRes.ok) {
        const contentType = sysRes.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const sysData = await sysRes.json();
          if (sysData.success) this.system = sysData.system;
        }
      }

      if (confRes && confRes.ok) {
        const contentType = confRes.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const confData = await confRes.json();
          if (confData.success) this.config = confData.config;
        }
      }

      if (adsRes && adsRes.ok) {
        const adsData = await adsRes.json().catch(() => ({}));
        if (adsData.success) this.ads = adsData.ads;
      }
    } catch (e) {
      console.error('Failed to parse settings JSON:', e);
    }
  }

  esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  renderAdsSection() {
    const a = this.ads || {};
    return `
      <div class="glass-card p-6 border-white/5 md:col-span-3">
        <div class="flex items-center justify-between mb-5">
          <div>
            <p class="stat-label">Movement Ads</p>
            <p class="text-xs text-gray-500 mt-1">Ads appear between posts in the Movement feed — like Facebook ads</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="adsEnabled" class="sr-only peer" ${a.enabled ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <!-- Frequency -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label class="stat-label block mb-1">Show ad every N posts</label>
            <input type="number" id="adsFrequency" class="input-field w-full" min="1" max="20" value="${a.frequency || 5}" placeholder="5">
            <p class="text-[10px] text-gray-600 mt-1">e.g. 5 = show ad after every 5 posts</p>
          </div>
          <div>
            <label class="stat-label block mb-1">Ad Label</label>
            <input type="text" id="adsLabel" class="input-field w-full" value="${this.esc(a.label || 'Sponsored')}" placeholder="Sponsored">
          </div>
        </div>

        <!-- Ads list -->
        <div class="mb-4">
          <p class="stat-label mb-3">Active Ads <span class="text-gray-600 font-normal normal-case">(${(a.items || []).length} total)</span></p>
          <div class="space-y-3" id="adsList">
            ${(a.items || []).map((ad, i) => `
              <div class="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                ${ad.imageUrl ? `<img src="${ad.imageUrl}" class="w-16 h-12 rounded-lg object-cover shrink-0 border border-white/10">` : '<div class="w-16 h-12 rounded-lg bg-white/5 flex items-center justify-center text-gray-600 shrink-0"><i class="fas fa-image"></i></div>'}
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-white text-sm truncate">${this.esc(ad.title || 'Ad')}</p>
                  <p class="text-xs text-gray-400 truncate">${this.esc(ad.description || '')}</p>
                  ${ad.linkUrl ? `<a href="${this.esc(ad.linkUrl)}" target="_blank" class="text-[10px] text-primary truncate block">${this.esc(ad.linkUrl)}</a>` : ''}
                </div>
                <button type="button" data-del-ad="${i}" class="text-xs text-red-400 font-bold uppercase hover:underline shrink-0">Remove</button>
              </div>
            `).join('') || '<p class="text-gray-600 text-xs text-center py-4">No ads yet. Add one below.</p>'}
          </div>
        </div>

        <!-- Add new ad -->
        <div class="border-t border-white/10 pt-4">
          <p class="stat-label mb-3">Add New Ad</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input type="text" id="newAdTitle" class="input-field" placeholder="Ad title (e.g. Earn More with GURUBIT)">
            <input type="text" id="newAdDesc" class="input-field" placeholder="Short description">
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input type="url" id="newAdLink" class="input-field" placeholder="Click URL (https://...)">
            <div>
              <label class="stat-label block mb-1">Ad Image (optional)</label>
              <label class="flex items-center gap-2 cursor-pointer text-xs text-primary font-bold">
                <i class="fas fa-upload"></i> Upload Image
                <input type="file" id="newAdImage" accept="image/*" class="hidden">
              </label>
              <div id="newAdImagePreview" class="mt-2"></div>
            </div>
          </div>
          <div class="flex gap-3">
            <button type="button" id="addAdBtn" class="neon-btn px-5 py-2 text-xs uppercase">Add Ad</button>
            <button type="button" id="saveAdsBtn" class="px-5 py-2 text-xs uppercase border border-primary text-primary rounded-lg hover:bg-primary/10 transition-all">Save All Settings</button>
          </div>
        </div>
      </div>`;
  }

  renderBody() {
    const s = this.system;
    if (!s) return '<p class="text-gray-500">Loading...</p>';

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="glass-card p-6 border-white/5">
          <p class="stat-label">Server</p>
          <p class="text-white font-mono text-sm mt-2">${s.hostname}</p>
          <p class="text-gray-500 text-xs mt-1">${s.platform} · Node ${s.nodeVersion}</p>
          <p class="text-primary text-xs mt-2">Uptime: ${Math.floor(s.uptimeSeconds / 60)} min</p>
        </div>
        <div class="glass-card p-6 border-white/5">
          <p class="stat-label">CPU</p>
          <p class="text-3xl font-black text-white">${s.cpuCores} <span class="text-sm text-gray-500">cores</span></p>
          <p class="text-gray-500 text-xs mt-2">Load: ${s.loadAvg.map((n) => n.toFixed(2)).join(' / ')}</p>
        </div>
        <div class="glass-card p-6 border-white/5">
          <p class="stat-label">Memory</p>
          <p class="text-3xl font-black text-white">${s.memory.systemUsedPercent}%</p>
          <p class="text-gray-500 text-xs mt-2">Heap ${s.memory.heapUsedMb}MB / ${s.memory.heapTotalMb}MB · RSS ${s.memory.rssMb}MB</p>
        </div>
        <div class="glass-card p-6 border-white/5 md:col-span-2">
          <p class="stat-label">Database records</p>
          <div class="grid grid-cols-3 gap-4 mt-4">
            <div><p class="text-2xl font-black text-primary">${s.database.users}</p><p class="text-[10px] text-gray-500 uppercase">Users</p></div>
            <div><p class="text-2xl font-black text-primary">${s.database.messages}</p><p class="text-[10px] text-gray-500 uppercase">SMS</p></div>
            <div><p class="text-2xl font-black text-primary">${s.database.numbers}</p><p class="text-[10px] text-gray-500 uppercase">Numbers</p></div>
          </div>
        </div>
        <div class="glass-card p-6 border-white/5">
          <p class="stat-label">Environment</p>
          <p class="text-white font-bold uppercase mt-2">${s.environment}</p>
          <p class="text-gray-500 text-xs mt-4">Firebase, SMTP, and API keys are configured via .env and Provider section.</p>
        </div>

        <div class="glass-card p-6 border-white/5 md:col-span-3">
          <p class="stat-label">System Access Control</p>
          <div class="flex items-center justify-between mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
            <div>
              <p class="text-white font-bold">Guest Login (Continue as Guest User)</p>
              <p class="text-gray-400 text-xs mt-1">Allow visitors to sign in and test the system with a single click.</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="guestToggle" class="sr-only peer" ${this.config?.allowGuestLogin ? 'checked' : ''}>
              <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        ${this.renderAdsSection()}
      </div>`;
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'settings',
      title: 'Settings',
      subtitle: 'System monitoring, access control & ads',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    // Guest toggle
    document.getElementById('guestToggle')?.addEventListener('change', async (e) => {
      const allowed = e.target.checked;
      try {
        const res = await fetch('/api/admin/settings/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowGuestLogin: allowed })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          alert(data?.error?.message || 'Failed to update setting.');
          e.target.checked = !allowed;
        } else if (this.config) {
          this.config.allowGuestLogin = allowed;
        }
      } catch (err) {
        alert('Network error.');
        e.target.checked = !allowed;
      }
    });

    // Ads image preview
    document.getElementById('newAdImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const preview = document.getElementById('newAdImagePreview');
        if (preview) preview.innerHTML = `<img src="${reader.result}" class="w-20 h-14 rounded-lg object-cover border border-white/10">`;
        this._pendingAdImage = reader.result;
      };
      reader.readAsDataURL(f);
    });

    // Add ad
    document.getElementById('addAdBtn')?.addEventListener('click', () => {
      const title = document.getElementById('newAdTitle')?.value?.trim();
      const description = document.getElementById('newAdDesc')?.value?.trim();
      const linkUrl = document.getElementById('newAdLink')?.value?.trim();
      const imageUrl = this._pendingAdImage || null;
      if (!title) return alert('Ad title required');
      if (!this.ads) this.ads = { enabled: false, frequency: 5, label: 'Sponsored', items: [] };
      if (!this.ads.items) this.ads.items = [];
      this.ads.items.push({ title, description, linkUrl, imageUrl, createdAt: new Date().toISOString() });
      this._pendingAdImage = null;
      this.renderPage();
    });

    // Delete ad
    document.querySelectorAll('[data-del-ad]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.delAd);
        if (!isNaN(i) && this.ads?.items) {
          this.ads.items.splice(i, 1);
          this.renderPage();
        }
      });
    });

    // Save all ads settings
    document.getElementById('saveAdsBtn')?.addEventListener('click', async () => {
      const enabled = document.getElementById('adsEnabled')?.checked;
      const frequency = parseInt(document.getElementById('adsFrequency')?.value) || 5;
      const label = document.getElementById('adsLabel')?.value?.trim() || 'Sponsored';
      const payload = {
        enabled,
        frequency,
        label,
        items: this.ads?.items || []
      };
      const res = await fetch('/api/admin/settings/ads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        this.ads = data.ads;
        alert('✅ Ads settings saved!');
        this.renderPage();
      } else {
        alert(data.error?.message || 'Failed to save ads');
      }
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
    this.renderPage();
  }
}
