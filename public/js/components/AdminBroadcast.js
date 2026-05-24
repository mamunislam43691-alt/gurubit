import { AdminLayout } from './AdminLayout.js';

export class AdminBroadcast {
  constructor() {
    this.broadcasts = [];
    this.admin = null;
  }

  async loadData() {
    const res = await fetch('/api/admin/broadcasts');
    const data = await res.json();
    if (data.success) this.broadcasts = data.broadcasts;
  }

  async sendBroadcast(e) {
    e.preventDefault();
    const title = document.getElementById('bcTitle')?.value?.trim();
    const message = document.getElementById('bcMessage')?.value?.trim();
    if (!title || !message) return alert('Title and message required');

    const res = await fetch('/api/admin/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('bcTitle').value = '';
      document.getElementById('bcMessage').value = '';
      await this.loadData();
      this.renderPage();
      alert('Broadcast sent to all connected users');
    } else {
      alert(data.error?.message || 'Failed');
    }
  }

  renderBody() {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form id="broadcastForm" class="glass-card p-6 border-white/5 space-y-4">
          <h3 class="font-black text-white uppercase text-sm tracking-widest">New Broadcast</h3>
          <input id="bcTitle" class="input-field" placeholder="Title" required>
          <textarea id="bcMessage" class="input-field min-h-[120px]" placeholder="Message to all users..." required></textarea>
          <button type="submit" class="neon-btn w-full py-3 text-xs uppercase tracking-widest">Send Broadcast</button>
        </form>
        <div class="glass-card p-6 border-white/5">
          <h3 class="font-black text-white uppercase text-sm tracking-widest mb-4">History</h3>
          <motion.div class="space-y-3 max-h-[400px] overflow-y-auto">
            ${this.broadcasts.length ? this.broadcasts.map((b) => `
              <div class="border border-gray-800 rounded-xl p-4">
                <p class="font-bold text-white text-sm">${b.title}</p>
                <p class="text-gray-400 text-xs mt-1">${b.message}</p>
                <p class="text-[10px] text-gray-600 mt-2">${new Date(b.createdAt).toLocaleString()}</p>
              </div>
            `).join('') : '<p class="text-gray-500 text-sm">No broadcasts yet</p>'}
          </motion.div>
        </motion.div>
      </motion.div>
    `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'broadcast',
      title: 'Broadcast Management',
      subtitle: 'Send announcements to all users',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });
    document.getElementById('broadcastForm')?.addEventListener('submit', (e) => this.sendBroadcast(e));
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadData();
    this.renderPage();
  }
}
