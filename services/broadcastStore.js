/**
 * Broadcast messages to users (in-memory)
 */

const { randomBytes } = require('crypto');

const broadcasts = [];

function createBroadcast({ title, message, createdBy }) {
  const item = {
    id: `bc_${Date.now()}_${randomBytes(3).toString('hex')}`,
    title: title.trim(),
    message: message.trim(),
    createdBy: createdBy || 'admin',
    createdAt: new Date().toISOString(),
    status: 'sent'
  };
  broadcasts.unshift(item);
  return item;
}

function listBroadcasts() {
  return broadcasts;
}

module.exports = { createBroadcast, listBroadcasts };
