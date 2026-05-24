/**
 * Admin Service — countries, manage services (servers), numbers
 */

import { AdminLayout } from './AdminLayout.js';

export class AdminServices {
  constructor() {
    this.countries = [];
    this.admin = null;
    this.servers = [];
    this.providers = [];
    this.showAddCountryModal = false;
    this.showCountryActionsModal = false;
    this.showManageServiceModal = false;
    this.showServerModal = false;
    this.modalCountry = null;
    this.editCountryMode = false;
    this.formCountry = { name: '', code: '', flag: '🌍', iconData: null };
    this.selectedServer = null;
  }

  countryCardFlag(c) {
    if (c.iconData) return `<img src="${c.iconData}" class="country-flag-img w-10 h-8 object-cover rounded" alt="">`;
    return `<span class="text-4xl leading-none country-flag-emoji">${c.flag || '🌍'}</span>`;
  }

  async loadCountries() {
    const res = await fetch('/api/admin/catalog/countries');
    const data = await res.json();
    if (data.success) this.countries = data.countries;
  }

  async loadServers(countryId) {
    const res = await fetch(`/api/admin/catalog/countries/${countryId}/platforms`);
    const data = await res.json();
    if (data.success) this.servers = data.servers || [];
  }

  async loadProviders() {
    const res = await fetch('/api/admin/api-keys');
    const data = await res.json();
    if (data.success) {
      this.providers = (data.keys || []).filter(k => k.providerType === 'integrated');
    }
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async saveCountry(e) {
    e?.preventDefault();
    const payload = { ...this.formCountry };
    if (!payload.iconData) payload.flag = payload.flag || '🌍';
    const url = this.editCountryMode && this.modalCountry
      ? `/api/admin/countries/${this.modalCountry.id}`
      : '/api/admin/countries';
    const method = this.editCountryMode ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    this.showAddCountryModal = false;
    this.editCountryMode = false;
    this.formCountry = { name: '', code: '', flag: '🌍', iconData: null };
    await this.loadCountries();
    this.render();
  }

  async deleteCountry(id) {
    if (!confirm('Delete this country and ALL servers & numbers?')) return;
    await fetch(`/api/admin/countries/${id}`, { method: 'DELETE' });
    this.closeModals();
    await this.loadCountries();
    this.render();
  }

  async clearCountry(id) {
    if (!confirm('Clear all servers and numbers for this country?')) return;
    await fetch(`/api/admin/countries/${id}/clear`, { method: 'POST' });
    this.closeModals();
    await this.loadCountries();
    this.render();
  }

  async addServer(name) {
    const countryId = this.modalCountry?.id;
    if (!countryId || !name?.trim()) return;
    const res = await fetch('/api/admin/catalog/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryId, name: name.trim() })
    });
    const data = await res.json();
    if (!data.success) return alert(data.error?.message || 'Failed');
    await this.loadServers(countryId);
    // Clear the input field before re-render
    const inp = document.getElementById('newServiceName');
    if (inp) inp.value = '';
    this.render();
  }

