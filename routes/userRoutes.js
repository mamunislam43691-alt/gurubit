/**
 * User Routes
 * User profile and dashboard operations
 */

const express = require('express');
const router = express.Router();
const { auth, collections } = require('../config/firebase');

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

/**
 * POST /api/user/profile/complete
 * Complete user profile after signup
 * Requirements: 1.4, 1.5, 1.6, 1.7
 */
router.post('/profile/complete', verifyAuth, async (req, res) => {
    try {
        const { telegramNumber, whatsappNumber, cryptoCurrencyType, cryptoWalletAddress } = req.body;

        // Validation
        if (!telegramNumber || !whatsappNumber || !cryptoCurrencyType || !cryptoWalletAddress) {
            return res.status(400).json({
                success: false,
                error: { message: 'All fields are required' }
            });
        }

        // Update user document
        await collections.users.doc(req.userId).update({
            telegramNumber,
            whatsappNumber,
            cryptoCurrencyType,
            cryptoWalletAddress,
            profileComplete: true,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Profile completed successfully'
        });

    } catch (error) {
        console.error('Profile completion error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to complete profile' }
        });
    }
});

/**
 * GET /api/user/profile
 * Get user profile
 * Requirements: 2.1
 */
router.get('/profile', verifyAuth, async (req, res) => {
    try {
        const userDoc = await collections.users.doc(req.userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found' }
            });
        }

        const userData = userDoc.data();

        res.json({
            success: true,
            profile: {
                id: userData.id,
                name: userData.name,
                email: userData.email,
                phone: userData.phone || userData.whatsappNumber || '',
                telegram: userData.telegram || userData.telegramNumber || '',
                cryptoAddress: userData.cryptoAddress || userData.cryptoWalletAddress || '',
                referralEmail: userData.referralEmail || userData.agentEmail || '',
                agentEmail: userData.agentEmail || '',
                profilePhotoUrl: userData.profilePhotoUrl || null,
                earningsBalance: userData.earningsBalance || 0,
                totalOtps: userData.totalOtps || 0,
                totalSms: userData.totalOtps || 0,
                failedOtps: userData.failedOtps || 0,
                profileComplete: userData.profileComplete,
                emailVerified: userData.emailVerified
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get profile' }
        });
    }
});

/**
 * PUT /api/user/profile
 * Update user profile
 * Requirements: 2.2, 2.3, 2.4
 */
router.put('/profile', verifyAuth, async (req, res) => {
    try {
        const { name, phone, telegram, cryptoAddress, telegramNumber, whatsappNumber, cryptoWalletAddress } = req.body;

        const updateData = {
            updatedAt: new Date().toISOString()
        };

        if (name) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (telegram !== undefined) updateData.telegram = telegram;
        if (cryptoAddress !== undefined) updateData.cryptoAddress = cryptoAddress;
        if (telegramNumber) updateData.telegram = telegramNumber;
        if (whatsappNumber) updateData.phone = whatsappNumber;
        if (cryptoWalletAddress) updateData.cryptoAddress = cryptoWalletAddress;

        await collections.users.doc(req.userId).update(updateData);

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to update profile' }
        });
    }
});

/**
 * GET /api/user/dashboard
 * Get user dashboard statistics (Optimized with parallel queries)
 * Requirements: 3.1, 3.2, 3.3
 */
router.get('/dashboard', verifyAuth, async (req, res) => {
    try {
        // Parallel queries for better performance
        const [userDoc, numSnap, statsHelperModule] = await Promise.all([
            collections.users.doc(req.userId).get(),
            collections.phoneNumbers.where('userId', '==', req.userId).select('id').get(),
            Promise.resolve(require('../services/statsHelper'))
        ]);

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found' }
            });
        }

        const userData = userDoc.data();
        const totalSms = userData.totalOtps || 0;
        const totalNumbers = numSnap.size;
        
        // Build analytics in parallel
        const userAnalytics = await statsHelperModule.buildUserDashboardAnalytics(collections, req.userId);
        
        // Pre-compute chart data
        const chartSeries = Array.from({ length: 7 }, (_, i) =>
            Math.max(0, Math.round((totalSms || 0) * (0.2 + (i + 1) * 0.1) / 7))
        );

        // Cache this response for 30 seconds
        res.set('Cache-Control', 'public, max-age=30');
        res.json({
            success: true,
            dashboard: {
                totalNumbers,
                totalOtps: totalSms,
                totalSms,
                failedOtps: userData.failedOtps || 0,
                successfulOtps: totalSms - (userData.failedOtps || 0),
                earningsBalance: userData.earningsBalance || 0,
                revenue: userData.earningsBalance || 0,
                successRate: totalSms > 0
                    ? (((totalSms - userData.failedOtps) / totalSms) * 100).toFixed(1)
                    : 0,
                topApplications: userAnalytics.topApplications,
                topRanges: userAnalytics.topRanges,
                chartSeries
            }
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get dashboard data' }
        });
    }
});

