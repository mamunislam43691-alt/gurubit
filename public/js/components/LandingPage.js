/**
 * Landing Page — full marketing homepage (reference-style layout)
 */

export class LandingPage {
    constructor() {}

    serviceLogosMarquee() {
        const brands = [
            { name: 'WhatsApp', icon: 'whatsapp', color: '#25D366' },
            { name: 'Telegram', icon: 'telegram', color: '#0088cc' },
            { name: 'Google', icon: 'google', color: '#ea4335' },
            { name: 'Facebook', icon: 'facebook-f', color: '#1877f2' },
            { name: 'Microsoft', icon: 'microsoft', color: '#00a4ef' },
            { name: 'TikTok', icon: 'tiktok', color: '#ff0050' },
            { name: 'LinkedIn', icon: 'linkedin-in', color: '#0a66c2' },
            { name: 'Twitter', icon: 'x-twitter', color: '#e7e9ea' },
            { name: 'Instagram', icon: 'instagram', color: '#e4405f' },
            { name: 'YouTube', icon: 'youtube', color: '#ff0000' }
        ];
        const item = (b) => `
            <div class="logo-marquee-item" title="${b.name}">
                <i class="fab fa-${b.icon}" style="color: ${b.color};"></i>
            </div>`;
        const row = brands.map(item).join('');
        return row + row;
    }

    whyCard(title, desc, icon) {
        return `
            <motion.div class="glass-card p-8 border-white/5 hover:border-primary/20 transition-all group h-full flex flex-col">
                <motion.div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5 group-hover:bg-primary group-hover:text-dark transition-all">
                    <i class="fas fa-${icon}"></i>
                </motion.div>
                <h3 class="text-base font-black text-white uppercase tracking-wide mb-3">${title}</h3>
                <p class="text-gray-500 text-sm leading-relaxed flex-grow">${desc}</p>
                <button type="button" class="auth-open-signup mt-6 text-[10px] font-black text-primary uppercase tracking-widest text-left hover:underline">Try It Now →</button>
            </motion.div>
        `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
    }

    chooseCard(title, desc, icon) {
        return `
            <motion.div class="flex gap-4 p-5 rounded-xl border border-white/5 hover:bg-white/[0.02] transition-all">
                <motion.div class="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <i class="fas fa-${icon} text-sm"></i>
                </motion.div>
                <motion.div>
                    <h4 class="font-bold text-white text-sm mb-1">${title}</h4>
                    <p class="text-gray-500 text-xs leading-relaxed">${desc}</p>
                </motion.div>
            </motion.div>
        `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
    }

