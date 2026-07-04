/**
 * Password reset landing — set new password from email link
 */

import { confirmPasswordReset } from '../auth-config.js';

export class ResetPasswordPage {
    constructor() {
        this.password = '';
        this.confirm = '';
        this.errors = {};
        this.done = false;
    }

    async handleSubmit(e) {
        e.preventDefault();
        this.errors = {};
        if (!this.password || this.password.length < 8) this.errors.password = 'Min 8 characters';
        if (this.password !== this.confirm) this.errors.confirm = 'Passwords do not match';
        if (Object.keys(this.errors).length) { this.render(); return; }

        const params = new URLSearchParams(window.location.search);

        if (params.get('done') === '1') {
            this.done = true;
            this.render();
            return;
        }

        const token = params.get('token');
        if (!token) {
            this.errors.submit = 'Invalid or expired reset link. Request a new one from the login page.';
            this.render();
            return;
        }

        try {
            const r = await confirmPasswordReset(token, this.password);
            if (!r.ok) {
                throw new Error(r.data?.error?.message || 'Could not reset password.');
            }
            this.done = true;
            window.history.replaceState({}, '', '/reset-password?done=1');
        } catch (err) {
            console.error(err);
            this.errors.submit = err.message || 'Could not reset password. The link may have expired.';
        }
        this.render();
    }

    render() {
        const container = document.getElementById('app');
        container.innerHTML = `
            <div class="min-h-screen flex items-center justify-center px-4" style="background: radial-gradient(ellipse at top, #0a1e3b, #020b18);">
                <div class="glass-card w-full max-w-md p-10 premium-shadow border-primary/20">
                    <div class="text-center mb-8">
                        <img src="/assets/logo-icon.svg" alt="" class="w-12 h-12 mx-auto mb-4 logo-glow">
                        <h1 class="text-2xl font-black text-white uppercase">${this.done ? 'Password Updated' : 'New Password'}</h1>
                        <p class="text-gray-400 text-sm mt-2">${this.done ? 'You can log in with your new password now.' : 'Enter your new password below.'}</p>
                    </div>
                    ${this.done ? `
                        <a href="/?login=1" id="goLoginBtn" class="neon-btn block w-full py-4 text-center text-sm uppercase tracking-widest">Go to Login</a>
                    ` : `
                        <form id="resetForm" class="space-y-4">
                            <input type="password" id="newPassword" placeholder="New password (min. 8)" class="input-field text-sm" />
                            ${this.errors.password ? `<p class="text-red-400 text-xs">${this.errors.password}</p>` : ''}
                            <input type="password" id="confirmPassword" placeholder="Confirm password" class="input-field text-sm" />
                            ${this.errors.confirm ? `<p class="text-red-400 text-xs">${this.errors.confirm}</p>` : ''}
                            ${this.errors.submit ? `<p class="text-red-400 text-sm text-center">${this.errors.submit}</p>` : ''}
                            <button type="submit" class="neon-btn w-full py-4 text-sm uppercase tracking-widest">Update Password</button>
                        </form>
                    `}
                    <p class="site-credit text-center mt-8">Powered by <strong>Riyad Al Mamun</strong></p>
                </div>
            </div>
        `;

        document.getElementById('resetForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('goLoginBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/';
        });
        document.getElementById('newPassword')?.addEventListener('input', (e) => { this.password = e.target.value; });
        document.getElementById('confirmPassword')?.addEventListener('input', (e) => { this.confirm = e.target.value; });
    }

    init() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('done') === '1') this.done = true;
        this.render();
    }
}
