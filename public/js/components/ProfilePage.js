/**
 * Profile — view menu: Edit Profile, Withdraw, Logout + photo upload
 */

export class ProfilePage {
  constructor() {
    this.profile = null;
    this.user = null;
    this.view = 'menu';
    this.isEditing = false;
    this.formData = {};
    this.errors = {};
  }

  async loadProfile() {
    // Use UserLayout session cache for instant load
    const { UserLayout } = await import('../utils/UserLayout.js');
    this.user = await UserLayout.ensureAuth('/');
    if (!this.user) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') === '1') this.view = 'edit';

    // Render immediately with cached user
    this.render();

    const data = await fetch('/api/user/profile').then((r) => r.json());
    if (data.success) {
      this.profile = data.profile;
      this.formData = { ...data.profile };
      this.render();
    } else {
      window.location.href = '/numbers';
    }
  }

  validateForm() {
    this.errors = {};
    if (!this.formData.name || this.formData.name.trim().length < 2) {
      this.errors.name = 'Name must be at least 2 characters';
    }
    return Object.keys(this.errors).length === 0;
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.validateForm()) {
      this.render();
      return;
    }
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.formData.name,
        phone: this.formData.phone,
        telegram: this.formData.telegram,
        cryptoAddress: this.formData.cryptoAddress
      })
    });
    const data = await res.json();
    if (data.success) {
      this.isEditing = false;
      this.view = 'menu';
      await this.loadProfile();
      this.render();
    } else {
      this.errors.submit = data.error?.message || 'Update failed';
      this.render();
    }
  }

  async handlePhotoUpload(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await fetch('/api/user/profile/photo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoData: reader.result })
      });
      const data = await res.json();
      if (data.success) {
        this.profile.profilePhotoUrl = data.profilePhotoUrl;
        this.render();
      }
    };
    reader.readAsDataURL(file);
  }

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  avatarHtml(size = 'w-24 h-24') {
    if (this.profile?.profilePhotoUrl) {
      return `<img src="${this.profile.profilePhotoUrl}" alt="" class="${size} rounded-3xl object-cover border border-primary/30">`;
    }
    return `<div class="${size} bg-primary/10 rounded-3xl flex items-center justify-center border border-primary/20"><i class="fas fa-user text-4xl text-primary"></i></div>`;
  }

  renderMenu() {
    return `
      <div class="max-w-lg mx-auto">
        <div class="glass-card p-8 text-center mb-6">
          ${this.avatarHtml()}
          <h2 class="text-2xl font-black text-white mt-4">${this.profile?.name || ''}</h2>
          <p class="text-gray-500 text-xs font-mono mt-1">${this.profile?.email || ''}</p>
        </div>
        <div class="glass-card divide-y divide-white/5 overflow-hidden">
          <button type="button" id="goEdit" class="profile-menu-btn w-full text-left px-6 py-4 hover:bg-white/5 flex justify-between items-center">
            <span><i class="fas fa-edit text-primary mr-3"></i> Edit Profile</span>
            <i class="fas fa-chevron-right text-gray-600"></i>
          </button>
          <a href="/withdraw" class="profile-menu-btn block px-6 py-4 hover:bg-white/5 flex justify-between items-center">
            <span><i class="fas fa-wallet text-primary mr-3"></i> Withdraw</span>
            <i class="fas fa-chevron-right text-gray-600"></i>
          </a>
          <button type="button" id="logoutBtn" class="profile-menu-btn w-full text-left px-6 py-4 hover:bg-white/5 text-red-400">
            <i class="fas fa-sign-out-alt mr-3"></i> Logout
          </button>
        </div>
        <div class="grid grid-cols-2 gap-4 mt-6">
          <div class="glass-card p-4 text-center"><p class="stat-label">Total SMS</p><p class="text-xl font-black text-white">${this.profile?.totalSms || 0}</p></div>
          <div class="glass-card p-4 text-center"><p class="stat-label">Revenue</p><p class="text-xl font-black text-primary">$${(this.profile?.earningsBalance || 0).toFixed(2)}</p></div>
        </div>
      </div>`;
  }

  renderEdit() {
    return `
      <div class="max-w-lg mx-auto glass-card p-8">
        <div class="flex items-center justify-between mb-6">
          <button type="button" id="backMenu" class="text-gray-400 hover:text-primary text-sm"><i class="fas fa-arrow-left"></i> Back</button>
          <h3 class="font-black text-white uppercase text-sm">Edit Profile</h3>
        </div>
        <div class="flex flex-col items-center mb-8">
          ${this.avatarHtml('w-20 h-20')}
          <label class="mt-3 text-xs font-bold text-primary uppercase cursor-pointer">
            Upload Photo
            <input type="file" id="photoInput" accept="image/*" class="hidden">
          </label>
        </div>
        <form id="profileForm" class="space-y-4">
          ${this.field('name', 'Full Name', 'user')}
          ${this.field('phone', 'Phone', 'phone')}
          ${this.field('telegram', 'Telegram', 'paper-plane')}
          ${this.field('cryptoAddress', 'USDT TRC20', 'wallet')}
          <button type="submit" class="neon-btn w-full py-3 text-xs uppercase mt-4">Save Changes</button>
        </form>
      </div>`;
  }

  field(id, label, icon) {
    const val = this.formData[id] || '';
    return `
      <div>
        <label class="stat-label block mb-1">${label}</label>
        <div style="position:relative;display:flex;align-items:center;">
          <i class="fas fa-${icon}" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#6b7280;font-size:13px;pointer-events:none;z-index:1;"></i>
          <input type="text" id="${id}" value="${val.replace(/"/g, '&quot;')}"
            style="width:100%;padding:12px 14px 12px 40px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;"
            class="focus:border-primary/50 transition-colors">
        </div>
        ${this.errors[id] ? `<p style="color:#f87171;font-size:11px;margin:3px 0 0 4px;">${this.errors[id]}</p>` : ''}
      </div>`;
  }

  renderView() {
    return `
      <div class="max-w-lg mx-auto glass-card p-8">
        <button type="button" id="backMenu" class="text-gray-400 hover:text-primary text-sm mb-6"><i class="fas fa-arrow-left"></i> Back</button>
        <div class="flex items-center gap-6 mb-8">${this.avatarHtml()}<div>
          <h2 class="text-2xl font-black text-white">${this.profile?.name}</h2>
          <p class="text-gray-500 text-xs font-mono">${this.profile?.email}</p>
        </div></div>
        <div class="space-y-6">
          ${this.row('FULL NAME', this.profile?.name, 'user')}
          ${this.row('PHONE', this.profile?.phone || 'Not set', 'phone')}
          ${this.row('TELEGRAM', this.profile?.telegram || 'Not set', 'paper-plane')}
          ${this.row('USDT TRC20', this.profile?.cryptoAddress || 'Not set', 'wallet')}
          ${this.row('AGENT MAIL', this.profile?.agentEmail || this.profile?.referralEmail || 'None', 'user-tie')}
        </div>
      </div>`;
  }

  row(label, value, icon) {
    return `
      <div class="flex gap-4">
        <div class="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-gray-500"><i class="fas fa-${icon}"></i></div>
        <div><p class="text-[10px] font-black text-gray-500 uppercase">${label}</p><p class="text-white break-all">${value}</p></div>
      </div>`;
  }

  renderBody() {
    if (this.view === 'edit') return this.renderEdit();
    if (this.view === 'view') return this.renderView();
    return this.renderMenu();
  }

  render() {
    document.getElementById('app-skeleton')?.remove();
    document.getElementById('app').innerHTML = `
      <div class="min-h-screen bg-dark text-gray-200">
        <header class="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <a href="/dashboard" class="text-primary text-sm font-bold uppercase"><i class="fas fa-arrow-left"></i> Dashboard</a>
          <h1 class="font-black text-white uppercase">My Account</h1>
          <span class="w-8"></span>
        </header>
        <main class="max-w-lg mx-auto p-6">${this.renderBody()}</main>
      </div>`;
    document.getElementById('goEdit')?.addEventListener('click', () => {
      this.view = 'edit';
      this.render();
    });
    document.getElementById('backMenu')?.addEventListener('click', () => {
      this.view = 'menu';
      this.isEditing = false;
      this.render();
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('profileForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
    document.getElementById('photoInput')?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) this.handlePhotoUpload(e.target.files[0]);
    });
    ['name', 'phone', 'telegram', 'cryptoAddress'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        this.formData[id] = e.target.value;
      });
    });
  }

  async init() {
    await this.loadProfile();
    this.render();
  }
}
