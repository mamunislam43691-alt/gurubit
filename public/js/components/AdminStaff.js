import { AdminLayout } from './AdminLayout.js';

export class AdminStaff {
  constructor() {
    this.staff = [];
    this.admin = null;
  }

  async loadData() {
    const res = await fetch('/api/admin/staff');
    const data = await res.json();
    if (data.success) this.staff = data.staff;
  }

  async createStaff(e) {
    e.preventDefault();
    const username = document.getElementById('staffUsername')?.value?.trim();
    const password = document.getElementById('staffPassword')?.value;
    const role = document.getElementById('staffRole')?.value;
    const displayName = document.getElementById('staffDisplayName')?.value?.trim();

    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, displayName })
    });
    const data = await res.json();
    if (data.success) {
      await this.loadData();
      this.renderPage();
      alert(`Staff created. Login: ${username} / (password you set)`);
    } else {
      alert(data.error?.message || 'Failed');
    }
  }

  async removeStaff(id) {
    if (!confirm('Delete this staff account?')) return;
    await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    await this.loadData();
    this.renderPage();
  }

  renderBody() {
    return `
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form id="staffForm" class="glass-card p-6 border-white/5 space-y-4">
          <h3 class="font-black text-white uppercase text-sm tracking-widest">Create Admin / Supporter</h3>
          <input id="staffDisplayName" class="input-field" placeholder="Display name">
          <input id="staffUsername" class="input-field" placeholder="Username" required>
          <input id="staffPassword" type="password" class="input-field" placeholder="Password" required>
          <select id="staffRole" class="input-field">
            <option value="supporter">Supporter (Support only)</option>
            <option value="admin">Admin (Full except this page)</option>
          </select>
          <p class="text-[10px] text-gray-500">Supporters only see Support inbox after login.</p>
          <button type="submit" class="neon-btn w-full py-3 text-xs uppercase tracking-widest">Create Account</button>
        </form>
        <div class="glass-card p-6 border-white/5 overflow-x-auto">
          <h3 class="font-black text-white uppercase text-sm tracking-widest mb-4">Staff List</h3>
          <table class="w-full text-left text-sm">
            <thead><tr class="text-[10px] text-gray-500 uppercase">
              <th class="pb-3">User</th><th class="pb-3">Role</th><th class="pb-3"></th>
            </tr></thead>
            <tbody>
              ${this.staff.map((s) => `
                <tr class="border-t border-gray-800">
                  <td class="py-3"><p class="font-bold text-white">${s.displayName}</p><p class="text-xs text-gray-500">${s.username}</p></td>
                  <td class="py-3 capitalize text-primary">${s.role}</td>
                  <td class="py-3 text-right">
                    <button type="button" data-del="${s.id}" class="text-red-400 text-xs font-bold uppercase">Delete</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="3" class="text-gray-500 py-4">No staff yet</td></tr>'}
            </tbody>
          </table>
        </motion.div>
      </motion.div>
    `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  renderPage() {
    AdminLayout.renderShell({
      activeId: 'staff',
      title: 'Admin Management',
      subtitle: 'Super Admin · Admin · Supporter roles',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });
    document.getElementById('staffForm')?.addEventListener('submit', (e) => this.createStaff(e));
    document.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => this.removeStaff(btn.dataset.del));
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin || this.admin.role !== 'super_admin') {
      window.location.href = '/admin';
      return;
    }
    await this.loadData();
    this.renderPage();
  }
}
