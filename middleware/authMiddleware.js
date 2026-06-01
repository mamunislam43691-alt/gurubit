/**
 * Authentication Middleware
 * Verify Firebase tokens and protect routes
 */

const { auth, collections } = require('../config/firebase');

/**
 * Verify Firebase ID token
 */
async function verifyToken(req, res, next) {
  try {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    // Handle guest tokens — check local guestStore, never Firestore
    if (String(token).startsWith('guest.')) {
      const guestUid = String(token).replace('guest.', '');
      const guestStore = require('../services/guestStore');
      const guestData = guestStore.get(guestUid);
      if (!guestData) {
        return res.status(401).json({ success: false, error: { code: 'GUEST_EXPIRED', message: 'Guest session expired' } });
      }
      if (guestData.isBanned) {
        return res.status(403).json({ success: false, error: { code: 'USER_BANNED', message: 'Your account has been banned' } });
      }
      req.user = { id: guestUid, ...guestData };
      return next();
    }

    // Verify token with Firebase
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      });
    }

    const userData = userDoc.data();
    if (userData.isBanned) {
      return res.status(403).json({
        success: false,
        error: { code: 'USER_BANNED', message: 'Your account has been banned' }
      });
    }

    req.user = { id: uid, ...userData };
    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }
}

/**
 * Verify admin role
 */
async function verifyAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required'
      }
    });
  }

  next();
}

/**
 * Verify profile is complete
 */
async function verifyProfileComplete(req, res, next) {
  if (!req.user || !req.user.profileComplete) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile first'
      }
    });
  }

  next();
}

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyProfileComplete
};
