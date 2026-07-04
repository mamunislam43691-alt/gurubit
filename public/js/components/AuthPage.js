/**
 * AuthPage — modal login/signup with visible homepage behind
 */

import {
    loginWithEmail,
    signupWithEmail,
    sendPasswordReset,
    startGuestSession,
    fetchSession
} from '../auth-config.js';

const AUTH_ERRORS = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password must be at least 8 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/network-request-failed': 'Network error. Check your connection.'
};

export class AuthPage {
    constructor() {
        const path = window.location.pathname;
        this.isForgotMode = path === '/forgot-password';
        this.isLoginMode = path === '/login' || (!this.isForgotMode && path !== '/signup');
        this.formData = {
            name: '', identificationNumber: '', email: '',
            telegramNumber: '', cryptoAddress: '', referralEmail: '',
            password: '', agreeTerms: false
        };
        this.errors = {};
        this.isLoading = false;
        this.allowGuestLogin = true;
        // OTP verification state
        this.otpMode = false;       // showing OTP input after signup
        this.otpEmail = '';
        this.otpCode = '';
        this.otpError = '';
        // Password reset OTP state
        this.resetOtpMode = false;  // showing code input after requesting reset
        this.resetEmail = '';
    }

    mapAuthError(error) {
        return AUTH_ERRORS[error?.code] || error?.message || 'Something went wrong. Please try again.';
    }

    validateForm() {
        this.errors = {};
        if (this.isLoginMode) {
            if (!this.formData.email) this.errors.email = 'Required';
            if (!this.formData.password) this.errors.password = 'Required';
        } else {
            if (!this.formData.name) this.errors.name = 'Required';
            if (!this.formData.identificationNumber) this.errors.identificationNumber = 'Required';
            if (!this.formData.email) this.errors.email = 'Required';
            if (!this.formData.telegramNumber) this.errors.telegramNumber = 'Required';
            if (!this.formData.referralEmail) this.errors.referralEmail = 'Required';
            if (!this.formData.password || this.formData.password.length < 8)
                this.errors.password = 'Min 8 characters required';
            if (!this.formData.agreeTerms)
                this.errors.agreeTerms = 'You must agree to continue';
        }
        return Object.keys(this.errors).length === 0;
    }

    async sendVerificationEmail(email, name) {
        const res = await fetch('/api/auth/send-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name })
        });
        let data = {};
        try { data = await res.json(); } catch (_) {}
        if (res.ok) return { ok: true, preview: data.preview, previewCode: data.previewCode };
        throw new Error(data.error?.message || 'Could not send verification code. Configure SMTP in admin settings.');
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        if (!this.formData.email) {
            this.errors.email = 'Enter your email';
            this.renderModal();
            return;
        }

        this.isLoading = true;
        this.renderModal();

        try {
            const r = await sendPasswordReset(this.formData.email);
            if (!r.ok) {
                throw new Error(r.data?.error?.message || 'Could not send reset code. Configure SMTP in admin settings.');
            }
            // Switch to reset OTP input mode
            this.resetEmail = this.formData.email;
            this.resetOtpMode = true;
            this.isForgotMode = false;
            this.errors.submit = null;
        } catch (error) {
            this.errors.submit = this.mapAuthError(error);
        }

