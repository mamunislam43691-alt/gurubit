/**
 * Poll external provider API for incoming SMS (both Webhook and Integrated APIs)
 * With comprehensive error handling, timeouts, and resource monitoring
 */

const providerStore = require('./providerStore');
const { processIncomingSMS } = require('../utils/smsProcessor');
const { collections } = require('../config/firebase');

// seen: Map of id → receivedAt (to allow re-processing updated SMS for same number)
const seen = new Map();
const MAX_SEEN = 5000;

// Server start time — only process SMS from last 5 minutes
// SMS older than 5 minutes are ignored to avoid processing stale messages
const SMS_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
console.log(`[Poller] Server started at ${new Date().toISOString()} — only processing SMS from last 5 minutes`);

// Track numbers that received SMS → for 3-call retry within 3 minutes
// Map: phoneNumber → { count: number, firstReceivedAt: timestamp, intervalId: NodeJS.Timeout }
const retryTrackers = new Map();

const errorTrackers = {};
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const connectionStatuses = {}; // providerId -> { status: 'connected' | 'disconnected', lastPollTime: string, lastError: string | null }

// Firestore quota backoff control (on RESOURCE_EXHAUSTED)
const FIRESTORE_BACKOFF_BASE_MS = Number(process.env.FIRESTORE_BACKOFF_BASE_MS) || 60 * 1000; // 1 minute
const FIRESTORE_BACKOFF_MAX_MS = Number(process.env.FIRESTORE_BACKOFF_MAX_MS) || 15 * 60 * 1000; // 15 minutes
const firestoreBackoff = { attempts: 0, pausedUntil: 0 };

// Resource monitoring
// Integrated Number API polling disabled.
// This deployment only accepts SMS via provider webhook / polling endpoints.
// The integrated "number acquisition" flow (getNumber/getSms URLs) has been removed
// to ensure the server does not request or allocate phone numbers from providers.
const pollStats = {
  lastPollTime: null,
  totalPolls: 0,
  successfulPolls: 0,
  failedPolls: 0,
  memoryUsage: 0
};

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(tid);
    return res;
  } catch (err) {
    clearTimeout(tid);
    if (err.name === 'AbortError') {
      const e = new Error(`Request timeout after ${timeoutMs}ms`);
      e.name = 'TimeoutError';
      throw e;
    }
    throw err;
  }
}

/**
 * Remember a seen message ID to avoid reprocessing
 */
function remember(id, receivedAt) {
  if (seen.size >= MAX_SEEN) {
    // Remove oldest entries
    const keys = seen.keys();
    for (let i = 0; i < 500; i++) {
      const k = keys.next().value;
      if (k) seen.delete(k);
    }
  }
  seen.set(id, receivedAt || new Date().toISOString());
}

/**
 * Throttled warning logger — only logs once per THROTTLE_MS per key
 */
function logWarnThrottled(key, message) {
  const now = Date.now();
  if (!errorTrackers[key] || now - errorTrackers[key] > THROTTLE_MS) {
    errorTrackers[key] = now;
    console.warn(message);
  }
}

/**
 * Reset throttle tracker for a key (on success)
 */
function resetThrottleTracker(key) {
  delete errorTrackers[key];
}

/**
 * Start retry tracker for a phone number that received an SMS
 * Polls the provider 3 more times within 3 minutes to catch follow-up OTPs
 */
function startRetryTracker(phoneNumber, parsed, wss) {
  if (retryTrackers.has(phoneNumber)) return; // already tracking
  const tracker = {
    count: 0,
    firstReceivedAt: Date.now(),
    intervalId: null
  };
  tracker.intervalId = setInterval(() => {
    tracker.count++;
    if (tracker.count >= 3 || Date.now() - tracker.firstReceivedAt > 3 * 60 * 1000) {
      clearInterval(tracker.intervalId);
      retryTrackers.delete(phoneNumber);
    }
  }, 60 * 1000); // check every minute
  retryTrackers.set(phoneNumber, tracker);
}

