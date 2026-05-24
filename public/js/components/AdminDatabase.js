/**
 * Admin Database Management — backup, restore, Telegram
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminDatabase {
  constructor() {
    this.admin = null;
    this.config = null;
    this.backups = [];
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
    const res = await fetch('/api/admin/database');
    const data = await res.json();
    if (data.success) {
      this.config = data.config;
      this.backups = data.backups || [];
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
      alert('Schedule saved');
      this.renderPage();
    } else alert(data.error?.message || 'Failed');
  }

  async runManual(type) {
    const res = await fetch(`/api/admin/database/${type}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(type === 'export' ? 'Backup created' : 'Done');
      await this.load();
      this.renderPage();
    } else alert(data.error?.message || 'Failed');
  }

  renderBody() {
    const c = this.config || {};
    return `
      <motion.div class="db-mgmt">
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
              <input type="password" id="botToken" class="input-field font-mono text-sm" placeholder="${c.botTokenMasked || 'Bot token'}" autocomplete="off">
            </div>
            <div>
              <label class="stat-label block mb-1">Admin Chat ID (only this user receives backups)</label>
              <input type="text" id="adminChatId" class="input-field font-mono text-sm" value="${c.adminChatId || ''}" placeholder="Your Telegram user ID">
            </div>
          </div>
          <button type="button" id="saveScheduleBtn" class="neon-btn px-6 py-3 text-xs uppercase"><i class="fas fa-save mr-1"></i> Save Schedule</button>
        </div>

        <div class="glass-card p-6 mb-6">
          <h3 class="font-black text-white uppercase text-sm mb-4"><i class="fas fa-tools text-orange-400 mr-2"></i> Manual Actions</h3>
          <div class="db-manual-btns">
            <button type="button" id="exportDb" class="db-btn db-btn--green"><i class="fas fa-download"></i> Export Database</button>
            <button type="button" id="importDb" class="db-btn db-btn--blue"><i class="fas fa-upload"></i> Import Database</button>
            <button type="button" id="wipeDb" class="db-btn db-btn--red"><i class="fas fa-trash"></i> Wipe Database</button>
          </div>
          <input type="file" id="importFile" accept=".json" class="hidden">
        </div>

        <div class="glass-card p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-black text-white uppercase text-sm"><i class="fas fa-history text-yellow-400 mr-2"></i> Backup History</h3>
            <button type="button" id="refreshBackups" class="admin-action-btn">Refresh</button>
          </div>
          <motion.div class="db-backup-list">
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
      </motion.div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'database',
      title: 'Database Management',
      subtitle: 'Backup, restore & Telegram delivery',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    document.getElementById('saveScheduleBtn')?.addEventListener('click', () => this.saveSchedule());
    document.getElementById('exportDb')?.addEventListener('click', () => this.runManual('export'));
    document.getElementById('wipeDb')?.addEventListener('click', async () => {
      if (!confirm('WIPE entire database? This cannot be undone.')) return;
      if (!confirm('Type OK in next prompt — really wipe ALL data?')) return;
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
      if (data.success) { alert('Imported'); await this.load(); this.renderPage(); }
      else alert(data.error?.message || 'Import failed');
      e.target.value = '';
    });
    document.getElementById('refreshBackups')?.addEventListener('click', async () => { await this.load(); this.renderPage(); });
    document.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Restore this backup? Current data may be overwritten.')) return;
        const res = await fetch(`/api/admin/database/restore/${btn.dataset.restore}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) alert('Restored');
        else alert(data.error?.message || 'Failed');
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
    await this.load();
    this.renderPage();
  }
}
