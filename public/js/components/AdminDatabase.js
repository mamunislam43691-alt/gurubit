/**
 * Admin Database Management — Multi-database support + Firebase + SMTP + Backup
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminDatabase {
  constructor() {
    this.admin = null;
    this.config = null;
    this.backups = [];
    this.envConfig = { firebase: {}, smtp: {} };
    this.dbTab = 'connect';
    this.selectedDbType = 'firebase';
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
    if (dbData.success) { this.config = dbData.config; this.backups = dbData.backups || []; }
    if (envData.success) { this.envConfig = envData; }
  }

  async saveSchedule() {
    const body = {
      enabled: document.getElementById('autoBackupEnabled')?.checked,
      intervalDays: parseInt(document.getElementById('backupDays')?.value, 10) || 1,
      time: document.getElementById('backupTime')?.value || '09:00',
      botToken: document.getElementById('botToken')?.value?.trim() || undefined,
      adminChatId: document.getElementById('adminChatId')?.value?.trim() || undefined
    };
    const res = await fetch('/api/admin/database/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) { this.config = data.config; this.showToast('Schedule saved ✅'); this.renderPage(); }
    else this.showToast(data.error?.message || 'Failed', 'error');
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
      user, pass: document.getElementById('smtpPass')?.value?.trim(),
      from: fromVal || (user ? `"GURUBIT" <${user}>` : '')
    };
    const res = await fetch('/api/admin/database/env-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'smtp', data }) });
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
    const res = await fetch('/api/admin/database/test-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
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
    const res = await fetch('/api/admin/database/env-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'firebase', data }) });
    const result = await res.json();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save & Connect Firebase'; }
    this.showToast(result.message || (result.success ? 'Saved ✅' : 'Failed'), result.success ? 'success' : 'error');
    if (result.success) { await this.load(); this.renderPage(); }
  }

  async runManual(type) {
    const res = await fetch(`/api/admin/database/${type}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { this.showToast(type === 'export' ? 'Backup created ✅' : 'Done ✅'); await this.load(); this.renderPage(); }
    else this.showToast(data.error?.message || 'Failed', 'error');
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
    const tabs = [
      { id: 'connect', label: 'Connect DB',   icon: 'plug' },
      { id: 'smtp',    label: 'Email (SMTP)', icon: 'envelope' },
      { id: 'backup',  label: 'Backup',       icon: 'history' },
    ];
    return `
      <div class="flex flex-wrap items-center gap-2 mb-5 p-4 glass-card border border-primary/10 text-xs">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full ${fb.serviceAccountSet ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}"></span>
          <span class="font-bold ${fb.serviceAccountSet ? 'text-green-400' : 'text-gray-500'}">
            Firebase${fb.serviceAccountSet ? (fb.projectId ? ' · ' + fb.projectId : ' ✅') : ' ✗'}
          </span>
        </span>
        <span class="text-gray-700">·</span>
        <span class="flex items-center gap-1.5">
          <i class="fas fa-hdd text-primary"></i>
          <span class="font-bold text-primary">Local JSON ✅</span>
        </span>
        ${(this.envConfig?.mongodb?.connected) ? '<span class="text-gray-700">·</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span><span class="font-bold text-green-400">MongoDB ✅</span></span>' : ''}
        ${(this.envConfig?.postgresql?.connected) ? '<span class="text-gray-700">·</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span><span class="font-bold text-blue-400">PostgreSQL ✅</span></span>' : ''}
        ${(this.envConfig?.mysql?.connected) ? '<span class="text-gray-700">·</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span><span class="font-bold text-cyan-400">MySQL ✅</span></span>' : ''}
        ${(this.envConfig?.redis?.connected) ? '<span class="text-gray-700">·</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span><span class="font-bold text-red-400">Redis ✅</span></span>' : ''}
        ${(this.envConfig?.supabase?.connected) ? '<span class="text-gray-700">·</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span class="font-bold text-emerald-400">Supabase ✅</span></span>' : ''}
        ${(this.envConfig?.planetscale?.connected) ? '<span class="text-gray-700">·</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span><span class="font-bold text-purple-400">PlanetScale ✅</span></span>' : ''}
        <span class="text-gray-700">·</span>
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full ${smtp.passSet ? 'bg-blue-400' : 'bg-gray-600'}"></span>
          <span class="font-bold ${smtp.passSet ? 'text-blue-400' : 'text-gray-500'}">
            SMTP${smtp.passSet ? ' ✅' : ' ✗'}
          </span>
        </span>
      </div>
      <div class="flex gap-1 mb-5 flex-wrap">
        ${tabs.map(t => `
          <button type="button" data-db-tab="${t.id}"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all
            ${this.dbTab === t.id ? 'bg-primary/20 text-primary border border-primary/30' : 'text-gray-500 border border-white/5 hover:border-white/10 hover:text-gray-300'}">
            <i class="fas fa-${t.icon} text-[10px]"></i> ${t.label}
          </button>`).join('')}
      </div>
      ${this.dbTab === 'connect' ? this._renderConnectTab(fb) : ''}
      ${this.dbTab === 'smtp'    ? this._renderSmtpTab(smtp) : ''}
      ${this.dbTab === 'backup'  ? this._renderBackupTab(c) : ''}`;
  }

  _renderDbForm(type) {
    const cfg = this.envConfig || {};
    const db = cfg[type] || {};
    const connected = db.connected;

    const header = (icon, color, name, desc) => `
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${color}22;">
          <i class="fas fa-${icon} text-lg" style="color:${color};"></i>
        </div>
        <div class="flex-1"><p class="font-black text-white">${name}</p><p class="text-xs text-gray-500">${desc}</p></div>
        ${connected
          ? `<span class="px-3 py-1 rounded-full text-xs font-black bg-green-500/20 text-green-400 border border-green-500/30">✅ Connected</span>`
          : `<span class="px-3 py-1 rounded-full text-xs font-black bg-gray-500/20 text-gray-400 border border-gray-500/30">Not Connected</span>`}
      </div>`;

    const saveBtn = (section) => `
      <div class="flex gap-3 flex-wrap mt-4">
        <button type="button" class="neon-btn px-6 py-3 text-xs uppercase" id="saveDbBtn" data-section="${section}">
          <i class="fas fa-plug mr-1"></i> Connect & Test
        </button>
        ${connected ? `<button type="button" class="px-4 py-3 text-xs uppercase border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition-all" id="disconnectDbBtn" data-section="${section}">
          <i class="fas fa-unlink mr-1"></i> Disconnect
        </button>` : ''}
      </div>`;

    if (type === 'mongodb') return `
      ${header('leaf','#22c55e','MongoDB','Atlas or self-hosted MongoDB')}
      <div class="grid grid-cols-1 gap-4 mb-2">
        <div><label class="stat-label block mb-1">Connection URI</label>
          <input type="text" id="mongoUri" class="input-field font-mono text-sm" placeholder="mongodb+srv://user:pass@cluster.mongodb.net/dbname" value="${db.host || ''}">
          <p class="text-xs text-gray-500 mt-1">Get from MongoDB Atlas → Connect → Drivers</p>
        </div>
        <div><label class="stat-label block mb-1">Database Name</label>
          <input type="text" id="mongoDbName" class="input-field font-mono text-sm" placeholder="gurubit" value="${db.dbName || ''}">
        </div>
      </div>
      ${saveBtn('mongodb')}`;

    if (type === 'postgresql') return `
      ${header('database','#3b82f6','PostgreSQL','Relational database')}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <div><label class="stat-label block mb-1">Host</label><input type="text" id="pgHost" class="input-field font-mono text-sm" placeholder="localhost" value="${db.host || ''}"></div>
        <div><label class="stat-label block mb-1">Port</label><input type="number" id="pgPort" class="input-field font-mono text-sm" placeholder="5432" value="${db.port || '5432'}"></div>
        <div><label class="stat-label block mb-1">Database</label><input type="text" id="pgDatabase" class="input-field font-mono text-sm" placeholder="gurubit" value="${db.database || ''}"></div>
        <div><label class="stat-label block mb-1">Username</label><input type="text" id="pgUser" class="input-field font-mono text-sm" placeholder="postgres" value="${db.user || ''}"></div>
        <div class="sm:col-span-2"><label class="stat-label block mb-1">Password</label><input type="password" id="pgPassword" class="input-field font-mono text-sm" placeholder="Leave blank to keep existing"></div>
        <div><label class="stat-label block mb-1">SSL</label>
          <select id="pgSsl" class="input-field text-sm">
            <option value="false">No SSL</option>
            <option value="true">SSL (recommended for cloud)</option>
          </select>
        </div>
      </div>
      ${saveBtn('postgresql')}`;

    if (type === 'mysql') return `
      ${header('database','#06b6d4','MySQL / MariaDB','MySQL or MariaDB database')}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <div><label class="stat-label block mb-1">Host</label><input type="text" id="mysqlHost" class="input-field font-mono text-sm" placeholder="localhost" value="${db.host || ''}"></div>
        <div><label class="stat-label block mb-1">Port</label><input type="number" id="mysqlPort" class="input-field font-mono text-sm" placeholder="3306" value="${db.port || '3306'}"></div>
        <div><label class="stat-label block mb-1">Database</label><input type="text" id="mysqlDatabase" class="input-field font-mono text-sm" placeholder="gurubit" value="${db.database || ''}"></div>
        <div><label class="stat-label block mb-1">Username</label><input type="text" id="mysqlUser" class="input-field font-mono text-sm" placeholder="root" value="${db.user || ''}"></div>
        <div class="sm:col-span-2"><label class="stat-label block mb-1">Password</label><input type="password" id="mysqlPassword" class="input-field font-mono text-sm" placeholder="Leave blank to keep existing"></div>
      </div>
      ${saveBtn('mysql')}`;

    if (type === 'redis') return `
      ${header('bolt','#ef4444','Redis','In-memory data store')}
      <div class="grid grid-cols-1 gap-4 mb-2">
        <div><label class="stat-label block mb-1">Redis URL</label>
          <input type="text" id="redisUrl" class="input-field font-mono text-sm" placeholder="redis://localhost:6379 or rediss://user:pass@host:6380" value="${db.url || ''}">
          <p class="text-xs text-gray-500 mt-1">Use <code>rediss://</code> for TLS. Upstash, Redis Cloud, etc.</p>
        </div>
        <div><label class="stat-label block mb-1">Password (optional)</label><input type="password" id="redisPassword" class="input-field font-mono text-sm" placeholder="Leave blank if no auth"></div>
      </div>
      ${saveBtn('redis')}`;

    if (type === 'supabase') return `
      ${header('database','#10b981','Supabase','PostgreSQL + Auth + Storage')}
      <div class="grid grid-cols-1 gap-4 mb-2">
        <div><label class="stat-label block mb-1">Project URL</label>
          <input type="text" id="supabaseUrl" class="input-field font-mono text-sm" placeholder="https://xxxx.supabase.co" value="${db.url || ''}">
        </div>
        <div><label class="stat-label block mb-1 flex items-center gap-2">Anon Key (public)
          ${db.anonKeySet ? '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✅ Set</span>' : ''}
        </label><input type="password" id="supabaseAnonKey" class="input-field font-mono text-sm" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."></div>
        <div><label class="stat-label block mb-1">Service Role Key (secret)</label><input type="password" id="supabaseServiceKey" class="input-field font-mono text-sm" placeholder="Leave blank to keep existing"></div>
      </div>
      <p class="text-xs text-gray-500 mb-2">Get keys from Supabase Dashboard → Project Settings → API</p>
      ${saveBtn('supabase')}`;

    if (type === 'planetscale') return `
      ${header('database','#8b5cf6','PlanetScale','Serverless MySQL platform')}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <div><label class="stat-label block mb-1">Host</label><input type="text" id="psHost" class="input-field font-mono text-sm" placeholder="aws.connect.psdb.cloud" value="${db.host || ''}"></div>
        <div><label class="stat-label block mb-1">Database</label><input type="text" id="psDatabase" class="input-field font-mono text-sm" placeholder="gurubit" value="${db.database || ''}"></div>
        <div><label class="stat-label block mb-1">Username</label><input type="text" id="psUsername" class="input-field font-mono text-sm" placeholder="username" value="${db.username || ''}"></div>
        <div><label class="stat-label block mb-1">Password</label><input type="password" id="psPassword" class="input-field font-mono text-sm" placeholder="pscale_pw_..."></div>
      </div>
      <p class="text-xs text-gray-500 mb-2">Get credentials from PlanetScale Dashboard → Connect → Connect with MySQL</p>
      ${saveBtn('planetscale')}`;

    return `<p class="text-gray-500 text-sm text-center py-4">Select a database type above.</p>`;
  }

  _renderConnectTab(fb) {
    const dbTypes = [
      { id: 'firebase',    name: 'Firebase',    icon: 'fire',     color: '#f97316', desc: 'Firestore + Auth' },
      { id: 'mongodb',     name: 'MongoDB',     icon: 'leaf',     color: '#22c55e', desc: 'Atlas or self-hosted' },
      { id: 'postgresql',  name: 'PostgreSQL',  icon: 'database', color: '#3b82f6', desc: 'Relational DB' },
      { id: 'mysql',       name: 'MySQL',       icon: 'database', color: '#06b6d4', desc: 'MySQL / MariaDB' },
      { id: 'redis',       name: 'Redis',       icon: 'bolt',     color: '#ef4444', desc: 'In-memory store' },
      { id: 'supabase',    name: 'Supabase',    icon: 'database', color: '#10b981', desc: 'PostgreSQL + Auth' },
      { id: 'planetscale', name: 'PlanetScale', icon: 'database', color: '#8b5cf6', desc: 'Serverless MySQL' },
      { id: 'local',       name: 'Local JSON',  icon: 'hdd',      color: '#6b7280', desc: 'Default (active)' },
    ];
    return `
      <div class="glass-card p-5 mb-5">
        <h3 class="font-black text-white text-sm uppercase mb-3 flex items-center gap-2">
          <i class="fas fa-plug text-primary"></i> Connect Your Database
        </h3>
        <p class="text-xs text-gray-400 mb-4">Select a database type to connect. Multiple databases can be connected simultaneously.</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          ${dbTypes.map(db => `
            <button type="button" data-db-type="${db.id}"
              class="p-3 rounded-xl border text-left transition-all
              ${this.selectedDbType === db.id ? 'border-primary/50 bg-primary/10' : 'border-white/5 hover:border-white/15 bg-white/[0.02]'}">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style="background:${db.color}22;">
                <i class="fas fa-${db.icon} text-sm" style="color:${db.color};"></i>
              </div>
              <p class="text-xs font-bold text-white truncate">${db.name}</p>
              <p class="text-[10px] text-gray-500 mt-0.5">${db.desc}</p>
            </button>`).join('')}
        </div>
        ${this.selectedDbType === 'firebase' ? `
        <div class="border-t border-white/10 pt-5">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center"><i class="fas fa-fire text-orange-400 text-lg"></i></div>
            <div class="flex-1"><p class="font-black text-white">Firebase / Firestore</p><p class="text-xs text-gray-500">Google Firebase Realtime + Firestore</p></div>
            ${fb.serviceAccountSet
              ? '<span class="px-3 py-1 rounded-full text-xs font-black bg-green-500/20 text-green-400 border border-green-500/30">✅ Connected</span>'
              : '<span class="px-3 py-1 rounded-full text-xs font-black bg-gray-500/20 text-gray-400 border border-gray-500/30">Not Connected</span>'}
          </div>
          <div class="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label class="stat-label block mb-1">Firebase Database URL</label>
              <input type="text" id="firebaseDatabaseUrl" class="input-field font-mono text-sm"
                placeholder="https://your-project-default-rtdb.firebaseio.com" value="${fb.databaseUrl || ''}">
            </div>
            <div>
              <label class="stat-label block mb-1 flex items-center gap-2">Service Account JSON
                ${fb.serviceAccountSet
                  ? '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✅ Configured</span>'
                  : '<span class="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠️ Not set</span>'}
              </label>
              <textarea id="firebaseServiceAccount" class="input-field font-mono text-xs" rows="4"
                placeholder='{"type":"service_account","project_id":"..."}' style="resize:vertical"></textarea>
              <p class="text-xs text-gray-500 mt-1">Firebase Console → Project Settings → Service Accounts → Generate new private key</p>
            </div>
          </div>
          <div class="flex gap-3 flex-wrap">
            <button type="button" id="saveFirebaseBtn" class="neon-btn px-6 py-3 text-xs uppercase">
              <i class="fas fa-save mr-1"></i> Save & Connect Firebase
            </button>
            ${fb.serviceAccountSet ? '<button type="button" id="disconnectFirebaseBtn" class="px-4 py-3 text-xs uppercase border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition-all"><i class="fas fa-unlink mr-1"></i> Disconnect</button>' : ''}
          </div>
        </div>` : ''}
        ${this.selectedDbType === 'local' ? `
        <div class="border-t border-white/10 pt-5">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-gray-500/15 flex items-center justify-center"><i class="fas fa-hdd text-gray-400 text-lg"></i></div>
            <div class="flex-1"><p class="font-black text-white">Local JSON Storage</p><p class="text-xs text-gray-500">Currently active for numbers, SMS, catalog</p></div>
            <span class="px-3 py-1 rounded-full text-xs font-black bg-primary/20 text-primary border border-primary/30">✅ Active</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="glass-card p-4 text-center"><i class="fas fa-file-code text-primary text-xl mb-2 block"></i><p class="text-xs font-bold text-white">catalog.json</p><p class="text-[10px] text-gray-500">Countries, Servers, Numbers</p></div>
            <div class="glass-card p-4 text-center"><i class="fas fa-file-code text-cyan-400 text-xl mb-2 block"></i><p class="text-xs font-bold text-white">phone-store.json</p><p class="text-[10px] text-gray-500">Allocated Numbers, SMS</p></div>
            <div class="glass-card p-4 text-center"><i class="fas fa-file-code text-green-400 text-xl mb-2 block"></i><p class="text-xs font-bold text-white">guest-store.json</p><p class="text-[10px] text-gray-500">Guest Sessions</p></div>
          </div>
        </div>` : ''}
        ${!['firebase','local'].includes(this.selectedDbType) ? `
        <div class="border-t border-white/10 pt-5">
          ${this._renderDbForm(this.selectedDbType)}
        </div>` : ''}
      </div>
      <div class="glass-card p-5">
        <h3 class="font-black text-white text-sm uppercase mb-4 flex items-center gap-2"><i class="fas fa-tools text-orange-400"></i> Data Management</h3>
        <div class="db-manual-btns">
          <button type="button" id="exportDb" class="db-btn db-btn--green"><i class="fas fa-download"></i> Export All Data</button>
          <button type="button" id="importDb" class="db-btn db-btn--blue"><i class="fas fa-upload"></i> Import Data</button>
          <button type="button" id="wipeDb" class="db-btn db-btn--red"><i class="fas fa-trash"></i> Wipe Database</button>
        </div>
        <input type="file" id="importFile" accept=".json" class="hidden">
      </div>`;
  }

  _renderSmtpTab(smtp) {
    return `
      <div class="glass-card p-6">
        <h3 class="font-black text-white text-sm uppercase mb-1 flex items-center gap-2">
          <i class="fas fa-envelope text-blue-400"></i> SMTP Email Configuration
          ${smtp.passSet ? '<span class="ml-auto px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">✅ Configured</span>' : ''}
        </h3>
        <p class="text-xs text-gray-400 mb-4">Configure email for verification & password reset.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label class="stat-label block mb-1">SMTP Host</label><input type="text" id="smtpHost" class="input-field font-mono text-sm" placeholder="smtp.gmail.com" value="${smtp.host || ''}"></div>
          <div><label class="stat-label block mb-1">Port</label><input type="number" id="smtpPort" class="input-field font-mono text-sm" placeholder="587" value="${smtp.port || '587'}"></div>
          <div><label class="stat-label block mb-1">Secure (SSL)</label>
            <select id="smtpSecure" class="input-field text-sm">
              <option value="false" ${smtp.secure !== 'true' ? 'selected' : ''}>No (Port 587)</option>
              <option value="true" ${smtp.secure === 'true' ? 'selected' : ''}>Yes (Port 465)</option>
            </select>
          </div>
          <div><label class="stat-label block mb-1">Email Address</label><input type="email" id="smtpUser" class="input-field font-mono text-sm" placeholder="yourname@gmail.com" value="${smtp.user || ''}"></div>
          <div><label class="stat-label block mb-1 flex items-center gap-2">Password
            ${smtp.passSet ? '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✅ Set</span>' : '<span class="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">⚠️ Not set</span>'}
          </label><input type="password" id="smtpPass" class="input-field font-mono text-sm" placeholder="Leave blank to keep existing" autocomplete="new-password"></div>
          <div><label class="stat-label block mb-1">From Name & Email</label><input type="text" id="smtpFrom" class="input-field font-mono text-sm" placeholder='"GURUBIT" <you@gmail.com>' value="${smtp.from || (smtp.user ? '"GURUBIT" <' + smtp.user + '>' : '')}"></div>
        </div>
        <div class="flex flex-wrap gap-3 items-center border-t border-white/10 pt-4">
          <button type="button" id="saveSmtpBtn" class="neon-btn px-6 py-3 text-xs uppercase"><i class="fas fa-save mr-1"></i> Save SMTP</button>
          <div class="flex gap-2 flex-1 min-w-0">
            <input type="email" id="testEmailTo" class="input-field text-sm flex-1" placeholder="Send test email to..." style="min-width:0">
            <button type="button" id="testEmailBtn" class="neon-btn px-4 py-3 text-xs uppercase whitespace-nowrap"><i class="fas fa-paper-plane mr-1"></i> Send Test</button>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">💡 Gmail: use <a href="https://myaccount.google.com/apppasswords" target="_blank" class="text-primary underline">App Password</a>. Enable 2FA first.</p>
      </div>`;
  }

  _renderBackupTab(c) {
    return `
      <div class="glass-card p-6 mb-5">
        <h3 class="font-black text-white text-sm uppercase mb-4"><i class="fas fa-sync text-primary mr-2"></i> Auto Backup Schedule</h3>
        <div class="grid grid-cols-2 gap-3 mb-4 text-center">
          <div class="glass-card p-3"><p class="stat-label text-[10px]">Last Backup</p><p class="text-white font-bold text-sm mt-1">${this.fmtDate(c.lastBackupAt)}</p></div>
          <div class="glass-card p-3"><p class="stat-label text-[10px]">Next Backup</p><p class="text-white font-bold text-sm mt-1">${this.fmtDate(c.nextBackupAt)}</p></div>
        </div>
        <label class="flex items-center gap-3 mb-4 cursor-pointer">
          <input type="checkbox" id="autoBackupEnabled" class="w-5 h-5" ${c.enabled ? 'checked' : ''}>
          <span class="text-sm font-bold text-white">Enable Auto Backup</span>
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label class="stat-label block mb-1">Every (days)</label><input type="number" id="backupDays" class="input-field" min="1" value="${c.intervalDays || 1}"></div>
          <div><label class="stat-label block mb-1">Time (HH:MM)</label><input type="time" id="backupTime" class="input-field" value="${c.time || '09:00'}"></div>
          <div><label class="stat-label block mb-1">Telegram Bot Token</label><input type="password" id="botToken" class="input-field font-mono text-sm" placeholder="${c.botTokenMasked || 'Bot token'}" autocomplete="off"></div>
          <div><label class="stat-label block mb-1">Admin Chat ID</label><input type="text" id="adminChatId" class="input-field font-mono text-sm" value="${c.adminChatId || ''}" placeholder="Your Telegram user ID"></div>
        </div>
        <button type="button" id="saveScheduleBtn" class="neon-btn px-6 py-3 text-xs uppercase"><i class="fas fa-save mr-1"></i> Save Schedule</button>
      </div>
      <div class="glass-card p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-black text-white text-sm uppercase"><i class="fas fa-history text-yellow-400 mr-2"></i> Backup History</h3>
          <button type="button" id="refreshBackups" class="admin-action-btn">Refresh</button>
        </div>
        <div class="db-backup-list">
          ${this.backups.length ? this.backups.map((b) => `
            <div class="db-backup-item">
              <div><p class="font-mono text-sm text-white">${b.filename}</p><p class="text-xs text-gray-500">${this.fmtSize(b.size)} · ${this.fmtDate(b.createdAt)}</p></div>
              <div class="flex gap-2 flex-wrap">
                <a href="/api/admin/database/download/${b.id}" class="db-icon-btn" title="Download"><i class="fas fa-download"></i></a>
                <button type="button" data-restore="${b.id}" class="db-btn db-btn--blue text-xs py-2 px-3">Restore</button>
                <button type="button" data-del="${b.id}" class="db-icon-btn text-red-400" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </div>`).join('') : '<p class="text-gray-500 text-sm p-4">No backups yet</p>'}
        </div>
      </div>`;
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'database',
      title: 'Database Management',
      subtitle: 'Connect databases, SMTP email, backup & restore',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    document.querySelectorAll('[data-db-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this.dbTab = btn.dataset.dbTab; this.renderPage(); });
    });
    document.querySelectorAll('[data-db-type]').forEach(btn => {
      btn.addEventListener('click', () => { this.selectedDbType = btn.dataset.dbType; this.renderPage(); });
    });

    document.getElementById('saveFirebaseBtn')?.addEventListener('click', () => this.saveFirebase());
    document.getElementById('disconnectFirebaseBtn')?.addEventListener('click', async () => {
      if (!confirm('Disconnect Firebase? The app will use local storage only.')) return;
      await fetch('/api/admin/database/env-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'firebase', data: { serviceAccount: 'DISCONNECT', databaseUrl: '' } }) });
      this.showToast('Firebase disconnected');
      await this.load();
      this.renderPage();
    });

    // Generic DB connect/disconnect
    document.getElementById('saveDbBtn')?.addEventListener('click', async (e) => {
      const section = e.target.dataset.section;
      const btn = e.target;
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Connecting...';
      let data = {};
      if (section === 'mongodb') {
        data = { uri: document.getElementById('mongoUri')?.value?.trim(), dbName: document.getElementById('mongoDbName')?.value?.trim() };
      } else if (section === 'postgresql') {
        data = { host: document.getElementById('pgHost')?.value?.trim(), port: document.getElementById('pgPort')?.value, database: document.getElementById('pgDatabase')?.value?.trim(), user: document.getElementById('pgUser')?.value?.trim(), password: document.getElementById('pgPassword')?.value, ssl: document.getElementById('pgSsl')?.value };
      } else if (section === 'mysql') {
        data = { host: document.getElementById('mysqlHost')?.value?.trim(), port: document.getElementById('mysqlPort')?.value, database: document.getElementById('mysqlDatabase')?.value?.trim(), user: document.getElementById('mysqlUser')?.value?.trim(), password: document.getElementById('mysqlPassword')?.value };
      } else if (section === 'redis') {
        data = { url: document.getElementById('redisUrl')?.value?.trim(), password: document.getElementById('redisPassword')?.value };
      } else if (section === 'supabase') {
        data = { url: document.getElementById('supabaseUrl')?.value?.trim(), anonKey: document.getElementById('supabaseAnonKey')?.value?.trim(), serviceKey: document.getElementById('supabaseServiceKey')?.value?.trim() };
      } else if (section === 'planetscale') {
        data = { host: document.getElementById('psHost')?.value?.trim(), database: document.getElementById('psDatabase')?.value?.trim(), username: document.getElementById('psUsername')?.value?.trim(), password: document.getElementById('psPassword')?.value };
      }
      const res = await fetch('/api/admin/database/env-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, data }) });
      const result = await res.json();
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug mr-1"></i> Connect & Test';
      this.showToast(result.message || (result.success ? 'Connected ✅' : 'Failed'), result.success ? 'success' : 'error');
      if (result.success) { await this.load(); this.renderPage(); }
    });

    document.getElementById('disconnectDbBtn')?.addEventListener('click', async (e) => {
      const section = e.target.dataset.section;
      if (!confirm(`Disconnect ${section}?`)) return;
      const clearMap = { mongodb: { uri: '', dbName: '' }, postgresql: { host: '', database: '', user: '' }, mysql: { host: '', database: '', user: '' }, redis: { url: '' }, supabase: { url: '', anonKey: '' }, planetscale: { host: '', database: '', username: '' } };
      await fetch('/api/admin/database/env-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, data: clearMap[section] || {} }) });
      this.showToast(`${section} disconnected`);
      await this.load();
      this.renderPage();
    });

    document.getElementById('saveSmtpBtn')?.addEventListener('click', () => this.saveSmtp());
    document.getElementById('testEmailBtn')?.addEventListener('click', () => this.testEmail());
    document.getElementById('saveScheduleBtn')?.addEventListener('click', () => this.saveSchedule());

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
      const res = await fetch('/api/admin/database/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
      const data = await res.json();
      if (data.success) { this.showToast('Imported ✅'); await this.load(); this.renderPage(); }
      else this.showToast(data.error?.message || 'Import failed', 'error');
      e.target.value = '';
    });

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
    this.renderPage();
    await this.load();
    this.renderPage();
  }
}