// ─── Auto Range Selector ────────────────────────────────────────────────────
// Every 2 hours: fetch CLI ranges, pick the one with most OTPs, store as active range
// Map: providerId → { rangeName, selectedAt, otpCount }
const activeRanges = new Map();
const RANGE_REFRESH_MS = 2 * 60 * 60 * 1000; // 2 hours

async function refreshBestRange(provider) {
  try {
    const baseUrl = provider.baseUrl.replace(/\/$/, '');
    const headers = { 'x-api-key': provider.apiKey, 'Accept': 'application/json' };

    // Fetch CLI ranges with counts
    const res = await fetchWithTimeout(`${baseUrl}/cli-ranges`, { headers }, 10000);
    if (!res.ok) return;
    const body = await res.json();
    const ranges = body.data || [];
    if (ranges.length === 0) return;

    // Pick range with highest OTP count (or highest number count as fallback)
    let best = ranges[0];
    for (const r of ranges) {
      const rScore = (r.otpCount || r.count || 0);
      const bScore = (best.otpCount || best.count || 0);
      if (rScore > bScore) best = r;
    }

    const prev = activeRanges.get(provider.id);
    activeRanges.set(provider.id, {
      rangeName: best.name,
      selectedAt: Date.now(),
      otpCount: best.otpCount || best.count || 0
    });

    if (!prev || prev.rangeName !== best.name) {
      console.log(`\n🔄 [Auto Range] "${provider.serviceName}" → Best range: ${best.name} (${best.otpCount || best.count || '?'} OTPs)\n`);
    }
  } catch (err) {
    if (process.env.DEBUG_POLLING === 'true') {
      console.warn(`[Auto Range] Failed to refresh range for ${provider.serviceName}:`, err.message);
    }
  }
}

async function maybeRefreshRanges() {
  const providers = providerStore.list().filter(p => p.providerType === 'integrated');
  for (const provider of providers) {
    // Skip auto-refresh if admin has set a manual CLI range
    if (provider.cliRange) continue;
    const current = activeRanges.get(provider.id);
    const needsRefresh = !current || (Date.now() - current.selectedAt) > RANGE_REFRESH_MS;
    if (needsRefresh) {
      await refreshBestRange(provider);
    }
  }
}

function getActiveRangeName(providerId) {
  const provider = providerStore.list().find(p => p.id === providerId);
  // If admin set a manual CLI range, always use that
  if (provider?.cliRange) return provider.cliRange;
  // Otherwise use auto-selected best range
  return activeRanges.get(providerId)?.rangeName || null;
}
// ────────────────────────────────────────────────────────────────────────────

function extractMessages(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.messages)) return body.messages;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.sms)) return body.sms;
  if (body.message || body.phoneNumber || body.number) return [body];
  return [];
}

/**
 * Detect platform name and icon from SMS content
 */
