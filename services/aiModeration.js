/**
 * AI moderation — OpenAI-compatible API + heuristic fallback
 * Scam: 4-day suspend; 3 strikes = ban
 */

const { collections } = require('../config/firebase');
const https = require('https');
const http = require('http');

function postJson(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(data) }
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: buf
          });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const SCAM_PATTERNS = [
  /send\s+(money|usdt|btc|crypto)/i,
  /free\s+(money|bitcoin|usdt)/i,
  /seed\s*phrase/i,
  /wallet\s*recovery/i,
  /click\s+here\s+to\s+claim/i,
  /double\s+your\s+(money|investment)/i,
  /telegram\s*@\w+/i,
  /whatsapp\s*\+\d/i
];

const DEFAULT_AI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

function heuristicScam(text) {
  const t = String(text || '');
  if (!t.trim()) return { isScam: false };
  for (const re of SCAM_PATTERNS) {
    if (re.test(t)) return { isScam: true, reason: 'Matched suspicious pattern' };
  }
  return { isScam: false };
}

async function callAiApi(settings, text) {
  const apiKey = settings.aiApiKey;
  if (!apiKey) return null;
  const url = settings.aiApiUrl || process.env.AI_API_URL || DEFAULT_AI_URL;
  const model = settings.aiModel || process.env.AI_MODEL || DEFAULT_MODEL;

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a safety moderator for a social feed. Reply ONLY with JSON: {"isScam":boolean,"reason":string}. Flag scams: phishing links, crypto fraud, impersonation, harassment, illegal offers. Normal chat is not scam.'
      },
      { role: 'user', content: `Analyze this post/message:\n\n${text.slice(0, 4000)}` }
    ],
    temperature: 0.1,
    max_tokens: 120
  };

  const res = await postJson(url, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }, body);

  if (!res.ok) {
    throw new Error(`AI API ${res.status}: ${(res.body || '').slice(0, 200)}`);
  }

  const data = JSON.parse(res.body);
  const content = data.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return heuristicScam(text);
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return { isScam: !!parsed.isScam, reason: parsed.reason || 'AI flagged content' };
  } catch {
    return heuristicScam(text);
  }
}

async function applyScamPenalty(userId, reason) {
  const ref = collections.users.doc(userId);
  const doc = await ref.get();
  if (!doc.exists) return { banned: false };
  const u = doc.data();
  const strikes = (u.scamStrikeCount || 0) + 1;
  const now = new Date().toISOString();

  if (strikes >= 3) {
    await ref.update({
      scamStrikeCount: strikes,
      isBanned: true,
      bannedAt: now,
      banReason: reason || 'Repeated scam violations',
      updatedAt: now
    });
    return { banned: true, strikes };
  }

  const until = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
  await ref.update({
    scamStrikeCount: strikes,
    suspendedUntil: until,
    lastModerationReason: reason || 'Scam content detected',
    updatedAt: now
  });
  return { banned: false, suspendedUntil: until, strikes };
}

/**
 * @param {{ text: string, userId: string, settings: object }} opts
 */
async function moderateContent({ text, userId, settings }) {
  if (!settings?.aiEnabled) return { allowed: true };

  let result = heuristicScam(text);
  if (settings.aiApiKey && text?.trim()) {
    try {
      const ai = await callAiApi(settings, text);
      if (ai) result = ai;
    } catch (e) {
      console.warn('[AI moderation]', e.message);
    }
  }

  if (!result.isScam) return { allowed: true };

  const penalty = await applyScamPenalty(userId, result.reason);
  if (penalty.banned) {
    return {
      allowed: false,
      error: 'Account banned after repeated violations.',
      code: 'BANNED'
    };
  }
  return {
    allowed: false,
    error: 'Content blocked. Account suspended for 4 days.',
    code: 'SUSPENDED',
    suspendedUntil: penalty.suspendedUntil
  };
}

module.exports = { moderateContent, heuristicScam, applyScamPenalty };
