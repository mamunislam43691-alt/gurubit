const { auth } = require('../config/firebase');

async function verifyToken(token) {
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

async function getUser(uid) {
  try {
    return await auth.getUser(uid);
  } catch {
    return null;
  }
}

module.exports = { verifyToken, getUser };
