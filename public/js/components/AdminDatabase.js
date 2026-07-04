/**
 * Admin Database Management — Multi-DB + SMTP + Backup
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminDatabase {
  constructor() {
    this.admin   = null;
    this.config  = null;
    this.backups = [];
    this.envConfig = { mongodb: {}, smtp: {} };
    this.dbTab   = 'connect';
    this.databases = [];
    this.editingDb = null;
    this.showAddForm = false;
  }

  fmtSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(2)} MB`;
  }

  fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  showToast(msg, kind = 'success') {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:24px;right:24px;padding:.75rem 1.25rem;border-radius:.75rem;color:#fff;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.4);font-size:.85rem;font-weight:700;${kind==='error'?'background:#dc2626':'background:#16a34a'}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  async load() {
    try {
      const [dbListRes, envRes, backupRes] = await Promise.all([
        fetch('/api/admin/database/list', { credentials: 'include' }),
        fetch('/api/admin/database/env-config', { credentials: 'include' }),
        fetch('/api/admin/database', { credentials: 'include' })
      ]);
      const dbListData = await dbListRes.json().catch(() => ({}));
      const envData    = await envRes.json().catch(() => ({}));
      const backupData = await backupRes.json().catch(() => ({}));
      if (dbListData.success) this.databases = dbListData.databases || [];
      if (envData.success)    this.envConfig = envData;
      if (backupData.success) { this.config = backupData.config; this.backups = backupData.backups || []; }
    } catch (e) {
      console.warn('Database load error:', e.message);
    }
  }

  // ── Database CRUD ──────────────────────────────────────────────────────
  async addDatabase(formData) {
    const res = await fetch('/api/admin/database/list', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      this.showToast(`"${formData.name}" added ✅`);
      this.showAddForm = false;
      await this.load();
      this.render();
    } else {
      this.showToast(data.error?.message || 'Failed to add database', 'error');
    }
  }

  async updateDatabase(id, formData) {
    const res = await fetch(`/api/admin/database/list/${id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      this.showToast(`Updated ✅`);
      this.editingDb = null;
      await this.load();
      this.render();
    } else {
      this.showToast(data.error?.message || 'Failed to update', 'error');
    }
  }

  async deleteDatabase(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/database/list/${id}`, {
      method: 'DELETE', credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      this.showToast(`"${name}" removed ✅`);
      await this.load();
      this.render();
    } else {
      this.showToast(data.error?.message || 'Failed to delete', 'error');
    }
  }

  async setPrimary(id) {
    const res = await fetch(`/api/admin/database/list/${id}/set-primary`, {
      method: 'PUT', credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      this.showToast('Primary database updated ✅');
      await this.load();
      this.render();
    } else {
      this.showToast(data.error?.message || 'Failed', 'error');
    }
  }

  async testConnection(id) {
    const res = await fetch(`/api/admin/database/list/${id}/test`, {
      method: 'POST', credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    this.showToast(data.message || (data.success ? 'Connected ✅' : 'Failed'), data.success ? 'success' : 'error');
    await this.load();
    this.render();
  }

  // ── SMTP & Backup (unchanged) ──────────────────────────────────────────
  async saveSmtp() {
    const btn = document.getElementById('saveSmtpBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const user = document.getElementById('smtpUser')?.value?.trim();
    const data = {
      host:   document.getElementById('smtpHost')?.value?.trim(),
      port:   document.getElementById('smtpPort')?.value?.trim() || '587',
      secure: document.getElementById('smtpSecure')?.value || 'false',
      user,
      pass:   document.getElementById('smtpPass')?.value?.trim(),
      from:   document.getElementById('smtpFrom')?.value?.trim() || (user ? `"GURUBIT" <${user}>` : '')
    };
    const res    = await fetch('/api/admin/database/env-config', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({section:'smtp',data}) });
    const result = await res.json().catch(() => ({}));
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i>Save SMTP'; }
    this.showToast(result.message || (result.success ? 'Saved ✅' : 'Failed'), result.success ? 'success' : 'error');
    if (result.success) { await this.load(); this.render(); }
  }

  async testEmail() {
    const to  = document.getElementById('testEmailTo')?.value?.trim();
    if (!to) return this.showToast('Enter a recipient email', 'error');
    const btn = document.getElementById('testEmailBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const res  = await fetch('/api/admin/database/test-email', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({to}) });
    const data = await res.json().catch(() => ({}));
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Send Test'; }
    this.showToast(data.message || (data.success ? 'Sent ✅' : 'Failed'), data.success ? 'success' : 'error');
  }

  async saveSchedule() {
    const body = {
      enabled:      document.getElementById('autoBackupEnabled')?.checked,
      intervalDays: parseInt(document.getElementById('backupDays')?.value, 10) || 1,
      time:         document.getElementById('backupTime')?.value || '09:00',
      botToken:     document.getElementById('botToken')?.value?.trim() || undefined,
      adminChatId:  document.getElementById('adminChatId')?.value?.trim() || undefined
    };
    const res  = await fetch('/api/admin/database/schedule', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (data.success) { this.config = data.config; this.showToast('Schedule saved ✅'); this.render(); }
    else this.showToast(data.error?.message || 'Failed', 'error');
  }

  async runManual(type) {
    const res  = await fetch(`/api/admin/database/${type}`, { method:'POST', credentials:'include' });
    const data = await res.json().catch(() => ({}));
    this.showToast(data.message || (data.success ? 'Done ✅' : 'Failed'), data.success ? 'success' : 'error');
    if (data.success) { await this.load(); this.render(); }
  }

  async deleteBackup(id) {
    if (!confirm('Delete this backup?')) return;
    const res  = await fetch(`/api/admin/database/backups/${id}`, { method:'DELETE', credentials:'include' });
    const data = await res.json().catch(() => ({}));
    if (data.success) { await this.load(); this.render(); }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  render() {
    const tabs = [
      { id:'connect', label:'Databases',  icon:'database'  },
      { id:'backup',  label:'Backup/Restore', icon:'cloud-download-alt'  },
      { id:'smtp',    label:'SMTP Email',     icon:'envelope'  }
    ];
    const smtp = this.envConfig?.smtp || {};
    const cfg  = this.config || {};

    const bodyHtml = `
      <div class="flex gap-2 border-b border-white/10 mb-6 overflow-x-auto">
        ${tabs.map(t => `
          <button data-tab="${t.id}" class="db-tab-btn px-5 py-3 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all
            ${this.dbTab===t.id ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-300'}">
            <i class="fas fa-${t.icon} mr-2"></i>${t.label}
          </button>`).join('')}
      </div>

      ${this.dbTab === 'connect' ? this.renderDatabasesTab() : ''}
      ${this.dbTab === 'backup'  ? this.renderBackupTab(cfg) : ''}
      ${this.dbTab === 'smtp'    ? this.renderSmtpTab(smtp) : ''}
    `;

    AdminLayout.renderShell({
      activeId:  'database',
      title:     'Database',
      subtitle:  'Multi-database management, backups & SMTP',
      bodyHtml,
      admin:     this.admin
    });

    // Tab buttons
    document.querySelectorAll('.db-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { this.dbTab = btn.dataset.tab; this.render(); });
    });

    // Database tab events
    this.bindDatabaseEvents();

    // SMTP & Backup events
    document.getElementById('saveSmtpBtn')?.addEventListener('click',   () => this.saveSmtp());
    document.getElementById('testEmailBtn')?.addEventListener('click',  () => this.testEmail());
    document.getElementById('manualBackupBtn')?.addEventListener('click', () => this.runManual('export'));
    document.getElementById('manualWipeBtn')?.addEventListener('click', () => {
      if (confirm('⚠️ This will wipe major collections. Are you sure?')) this.runManual('wipe');
    });
    document.getElementById('autoBackupEnabled')?.addEventListener('change', () => this.saveSchedule());
    document.getElementById('backupDays')?.addEventListener('change',  () => this.saveSchedule());
    document.getElementById('backupTime')?.addEventListener('change',  () => this.saveSchedule());
    document.getElementById('botToken')?.addEventListener('change',    () => this.saveSchedule());
    document.getElementById('adminChatId')?.addEventListener('change', () => this.saveSchedule());
    document.querySelectorAll('.delete-backup-btn').forEach(b =>
      b.addEventListener('click', () => this.deleteBackup(b.dataset.id)));
  }

  renderDatabasesTab() {
    const dbs = this.databases;
    const activeCount = dbs.filter(d => d.connected).length;
    const shardedCount = dbs.filter(d => d.active).length;

    return `
      <div class="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-4">
          <div class="glass-card px-4 py-2 text-center">
            <p class="text-2xl font-black text-primary">${dbs.length}</p>
            <p class="text-[10px] text-gray-500 uppercase">Total</p>
          </div>
          <div class="glass-card px-4 py-2 text-center">
            <p class="text-2xl font-black text-green-400">${activeCount}</p>
            <p class="text-[10px] text-gray-500 uppercase">Connected</p>
          </div>
          <div class="glass-card px-4 py-2 text-center">
            <p class="text-2xl font-black text-cyan-300">${shardedCount}</p>
            <p class="text-[10px] text-gray-500 uppercase">Active Shards</p>
          </div>
        </div>
        <button type="button" id="addDbBtn" class="neon-btn px-6 py-3 text-xs uppercase flex items-center gap-2">
          <i class="fas fa-plus"></i> Add Database
        </button>
      </div>

      ${shardedCount > 1 ? `
        <div class="glass-card p-4 border border-cyan-500/20 mb-4 text-xs text-gray-400">
          <i class="fas fa-info-circle text-cyan-400 mr-2"></i>
          <strong class="text-white">${shardedCount} active databases</strong> — user data is distributed across them.
          Config data (countries, servers, etc.) stays on the primary database.
        </div>
      ` : ''}

      ${this.showAddForm ? this.renderAddForm() : ''}
      ${this.editingDb ? this.renderEditForm(this.editingDb) : ''}

      <div class="space-y-3">
        ${dbs.map(db => this.renderDbCard(db)).join('')}
        ${dbs.length === 0 ? `
          <div class="glass-card p-10 text-center text-gray-500">
            <i class="fas fa-database text-4xl mb-4 opacity-30"></i>
            <p class="text-sm">No databases configured. Click "Add Database" to start.</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderDbCard(db) {
    const statusColor = db.connected ? 'green' : db.active ? 'amber' : 'gray';
    const statusText = db.connected ? 'Connected' : db.active ? 'Active (Not Connected)' : 'Inactive';
    return `
      <div class="glass-card p-5 border ${db.isDefault ? 'border-primary/40' : 'border-white/5'} hover:border-white/10 transition-all">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-xl ${db.connected ? 'bg-green-500/20' : 'bg-gray-500/20'} flex items-center justify-center flex-shrink-0">
            <i class="fas fa-database text-xl ${db.connected ? 'text-green-400' : 'text-gray-500'}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-black text-white text-base">${this.esc(db.name)}</h3>
              ${db.isDefault ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary">Primary</span>' : ''}
              ${db.active ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-${statusColor}-500/20 text-${statusColor}-400">${statusText}</span>` : '<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-gray-500/20 text-gray-400">Inactive</span>'}
            </div>
            <p class="text-xs text-gray-500 font-mono mt-1 truncate">${this.esc(db.uri ? db.uri.replace(/\/\/[^@]+@/, '//***@') : 'Default URI')}</p>
            <p class="text-[10px] text-gray-600 mt-1">DB: ${this.esc(db.dbName)} ${db.createdAt ? `· Added ${this.fmtDate(db.createdAt)}` : ''}</p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button data-id="${db.id}" class="test-db-btn px-2 py-1 rounded text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30" title="Test connection">
              <i class="fas fa-plug"></i> Test
            </button>
            <button data-id="${db.id}" class="edit-db-btn px-2 py-1 rounded text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" title="Edit">
              <i class="fas fa-edit"></i> Edit
            </button>
            ${!db.isDefault ? `
              <button data-id="${db.id}" class="primary-db-btn px-2 py-1 rounded text-[10px] font-black uppercase bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" title="Set as primary">
                <i class="fas fa-star"></i>
              </button>
              <button data-id="${db.id}" data-name="${this.esc(db.name)}" class="del-db-btn px-2 py-1 rounded text-[10px] font-black uppercase bg-red-500/20 text-red-400 hover:bg-red-500/30" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderAddForm() {
    return `
      <div class="glass-card p-6 border border-primary/30 mb-4" style="animation:fadeIn .2s ease">
        <h3 class="font-black text-white uppercase mb-4 text-sm flex items-center gap-2">
          <i class="fas fa-plus-circle text-primary"></i> Add New Database
        </h3>
        <form id="addDbForm" class="space-y-3">
          <div class="grid md:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Name *</label>
              <input type="text" id="addDbName" class="input-field w-full" placeholder="e.g. Shard 2" required>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Database Name</label>
              <input type="text" id="addDbDbName" class="input-field w-full" placeholder="gurubit" value="gurubit">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Connection URI *</label>
            <input type="text" id="addDbUri" class="input-field w-full font-mono text-xs" placeholder="mongodb+srv://user:pass@host/database?appName=Gurubit" required>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="neon-btn flex-1 py-3 text-xs uppercase flex items-center justify-center gap-2">
              <i class="fas fa-check"></i> Add & Connect
            </button>
            <button type="button" id="cancelAddDb" class="flex-1 py-3 text-xs border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition-all">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  renderEditForm(db) {
    return `
      <div class="glass-card p-6 border border-blue-500/30 mb-4" style="animation:fadeIn .2s ease">
        <h3 class="font-black text-white uppercase mb-4 text-sm flex items-center gap-2">
          <i class="fas fa-edit text-blue-400"></i> Edit: ${this.esc(db.name)}
        </h3>
        <form id="editDbForm" class="space-y-3">
          <div class="grid md:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Name</label>
              <input type="text" id="editDbName" class="input-field w-full" value="${this.esc(db.name)}" required>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Database Name</label>
              <input type="text" id="editDbDbName" class="input-field w-full" value="${this.esc(db.dbName)}">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Connection URI</label>
            <input type="text" id="editDbUri" class="input-field w-full font-mono text-xs" value="${this.esc(db.uri || '')}">
          </div>
          <div class="flex items-center gap-3">
            <input type="checkbox" id="editDbActive" ${db.active ? 'checked' : ''} class="w-4 h-4 accent-cyan-500">
            <label for="editDbActive" class="text-sm text-gray-300">Active (included in sharding)</label>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="neon-btn flex-1 py-3 text-xs uppercase flex items-center justify-center gap-2">
              <i class="fas fa-save"></i> Save Changes
            </button>
            <button type="button" id="cancelEditDb" class="flex-1 py-3 text-xs border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 transition-all">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  renderBackupTab(cfg) {
    return `
      <div class="grid lg:grid-cols-3 gap-4">
        <div class="glass-card p-6 lg:col-span-1">
          <h2 class="text-base font-bold text-white mb-4"><i class="fas fa-clock mr-2 text-cyan-400"></i>Schedule</h2>
          <div class="space-y-3">
            <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input id="autoBackupEnabled" type="checkbox" ${cfg.enabled?'checked':''} class="accent-cyan-500">
              Enable automatic backups
            </label>
            <div>
              <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Interval (days)</label>
              <input id="backupDays" type="number" min="1" value="${cfg.intervalDays||1}" class="input-field w-full">
            </div>
            <div>
              <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Time</label>
              <input id="backupTime" type="time" value="${cfg.time||'09:00'}" class="input-field w-full">
            </div>
            <div>
              <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Telegram Bot Token (optional)</label>
              <input id="botToken" type="text" value="${cfg.botToken||''}" class="input-field w-full" placeholder="123456:ABC...">
            </div>
            <div>
              <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Telegram Chat ID (optional)</label>
              <input id="adminChatId" type="text" value="${cfg.adminChatId||''}" class="input-field w-full" placeholder="-100…">
            </div>
          </div>
          <div class="flex gap-2 mt-5">
            <button id="manualBackupBtn" class="neon-btn py-2 px-3 text-xs uppercase flex-1">
              <i class="fas fa-download mr-1"></i>Backup Now
            </button>
            <button id="manualWipeBtn" class="py-2 px-3 text-xs uppercase border border-red-500/40 text-red-300 rounded-lg hover:bg-red-500/10 flex-1">
              <i class="fas fa-trash mr-1"></i>Wipe Data
            </button>
          </div>
        </div>
        <div class="glass-card p-6 lg:col-span-2">
          <h2 class="text-base font-bold text-white mb-4"><i class="fas fa-database mr-2 text-cyan-400"></i>Backups (${this.backups.length})</h2>
          ${this.backups.length === 0
            ? '<p class="text-gray-500 text-sm">No backups yet. Click "Backup Now" to create one.</p>'
            : `<div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead><tr class="text-gray-400 text-left text-xs uppercase">
                    <th class="py-2 pr-4">ID</th><th class="pr-4">Created</th><th class="pr-4">Size</th><th></th>
                  </tr></thead>
                  <tbody>
                    ${this.backups.map(b => `
                      <tr class="border-t border-white/5 hover:bg-white/2">
                        <td class="py-2 pr-4 text-cyan-300 font-mono text-xs">${b.id}</td>
                        <td class="pr-4 text-gray-300 text-xs">${this.fmtDate(b.createdAt)}</td>
                        <td class="pr-4 text-gray-400 text-xs">${this.fmtSize(b.size)}</td>
                        <td class="text-right">
                          <a href="/api/admin/database/download/${b.id}" target="_blank" class="text-cyan-400 hover:text-cyan-300 text-xs mr-3"><i class="fas fa-download"></i></a>
                          <button data-id="${b.id}" class="delete-backup-btn text-red-400 hover:text-red-300 text-xs"><i class="fas fa-trash"></i></button>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>`}
        </div>
      </div>
    `;
  }

  renderSmtpTab(smtp) {
    return `
      <div class="glass-card p-6 max-w-2xl">
        <h2 class="text-base font-bold text-white mb-1"><i class="fas fa-envelope mr-2 text-cyan-400"></i>SMTP Email</h2>
        <p class="text-gray-400 text-xs mb-5">Used for signup verification and password reset emails.</p>
        <div class="grid md:grid-cols-2 gap-3">
          <div class="md:col-span-2">
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Host</label>
            <input id="smtpHost" type="text" class="input-field w-full" placeholder="smtp.gmail.com" value="${smtp.host||''}">
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Port</label>
            <input id="smtpPort" type="text" class="input-field w-full" value="${smtp.port||'587'}">
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">TLS Mode</label>
            <select id="smtpSecure" class="input-field w-full">
              <option value="false" ${String(smtp.secure)==='true'?'':'selected'}>STARTTLS (port 587)</option>
              <option value="true"  ${String(smtp.secure)==='true'?'selected':''}>SSL/TLS (port 465)</option>
            </select>
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Username / Email</label>
            <input id="smtpUser" type="text" class="input-field w-full" value="${smtp.user||''}">
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">App Password</label>
            <input id="smtpPass" type="password" class="input-field w-full" placeholder="${smtp.passSet?'(saved — leave blank to keep)':'App password'}">
          </div>
          <div class="md:col-span-2">
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">From Address</label>
            <input id="smtpFrom" type="text" class="input-field w-full" value="${smtp.from||''}" placeholder='"GURUBIT" <noreply@example.com>'>
          </div>
          <div class="md:col-span-2">
            <label class="text-xs uppercase tracking-wider text-gray-400 block mb-1">Test Recipient</label>
            <input id="testEmailTo" type="email" class="input-field w-full" placeholder="you@example.com">
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <button id="saveSmtpBtn" class="neon-btn py-2.5 px-5 text-xs uppercase">
            <i class="fas fa-save mr-1"></i>Save SMTP
          </button>
          <button id="testEmailBtn" class="py-2.5 px-5 text-xs uppercase border border-cyan-500/40 text-cyan-300 rounded-lg hover:bg-cyan-500/10">
            <i class="fas fa-paper-plane mr-1"></i>Send Test
          </button>
        </div>
      </div>
    `;
  }

  bindDatabaseEvents() {
    // Add database
    document.getElementById('addDbBtn')?.addEventListener('click', () => {
      this.showAddForm = !this.showAddForm;
      this.editingDb = null;
      this.render();
    });
    document.getElementById('cancelAddDb')?.addEventListener('click', () => {
      this.showAddForm = false;
      this.render();
    });
    document.getElementById('addDbForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addDatabase({
        name: document.getElementById('addDbName')?.value?.trim(),
        uri: document.getElementById('addDbUri')?.value?.trim(),
        dbName: document.getElementById('addDbDbName')?.value?.trim() || 'gurubit'
      });
    });

    // Edit database
    document.querySelectorAll('.edit-db-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const db = this.databases.find(d => d.id === btn.dataset.id);
        if (db) {
          this.editingDb = db;
          this.showAddForm = false;
          this.render();
        }
      });
    });
    document.getElementById('cancelEditDb')?.addEventListener('click', () => {
      this.editingDb = null;
      this.render();
    });
    document.getElementById('editDbForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this.editingDb) return;
      this.updateDatabase(this.editingDb.id, {
        name: document.getElementById('editDbName')?.value?.trim(),
        uri: document.getElementById('editDbUri')?.value?.trim(),
        dbName: document.getElementById('editDbDbName')?.value?.trim(),
        active: document.getElementById('editDbActive')?.checked
      });
    });

    // Delete database
    document.querySelectorAll('.del-db-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteDatabase(btn.dataset.id, btn.dataset.name);
      });
    });

    // Set primary
    document.querySelectorAll('.primary-db-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setPrimary(btn.dataset.id);
      });
    });

    // Test connection
    document.querySelectorAll('.test-db-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.testConnection(btn.dataset.id);
      });
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    AdminLayout.renderShell({
      activeId: 'database', title: 'Database', subtitle: 'Loading…',
      bodyHtml: `<div class="flex items-center justify-center py-20 text-gray-500">
        <i class="fas fa-spinner fa-spin mr-3"></i> Loading database config…
      </div>`,
      admin: this.admin
    });
    await this.load();
    this.render();
  }
}
