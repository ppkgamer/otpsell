const express = require('express');
const { authenticate } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { TTLCache } = require('../lib/cache');
const { getAccessibleGmailIds } = require('../lib/access');

const router = express.Router();

// Short-lived caches for the high-traffic public/customer-facing endpoints.
// Keys MUST encode the full identity of the caller (code / subuserid) so a
// cache entry can never be served to a different customer.
const CACHE_TTL_MS = 3000;
const publicFeedCache = new TTLCache(CACHE_TTL_MS);
const serverFeedCache = new TTLCache(CACHE_TTL_MS);

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
    // Cache key fully encodes subuserid/since/limit — a request for one
    // subuser can never be served the cached response for another.
    const cacheKey = `${subuserid || ''}:${since || ''}:${limit}`;
    const otps = await serverFeedCache.getOrSet(cacheKey, async () => {
      let gmailIds;

      if (subuserid) {
        // กรองเฉพาะ Gmail ที่ assign ให้ sub-user นี้
        const assignments = await prisma.subUserGmail.findMany({
          where: { subUserId: subuserid },
          select: { gmailAccountId: true },
        });
        if (assignments.length === 0) return [];
        gmailIds = assignments.map(a => a.gmailAccountId);
      }

      const where = {
        ...(gmailIds && { gmailAccountId: { in: gmailIds } }),
        ...(since && { receivedAt: { gt: new Date(parseInt(since)) } }),
      };

      return prisma.otp.findMany({
        where,
        include: { gmailAccount: { select: { email: true, provider: true } } },
        orderBy: { receivedAt: 'desc' },
        take: Math.min(parseInt(limit), 500),
      });
    });
    res.json(otps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/otp/public?code=YG4324 — public feed ต่อ sub-user (ใช้ code แทน JWT)
router.get('/public', async (req, res) => {
  const { code, limit = '50' } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  try {
    // Cache key encodes the exact code (identity) + limit — each customer's
    // code only ever reads/writes its own cache entry, never another's.
    const cacheKey = `${code.toUpperCase()}:${limit}`;
    const result = await publicFeedCache.getOrSet(cacheKey, async () => {
      const subUser = await prisma.user.findUnique({
        where: { code: code.toUpperCase() },
        select: { id: true, role: true, isActive: true },
      });
      if (!subUser || subUser.role !== 'SUBUSER') return { status: 404, body: { error: 'Invalid code' } };
      if (!subUser.isActive) return { status: 403, body: { error: 'Account disabled' } };

      const assignments = await prisma.subUserGmail.findMany({
        where: { subUserId: subUser.id },
        select: { gmailAccountId: true },
      });
      if (assignments.length === 0) return { status: 200, body: [] };

      const gmailIds = assignments.map(a => a.gmailAccountId);
      const otps = await prisma.otp.findMany({
        where: { gmailAccountId: { in: gmailIds } },
        include: { gmailAccount: { select: { email: true, provider: true } } },
        orderBy: { receivedAt: 'desc' },
        take: Math.min(parseInt(limit), 100),
      });

      // dedup by messageId
      const seen = new Set();
      const deduped = otps.filter(o => {
        if (seen.has(o.messageId)) return false;
        seen.add(o.messageId);
        return true;
      });

      return { status: 200, body: deduped };
    });

    res.status(result.status).json(result.body);
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
