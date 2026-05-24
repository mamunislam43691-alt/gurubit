import { AdminLayout } from './AdminLayout.js';

export class AdminCost {
  constructor() {
    this.countries = [];
    this.admin = null;
    this.selectedCountryId = null;
  }

  async load() {
    const res = await fetch('/api/admin/costs');
    const data = await res.json();
    if (data.success) this.countries = data.costs || [];
    if (!this.selectedCountryId && this.countries[0]) {
      this.selectedCountryId = this.countries[0].countryId;
    }
  }

  selectedCountry() {
    return this.countries.find((c) => c.countryId === this.selectedCountryId);
  }

  async save(countryId, serverId, userReward, agentReward) {
    await fetch(`/api/admin/costs/${countryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId: serverId || '',
        userReward: parseFloat(userReward),
        agentReward: parseFloat(agentReward)
      })
    });
    await this.load();
    this.render();
  }

  renderBody() {
    const c = this.selectedCountry();
    const ranges = c?.ranges || [];

    return `
      <p class="text-gray-500 text-sm mb-6">Select a country, then set user & agent reward for each range (server).</p>
      <motion.div class="flex flex-wrap gap-2 mb-6">
        ${this.countries.map((co) => `
          <button type="button" data-country-pick="${co.countryId}" class="number-filter-btn ${this.selectedCountryId === co.countryId ? 'is-active' : ''}">
            ${co.flag || '🌍'} ${co.name}
          </button>
        `).join('') || '<p class="text-gray-500">Add countries in Service first</p>'}
      </motion.div>
      ${c ? `
        <div class="space-y-3">
          ${ranges.map((r) => `
            <form class="cost-range-form glass-card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end" data-country="${c.countryId}" data-server="${r.serverId || ''}">
              <div class="sm:col-span-2">
                <p class="stat-label">Range / Server</p>
                <p class="text-white font-bold">${r.serverName || 'Default'}</p>
                <p class="text-xs text-gray-500 uppercase">${c.name}</p>
              </div>
              <div>
                <label class="stat-label">User reward</label>
                <input type="number" step="0.01" min="0" class="input-field user-r w-full" value="${r.userReward}">
              </div>
              <div>
                <label class="stat-label">Agent reward</label>
                <input type="number" step="0.01" min="0" class="input-field agent-r w-full" value="${r.agentReward}">
              </div>
              <div>
                <button type="submit" class="neon-btn w-full py-3 text-xs uppercase cost-save-btn">Save</button>
              </div>
            </form>
          `).join('')}
        </div>
      ` : ''}`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'costs',
      title: 'Cost Management',
      subtitle: 'Rewards per country range',
      bodyHtml: this.renderBody(),
      admin: this.admin
    });

    document.querySelectorAll('[data-country-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCountryId = btn.dataset.countryPick;
        this.render();
      });
    });

    document.querySelectorAll('.cost-range-form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.save(
          form.dataset.country,
          form.dataset.server,
          form.querySelector('.user-r').value,
          form.querySelector('.agent-r').value
        );
      });
    });
  }

  async init() {
    this.admin = await AdminLayout.ensureAuth();
    if (!this.admin) return;
    await this.load();
    this.render();
  }
}
