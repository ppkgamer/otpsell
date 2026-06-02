const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

async function getAccessibleGmailIds(userId, role) {
  if (role === 'ADMIN') {
    const all = await prisma.gmailAccount.findMany({ select: { id: true } });
    return all.map((a) => a.id);
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

// GET /api/otp — flat list
router.get('/', authenticate, async (req, res) => {
  try {
    const { gmailAccountId, limit = '50' } = req.query;
    let ids = await getAccessibleGmailIds(req.userId, req.userRole);

    if (gmailAccountId) {
      if (!ids.includes(gmailAccountId)) return res.status(403).json({ error: 'Access denied' });
      ids = [gmailAccountId];
    }

    const otps = await prisma.otp.findMany({
      where: { gmailAccountId: { in: ids } },
      include: { gmailAccount: { select: { email: true } } },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(parseInt(limit), 200),
    });

    // dedup by messageId — ถ้า Gmail เดียวกันเชื่อมกับหลาย account ให้แสดงแค่ครั้งเดียว
    const seen = new Set();
    const deduped = otps.filter(o => {
      if (seen.has(o.messageId)) return false;
      seen.add(o.messageId);
      return true;
    });

    res.json(deduped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/otp/feed?apikey=xxx&since=ms&subuserid=xxx — server-to-server feed
router.get('/feed', async (req, res) => {
  const { apikey, since, limit = '100', subuserid } = req.query;
  if (!process.env.OTP_FEED_API_KEY || apikey !== process.env.OTP_FEED_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  try {
    let gmailIds;

    if (subuserid) {
      // กรองเฉพาะ Gmail ที่ assign ให้ sub-user นี้
      const assignments = await prisma.subUserGmail.findMany({
        where: { subUserId: subuserid },
        select: { gmailAccountId: true },
      });
      if (assignments.length === 0) return res.json([]);
      gmailIds = assignments.map(a => a.gmailAccountId);
    }

    const where = {
      ...(gmailIds && { gmailAccountId: { in: gmailIds } }),
      ...(since && { receivedAt: { gt: new Date(parseInt(since)) } }),
    };

    const otps = await prisma.otp.findMany({
      where,
      include: { gmailAccount: { select: { email: true, provider: true } } },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(parseInt(limit), 500),
    });
    res.json(otps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/otp/latest — 5 OTP ล่าสุดต่อ Gmail (grouped)
router.get('/latest', authenticate, async (req, res) => {
  try {
    const ids = await getAccessibleGmailIds(req.userId, req.userRole);

    const gmailAccounts = await prisma.gmailAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, isActive: true },
    });

    const grouped = await Promise.all(
      gmailAccounts.map(async (account) => {
        const otps = await prisma.otp.findMany({
          where: { gmailAccountId: account.id },
          orderBy: { receivedAt: 'desc' },
          take: 5,
          select: { id: true, code: true, sender: true, subject: true, receivedAt: true },
        });
        return { ...account, otps };
      })
    );

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
