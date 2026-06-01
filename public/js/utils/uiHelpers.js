/**
 * Shared UI helpers — copy, toast, country flags
 */

export function countryFlag(countryId, countryMap = {}) {
  const c = countryMap[countryId];
  if (c?.iconData) {
    return `<img src="${c.iconData}" alt="" class="country-flag-img" width="22" height="16">`;
  }
  return `<span class="country-flag-emoji" aria-hidden="true">${c?.flag || '🌍'}</span>`;
}

export function appIconMeta(name) {
  const n = String(name || '').toLowerCase();
  const map = [
    { key: 'facebook', icon: 'fab fa-facebook-f', bg: '#1877f2' },
    { key: 'whatsapp', icon: 'fab fa-whatsapp', bg: '#25d366' },
    { key: 'telegram', icon: 'fab fa-telegram', bg: '#0088cc' },
    { key: 'google', icon: 'fab fa-google', bg: '#ea4335' },
    { key: 'instagram', icon: 'fab fa-instagram', bg: '#e4405f' },
    { key: 'tiktok', icon: 'fab fa-tiktok', bg: '#111827' }
  ];
  const hit = map.find((m) => n.includes(m.key));
  return hit || { icon: 'fas fa-comment-sms', bg: '#00c3ff', letter: (name || '?')[0] };
}

export function formatPhoneForCopy(phone, format, countryCode) {
  if (!phone) return '';
  let digits = String(phone).replace(/\s/g, '').replace(/^\+/, '');
  const cc = String(countryCode || '').replace(/\s/g, '').replace(/^\+/, '');
  if (format === 'remove_plus') {
    if (cc && digits.startsWith(cc)) return digits.slice(cc.length);
    return digits;
  }
  if (digits.startsWith('+')) return digits;
  return `+${digits}`;
}

export function showToast(message, type = 'success') {
  let el = document.getElementById('gurubitToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gurubitToast';
    el.className = 'gurubit-toast';
    document.body.appendChild(el);
  }
  el.className = `gurubit-toast gurubit-toast--${type} show`;
  el.textContent = message;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

export async function copyText(text, toastMsg = 'Copied!') {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    showToast(toastMsg);
    return true;
  } catch {
    showToast('Copy failed', 'error');
    return false;
  }
}

export function bindCopyCells(root = document) {
  root.querySelectorAll('[data-copy]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      const val = el.getAttribute('data-copy');
      const msg = el.getAttribute('data-copy-msg') || 'Copied!';
      await copyText(val, msg);
    });
  });
}

export function countdownText(expiresAt) {
  if (!expiresAt) return '30:00';
  // Normalize expiresAt to milliseconds since epoch.
  let expMs = null;
  if (typeof expiresAt === 'number') {
    expMs = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt; // seconds -> ms
  } else if (typeof expiresAt === 'string') {
    if (/^\d+$/.test(expiresAt)) {
      const asNum = Number(expiresAt);
      expMs = asNum < 1e12 ? asNum * 1000 : asNum;
    } else {
      expMs = new Date(expiresAt).getTime();
    }
  } else {
    expMs = new Date(expiresAt).getTime();
  }

  if (!expMs || Number.isNaN(expMs)) return '30:00';
  const left = expMs - Date.now();
  if (left <= 0) return '00:00';
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function numberStatus(n) {
  // FAILED: explicitly failed, or expired without receiving OTP
  if (n.status === 'failed') return 'failed';
  if (n.expiresAt && new Date(n.expiresAt) < new Date() && !n.otpReceived) return 'failed';
  
  // SUCCESSFUL: must have actually received an OTP/SMS
  if ((n.otpReceived || n.status === 'successful') && (n.otp || n.smsMessage)) return 'successful';
  
  // PENDING: waiting
  return 'pending';
}

export function extractOtpFromSms(n) {
  if (n?.otp) return String(n.otp);
  const text = n?.smsMessage || '';
  const m = String(text).match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

export function detectServiceLabel(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('whatsapp')) return 'WhatsApp';
  if (t.includes('telegram')) return 'Telegram';
  if (t.includes('facebook') || t.includes(' fb ')) return 'Facebook';
  if (t.includes('instagram')) return 'Instagram';
  if (t.includes('google') || t.includes('gmail')) return 'Google';
  if (t.includes('tiktok') || t.includes('tik tok')) return 'TikTok';
  if (t.includes('twitter') || t.includes('x.com')) return 'Twitter/X';
  if (t.includes('snapchat')) return 'Snapchat';
  if (t.includes('viber')) return 'Viber';
  if (t.includes('wechat') || t.includes('we chat')) return 'WeChat';
  if (t.includes('imo')) return 'IMO';
  if (t.includes('signal')) return 'Signal';
  if (t.includes('discord')) return 'Discord';
  if (t.includes('linkedin')) return 'LinkedIn';
  if (t.includes('amazon') || t.includes('aws')) return 'Amazon';
  if (t.includes('paypal')) return 'PayPal';
  if (t.includes('binance')) return 'Binance';
  if (t.includes('coinbase')) return 'Coinbase';
  if (t.includes('uber')) return 'Uber';
  if (t.includes('netflix')) return 'Netflix';
  if (t.includes('apple') || t.includes('icloud')) return 'Apple';
  if (t.includes('microsoft') || t.includes('outlook')) return 'Microsoft';
  if (t.includes('rednote') || t.includes('red note') || t.includes('xiaohongshu')) return 'RedNote';
  if (t.includes('reddit')) return 'Reddit';
  if (t.includes('youtube')) return 'YouTube';
  if (t.includes('line ') || t.startsWith('line')) return 'Line';
  // Extract first word as platform name if it looks like an app name (capitalized, no spaces)
  const firstWord = String(text || '').match(/^([A-Z][a-zA-Z0-9]{2,})\s/);
  if (firstWord) return firstWord[1];
  return 'Verification';
}
