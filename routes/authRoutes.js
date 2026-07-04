/**
 * Authentication Routes
 * JWT-based authentication: signup stores user with bcrypt-hashed password,
 * login signs a JWT stored in the sessionToken cookie.
 */

const express = require('express');
const router = express.Router();
const { db, collections, admin } = require('../config/db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailSender');
const { signToken, verifyToken, hashPassword, comparePassword, genId, SESSION_MS } = require('../services/authService');

const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

/**
 * POST /api/auth/signup
 * Create user document + hashed password in MongoDB
 */
router.post('/signup', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      identificationNumber,
      telegramNumber,
      cryptoAddress,
      address,
      referralEmail
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false, error: { message: 'Email and password are required.' }
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false, error: { message: 'Password must be at least 8 characters.' }
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    // Reject duplicate email
    const dup = await collections.users.where('email', '==', cleanEmail).limit(1).get();
    if (dup.size > 0) {
      return res.status(400).json({
        success: false, error: { message: 'This email is already registered.' }
      });
    }

    const agentEmail = String(referralEmail || '').toLowerCase().trim();
    if (!agentEmail) {
      return res.status(400).json({
        success: false, error: { message: 'Please use a valid agent email address.' }
      });
    }

    const usersSnap = await collections.users.get();
    let agentFound = false;
    usersSnap.forEach((doc) => {
      const u = doc.data();
      if (u.isAgent && u.email?.toLowerCase() === agentEmail) agentFound = true;
    });
    if (!agentFound) {
      return res.status(400).json({
        success: false, error: { message: 'Please use a valid agent email address.' }
      });
    }

    const uid = genId('user');
    const passwordHash = await hashPassword(password);

    await collections.users.doc(uid).set({
      _id: uid,
      id: uid,
      name,
      email: cleanEmail,
      phone: identificationNumber,
      telegram: telegramNumber,
      cryptoAddress: cryptoAddress || address || '',
      referralEmail,
      agentEmail,
      agentApproved: false,
      earningsBalance: 0,
      totalOtps: 0,
      successfulOtps: 0,
      failedOtps: 0,
      isBanned: false,
      isAdmin: false,
      isAgent: false,
      profileComplete: true,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      passwordHash
    });

    const { queueApproval } = require('../services/agentStore');
    await queueApproval({ userId: uid, email: cleanEmail, name, agentEmail });

    // Auto-issue a token so the client can proceed immediately
    const token = signToken(uid, { email: cleanEmail });
    await collections.sessions.doc(`session_${uid}_${Date.now()}`).set({
      _id: `session_${uid}_${Date.now()}`,
      id: `session_${uid}_${Date.now()}`,
      userId: uid,
      token,
      expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
      createdAt: new Date().toISOString()
    });
    res.cookie('sessionToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MS,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      message: 'Profile created successfully',
      token,
      user: { id: uid, name, email: cleanEmail }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false, error: { message: 'Failed to create user profile' }
    });
  }
});

/**
 * POST /api/auth/login
 * Email + password → JWT in cookie
 */
router.post('/login', async (req, res) => {
  res.setTimeout(8000, () => {
    if (!res.headersSent) res.status(500).json({ success: false, error: { message: 'Server timeout. Please try again.' } });
  });

  try {
    const { email, password, idToken } = req.body;

    // Guest path
    if (idToken && String(idToken).startsWith('guest.')) {
      const guestUid = String(idToken).replace('guest.', '');
      const guestStore = require('../services/guestStore');
      const userData = guestStore.get(guestUid);
      if (!userData) return res.status(401).json({ success: false, error: { message: 'Guest session expired' } });
      res.cookie('sessionToken', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_MS,
        sameSite: 'strict'
      });
      return res.json({
        success: true,
        message: 'Login successful',
        user: { id: guestUid, name: userData.name, email: userData.email, isGuest: true }
      });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, error: { message: 'Email and password are required.' } });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    // Find user by email
    const snap = await collections.users.where('email', '==', cleanEmail).limit(1).get();
    let userDoc = snap.docs[0] || null;
    if (!userDoc) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password.' } });
    }
    const uid = userDoc.id;
    const userData = userDoc.data();

    const ok = await comparePassword(password, userData.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password.' } });
    }

    if (userData.isBanned) {
      return res.status(403).json({ success: false, error: { message: 'Your account has been banned.' } });
    }

    if (!userData.isAgent && userData.agentEmail && userData.agentApproved === false) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Your agent has not approved your account yet. Please ask your agent to approve you.',
          code: 'AGENT_NOT_APPROVED'
        }
      });
    }

    // Mark email verified once the user has successfully logged in
    if (!userData.emailVerified) {
      collections.users.doc(uid).update({ emailVerified: true, lastLoginAt: new Date().toISOString() }).catch(() => {});
    } else {
      collections.users.doc(uid).update({ lastLoginAt: new Date().toISOString() }).catch(() => {});
    }

    const token = signToken(uid, { email: cleanEmail });
    collections.sessions.doc(`session_${uid}_${Date.now()}`).set({
      _id: `session_${uid}_${Date.now()}`,
      id: `session_${uid}_${Date.now()}`,
      userId: uid,
      token,
      expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
      createdAt: new Date().toISOString()
    }).catch(() => {});

    res.cookie('sessionToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MS,
      sameSite: 'strict'
    });

    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: uid,
        name: userData.name,
        email: userData.email,
        isAdmin: !!userData.isAdmin,
        isAgent: !!userData.isAgent,
        apiEnabled: !!(userData.apiEnabled || userData.isAgent || userData.isAdmin)
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    if (!res.headersSent) {
      res.status(401).json({ success: false, error: { message: 'Authentication failed.' } });
    }
  }
});