function detectPlatform(content) {
  if (!content) return { name: 'SMS', icon: '💬' };
  const c = content.toLowerCase();

  if (c.includes('facebook') || c.includes('fb'))           return { name: 'Facebook',  icon: '🔵' };
  if (c.includes('instagram'))                               return { name: 'Instagram', icon: '🟣' };
  if (c.includes('whatsapp'))                                return { name: 'WhatsApp',  icon: '🟢' };
  if (c.includes('tiktok') || c.includes('tik tok'))        return { name: 'TikTok',    icon: '⚫' };
  if (c.includes('telegram'))                                return { name: 'Telegram',  icon: '🔷' };
  if (c.includes('twitter') || c.includes('x.com'))         return { name: 'Twitter/X', icon: '🐦' };
  if (c.includes('google') || c.includes('gmail'))          return { name: 'Google',    icon: '🔴' };
  if (c.includes('apple') || c.includes('icloud'))          return { name: 'Apple',     icon: '🍎' };
  if (c.includes('microsoft') || c.includes('outlook'))     return { name: 'Microsoft', icon: '🟦' };
  if (c.includes('amazon') || c.includes('aws'))            return { name: 'Amazon',    icon: '🟠' };
  if (c.includes('paypal'))                                  return { name: 'PayPal',    icon: '💙' };
  if (c.includes('binance'))                                 return { name: 'Binance',   icon: '🟡' };
  if (c.includes('coinbase'))                                return { name: 'Coinbase',  icon: '🔵' };
  if (c.includes('uber'))                                    return { name: 'Uber',      icon: '⬛' };
  if (c.includes('snapchat'))                                return { name: 'Snapchat',  icon: '🟡' };
  if (c.includes('linkedin'))                                return { name: 'LinkedIn',  icon: '🔵' };
  if (c.includes('youtube'))                                 return { name: 'YouTube',   icon: '🔴' };
  if (c.includes('netflix'))                                 return { name: 'Netflix',   icon: '🔴' };
  if (c.includes('discord'))                                 return { name: 'Discord',   icon: '🟣' };
  if (c.includes('reddit'))                                  return { name: 'Reddit',    icon: '🟠' };
  if (c.includes('viber'))                                   return { name: 'Viber',     icon: '🟣' };
  if (c.includes('line'))                                    return { name: 'Line',      icon: '🟢' };
  if (c.includes('wechat') || c.includes('we chat'))        return { name: 'WeChat',    icon: '🟢' };
  if (c.includes('imo'))                                     return { name: 'IMO',       icon: '🔵' };
  if (c.includes('signal'))                                  return { name: 'Signal',    icon: '🔵' };
  if (c.includes('rednote') || c.includes('red note') || c.includes('xiaohongshu')) return { name: 'RedNote', icon: '🔴' };
  if (c.includes('verification') || c.includes('verify') || c.includes('otp') || c.includes('code')) return { name: 'Verification', icon: '🔐' };
  return { name: 'SMS', icon: '💬' };
}

function parseRow(row) {
  const phoneNumber =
    row.phoneNumber || row.number || row.phone || row.msisdn || row.to || row.receiver;
  const content =
    row.message || row.content || row.text || row.sms || row.body || row.msg || row.message_text;
  
  // Extract OTP: use explicit field first, then extract from message text
  let otp = row.otp || row.otp_code || row.otpCode || null;
  if (!otp && content) {
    // Extract 4-8 digit code from message (handles "307 628", "123456", etc.)
    const cleaned = String(content).replace(/\s+/g, '');
    const match = cleaned.match(/\b(\d{4,8})\b/);
    if (match) otp = match[1];
  }

  const id = row.id || row._id || `${phoneNumber}:${content}`;
  const receivedAt = row.received_at || row.receivedAt || row.createdAt || new Date().toISOString();
  const platform = row.platform || row.platformName || row.service || detectPlatform(content).name;
  if (!phoneNumber || !content) return null;
  return { 
    id: String(id), 
    phoneNumber: String(phoneNumber), 
    content: String(content),
    otp: otp ? String(otp) : null,
    receivedAt,
    platform
  };
}

/**
 * Poll a single provider URL — returns array of new parsed messages
 */
// Track last successful poll time per URL for since= parameter
const lastPollTimes = new Map();

