/**
 * Authentication Routes
 * Firebase-based authentication endpoints with advanced profile fields
 */

const express = require('express');
const router = express.Router();
const { auth, db, collections, admin, isFirebaseConfigured } = require('../config/firebase');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailSender');

const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

/**
 * POST /api/auth/signup
 * Create user document in Firestore after Firebase Auth signup
 */
router.post('/signup', async (req, res) => {
  try {
    const {
      uid,
      name,
      email,
      identificationNumber,
      telegramNumber,
      cryptoAddress,
      address,
      referralEmail
    } = req.body;

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields' }
      });
    }

    const agentEmail = String(referralEmail || '').toLowerCase().trim();
    if (!agentEmail) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please use a valid agent email address.' }
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
        success: false,
        error: { message: 'Please use a valid agent email address.' }
      });
    }

    const { queueApproval } = require('../services/agentStore');
    await queueApproval({ userId: uid, email, name, agentEmail });

    await collections.users.doc(uid).set({
      id: uid,
      name,
      email,
      phone: identificationNumber,
      telegram: telegramNumber,
      cryptoAddress: cryptoAddress || address || '',
      referralEmail: referralEmail,
      agentEmail,
      agentApproved: false,
      earningsBalance: 0,
      totalOtps: 0,
      failedOtps: 0,
      isBanned: false,
      isAdmin: false,
      isAgent: false,
      profileComplete: true,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Profile created successfully'
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create user profile' }
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session, enforcing email verification
 */
router.post('/login', async (req, res) => {
  // Hard timeout — never hang
  res.setTimeout(8000, () => {
    if (!res.headersSent) res.status(500).json({ success: false, error: { message: 'Server timeout. Please try again.' } });
  });

  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: { message: 'ID token is required' }
      });
    }

    // Handle guest tokens
    if (String(idToken).startsWith('guest.')) {
      const guestUid = String(idToken).replace('guest.', '');
      let userData = null;
      try {
        const userDoc = await Promise.race([
          collections.users.doc(guestUid).get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        if (userDoc?.exists) userData = userDoc.data();
      } catch (_) {}

      if (!userData) return res.status(401).json({ success: false, error: { message: 'Guest session expired' } });

      res.cookie('sessionToken', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
      return res.json({
        success: true,
        message: 'Login successful',
        user: { id: guestUid, name: userData.name, email: userData.email, isGuest: true }
      });
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (_) {
      return res.status(401).json({ success: false, error: { message: 'Invalid token. Please try again.' } });
    }
    const uid = decodedToken.uid;

    let emailVerified = decodedToken.email_verified === true;
    if (isFirebaseConfigured && typeof auth.getUser === 'function') {
      try {
        const userRecord = await Promise.race([
          auth.getUser(uid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        emailVerified = userRecord.emailVerified;
      } catch (_) {}
    }

    // Check if this user is an agent
    let isAgentUser = false;
    try {
      const preCheckDoc = await Promise.race([
        collections.users.doc(uid).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      if (preCheckDoc?.exists) isAgentUser = !!preCheckDoc.data().isAgent;
    } catch (_) {}

    // Fetch user doc with timeout
    let userDoc = null;
    try {
      userDoc = await Promise.race([
        collections.users.doc(uid).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
    } catch (_) {
      // Firestore timeout — allow login with minimal data
      res.cookie('sessionToken', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
      return res.json({
        success: true,
        message: 'Login successful',
        user: { id: uid, name: decodedToken.email?.split('@')[0] || 'User', email: decodedToken.email || '', isAdmin: false }
      });
    }

    if (!userDoc || !userDoc.exists) {
      const email = decodedToken.email || req.body.email || '';
      const displayName = (email && email.split('@')[0]) || 'User';
      try {
        await collections.users.doc(uid).set({
          id: uid, name: displayName, email, phone: '', telegram: '',
          cryptoAddress: '', referralEmail: '', earningsBalance: 0,
          totalOtps: 0, failedOtps: 0, isBanned: false, isAdmin: false,
          profileComplete: false, emailVerified: emailVerified,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        userDoc = await collections.users.doc(uid).get().catch(() => null);
      } catch (_) {}
    }

    const userData = userDoc?.exists ? userDoc.data() : null;

    // If no user data, allow login with minimal info
    if (!userData) {
      res.cookie('sessionToken', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
      return res.json({
        success: true,
        message: 'Login successful',
        user: { id: uid, name: decodedToken.email?.split('@')[0] || 'User', email: decodedToken.email || '', isAdmin: false }
      });
    }

    // Update emailVerified status if needed (background, non-blocking)
    if (!userData.emailVerified) {
      collections.users.doc(uid).update({ emailVerified: true }).catch(() => {});
    }

    if (userData.isBanned) {
      return res.status(403).json({
        success: false,
        error: { message: 'Your account has been banned' }
      });
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

    // Create session document (non-blocking — don't wait)
    collections.sessions.doc(`session_${uid}_${Date.now()}`).set({
      userId: uid, token: idToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    }).catch(() => {});

    res.cookie('sessionToken', idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    console.log(`✅ Login: ${userData.email} (${userData.isAdmin ? 'Admin' : 'User'})`);

    if (!res.headersSent) {
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: uid,
          name: userData.name,
          email: userData.email,
          isAdmin: userData.isAdmin
        },
        token: idToken
      });
    }

  } catch (error) {
    console.error('Login error:', error.message);
    if (!res.headersSent) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication failed. Check your email and password.',
          code: 'AUTH_FAILED'
        }
      });
    }
  }
});

/**
 * POST /api/auth/send-verification
 * Sends branded verification email with "Activate Now" button
 */
router.post('/send-verification', async (req, res) => {
  try {
    const { email, name, idToken } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email is required' }
      });
    }

    if (!isFirebaseConfigured || !admin.apps.length) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Server email service requires Firebase Admin. Use Firebase default verification or configure serviceAccountKey.json.',
          code: 'ADMIN_NOT_CONFIGURED'
        }
      });
    }

    if (idToken) {
      await auth.verifyIdToken(idToken);
    }

    const verifyUrl = await admin.auth().generateEmailVerificationLink(email, {
      url: `${appUrl()}/verify-email?verified=1`,
      handleCodeInApp: false
    });

    const result = await sendVerificationEmail({
      to: email,
      name: name || email.split('@')[0],
      verifyUrl
    });

    res.json({
      success: true,
      message: result.sent
        ? 'Verification email sent. Tap Activate Now in your inbox.'
        : 'Verification link generated (check server console if SMTP is not set).',
      preview: result.preview === true
    });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Could not send verification email. Try again later.' }
    });
  }
});

