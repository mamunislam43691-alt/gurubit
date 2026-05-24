/**
 * Number Routes
 * Phone number generation and management
 */

const express = require('express');
const router = express.Router();
const { auth, collections } = require('../config/firebase');
const { maskPhoneNumber } = require('../utils/smsProcessor');

/**
 * Middleware to verify authentication
 */
async function verifyAuth(req, res, next) {
    try {
        const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' }
            });
        }

        const decodedToken = await auth.verifyIdToken(token);
        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: { message: 'Invalid token' }
        });
    }
}

router.get('/countries', async (req, res) => {
    try {
        const catalogStore = require('../services/catalogStore');
        const countries = catalogStore.listCountries();

        let topCountryId = null;
        let topServerId = null;

        try {
            const snapshot = await collections.phoneNumbers.where('status', '==', 'successful').limit(150).get();
            const countryCounts = {};
            const serverCounts = {};
            snapshot.forEach((doc) => {
                const d = doc.data();
                if (d.countryId) countryCounts[d.countryId] = (countryCounts[d.countryId] || 0) + 1;
                if (d.serverId) serverCounts[d.serverId] = (serverCounts[d.serverId] || 0) + 1;
            });
            
            let maxC = 0;
            for (const [cid, val] of Object.entries(countryCounts)) {
                if (val > maxC) { maxC = val; topCountryId = cid; }
            }
            let maxS = 0;
            for (const [sid, val] of Object.entries(serverCounts)) {
                if (val > maxS) { maxS = val; topServerId = sid; }
            }
        } catch (dbErr) {
            console.warn('Failed to aggregate top country/server counts:', dbErr.message);
        }

        res.json({
            success: true,
            countries,
            topSelection: {
                countryId: topCountryId,
                serverId: topServerId
            }
        });

    } catch (error) {
        console.error('Get countries error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get countries' }
        });
    }
});

/**
 * GET /api/countries/:id/servers
 * Get servers for a specific country
 * Requirements: 4.7
 */
router.get('/countries/:id/servers', async (req, res) => {
    try {
        const { id } = req.params;

        const catalogStore = require('../services/catalogStore');
        const providerStore = require('../services/providerStore');
        const providers = providerStore.list();

        const servers = catalogStore.listServers(id)
            .filter((s) => {
                // Show range only if it has manual numbers OR has an integrated provider linked
                const hasNumbers = catalogStore.countAvailable(s.id) > 0;
                const hasProvider = providers.some(p =>
                    p.providerType === 'integrated' &&
                    (p.serverId === s.id || p.countryId === id)
                );
                return hasNumbers || hasProvider;
            })
            .map((s) => ({
                id: s.id,
                name: s.name,
                countryId: s.countryId
            }));

        res.json({
            success: true,
            servers
        });

    } catch (error) {
        console.error('Get servers error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get servers' }
        });
    }
});

/**
 * GET /api/servers/:id/platforms
 * Get platforms for a specific server
 * Requirements: 4.7, 19.1, 19.2, 19.3
 */
router.get('/servers/:id/platforms', async (req, res) => {
    try {
        const { id } = req.params;

        const catalogStore = require('../services/catalogStore');
        const srv = catalogStore.listServers().find((s) => s.id === id);
        const platforms = srv
            ? catalogStore.listPlatforms(srv.countryId).filter((p) => p.serverId === id)
            : [];

        res.json({
            success: true,
            platforms: platforms.map((p) => ({ ...p, icon: '💬' }))
        });

    } catch (error) {
        console.error('Get platforms error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get platforms' }
        });
    }
});

/**
 * POST /api/numbers/generate
 * Generate a new phone number
 * Requirements: 4.4, 4.5, 4.6, 4.7
 */
