/**
 * Aggregate dashboard stats from MongoDB collections
 */

function dayKey(iso) {
  const d = new Date(iso || Date.now());
  return d.toISOString().slice(0, 10);
}

function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function aggregateMessages(messages, numbersById) {
  let catalog;
  try {
    catalog = require('./catalogStore');
  } catch {
    catalog = null;
  }

  const appCounts = new Map();
  const rangeCounts = new Map();
  const dailySms = new Map();
  const dailyUsers = new Map();

  messages.forEach((m) => {
    const service = m.service || m.platformName || m.platformId || 'Other';
    appCounts.set(service, (appCounts.get(service) || 0) + 1);

    const num = numbersById.get(m.numberId);
    const countryId = m.country || num?.countryId || '—';
    const serverId = m.server || num?.serverId || '—';
    const meta = catalog?.resolveCountryMeta(countryId) || {
      id: countryId,
      name: num?.countryName || String(countryId),
      flag: '🌍'
    };
    const serverName = num?.serverName || catalog?.resolveServerName(serverId) || serverId;
    const rangeKey = `${meta.id}|${serverId}`;
    const prev = rangeCounts.get(rangeKey);
    rangeCounts.set(rangeKey, {
      country: meta.id,
      name: meta.name,
      flag: meta.flag || '🌍',
      iconData: meta.iconData || null,
      label: meta.name,
      server: serverName,
      serverId,
      count: (prev?.count || 0) + 1
    });

    const dk = dayKey(m.receivedAt || m.createdAt);
    dailySms.set(dk, (dailySms.get(dk) || 0) + 1);
    if (m.userId) {
      if (!dailyUsers.has(dk)) dailyUsers.set(dk, new Set());
      dailyUsers.get(dk).add(m.userId);
    }
  });

  const appColors = {
    Facebook: '#1877f2',
    WhatsApp: '#25d366',
    Telegram: '#0088cc',
    Google: '#ea4335',
    Instagram: '#e4405f',
    TikTok: '#111827'
  };

  const topApplications = Array.from(appCounts.entries())
    .map(([name, count]) => ({ name, count, color: appColors[name] || '#00c3ff' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topRanges = Array.from(rangeCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return { topApplications, topRanges, dailySms, dailyUsers };
}

function buildChart({ stats, dailySms, dailyUsers, users }) {
  const days = last7Days();
  const userSeries = days.map((d) => dailyUsers.get(d)?.size || 0);
  const smsSeries = days.map((d) => dailySms.get(d) || 0);

  const activeSeries = days.map((d) => {
    const cutoff = new Date(d + 'T23:59:59').getTime();
    return users.filter((u) => {
      const t = new Date(u.updatedAt || u.createdAt || 0).getTime();
      return t >= cutoff - 24 * 60 * 60 * 1000 && t <= cutoff;
    }).length;
  });

  const numberSeries = days.map(() => Math.max(0, Math.round((stats.totalNumbers || 0) / 7)));
  const supportSeries = days.map(() => Math.max(0, Math.round((stats.supportChats || 0) / 7)));

  return [
    { label: 'Total Users', value: stats.totalUsers, series: userSeries.map((v, i) => v || Math.round(stats.totalUsers * (i + 1) / 7)) },
    { label: 'Active Users', value: stats.activeUsers, series: activeSeries },
    { label: 'Total SMS', value: stats.totalSms, series: smsSeries },
    { label: 'Numbers', value: stats.totalNumbers, series: numberSeries },
    { label: 'Support', value: stats.supportChats, series: supportSeries }
  ];
}

function defaults(stats) {
  const topApplications = [
    { name: 'Facebook', count: 0, color: '#1877f2' },
    { name: 'WhatsApp', count: 0, color: '#25d366' },
    { name: 'Telegram', count: 0, color: '#0088cc' }
  ];
  const topRanges = catalogFallbackRanges();
  const chart = buildChart({
    stats,
    dailySms: new Map(),
    dailyUsers: new Map(),
    users: []
  });
  return { topApplications, topRanges, chart };
}

function catalogFallbackRanges() {
  try {
    const catalog = require('./catalogStore');
    return catalog.listCountries().slice(0, 5).map((c) => ({
      country: c.id,
      name: c.name,
      flag: c.flag || '🌍',
      iconData: c.iconData || null,
      label: c.name,
      server: catalog.listServers(c.id)[0]?.name || c.code,
      count: 0
    }));
  } catch {
    return [];
  }
}

async function buildDashboardAnalytics(collections, stats, users) {
  const messages = [];
  const numbersById = new Map();

  try {
    const msgSnap = await collections.smsMessages.get();
    msgSnap.forEach((doc) => messages.push(doc.data()));
  } catch {}

  try {
    const numSnap = await collections.phoneNumbers.get();
    numSnap.forEach((doc) => numbersById.set(doc.id, doc.data()));
  } catch {}

  if (!messages.length) {
    const fb = defaults(stats);
    return fb;
  }

  const { topApplications, topRanges, dailySms, dailyUsers } = aggregateMessages(messages, numbersById);
  const chart = buildChart({ stats, dailySms, dailyUsers, users });

  const topServices = topRanges.slice(0, 8).map((r) => ({
    label: `${r.label} · ${r.server}`,
    count: r.count
  }));

  return {
    topApplications: topApplications.length ? topApplications : defaults(stats).topApplications,
    topRanges: topRanges.length ? topRanges : defaults(stats).topRanges,
    chart,
    topServices
  };
}

async function buildUserDashboardAnalytics(collections, userId) {
  const messages = [];
  try {
    const snap = await collections.smsMessages.where('userId', '==', userId).get();
    snap.forEach((doc) => messages.push(doc.data()));
  } catch {
    try {
      const all = await collections.smsMessages.get();
      all.forEach((doc) => {
        const m = doc.data();
        if (m.userId === userId) messages.push(m);
      });
    } catch {}
  }

  const numbersById = new Map();
  try {
    const nums = await collections.phoneNumbers.where('userId', '==', userId).get();
    nums.forEach((doc) => numbersById.set(doc.id, doc.data()));
  } catch {}

  const { topApplications, topRanges } = aggregateMessages(messages, numbersById);
  const enrichedRanges = topRanges.length
    ? topRanges
    : catalogFallbackRanges();
  if (!topApplications.length) {
    return {
      topApplications: [
        { name: 'WhatsApp', count: 0, color: '#25d366' },
        { name: 'Facebook', count: 0, color: '#1877f2' },
        { name: 'Telegram', count: 0, color: '#0088cc' }
      ],
      topRanges: enrichedRanges
    };
  }
  return { topApplications, topRanges: enrichedRanges };
}

module.exports = {
  buildDashboardAnalytics,
  buildUserDashboardAnalytics
};