    render() {
        const container = document.getElementById('app');
        document.getElementById('app-skeleton')?.remove();
        container.innerHTML = `
            <motion.div data-page="landing" class="min-h-screen text-white overflow-x-hidden" style="background: radial-gradient(ellipse at top right, #0a1e3b 0%, #020b18 60%);">
                <!-- Particles + 3D orbs -->
                <div class="particles-bg" id="particlesBg"></div>
                <div class="orb w-[700px] h-[700px] top-[-200px] right-[-200px]" style="background:radial-gradient(circle,#00d2ff,transparent)"></div>
                <div class="orb w-[500px] h-[500px] bottom-[-100px] left-[-100px]" style="background:radial-gradient(circle,#3a7bd5,transparent);animation-delay:4s"></div>
                <div class="grid-bg fixed inset-0 pointer-events-none z-0 opacity-60"></div>

                <nav class="fixed top-0 w-full z-40 bg-black/50 backdrop-blur-lg border-b border-white/5">
                    <motion.div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
                        <a href="/" class="flex items-center gap-3">
                            <img src="/assets/logo.svg" alt="GURUBIT" class="w-10 h-10 logo-glow">
                            <span class="text-lg font-black tracking-widest gradient-text uppercase">GURUBIT</span>
                        </a>
                        <motion.div class="hidden lg:flex gap-8 text-xs font-bold text-gray-300 uppercase tracking-widest">
                            <a href="#features" class="hover:text-primary">Home</a>
                            <a href="#why" class="hover:text-primary">About</a>
                            <a href="/live-feed" class="hover:text-primary">Live Feed</a>
                            <a href="/faq" class="hover:text-primary">Help</a>
                        </motion.div>
                        <div class="flex items-center gap-3">
                            <button id="navLoginBtn" class="px-5 py-2.5 text-xs font-black uppercase tracking-widest border border-white/15 rounded-lg text-gray-200 hover:border-primary/50 hover:text-white transition-all">Login</button>
                            <button id="navSignupBtn" class="neon-btn px-5 py-2.5 text-xs uppercase tracking-widest">Sign up</button>
                        </div>
                    </motion.div>
                </nav>

                <!-- Hero -->
                <section class="relative z-10 pt-32 pb-20 lg:pt-40 lg:pb-28 px-4 landing-3d-scene">
                    <div class="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
                        <div class="text-center lg:text-left">
                            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 mb-6 badge-3d reveal-up">
                                <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                <span class="text-xs font-black text-primary uppercase tracking-widest">100% Free · No Credit Card</span>
                            </div>
                            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] mb-6 uppercase tracking-tight reveal-up delay-1">
                                Online Phone Numbers For<br><span class="shimmer-text">SMS Verification</span>
                            </h1>
                            <p class="text-gray-400 text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0 reveal-up delay-2">
                                Receive SMS codes instantly with disposable numbers. Protect your privacy, verify any platform, and <strong class="text-white">earn rewards</strong> on every successful verification.
                            </p>
                            <div class="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start reveal-up delay-3">
                                <button id="heroGetStartedBtn" class="neon-btn px-10 py-4 text-sm uppercase tracking-[0.15em] inline-flex items-center gap-2 badge-3d">
                                    Get Started Free <i class="fas fa-arrow-right text-xs"></i>
                                </button>
                                <a href="/live-feed" class="px-8 py-4 text-sm font-bold uppercase tracking-widest border border-white/15 rounded-xl text-gray-300 hover:border-primary/50 hover:text-primary transition-all inline-flex items-center gap-2">
                                    <i class="fas fa-satellite-dish text-xs"></i> Live Feed
                                </a>
                            </div>
                            <div class="flex items-center gap-8 mt-10 justify-center lg:justify-start reveal-up delay-4">
                                <div class="text-center"><p class="text-2xl font-black text-primary neon-text">50+</p><p class="text-[10px] text-gray-500 uppercase tracking-widest">Countries</p></div>
                                <div class="w-px h-8 bg-white/10"></div>
                                <div class="text-center"><p class="text-2xl font-black text-primary neon-text">&lt;2s</p><p class="text-[10px] text-gray-500 uppercase tracking-widest">SMS Speed</p></div>
                                <div class="w-px h-8 bg-white/10"></div>
                                <div class="text-center"><p class="text-2xl font-black text-primary neon-text">$0</p><p class="text-[10px] text-gray-500 uppercase tracking-widest">Always Free</p></div>
                            </div>
                        </div>
                        <div class="relative hidden lg:block reveal-up delay-2">
                            <div class="hero-3d-mockup glass-card p-8 premium-shadow border-primary/10 relative overflow-hidden">
                                <div class="scan-line"></div>
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="bg-dark-lighter rounded-2xl p-6 border border-white/5 card-3d">
                                        <i class="fas fa-mobile-screen text-3xl text-primary mb-4"></i>
                                        <p class="text-xs text-gray-500 uppercase tracking-widest">Live Numbers</p>
                                        <p class="text-2xl font-black text-white mt-1">50+</p>
                                    </div>
                                    <div class="bg-dark-lighter rounded-2xl p-6 border border-white/5 mt-8 card-3d">
                                        <i class="fas fa-message text-3xl text-secondary mb-4"></i>
                                        <p class="text-xs text-gray-500 uppercase tracking-widest">SMS Speed</p>
                                        <p class="text-2xl font-black text-white mt-1">&lt;2s</p>
                                    </div>
                                    <div class="col-span-2 rounded-2xl p-6 border border-primary/20 card-3d" style="background:linear-gradient(135deg,rgba(0,210,255,0.12),rgba(58,123,213,0.08))">
                                        <div class="flex items-center justify-between mb-2">
                                            <p class="text-[10px] text-primary font-black uppercase tracking-widest">Latest OTP</p>
                                            <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                        </div>
                                        <p class="text-3xl font-mono font-black text-white mt-2 tracking-[0.3em]">4 8 2 9</p>
                                        <p class="text-[10px] text-gray-500 mt-2">+251 *** *** 847 · just now</p>
                                    </div>
                                </div>
                            </div>
                            <div class="absolute -top-4 -right-4 glass-card px-3 py-2 border-green-500/30 badge-3d" style="animation:hero3dFloat 4s ease-in-out infinite;animation-delay:1s">
                                <p class="text-[10px] font-black text-green-400">✓ OTP Received</p>
                            </div>
                            <div class="absolute -bottom-4 -left-4 glass-card px-3 py-2 border-primary/30 badge-3d" style="animation:hero3dFloat 5s ease-in-out infinite;animation-delay:2s">
                                <p class="text-[10px] font-black text-primary">+$0.05 Earned</p>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Services marquee -->
                <section class="relative z-10 py-16 border-y border-white/5 bg-black/20">
                    <motion.div class="max-w-6xl mx-auto px-4 text-center mb-10">
                        <h2 class="text-2xl sm:text-4xl font-black uppercase tracking-tight mb-3">
                            Receive SMS From Over <span class="gradient-text">1000</span> Services
                        </h2>
                        <p class="text-gray-300 text-base sm:text-lg">Verify accounts on the platforms you use every day</p>
                    </motion.div>
                    <motion.div class="logo-marquee-wrap max-w-6xl mx-auto px-2" title="Hover to pause">
                        <motion.div class="logo-marquee-track">${this.serviceLogosMarquee()}</motion.div>
                    </motion.div>
                </section>

                <!-- Why temp number -->
                <section id="why" class="relative z-10 py-24 px-4">
                    <motion.div class="max-w-7xl mx-auto">
                        <h2 class="text-3xl sm:text-4xl font-black text-center uppercase tracking-tight mb-4">Why Use A Temporary Phone Number?</h2>
                        <p class="text-center text-gray-300 text-base mb-16 max-w-2xl mx-auto">Privacy, speed, and zero cost — built for modern verification needs</p>
                        <motion.div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${this.whyCard('Privacy & Anonymity', 'Keep your real number hidden from spam, data brokers, and unsolicited calls.', 'user-secret')}
                            ${this.whyCard('Multiple Accounts', 'Create accounts on any platform without buying extra SIM cards.', 'clone')}
                            ${this.whyCard('Zero Cost Always', '100% free service. No paid tiers, no hidden fees, ever.', 'gift')}
                            ${this.whyCard('Earn Rewards', 'Get paid in crypto for every successful SMS you receive.', 'coins')}
                            ${this.whyCard('Global Numbers', 'Numbers from 50+ countries for international verification.', 'globe')}
                            ${this.whyCard('Instant Delivery', 'Codes appear within seconds — no waiting.', 'bolt')}
                        </motion.div>
                    </motion.div>
                </section>

                <!-- How it works -->
                <section id="how-it-works" class="relative z-10 py-24 px-4 bg-black/25 border-y border-white/5">
                    <div class="max-w-6xl mx-auto">
                        <h2 class="text-3xl sm:text-4xl font-black text-center uppercase mb-16">Efficient, Powerful, And <span class="gradient-text">Easy To Use</span></h2>
                        <div class="grid md:grid-cols-3 gap-8">
                            ${[
                                ['01', 'Select Your Service', 'Choose the platform you need to verify.', 'list'],
                                ['02', 'Choose Your Country', 'Pick from global numbers instantly.', 'globe-americas'],
                                ['03', 'Receive SMS & Verify', 'SMS arrives in seconds. Earn rewards.', 'comment-sms']
                            ].map(([n, t, d, ic], i) => `
                                <div class="glass-card p-8 text-center border-white/5 step-card-3d reveal-up delay-${i+1}">
                                    <p class="text-5xl font-black gradient-text mb-4 neon-text">${n}</p>
                                    <div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                                        <i class="fas fa-${ic} text-xl text-primary"></i>
                                    </div>
                                    <h3 class="font-black text-white uppercase text-sm mb-3">${t}</h3>
                                    <p class="text-gray-500 text-sm">${d}</p>
                                </div>
                            `).join('')}
                        </div>
                        <div class="text-center mt-12">
                            <button id="ctaSignupBtn" class="neon-btn px-12 py-4 text-xs uppercase tracking-[0.2em] badge-3d">Get Started</button>
                        </div>
                    </div>
                </section>

                <!-- Why choose us -->
                <section id="features" class="relative z-10 py-24 px-4">
                    <motion.div class="max-w-6xl mx-auto">
                        <h2 class="text-3xl font-black text-center uppercase mb-12">Why Choose <span class="gradient-text">GURUBIT</span></h2>
                        <motion.div class="grid sm:grid-cols-2 gap-4">
                            ${this.chooseCard('Real Non-VoIP Numbers', 'High-quality numbers trusted by major platforms.', 'sim-card')}
                            ${this.chooseCard('Transparent Rewards', 'Clear earnings on every successful verification.', 'chart-line')}
                            ${this.chooseCard('API Access', 'Integrate SMS verification into your own apps.', 'code')}
                            ${this.chooseCard('Auto-Refunds', 'Failed verifications handled fairly.', 'rotate-left')}
                            ${this.chooseCard('Live SMS Feed', 'Watch real-time SMS activity on our platform.', 'tower-broadcast')}
                            ${this.chooseCard('Easy Dashboard', 'Manage numbers, earnings, and withdrawals in one place.', 'gauge-high')}
                        </motion.div>
                    </motion.div>
                </section>

                <!-- Pricing card -->
                <section class="relative z-10 py-20 px-4">
                    <motion.div class="max-w-sm mx-auto">
                        <motion.div class="glass-card p-10 text-center premium-shadow border-primary/20 relative overflow-hidden">
                            <motion.div class="absolute bottom-0 left-0 right-0 h-32 opacity-30" style="background: linear-gradient(180deg, transparent, #3a7bd5);"></motion.div>
                            <p class="text-[10px] font-black text-primary uppercase tracking-widest mb-2">One-Time SMS Verification</p>
                            <p class="text-4xl font-black text-white mb-6">From <span class="gradient-text">$0.00</span></p>
                            <ul class="text-left text-sm text-gray-400 space-y-3 mb-8 relative z-10">
                                <li><i class="fas fa-check text-primary mr-2"></i>Valid for 20 minutes</li>
                                <li><i class="fas fa-check text-primary mr-2"></i>Auto-refunds on failure</li>
                                <li><i class="fas fa-check text-primary mr-2"></i>No monthly fees</li>
                                <li><i class="fas fa-check text-primary mr-2"></i>Earn crypto rewards</li>
                            </ul>
                            <button type="button" class="auth-open-signup neon-btn w-full py-4 text-xs uppercase tracking-widest relative z-10">Get Started</button>
                        </motion.div>
                    </motion.div>
                </section>

                <!-- Final CTA -->
                <section class="relative z-10 py-24 px-4 text-center border-t border-white/5">
                    <h2 class="text-3xl sm:text-4xl font-black uppercase mb-6">Ready To Protect Your Privacy?</h2>
                    <button type="button" class="auth-open-signup px-12 py-4 rounded-xl border border-white/20 text-sm font-black uppercase tracking-widest hover:border-primary hover:text-primary transition-all">Get Started Now</button>
                </section>

                <!-- Footer -->
                <footer class="relative z-10 py-14 border-t border-white/5 bg-black/40 px-4">
                    <motion.div class="max-w-6xl mx-auto grid md:grid-cols-4 gap-10 mb-10">
                        <motion.div>
                            <img src="/assets/logo.svg" alt="" class="w-10 h-10 mb-4">
                            <p class="text-gray-400 text-sm leading-relaxed">Free virtual numbers for SMS verification. Earn while you verify.</p>
                        </motion.div>
                        <motion.div>
                            <p class="stat-label mb-4">Navigation</p>
                            <motion.div class="flex flex-col gap-2 text-sm text-gray-400">
                                <a href="/" class="hover:text-primary">Home</a>
                                <a href="/faq" class="hover:text-primary">FAQ</a>
                                <a href="/live-feed" class="hover:text-primary">Live Feed</a>
                            </motion.div>
                        </motion.div>
                        <motion.div>
                            <p class="stat-label mb-4">Legal</p>
                            <motion.div class="flex flex-col gap-2 text-sm text-gray-400">
                                <a href="/terms" class="hover:text-primary">Terms of Use</a>
                                <a href="/privacy" class="hover:text-primary">Privacy Policy</a>
                                <a href="mailto:contact@gurubit.com" class="hover:text-primary">Contact</a>
                            </motion.div>
                        </motion.div>
                        <motion.div>
                            <p class="stat-label mb-4">Get Started</p>
                            <button id="footerSignupBtn" class="neon-btn w-full py-3 text-[10px] uppercase tracking-widest">Sign Up Free</button>
                        </motion.div>
                    </motion.div>
                    <p class="text-center site-credit mt-6">
                        Powered by <strong>Riyad Al Mamun</strong>
                    </p>
                    <p class="text-center footer-copyright mt-2">© 2026 GURUBIT. All rights reserved.</p>
                </footer>
            </motion.div>
        `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');

        this.attachEventListeners();
        this._initParticles();
        this._initTilt();
    }