/**
 * POST /api/auth/send-verification
 * Generate a 6-digit OTP, store it in MongoDB, and email it to the user.
 */
router.post('/send-verification', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: { message: 'Email is required' } });
    }
    const cleanEmail = String(email).toLowerCase().trim();

    // Rate-limit: block if a fresh code was sent within the last 60 seconds
    const recent = await collections.emailVerifyCodes
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();
    if (recent.size > 0) {
      const existing = recent.docs[0].data();
      const sentAt = new Date(existing.createdAt).getTime();
      if (Date.now() - sentAt < 60 * 1000) {
        return res.status(429).json({
          success: false,
          error: { message: 'A code was already sent. Please wait 60 seconds before requesting again.' }
        });
      }
      // Delete old code before issuing a new one
      await collections.emailVerifyCodes.doc(existing.id || recent.docs[0].id).delete().catch(() => {});
    }

    // Generate 6-digit code
    const crypto = require('crypto');
    const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');
    const codeId = `evc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await collections.emailVerifyCodes.doc(codeId).set({
      _id: codeId,
      id: codeId,
      email: cleanEmail,
      code,
      attempts: 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    });

    const result = await sendVerificationEmail({
      to: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      code
    });

    res.json({
      success: true,
      message: result.sent
        ? 'Verification code sent to your email.'
        : 'Code generated (check server console — SMTP not configured).',
      preview: result.preview === true,
      ...(result.preview ? { previewCode: code } : {})
    });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ success: false, error: { message: 'Could not send verification code. Try again later.' } });
  }
});

/**
 * POST /api/auth/verify-code
 * Check the submitted OTP — mark user verified, delete the code.
 */
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ success: false, error: { message: 'Email and code are required.' } });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanCode  = String(code).replace(/\s/g, '');

    // Find the stored code for this email
    const snap = await collections.emailVerifyCodes
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();

    if (snap.size === 0) {
      return res.status(400).json({ success: false, error: { message: 'No verification code found. Please request a new one.' } });
    }

    const codeDoc  = snap.docs[0];
    const codeData = codeDoc.data();
    const docId    = codeData.id || codeDoc.id;

    // Check expiry
    if (new Date(codeData.expiresAt) < new Date()) {
      await collections.emailVerifyCodes.doc(docId).delete().catch(() => {});
      return res.status(400).json({ success: false, error: { message: 'Code has expired. Please request a new one.' } });
    }

    // Limit attempts to 5
    const attempts = (codeData.attempts || 0) + 1;
    if (attempts > 5) {
      await collections.emailVerifyCodes.doc(docId).delete().catch(() => {});
      return res.status(400).json({ success: false, error: { message: 'Too many wrong attempts. Please request a new code.' } });
    }

    if (codeData.code !== cleanCode) {
      await collections.emailVerifyCodes.doc(docId).update({ attempts }).catch(() => {});
      const remaining = 5 - attempts;
      return res.status(400).json({
        success: false,
        error: { message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` }
      });
    }

    // ✅ Code is correct — mark user verified and delete code
    await collections.emailVerifyCodes.doc(docId).delete().catch(() => {});

    const userSnap = await collections.users
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();
    if (userSnap.size > 0) {
      const userDoc = userSnap.docs[0];
      await collections.users.doc(userDoc.id).update({
        emailVerified: true,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ success: false, error: { message: 'Verification failed. Please try again.' } });
  }
});

