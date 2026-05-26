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
 * POST /api/auth/validate-referral
 * Validates if the referral email belongs to a registered agent
 */
router.post('/validate-referral', async (req, res) => {
  try {
    const { referralEmail } = req.body;
    const agentEmail = String(referralEmail || '').toLowerCase().trim();

    if (!agentEmail) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please enter a referral / agent email address.' }
      });
    }

    const usersSnap = await collections.users.get();
    let agentFound = false;
    let totalAgents = 0;
    
    usersSnap.forEach((doc) => {
      const u = doc.data();
      if (u.isAgent) {
        totalAgents++;
        if (u.email?.toLowerCase() === agentEmail) {
          agentFound = true;
        }
      }
    });

    if (totalAgents === 0) {
      console.log(`ℹ️ No agents exist in the database yet. Bypassing referral validation for: ${agentEmail}`);
      return res.json({
        success: true,
        message: 'No agents registered yet. Bypassing validation.'
      });
    }

    if (!agentFound) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please use a valid agent email address.' }
      });
    }

    res.json({
      success: true,
      message: 'Referral / agent email is valid.'
    });

  } catch (error) {
    console.error('Validate referral error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Could not validate referral email.' }
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session, enforcing email verification
 */
router.post('/login', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: { message: 'ID token is required' }
      });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (String(idToken).startsWith('guest.')) {
      let userDoc = await collections.users.doc(uid).get();
      if (!userDoc.exists) {
        return res.status(401).json({ success: false, error: { message: 'Guest session expired' } });
      }
      const userData = userDoc.data();
      res.cookie('sessionToken', idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      console.log(`
==================================================
🔑 GUEST AUTHENTICATION SUCCESSFUL
--------------------------------------------------
👤 Name:      ${userData.name}
📧 Email:     ${userData.email}
🆔 User ID:   ${uid}
🛡️ Guest:     Yes
📅 Timestamp: ${new Date().toLocaleString()}
==================================================
`);

      return res.json({
        success: true,
        message: 'Login successful',
        user: { id: uid, name: userData.name, email: userData.email, isGuest: true }
      });
    }

    let emailVerified = decodedToken.email_verified === true;
    if (isFirebaseConfigured && typeof auth.getUser === 'function') {
      const userRecord = await auth.getUser(uid);
      emailVerified = userRecord.emailVerified;
    }

    // Check if this user is an agent (admin-created agents skip email verification)
    let isAgentUser = false;
    try {
      const preCheckDoc = await collections.users.doc(uid).get();
      if (preCheckDoc.exists) {
        isAgentUser = !!preCheckDoc.data().isAgent;
      }
    } catch {}

    // Email verification is not required — agent approval is the gate
    // if (!emailVerified && isFirebaseConfigured && !isAgentUser) { ... }

    let userDoc = await collections.users.doc(uid).get();

    if (!userDoc.exists) {
      const email = decodedToken.email || req.body.email || '';
      const displayName = (email && email.split('@')[0]) || 'User';
      await collections.users.doc(uid).set({
        id: uid,
        name: displayName,
        email,
        phone: '',
        telegram: '',
        cryptoAddress: '',
        referralEmail: '',
        earningsBalance: 0,
        totalOtps: 0,
        failedOtps: 0,
        isBanned: false,
        isAdmin: false,
        profileComplete: false,
        emailVerified: emailVerified,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      userDoc = await collections.users.doc(uid).get();
    }

    const userData = userDoc.data();

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

    // Create session document
    const sessionId = `session_${uid}_${Date.now()}`;
    await collections.sessions.doc(sessionId).set({
      id: sessionId,
      userId: uid,
      token: idToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });

    res.cookie('sessionToken', idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    console.log(`
==================================================
🔑 USER AUTHENTICATION SUCCESSFUL
--------------------------------------------------
👤 Name:      ${userData.name}
📧 Email:     ${userData.email}
🆔 User ID:   ${uid}
🛡️ Admin:     ${userData.isAdmin ? 'Yes' : 'No'}
📅 Timestamp: ${new Date().toLocaleString()}
==================================================
`);

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

  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: {
        message: 'Authentication failed. Check your email and password, or verify your email first.',
        code: 'AUTH_FAILED'
      }
    });
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
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ success: true, authenticated: false });
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) return res.json({ success: true, authenticated: false });
    const userData = userDoc.data();
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
    res.json({ success: true, authenticated: false });
  }
});

module.exports = router;
