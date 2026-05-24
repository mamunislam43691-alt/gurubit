/**
 * Agent panel sections — stacked: Dashboard → Users → Requests
 */

export function renderAgentOverview(stats) {
  if (!stats) return '';
  return `
    <section class="agent-page-section" id="agent-overview">
      <h2 class="agent-section-title"><i class="fas fa-chart-line mr-2"></i>Dashboard</h2>
      <div class="agent-card-grid agent-stats-grid">
        <div class="glass-card p-4 min-h-[72px]"><p class="stat-label text-[10px]">Members</p><p class="text-xl font-black text-white mt-1">${stats.totalMembers ?? 0}</p></div>
        <div class="glass-card p-4 min-h-[72px]"><p class="stat-label text-[10px]">Active</p><p class="text-xl font-black text-green-400 mt-1">${stats.activeMembers ?? 0}</p></div>
        <div class="glass-card p-4 min-h-[72px]"><p class="stat-label text-[10px]">Pending</p><p class="text-xl font-black text-orange-400 mt-1">${stats.pendingApprovals ?? 0}</p></div>
        <div class="glass-card p-4 min-h-[72px]"><p class="stat-label text-[10px]">Numbers</p><p class="text-xl font-black text-cyan-300 mt-1">${stats.totalNumbers ?? 0}</p></div>
        <div class="glass-card p-4 min-h-[72px] agent-stat-wide"><p class="stat-label text-[10px]">Team SMS</p><p class="text-xl font-black text-primary mt-1">${stats.totalSms ?? 0}</p></div>
      </div>
    </section>`;
}

export function renderAgentUsers(members = []) {
  return `
    <section class="agent-page-section" id="agent-users">
      <h2 class="agent-section-title"><i class="fas fa-users mr-2"></i>Users</h2>
      <div class="glass-card agent-table-scroll overflow-x-auto">
        <table class="number-history-table w-full text-sm">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Numbers</th><th>SMS</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${members.length ? members.map((m) => `
              <tr>
                <td class="text-white font-bold">${m.name}</td>
                <td class="text-gray-400 text-xs">${m.email}</td>
                <td class="text-gray-400 text-xs">${m.phone || '—'}</td>
                <td class="text-primary font-bold">${m.totalNumbers ?? 0}</td>
                <td>${m.totalSms ?? 0}</td>
                <td>${m.agentApproved ? '<span class="text-green-400 font-bold">Active</span>' : '<span class="text-orange-400 font-bold">Pending</span>'}</td>
                <td class="whitespace-nowrap">${!m.agentApproved ? `<button type="button" class="neon-btn px-3 py-1.5 text-xs agent-approve-user" data-uid="${m.id}">Approve</button>` : ''}</td>
              </tr>
            `).join('') : '<tr><td colspan="7" class="p-6 text-center text-gray-500">No users yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
}

export function renderAgentRequests(pending = []) {
  return `
    <section class="agent-page-section" id="agent-requests">
      <h2 class="agent-section-title"><i class="fas fa-user-clock mr-2"></i>User Requests</h2>
      <p class="text-xs text-gray-500 mb-3">New signups waiting for approval</p>
      <div class="glass-card agent-table-scroll overflow-x-auto">
        ${pending.length ? `
          <table class="number-history-table w-full text-sm">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Telegram</th><th>Crypto</th><th></th></tr></thead>
            <tbody>
              ${pending.map((p) => `
                <tr>
                  <td class="text-white font-bold">${p.name}</td>
                  <td class="text-gray-400 text-xs">${p.email}</td>
                  <td class="text-gray-400 text-xs">${p.phone || '—'}</td>
                  <td class="text-gray-400 text-xs">${p.telegram || '—'}</td>
                  <td class="text-gray-400 text-xs font-mono">${p.cryptoCurrencyType || ''} ${p.cryptoAddress || '—'}</td>
                  <td class="py-2 whitespace-nowrap">
                    <button type="button" class="neon-btn px-3 py-1.5 text-xs agent-accept mr-1" data-pid="${p.id}">Approve</button>
                    <button type="button" class="agent-reject text-red-400 text-xs font-bold uppercase" data-pid="${p.id}">Reject</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="p-6 text-gray-500 text-sm text-center">No pending requests</p>'}
      </div>
    </section>`;
}

export function renderAgentStack(agentData) {
  if (!agentData?.success) return '';
  const { stats, members, pending } = agentData;
  return `
    <div class="number-agent-panel mb-2">
      ${renderAgentOverview(stats)}
      ${renderAgentUsers(members)}
      ${renderAgentRequests(pending)}
    </div>`;
}