    attachEventListeners() {
        const openModal = (mode) => {
            import('./AuthPage.js').then(({ AuthPage }) => {
                const auth = new AuthPage();
                auth.isLoginMode = (mode === 'login');
                auth.isForgotMode = false;
                auth.init();
            });
        };

        const preloadAuth = () => import('./AuthPage.js').catch(() => {});
        document.getElementById('navLoginBtn')?.addEventListener('mouseover', preloadAuth, { once: true });
        document.getElementById('navSignupBtn')?.addEventListener('mouseover', preloadAuth, { once: true });

        window.GURUBIT_THEME.updateButtons();

        document.getElementById('navLoginBtn')?.addEventListener('click', () => openModal('login'));
        document.getElementById('navSignupBtn')?.addEventListener('click', () => openModal('signup'));
        document.getElementById('heroGetStartedBtn')?.addEventListener('click', () => openModal('signup'));
        document.getElementById('ctaSignupBtn')?.addEventListener('click', () => openModal('signup'));
        document.getElementById('footerSignupBtn')?.addEventListener('click', () => openModal('signup'));
        document.querySelectorAll('.auth-open-signup').forEach(el => {
            el.addEventListener('click', () => openModal('signup'));
        });

        if (new URLSearchParams(window.location.search).get('login') === '1') {
            openModal('login');
            window.history.replaceState({}, '', '/');
        }
    }

