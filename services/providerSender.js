

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Trigger provider send with retries and optional broadcast
 * options: { prov, params: { key: value }, numberId, phoneNumber, wss }
 */
async function triggerProviderSend(options = {}) {
  const { prov, params = {}, numberId = null, phoneNumber = null, wss = null } = options;
  if (!prov || !prov.baseUrl) return { ok: false, error: 'No provider configured' };

  const paramPairs = [];
  for (const k of Object.keys(params || {})) {
    if (params[k] === undefined || params[k] === null) continue;
    paramPairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`);
  }
  const triggerUrl = paramPairs.length ? `${prov.getSmsUrl || prov.baseUrl}?${paramPairs.join('&')}` : (prov.getSmsUrl || prov.baseUrl);

  const headers = {};
  if ((prov.apiKey || '').startsWith('sk_') || (prov.baseUrl || '').includes('203.161.58.20')) {
    headers['x-api-key'] = prov.apiKey;
  } else if (prov.apiKey) {
    headers['Authorization'] = `Bearer ${prov.apiKey}`;
    headers['X-API-Key'] = prov.apiKey;
    headers['x-api-key'] = prov.apiKey;
  }

  // Broadcast attempt
  try { if (wss && wss.broadcast) wss.broadcast({ type: 'provider_send_attempt', providerId: prov.id, numberId, phoneNumber, url: triggerUrl, createdAt: new Date().toISOString() }); } catch(e){}

  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const resp = await fetch(triggerUrl, { method: 'GET', headers, signal: AbortSignal.timeout(10000) });
      const txt = await resp.text();
      try { if (wss && wss.broadcast) wss.broadcast({ type: 'provider_send_result', providerId: prov.id, numberId, phoneNumber, status: resp.status, body: txt }); } catch(e){}
      return { ok: true, status: resp.status, body: txt };
    } catch (err) {
      lastErr = err;
      try { if (wss && wss.broadcast) wss.broadcast({ type: 'provider_send_result', providerId: prov.id, numberId, phoneNumber, status: 'error', error: err.message }); } catch(e){}
      // backoff
      const backoff = 200 * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }

  return { ok: false, error: lastErr ? lastErr.message : 'Unknown error' };
}

module.exports = { triggerProviderSend };