  async saveServerName() {
    const name = document.getElementById('serverNameInput')?.value?.trim();
    if (!name) return;
    await fetch(`/api/admin/catalog/servers/${this.selectedServer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await this.loadServers(this.modalCountry.id);
    this.selectedServer = this.servers.find((s) => s.id === this.selectedServer.id);
    this.render();
  }

  async addNumbersBulk() {
    const raw = document.getElementById('bulkNumbersInput')?.value || '';
    if (!raw.trim()) return alert('Paste phone numbers (one per line)');
    const res = await fetch(`/api/admin/catalog/servers/${this.selectedServer.id}/numbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers: raw })
    });
    const data = await res.json();
    if (data.success) {
      await this.loadServers(this.modalCountry.id);
      this.selectedServer = this.servers.find((s) => s.id === this.selectedServer.id);
      this.render();
      alert(`Added ${data.added?.length || 0} number(s)`);
    }
  }

  async clearServer() {
    if (!confirm('Delete all numbers in this server?')) return;
    await fetch(`/api/admin/catalog/servers/${this.selectedServer.id}/clear`, { method: 'POST' });
    await this.loadServers(this.modalCountry.id);
    this.selectedServer = this.servers.find((s) => s.id === this.selectedServer.id);
    this.render();
  }

  async deleteServer() {
    if (!confirm('Delete this server and all its numbers?')) return;
    await fetch(`/api/admin/catalog/servers/${this.selectedServer.id}`, { method: 'DELETE' });
    this.selectedServer = null;
    this.showServerModal = false;
    await this.loadServers(this.modalCountry.id);
    this.render();
  }

  closeModals() {
    this.showAddCountryModal = false;
    this.showCountryActionsModal = false;
    this.showManageServiceModal = false;
    this.showServerModal = false;
    this.editCountryMode = false;
    this.modalCountry = null;
    this.selectedServer = null;
  }

  renderAddCountryModal() {
    return `
      <div class="admin-modal-backdrop" id="addCountryModal">
        <div class="admin-modal glass-card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-black text-white uppercase">${this.editCountryMode ? 'Edit Country' : 'Add Country'}</h3>
            <button type="button" class="admin-modal-close" data-close-modal>×</button>
          </div>
          <form id="addCountryForm" class="space-y-3">
            <input class="input-field w-full" id="cName" placeholder="Country name (Bangladesh)" required value="${this.formCountry.name || ''}">
            <input class="input-field w-full" id="cCode" placeholder="Country code (+880)" required value="${this.formCountry.code || ''}">
            <input class="input-field w-full" id="cFlag" placeholder="Flag emoji (optional)" value="${this.formCountry.flag || '🌍'}">
            <label class="text-xs text-gray-400 block">Icon upload (optional)</label>
            <input type="file" id="cIcon" accept="image/*" class="text-xs w-full">
            <button type="submit" class="neon-btn w-full py-3 text-xs uppercase">Save Country</button>
          </form>
        </div>
      </div>`;
  }

  renderCountryActionsModal() {
    const c = this.modalCountry;
    if (!c) return '';
    return `
      <div class="admin-modal-backdrop" id="countryActionsModal">
        <div class="admin-modal glass-card">
          <div class="flex items-center gap-3 mb-5">
            ${this.countryCardFlag(c)}
            <div>
              <h3 class="font-black text-white">${c.name}</h3>
              <p class="text-primary text-sm font-bold">${c.code}</p>
            </div>
            <button type="button" class="admin-modal-close ml-auto text-2xl" data-close-modal>×</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="editCountryBtn" class="admin-action-btn admin-action-btn--primary">Edit</button>
            <button type="button" id="manageServiceBtn" class="admin-action-btn admin-action-btn--primary">Manage Service</button>
            <button type="button" id="deleteCountryBtn" class="admin-action-btn admin-action-btn--danger">Delete</button>
            <button type="button" id="clearDataBtn" class="admin-action-btn admin-action-btn--warn">Clear Data</button>
          </div>
        </div>
      </div>`;
  }

  renderManageServiceModal() {
    const c = this.modalCountry;
    if (!c) return '';
    return `
      <div class="admin-modal-backdrop" id="manageServiceModal">
        <div class="admin-modal glass-card max-w-lg w-full">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h3 class="font-black text-white uppercase text-sm">Manage Service</h3>
              <p class="text-primary text-xs font-bold">${c.name} · ${c.code}</p>
            </div>
            <button type="button" class="admin-modal-close text-2xl" data-close-modal>×</button>
          </div>
          <p class="stat-label mb-2">Add Service</p>
          <div class="manage-service-add">
            <input type="text" id="newServiceName" class="input-field" placeholder="Service name (e.g. Bangladesh WhatsApp)">
            <button type="button" id="addServiceBtn" class="neon-btn px-4 py-2 text-xs uppercase whitespace-nowrap">+ Add Service</button>
          </div>
          <p class="stat-label mb-2 mt-4">Services / Servers</p>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            ${this.servers.length ? this.servers.map((s) => `
              <button type="button" class="service-server-row glass-card w-full text-left p-4 flex justify-between items-center open-server" data-id="${s.id}">
                <div>
                  <p class="font-bold text-white text-base">${s.name}</p>
                  <p class="text-xs text-gray-500">${s.providerId ? '<span class="text-primary font-bold">API Connection (এ পি আই কানেকশন)</span>' : `${(s.numbers || []).length} available`}</p>
                </div>
                <i class="fas fa-chevron-right text-primary"></i>
              </button>
            `).join('') : '<p class="text-gray-500 text-sm p-4 text-center">No services yet — add one above</p>'}
          </div>
        </div>
      </div>`;
  }

  renderServerModal() {
    const s = this.selectedServer;
    if (!s) return '';

    return `
      <div class="admin-modal-backdrop" id="serverModal">
        <div class="admin-modal glass-card max-w-lg w-full max-h-[85vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-black text-white">${s.name}</h3>
            <button type="button" class="admin-modal-close text-2xl" data-close-modal>×</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="stat-label block mb-1">Edit server name</label>
              <div class="flex gap-2">
                <input id="serverNameInput" class="input-field flex-1" value="${s.name}">
                <button type="button" id="saveServerNameBtn" class="admin-action-btn admin-action-btn--primary">Save</button>
              </div>
            </div>

            <div>
              <label class="stat-label block mb-1">Add numbers to local pool (one per line)</label>
              <textarea id="bulkNumbersInput" class="input-field w-full min-h-[100px] font-mono text-sm" placeholder="+8801...\n+8801..."></textarea>
              <button type="button" id="bulkAddNumbersBtn" class="admin-action-btn admin-action-btn--primary w-full mt-2">+ Add Numbers</button>
            </div>
            <div class="max-h-32 overflow-y-auto border border-white/10 rounded-lg p-2">
              ${(s.numbers || []).length
                ? s.numbers.map((n) => `<p class="text-sm font-mono text-primary py-1 border-b border-white/5">${n}</p>`).join('')
                : '<p class="text-gray-500 text-sm p-2">No local numbers</p>'}
            </div>
            <div class="flex gap-2">
              <button type="button" id="clearServerBtn" class="admin-action-btn admin-action-btn--warn flex-1 text-xs">Clear Local Numbers</button>
              <button type="button" id="deleteServerBtn" class="admin-action-btn admin-action-btn--danger flex-1 text-xs">Delete Server</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  renderList() {
    return `
      <div class="flex flex-wrap justify-between items-center gap-3 mb-6">
        <p class="text-gray-400 text-sm">${this.countries.length} countries · click to manage</p>
        <button type="button" id="openAddCountry" class="neon-btn px-5 py-2.5 text-xs uppercase">+ Add Country</button>
      </div>
      <div class="service-country-grid">
        ${this.countries.length ? this.countries.map((c) => `
          <button type="button" class="service-country-card glass-card open-country" data-id="${c.id}">
            ${this.countryCardFlag(c)}
            <p class="font-black text-white uppercase mt-3 text-sm">${c.name}</p>
            <p class="text-primary font-bold text-sm">${c.code}</p>
          </button>
        `).join('') : '<p class="text-gray-500 col-span-full text-center p-12">No countries — add your first country</p>'}
      </div>
      ${this.showAddCountryModal ? this.renderAddCountryModal() : ''}
      ${this.showCountryActionsModal ? this.renderCountryActionsModal() : ''}
      ${this.showManageServiceModal ? this.renderManageServiceModal() : ''}
      ${this.showServerModal ? this.renderServerModal() : ''}`;
  }

  renderBody() {
    return this.renderList();
  }

  bindModals() {
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.showServerModal) {
          this.showServerModal = false;
          this.selectedServer = null;
        } else {
          this.closeModals();
        }
        this.render();
      });
    });
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'services',
      title: 'Service',
      subtitle: 'Countries, servers & numbers',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    this.bindModals();

    document.getElementById('openAddCountry')?.addEventListener('click', () => {
      this.editCountryMode = false;
      this.formCountry = { name: '', code: '', flag: '🌍', iconData: null };
      this.showAddCountryModal = true;
      this.render();
    });

    document.getElementById('addCountryForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const iconFile = document.getElementById('cIcon')?.files?.[0];
      let iconData = null;
      if (iconFile) iconData = await this.fileToDataUrl(iconFile);
      const rawCode = document.getElementById('cCode').value.trim();
      this.formCountry = {
        name: document.getElementById('cName').value.trim(),
        code: rawCode,
        flag: document.getElementById('cFlag').value.trim() || '🌍',
        iconData
      };
      await this.saveCountry(e);
    });

    document.querySelectorAll('.open-country').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.modalCountry = this.countries.find((c) => c.id === btn.dataset.id);
        this.showCountryActionsModal = true;
        this.showManageServiceModal = false;
        this.render();
      });
    });

    document.getElementById('editCountryBtn')?.addEventListener('click', () => {
      this.editCountryMode = true;
      this.formCountry = { ...this.modalCountry };
      this.showCountryActionsModal = false;
      this.showAddCountryModal = true;
      this.render();
    });

    document.getElementById('manageServiceBtn')?.addEventListener('click', async () => {
      this.showCountryActionsModal = false;
      this.showManageServiceModal = true;
      await this.loadServers(this.modalCountry.id);
      this.render();
    });

    document.getElementById('addServiceBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('newServiceName')?.value;
      await this.addServer(name);
      // Note: addServer clears the input before re-render, so no need to clear here
    });

    document.getElementById('deleteCountryBtn')?.addEventListener('click', () => this.deleteCountry(this.modalCountry.id));
    document.getElementById('clearDataBtn')?.addEventListener('click', () => this.clearCountry(this.modalCountry.id));

    document.querySelectorAll('.open-server').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.loadServers(this.modalCountry.id);
        this.selectedServer = this.servers.find((s) => s.id === btn.dataset.id);
        this.showServerModal = true;
        this.render();
      });
    });

    document.getElementById('saveServerNameBtn')?.addEventListener('click', () => this.saveServerName());

    document.getElementById('bulkAddNumbersBtn')?.addEventListener('click', () => this.addNumbersBulk());
    document.getElementById('clearServerBtn')?.addEventListener('click', () => this.clearServer());
    document.getElementById('deleteServerBtn')?.addEventListener('click', () => this.deleteServer());
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.loadCountries();
    this.render();
  }
}
