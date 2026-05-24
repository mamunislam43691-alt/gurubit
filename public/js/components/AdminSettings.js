import { AdminLayout } from './AdminLayout.js';

export class AdminSettings {
  constructor() {
    this.system = null;
    this.config = null;
    this.admin = null;
  }

  async loadData() {
    try {
      const [sysRes, confRes] = await Promise.all([
        fetch('/api/admin/settings/system'),
        fetch('/api/admin/settings/config')
      ]).catch(e => {
        console.error('Fetch error:', e);
        return [null, null];
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
    } catch (e) {
      console.error('Failed to parse settings JSON:', e);
    }
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
              <p class="text-gray-400 text-xs mt-1">Allow visitors to sign in and test the system with a single click. Disabling this hides the guest button and rejects guest session creation.</p>
            </div>
            <div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="guestToggle" class="sr-only peer" ${this.config?.allowGuestLogin ? 'checked' : ''}>
                <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'settings',
      title: 'Settings',
      subtitle: 'System monitoring & technical overview',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    const guestToggle = document.getElementById('guestToggle');
    if (guestToggle) {
      guestToggle.addEventListener('change', async (e) => {
        const allowed = e.target.checked;
        try {
          const res = await fetch('/api/admin/settings/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ allowGuestLogin: allowed })
          });
          
          let data = null;
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            data = await res.json();
          }

          if (!res.ok || !data || !data.success) {
            alert((data && data.error?.message) || 'Failed to update setting. Please make sure the server has been restarted.');
            e.target.checked = !allowed;
          } else if (this.config) {
            this.config.allowGuestLogin = allowed;
          }
        } catch (err) {
          alert('Network error. Failed to update setting. Please check your connection or restart the server.');
          e.target.checked = !allowed;
        }
      });
    }
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
    this.renderPage();
  }
}
