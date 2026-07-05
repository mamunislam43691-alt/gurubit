/**
 * SMS Processing Utility
 * Handles OTP extraction and real-time distribution
 */

const { db, collections } = require('../config/db');

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

        // Update 3: Update user earnings using costStore rates
        promises.push((async () => {
            try {
                const costStore  = require('../services/costStore');

                // ── Get country/server from the number document directly ──
                // numberData already has countryId and serverId stored when number was allocated
                const countryId = numberData.countryId || null;
                const serverId  = numberData.serverId  || null;

                // Get configured reward rates (falls back to 0.05 / 0.02 if not set)
                const cost       = await costStore.getCost(countryId, serverId);
                const userReward  = Math.max(0, parseFloat(cost?.userReward)  || 0.05);
                const agentReward = Math.max(0, parseFloat(cost?.agentReward) || 0.02);

                console.log(`   💰 Reward: user=$${userReward} | agent=$${agentReward} | country=${countryId} | server=${serverId}`);

                // ── Update user balance ──────────────────────────────────
                const userDoc = await collections.users.doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const newUserBalance = Math.round(((userData.earningsBalance || 0) + userReward) * 10000) / 10000;
                    await collections.users.doc(userId).update({
                        earningsBalance: newUserBalance,
                        totalOtps:       (userData.totalOtps || 0) + 1,
                        successfulOtps:  (userData.successfulOtps || 0) + 1,
                        updatedAt:       new Date().toISOString()
                    });
                    console.log(`   ✅ User balance updated: $${(userData.earningsBalance || 0).toFixed(4)} → $${newUserBalance.toFixed(4)}`);

                    // ── Reward agent ─────────────────────────────────────
                    const agentEmail = (userData.agentEmail || userData.referralEmail || '').toLowerCase().trim();
                    if (agentEmail && agentReward > 0) {
                        try {
                            // Query by email — no full scan
                            const agentSnap = await collections.users
                                .where('email', '==', agentEmail)
                                .limit(1)
                                .get();

                            if (agentSnap.size > 0) {
                                let agentId = null;
                                let agentBal = 0;
                                let agentOtps = 0;
                                agentSnap.forEach(doc => {
                                    agentId  = doc.id;
                                    agentBal  = doc.data().earningsBalance || 0;
                                    agentOtps = doc.data().totalOtps || 0;
                                });
                                if (agentId) {
                                    const newAgentBal = Math.round((agentBal + agentReward) * 10000) / 10000;
                                    await collections.users.doc(agentId).update({
                                        earningsBalance: newAgentBal,
                                        totalOtps:       agentOtps + 1,
                                        updatedAt:       new Date().toISOString()
                                    });
                                    console.log(`   ✅ Agent reward: +$${agentReward} → ${agentEmail}`);
                                }
                            }
                        } catch (agentErr) {
                            console.warn('   ⚠️ Agent reward error:', agentErr.message);
                        }
                    }
                } else {
                    console.warn(`   ⚠️ User not found for reward: ${userId}`);
                }

                // Store reward for broadcast (set before Promise.all resolves)
                numberData._userReward  = userReward;
                numberData._agentReward = agentReward;

            } catch (err) {
                console.warn('   ⚠️ Reward update error:', err.message);
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
                        const meta = getCountryFromPhone(phoneNumber);
                        // Use the stored serverName (range name) from the number document
                        country = numberData.countryName || numberData.country || meta.country;
                        server = numberData.serverName || numberData.server || meta.server;
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
                        rangeName: server,
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

            // Update user stats — only failedOtps, NOT totalOtps (totalOtps only counts when SMS received)
            for (const userId in userUpdates) {
                const userRef = collections.users.doc(userId);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    await userRef.update({
                        failedOtps: (userData.failedOtps || 0) + userUpdates[userId],
                        updatedAt: now
                    });
                }
            }

            if (process.env.DEBUG_SMS === 'true') {
                console.log(`Marked ${expired.length} expired numbers as failed`);
            }
        }

        // Note: 24h cleanup is handled automatically by phoneStore's internal interval

    } catch (error) {
        console.error('Error checking expired numbers:', error);
    }
}

module.exports = {
    processIncomingSMS,
    maskPhoneNumber,
    checkExpiredNumbers,
    cleanupOldNumbers
};

/**
 * Delete failed and successful numbers older than 12 hours
 * Runs on a scheduled interval
 */
async function cleanupOldNumbers(wss) {
    try {
        const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
        let deletedCount = 0;

        // Get failed numbers older than 12h
        const failedSnap = await collections.phoneNumbers
            .where('status', '==', 'failed')
            .get();

        // Get successful numbers older than 12h
        const successSnap = await collections.phoneNumbers
            .where('status', '==', 'successful')
            .get();

        const toDelete = [];

        failedSnap.forEach(doc => {
            const d = doc.data();
            const age = d.updatedAt || d.createdAt;
            if (age && age < cutoff) toDelete.push(doc);
        });

        successSnap.forEach(doc => {
            const d = doc.data();
            const age = d.updatedAt || d.createdAt;
            if (age && age < cutoff) toDelete.push(doc);
        });

        // Delete in batches
        for (const doc of toDelete) {
            try {
                await collections.phoneNumbers.doc(doc.id).delete();
                deletedCount++;

                // Notify user via WebSocket
                const data = doc.data();
                if (wss && data.userId) {
                    wss.broadcast({
                        type: 'number_deleted',
                        userId: data.userId,
                        numberId: doc.id,
                        phoneNumber: data.phoneNumber,
                        reason: 'auto_cleanup_12h'
                    });
                }
            } catch (e) {
                // ignore individual delete errors
            }
        }

        if (deletedCount > 0) {
            console.log(`🧹 [Auto Cleanup] Deleted ${deletedCount} old number(s) (failed/successful > 12h)`);
        }

        return deletedCount;
    } catch (error) {
        console.warn('[Auto Cleanup] Error:', error.message);
        return 0;
    }
}
