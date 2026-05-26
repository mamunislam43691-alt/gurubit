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
                // Pre-validate referral email to prevent orphaned Firebase Auth users
                const valRes = await fetch('/api/auth/validate-referral', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ referralEmail: this.formData.referralEmail })
                });
                if (!valRes.ok) {
                    let valErr;
                    try { valErr = await valRes.json(); } catch (e) { valErr = {}; }
                    throw new Error(valErr.error?.message || 'Referral email validation failed. Please check the agent email.');
                }

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
            <div class="bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl p-4 text-xs font-medium text-center leading-relaxed">
                <i class="fas fa-check-circle mr-1"></i> ${html}
            </div>`;
    }

    showResendOption() {
        const notice = document.getElementById('modalNotice');
        if (!notice) return;
        notice.innerHTML = `
            <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-xs text-center text-gray-300 space-y-3">
                <div class="flex items-center justify-center gap-2 text-yellow-400 font-bold text-sm">
                    <i class="fas fa-envelope-open-text"></i>
                    <span>Email Not Verified</span>
                </div>
                <p class="text-gray-400 leading-relaxed">
                    Check your inbox and tap the <strong class="text-white">Activate Now</strong> button in the GURUBIT email.<br>
                    After activating, your agent must also approve your account.
                </p>
                <p class="text-gray-500">Didn't receive the email? Enter your password above and resend.</p>
                <button type="button" id="resendVerifyBtn"
                    class="text-primary font-black uppercase tracking-widest hover:underline text-xs">
                    <i class="fas fa-paper-plane mr-1"></i>Resend Activation Email
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
            modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto';
            modal.innerHTML = `<div id="authModalBackdrop" class="absolute inset-0 bg-black/35 backdrop-blur-[3px]"></div>`;
            container.appendChild(modal);
        }

        modal.innerHTML = `
            <motion.div id="authModalBackdrop" class="absolute inset-0 bg-black/35 backdrop-blur-[3px] cursor-pointer" aria-label="Close"></div>
            <motion.div id="authModalPanel" class="relative z-10 w-full max-w-md my-8" style="animation: fadeIn 0.35s ease;">
                <motion.div class="glass-card premium-shadow border-primary/20 overflow-hidden">
                    <motion.div class="h-1 w-full" style="background: linear-gradient(90deg, #00d2ff, #3a7bd5, #7c3aed);"></div>
                    <motion.div class="relative p-8 sm:p-10">
                        <button type="button" id="authCloseBtn" class="absolute top-4 right-4 text-gray-500 hover:text-red-400 transition-all duration-300 w-8 h-8 rounded-full border border-white/10 hover:border-red-400/30 flex items-center justify-center bg-white/5" title="Close">
                            <i class="fas fa-times text-sm"></i>
                        </button>
                        <button type="button" id="authHelpBtn" class="absolute top-4 right-14 text-gray-500 hover:text-primary transition-all duration-300 w-8 h-8 rounded-full border border-white/10 hover:border-primary/30 flex items-center justify-center bg-white/5" title="Get Help / Support">
                            <i class="fas fa-question text-sm"></i>
                        </button>
                        <motion.div class="text-center mb-8">
                            <img src="/assets/logo-icon.svg" alt="" class="w-12 h-12 mx-auto mb-4 logo-glow">
                            <h2 class="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
                                ${this.isForgotMode ? 'Reset Password' : this.isLoginMode ? 'Welcome Back' : 'Join GURUBIT'}
                            </h2>
                            <p class="text-gray-400 text-sm mt-2 font-medium">
                                ${this.isForgotMode ? 'We will email you a secure reset link' : this.isLoginMode ? 'Sign in to your account' : 'Create your free account'}
                            </p>
                        </motion.div>

                        <motion.div id="modalNotice" class="mb-4"></motion.div>

                        <form id="authForm" class="space-y-4">
                            ${this.isForgotMode ? this.renderForgotFields() : this.isLoginMode ? this.renderLoginFields() : this.renderSignupFields()}

                            ${this.errors.submit ? `
                                <div class="bg-red-500/10 border border-red-500/25 text-red-300 rounded-xl px-4 py-3 text-xs text-center">
                                    <i class="fas fa-exclamation-circle mr-1"></i>${this.errors.submit}
                                </div>
                            ` : ''}

                            <button id="submitBtn" type="submit" class="neon-btn w-full py-4 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 mt-2 ${this.isLoading ? 'opacity-60 pointer-events-none' : ''}">
                                ${this.isLoading
                ? '<i class="fas fa-circle-notch animate-spin"></i><span>Please wait...</span>'
                : `<i class="fas fa-${this.isForgotMode ? 'paper-plane' : this.isLoginMode ? 'sign-in-alt' : 'user-plus'}"></i><span>${this.isForgotMode ? 'Send Reset Link' : this.isLoginMode ? 'Login' : 'Create Free Account'}</span>`}
                            </button>
                            ${this.isLoginMode && !this.isForgotMode && this.allowGuestLogin ? `
                            <button type="button" id="guestLoginBtn" class="w-full py-3 mt-3 rounded-xl border border-primary/40 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/10 transition-all flex items-center justify-center gap-2">
                                <i class="fas fa-user-secret"></i> Continue as Guest User
                            </button>
                            <p class="text-[10px] text-gray-600 text-center">Testing only — no signup required</p>
                            ` : ''}
                        </form>

                        <motion.div class="mt-6 pt-5 border-t border-white/5 text-center space-y-3">
                            ${this.isForgotMode ? `
                                <button type="button" id="backToLoginBtn" class="text-sm font-bold text-primary hover:underline">← Back to Login</button>
                            ` : `
                                <button type="button" id="toggleModeBtn" class="text-sm font-bold text-gray-400 hover:text-primary transition-colors">
                                    ${this.isLoginMode ? 'Need an account? Sign Up Free →' : 'Already have an account? Sign In →'}
                                </button>
                            `}
                        </motion.div>
                    </motion.div>
                </motion.div>
            </motion.div>
        `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');

        this.attachEventListeners();
    }

    renderSignupFields() {
        const fields = [
            { id: 'name', type: 'text', placeholder: 'Full Name', icon: 'user' },
            { id: 'identificationNumber', type: 'text', placeholder: 'Phone Number', icon: 'phone' },
            { id: 'email', type: 'email', placeholder: 'Email Address', icon: 'envelope' },
            { id: 'telegramNumber', type: 'text', placeholder: 'Telegram Username', icon: 'paper-plane' },
            { id: 'cryptoAddress', type: 'text', placeholder: 'USDT TRC20 Wallet Address', icon: 'wallet' },
            { id: 'referralEmail', type: 'email', placeholder: 'Agent / Referral Email', icon: 'user-tie' }
        ];
        return `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-1">
                ${fields.map(f => this.renderField(f.id, f.type, f.placeholder, f.icon)).join('')}
            </div>
            ${this.renderField('password', 'password', 'Password (min. 8 chars)', 'lock')}
            <label class="flex items-start gap-3 cursor-pointer text-xs text-gray-400">
                <input type="checkbox" id="agreeTerms" class="mt-0.5 rounded border-gray-600" ${this.formData.agreeTerms ? 'checked' : ''}>
                <span>I agree to <a href="/terms" target="_blank" class="text-primary hover:underline">Terms</a> and <a href="/privacy" target="_blank" class="text-primary hover:underline">Privacy Policy</a></span>
            </label>
            ${this.errors.agreeTerms ? `<p class="text-red-400 text-[10px]">${this.errors.agreeTerms}</p>` : ''}
        `;
    }

    renderForgotFields() {
        return this.renderField('email', 'email', 'Your registered email', 'envelope');
    }

    renderLoginFields() {
        return `
            ${this.renderField('email', 'email', 'Email Address', 'envelope')}
            ${this.renderField('password', 'password', 'Password', 'lock')}
            <div class="text-right">
                <button type="button" id="forgotPasswordBtn" class="text-sm text-primary font-semibold hover:underline">Forgot password?</button>
            </div>
        `;
    }

    renderField(id, type, placeholder, icon) {
        const hasError = this.errors[id];
        return `
            <motion.div class="relative group">
                <motion.div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-600 group-focus-within:text-primary transition-colors">
                    <i class="fas fa-${icon} text-sm"></i>
                </motion.div>
                <input type="${type}" id="${id}" placeholder="${placeholder}"
                    value="${type !== 'password' ? (this.formData[id] || '') : ''}"
                    class="input-field py-3.5 text-sm ${hasError ? 'border-red-500/40' : ''}" style="padding-left: 3rem !important;">
                ${hasError ? `<p class="text-red-400 text-[10px] mt-1 ml-1">${hasError}</p>` : ''}
            </motion.div>
        `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
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
        document.getElementById('authCloseBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('authHelpBtn')?.addEventListener('click', () => {
            if (window.liveSupportWidget) {
                window.liveSupportWidget.toggle();
            } else {
                console.warn('Support widget not initialized yet');
            }
        });
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
        const { LandingPage } = await import('./LandingPage.js');
        new LandingPage().init();
    }

    async init() {
        await this.ensureLandingBehind();
        try {
            const res = await fetch('/api/auth/settings');
            const data = await res.json();
            if (data.success && data.settings) {
                this.allowGuestLogin = data.settings.allowGuestLogin !== false;
            } else {
                this.allowGuestLogin = true;
            }
        } catch (e) {
            console.error('Failed to load guest setting:', e);
            this.allowGuestLogin = true;
        }
        const path = window.location.pathname;
        if (['/signup', '/login', '/forgot-password'].includes(path)) {
            if (path === '/signup') { this.isLoginMode = false; this.isForgotMode = false; }
            if (path === '/login') { this.isLoginMode = true; this.isForgotMode = false; }
            if (path === '/forgot-password') { this.isForgotMode = true; this.isLoginMode = false; }
        }
        this.renderModal();
    }
}
