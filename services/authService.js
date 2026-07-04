/**
 * Auth Service — JWT issuance + verification.
 * JWT-based token signing. Tokens are signed with SESSION_SECRET
 * and stored as the sessionToken cookie.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SECRET = () =>
  process.env.SESSION_SECRET ||
  process.env.JWT_SECRET ||
  'gurubit-dev-secret-change-me';

const SESSION_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '24', 10);
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

function signToken(userId, extra = {}) {
  return jwt.sign({ uid: userId, ...extra }, SECRET(), {
    expiresIn: `${SESSION_HOURS}h`,
    algorithm: 'HS256'
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET(), { algorithms: ['HS256'] });
  } catch (_) {
    return null;
  }
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function comparePassword(password, hashed) {
  if (!hashed) return false;
  try {
    return await bcrypt.compare(password, hashed);
  } catch (_) {
    return false;
  }
}

function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  comparePassword,
  genId,
  SESSION_MS
};
