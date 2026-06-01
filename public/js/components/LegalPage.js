/**
 * Legal & FAQ pages — Privacy, Terms, FAQ (reference-style layout)
 */

const BRAND = 'GURUBIT';
const SITE = 'gurubit.com';
const CONTACT = 'contact@gurubit.com';

function legalShell(title, subtitle, bodyHtml) {
    return `
        <div class="min-h-screen text-white legal-page" data-page="legal" style="background: radial-gradient(ellipse at top left, #0a1e3b 0%, #020b18 55%);">
            <div class="fixed inset-0 pointer-events-none overflow-hidden opacity-40">
                <motion.div class="absolute top-10 left-10 w-48 h-48 rounded-full blur-3xl" style="background: radial-gradient(circle, rgba(0,210,255,0.15), transparent);"></div>
                <motion.div class="absolute inset-0" style="background-image: radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.12), transparent); background-size: 80px 80px;"></div>
            </div>
            <nav class="relative z-20 border-b border-white/5 bg-black/30 backdrop-blur-md">
                <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <a href="/" class="flex items-center gap-2">
                        <img src="/assets/logo.svg" alt="${BRAND}" class="w-8 h-8 logo-glow">
                        <span class="font-black text-sm uppercase tracking-widest gradient-text">${BRAND}</span>
                    </a>
                    <div class="flex gap-6 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        <a href="/" class="hover:text-primary">Home</a>
                        <a href="/faq" class="hover:text-primary">FAQ</a>
                        <a href="/privacy" class="hover:text-primary ${subtitle === 'Privacy' ? 'text-primary' : ''}">Privacy</a>
                        <a href="/terms" class="hover:text-primary ${subtitle === 'Terms' ? 'text-primary' : ''}">TOS</a>
                    </div>
                </div>
            </nav>
            <main class="relative z-10 max-w-4xl mx-auto px-4 py-12 pb-20">
                <header class="mb-10 text-center">
                    <p class="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-3">${subtitle}</p>
                    <h1 class="text-3xl sm:text-4xl font-black tracking-tight">
                        <span class="text-primary">${BRAND}</span> ${title}
                    </h1>
                    <p class="text-gray-500 text-sm mt-3">Last modified: June 21, 2021</p>
                </header>
                <article class="legal-content glass-card p-8 sm:p-12 border-white/5 text-gray-300 text-sm leading-relaxed space-y-6">
                    ${bodyHtml}
                </article>
            </main>
            <footer class="relative z-10 border-t border-white/5 py-8 text-center text-[10px] text-gray-600 uppercase tracking-widest">
                © ${new Date().getFullYear()} ${BRAND} · <a href="/privacy" class="hover:text-primary">Privacy</a> · <a href="/terms" class="hover:text-primary">Terms</a>
            </footer>
        </motion.div>
    `.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
}

const privacyBody = `
<p>This privacy policy applies to (i) our website at ${SITE} (the "Site"); and (ii) any of our games, mobile applications, products or services (together our "Services"). By using any of our Services, you confirm that you have read, understood and agree to this privacy policy in its entirety.</p>
<p><strong class="text-primary">Welcome to ${BRAND}!</strong> Thanks for using our products and services. The Services are provided by ${BRAND}, located at 1600 Amphitheatre Parkway, Mountain View, JE 94043, United Kingdom.</p>
<p>When you use ${BRAND} services, you trust us with your information. This Privacy Policy helps you understand what data we collect, why we collect it, and what we do with it. You can manage your information from your <a href="/profile" class="text-primary hover:underline">Profile</a>.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">What personal information do we collect?</h2>
<p>We respect your right to privacy and only process personal information you provide in accordance with applicable privacy laws. When ordering or registering, you may be asked to enter details to help you with your experience. We may process:</p>
<ul class="list-disc pl-6 space-y-2 text-gray-400">
<li>Your name (first and last name)</li>
<li>Your sex</li>
<li>Contact details (email address and/or mobile phone number)</li>
<li>Your birth date</li>
<li>Your screen name and profile picture</li>
</ul>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">When do we collect information?</h2>
<p>We collect information when you enter information on our website or app, including when you register or sign up.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">How do we use your information?</h2>
<p>We may use collected information when you register, make a purchase, sign up for our newsletter, respond to surveys, surf the website, or use certain site features.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">How do we handle unsubscription?</h2>
<p>To unsubscribe from our SMS/Email campaign, reply with STOP, STOPALL, UNSUBSCRIBE, CANCEL or QUIT.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Do we use cookies?</h2>
<p>Yes. Cookies help us remember preferences, keep track of advertisements, and compile aggregate data about site traffic. You can disable cookies in your browser settings; some features may not function properly.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Information security</h2>
<p>We work hard to protect ${BRAND} and our users from unauthorized access, alteration, disclosure or destruction of information. We encrypt many services using SSL, review our collection and storage practices, and restrict access to personal information to employees and contractors who need it.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Third-party disclosure</h2>
<p>We do not sell, trade, or otherwise transfer your Personally Identifiable Information to outside parties without advance notice, except as described in this policy (hosting partners, legal compliance, etc.).</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">COPPA & CAN-SPAM</h2>
<p>We do not specifically market to or collect information from children under 13. We comply with CAN-SPAM requirements for commercial email. You may unsubscribe at any time by emailing us.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Contacting us</h2>
<p>Questions about this privacy policy? Email us at <a href="mailto:${CONTACT}" class="text-primary hover:underline">${CONTACT}</a>.</p>
`;

