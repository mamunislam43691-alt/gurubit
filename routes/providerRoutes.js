/**
 * Provider webhooks — real SMS from external API
 */

const express = require('express');
const router = express.Router();
const providerStore = require('../services/providerStore');
const { processIncomingSMS } = require('../utils/smsProcessor');
const { getAdminPassword } = require('../utils/adminSession');

function authProvider(req) {
  const key =
    req.headers['x-api-key'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    req.body?.apiKey ||
    req.query?.apiKey;
  // Use sync cache lookup (providerStore.load() called on startup)
  const provider = providerStore.findByApiKey(key);
  if (!provider) return null;
  req.provider = provider;
  return provider;
}

router.post('/incoming-sms', async (req, res) => {
  if (!authProvider(req)) {
    return res.status(401).json({ success: false, error: { message: 'Invalid API key' } });
  }

  const phoneNumber = req.body.phoneNumber || req.body.number || req.body.phone;
  const content = req.body.message || req.body.content || req.body.text || req.body.sms;
  if (!phoneNumber || !content) {
    return res.status(400).json({ success: false, error: { message: 'phoneNumber and message required' } });
  }

  try {
    const wss = req.app.get('wss');
    const result = await processIncomingSMS({ phoneNumber, content }, wss);
    if (!result) {
      return res.json({ success: true, matched: false, message: 'No active session for this number' });
    }
    res.json({ success: true, matched: true, otp: result.otp, messageId: result.messageId });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

router.get('/health', (req, res) => {
  const p = providerStore.getPrimary();
  res.json({
    success: true,
    configured: !!(p?.baseUrl && p?.apiKey),
    webhook: '/api/provider/incoming-sms'
  });
});

/**
 * GET /api/provider/test-poll?adminPassword=xxx
 * Manually trigger one poll cycle and return raw results — for debugging
 */
router.get('/test-poll', async (req, res) => {
  const adminPw = getAdminPassword();
  if (!adminPw || req.query.adminPassword !== adminPw) {
    return res.status(401).json({ success: false, error: 'Admin password required (?adminPassword=...)' });
  }

  const providers = providerStore.list().filter(p => p.providerType !== 'integrated');
  if (providers.length === 0) {
    return res.json({ success: true, message: 'No webhook/SMS providers configured', providers: [] });
  }

  const results = [];

  for (const provider of providers) {
    const urls = [provider.baseUrl, ...(provider.additionalUrls || [])].filter(Boolean);
    for (const rawUrl of urls) {
      // Use URL exactly as configured — do NOT append /otp
      const url = rawUrl.replace(/\/$/, '');
      const urlSeparator = url.includes('?') ? '&' : '?';
      const finalUrl = `${url}${urlSeparator}limit=100`;

      const headers = { Accept: 'application/json' };
      if (url.includes('203.161.58.20') || provider.apiKey.startsWith('sk_')) {
        headers['x-api-key'] = provider.apiKey;
      } else {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
        headers['X-API-Key'] = provider.apiKey;
        headers['x-api-key'] = provider.apiKey;
      }

      const pollResult = { provider: provider.serviceName, url: finalUrl, status: null, httpStatus: null, rawBody: null, messages: [], error: null };

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);
        const r = await fetch(finalUrl, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(tid);

        pollResult.httpStatus = r.status;
        pollResult.status = r.ok ? 'ok' : 'http_error';

        const text = await r.text();
        pollResult.rawBody = text.slice(0, 2000); // limit for display

        if (r.ok) {
          try {
            const body = JSON.parse(text);
            const msgs = Array.isArray(body) ? body :
                         Array.isArray(body.messages) ? body.messages :
                         Array.isArray(body.data) ? body.data :
                         Array.isArray(body.sms) ? body.sms :
                         (body.message || body.phoneNumber) ? [body] : [];
            pollResult.messages = msgs.slice(0, 20); // show up to 20
            pollResult.totalMessages = msgs.length;
          } catch (_) {
            pollResult.parseError = 'Response is not valid JSON';
          }
        }
      } catch (e) {
        pollResult.status = 'error';
        pollResult.error = e.message;
      }

      results.push(pollResult);
    }
  }

  res.json({ success: true, timestamp: new Date().toISOString(), results });
});

module.exports = router;
