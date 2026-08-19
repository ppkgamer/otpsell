const prisma = require('./prisma');

// แคช id ของทุก gmailAccount สำหรับ ADMIN
const ADMIN_IDS_CACHE_TTL_MS = 60 * 1000; // 1 minute
let adminGmailIdsCache = null;
let adminGmailIdsCacheExpiry = 0;

// Single source of truth for "which gmail accounts can this user see" —
// used by both the REST /api/otp routes and the WS push server so the two
// can never drift apart and leak access across roles/customers.
async function getAccessibleGmailIds(userId, role) {
  if (role === 'ADMIN') {
    if (adminGmailIdsCache && Date.now() < adminGmailIdsCacheExpiry) {
      return adminGmailIdsCache;
    }
    const all = await prisma.gmailAccount.findMany({ select: { id: true } });
    adminGmailIdsCache = all.map((a) => a.id);
    adminGmailIdsCacheExpiry = Date.now() + ADMIN_IDS_CACHE_TTL_MS;
    return adminGmailIdsCache;
  }
  if (role === 'USER') {
    const accounts = await prisma.gmailAccount.findMany({
      where: { userId },
      select: { id: true },
    });
    return accounts.map((a) => a.id);
  }
  // SUBUSER — เห็นเฉพาะที่ User assign ให้
  const assignments = await prisma.subUserGmail.findMany({
    where: { subUserId: userId },
    select: { gmailAccountId: true },
  });
  return assignments.map((a) => a.gmailAccountId);
}

module.exports = { getAccessibleGmailIds };
