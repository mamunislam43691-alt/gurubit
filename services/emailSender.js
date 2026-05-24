/**
 * Optional SMTP email sender (configure in .env)
 */

const { buildVerificationEmail, buildPasswordResetEmail } = require('./verificationEmail');

async function sendVerificationEmail({ to, name, verifyUrl }) {
  const html = buildVerificationEmail({ name, verifyUrl });

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('\n📧 Verification email (SMTP not configured — link for testing):');
    console.log(`   To: ${to}`);
    console.log(`   Activate URL: ${verifyUrl}\n`);
    return { sent: false, preview: true, verifyUrl };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"GURUBIT" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Activate your GURUBIT account',
    html
  });

  return { sent: true };
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const html = buildPasswordResetEmail({ name, resetUrl });

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('\n📧 Password reset email (SMTP not configured):');
    console.log(`   To: ${to}`);
    console.log(`   Reset URL: ${resetUrl}\n`);
    return { sent: false, preview: true, resetUrl };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"GURUBIT" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your GURUBIT password',
    html
  });

  return { sent: true };
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, buildVerificationEmail };
