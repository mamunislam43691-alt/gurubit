/**
 * AuthPage — modal login/signup with visible homepage behind
 */

import {
    auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    isFirebaseConfigured,
    firebaseReady
} from '../firebase-config.js';

const FIREBASE_ERRORS = {
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
    }

    mapFirebaseError(error) {
        return FIREBASE_ERRORS[error?.code] || error?.message || 'Something went wrong. Please try again.';
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

    async sendVerificationEmail(user) {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/send-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                name: this.formData.name || user.email.split('@')[0],
                idToken
            })
        });
        let data;
        try {
            data = await res.json();
        } catch (e) {
            data = {};
        }

        if (res.ok) {
            if (data.preview) {
                console.info('Verification link (dev):', data.message);
            }
            return { ok: true, preview: data.preview };
        }

        // If Firebase Admin is not configured, skip verification in development
        if (data.error?.code === 'ADMIN_NOT_CONFIGURED') {
            console.warn('Firebase Admin not configured - skipping email verification in development');
            return { ok: true, skipped: true };
        }

        throw new Error(data.error?.message || 'Could not send verification email. Add config/serviceAccountKey.json and SMTP settings in .env');
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
            await firebaseReady;

            const res = await fetch('/api/auth/send-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.formData.email })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error?.message || 'Could not send reset email. Configure Firebase Admin + SMTP in .env');
            }

            this.errors.submit = null;
            this.showNotice('Check your email and tap the <strong>Reset Password</strong> button (no link text in the email).');
        } catch (error) {
            this.errors.submit = this.mapFirebaseError(error);
        }

        this.isLoading = false;
        this.renderModal();
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
            if (!isFirebaseConfigured || !auth) throw new Error('Auth unavailable');
            const { signInWithEmailAndPassword: signIn } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const cred = await signIn(auth, this.formData.email, this.formData.password);
            await this.sendVerificationEmail(cred.user);
            await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js').then(m => m.signOut(auth));
            this.errors.submit = null;
            this.showNotice('Verification email sent! Tap <strong>Activate Now</strong> in your inbox.', 'green');
        } catch (e) {
            this.errors.submit = 'Enter your correct password to resend verification, or sign up again.';
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
            await firebaseReady;

            if (this.isLoginMode) {
                if (isFirebaseConfigured && auth) {
                    const cred = await signInWithEmailAndPassword(auth, this.formData.email, this.formData.password);
                    await cred.user.reload();
                    // In development mode, we'll let the server decide if email verification is required
                    // If the server returns EMAIL_NOT_VERIFIED error, we'll show the resend option
                    const idToken = await cred.user.getIdToken(true);
                    const res = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            idToken,
                            email: cred.user.email
                        })
                    });
                    let data;
                    try {
                        data = await res.json();
                    } catch (e) {
                        // Response is not JSON, might be HTML
                        console.error('Login API returned non-JSON response:', res.status);
                        this.errors.submit = 'Server error. Please try again.';
                        this.isLoading = false;
                        this.renderModal();
                        return;
                    }
                    if (res.ok) {
                        window.location.href = '/numbers';
                        return;
                    }
                    this.errors.submit = data.error?.message || 'Login failed';
                } else {
                    window.location.href = '/numbers';
                    return;
                }
            } else if (isFirebaseConfigured && auth) {
                const cred = await createUserWithEmailAndPassword(auth, this.formData.email, this.formData.password);
                const signupRes = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: cred.user.uid, ...this.formData })
                });
                if (!signupRes.ok) {
                    let err;
                    try {
                        err = await signupRes.json();
                    } catch (e) {
                        throw new Error('Server error. Please try again.');
                    }
                    throw new Error(err.error?.message || 'Could not save your profile');
                }
                const emailResult = await this.sendVerificationEmail(cred.user).catch(() => ({ ok: false, skipped: true }));
                this.isLoginMode = true;
                this.errors.submit = null;
                this.isLoading = false;
                this.renderModal();
                this.showNotice('Account created! ✅<br>Your request has been sent to your agent. Once your agent approves your account, you can log in with your email and password.');
                return;
            } else {
                window.location.href = '/numbers';
                return;
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.errors.submit = this.mapFirebaseError(error);
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

        const isSignup = !this.isLoginMode && !this.isForgotMode;
        modal.innerHTML = `
            <div id="authModalBackdrop" class="absolute inset-0 cursor-pointer" style="background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);"></div>
            <div id="authModalPanel" class="relative z-10 w-full" style="max-width:400px;animation:fadeIn .22s ease;">
                <div style="background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));border:1px solid rgba(0,210,255,0.2);border-radius:1.25rem;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
                    <div style="height:3px;background:linear-gradient(90deg,#00d2ff,#3a7bd5,#7c3aed);"></div>

                    <!-- Header: [?] [logo+title] [×] -->
                    <div style="display:flex;align-items:center;padding:1rem 1rem 0;gap:.5rem;">
                        <a href="/faq" target="_blank" id="helpBtn"
                           style="width:32px;height:32px;min-width:32px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:#6b7280;text-decoration:none;transition:all .2s;">
                            <i class="fas fa-question-circle" style="font-size:13px;pointer-events:none;"></i>
                        </a>
                        <div style="flex:1;text-align:center;">
                            <img src="/assets/logo-icon.svg" alt="" style="width:32px;height:32px;margin:0 auto 3px;display:block;">
                            <h2 style="font-size:1rem;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;margin:0;line-height:1.2;">
                                ${this.isForgotMode ? 'Reset Password' : this.isLoginMode ? 'Welcome Back' : 'Join GURUBIT'}
                            </h2>
                            <p style="font-size:.68rem;color:#6b7280;margin:2px 0 0;">
                                ${this.isForgotMode ? 'Enter your email to reset' : this.isLoginMode ? 'Sign in to your account' : 'Create your free account'}
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
                                    : `<i class="fas fa-${this.isForgotMode ? 'paper-plane' : this.isLoginMode ? 'sign-in-alt' : 'user-plus'}"></i><span>${this.isForgotMode ? 'Send Reset Link' : this.isLoginMode ? 'Login' : 'Create Account'}</span>`}
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
                    </div>
                </div>
            </div>`;
        this.attachEventListeners();
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
        return `
            <div style="position:relative;">
                <div style="position:absolute;left:0;top:0;width:40px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#6b7280;z-index:2;">
                    <i class="fas fa-${icon}" style="font-size:13px;"></i>
                </div>
                <input type="${type}" id="${id}" placeholder="${placeholder}"
                    value="${type !== 'password' ? (this.formData[id] || '') : ''}"
                    style="width:100%;height:44px;padding:0 .85rem 0 40px;background:rgba(0,0,0,0.4);border:1px solid ${hasError ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.08)'};border-radius:.65rem;color:#fff;font-size:.82rem;outline:none;box-sizing:border-box;"
                    class="${hasError ? '' : ''}">
                ${hasError ? `<p style="color:#f87171;font-size:.65rem;margin:2px 0 0 4px;">${hasError}</p>` : ''}
            </div>`;
    }

    async handleGuestLogin() {
        this.isLoading = true;
        this.renderModal();
        try {
            const res = await fetch('/api/auth/guest', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || 'Guest login failed');
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
        document.getElementById('toggleModeBtn')?.addEventListener('click', () => {
            this.isLoginMode = !this.isLoginMode;
            this.isForgotMode = false;
            this.errors = {};
            this.renderModal();
        });
        document.getElementById('forgotPasswordBtn')?.addEventListener('click', () => {
            this.isForgotMode = true;
            this.isLoginMode = false;
            this.errors = {};
            this.renderModal();
        });
        document.getElementById('backToLoginBtn')?.addEventListener('click', () => {
            this.isForgotMode = false;
            this.isLoginMode = true;
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