async function pollProviderUrl(provider, rawUrl, wss) {
  // Use the URL exactly as configured — do NOT append /otp or any path
  const url = rawUrl.replace(/\/$/, '');
  const urlSeparator = url.includes('?') ? '&' : '?';

  // Use since= to only fetch SMS received after our last poll (or server start)
  const pollKey = `${provider.id}:${rawUrl}`;
  const since = lastPollTimes.get(pollKey) || new Date(Date.now() - 60 * 1000).toISOString(); // default: last 60s
  const finalUrl = `${url}${urlSeparator}limit=100&since=${encodeURIComponent(since)}`;

  const headers = { Accept: 'application/json' };
  if (url.includes('203.161.58.20') || provider.apiKey.startsWith('sk_')) {
    headers['x-api-key'] = provider.apiKey;
  } else {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
    headers['X-API-Key'] = provider.apiKey;
    headers['x-api-key'] = provider.apiKey;
  }

  const providerKey = `${provider.id}:${rawUrl}`;
  if (!connectionStatuses[providerKey]) {
    connectionStatuses[providerKey] = { status: 'unknown', lastPollTime: null, lastError: null };
  }
  const prevStatus = connectionStatuses[providerKey].status;

  let res;
  try {
    res = await fetchWithTimeout(finalUrl, { method: 'GET', headers }, 10000);
  } catch (e) {
    pollStats.failedPolls++;
    const isNetworkErr = e.message.includes('fetch failed') ||
                         e.message.includes('timeout') ||
                         e.message.includes('ECONNREFUSED') ||
                         e.name === 'TimeoutError';
    const friendlyMsg = isNetworkErr
      ? `⚠️  [API Provider] "${provider.serviceName || 'Provider'}" (${rawUrl}) is currently offline or unreachable (Connection Timeout)`
      : `Provider poll failed for ${provider.serviceName || 'Provider'} (${rawUrl}): ${e.message}`;

    logWarnThrottled(providerKey, friendlyMsg);
    connectionStatuses[providerKey] = { status: 'disconnected', lastPollTime: new Date().toISOString(), lastError: friendlyMsg };

    if (prevStatus === 'connected') {
      console.log(`\n🔴 [API Provider] "${provider.serviceName || 'Provider'}" (${rawUrl}) DISCONNECTED (Connection Failed)\n`);
      if (wss) {
        try { wss.broadcast({ type: 'provider_status_changed', providerId: provider.id, url: rawUrl, status: 'disconnected', lastError: friendlyMsg, lastPollTime: connectionStatuses[providerKey].lastPollTime }); }
        catch (broadcastErr) { console.warn('Failed to broadcast provider status:', broadcastErr.message); }
      }
    }
    return [];
  }

  if (!res.ok) {
    pollStats.failedPolls++;
    const errMsg = `⚠️  [API Provider] "${provider.serviceName || 'Provider'}" (${rawUrl}) returned HTTP Status ${res.status}`;
    logWarnThrottled(providerKey, errMsg);
    connectionStatuses[providerKey] = { status: 'disconnected', lastPollTime: new Date().toISOString(), lastError: errMsg };

    if (prevStatus === 'connected') {
      console.log(`\n🔴 [API Provider] "${provider.serviceName || 'Provider'}" (${rawUrl}) DISCONNECTED (HTTP Status ${res.status})\n`);
      if (wss) {
        try { wss.broadcast({ type: 'provider_status_changed', providerId: provider.id, url: rawUrl, status: 'disconnected', lastError: errMsg, lastPollTime: connectionStatuses[providerKey].lastPollTime }); }
        catch (broadcastErr) { console.warn('Failed to broadcast provider status:', broadcastErr.message); }
      }
    }
    return [];
  }

  resetThrottleTracker(providerKey);
  pollStats.successfulPolls++;
  connectionStatuses[providerKey] = { status: 'connected', lastPollTime: new Date().toISOString(), lastError: null };
  // Update since time for next poll
  lastPollTimes.set(pollKey, new Date().toISOString());

  if (prevStatus !== 'connected') {
    console.log(`\n🟢 [API Provider] "${provider.serviceName || 'Provider'}" (${rawUrl}) Connection Successful\n`);
    if (wss) {
      try { wss.broadcast({ type: 'provider_status_changed', providerId: provider.id, url: rawUrl, status: 'connected', lastError: null, lastPollTime: connectionStatuses[providerKey].lastPollTime }); }
      catch (broadcastErr) { console.warn('Failed to broadcast provider status:', broadcastErr.message); }
    }
  }

  let body;
  try {
    body = await res.json();
  } catch (jsonErr) {
    console.warn(`Failed to parse JSON response from ${provider.serviceName}: ${jsonErr.message}`);
    return [];
  }

  const rows = extractMessages(body);

  const newMessages = [];
  for (const row of rows) {
    try {
      const parsed = parseRow(row);
      if (!parsed) continue;

      // Skip already-processed messages (by ID)
      if (seen.has(parsed.id)) continue;
      
      remember(parsed.id, parsed.receivedAt);
      newMessages.push(parsed);
    } catch (rowErr) {
      console.warn('Error processing row:', rowErr.message);
    }
  }

  if (newMessages.length > 0) {
    newMessages.forEach(m => {
      const time = m.receivedAt ? new Date(m.receivedAt).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : '—';
      const plat = detectPlatform(m.content);
      console.log(`\n📨 [${provider.serviceName}] New SMS received`);
      console.log(`   📱 +${m.phoneNumber} | ${time}`);
      console.log(`   ${plat.icon} ${plat.name} | ${m.content || '—'}`);
    });
  }

  return newMessages;
}