const termsBody = `
<p>This terms of service applies to (i) our website at ${SITE}; and (ii) any of our products or services. By using our Services, you agree to these terms in their entirety.</p>
<p><strong class="text-primary">Welcome to ${BRAND}!</strong> The Services are provided by ${BRAND}, located at 1600 Amphitheatre Parkway, Mountain View, JE 94043, United Kingdom.</p>
<p>${BRAND}, like any online marketplace, has terms that users must follow. These outline legal responsibilities including account creation, prohibited activities, payment, communication, refunds, user conduct, termination, user content, compliance, third-party services, disclaimers, limitation of liability, indemnification, account security, intellectual property, modification of terms, governing law, and severability.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Account creation</h2>
<p>Users are responsible for creating their own account and must provide accurate, up-to-date information.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Prohibited activities</h2>
<p>Activities that violate the terms of social media platforms or email providers are strictly prohibited on ${BRAND}.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Payment</h2>
<p>${BRAND} pays users on the 5th working day of every month, subject to a minimum payout of 20 euro. Payments under 100 euro incur a 2 euro processing fee; payments of 100 euro or more incur a 5 euro fee.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Refunds, conduct & termination</h2>
<p>Refunds must be handled through our dispute resolution process. Users must conduct themselves professionally. ${BRAND} may terminate accounts that violate these terms.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">User content & compliance</h2>
<p>Users are responsible for content they upload and must comply with applicable laws including anti-spam and data privacy laws.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Disclaimer & liability</h2>
<p>${BRAND} makes no warranties regarding quality or accuracy of products or services. ${BRAND} is not liable for damages from use of the platform. Users agree to indemnify ${BRAND} from claims arising from their use.</p>
<h2 class="text-white font-black uppercase tracking-wider text-base mt-8">Intellectual property & modifications</h2>
<p>All platform content is owned by ${BRAND}. Terms may be modified at any time; users should review the current document before using the platform.</p>
`;

const faqBody = `
<p class="text-center text-gray-400 mb-8">Welcome to the ${BRAND} FAQ! If you can't find what you need, contact our support team at <a href="mailto:${CONTACT}" class="text-primary">${CONTACT}</a>.</p>
${[
    ['How often do you make payments?', 'We make payments on the 5th working day of every month.'],
    ['What is the minimum payout amount?', 'The minimum payout amount is 20 euro.'],
    ['Is there a processing fee for payments?', 'Yes — 2 euro for payments under 100 euro, and 5 euro for payments of 100 euro or more.'],
    ['What payment methods do you offer?', 'We offer PayPal and bank transfer.'],
    ['How long does it take to receive payment?', 'Bank transfers may take up to 5 business days; PayPal is typically instant.'],
    ['Can I change my payment method?', 'Yes — contact our support team to update your payment method.'],
    ['What if I don\'t meet the minimum payout?', 'Earnings roll over to the next payment period.'],
    ['What if I violate payment terms?', 'We may terminate your account without notice and withhold outstanding payments.']
].map(([q, a]) => `
    <details class="group border border-white/5 rounded-xl mb-3 overflow-hidden">
        <summary class="cursor-pointer px-5 py-4 font-bold text-white text-sm flex justify-between items-center hover:bg-white/5">
            ${q}
            <i class="fas fa-chevron-down text-primary text-xs group-open:rotate-180 transition-transform"></i>
        </summary>
        <p class="px-5 pb-4 text-gray-400 text-sm">${a}</p>
    </details>
`).join('')}
`;

export class LegalPage {
    constructor() {
        this.type = 'privacy';
    }

    init() {
        const path = window.location.pathname;
        if (path.includes('terms')) this.type = 'terms';
        else if (path.includes('faq')) this.type = 'faq';
        else this.type = 'privacy';
        this.render();
    }

    render() {
        const map = {
            privacy: ['Privacy Policy', 'Privacy', privacyBody],
            terms: ['Terms Of Service', 'Terms', termsBody],
            faq: ['Frequently Asked Questions', 'FAQ', faqBody]
        };
        const [title, subtitle, body] = map[this.type];
        document.getElementById('app-skeleton')?.remove();
        document.getElementById('app').innerHTML = legalShell(title, subtitle, body);
    }
}