/**
 * POST /api/user/withdrawal
 * Submit a withdrawal request
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
router.post('/withdrawal', verifyAuth, async (req, res) => {
    try {
        const { amount } = req.body;
        const numAmount = parseFloat(amount);

        if (isNaN(numAmount) || numAmount < 30) {
            return res.status(400).json({
                success: false,
                error: { message: 'Minimum withdrawal amount is 30 USD' }
            });
        }

        // Get user data to check balance and get crypto info
        const userDoc = await collections.users.doc(req.userId).get();
        const userData = userDoc.data();

        if (userData.earningsBalance < numAmount) {
            return res.status(400).json({
                success: false,
                error: { message: 'Insufficient earnings balance' }
            });
        }

        if (!userData.cryptoWalletAddress || !userData.cryptoCurrencyType) {
            return res.status(400).json({
                success: false,
                error: { message: 'Please complete your profile with crypto payment details' }
            });
        }

        // Create withdrawal request
        const withdrawalId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const withdrawalData = {
            id: withdrawalId,
            userId: req.userId,
            userName: userData.name,
            amount: numAmount,
            cryptoCurrencyType: userData.cryptoCurrencyType,
            cryptoWalletAddress: userData.cryptoWalletAddress,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        await collections.withdrawalRequests.doc(withdrawalId).set(withdrawalData);

        // We don't deduct balance here - it's deducted upon admin approval
        // But we could "lock" it if we wanted to. For now, just create the request.

        res.json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            withdrawal: withdrawalData
        });

    } catch (error) {
        console.error('Withdrawal request error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to submit withdrawal request' }
        });
    }
});

/**
 * GET /api/user/withdrawal-history
 * Get user withdrawal history
 * Requirements: 7.6, 7.7
 */
router.get('/withdrawal-history', verifyAuth, async (req, res) => {
    try {
        const snapshot = await collections.withdrawalRequests
            .where('userId', '==', req.userId)
            .orderBy('createdAt', 'desc')
            .get();

        const withdrawals = [];
        snapshot.forEach(doc => {
            withdrawals.push(doc.data());
        });

        res.json({
            success: true,
            withdrawals
        });

    } catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get withdrawal history' }
        });
    }
});

/**
 * PUT /api/user/profile/photo
 * Upload profile photo (base64 data URL)
 */
router.put('/profile/photo', verifyAuth, async (req, res) => {
    try {
        const { photoData } = req.body;
        if (!photoData || !String(photoData).startsWith('data:image/')) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid image data' }
            });
        }
        if (String(photoData).length > 2_500_000) {
            return res.status(400).json({
                success: false,
                error: { message: 'Image too large (max ~2MB)' }
            });
        }
        await collections.users.doc(req.userId).update({
            profilePhotoUrl: photoData,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, profilePhotoUrl: photoData });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to upload photo' } });
    }
});

/**
 * Agent API keys — external access to GURUBIT
 */
const userApiKeyStore = require('../services/userApiKeyStore');

router.get('/api-keys', verifyAuth, async (req, res) => {
    try {
        const userDoc = await collections.users.doc(req.userId).get();
        if (!userDoc.exists || !userDoc.data().isAgent) {
            return res.status(403).json({ success: false, error: { message: 'Agents only' } });
        }
        res.json({ success: true, keys: userApiKeyStore.listForUser(req.userId) });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to list keys' } });
    }
});

router.post('/api-keys', verifyAuth, async (req, res) => {
    try {
        const userDoc = await collections.users.doc(req.userId).get();
        if (!userDoc.exists || !userDoc.data().isAgent) {
            return res.status(403).json({ success: false, error: { message: 'Agents only' } });
        }
        const label = req.body?.label || 'Website API';
        const key = userApiKeyStore.createKey(req.userId, label);
        res.json({ success: true, key });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to create key' } });
    }
});

router.delete('/api-keys/:id', verifyAuth, async (req, res) => {
    try {
        if (!userApiKeyStore.revokeKey(req.userId, req.params.id)) {
            return res.status(404).json({ success: false, error: { message: 'Key not found' } });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to revoke key' } });
    }
});

module.exports = router;