/**
 * GET /api/auth/verify-email  (legacy link support — redirect to OTP page)
 */
router.get('/verify-email', async (req, res) => {
  const token = req.query.token;
  if (token) {
    // Try legacy JWT-link verification for backward compat
    try {
      const payload = verifyToken(token);
      if (payload && payload.kind === 'verify') {
        const snap = await collections.users
          .where('email', '==', String(payload.email).toLowerCase())
          .limit(1)
          .get();
        if (snap.docs[0]) {
          await collections.users.doc(snap.docs[0].id).update({
            emailVerified: true,
            updatedAt: new Date().toISOString()
          });
        }
        return res.redirect('/verify-email?verified=1');
      }
    } catch (_) {}
  }
  res.redirect('/verify-email');
});

/**
 * POST /api/auth/send-password-reset
 * Generate a 6-digit reset OTP and email it.
 */
router.post('/send-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: { message: 'Email is required' } });
    }
    const cleanEmail = String(email).toLowerCase().trim();

    // Only send if user exists (don't reveal whether email is registered)
    const userSnap = await collections.users
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();
    // Always respond success to prevent user enumeration
    if (userSnap.size === 0) {
      return res.json({ success: true, message: 'If an account exists for this email, a reset code has been sent.' });
    }

    // Rate-limit
    const recent = await collections.emailVerifyCodes
      .where('email', '==', `reset_${cleanEmail}`)
      .limit(1)
      .get();
    if (recent.size > 0) {
      const existing = recent.docs[0].data();
      if (Date.now() - new Date(existing.createdAt).getTime() < 60 * 1000) {
        return res.status(429).json({
          success: false,
          error: { message: 'A reset code was recently sent. Please wait 60 seconds.' }
        });
      }
      await collections.emailVerifyCodes.doc(existing.id || recent.docs[0].id).delete().catch(() => {});
    }

    const crypto = require('crypto');
    const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');
    const codeId = `prc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Store with "reset_" prefix to distinguish from verify codes
    await collections.emailVerifyCodes.doc(codeId).set({
      _id: codeId,
      id: codeId,
      email: `reset_${cleanEmail}`,
      code,
      attempts: 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    });

    const userData = userSnap.docs[0].data();
    const result = await sendPasswordResetEmail({
      to: cleanEmail,
      name: userData.name || cleanEmail.split('@')[0],
      code
    });

    res.json({
      success: true,
      message: result.sent
        ? 'Password reset code sent to your email.'
        : 'Code generated (check server console — SMTP not configured).',
      preview: result.preview === true,
      ...(result.preview ? { previewCode: code } : {})
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ success: false, error: { message: 'Could not send password reset code.' } });
  }
});

/**
 * POST /api/auth/reset-password
 * Verify the OTP code and set new password.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body || {};
    if (!email || !code || !password) {
      return res.status(400).json({ success: false, error: { message: 'Email, code and new password are required.' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: { message: 'Password must be at least 8 characters.' } });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanCode  = String(code).replace(/\s/g, '');

    const snap = await collections.emailVerifyCodes
      .where('email', '==', `reset_${cleanEmail}`)
      .limit(1)
      .get();

    if (snap.size === 0) {
      return res.status(400).json({ success: false, error: { message: 'No reset code found. Please request a new one.' } });
    }

    const codeDoc  = snap.docs[0];
    const codeData = codeDoc.data();
    const docId    = codeData.id || codeDoc.id;

    if (new Date(codeData.expiresAt) < new Date()) {
      await collections.emailVerifyCodes.doc(docId).delete().catch(() => {});
      return res.status(400).json({ success: false, error: { message: 'Code has expired. Please request a new one.' } });
    }

    const attempts = (codeData.attempts || 0) + 1;
    if (attempts > 5) {
      await collections.emailVerifyCodes.doc(docId).delete().catch(() => {});
      return res.status(400).json({ success: false, error: { message: 'Too many wrong attempts. Please request a new code.' } });
    }

    if (codeData.code !== cleanCode) {
      await collections.emailVerifyCodes.doc(docId).update({ attempts }).catch(() => {});
      const remaining = 5 - attempts;
      return res.status(400).json({
        success: false,
        error: { message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` }
      });
    }

    // ✅ Code correct — update password, delete code
    await collections.emailVerifyCodes.doc(docId).delete().catch(() => {});

    const userSnap = await collections.users
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();
    if (!userSnap.docs[0]) {
      return res.json({ success: true, message: 'Password updated successfully.' });
    }
    const passwordHash = await hashPassword(password);
    await collections.users.doc(userSnap.docs[0].id).update({
      passwordHash,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ success: false, error: { message: 'Could not reset password.' } });
  }
});

