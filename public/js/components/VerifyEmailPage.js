/**
 * Email verification page — OTP code entry
 * Shown after signup: user types the 6-digit code from their inbox.
 */

export class VerifyEmailPage {
    constructor() {
        this.status  = 'idle';   // idle | sending | verifying | success | error
        this.message = '';
        this.email   = '';
        this.code    = '';
        this.error   = '';
        this.resendCooldown = 0;
        this._cdInterval = null;
    }

    // ── API helpers ──────────────────────────────────────────────────────

    async sendCode() {
        if (!this.email) { this.error = 'Enter your email first.'; this.render(); return; }
        this.status = 'sending'; this.error = ''; this.render();
        try {
            const r = await fetch('/api/auth/send-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.email })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error?.message || 'Could not send code.');
            this.status = 'idle';
            this.resendCooldown = 60;
            this._startCooldown();
            if (data.preview && data.previewCode) {
                console.info(`[DEV] Verification code for ${this.email}: ${data.previewCode}`);
            }
        } catch (e) {
            this.status = 'error';
            this.error = e.message;
        }
        this.render();
    }

    async verifyCode() {
        if (!this.code || this.code.length !== 6) {
            this.error = 'Enter the 6-digit code.'; this.render(); return;
        }
        this.status = 'verifying'; this.error = ''; this.render();
        try {
            const r = await fetch('/api/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.email, code: this.code })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error?.message || 'Verification failed.');
            this.status  = 'success';
            this.message = 'Your email is verified! You can now log in.';
            if (this._cdInterval) clearInterval(this._cdInterval);
        } catch (e) {
            this.status = 'error';
            this.error  = e.message;
        }
        this.render();
    }

    _startCooldown() {
        if (this._cdInterval) clearInterval(this._cdInterval);
        this._cdInterval = setInterval(() => {
            this.resendCooldown = Math.max(0, this.resendCooldown - 1);
            const btn = document.getElementById('resendCodeBtn');
            if (btn) {
                if (this.resendCooldown > 0) {
                    btn.textContent = `Resend Code (${this.resendCooldown}s)`;
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                } else {
                    btn.textContent = 'Resend Code';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    clearInterval(this._cdInterval);
                }
            }
        }, 1000);
    }

    // ── Init ─────────────────────────────────────────────────────────────

    async init() {
        const params = new URLSearchParams(window.location.search);

        if (params.get('verified') === '1') {
            this.status  = 'success';
            this.message = 'Your email has been verified. You can now log in.';
        } else {
            // Pre-fill email from query string if provided
            this.email  = params.get('email') || '';
            this.status = 'idle';
        }
        this.render();
    }

    // ── Render ───────────────────────────────────────────────────────────

    render() {
        const container = document.getElementById('app');
        if (!container) return;

        if (this.status === 'success') {
            container.innerHTML = `
                <div class="min-h-screen flex items-center justify-center px-4"
                    style="background:radial-gradient(ellipse at top,#0a1e3b 0%,#020b18 70%);">
                    <div class="glass-card max-w-md w-full p-10 text-center border-primary/20">
                        <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                            style="background:rgba(34,197,94,0.1);">
                            <i class="fas fa-check-circle text-4xl" style="color:#22c55e;"></i>
                        </div>
                        <h1 class="text-2xl font-black text-white uppercase tracking-tight mb-3">Email Verified ✅</h1>
                        <p class="text-gray-400 text-sm leading-relaxed mb-8">${this.message}</p>
                        <a href="/login" class="neon-btn inline-block px-10 py-4 text-xs uppercase tracking-widest">Log In Now</a>
                    </div>
                </div>`;
            return;
        }

        const isVerifying = this.status === 'verifying';
        const isSending   = this.status === 'sending';
        const busy        = isVerifying || isSending;

        container.innerHTML = `
            <div class="min-h-screen flex items-center justify-center px-4" data-page="verify"
                style="background:radial-gradient(ellipse at top,#0a1e3b 0%,#020b18 70%);">
                <div class="glass-card max-w-sm w-full p-8 border-primary/20" style="text-align:center;">

                    <!-- Icon -->
                    <div class="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
                        style="background:rgba(0,210,255,0.08);">
                        <i class="fas fa-envelope-open-text text-3xl" style="color:#00d2ff;"></i>
                    </div>

                    <h1 class="text-xl font-black text-white uppercase tracking-tight mb-1">Verify Your Email</h1>
                    <p class="text-gray-400 text-xs mb-5 leading-relaxed">
                        Enter the 6-digit code sent to your inbox.<br>
                        <span style="color:#6b7280;font-size:.68rem;">The code expires in 10 minutes.</span>
                    </p>

                    <!-- Email input -->
                    <div style="margin-bottom:.75rem;text-align:left;">
                        <label style="display:block;font-size:.65rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem;">Email Address</label>
                        <div style="display:flex;gap:.5rem;">
                            <input type="email" id="verifyEmailInput"
                                value="${this.email}"
                                placeholder="your@email.com"
                                style="flex:1;height:42px;padding:0 .85rem;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:.65rem;color:#fff;font-size:.82rem;outline:none;box-sizing:border-box;">
                            <button type="button" id="sendCodeBtn" ${busy ? 'disabled' : ''}
                                style="padding:0 .85rem;height:42px;border-radius:.65rem;background:rgba(0,210,255,0.15);border:1px solid rgba(0,210,255,0.35);color:#00d2ff;font-size:.7rem;font-weight:800;white-space:nowrap;cursor:pointer;${busy?'opacity:.5;':''}">
                                ${isSending ? '<i class="fas fa-circle-notch fa-spin"></i>' : 'Send Code'}
                            </button>
                        </div>
                    </div>

                    <!-- Code input — 6 separate boxes -->
                    <div style="margin-bottom:1rem;">
                        <label style="display:block;font-size:.65rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem;text-align:left;">Verification Code</label>
                        <div style="display:flex;gap:.45rem;justify-content:center;" id="otpBoxes">
                            ${[0,1,2,3,4,5].map(i => `
                                <input type="text" inputmode="numeric" maxlength="1"
                                    data-idx="${i}"
                                    class="otp-box"
                                    style="width:44px;height:54px;text-align:center;font-size:1.4rem;font-weight:900;background:rgba(0,0,0,0.4);border:2px solid ${this.error ? 'rgba(239,68,68,0.5)' : 'rgba(0,210,255,0.25)'};border-radius:.65rem;color:#fff;outline:none;caret-color:#00d2ff;">
                            `).join('')}
                        </div>
                        ${this.error ? `<p style="color:#f87171;font-size:.72rem;margin:.4rem 0 0;text-align:center;">${this.error}</p>` : ''}
                    </div>

                    <!-- Verify button -->
                    <button type="button" id="verifyCodeBtn" ${busy ? 'disabled' : ''}
                        class="neon-btn"
                        style="width:100%;padding:.75rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;display:flex;align-items:center;justify-content:center;gap:.5rem;${busy?'opacity:.6;pointer-events:none;':''}">
                        ${isVerifying
                            ? '<i class="fas fa-circle-notch fa-spin"></i><span>Verifying…</span>'
                            : '<i class="fas fa-shield-alt"></i><span>Verify Code</span>'}
                    </button>

                    <!-- Resend + back -->
                    <div style="margin-top:1rem;display:flex;align-items:center;justify-content:space-between;font-size:.72rem;">
                        <button type="button" id="resendCodeBtn"
                            ${this.resendCooldown > 0 ? 'disabled' : ''}
                            style="color:#00d2ff;font-weight:700;background:none;border:none;cursor:pointer;${this.resendCooldown>0?'opacity:.5;':''}">
                            ${this.resendCooldown > 0 ? `Resend Code (${this.resendCooldown}s)` : 'Resend Code'}
                        </button>
                        <a href="/login" style="color:#6b7280;text-decoration:none;font-weight:600;">← Back to Login</a>
                    </div>
                </div>
            </div>`;

        this._bindEvents();
        if (this.resendCooldown > 0) this._startCooldown();
    }

    _bindEvents() {
        // Email input
        document.getElementById('verifyEmailInput')?.addEventListener('input', e => {
            this.email = e.target.value.trim();
        });

        // Send code button
        document.getElementById('sendCodeBtn')?.addEventListener('click', () => this.sendCode());

        // OTP box auto-advance
        const boxes = document.querySelectorAll('.otp-box');
        boxes.forEach((box, i) => {
            box.addEventListener('input', (e) => {
                const val = e.target.value.replace(/\D/, '');
                e.target.value = val;
                if (val && i < 5) boxes[i + 1].focus();
                this.code = Array.from(boxes).map(b => b.value).join('');
                if (this.code.length === 6) this.verifyCode();
            });
            box.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
            });
            box.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
                boxes.forEach((b, idx) => { b.value = pasted[idx] || ''; });
                this.code = pasted;
                if (this.code.length === 6) this.verifyCode();
            });
        });

        // Verify button
        document.getElementById('verifyCodeBtn')?.addEventListener('click', () => this.verifyCode());

        // Resend button
        document.getElementById('resendCodeBtn')?.addEventListener('click', () => this.sendCode());
    }
}
