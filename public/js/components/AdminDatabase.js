/**
 * Admin Database Management — Firebase config, SMTP email, backup, restore
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminDatabase {
  constructor() {
    this.admin = null;
    this.config = null;
    this.backups = [];
    this.envConfig = { firebase: {}, smtp: {} };
  }

  fmtSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  async load() {
    const [dbRes, envRes] = await Promise.all([
      fetch('/api/admin/database'),
      fetch('/api/admin/database/env-config')
    ]);
    const dbData = await dbRes.json();
    const envData = await envRes.json();
    if (dbData.success) {
      this.config = dbData.config;
      this.backups = dbData.backups || [];
    }
    if (envData.success) {
      this.envConfig = envData;
    }
  }

  async saveSchedule() {
    const body = {
      enabled: document.getElementById('autoBackupEnabled')?.checked,
      intervalDays: parseInt(document.getElementById('backupDays')?.value, 10) || 1,
      time: document.getElementById('backupTime')?.value || '09:00',
      botToken: document.getElementById('botToken')?.value?.trim() || undefined,
      adminChatId: document.getElementById('adminChatId')?.value?.trim() || undefined
    };
    const res = await fetch('/api/admin/database/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      this.config = data.config;
      this.showToast('Schedule saved ✅');
      this.renderPage();
    } else this.showToast(data.error?.message || 'Failed', 'error');
  }

  async saveSmtp() {
    const btn = document.getElementById('saveSmtpBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    const user = document.getElementById('smtpUser')?.value?.trim();
    const fromVal = document.getElementById('smtpFrom')?.value?.trim();
    const data = {
      host: document.getElementById('smtpHost')?.value?.trim(),
      port: document.getElementById('smtpPort')?.value?.trim() || '587',
      secure: document.getElementById('smtpSecure')?.value || 'false',
      user,
      pass: document.getElementById('smtpPass')?.value?.trim(),
      // Auto-fill FROM if empty
      from: fromVal || (user ? `"GURUBIT" <${user}>` : '')
    };
    const res = await fetch('/api/admin/database/env-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'smtp', data })
    });
    const result = await res.json();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save SMTP'; }
    this.showToast(result.message || (result.success ? 'Saved ✅' : 'Failed'), result.success ? 'success' : 'error');
    if (result.success) { await this.load(); this.renderPage(); }
  }

  async testEmail() {
    const to = document.getElementById('testEmailTo')?.value?.trim();
    if (!to) return this.showToast('Enter a recipient email', 'error');
    const btn = document.getElementById('testEmailBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    const res = await fetch('/api/admin/database/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to })
    });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> Send Test'; }
    this.showToast(data.message || (data.success ? 'Sent ✅' : 'Failed'), data.success ? 'success' : 'error');
  }

  async saveFirebase() {
    const btn = document.getElementById('saveFirebaseBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    const data = {
      databaseUrl: document.getElementById('firebaseDatabaseUrl')?.value?.trim(),
      serviceAccount: document.getElementById('firebaseServiceAccount')?.value?.trim()
    };
    const res = await fetch('/api/admin/database/env-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'firebase', data })
    });
    const result = await res.json();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save Firebase'; }
    this.showToast(result.message || (result.success ? 'Saved ✅' : 'Failed'), result.success ? 'success' : 'error');
    if (result.success) { await this.load(); this.renderPage(); }
  }

  async runManual(type) {
    const res = await fetch(`/api/admin/database/${type}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      this.showToast(type === 'export' ? 'Backup created ✅' : 'Done ✅');
      await this.load();
      this.renderPage();
    } else this.showToast(data.error?.message || 'Failed', 'error');
  }

  showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-bold shadow-xl transition-all ${type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  renderBody() {
    const c = this.config || {};
    const fb = this.envConfig?.firebase || {};
    const smtp = this.envConfig?.smtp || {};

    return `
      <div class="db-mgmt">

        <!-- STATUS ROW -->
        <div class="db-status-row">
          <div class="glass-card p-5 db-status-card">
            <p class="stat-label"><i class="fas fa-clock text-primary"></i> Last Backup</p>
            <p class="text-white font-bold mt-2">${this.fmtDate(c.lastBackupAt)}</p>
          </div>
          <div class="glass-card p-5 db-status-card">
            <p class="stat-label"><i class="fas fa-calendar-check text-green-400"></i> Next Backup</p>
            <p class="text-white font-bold mt-2">${this.fmtDate(c.nextBackupAt)}</p>
          </div>
        </div>

        <!-- FIREBASE CONNECTION -->
        <div class="glass-card p-6 mb-6">
          <h3 class="font-black text-white uppercase text-sm mb-1 flex items-center gap-2">
            <i class="fas fa-fire text-orange-400"></i> Firebase Connection
          </h3>
          <p class="text-xs text-gray-400 mb-4">Connect your Firebase project. Changes are runtime-only — also set in Render Dashboard for persistence.</p>

          <div class="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label class="stat-label block mb-1">Firebase Database URL</label>
              <input type="text" id="firebaseDatabaseUrl" class="input-field font-mono text-sm"
                placeholder="https://your-project-default-rtdb.firebaseio.com"
                value="${fb.databaseUrl || ''}">
            </div>
            <div>
              <label class="stat-label block mb-1 flex items-center gap-2">
                Service Account JSON
                ${fb.serviceAccountSet
                  ? '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✅ Configured</span>'
                  : '<span class="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠️ Not set</span>'}
                ${fb.projectId ? `<span class="text-xs text-gray-400">Project: <b class="text-white">${fb.projectId}</b></span>` : ''}
              </label>
              <textarea id="firebaseServiceAccount" class="input-field font-mono text-xs" rows="4"
                placeholder='Paste full serviceAccountKey.json content here ({"type":"service_account",...})'
                style="resize:vertical"></textarea>
              <p class="text-xs text-gray-500 mt-1">Leave blank to keep existing. Paste full JSON from Firebase Console → Project Settings → Service Accounts.</p>
            </div>
          </div>
          <button type="button" id="saveFirebaseBtn" class="neon-btn px-6 py-3 text-xs uppercase">
            <i class="fas fa-save mr-1"></i> Save Firebase
          </button>
        </div>

        <!-- SMTP EMAIL -->
        <div class="glass-card p-6 mb-6">
          <h3 class="font-black text-white uppercase text-sm mb-1 flex items-center gap-2">
            <i class="fas fa-envelope text-blue-400"></i> SMTP Email Configuration
          </h3>
          <p class="text-xs text-gray-400 mb-4">Configure email sending for verification & password reset. Use Gmail App Password for easy setup.</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="stat-label block mb-1">SMTP Host</label>
              <input type="text" id="smtpHost" class="input-field font-mono text-sm"
                placeholder="smtp.gmail.com" value="${smtp.host || ''}">
            </div>
            <div>
              <label class="stat-label block mb-1">Port</label>
              <input type="number" id="smtpPort" class="input-field font-mono text-sm"
                placeholder="587" value="${smtp.port || '587'}">
            </div>
            <div>
              <label class="stat-label block mb-1">Secure (SSL)</label>
              <select id="smtpSecure" class="input-field text-sm">
                <option value="false" ${smtp.secure !== 'true' ? 'selected' : ''}>No (Port 587 — recommended)</option>
                <option value="true" ${smtp.secure === 'true' ? 'selected' : ''}>Yes (Port 465)</option>
              </select>
            </div>
            <div>
              <label class="stat-label block mb-1">Email Address (SMTP User)</label>
              <input type="email" id="smtpUser" class="input-field font-mono text-sm"
                placeholder="yourname@gmail.com" value="${smtp.user || ''}">
            </div>
            <div>
              <label class="stat-label block mb-1 flex items-center gap-2">
                Password / App Password
                ${smtp.passSet
                  ? '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✅ Set</span>'
                  : '<span class="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">⚠️ Not set</span>'}
              </label>
              <input type="password" id="smtpPass" class="input-field font-mono text-sm"
                placeholder="Leave blank to keep existing" autocomplete="new-password">
            </div>
            <div>
              <label class="stat-label block mb-1">From Name & Email</label>
              <input type="text" id="smtpFrom" class="input-field font-mono text-sm"
                placeholder='"GURUBIT" <supportgurubit@gmail.com>'
                value="${smtp.from || (smtp.user ? `"GURUBIT" <${smtp.user}>` : '')}">
            </div>
          </div>

          <div class="flex flex-wrap gap-3 items-center border-t border-white/10 pt-4">
            <button type="button" id="saveSmtpBtn" class="neon-btn px-6 py-3 text-xs uppercase">
              <i class="fas fa-save mr-1"></i> Save SMTP
            </button>
            <div class="flex gap-2 flex-1 min-w-0">
              <input type="email" id="testEmailTo" class="input-field text-sm flex-1"
                placeholder="Send test email to..." style="min-width:0">
              <button type="button" id="testEmailBtn" class="neon-btn px-4 py-3 text-xs uppercase whitespace-nowrap">
                <i class="fas fa-paper-plane mr-1"></i> Send Test
              </button>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            💡 Gmail users: use <a href="https://myaccount.google.com/apppasswords" target="_blank" class="text-primary underline">App Password</a> (not your regular password). Enable 2FA first.
          </p>
        </div>

        <!-- AUTO BACKUP SCHEDULE -->
        <div class="glass-card p-6 mb-6">
          <h3 class="font-black text-white uppercase text-sm mb-4"><i class="fas fa-sync text-primary mr-2"></i> Auto Backup Schedule</h3>
          <label class="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" id="autoBackupEnabled" class="w-5 h-5" ${c.enabled ? 'checked' : ''}>
            <span class="text-sm font-bold text-white">Enable Auto Backup</span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="stat-label block mb-1">Every (days)</label>
              <input type="number" id="backupDays" class="input-field" min="1" value="${c.intervalDays || 1}">
            </div>
            <div>
              <label class="stat-label block mb-1">Time (HH:MM)</label>
              <input type="time" id="backupTime" class="input-field" value="${c.time || '09:00'}">
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 border-t border-white/10 pt-4">
            <div>
              <label class="stat-label block mb-1">Telegram Bot API Token</label>
              <input type="password" id="botToken" class="input-field font-mono text-sm"
                placeholder="${c.botTokenMasked || 'Bot token'}" autocomplete="off">
            </div>
            <div>
              <label class="stat-label block mb-1">Admin Chat ID (only this user receives backups)</label>
              <input type="text" id="adminChatId" class="input-field font-mono text-sm"
                value="${c.adminChatId || ''}" placeholder="Your Telegram user ID">
            </div>
          </div>
          <button type="button" id="saveScheduleBtn" class="neon-btn px-6 py-3 text-xs uppercase">
            <i class="fas fa-save mr-1"></i> Save Schedule
          </button>
        </div>

        <!-- MANUAL ACTIONS -->
        <div class="glass-card p-6 mb-6">
          <h3 class="font-black text-white uppercase text-sm mb-4"><i class="fas fa-tools text-orange-400 mr-2"></i> Manual Actions</h3>
          <div class="db-manual-btns">
            <button type="button" id="exportDb" class="db-btn db-btn--green"><i class="fas fa-download"></i> Export Database</button>
            <button type="button" id="importDb" class="db-btn db-btn--blue"><i class="fas fa-upload"></i> Import Database</button>
            <button type="button" id="wipeDb" class="db-btn db-btn--red"><i class="fas fa-trash"></i> Wipe Database</button>
          </div>
          <input type="file" id="importFile" accept=".json" class="hidden">
        </div>

        <!-- BACKUP HISTORY -->
        <div class="glass-card p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-black text-white uppercase text-sm"><i class="fas fa-history text-yellow-400 mr-2"></i> Backup History</h3>
            <button type="button" id="refreshBackups" class="admin-action-btn">Refresh</button>
          </div>
          <div class="db-backup-list">
            ${this.backups.length ? this.backups.map((b) => `
              <div class="db-backup-item">
                <div>
                  <p class="font-mono text-sm text-white">${b.filename}</p>
                  <p class="text-xs text-gray-500">${this.fmtSize(b.size)} · ${this.fmtDate(b.createdAt)}</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <a href="/api/admin/database/download/${b.id}" class="db-icon-btn" title="Download"><i class="fas fa-download"></i></a>
                  <button type="button" data-restore="${b.id}" class="db-btn db-btn--blue text-xs py-2 px-3">Restore</button>
                  <button type="button" data-del="${b.id}" class="db-icon-btn text-red-400" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            `).join('') : '<p class="text-gray-500 text-sm p-4">No backups yet</p>'}
          </div>
        </div>

      </div>`;
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'database',
      title: 'Database Management',
      subtitle: 'Firebase, SMTP email, backup & restore',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    // Firebase
    document.getElementById('saveFirebaseBtn')?.addEventListener('click', () => this.saveFirebase());

    // SMTP
    document.getElementById('saveSmtpBtn')?.addEventListener('click', () => this.saveSmtp());
    document.getElementById('testEmailBtn')?.addEventListener('click', () => this.testEmail());

    // Backup schedule
    document.getElementById('saveScheduleBtn')?.addEventListener('click', () => this.saveSchedule());

    // Manual actions
    document.getElementById('exportDb')?.addEventListener('click', () => this.runManual('export'));
    document.getElementById('wipeDb')?.addEventListener('click', async () => {
      if (!confirm('WIPE entire database? This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure? ALL data will be deleted.')) return;
      await this.runManual('wipe');
    });
    document.getElementById('importDb')?.addEventListener('click', () => document.getElementById('importFile')?.click());
    document.getElementById('importFile')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const res = await fetch('/api/admin/database/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text
      });
      const data = await res.json();
      if (data.success) { this.showToast('Imported ✅'); await this.load(); this.renderPage(); }
      else this.showToast(data.error?.message || 'Import failed', 'error');
      e.target.value = '';
    });

    // Backup history
    document.getElementById('refreshBackups')?.addEventListener('click', async () => { await this.load(); this.renderPage(); });
    document.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Restore this backup? Current data may be overwritten.')) return;
        const res = await fetch(`/api/admin/database/restore/${btn.dataset.restore}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) this.showToast('Restored ✅');
        else this.showToast(data.error?.message || 'Failed', 'error');
      });
    });
    document.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this backup file?')) return;
        await fetch(`/api/admin/database/backups/${btn.dataset.del}`, { method: 'DELETE' });
        await this.load();
        this.renderPage();
      });
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin || this.admin.role !== 'super_admin') {
      window.location.href = '/admin';
      return;
    }
    // Render shell immediately — data loads in background
    this.renderPage();
    await this.load();
    this.renderPage();
  }
}
