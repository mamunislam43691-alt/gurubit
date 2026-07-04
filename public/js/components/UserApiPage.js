/**
 * User API Access Page
 * Allows enabled users to generate & manage API keys for external integrations.
 */

import { UserLayout } from '../utils/UserLayout.js';
import { showToast } from '../utils/uiHelpers.js';

export class UserApiPage {
  constructor() {
    this.user = null;
    this.keys = [];
  }

  async load() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;

    const res = await fetch('/api/user/api-keys').catch(() => null);
    if (!res) return this.renderError('Network error');
    const data = await res.json().catch(() => ({}));

    if (res.status === 403) {
      return this.renderLocked(data.error?.message);
    }
    if (data.success) {
      this.keys = data.keys || [];
    }
    this.render();
  }

  renderLocked(msg) {
    UserLayout.renderShell({
      activeId: 'api',
      title: 'API Access',
      bodyHtml: `
        <div class="flex flex-col items-center justify-center py-24 text-center px-4">
          <div class="w-20 h-20 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-400 text-4xl mb-6">
            <i class="fas fa-lock"></i>
          </div>
          <h2 class="text-xl font-black text-white uppercase mb-3">API Access Locked</h2>
          <p class="text-gray-400 text-sm max-w-sm leading-relaxed mb-6">
            ${msg || 'API access is not enabled for your account. Contact your agent or admin to enable it.'}
          </p>
          <div class="glass-card p-5 max-w-sm w-full text-left border border-yellow-500/20">
            <p class="text-[10px] text-yellow-400 uppercase font-black tracking-widest mb-3">How to get access</p>
            <ul class="space-y-2 text-sm text-gray-400">
              <li class="flex items-start gap-2"><i class="fas fa-check text-primary mt-0.5 text-xs"></i>Ask your agent to enable API access for you</li>
              <li class="flex items-start gap-2"><i class="fas fa-check text-primary mt-0.5 text-xs"></i>Or contact admin via Support chat</li>
            </ul>
          </div>
        </div>`,
      user: this.user
    });
  }

  renderError(msg) {
    UserLayout.renderShell({
      activeId: 'api', title: 'API Access',
      bodyHtml: `<div class="text-center py-20 text-gray-500"><i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-4 block"></i>${msg}</div>`,
      user: this.user
    });
  }

  maskKey(k) {
    if (!k || k.length < 12) return '••••••••';
    return k.slice(0, 10) + '••••••••••••' + k.slice(-4);
  }

  render() {
    const host = window.location.origin;
    const exampleKey = this.keys[0]?.apiKey || 'gurubit_xxxxxxxxxxxxxxxxxxxxxxxx';

    const keyCards = this.keys.length
      ? this.keys.map(k => `
          <div class="glass-card p-5 border border-white/5">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="min-w-0 flex-1">
                <p class="text-white font-bold text-sm">${k.label || 'API Key'}</p>
                <div class="flex items-center gap-2 mt-2">
                  <code class="text-xs font-mono text-primary bg-black/40 px-3 py-1.5 rounded-lg flex-1 overflow-hidden text-ellipsis whitespace-nowrap" id="key-${k.id}">${k.apiKey}</code>
                  <button type="button" data-copy="${k.apiKey}" class="copy-key-btn px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-gray-400 hover:text-white text-xs transition-all shrink-0">
                    <i class="far fa-copy"></i>
                  </button>
                </div>
                <p class="text-[10px] text-gray-600 mt-1">Created: ${new Date(k.createdAt).toLocaleDateString()}</p>
              </div>
              <button type="button" data-revoke="${k.id}" class="revoke-key-btn text-red-400 text-xs font-black uppercase hover:text-red-300 shrink-0">Revoke</button>
            </div>
          </div>`)
        .join('')
      : `<div class="text-center py-10 text-gray-500">
           <i class="fas fa-key text-3xl mb-3 block opacity-30"></i>
           <p class="text-sm">No API keys yet. Generate one below.</p>
         </div>`;

    UserLayout.renderShell({
      activeId: 'api',
      title: 'API Access',
      bodyHtml: `
        <!-- Header -->
        <div class="glass-card p-5 mb-5 border border-primary/10">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center text-primary text-xl shrink-0">
              <i class="fas fa-key"></i>
            </div>
            <div>
              <p class="font-black text-white text-base">API Integration</p>
              <p class="text-xs text-gray-400 mt-0.5">Generate keys to connect your website, bot, or app to GURUBIT's SMS/OTP services.</p>
            </div>
          </div>
        </div>

        <!-- Generate button -->
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm font-black text-white uppercase tracking-wider">Your API Keys</p>
          <button type="button" id="generateKeyBtn" class="neon-btn px-5 py-2.5 text-xs uppercase flex items-center gap-2">
            <i class="fas fa-plus-circle"></i> Generate Key
          </button>
        </div>

        <!-- Keys -->
        <div class="space-y-3 mb-8" id="apiKeysList">${keyCards}</div>

        <!-- Docs -->
        <div class="glass-card p-6 border border-white/5">
          <h3 class="text-sm font-black text-white uppercase tracking-wider mb-5">
            <i class="fas fa-book mr-2 text-primary"></i>Quick Start Guide
          </h3>
          <div class="space-y-5 text-sm text-gray-300">

            <div>
              <p class="text-xs font-black text-primary uppercase tracking-wider mb-2">Authentication</p>
              <p class="text-xs text-gray-400 mb-2">Add your API key as a query parameter:</p>
              <div class="relative group">
                <code class="block bg-black/50 px-4 py-3 rounded-lg text-xs font-mono text-green-400 border border-white/5 pr-16">?apiKey=YOUR_API_KEY</code>
                <button type="button" class="copy-doc-btn absolute top-2 right-2 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-black/40 border border-white/10 rounded" data-copy="?apiKey=YOUR_API_KEY">Copy</button>
              </div>
            </div>

            <hr class="border-white/5">

            <div class="space-y-4">
              <p class="text-xs font-black text-primary uppercase tracking-wider">Endpoints</p>

              <div class="border-l-2 border-primary/40 pl-4 space-y-2">
                <p class="text-xs font-bold text-white"><span class="text-cyan-400 font-black">GET</span> /api/open/countries</p>
                <p class="text-[11px] text-gray-400">List all available countries</p>
                <div class="relative group">
                  <code class="block bg-black/50 px-3 py-2 rounded text-[11px] font-mono text-gray-400 border border-white/5 pr-14 overflow-x-auto">${host}/api/open/countries?apiKey=${exampleKey}</code>
                  <button type="button" class="copy-doc-btn absolute top-1.5 right-2 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-black/40 border border-white/10 rounded" data-copy="${host}/api/open/countries?apiKey=${exampleKey}">Copy</button>
                </div>
              </div>

              <div class="border-l-2 border-primary/40 pl-4 space-y-2">
                <p class="text-xs font-bold text-white"><span class="text-cyan-400 font-black">GET</span> /api/open/generate</p>
                <p class="text-[11px] text-gray-400">Get a temporary phone number</p>
                <div class="relative group">
                  <code class="block bg-black/50 px-3 py-2 rounded text-[11px] font-mono text-gray-400 border border-white/5 pr-14 overflow-x-auto">${host}/api/open/generate?apiKey=${exampleKey}</code>
                  <button type="button" class="copy-doc-btn absolute top-1.5 right-2 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-black/40 border border-white/10 rounded" data-copy="${host}/api/open/generate?apiKey=${exampleKey}">Copy</button>
                </div>
              </div>

              <div class="border-l-2 border-primary/40 pl-4 space-y-2">
                <p class="text-xs font-bold text-white"><span class="text-cyan-400 font-black">GET</span> /api/open/sms</p>
                <p class="text-[11px] text-gray-400">Check for incoming OTP on your number</p>
                <div class="relative group">
                  <code class="block bg-black/50 px-3 py-2 rounded text-[11px] font-mono text-gray-400 border border-white/5 pr-14 overflow-x-auto">${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID</code>
                  <button type="button" class="copy-doc-btn absolute top-1.5 right-2 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-black/40 border border-white/10 rounded" data-copy="${host}/api/open/sms?apiKey=${exampleKey}&numberId=YOUR_NUMBER_ID">Copy</button>
                </div>
              </div>
            </div>

            <hr class="border-white/5">

            <div>
              <p class="text-xs font-black text-primary uppercase tracking-wider mb-3">Example (JavaScript)</p>
              <div class="relative group">
                <pre class="bg-black/60 px-4 py-4 rounded-lg text-[11px] font-mono text-cyan-300 border border-white/5 overflow-x-auto">// 1. Get a number
const gen = await fetch('${host}/api/open/generate?apiKey=${exampleKey}');
const { number } = await gen.json();

// 2. Poll for OTP every 5 seconds
const poll = setInterval(async () => {
  const sms = await fetch(\`${host}/api/open/sms?apiKey=${exampleKey}&numberId=\${number.id}\`);
  const data = await sms.json();
  if (data.otpReceived) {
    clearInterval(poll);
    console.log('OTP:', data.otp);
  }
}, 5000);</pre>
                <button type="button" class="copy-doc-btn absolute top-2 right-2 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-black/40 border border-white/10 rounded" data-copy="// 1. Get a number&#10;const gen = await fetch('${host}/api/open/generate?apiKey=${exampleKey}');&#10;const { number } = await gen.json();&#10;&#10;// 2. Poll for OTP&#10;const poll = setInterval(async () => {&#10;  const sms = await fetch(\`${host}/api/open/sms?apiKey=${exampleKey}&numberId=\${number.id}\`);&#10;  const data = await sms.json();&#10;  if (data.otpReceived) { clearInterval(poll); console.log('OTP:', data.otp); }&#10;}, 5000);">Copy</button>
              </div>
            </div>
          </div>
        </div>`,
      user: this.user
    });

    // Generate key
    document.getElementById('generateKeyBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('generateKeyBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Generating…';
      try {
        const label = `API Key ${this.keys.length + 1}`;
        const r = await fetch('/api/user/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label })
        });
        const data = await r.json().catch(() => ({}));
        if (data.success) {
          this.keys.unshift(data.key);
          this.render();
          showToast('API key generated ✅');
        } else {
          showToast(data.error?.message || 'Failed to generate key', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-plus-circle"></i> Generate Key';
        }
      } catch (e) {
        showToast('Network error', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus-circle"></i> Generate Key';
      }
    });

    // Copy key
    document.querySelectorAll('.copy-key-btn, .copy-doc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check text-green-400"></i>';
          setTimeout(() => { btn.innerHTML = orig; }, 1500);
        } catch {}
      });
    });

    // Revoke key
    document.querySelectorAll('.revoke-key-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Revoke this API key? This cannot be undone.')) return;
        const id = btn.dataset.revoke;
        const r = await fetch(`/api/user/api-keys/${id}`, { method: 'DELETE' });
        const data = await r.json().catch(() => ({}));
        if (data.success) {
          this.keys = this.keys.filter(k => k.id !== id);
          this.render();
          showToast('Key revoked');
        }
      });
    });
  }

  async init() {
    await this.load();
  }
}
