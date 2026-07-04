/**
 * Auth Middleware — JWT or guest session cookie based.
 */

const { collections } = require('../config/db');
const { verifyToken: verifyJwt } = require('../services/authService');

async function verifyToken(req, res, next) {
  try {
    const headerToken = req.headers.authorization?.replace('Bearer ', '');
    const token = req.cookies?.sessionToken || headerToken;

    if (!token) {
      req.user = null;
      req.userId = null;
      return next();
    }

    if (String(token).startsWith('guest.')) {
      const guestUid = String(token).replace('guest.', '');
      const guestStore = require('../services/guestStore');
      const guestData = await guestStore.get(guestUid);
      if (guestData) {
        req.user = {
          id: guestUid,
          name: guestData.name,
          email: guestData.email,
          isGuest: true,
          isAdmin: false,
          isAgent: false
        };
        req.userId = guestUid;
      } else {
        req.user = null;
        req.userId = null;
      }
      return next();
    }

    const payload = verifyJwt(token);
    if (!payload || !payload.uid) {
      req.user = null;
      req.userId = null;
      return next();
    }
    const uid = payload.uid;
    const userDoc = await collections.users.doc(uid).get().catch(() => null);
    if (!userDoc || !userDoc.exists) {
      req.user = null;
      req.userId = null;
      return next();
    }
    const userData = userDoc.data();
    if (userData.isBanned) {
      return res.status(403).json({
        success: false,
        error: { code: 'USER_BANNED', message: 'Your account has been banned.' }
      });
    }
    req.user = {
      id: uid,
      name: userData.name,
      email: userData.email,
      isAdmin: !!userData.isAdmin,
      isAgent: !!userData.isAgent,
      isGuest: !!userData.isGuest,
      profilePhotoUrl: userData.profilePhotoUrl || null,
      ...userData
    };
    req.userId = uid;
    next();
  } catch (error) {
    req.user = null;
    req.userId = null;
    next();
  }
}

module.exports = { verifyToken };