// Cache system settings
let _systemSettingsCache = null;
let _systemSettingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 10 * 60 * 1000;

async function getSystemSettings() {
  if (_systemSettingsCache && (Date.now() - _systemSettingsCacheTime) < SETTINGS_CACHE_TTL) {
    return _systemSettingsCache;
  }
  try {
    const doc = await collections.guruSettings.doc('system').get();
    if (doc.exists) {
      _systemSettingsCache = doc.data();
      _systemSettingsCacheTime = Date.now();
      return _systemSettingsCache;
    }
  } catch (e) {
    if (_systemSettingsCache) return _systemSettingsCache;
  }
  return { allowGuestLogin: true };
}

/**
 * GET /api/auth/settings
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      success: true,
      settings: { allowGuestLogin: settings.allowGuestLogin !== false }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * POST /api/auth/guest
 */
router.post('/guest', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    if (settings.allowGuestLogin === false) {
      return res.status(403).json({
        success: false,
        error: { message: 'Guest login is currently disabled by administrator.' }
      });
    }
    const crypto = require('crypto');
    const uid = `guest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const guestStore = require('../services/guestStore');
    guestStore.create(uid);
    const token = `guest.${uid}`;
    res.cookie('sessionToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MS,
      sameSite: 'strict'
    });
    res.json({
      success: true,
      message: 'Guest session started',
      user: { id: uid, name: 'Guest User', email: `${uid}@guest.local`, isGuest: true }
    });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ success: false, error: { message: 'Could not start guest session' } });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (token && !String(token).startsWith('guest.')) {
      const payload = verifyToken(token);
      const uid = payload && payload.uid;
      if (uid) {
        const sessionsSnapshot = await collections.sessions.where('userId', '==', uid).get();
        await Promise.all(sessionsSnapshot.docs.map((d) =>
          collections.sessions.doc(d.id).delete().catch(() => null)
        ));
      }
    }
    res.clearCookie('sessionToken');
    res.json({ success: true });
  } catch (error) {
    res.clearCookie('sessionToken');
    res.json({ success: true });
  }
});

/**
 * GET /api/auth/session
 */
router.get('/session', async (req, res) => {
  res.setTimeout(4000, () => {
    if (!res.headersSent) res.json({ success: true, authenticated: false });
  });

  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ success: true, authenticated: false });

    if (String(token).startsWith('guest.')) {
      const guestUid = String(token).replace('guest.', '');
      const guestStore = require('../services/guestStore');
      const userData = guestStore.get(guestUid);
      if (!userData) return res.json({ success: true, authenticated: false });
      if (userData.isBanned) return res.json({ success: true, authenticated: false });
      return res.json({
        success: true,
        authenticated: true,
        user: {
          id: guestUid,
          name: userData.name,
          email: userData.email,
          isAdmin: false,
          isAgent: false,
          isGuest: true,
          profilePhotoUrl: null
        }
      });
    }

    const payload = verifyToken(token);
    if (!payload) return res.json({ success: true, authenticated: false });

    const uid = payload.uid;
    const userDoc = await collections.users.doc(uid).get().catch(() => null);
    if (!userDoc || !userDoc.exists) {
      return res.json({ success: true, authenticated: false });
    }
    const userData = userDoc.data();
    if (userData.isBanned) return res.json({ success: true, authenticated: false });
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: uid,
        name: userData.name,
        email: userData.email,
        isAdmin: !!userData.isAdmin,
        isAgent: !!userData.isAgent,
        isGuest: !!userData.isGuest,
        apiEnabled: !!(userData.apiEnabled || userData.isAgent || userData.isAdmin),
        profilePhotoUrl: userData.profilePhotoUrl || null
      }
    });
  } catch (error) {
    if (!res.headersSent) res.json({ success: true, authenticated: false });
  }
});

module.exports = router;
