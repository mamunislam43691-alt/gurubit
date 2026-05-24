/**
 * Email verification landing — destination for "Activate Now"
 */

export class VerifyEmailPage {
    constructor() {
        this.status = 'pending';
        this.message = 'Open the email we sent and tap the blue Activate Now button to verify your account.';
    }

    async tryVerifyFromUrl() {
        const params = new URLSearchParams(window.location.search);

        if (params.get('verified') === '1') {
            this.status = 'success';
            this.message = 'Your email is verified. You can log in to your dashboard now.';
            return;
        }

        const oobCode = params.get('oobCode');
        const mode = params.get('mode');
        if (!oobCode || mode !== 'verifyEmail') return;

        try {
            const { auth } = await import('../firebase-config.js');
            const { applyActionCode } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            if (!auth) throw new Error('Auth not initialized');
            await applyActionCode(auth, oobCode);
            this.status = 'success';
            this.message = 'Email activated successfully! You can log in now.';
            window.history.replaceState({}, '', '/verify-email?verified=1');
        } catch (err) {
            console.error(err);
            this.status = 'error';
            this.message = 'This activation link is invalid or expired. Log in and request a new verification email.';
        }
    }

    render() {
        const container = document.getElementById('app');
        const isSuccess = this.status === 'success';
        const isError = this.status === 'error';
        const icon = isSuccess ? 'check-circle' : isError ? 'times-circle' : 'envelope-open';
        const iconColor = isSuccess ? '#22c55e' : isError ? '#f87171' : '#00d2ff';

        container.innerHTML = `
            <motion.div class="min-h-screen flex items-center justify-center px-4" data-page="verify"
                style="background: radial-gradient(ellipse at top, #0a1e3b 0%, #020b18 70%);">
                <div class="glass-card max-w-md w-full p-10 text-center premium-shadow border-primary/20">
                    <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style="background: rgba(0,210,255,0.08);">
                        <i class="fas fa-${icon} text-4xl" style="color: ${iconColor};"></i>
                    </div>
                    <h1 class="text-2xl font-black text-white uppercase tracking-tight mb-3">
                        ${isSuccess ? 'Account Activated' : isError ? 'Activation Failed' : 'Verify Your Email'}
                    </h1>
                    <p class="text-gray-400 text-sm leading-relaxed mb-8">${this.message}</p>
                    <a href="/" class="neon-btn inline-block px-10 py-4 text-xs uppercase tracking-widest">Go to Homepage</a>
                </div>
            </div>
        `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
    }

    async init() {
        await this.tryVerifyFromUrl();
        this.render();
    }
}
