/**
 * Agent accounts & user approvals (in-memory + syncs user flags in Firestore via routes)
 */

const pendingApprovals = new Map();

function queueApproval({ userId, email, name, agentEmail }) {
  const id = `appr_${Date.now()}`;
  const item = {
    id,
    userId,
    email,
    name,
    agentEmail: String(agentEmail || '').toLowerCase(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  pendingApprovals.set(id, item);
  return item;
}

function listPending(agentEmail) {
  const list = Array.from(pendingApprovals.values()).filter((a) => a.status === 'pending');
  if (agentEmail) {
    return list.filter((a) => a.agentEmail === String(agentEmail).toLowerCase());
  }
  return list;
}

function approve(id) {
  const item = pendingApprovals.get(id);
  if (!item) return null;
  item.status = 'approved';
  item.approvedAt = new Date().toISOString();
  return item;
}

function reject(id) {
  const item = pendingApprovals.get(id);
  if (!item) return null;
  item.status = 'rejected';
  return item;
}

function findAgentByEmail(email) {
  return String(email || '').toLowerCase();
}

module.exports = {
  queueApproval,
  listPending,
  approve,
  reject,
  findAgentByEmail
};