async function pollOnce(wss) {
  const startTime = Date.now();
  pollStats.lastPollTime = startTime;
  pollStats.totalPolls++;

  try {
    const memUsage = process.memoryUsage();
    pollStats.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024);
    if (pollStats.memoryUsage > 200) {
      console.warn(`⚠️  High memory usage detected: ${pollStats.memoryUsage}MB`);
    }

    const allProviders = providerStore.list().filter(p => p.providerType !== 'integrated');

    // Build a flat list of all (provider, url) pairs to poll in PARALLEL
    const pollTasks = [];
    for (const provider of allProviders) {
      if (!provider.apiKey) continue;
      const urls = [];
      if (provider.baseUrl) urls.push(provider.baseUrl.trim());
      if (Array.isArray(provider.additionalUrls)) {
        provider.additionalUrls.forEach(u => { if (u && u.trim()) urls.push(u.trim()); });
      }
      for (const rawUrl of urls) {
        pollTasks.push({ provider, rawUrl });
      }
    }

    if (pollTasks.length === 0) return;

    // Fire ALL provider requests simultaneously — no waiting for one before the next
    const results = await Promise.allSettled(
      pollTasks.map(({ provider, rawUrl }) =>
        pollProviderUrl(provider, rawUrl, wss).catch(err => {
          console.warn(`Error polling URL ${rawUrl}:`, err.message);
          return [];
        })
      )
    );

    // Process all received messages
    const processPromises = [];
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const parsed of result.value) {

        // Step 1: Broadcast to SMS Feed immediately as unmatched
        // Admin sees ALL incoming SMS in real-time
        if (wss) {
          try {
            const { getCountryFromPhone } = require('../routes/smsRoutes');
            const meta = getCountryFromPhone(parsed.phoneNumber);
            wss.broadcast({
              type: 'new_sms',
              message: {
                id: parsed.id,
                phoneNumber: parsed.phoneNumber,
                otp: parsed.otp,
                otpCode: parsed.otp,
                content: parsed.content,
                message: parsed.content,
                country: meta.country,
                server: meta.server,
                service: parsed.platform || 'Verification',
                receivedAt: parsed.receivedAt || new Date().toISOString(),
                createdAt: parsed.receivedAt || new Date().toISOString(),
                matched: false  // will be updated to true via otp_success if matched
              }
            });
          } catch (_) {}
        }

        // Step 2: Try to match with a pending user number
        processPromises.push(
          processIncomingSMS(
            {
              id: parsed.id,
              phoneNumber: parsed.phoneNumber,
              content: parsed.content,
              otp: parsed.otp,
              receivedAt: parsed.receivedAt,
              platform: parsed.platform
            },
            wss
          ).then(result => {
            // If SMS matched a user number, start 3-call retry tracker
            if (result && result.otp) {
              startRetryTracker(parsed.phoneNumber, parsed, wss);
            }
          }).catch(err => console.warn('Provider SMS process error:', err.message))
        );
      }
    }

    // Process all new SMS in parallel too
    if (processPromises.length > 0) {
      await Promise.allSettled(processPromises);
    }

    // Per-number poll for manual pending numbers using SMS-only providers
    // ALL manual catalog numbers → poll via SMS-only webhook provider (no country filter)
    if (allProviders.length > 0) {
      try {
        const { collections } = require('../config/firebase');
        const now = new Date();
        const snap = await collections.phoneNumbers
          .where('status', '==', 'pending')
          .get().catch(() => null);

        if (snap) {
          const manualPending = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(n => !n.providerId && new Date(n.expiresAt) > now);

          if (manualPending.length > 0) {
            // Use ALL SMS-only providers — no country code filter
            await Promise.allSettled(allProviders.map(async (provider) => {
              if (!provider.baseUrl || !provider.apiKey) return;
              const baseUrl = provider.baseUrl.replace(/\/$/, '');
              const urlSep = baseUrl.includes('?') ? '&' : '?';
              const headers = {
                'x-api-key': provider.apiKey,
                'Authorization': `Bearer ${provider.apiKey}`,
                'Accept': 'application/json'
              };

              await Promise.allSettled(manualPending.map(async (numData) => {
                const phone = String(numData.phoneNumber).replace(/\D/g, '');
                const since = numData.lastPollAt || numData.allocatedAt || numData.createdAt;

                try {
                  const otpUrl = `${baseUrl}/otp${urlSep}number=${encodeURIComponent(phone)}&since=${encodeURIComponent(since)}&limit=10`;
                  const res = await fetchWithTimeout(otpUrl, { method: 'GET', headers }, 8000);
                  if (!res.ok) return;

                  const body = await res.json().catch(() => null);
                  if (!body) return;
                  const messages = body.data || body.messages || body.sms || [];

                  for (const msg of messages) {
                    const content = msg.message || msg.content || msg.text || '';
                    const msgPhone = String(msg.number || msg.phone || phone).replace(/\D/g, '');
                    if (!content) continue;

                    const msgId = msg.id || `${msgPhone}:${content}`;
                    if (seen.has(String(msgId))) continue;
                    remember(String(msgId), msg.created_at || msg.receivedAt || new Date().toISOString());

                    const plat = detectPlatform(content);
                    console.log(`\n📨 [${provider.serviceName}] Manual SMS: +${msgPhone} | ${plat.icon} ${content}`);

                    if (wss) {
                      try {
                        const { getCountryFromPhone } = require('../routes/smsRoutes');
                        const meta = getCountryFromPhone(msgPhone);
                        wss.broadcast({
                          type: 'new_sms',
                          message: {
                            id: msgId, phoneNumber: msgPhone, content, message: content,
                            country: meta.country, server: meta.server, service: plat.name,
                            receivedAt: msg.created_at || msg.receivedAt || new Date().toISOString(),
                            createdAt: msg.created_at || msg.receivedAt || new Date().toISOString(),
                            matched: false
                          }
                        });
                      } catch (_) {}
                    }

                    await processIncomingSMS({
                      id: msgId, phoneNumber: msgPhone, content,
                      receivedAt: msg.created_at || msg.receivedAt || new Date().toISOString()
                    }, wss).catch(() => {});
                  }

                  await collections.phoneNumbers.doc(numData.id)
                    .update({ lastPollAt: new Date().toISOString() }).catch(() => {});

                } catch (_) {}
              }));
            }));
          }
        }
      } catch (_) {}
    }

    const duration = Date.now() - startTime;
    if (duration > 30000) {
      console.warn(`⚠️  Poll cycle took ${duration}ms (>${30000}ms threshold)`);
    }
  } catch (err) {
    pollStats.failedPolls++;
    console.error('Critical error in pollOnce:', err.message);
  }
}

