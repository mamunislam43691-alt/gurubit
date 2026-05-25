/**
 * SMS Processing Utility
 * Handles OTP extraction and real-time distribution
 */

const { db, collections } = require('../config/firebase');

function digitsOnly(phone) {
    return String(phone || '').replace(/\D/g, '');
}

/**
 * Process an incoming SMS message - OPTIMIZED FOR SPEED
 * @param {Object} smsData - Incoming SMS data (phoneNumber, content)
 * @param {Object} wss - WebSocket server for broadcasting
 */
async function processIncomingSMS(smsData, wss) {
    const processStartTime = Date.now();

    try {
        const { id: sourceId, phoneNumber, content, otp: passedOtp, receivedAt: passedReceivedAt, platform: passedPlatform } = smsData;

        // Validate inputs
        if (!phoneNumber || !content) {
            console.warn('Invalid SMS data');
            return null;
        }

        const targetDigits = digitsOnly(phoneNumber);

        if (!targetDigits || targetDigits.length < 6) {
            console.warn(`Invalid phone: ${phoneNumber}`);
            return null;
        }

        // Query pending numbers
        let snapshot;
        try {
            snapshot = await collections.phoneNumbers
                .where('status', '==', 'pending')
                .get();
        } catch (queryErr) {
            console.error('DB query error:', queryErr.message);
            return null;
        }

        let activeDoc = null;

        // EXACT MATCH ONLY — with expiration check
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const stored = data.phoneDigits || digitsOnly(data.phoneNumber);
            const isExpired = data.expiresAt && new Date(data.expiresAt) < new Date();

            if (isExpired) continue;
            if (stored === targetDigits) {
                activeDoc = doc;
                break;
            }
        }

        if (!activeDoc) return null;

        const numberDoc = activeDoc;
        const numberData = numberDoc.data();
        const userId = numberData.userId;

        // Extract OTP
        const otpMatch = content.replace(/\s+/g, '').match(/\d{4,8}/);
        const otp = passedOtp || (otpMatch ? otpMatch[0] : null);

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const receivedAt = passedReceivedAt || new Date().toISOString();
        const platformName = passedPlatform || numberData.platformName || 'Verification';
        const timeStr = new Date(receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        console.log(`\n✅ [OTP MATCHED] +${phoneNumber} → User: ${userId.slice(0, 20)}...`);
        console.log(`   OTP: ${otp || '—'} | ${platformName} | ${timeStr}`);

        // Run updates in parallel
        const promises = [];

        // Update 1: Save SMS message
        promises.push(
            collections.smsMessages.doc(messageId).set({
                id: messageId,
                numberId: numberDoc.id,
                userId: userId,
                phoneNumber: phoneNumber,
                content: content,
                otp: otp,
                platformName: platformName,
                receivedAt: receivedAt,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            }).catch(err => console.error('SMS save error:', err.message))
        );

        // Update 2: Mark number as successful — OTP received, session complete
        promises.push(
            collections.phoneNumbers.doc(numberDoc.id).update({
                otp: otp,
                otpCode: otp,
                smsMessage: content,
                otpReceived: true,
                lastOtpReceivedAt: new Date().toISOString(),
                status: 'successful',
                updatedAt: new Date().toISOString()
            }).catch(err => console.error('Number update error:', err.message))
        );

        // Update 3: Update user earnings using costStore rates (non-critical)
        promises.push((async () => {
            try {
                // Get reward rates from costStore
                const costStore = require('../services/costStore');
                const catalogStore = require('../services/catalogStore');

                // Find which country/server this number belongs to
                const digits = String(phoneNumber).replace(/\D/g, '');
                let countryId = null, serverId = null;
                const allCountries = catalogStore.listCountries();
                for (const country of allCountries) {
                    const servers = catalogStore.listServers(country.id);
                    for (const server of servers) {
                        const nums = server.numbers || [];
                        if (nums.some(n => String(n).replace(/\D/g, '') === digits)) {
                            countryId = country.id;
                            serverId = server.id;
                            break;
                        }
                    }
                    if (countryId) break;
                }

                const cost = await costStore.getCost(countryId, serverId);
                const userReward = parseFloat(cost.userReward) || 0.05;
                const agentReward = parseFloat(cost.agentReward) || 0.02;

                // Update user balance
                const userDoc = await collections.users.doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    await collections.users.doc(userId).update({
                        earningsBalance: (userData.earningsBalance || 0) + userReward,
                        totalOtps: (userData.totalOtps || 0) + 1,
                        updatedAt: new Date().toISOString()
                    });

                    // Also reward the agent who referred this user
                    const agentEmail = userData.agentEmail || userData.referralEmail;
                    if (agentEmail && agentReward > 0) {
                        try {
                            const usersSnap = await collections.users.get();
                            let agentDoc = null;
                            usersSnap.forEach(doc => {
                                const d = doc.data();
                                if (d.isAgent && d.email?.toLowerCase() === agentEmail.toLowerCase()) {
                                    agentDoc = doc;
                                }
                            });
                            if (agentDoc) {
                                const agentData = agentDoc.data();
                                await collections.users.doc(agentDoc.id).update({
                                    earningsBalance: (agentData.earningsBalance || 0) + agentReward,
                                    totalOtps: (agentData.totalOtps || 0) + 1,
                                    updatedAt: new Date().toISOString()
                                });
                                if (process.env.DEBUG_SMS === 'true') {
                                    console.log(`   Agent reward: +$${agentReward} → ${agentEmail}`);
                                }
                            }
                        } catch (agentErr) {
                            if (process.env.DEBUG_SMS === 'true') {
                                console.warn('Agent reward error:', agentErr.message);
                            }
                        }
                    }
                }

                // Store reward amounts for broadcast
                numberData._userReward = userReward;
                numberData._agentReward = agentReward;

            } catch (err) {
                if (process.env.DEBUG_SMS === 'true') {
                    console.warn('Reward update error:', err.message);
                }
            }
        })());

        // Wait for all updates
        await Promise.all(promises);

        // Number is permanently consumed — no return to pool (one-time use per number)

        // Broadcast to WebSocket ASYNCHRONOUSLY
        if (wss) {
            setImmediate(() => {
                try {
                    let country = '—', server = '—';
                    try {
                        const { getCountryFromPhone } = require('../routes/smsRoutes');
                        const catalogStore = require('../services/catalogStore');
                        const meta = getCountryFromPhone(phoneNumber);
                        const digits = String(phoneNumber).replace(/\D/g, '');
                        const catalogCountry = catalogStore.listCountries().find(c => {
                            const srvs = catalogStore.listServers(c.id);
                            return srvs.some(s => (s.numbers || []).some(n => String(n).replace(/\D/g, '') === digits));
                        });
                        country = catalogCountry?.name || meta.country;
                        server = meta.server;
                    } catch (_) {}

                    const broadcastPayload = {
                        type: 'otp_success',
                        userId: userId,
                        numberId: numberDoc.id,
                        otp: otp,
                        phoneNumber: phoneNumber,
                        smsMessage: content,
                        country,
                        server,
                        service: platformName,
                        receivedAt: receivedAt,
                        sourceId: sourceId || null,
                        earningsAmount: numberData._userReward || 0.05
                    };

                    const feedUpdatePayload = {
                        type: 'sms_feed_update',
                        sourceId: sourceId || null,
                        phoneNumber: phoneNumber,
                        otp: otp,
                        matched: true,
                        country,
                        server
                    };

                    wss.broadcast(broadcastPayload);
                    wss.broadcast(feedUpdatePayload);
                } catch (err) {
                    if (process.env.DEBUG_SMS === 'true') {
                        console.warn('Broadcast error:', err.message);
                    }
                }
            });
        }

        const duration = Date.now() - processStartTime;
        if (process.env.DEBUG_SMS === 'true' && duration > 500) {
            console.warn(`⚠️ Slow SMS processing: ${duration}ms`);
        }

        return { messageId, otp };

    } catch (err) {
        console.error('SMS processing error:', err.message);
        return null;
    }
}


