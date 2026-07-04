/**
 * Email verification landing — destination for "Activate Now"
 */

export class VerifyEmailPage {
    constructor() {
        this.status = 'pending';
        this.message = 'Open the email we sent and tap the blue <strong>Activate Now</strong> button to verify your account.';
    }

    async handleApply() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (!token) return;
        this.status = 'activating';
        this.render();

        try {
            const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
                method: 'GET',
                credentials: 'include'
            });
            if (!res.ok && res.status !== 302) throw new Error('Activation failed');
            this.status = 'success';
            this.message = 'Your account is now active! You can log in.';
            window.history.replaceState({}, '', '/verify-email?verified=1');
        } catch (err) {
            console.error(err);
            this.status = 'error';
            this.message = 'This activation link is invalid or has already been used. Please log in and request a new verification email.';
        }
        this.render();
    }

    async init() {
        const params = new URLSearchParams(window.location.search);

        if (params.get('verified') === '1') {
            this.status = 'success';
            this.message = 'Your email has been verified. You can now log in to your account.';
        } else if (params.get('token')) {
            await this.handleApply();
        } else {
            this.status = 'pending';
        }
        this.render();
    }

    render() {
        const container = document.getElementById('app');
        const isSuccess = this.status === 'success';
        const isError   = this.status === 'error';
        const isActivating = this.status === 'activating';

        const icon      = isSuccess ? 'check-circle' : isError ? 'times-circle' : 'envelope-open';
        const iconColor = isSuccess ? '#22c55e'       : isError ? '#f87171'      : '#00d2ff';

        let title = 'Verify Your Email';
        if (isSuccess)    title = 'Account Activated';
        if (isError)      title = 'Activation Failed';
        if (isActivating) title = 'Activating…';

        let actionBtn = `<a href="/" class="neon-btn inline-block px-10 py-4 text-xs uppercase tracking-widest">Go to Homepage</a>`;
        if (isSuccess) {
            actionBtn = `<a href="/login" class="neon-btn inline-block px-10 py-4 text-xs uppercase tracking-widest">Log In Now</a>`;
        } else if (isActivating) {
            actionBtn = `<button disabled class="neon-btn inline-block px-10 py-4 text-xs uppercase tracking-widest opacity-60 cursor-not-allowed"><i class="fas fa-circle-notch animate-spin mr-2"></i>Activating…</button>`;
        }

        container.innerHTML = `
            <div class="min-h-screen flex items-center justify-center px-4" data-page="verify"
                style="background: radial-gradient(ellipse at top, #0a1e3b 0%, #020b18 70%);">
                <div class="glass-card max-w-md w-full p-10 text-center premium-shadow border-primary/20">
                    <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                        style="background: rgba(0,210,255,0.08);">
                        <i class="fas fa-${icon} text-4xl" style="color: ${iconColor};"></i>
                    </div>
                    <h1 class="text-2xl font-black text-white uppercase tracking-tight mb-3">${title}</h1>
                    <p class="text-gray-400 text-sm leading-relaxed mb-8">${this.message}</p>
                    ${actionBtn}
                </div>
            </div>`;
    }
}