    _initParticles() {
        const container = document.getElementById('particlesBg');
        if (!container) return;
        const count = 18;
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 4 + 2;
            const left = Math.random() * 100;
            const duration = Math.random() * 15 + 10;
            const delay = Math.random() * 15;
            p.style.cssText = `width:${size}px;height:${size}px;left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s;opacity:${Math.random() * 0.5 + 0.2}`;
            container.appendChild(p);
        }
    }

    _initTilt() {
        // Mouse-move 3D tilt on hero mockup
        const scene = document.querySelector('.landing-3d-scene');
        const mockup = document.querySelector('.hero-3d-mockup');
        if (!scene || !mockup) return;

        scene.addEventListener('mousemove', (e) => {
            const rect = scene.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / (rect.width / 2);
            const dy = (e.clientY - cy) / (rect.height / 2);
            const rotY = -15 + dx * 8;
            const rotX = 5 - dy * 5;
            mockup.style.transform = `perspective(1000px) rotateY(${rotY}deg) rotateX(${rotX}deg)`;
        });

        scene.addEventListener('mouseleave', () => {
            mockup.style.transform = '';
            mockup.style.transition = 'transform 0.8s cubic-bezier(0.23,1,0.32,1)';
            setTimeout(() => { mockup.style.transition = ''; }, 800);
        });

        // Tilt cards on hover
        document.querySelectorAll('.tilt-card, .card-3d').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                card.style.transform = `perspective(600px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(10px)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    init() {
        this.render();
    }
}