        this.isLoading = false;
        this.renderModal();
    }

    async handleVerifyOtp() {
        if (!this.otpCode || this.otpCode.length !== 6) {
            this.otpError = 'Please enter the 6-digit code';
            this.renderModal();
            return;
        }
        this.isLoading = true;
        this.otpError = '';
        this.renderModal();
        try {
            const r = await fetch('/api/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.otpEmail, code: this.otpCode })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error?.message || 'Verification failed');
            // Success
            this.otpMode = false;
            this.isLoginMode = true;
            this.errors.submit = null;
            this.isLoading = false;
            this.renderModal();
            this.showNotice('✅ Email verified! You can now log in.');
            return;
        } catch (e) {
            this.otpError = e.message || 'Verification failed.';
        }
        this.isLoading = false;
        this.renderModal();
    }

    async handleResendOtp() {
        this.isLoading = true;
        this.otpError = '';
        this.renderModal();
        try {
            await this.sendVerificationEmail(this.otpEmail, this.otpEmail.split('@')[0]);
            this.otpError = '';
            this.isLoading = false;
            this.renderModal();
            this.showNotice('New code sent! Check your inbox.', 'green');
        } catch (e) {
            this.otpError = e.message || 'Could not resend code.';
            this.isLoading = false;
            this.renderModal();
        }
    }

    async handleResendVerification() {
        if (!this.formData.email) {
            this.errors.submit = 'Enter your email address first.';
            this.renderModal();
            return;
        }
        this.isLoading = true;
        this.renderModal();
        try {
            await this.sendVerificationEmail(
                this.formData.email,
                this.formData.email.split('@')[0]
            );
            this.errors.submit = null;
            this.showNotice('New verification code sent! Check your inbox.', 'green');
        } catch (e) {
            this.errors.submit = e.message || 'Could not resend verification code.';
        }
        this.isLoading = false;
        this.renderModal();
    }

    async handleSubmit(e) {
        e.preventDefault();
        if (!this.validateForm()) { this.renderModal(); return; }

        this.isLoading = true;
        this.renderModal();

        try {
            if (this.isLoginMode) {
                const r = await loginWithEmail({
                    email: this.formData.email,
                    password: this.formData.password
                });
                if (r.ok) {
                    window.location.href = '/numbers';
                    return;
                }
                const code = r.data?.error?.code || 'invalid-credential';
                this.errors.submit = r.data?.error?.message || AUTH_ERRORS[`auth/${code}`] || 'Login failed';
            } else {
                const r = await signupWithEmail({
                    name: this.formData.name,
                    email: this.formData.email,
                    password: this.formData.password,
                    identificationNumber: this.formData.identificationNumber,
                    telegramNumber: this.formData.telegramNumber,
                    cryptoAddress: this.formData.cryptoAddress,
                    referralEmail: this.formData.referralEmail
                });
                if (!r.ok) {
                    const code = r.data?.error?.code || 'unknown';
                    throw new Error(r.data?.error?.message || AUTH_ERRORS[`auth/${code}`] || 'Could not sign up.');
                }
                // Send OTP and switch to code input mode
                const email = this.formData.email;
                const name  = this.formData.name;
                try {
                    await this.sendVerificationEmail(email, name);
                } catch (_) { /* SMTP not set — still proceed */ }
                this.otpMode  = true;
                this.otpEmail = email;
                this.otpCode  = '';
                this.otpError = '';
                this.errors.submit = null;
                this.isLoading = false;
                this.renderModal();
                return;
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.errors.submit = this.mapAuthError(error);
        }

        this.isLoading = false;
        this.renderModal();
    }

    showNotice(html) {
        const notice = document.getElementById('modalNotice');
        if (!notice) return;
        notice.innerHTML = `
            <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#86efac;border-radius:.65rem;padding:.65rem .85rem;font-size:.72rem;text-align:center;line-height:1.5;">
                <i class="fas fa-check-circle" style="margin-right:4px;"></i>${html}
            </div>`;
    }

    showResendOption() {
        const notice = document.getElementById('modalNotice');
        if (!notice) return;
        notice.innerHTML = `
            <div style="background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:.65rem;padding:.65rem .85rem;font-size:.72rem;text-align:center;color:#d1d5db;">
                <div style="display:flex;align-items:center;justify-content:center;gap:.4rem;color:#fbbf24;font-weight:700;font-size:.78rem;margin-bottom:.4rem;">
                    <i class="fas fa-envelope-open-text"></i><span>Email Not Verified</span>
                </div>
                <p style="color:#9ca3af;line-height:1.5;margin:0 0 .4rem;">Check your inbox and tap <strong style="color:#fff;">Activate Now</strong> in the GURUBIT email.</p>
                <button type="button" id="resendVerifyBtn" style="color:#00d2ff;font-weight:800;font-size:.7rem;text-transform:uppercase;background:none;border:none;cursor:pointer;">
                    <i class="fas fa-paper-plane" style="margin-right:3px;"></i>Resend Activation Email
                </button>
            </div>`;
        document.getElementById('resendVerifyBtn')?.addEventListener('click', () => this.handleResendVerification());
    }

    closeModal() {
        const modal = document.getElementById('authModal');
        if (modal) modal.remove();
        if (['/login', '/signup', '/auth'].includes(window.location.pathname)) {
            window.history.replaceState({}, '', '/');
        }
    }

    renderModal() {
        const container = document.getElementById('app');
        let modal = document.getElementById('authModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'authModal';
            modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-3';
            modal.style.cssText = 'overflow-y:auto;';
            container.appendChild(modal);
        }

        const isSignup = !this.isLoginMode && !this.isForgotMode && !this.otpMode && !this.resetOtpMode;
        modal.innerHTML = `
            <div id="authModalBackdrop" class="absolute inset-0 cursor-pointer" style="background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);"></div>
            <div id="authModalPanel" class="relative z-10 w-full" style="max-width:400px;animation:fadeIn .22s ease;">
                <div style="background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));border:1px solid rgba(0,210,255,0.2);border-radius:1.25rem;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
                    <div style="height:3px;background:linear-gradient(90deg,#00d2ff,#3a7bd5,#7c3aed);"></div>

                    <!-- Header -->
                    <div style="display:flex;align-items:center;padding:1rem 1rem 0;gap:.5rem;">
                        <div style="flex:1;text-align:center;">
                            <img src="/assets/logo-icon.svg" alt="" style="width:32px;height:32px;margin:0 auto 3px;display:block;">
                            <h2 style="font-size:1rem;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;margin:0;line-height:1.2;">
                                ${this.otpMode ? 'Verify Email' : this.resetOtpMode ? 'Enter Reset Code' : this.isForgotMode ? 'Reset Password' : this.isLoginMode ? 'Welcome Back' : 'Join GURUBIT'}
                            </h2>
                            <p style="font-size:.68rem;color:#6b7280;margin:2px 0 0;">
                                ${this.otpMode ? `Code sent to ${this.otpEmail}` : this.resetOtpMode ? `Code sent to ${this.resetEmail}` : this.isForgotMode ? 'Enter your email to reset' : this.isLoginMode ? 'Sign in to your account' : 'Create your free account'}
                            </p>
                        </div>
                        <button type="button" id="modalCloseBtn"
                            style="width:32px;height:32px;min-width:32px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:#6b7280;cursor:pointer;transition:all .2s;">
                            <i class="fas fa-times" style="font-size:12px;pointer-events:none;"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div style="padding:.85rem 1.1rem 1.1rem;">
                        <div id="modalNotice" style="margin-bottom:.6rem;"></div>
                        ${this.otpMode ? this.renderOtpFields() : this.resetOtpMode ? this.renderResetOtpFields() : `
                        <form id="authForm" style="display:flex;flex-direction:column;gap:.55rem;${isSignup ? 'max-height:58vh;overflow-y:auto;padding-right:2px;' : ''}">
                            ${this.isForgotMode ? this.renderForgotFields() : this.isLoginMode ? this.renderLoginFields() : this.renderSignupFields()}
                            ${this.errors.submit ? `
                                <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#fca5a5;border-radius:.65rem;padding:.55rem .85rem;font-size:.72rem;text-align:center;">
                                    <i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>${this.errors.submit}
                                </div>` : ''}
                            <button id="submitBtn" type="submit"
                                class="neon-btn ${this.isLoading ? 'opacity-60 pointer-events-none' : ''}"
                                style="width:100%;padding:.75rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;display:flex;align-items:center;justify-content:center;gap:.4rem;margin-top:.15rem;">
                                ${this.isLoading
                                    ? '<i class="fas fa-circle-notch fa-spin"></i><span>Please wait...</span>'
                                    : `<i class="fas fa-${this.isForgotMode ? 'paper-plane' : this.isLoginMode ? 'sign-in-alt' : 'user-plus'}"></i><span>${this.isForgotMode ? 'Send Reset Code' : this.isLoginMode ? 'Login' : 'Create Account'}</span>`}
                            </button>
                            ${this.isLoginMode && !this.isForgotMode && this.allowGuestLogin ? `
                            <button type="button" id="guestLoginBtn"
                                style="width:100%;padding:.65rem;border-radius:.65rem;border:1px solid rgba(0,210,255,0.3);color:#00d2ff;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.4rem;">
                                <i class="fas fa-user-secret"></i> Continue as Guest
                            </button>
                            <p style="font-size:.62rem;color:#4b5563;text-align:center;margin:0;">Testing only — no signup required</p>` : ''}
                        </form>
                        <div style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
                            ${this.isForgotMode
                                ? `<button type="button" id="backToLoginBtn" style="font-size:.78rem;font-weight:700;color:#00d2ff;background:none;border:none;cursor:pointer;">← Back to Login</button>`
                                : `<button type="button" id="toggleModeBtn" style="font-size:.78rem;font-weight:700;color:#6b7280;background:none;border:none;cursor:pointer;">
                                    ${this.isLoginMode ? 'Need an account? Sign Up Free →' : 'Already have an account? Sign In →'}
                                   </button>`}
                        </div>
                        `}
                    </div>
                </div>
            </div>`;
        this.attachEventListeners();
    }

    renderOtpFields() {
        return `
            <div style="display:flex;flex-direction:column;gap:.85rem;padding:.4rem 0;">
                <div style="background:rgba(0,210,255,0.06);border:1px solid rgba(0,210,255,0.2);border-radius:.85rem;padding:1rem;text-align:center;">
                    <i class="fas fa-envelope-open-text" style="font-size:2rem;color:#00d2ff;margin-bottom:.5rem;display:block;"></i>
                    <p style="margin:0;font-size:.8rem;color:#d1d5db;line-height:1.5;">
                        A <strong style="color:#fff;">6-digit code</strong> was sent to<br>
                        <strong style="color:#00d2ff;">${this.otpEmail}</strong>
                    </p>
                </div>
                <div>
                    <label style="display:block;font-size:.7rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem;">Enter Verification Code</label>
                    <input type="text" id="otpCodeInput" inputmode="numeric" maxlength="6" placeholder="_ _ _ _ _ _"
                        value="${this.otpCode}"
                        style="width:100%;height:56px;text-align:center;font-size:1.6rem;font-weight:900;letter-spacing:.35em;background:rgba(0,0,0,0.4);border:2px solid ${this.otpError ? 'rgba(239,68,68,0.5)' : 'rgba(0,210,255,0.3)'};border-radius:.75rem;color:#fff;outline:none;box-sizing:border-box;">
                    ${this.otpError ? `<p style="color:#f87171;font-size:.7rem;margin:.3rem 0 0;text-align:center;">${this.otpError}</p>` : ''}
                </div>
                <button type="button" id="verifyOtpBtn"
                    class="neon-btn ${this.isLoading ? 'opacity-60 pointer-events-none' : ''}"
                    style="width:100%;padding:.75rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;display:flex;align-items:center;justify-content:center;gap:.5rem;">
                    ${this.isLoading
                        ? '<i class="fas fa-circle-notch fa-spin"></i><span>Verifying…</span>'
                        : '<i class="fas fa-shield-alt"></i><span>Verify Code</span>'}
                </button>
                <div style="text-align:center;padding-top:.25rem;border-top:1px solid rgba(255,255,255,0.06);">
                    <p style="font-size:.7rem;color:#6b7280;margin:0 0 .4rem;">Didn't receive the code?</p>
                    <button type="button" id="resendOtpBtn" style="font-size:.75rem;font-weight:700;color:#00d2ff;background:none;border:none;cursor:pointer;">
                        <i class="fas fa-redo" style="margin-right:4px;font-size:.65rem;"></i>Resend Code
                    </button>
                </div>
            </div>`;
    }

    renderResetOtpFields() {
        return `
            <div style="display:flex;flex-direction:column;gap:.85rem;padding:.4rem 0;">
                <div style="background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.3);border-radius:.85rem;padding:1rem;text-align:center;">
                    <i class="fas fa-key" style="font-size:2rem;color:#a78bfa;margin-bottom:.5rem;display:block;"></i>
                    <p style="margin:0;font-size:.8rem;color:#d1d5db;line-height:1.5;">
                        A <strong style="color:#fff;">6-digit reset code</strong> was sent to<br>
                        <strong style="color:#a78bfa;">${this.resetEmail}</strong>
                    </p>
                </div>
                <div>
                    <label style="display:block;font-size:.7rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem;">Reset Code</label>
                    <input type="text" id="resetOtpInput" inputmode="numeric" maxlength="6" placeholder="_ _ _ _ _ _"
                        style="width:100%;height:52px;text-align:center;font-size:1.5rem;font-weight:900;letter-spacing:.35em;background:rgba(0,0,0,0.4);border:2px solid rgba(124,58,237,0.4);border-radius:.75rem;color:#fff;outline:none;box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block;font-size:.7rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem;">New Password</label>
                    <input type="password" id="resetNewPass" placeholder="New password (min. 8 chars)"
                        style="width:100%;height:44px;padding:0 .85rem;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:.65rem;color:#fff;font-size:.85rem;outline:none;box-sizing:border-box;">
                </div>
                <button type="button" id="submitResetBtn"
                    class="neon-btn ${this.isLoading ? 'opacity-60 pointer-events-none' : ''}"
                    style="width:100%;padding:.75rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;display:flex;align-items:center;justify-content:center;gap:.5rem;">
                    ${this.isLoading
                        ? '<i class="fas fa-circle-notch fa-spin"></i><span>Updating…</span>'
                        : '<i class="fas fa-lock"></i><span>Set New Password</span>'}
                </button>
                ${this.errors.submit ? `<p style="color:#f87171;font-size:.72rem;text-align:center;margin:0;">${this.errors.submit}</p>` : ''}
                <div style="text-align:center;">
                    <button type="button" id="backToLoginBtn" style="font-size:.75rem;font-weight:700;color:#6b7280;background:none;border:none;cursor:pointer;">← Back to Login</button>
                </div>
            </div>`;
    }

    renderSignupFields() {
        const fields = [
            { id: 'name', type: 'text', placeholder: 'Full Name', icon: 'user' },
            { id: 'identificationNumber', type: 'text', placeholder: 'Phone Number', icon: 'phone' },
            { id: 'email', type: 'email', placeholder: 'Email Address', icon: 'envelope' },
            { id: 'telegramNumber', type: 'text', placeholder: 'Telegram Username', icon: 'paper-plane' },
            { id: 'cryptoAddress', type: 'text', placeholder: 'USDT TRC20 Wallet', icon: 'wallet' },
            { id: 'referralEmail', type: 'email', placeholder: 'Agent / Referral Email', icon: 'user-tie' }
        ];
        return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">
                ${fields.map(f => this.renderField(f.id, f.type, f.placeholder, f.icon)).join('')}
            </div>
            ${this.renderField('password', 'password', 'Password (min. 8 chars)', 'lock')}
            <label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer;font-size:.72rem;color:#9ca3af;">
                <input type="checkbox" id="agreeTerms" style="margin-top:2px;accent-color:#00d2ff;" ${this.formData.agreeTerms ? 'checked' : ''}>
                <span>I agree to <a href="/terms" target="_blank" style="color:#00d2ff;">Terms</a> and <a href="/privacy" target="_blank" style="color:#00d2ff;">Privacy Policy</a></span>
            </label>
            ${this.errors.agreeTerms ? `<p style="color:#f87171;font-size:.65rem;margin:0;">${this.errors.agreeTerms}</p>` : ''}
        `;
    }

    renderForgotFields() {
        return this.renderField('email', 'email', 'Your registered email', 'envelope');
    }

    renderLoginFields() {
        return `
            ${this.renderField('email', 'email', 'Email Address', 'envelope')}
            ${this.renderField('password', 'password', 'Password', 'lock')}
            <div style="text-align:right;">
                <button type="button" id="forgotPasswordBtn" style="font-size:.75rem;color:#00d2ff;font-weight:600;background:none;border:none;cursor:pointer;">Forgot password?</button>
            </div>
        `;
    }

    renderField(id, type, placeholder, icon) {
        const hasError = this.errors[id];
        const val = type !== 'password' ? (this.formData[id] || '').replace(/"/g, '&quot;') : '';
        return `
            <div style="position:relative;">
                <div style="position:absolute;left:0;top:0;width:40px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#6b7280;z-index:2;">
                    <i class="fas fa-${icon}" style="font-size:13px;"></i>
                </div>
                <input type="${type}" id="${id}" placeholder="${placeholder}"
                    value="${val}"
                    style="width:100%;height:44px;padding:0 .85rem 0 40px;background:rgba(0,0,0,0.4);border:1px solid ${hasError ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.08)'};border-radius:.65rem;color:#fff;font-size:.82rem;outline:none;box-sizing:border-box;">
                ${hasError ? `<p style="color:#f87171;font-size:.65rem;margin:2px 0 0 4px;">${hasError}</p>` : ''}
            </div>`;
    }

    async handleGuestLogin() {
        this.isLoading = true;
        this.renderModal();
        try {
            const r = await startGuestSession();
            if (!r.ok) throw new Error(r.data?.error?.message || 'Guest login failed');
            window.location.href = '/numbers';
        } catch (error) {
            this.errors.submit = error.message;
            this.isLoading = false;
            this.renderModal();
        }
    }

    attachEventListeners() {
        document.getElementById('modalCloseBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('guestLoginBtn')?.addEventListener('click', () => this.handleGuestLogin());
        document.getElementById('authForm')?.addEventListener('submit', (e) => {
            if (this.isForgotMode) this.handleForgotPassword(e);
            else this.handleSubmit(e);
        });

        // OTP verification
        const otpInput = document.getElementById('otpCodeInput');
        if (otpInput) {
            otpInput.addEventListener('input', (e) => {
                this.otpCode = e.target.value.replace(/\D/g, '').slice(0, 6);
                e.target.value = this.otpCode;
                if (this.otpCode.length === 6) this.handleVerifyOtp();
            });
        }
        document.getElementById('verifyOtpBtn')?.addEventListener('click', () => this.handleVerifyOtp());
        document.getElementById('resendOtpBtn')?.addEventListener('click', () => this.handleResendOtp());

        // Reset OTP
        document.getElementById('submitResetBtn')?.addEventListener('click', async () => {
            const code = document.getElementById('resetOtpInput')?.value?.replace(/\s/g, '');
            const pass = document.getElementById('resetNewPass')?.value;
            if (!code || code.length !== 6) { this.errors.submit = 'Enter the 6-digit code.'; this.renderModal(); return; }
            if (!pass || pass.length < 8) { this.errors.submit = 'Password must be at least 8 characters.'; this.renderModal(); return; }
            this.isLoading = true; this.errors.submit = ''; this.renderModal();
            try {
                const r = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: this.resetEmail, code, password: pass })
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error?.message || 'Reset failed');
                this.resetOtpMode = false;
                this.isLoginMode = true;
                this.errors.submit = null;
                this.isLoading = false;
                this.renderModal();
                this.showNotice('✅ Password updated! You can now log in.');
                return;
            } catch (e) {
                this.errors.submit = e.message;
            }
            this.isLoading = false;
            this.renderModal();
        });

        document.getElementById('toggleModeBtn')?.addEventListener('click', () => {
            this.isLoginMode = !this.isLoginMode;
            this.isForgotMode = false;
            this.otpMode = false;
            this.resetOtpMode = false;
            this.errors = {};
            this.renderModal();
        });
        document.getElementById('forgotPasswordBtn')?.addEventListener('click', () => {
            this.isForgotMode = true;
            this.isLoginMode = false;
            this.otpMode = false;
            this.resetOtpMode = false;
            this.errors = {};
            this.renderModal();
        });
        document.getElementById('backToLoginBtn')?.addEventListener('click', () => {
            this.isForgotMode = false;
            this.isLoginMode = true;
            this.otpMode = false;
            this.resetOtpMode = false;
            this.errors = {};
            this.renderModal();
        });
        document.getElementById('authModalBackdrop')?.addEventListener('click', () => this.closeModal());
        document.getElementById('authModalPanel')?.addEventListener('click', (e) => e.stopPropagation());

        ['name', 'identificationNumber', 'email', 'telegramNumber', 'cryptoAddress', 'referralEmail', 'password'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', (e) => { this.formData[id] = e.target.value; });
        });
        document.getElementById('agreeTerms')?.addEventListener('change', (e) => { this.formData.agreeTerms = e.target.checked; });
    }

    async ensureLandingBehind() {
        if (document.querySelector('[data-page="landing"]')) return;
        // Render landing page in background — non-blocking
        import('./LandingPage.js').then(({ LandingPage }) => {
            new LandingPage().init();
        }).catch(() => {});
    }

    async init() {
        // Show modal immediately — don't wait for landing page or settings
        const path = window.location.pathname;
        if (['/signup', '/login', '/forgot-password'].includes(path)) {
            if (path === '/signup') { this.isLoginMode = false; this.isForgotMode = false; }
            if (path === '/login') { this.isLoginMode = true; this.isForgotMode = false; }
            if (path === '/forgot-password') { this.isForgotMode = true; this.isLoginMode = false; }
        }

        // Render modal instantly
        this.renderModal();

        // Load landing behind and settings in parallel — non-blocking
        this.ensureLandingBehind();
        fetch('/api/auth/settings')
            .then(r => r.json())
            .then(data => {
                if (data.success && data.settings) {
                    const newVal = data.settings.allowGuestLogin !== false;
                    if (newVal !== this.allowGuestLogin) {
                        this.allowGuestLogin = newVal;
                        this.renderModal(); // re-render only if changed
                    }
                }
            })
            .catch(() => {});
    }
}