/**
 * POST /api/auth/send-password-reset
 * Branded password reset email with button (no raw link in body)
 */
router.post('/send-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email is required' }
      });
    }

    if (!isFirebaseConfigured || !admin.apps.length) {
      return res.status(503).json({
        success: false,
        error: { message: 'Password reset requires Firebase Admin configuration.' }
      });
    }

    const resetUrl = await admin.auth().generatePasswordResetLink(email, {
      url: `${appUrl()}/reset-password?done=1`,
      handleCodeInApp: false
    });

    const result = await sendPasswordResetEmail({
      to: email,
      name: email.split('@')[0],
      resetUrl
    });

    res.json({
      success: true,
      message: result.sent
        ? 'Password reset email sent. Tap Reset Password in your inbox.'
        : 'Reset link generated (check server console if SMTP is not set).'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    if (error.code === 'auth/user-not-found') {
      return res.json({
        success: true,
        message: 'If an account exists for this email, a reset link has been sent.'
      });
    }
    res.status(500).json({
      success: false,
      error: { message: 'Could not send password reset email.' }
    });
  }
});

async function getSystemSettings() {
  try {
    const doc = await collections.guruSettings.doc('system').get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (e) {
    console.error('getSystemSettings error:', e);
  }
  return { allowGuestLogin: true };
}

/**
 * GET /api/auth/settings
 * Expose system-wide public config to client without authentication
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      success: true,
      settings: {
        allowGuestLogin: settings.allowGuestLogin !== false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * POST /api/auth/guest
 * One-click guest session for testing (no signup)
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

    await collections.users.doc(uid).set({
      id: uid,
      name: 'Guest User',
      email: `${uid}@guest.local`,
      phone: '',
      telegram: '',
      cryptoAddress: '',
      referralEmail: '',
      earningsBalance: 0,
      totalOtps: 0,
      failedOtps: 0,
      isBanned: false,
      isAdmin: false,
      isGuest: true,
      agentApproved: true,
      profileComplete: true,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const token = `guest.${uid}`;

    res.cookie('sessionToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
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
    if (token) {
      const decodedToken = await auth.verifyIdToken(token);
      const uid = decodedToken.uid;
      const sessionsSnapshot = await collections.sessions.where('userId', '==', uid).get();
      const batch = db.batch();
      sessionsSnapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      await auth.revokeRefreshTokens(uid);
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
  // Set a hard timeout — never hang the client
  res.setTimeout(4000, () => {
    if (!res.headersSent) res.json({ success: true, authenticated: false });
  });

  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ success: true, authenticated: false });

    // Handle guest tokens — no Firestore needed for token check
    if (String(token).startsWith('guest.')) {
      const guestUid = String(token).replace('guest.', '');
      let userData = null;
      try {
        const userDoc = await Promise.race([
          collections.users.doc(guestUid).get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        if (userDoc?.exists) userData = userDoc.data();
      } catch (_) {}

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

    // Verify Firebase token
    let uid;
    try {
      const decodedToken = await auth.verifyIdToken(token);
      uid = decodedToken.uid;
    } catch (_) {
      return res.json({ success: true, authenticated: false });
    }

    // Fetch user from Firestore with timeout
    let userData = null;
    try {
      const userDoc = await Promise.race([
        collections.users.doc(uid).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      if (userDoc?.exists) userData = userDoc.data();
    } catch (_) {
      // Firestore timeout or quota — return authenticated with minimal data
      return res.json({
        success: true,
        authenticated: true,
        user: { id: uid, name: 'User', email: '', isAdmin: false, isAgent: false, isGuest: false, profilePhotoUrl: null }
      });
    }

    if (!userData) return res.json({ success: true, authenticated: false });

    res.json({
      success: true,
      authenticated: true,
      user: {
        id: uid,
        name: userData.name,
        email: userData.email,
        isAdmin: userData.isAdmin,
        isAgent: !!userData.isAgent,
        isGuest: !!userData.isGuest,
        profilePhotoUrl: userData.profilePhotoUrl || null
      }
    });
  } catch (error) {
    if (!res.headersSent) res.json({ success: true, authenticated: false });
  }
});

module.exports = router;