async function pollIntegratedAPI(wss) {
  try {
    // Skip polling when we've detected Firestore quota exhaustion — respect backoff window
    if (Date.now() < firestoreBackoff.pausedUntil) {
      if (process.env.DEBUG_POLLING === 'true') {
        const msLeft = firestoreBackoff.pausedUntil - Date.now();
        console.warn(`🔵 [Firestore Backoff] Skipping integrated polling for ${Math.round(msLeft/1000)}s due to previous quota errors`);
      }
      return;
    }

    const providers = providerStore.list().filter(p => p.providerType === 'integrated');
    if (providers.length === 0) return;

    let snapshot;
    try {
      snapshot = await collections.phoneNumbers
        .where('status', '==', 'pending')
        .get();
      // On success, reset backoff
      firestoreBackoff.attempts = 0;
      firestoreBackoff.pausedUntil = 0;
    } catch (dbErr) {
      // Detect Firestore quota errors and apply exponential backoff
      const isQuota = dbErr && (dbErr.code === 8 || dbErr.code === 'RESOURCE_EXHAUSTED' || (dbErr.message && dbErr.message.includes('Quota exceeded')));
      if (isQuota) {
        firestoreBackoff.attempts = Math.min((firestoreBackoff.attempts || 0) + 1, 10);
        const backoffMs = Math.min(FIRESTORE_BACKOFF_BASE_MS * Math.pow(2, firestoreBackoff.attempts - 1), FIRESTORE_BACKOFF_MAX_MS);
        firestoreBackoff.pausedUntil = Date.now() + backoffMs;
        pollStats.failedPolls++;
        console.error(`Firestore quota exceeded — pausing integrated polling for ${Math.round(backoffMs/1000)}s (attempt ${firestoreBackoff.attempts}). Consider enabling billing or reducing reads.`);
      } else {
        console.warn('Database error in pollIntegratedAPI:', dbErr.message);
      }
      return;
    }

    const now = new Date();
    const pendingNumbers = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(num => new Date(num.expiresAt) > now);

    if (pendingNumbers.length === 0) return;

    // All pending numbers with a providerId — both integrated-allocated and manual-linked
    const numbersToCheck = pendingNumbers.filter(n => n.providerId);
    const unlinkedManual = pendingNumbers.filter(n => !n.providerId);

    if (process.env.DEBUG_POLLING === 'true' && (numbersToCheck.length || unlinkedManual.length)) {
      console.log(`🔍 [Poll] ${numbersToCheck.length} linked + ${unlinkedManual.length} unlinked pending number(s)`);
    }

    if (numbersToCheck.length === 0) return;

    // Refresh best CLI range if needed (every 2 hours)
    await maybeRefreshRanges();

    // Poll all numbers linked to a provider (both API-allocated and manual-linked)
    await Promise.allSettled(providers.map(async (provider) => {
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const headers = { 'x-api-key': provider.apiKey, 'Accept': 'application/json' };

      // Process numbers assigned to this provider
      const providerNumbers = numbersToCheck.filter(n => n.providerId === provider.id);
      if (providerNumbers.length === 0) return;

      await Promise.allSettled(providerNumbers.map(async (numData) => {
        const phone = String(numData.phoneNumber).replace(/\D/g, '');
        const since = numData.lastPollAt || numData.allocatedAt || numData.createdAt;

        try {
          const otpUrl = `${baseUrl}/otp?number=${encodeURIComponent(phone)}&since=${encodeURIComponent(since)}&limit=10`;

          if (process.env.DEBUG_POLLING === 'true') {
            console.log(`[Integrated Poll] → ${provider.serviceName}: ${phone} since ${since}`);
          }

          const res = await fetchWithTimeout(otpUrl, { headers }, 10000);
          if (!res.ok) {
            if (process.env.DEBUG_POLLING === 'true') {
              console.warn(`[Integrated Poll] HTTP ${res.status} for ${phone}`);
            }
            return;
          }

          const body = await res.json();
          const messages = body.data || [];

          for (const msg of messages) {
            const content = msg.message || msg.content || msg.text || '';
            const msgPhone = String(msg.number || msg.phone || phone).replace(/\D/g, '');
            if (!content) continue;

            const msgId = msg.id || `${msgPhone}:${content}`;
            if (seen.has(String(msgId))) continue;
            remember(String(msgId), msg.created_at || msg.receivedAt || new Date().toISOString());

            // Always log received SMS — number + platform + content
            const recvTime = msg.created_at || msg.receivedAt
              ? new Date(msg.created_at || msg.receivedAt).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'})
              : '—';
            const plat = detectPlatform(content);
            console.log(`\n📨 [${provider.serviceName}] New SMS received`);
            console.log(`   📱 +${msgPhone} | ${recvTime}`);
            console.log(`   ${plat.icon} ${plat.name} | ${content}`);

            // Broadcast to SMS feed
            if (wss) {
              try {
                const { getCountryFromPhone } = require('../routes/smsRoutes');
                const meta = getCountryFromPhone(msgPhone);
                wss.broadcast({
                  type: 'new_sms',
                  message: {
                    id: msgId,
                    phoneNumber: msgPhone,
                    content,
                    message: content,
                    country: meta.country,
                    server: meta.server,
                    service: 'Verification',
                    receivedAt: msg.created_at || msg.receivedAt || new Date().toISOString(),
                    createdAt: msg.created_at || msg.receivedAt || new Date().toISOString(),
                    matched: false
                  }
                });
              } catch (_) {}
            }

            await processIncomingSMS({
              id: msgId,
              phoneNumber: msgPhone,
              content,
              receivedAt: msg.created_at || msg.receivedAt || new Date().toISOString()
            }, wss).catch(err => console.warn(`[Integrated Poll] processIncomingSMS error for ${msgPhone}:`, err.message));
          }

          // Update lastPollAt
          await collections.phoneNumbers.doc(numData.id).update({
            lastPollAt: new Date().toISOString()
          }).catch(() => {});

        } catch (err) {
          console.warn(`[Integrated Poll] Error for ${phone}:`, err.message);
        }
      }));
    }));

  } catch (err) {
    console.error('pollIntegratedAPI error:', err.message);
    // Don't throw - let polling continue
  }
}

