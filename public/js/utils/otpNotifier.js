/**
 * OTP Notifier — Browser Push Notification + Sound when OTP arrives
 * Works on mobile and desktop, even when app is in background
 */

// Notification sound — short beep using Web Audio API (no external file needed)
function playOtpSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Two-tone beep: high → higher (alert feel)
    const tones = [880, 1100, 880];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.35, now + i * 0.12 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.12 + 0.1);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.12);
    });
  } catch (_) { /* Web Audio not supported — silent fail */ }
}

// Request notification permission
async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Show browser notification
function showBrowserNotification({ title, body, icon = '/assets/logo-icon.svg', tag = 'otp-alert' }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    // Use service worker notification if available (works in background on mobile)
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          icon,
          badge: '/assets/logo-icon.svg',
          tag,
          renotify: true,
          vibrate: [200, 100, 200, 100, 300],
          requireInteraction: false,
          silent: false,
          data: { url: '/numbers' }
        });
      }).catch(() => {
        // Fallback to simple notification
        new Notification(title, { body, icon, tag });
      });
    } else {
      new Notification(title, { body, icon, tag });
    }
  } catch (_) {}
}

// In-app toast notification (shows inside the app UI)
function showInAppToast({ number, otp, platform }) {
  // Remove existing OTP toast
  document.getElementById('otpToastBanner')?.remove();

  const toast = document.createElement('div');
  toast.id = 'otpToastBanner';
  toast.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%) translateY(-16px);
    z-index: 99999;
    background: linear-gradient(135deg, #00d2ff, #3a7bd5);
    color: #020b18;
    border-radius: 1rem;
    padding: 0.85rem 1.4rem;
    box-shadow: 0 8px 32px rgba(0,210,255,0.45), 0 2px 8px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 260px;
    max-width: calc(100vw - 2rem);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    cursor: pointer;
    pointer-events: auto;
  `;

  toast.innerHTML = `
    <span style="font-size:1.4rem;flex-shrink:0;">🔔</span>
    <div style="flex:1;min-width:0;">
      <p style="font-weight:900;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px;">OTP Received!</p>
      <p style="font-size:0.75rem;font-weight:700;margin:0;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${platform ? platform + ' — ' : ''}${number || ''}
      </p>
    </div>
    <span style="font-size:1rem;flex-shrink:0;opacity:0.6;">→</span>
  `;

  // Click → go to numbers page
  toast.addEventListener('click', () => {
    toast.remove();
    if (window.location.pathname !== '/numbers') {
      window.history.pushState({}, '', '/numbers');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
  });

  // Auto dismiss after 6s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-16px)';
    setTimeout(() => toast.remove(), 350);
  }, 6000);
}

/**
 * Main OTP notification trigger — call this when OTP arrives
 */
export async function notifyOtp({ phoneNumber, otp, platform, numberId }) {
  // 1. Play sound
  playOtpSound();

  // 2. In-app toast (always)
  showInAppToast({
    number: phoneNumber ? maskPhone(phoneNumber) : '',
    otp,
    platform: platform || 'Verification'
  });

  // 3. Browser notification (if permission granted)
  const hasPermission = await requestPermission();
  if (hasPermission) {
    showBrowserNotification({
      title: '🔔 OTP Received — GURUBIT',
      body: `${platform || 'Verification'}: Your OTP has arrived${phoneNumber ? ' for ' + maskPhone(phoneNumber) : ''}`,
      tag: `otp-${numberId || Date.now()}`
    });
  }
}

// Mask phone for display in notification
function maskPhone(num) {
  if (!num) return '';
  const digits = String(num).replace(/[^\d]/g, '');
  if (digits.length < 6) return num;
  return (num.startsWith('+') ? '+' : '') + digits.slice(0, 4) + '★★★★' + digits.slice(-2);
}

/**
 * Request notification permission proactively
 * Call once after user logs in
 */
export async function requestOtpNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    // Small delay — don't ask immediately on page load
    setTimeout(async () => {
      await requestPermission();
    }, 3000);
  }
}
