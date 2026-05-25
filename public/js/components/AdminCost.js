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
      <!-- Info box -->
      <div class="glass-card p-4 mb-6 border border-cyan-500/20">
        <p class="text-xs text-gray-300 leading-relaxed">
          <i class="fas fa-info-circle text-cyan-400 mr-1"></i>
          <b class="text-white">How rewards work:</b>
          When a user receives an SMS, they earn the <b class="text-primary">User Reward</b>.
          The agent who referred that user also earns the <b class="text-yellow-400">Agent Reward</b> automatically.
          If no SMS is received, no reward is given to anyone.
        </p>
      </div>

      <p class="text-gray-500 text-sm mb-4">Select a country, then set reward per range (server).</p>

      <div class="flex flex-wrap gap-2 mb-6">
        ${this.countries.map((co) => `
          <button type="button" data-country-pick="${co.countryId}"
            class="number-filter-btn ${this.selectedCountryId === co.countryId ? 'is-active' : ''}">
            ${co.flag || '🌍'} ${co.name}
          </button>
        `).join('') || '<p class="text-gray-500">Add countries in Service first</p>'}
      </div>

      ${c ? `
        <div class="space-y-3">
          ${ranges.map((r) => `
            <form class="cost-range-form glass-card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
              data-country="${c.countryId}" data-server="${r.serverId || ''}">
              <div class="sm:col-span-2">
                <p class="stat-label">Range / Server</p>
                <p class="text-white font-bold">${r.serverName || 'Default'}</p>
                <p class="text-xs text-gray-500 uppercase">${c.name}</p>
              </div>
              <div>
                <label class="stat-label flex items-center gap-1">
                  <i class="fas fa-user text-primary text-xs"></i> User Reward (per SMS)
                </label>
                <input type="number" step="0.01" min="0" class="input-field user-r w-full" value="${r.userReward}">
              </div>
              <div>
                <label class="stat-label flex items-center gap-1">
                  <i class="fas fa-user-tie text-yellow-400 text-xs"></i> Agent Reward (per SMS)
                </label>
                <input type="number" step="0.01" min="0" class="input-field agent-r w-full" value="${r.agentReward}">
              </div>
              <div>
                <button type="submit" class="neon-btn w-full py-3 text-xs uppercase cost-save-btn">
                  <i class="fas fa-save mr-1"></i> Save
                </button>
              </div>
            </form>
          `).join('')}
        </div>
      ` : '<p class="text-gray-500 text-sm">No ranges found for this country.</p>'}`;
  }

  render() {
    AdminLayout.renderShell({
      activeId: 'costs',
      title: 'Cost Management',
      subtitle: 'Set user & agent rewards per SMS received',
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
