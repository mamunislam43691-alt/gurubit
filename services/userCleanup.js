/**
 * userCleanup.js
 * Central utility for completely deleting a user and ALL associated data.
 * Used by: admin delete, agent delete/reject, unverified user expiry cleanup.
 *
 * Collections cleaned up:
 *   users, sessions, phoneNumbers, smsMessages, withdrawalRequests,
 *   agentApprovals, userApiKeys, emailVerifyCodes,
 *   guruPosts, guruFollows, guruLikes, guruComments, guruReports,
 *   guruGroupMessages, groupMembers, supportSessions, supportMessages
 */

const { collections, db } = require('../config/db');

/**
 * Delete every document related to a user across all collections.
 * @param {string} userId
 * @returns {Promise<{ deleted: string[] }>} list of collections that had data removed
 */
async function deleteUserAndAllData(userId) {
  const deleted = [];

  // Helper: delete all docs from a query snapshot
  async function wipe(snap, label) {
    if (!snap || snap.size === 0) return;
    await Promise.all(snap.docs.map(d => d.ref.delete().catch(() => {})));
    deleted.push(label);
  }

  // Helper: query + wipe in one step
  async function queryWipe(col, field, label) {
    try {
      const snap = await collections[col].where(field, '==', userId).get();
      await wipe(snap, label);
    } catch (e) {
      console.warn(`[UserCleanup] ${label} error:`, e.message);
    }
  }

  // 1. Sessions
  await queryWipe('sessions', 'userId', 'sessions');

  // 2. Phone numbers this user requested
  await queryWipe('phoneNumbers', 'userId', 'phoneNumbers');

  // 3. SMS messages received on their numbers
  await queryWipe('smsMessages', 'userId', 'smsMessages');

  // 4. Withdrawal requests
  await queryWipe('withdrawalRequests', 'userId', 'withdrawalRequests');

  // 5. Agent approval records
  await queryWipe('agentApprovals', 'userId', 'agentApprovals');

  // 6. User API keys
  await queryWipe('userApiKeys', 'userId', 'userApiKeys');

  // 7. Email verify codes (by email — need to look up email first)
  try {
    const userDoc = await collections.users.doc(userId).get();
    if (userDoc.exists) {
      const email = userDoc.data().email;
      if (email) {
        const codeSnap = await collections.emailVerifyCodes
          .where('email', '==', email)
          .get();
        await wipe(codeSnap, 'emailVerifyCodes');
        // Also reset codes
        const resetSnap = await collections.emailVerifyCodes
          .where('email', '==', `reset_${email}`)
          .get();
        await wipe(resetSnap, 'emailVerifyCodesReset');
      }
    }
  } catch (e) {
    console.warn('[UserCleanup] emailVerifyCodes error:', e.message);
  }

  // 8. Guru social posts
  await queryWipe('guruPosts', 'userId', 'guruPosts');

  // 9. Guru follows (as follower and as following)
  try {
    const [followerSnap, followingSnap] = await Promise.all([
      collections.guruFollows.where('followerId', '==', userId).get(),
      collections.guruFollows.where('followingId', '==', userId).get()
    ]);
    await wipe(followerSnap, 'guruFollows_follower');
    await wipe(followingSnap, 'guruFollows_following');
  } catch (e) {
    console.warn('[UserCleanup] guruFollows error:', e.message);
  }

  // 10. Guru likes
  await queryWipe('guruLikes', 'userId', 'guruLikes');

  // 11. Guru comments
  await queryWipe('guruComments', 'userId', 'guruComments');

  // 12. Guru reports (by reporter)
  await queryWipe('guruReports', 'reporterId', 'guruReports');

  // 13. Guru group messages
  await queryWipe('guruGroupMessages', 'userId', 'guruGroupMessages');

  // 14. Group memberships
  await queryWipe('groupMembers', 'userId', 'groupMembers');

  // 15. Support sessions and their messages
  try {
    const supportSnap = await collections.supportSessions
      .where('visitorUid', '==', userId)
      .get();
    if (supportSnap.size > 0) {
      const sessionIds = supportSnap.docs.map(d => d.id);
      for (const sid of sessionIds) {
        const msgSnap = await collections.supportMessages
          .where('sessionId', '==', sid)
          .get();
        await wipe(msgSnap, `supportMessages_${sid}`);
      }
      await wipe(supportSnap, 'supportSessions');
    }
  } catch (e) {
    console.warn('[UserCleanup] supportSessions error:', e.message);
  }

  // 16. Finally delete the user document itself
  try {
    await collections.users.doc(userId).delete();
    deleted.push('users');
  } catch (e) {
    console.warn('[UserCleanup] user document error:', e.message);
  }

  return { deleted };
}

/**
 * Auto-cleanup job: delete users who registered but never verified their email.
 * Called on server startup (after 15min delay) and then every 30 minutes.
 * Grace period: 15 minutes after account creation.
 */
async function cleanupUnverifiedUsers() {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
    const snap = await collections.users
      .where('emailVerified', '==', false)
      .get();

    if (snap.size === 0) return;

    let count = 0;
    for (const doc of snap.docs) {
      const u = doc.data();
      // Only delete if account was created more than 15 minutes ago
      if (u.createdAt && u.createdAt < cutoff) {
        // Also skip agents and admins just in case
        if (u.isAgent || u.isAdmin) continue;
        await deleteUserAndAllData(doc.id);
        count++;
      }
    }

    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} unverified user account(s)`);
    }
  } catch (e) {
    console.warn('[UserCleanup] cleanupUnverifiedUsers error:', e.message);
  }
}

/**
 * Start the periodic cleanup scheduler.
 * First run after 15 minutes, then every 30 minutes.
 */
function startCleanupScheduler() {
  // First run after 15 minutes (let the server fully start first)
  const firstRun = setTimeout(() => {
    cleanupUnverifiedUsers();
  }, 15 * 60 * 1000);
  if (firstRun.unref) firstRun.unref();

  // Then every 30 minutes
  const interval = setInterval(() => {
    cleanupUnverifiedUsers();
  }, 30 * 60 * 1000);
  if (interval.unref) interval.unref();

  console.log('🧹 Unverified user cleanup scheduler started (runs every 30 min)');
}

module.exports = { deleteUserAndAllData, cleanupUnverifiedUsers, startCleanupScheduler };