/**
 * Mask phone number for privacy
 */
function maskPhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    if (phoneNumber.length <= 7) return phoneNumber;
    const countryCode = phoneNumber.startsWith('+') ? phoneNumber.substring(0, 4) : phoneNumber.substring(0, 3);
    const lastThree = phoneNumber.slice(-3);
    return `${countryCode}*****${lastThree}`;
}

/**
 * Check for expired phone numbers — mark as failed and return to pool
 */
async function checkExpiredNumbers(wss) {
    try {
        const now = new Date().toISOString();
        const snapshot = await collections.phoneNumbers.where('otpReceived', '==', false).get();
        const expired = snapshot.docs.filter((doc) => {
            const data = doc.data();
            const nowDate = new Date();
            const hasExpiry = data.expiresAt && new Date(data.expiresAt) < nowDate;
            const over30min = !data.expiresAt && data.createdAt && (nowDate - new Date(data.createdAt)) > 30 * 60 * 1000;
            return data.status === 'pending' && (hasExpiry || over30min);
        });

        if (expired.length > 0) {
            const userUpdates = {};

            for (const doc of expired) {
                const data = doc.data();
                if (data.userId) {
                    userUpdates[data.userId] = (userUpdates[data.userId] || 0) + 1;
                }

                await collections.phoneNumbers.doc(doc.id).update({
                    status: 'failed',
                    updatedAt: now
                });

                // Number is permanently consumed — not returned to pool on expiry

                if (wss && data.userId) {
                    wss.broadcast({
                        type: 'number_expired',
                        userId: data.userId,
                        numberId: doc.id,
                        status: 'failed',
                        updatedAt: now
                    });
                }
            }

            // Update user stats
            for (const userId in userUpdates) {
                const userRef = collections.users.doc(userId);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    await userRef.update({
                        failedOtps: (userData.failedOtps || 0) + userUpdates[userId],
                        totalOtps: (userData.totalOtps || 0) + userUpdates[userId],
                        updatedAt: now
                    });
                }
            }

            if (process.env.DEBUG_SMS === 'true') {
                console.log(`Marked ${expired.length} expired numbers as failed`);
            }
        }

        // Delete history older than 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const oldSnapshot = await collections.phoneNumbers.get();
        const oldDocs = oldSnapshot.docs.filter((doc) => {
            const data = doc.data();
            const time = data.createdAt || data.receivedAt || now;
            return new Date(time) < new Date(oneDayAgo);
        });
        for (const doc of oldDocs) {
            await collections.phoneNumbers.doc(doc.id).delete();
        }
        if (oldDocs.length > 0 && process.env.DEBUG_SMS === 'true') {
            console.log(`Cleaned up ${oldDocs.length} numbers older than 24 hours`);
        }

    } catch (error) {
        console.error('Error checking expired numbers:', error);
    }
}

module.exports = {
    processIncomingSMS,
    maskPhoneNumber,
    checkExpiredNumbers
};
