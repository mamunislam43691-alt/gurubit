/**
 * SMTP email sender — reads config from env vars (set via Render Dashboard or admin panel)
 * Config is also persisted in Firestore so it survives restarts
 */

const { db } = require('../config/firebase');

const SMTP_DOC = 'smtpConfig';

// Load SMTP config from Firestore into process.env on startup
async function loadSmtpFromFirestore() {
  try {
    const doc = await db.collection('appConfig').doc(SMTP_DOC).get();
    if (!doc.exists) return;
    const cfg = doc.data();
    if (cfg.host && !process.env.SMTP_HOST) process.env.SMTP_HOST = cfg.host;
    if (cfg.port && !process.env.SMTP_PORT) process.env.SMTP_PORT = String(cfg.port);
    if (cfg.secure !== undefined && !process.env.SMTP_SECURE) process.env.SMTP_SECURE = String(cfg.secure);
    if (cfg.user && !process.env.SMTP_USER) process.env.SMTP_USER = cfg.user;
    if (cfg.pass && !process.env.SMTP_PASS) process.env.SMTP_PASS = cfg.pass;
    if (cfg.from && !process.env.SMTP_FROM) process.env.SMTP_FROM = cfg.from;
    if (cfg.host) console.log(`✅ SMTP config loaded from Firestore (${cfg.user})`);
  } catch (e) {
    // Firestore not available yet — will use env vars
  }
}

// Save SMTP config to Firestore for persistence across restarts
async function saveSmtpToFirestore(cfg) {
  try {
    await db.collection('appConfig').doc(SMTP_DOC).set({
      host: cfg.host || '',
      port: cfg.port || '587',
      secure: cfg.secure || 'false',
      user: cfg.user || '',
      pass: cfg.pass || '',
      from: cfg.from || '',
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Could not save SMTP to Firestore:', e.message);
  }
}

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function sendVerificationEmail({ to, name, verifyUrl }) {
  const { buildVerificationEmail } = require('./verificationEmail');
  const html = buildVerificationEmail({ name, verifyUrl });

  const transporter = getTransporter();
  if (!transporter) {
    console.log('\n📧 Verification email (SMTP not configured):');
    console.log(`   To: ${to}`);
    console.log(`   Activate URL: ${verifyUrl}\n`);
    return { sent: false, preview: true, verifyUrl };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"GURUBIT" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Activate your GURUBIT account',
    html
  });
  return { sent: true };
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const { buildPasswordResetEmail } = require('./verificationEmail');
  const html = buildPasswordResetEmail({ name, resetUrl });

  const transporter = getTransporter();
  if (!transporter) {
    console.log('\n📧 Password reset email (SMTP not configured):');
    console.log(`   To: ${to}`);
    console.log(`   Reset URL: ${resetUrl}\n`);
    return { sent: false, preview: true, resetUrl };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"GURUBIT" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your GURUBIT password',
    html
  });
  return { sent: true };
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  loadSmtpFromFirestore,
  saveSmtpToFirestore,
  getTransporter
};