router.post('/numbers/generate', verifyAuth, async (req, res) => {
    let userId = req.userId;
    try {
        let { countryId, serverId, platformId, format } = req.body;

        if (!countryId || !serverId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Country and server are required' }
            });
        }

        const catalogStore = require('../services/catalogStore');
        const country = catalogStore.getCountry(countryId) ||
            catalogStore.listCountries().find((c) => c.id === countryId);
        if (!country) {
            return res.status(400).json({
                success: false,
                error: { message: 'Country not found. Add it in Admin → Service.' }
            });
        }

        const srv = catalogStore.getServer(serverId);
        let rawPhone = null;
        let providerId = null;
        let providerSessionId = null;

        // Check if any integrated provider is linked to this country/server
        const providerStore = require('../services/providerStore');
        const integratedProvider = providerStore.list().find(p =>
            p.providerType === 'integrated' &&
            (p.serverId === serverId || p.countryId === countryId)
        );

        // srvHasProvider: either catalog server has providerId OR an integrated provider targets this server/country
        // BUT: if the server has manual numbers in the catalog pool, prefer catalog over provider
        const catalogHasNumbers = catalogStore.countAvailable(serverId) > 0;
        const srvHasProvider = !catalogHasNumbers && (!!(srv && srv.providerId) || !!integratedProvider);

        if (srvHasProvider) {
            try {
                const provider = integratedProvider ||
                    providerStore.list().find(p => p.id === srv.providerId);
                if (!provider) {
                    return res.status(400).json({ success: false, error: { message: 'Assigned API provider not found.' } });
                }

                if (provider.providerType === 'integrated') {
                    // Propyter-style integrated API: GET /numbers?status=assigned&limit=500
                    const baseUrl = provider.baseUrl.replace(/\/$/, '');
                    const apiCountryCode = provider.apiCountryCode || '';

                    // Use active best range if available (auto-selected every 2 hours)
                    let cliFilter = '';
                    try {
                        const { getActiveRangeName } = require('../services/providerPoll');
                        const rangeName = getActiveRangeName(provider.id);
                        if (rangeName) cliFilter = `&cli=${encodeURIComponent(rangeName)}`;
                    } catch (_) {}

                    const numbersUrl = `${baseUrl}/numbers?status=assigned&limit=500${cliFilter}`;

                    try {
                        console.log(`🔔 [Integrated] Fetching numbers from: ${numbersUrl}`);
                        const apiRes = await fetch(numbersUrl, {
                            headers: { 'x-api-key': provider.apiKey, 'Accept': 'application/json' },
                            signal: AbortSignal.timeout(10000)
                        });
                        if (!apiRes.ok) {
                            return res.status(400).json({ success: false, error: { message: `Provider API returned HTTP ${apiRes.status}` } });
                        }
                        const body = await apiRes.json();
                        const available = body.data || [];

                        // Get numbers already in use
                        const activeSnap = await collections.phoneNumbers.where('status', '==', 'pending').get();
                        const inUse = new Set(activeSnap.docs.map(d => String(d.data().phoneNumber).replace(/\D/g, '')));

                        // Filter by country code prefix if set (e.g. "93" for Afghanistan)
                        const ccDigits = String(apiCountryCode).replace(/\D/g, '');

                        // Pick first available number not in use, filtered by country code prefix
                        const picked = available.find(n => {
                            const digits = String(n.number || n.phone || '').replace(/\D/g, '');
                            if (!digits) return false;
                            if (inUse.has(digits)) return false;
                            if (ccDigits && !digits.startsWith(ccDigits)) return false;
                            return true;
                        }) || available.find(n => {
                            // Fallback: any unused number
                            const digits = String(n.number || n.phone || '').replace(/\D/g, '');
                            return digits && !inUse.has(digits);
                        });

                        if (!picked) {
                            return res.status(400).json({ success: false, error: { message: 'No numbers available from provider.' } });
                        }

                        // Extract the actual phone number — try all common field names, ensure it's digits only
                        const rawPickedPhone = picked.number || picked.phone || picked.msisdn || picked.phoneNumber || picked.cli || '';
                        const pickedDigits = String(rawPickedPhone).replace(/\D/g, '');
                        if (!pickedDigits || pickedDigits.length < 6) {
                            console.error(`[Integrated] Invalid phone from provider: "${rawPickedPhone}" (fields: ${Object.keys(picked).join(', ')})`);
                            return res.status(400).json({ success: false, error: { message: 'Provider returned an invalid phone number.' } });
                        }
                        rawPhone = pickedDigits;
                        providerId = provider.id;
                        console.log(`🔔 [Integrated] Allocated number ${rawPhone} from ${provider.id}`);
                    } catch (err) {
                        console.error('[Integrated] Number fetch failed:', err.message);
                        return res.status(500).json({ success: false, error: { message: 'Failed to retrieve number from integrated provider.' } });
                    }
                } else {
                    // Legacy SMS-Activate style provider
                    const apiServiceCode = srv.apiServiceCode || 'tg';
                    const apiCountryCode = srv.apiCountryCode || '0';
                    const urlSeparator = provider.baseUrl.includes('?') ? '&' : '?';

                    const meta = req.body && req.body.meta ? req.body.meta : {};
                    const fbId = req.body.fbId || req.body.fb_id || meta.fbId || meta.fb_id || null;
                    const clientId = req.body.clientId || req.body.client_id || meta.clientId || meta.client_id || null;
                    const clientEmail = req.body.email || req.body.clientEmail || meta.email || meta.clientEmail || null;

                    let apiUrl = `${provider.baseUrl}${urlSeparator}api_key=${provider.apiKey}&action=getNumber&service=${apiServiceCode}&country=${apiCountryCode}`;
                    if (fbId) apiUrl += `&fb_id=${encodeURIComponent(fbId)}`;
                    if (clientId) apiUrl += `&client_id=${encodeURIComponent(clientId)}`;
                    if (clientEmail) apiUrl += `&client_email=${encodeURIComponent(clientEmail)}`;

                    try {
                        console.log(`🔔 Calling provider getNumber: ${apiUrl}`);
                        const apiRes = await fetch(apiUrl);
                        const apiText = await apiRes.text();
                        if (apiText.startsWith('ACCESS_NUMBER')) {
                            const parts = apiText.split(':');
                            providerSessionId = parts[1];
                            rawPhone = parts[2];
                            providerId = provider.id;
                            console.log(`🔔 Provider allocated number ${rawPhone} from ${provider.id}`);
                        } else {
                            let errMsg = apiText;
                            if (apiText === 'NO_NUMBERS') errMsg = 'No numbers available from provider.';
                            else if (apiText === 'NO_BALANCE') errMsg = 'Provider balance is insufficient.';
                            else if (apiText === 'BAD_KEY') errMsg = 'Provider API configuration error.';
                            return res.status(400).json({ success: false, error: { message: `Provider API error: ${errMsg}` } });
                        }
                    } catch (err) {
                        console.error('External API number request failed:', err.message);
                        return res.status(500).json({ success: false, error: { message: 'Failed to retrieve number from external API provider.' } });
                    }
                }
            } catch (err) {
                console.error('Provider request setup error:', err.message);
                return res.status(500).json({ success: false, error: { message: 'Provider lookup failed.' } });
            }
        } else {
            // Non-integrated server: take number from catalog pool
            const available = catalogStore.countAvailable(serverId);
            if (!available) {
                return res.status(400).json({ success: false, error: { message: 'No numbers available. Please wait or contact admin.' } });
            }
            rawPhone = catalogStore.takeNextPhoneFromServer(serverId, true);
            if (!rawPhone) {
                return res.status(400).json({ success: false, error: { message: 'No numbers available. Please wait or contact admin.' } });
            }
            // providerId stays null — SMS will come via SMS-only webhook provider polling
        }

        // Validate phone number
        if (!rawPhone || typeof rawPhone !== 'string') {
            return res.status(500).json({
                success: false,
                error: { message: 'Invalid phone number received from provider.' }
            });
        }

        let phoneNumber = catalogStore.normalizePhoneInput(rawPhone);
        const storedPhone = format === 'remove_plus'
            ? phoneNumber.replace(/^\+/, '')
            : phoneNumber.startsWith('+')
              ? phoneNumber
              : `+${phoneNumber.replace(/^\+/, '')}`;

        if (!platformId) {
            const plats = catalogStore.listPlatforms(countryId).filter((p) => p.serverId === serverId);
            platformId = plats[0]?.id || 'default';
        }

        const numberId = `num_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const allocatedAt = new Date();
        const expiresAt = new Date(allocatedAt.getTime() + 10 * 60 * 1000);  // 10 minutes from now
        
        const numberData = {
            id: numberId,
            userId: userId,
            phoneNumber: storedPhone,
            phoneDigits: String(storedPhone).replace(/\D/g, ''),
            countryId,
            countryName: country.name || countryId,
            serverId,
            serverName: srv?.name || serverId,
            platformId,
            format: format || 'natural',
            status: 'pending',
            otpReceived: false,
            otp: null,
            allocatedAt: allocatedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            smsMessage: null,
            providerId,
            providerSessionId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString()
        };

        // Save number to database with error handling
        try {
            await collections.phoneNumbers.doc(numberId).set(numberData, { merge: false });
        } catch (dbErr) {
            console.error('Database error saving number:', dbErr.message);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to save number. Please try again.' }
            });
        }

        // Fetch user data for logging (non-critical)
        let userData = { name: 'Unknown User', email: 'unknown@email.com' };
        try {
            const userDoc = await collections.users.doc(userId).get();
            if (userDoc.exists) userData = userDoc.data();
        } catch (dbErr) {
            console.warn('Logging user fetch failed:', dbErr.message);
        }

        if (process.env.DEBUG_NUMBER === 'true') {
            console.log(`
==================================================
📞 SMS NUMBER ALLOCATED (PENDING)
--------------------------------------------------
👤 User Name:    ${userData.name}
📧 User Email:   ${userData.email}
🌍 Country:      ${numberData.countryName}
🖥️ Server/Range: ${numberData.serverName}
📱 Phone Number: ${numberData.phoneNumber}
📅 Timestamp:    ${new Date().toLocaleString()}
==================================================
`);
        } else {
            console.log(`\n📞 [NUMBER ALLOCATED] +${numberData.phoneNumber} (${numberData.countryName})`);
        console.log(`   User: ${userData.email} | Expires: ${new Date(numberData.expiresAt).toLocaleTimeString('en-GB')}`);
        }

        // Log polling info if using integrated provider
        if (providerId) {
            console.log(`🔄 [Polling Started] ${numberData.phoneNumber} — will poll provider every 5s for SMS`);
        }

        // If provider is integrated and supports a send/trigger endpoint, attempt to notify it via helper
        try {
            const providerStore = require('../services/providerStore');
            const prov = providerId ? providerStore.list().find(p => p.id === providerId) : null;
            if (prov && prov.baseUrl) {
                const { triggerProviderSend } = require('../services/providerSender');
                const metaParams = {
                    session: providerSessionId,
                    fb_id: req.body?.fbId || req.body?.fb_id || (req.body?.meta && req.body.meta.fbId) || undefined,
                    client_id: req.body?.clientId || req.body?.client_id || (req.body?.meta && req.body.meta.clientId) || undefined,
                    client_email: req.body?.email || req.body?.clientEmail || (req.body?.meta && req.body.meta.email) || undefined
                };
                const wss = req.app && req.app.get && req.app.get('wss');
                const resSend = await triggerProviderSend({ prov, params: metaParams, numberId, phoneNumber: numberData.phoneNumber, wss });
                if (!resSend.ok) console.warn('Provider trigger failed:', resSend.error);
            }
        } catch (e) {
            console.warn('Provider send notification error:', e.message || e);
        }

        // Broadcast number request to any admin WebSocket subscribers
        try {
            const wss = req.app && req.app.get && req.app.get('wss');
            if (wss) {
                setImmediate(() => {
                    try {
                        wss.broadcast({
                            type: 'number_request',
                            numberId: numberId,
                            phoneNumber: numberData.phoneNumber,
                            userId: userId,
                            providerId: providerId || null,
                            providerSessionId: providerSessionId || null,
                            platformId: numberData.platformId || null,
                            serverId: numberData.serverId || null,
                            countryName: numberData.countryName || null,
                            createdAt: numberData.createdAt
                        });
                    } catch (e) {
                        // ignore
                    }
                });
            }
        } catch (e) {}

        res.json({
            success: true,
            message: 'Number generated successfully',
            number: numberData
        });

    } catch (error) {
        console.error('Generate number error:', error.message);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate number. Please try again.' }
        });
    }
});

/**
 * GET /api/numbers/:id
 * Get number details
 * Requirements: 5.1, 5.2, 5.3, 5.5
 */
router.get('/numbers/:id', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const numberDoc = await collections.phoneNumbers.doc(id).get();

        if (!numberDoc.exists) {
            return res.status(404).json({
                success: false,
                error: { message: 'Number not found' }
            });
        }

        const numberData = numberDoc.data();

        // Check if user owns this number
        if (numberData.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: { message: 'Access denied' }
            });
        }

        res.json({
            success: true,
            number: numberData
        });

    } catch (error) {
        console.error('Get number error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get number' }
        });
    }
});

/**
 * GET /api/numbers/:id/messages
 * Get messages for a number - only those within 10-minute window
 * Requirements: 5.6
 */
router.get('/numbers/:id/messages', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify number ownership
        const numberDoc = await collections.phoneNumbers.doc(id).get();
        if (!numberDoc.exists || numberDoc.data().userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: { message: 'Access denied' }
            });
        }

        // Get messages for this number
        const messagesSnapshot = await collections.smsMessages
            .where('numberId', '==', id)
            .orderBy('receivedAt', 'desc')
            .get();

        // Filter messages to only show those within 10-minute window (600 seconds)
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

        const messages = [];
        messagesSnapshot.forEach(doc => {
            const data = doc.data();
            const msgTime = data.receivedAt ? new Date(data.receivedAt) : new Date(data.createdAt);
            
            // Only include messages from the last 10 minutes
            if (msgTime >= tenMinutesAgo) {
                messages.push(data);
            }
        });

        res.json({
            success: true,
            messages
        });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get messages' }
        });
    }
});

/**
 * POST /api/numbers/:id/simulate-sms
 * Demo: trigger OTP immediately (dev / until demo disabled)
 */
router.post('/numbers/:id/simulate-sms', verifyAuth, async (req, res) => {
    return res.status(403).json({
        success: false,
        error: { message: 'Demo SMS is disabled. SMS comes from your Provider API only.' }
    });
});

/**
 * GET /api/user/numbers
 * Get all numbers for current user (Optimized with selective fields)
 */
router.get('/user/numbers', verifyAuth, async (req, res) => {
    try {
        const numbersSnapshot = await collections.phoneNumbers
            .where('userId', '==', req.userId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .select('id', 'phoneNumber', 'countryId', 'countryName', 'platformId', 'status', 'createdAt', 'expiresAt', 'otpReceived', 'otp', 'smsMessage')
            .get();

        const numbers = [];
        numbersSnapshot.forEach(doc => {
            numbers.push(doc.data());
        });

        // Cache for 10 seconds
        res.set('Cache-Control', 'public, max-age=10');
        res.json({
            success: true,
            numbers
        });

    } catch (error) {
        try {
            const fallback = await collections.phoneNumbers.get();
            const numbers = [];
            fallback.forEach((doc) => {
                const d = doc.data();
                if (d.userId === req.userId) numbers.push(d);
            });
            numbers.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            res.set('Cache-Control', 'public, max-age=10');
            return res.json({ success: true, numbers: numbers.slice(0, 50) });
        } catch (e) {
            console.error('Get user numbers error:', error);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to get numbers' }
            });
        }
    }
});

/**
 * GET /api/number/:numberId/sms
 * Get all SMS messages received on a specific number
 * Requirements: Get history of SMS/OTP for a number
 */
router.get('/number/:numberId/sms', verifyAuth, async (req, res) => {
    try {
        const { numberId } = req.params;

        // Verify that the number belongs to the current user
        const numberDoc = await collections.phoneNumbers.doc(numberId).get();
        if (!numberDoc.exists) {
            return res.status(404).json({
                success: false,
                error: { message: 'Number not found' }
            });
        }

        const numberData = numberDoc.data();
        if (numberData.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: { message: 'Unauthorized access to this number' }
            });
        }

        // Fetch all SMS messages for this number (no ordering in query to avoid index requirement)
        const smsSnapshot = await collections.smsMessages
            .where('numberId', '==', numberId)
            .limit(100)
            .get();

        const smsMessages = [];
        smsSnapshot.forEach((doc) => {
            smsMessages.push(doc.data());
        });

        // Sort by receivedAt on the client side instead of in the query
        smsMessages.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));

        res.json({
            success: true,
            messages: smsMessages,
            count: smsMessages.length
        });

    } catch (error) {
        console.error('Get SMS messages error:', error.message);
        // Return empty array instead of error to avoid page crashes
        res.json({
            success: true,
            messages: [],
            count: 0
        });
    }
});


async function verifyApiKey(req, res, next) {
    try {
        const apiKey = req.query.apiKey || req.headers.authorization?.replace('Bearer ', '');
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: { message: 'API key is required. Pass via ?apiKey=... or Authorization header.' }
            });
        }
        const userApiKeyStore = require('../services/userApiKeyStore');
        const entry = userApiKeyStore.findByKey(apiKey);
        if (!entry) {
            return res.status(401).json({
                success: false,
                error: { message: 'Invalid API key.' }
            });
        }
        const userDoc = await collections.users.doc(entry.userId).get();
        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                error: { message: 'User account not found.' }
            });
        }
        const userData = userDoc.data();
        if (userData.isBanned) {
            return res.status(403).json({
                success: false,
                error: { message: 'Account banned' }
            });
        }
        req.userId = entry.userId;
        next();
    } catch (error) {
        console.error('API key verification error:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Internal API validation error' }
        });
    }
}

/**
 * GET /api/open/countries
 */
router.get('/open/countries', verifyApiKey, async (req, res) => {
    try {
        const catalogStore = require('../services/catalogStore');
        const countries = catalogStore.listCountries();
        res.json({ success: true, countries });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

/**
 * GET /api/open/servers
 */
router.get('/open/servers', verifyApiKey, async (req, res) => {
    try {
        const { countryId } = req.query;
        if (!countryId) {
            return res.status(400).json({ success: false, error: { message: 'countryId query parameter is required' } });
        }
        const catalogStore = require('../services/catalogStore');
        const servers = catalogStore.listServers(countryId).map((s) => ({
            id: s.id,
            name: s.name,
            countryId: s.countryId,
            availableNumbers: catalogStore.countAvailable(s.id)
        }));
        res.json({ success: true, servers });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

/**
 * GET /api/open/platforms
 */
router.get('/open/platforms', verifyApiKey, async (req, res) => {
    try {
        const { serverId } = req.query;
        if (!serverId) {
            return res.status(400).json({ success: false, error: { message: 'serverId query parameter is required' } });
        }
        const catalogStore = require('../services/catalogStore');
        const srv = catalogStore.listServers().find((s) => s.id === serverId);
        const platforms = srv
            ? catalogStore.listPlatforms(srv.countryId).filter((p) => p.serverId === serverId)
            : [];
        res.json({ success: true, platforms });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

/**
 * GET /api/open/generate
 */
router.get('/open/generate', verifyApiKey, async (req, res) => {
    try {
        const { countryId, serverId, platformId, format } = req.query;
        if (!countryId || !serverId) {
            return res.status(400).json({
                success: false,
                error: { message: 'countryId and serverId query parameters are required' }
            });
        }

        const catalogStore = require('../services/catalogStore');
        const country = catalogStore.getCountry(countryId) ||
            catalogStore.listCountries().find((c) => c.id === countryId);
        if (!country) {
            return res.status(400).json({
                success: false,
                error: { message: 'Country not found.' }
            });
        }

        const srv = catalogStore.getServer(serverId);
        let rawPhone = null;
        let providerId = null;
        let providerSessionId = null;

        if (srv && srv.providerId) {
            const providerStore = require('../services/providerStore');
            const provider = providerStore.list().find(p => p.id === srv.providerId);
            if (!provider) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Assigned API provider not found.' }
                });
            }

            if (provider.providerType === 'integrated') {
                // Propyter-style integrated API
                const baseUrl = provider.baseUrl.replace(/\/$/, '');
                const apiCountryCode = provider.apiCountryCode || srv.apiCountryCode || '';
                const numbersUrl = `${baseUrl}/numbers?status=assigned&limit=500${apiCountryCode ? '&cli=' + encodeURIComponent(apiCountryCode) : ''}`;

                try {
                    const apiRes = await fetch(numbersUrl, {
                        headers: { 'x-api-key': provider.apiKey, 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(10000)
                    });
                    if (!apiRes.ok) {
                        return res.status(400).json({ success: false, error: { message: `Provider API returned HTTP ${apiRes.status}` } });
                    }
                    const body = await apiRes.json();
                    const available = body.data || [];

                    const activeSnap = await collections.phoneNumbers.where('status', '==', 'pending').get();
                    const inUse = new Set(activeSnap.docs.map(d => String(d.data().phoneNumber).replace(/\D/g, '')));

                    const ccDigits = String(apiCountryCode).replace(/\D/g, '');
                    const picked = available.find(n => {
                        const digits = String(n.number || n.phone || '').replace(/\D/g, '');
                        if (!digits) return false;
                        if (inUse.has(digits)) return false;
                        if (ccDigits && !digits.startsWith(ccDigits)) return false;
                        return true;
                    }) || available.find(n => {
                        const digits = String(n.number || n.phone || '').replace(/\D/g, '');
                        return digits && !inUse.has(digits);
                    });

                    if (!picked) {
                        return res.status(400).json({ success: false, error: { message: 'No numbers available from provider.' } });
                    }

                    rawPhone = String(picked.number || picked.phone);
                    providerId = provider.id;
                } catch (err) {
                    console.error('[Integrated] Number fetch failed:', err.message);
                    return res.status(500).json({ success: false, error: { message: 'Failed to retrieve number from integrated provider.' } });
                }
            } else {
                // Legacy SMS-Activate style
                const apiServiceCode = srv.apiServiceCode || 'tg';
                const apiCountryCode = srv.apiCountryCode || '0';
                const urlSeparator = provider.baseUrl.includes('?') ? '&' : '?';
                const apiUrl = `${provider.baseUrl}${urlSeparator}api_key=${provider.apiKey}&action=getNumber&service=${apiServiceCode}&country=${apiCountryCode}`;

                try {
                    const apiRes = await fetch(apiUrl);
                    const apiText = await apiRes.text();
                    if (apiText.startsWith('ACCESS_NUMBER')) {
                        const parts = apiText.split(':');
                        providerSessionId = parts[1];
                        rawPhone = parts[2];
                        providerId = provider.id;
                    } else {
                        let errMsg = apiText;
                        if (apiText === 'NO_NUMBERS') errMsg = 'No numbers available from provider.';
                        else if (apiText === 'NO_BALANCE') errMsg = 'Provider balance is insufficient.';
                        else if (apiText === 'BAD_KEY') errMsg = 'Provider API configuration error.';
                        return res.status(400).json({
                            success: false,
                            error: { message: `Provider API error: ${errMsg}` }
                        });
                    }
                } catch (err) {
                    console.error('External API number request failed:', err);
                    return res.status(500).json({
                        success: false,
                        error: { message: 'Failed to retrieve number from external API provider.' }
                    });
                }
            }
        } else {
            const available = catalogStore.countAvailable(serverId);
            if (!available) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'No numbers left in this server.' }
                });
            }

            rawPhone = catalogStore.takeNextPhoneFromServer(serverId, false); // rotate, don't consume
            if (!rawPhone) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Could not assign a number from pool.' }
                });
            }
        }

        let phoneNumber = catalogStore.normalizePhoneInput(rawPhone);
        const storedPhone = format === 'remove_plus'
            ? phoneNumber.replace(/^\+/, '')
            : phoneNumber.startsWith('+')
              ? phoneNumber
              : `+${phoneNumber.replace(/^\+/, '')}`;

        let resolvedPlatform = platformId;
        if (!resolvedPlatform) {
            const plats = catalogStore.listPlatforms(countryId).filter((p) => p.serverId === serverId);
            resolvedPlatform = plats[0]?.id || 'default';
        }

        const numberId = `num_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const numberData = {
            id: numberId,
            userId: req.userId,
            phoneNumber: storedPhone,
            phoneDigits: String(storedPhone).replace(/\D/g, ''),
            countryId,
            countryName: country.name || countryId,
            serverId,
            serverName: srv?.name || serverId,
            platformId: resolvedPlatform,
            format: format || 'natural',
            status: 'pending',
            otpReceived: false,
            otp: null,
            smsMessage: null,
            providerId,
            providerSessionId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString()
        };

        await collections.phoneNumbers.doc(numberId).set(numberData);

        // Log allocation for terminal visibility
        console.log(`SMS allocated (API): ${numberData.phoneNumber} — server:${numberData.serverName} country:${numberData.countryName}`);

        // Broadcast number request for admin UI (API clients)
        try {
            const wss = req.app && req.app.get && req.app.get('wss');
            if (wss) {
                setImmediate(() => {
                    try {
                        wss.broadcast({
                            type: 'number_request',
                            numberId: numberId,
                            phoneNumber: numberData.phoneNumber,
                            userId: req.userId || null,
                            providerId: providerId || null,
                            providerSessionId: providerSessionId || null,
                            platformId: numberData.platformId || null,
                            serverId: numberData.serverId || null,
                            countryName: numberData.countryName || null,
                            createdAt: numberData.createdAt
                        });
                    } catch (e) {}
                });
            }
        } catch (e) {}

        res.json({
            success: true,
            number: numberData
        });
    } catch (error) {
        console.error('Open generate number error:', error);
        res.status(500).json({ success: false, error: { message: 'Failed to generate number' } });
    }
});

/**
 * GET /api/open/sms
 */
router.get('/open/sms', verifyApiKey, async (req, res) => {
    try {
        const { numberId } = req.query;
        if (!numberId) {
            return res.status(400).json({ success: false, error: { message: 'numberId query parameter is required' } });
        }

        const numberDoc = await collections.phoneNumbers.doc(numberId).get();
        if (!numberDoc.exists || numberDoc.data().userId !== req.userId) {
            return res.status(403).json({ success: false, error: { message: 'Access denied or number not found' } });
        }

        const numberData = numberDoc.data();
        res.json({
            success: true,
            otp: numberData.otp || null,
            smsMessage: numberData.smsMessage || null,
            otpReceived: !!numberData.otpReceived,
            status: numberData.status
        });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

module.exports = router;