function startProviderPoller(wss, intervalMs) {
  const providers = providerStore.list().filter(p => p.providerType !== 'integrated');
  const integrated = providerStore.list().filter(p => p.providerType === 'integrated');

  // Configure intervals via env vars for flexibility under quota pressure
  const defaultWebhookMs = Number(process.env.POLL_INTERVAL_MS) || 15000; // 15s
  const defaultIntegratedMs = Number(process.env.INTEGRATED_POLL_INTERVAL_MS) || 5000; // 5s
  intervalMs = Number(intervalMs) || defaultWebhookMs;

  console.log(`\n⏱️  Provider Polling Started`);
  console.log(`   Webhook/SMS providers : ${providers.length}`);
  console.log(`   Integrated providers  : ${integrated.length}`);
  console.log(`   Poll interval         : ${intervalMs}ms (webhook) / ${defaultIntegratedMs}ms (integrated)`);
  if (providers.length > 0) {
    // Deduplicate URLs for display
    const printedUrls = new Set();
    providers.forEach(p => {
      const urls = [p.baseUrl, ...(p.additionalUrls || [])].filter(Boolean);
      urls.forEach(u => {
        if (!printedUrls.has(u)) { printedUrls.add(u); console.log(`   📡 "${p.serviceName}" → ${u}`); }
      });
    });
  }
  console.log(`   💡 Set DEBUG_POLLING=true in .env to see every poll request/response\n`);
  
  // Webhook SMS poller - with error protection
  // Poll every 3 seconds (was 8) for faster SMS delivery
  const webhookPollInterval = setInterval(() => {
    try {
      pollOnce(wss).catch((err) => {
        console.error('Uncaught error in pollOnce:', err.message);
      });
    } catch (err) {
      console.error('Error in webhook poll interval:', err.message);
    }
  }, intervalMs);

  // Integrated number API status poller - with error protection
  // Poll every 5 seconds (was 10) for faster status checks
  const integratedPollInterval = setInterval(() => {
    try {
      pollIntegratedAPI(wss).catch((err) => {
        console.error('Uncaught error in pollIntegratedAPI:', err.message);
      });
    } catch (err) {
      console.error('Error in integrated poll interval:', err.message);
    }
  }, defaultIntegratedMs);

  // Clean up function for graceful shutdown
  return {
    stop: () => {
      clearInterval(webhookPollInterval);
      clearInterval(integratedPollInterval);
      console.log('✅ Provider polling stopped');
    }
  };
}

function getProviderStatuses() {
  return { ...connectionStatuses };
}

module.exports = { pollOnce, pollIntegratedAPI, startProviderPoller, getProviderStatuses, getActiveRangeName, pollStats };
