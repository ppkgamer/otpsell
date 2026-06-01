const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAuthUrl, handleCallback } = require('../services/gmail.service');
const PLANS = require('../config/plans');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/gmail/connect — returns OAuth2 URL (เช็ค plan limit ก่อน)
router.get('/connect', authenticate, requireRole(['USER', 'ADMIN']), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const limit = PLANS[user.plan].maxGmails;
    if (limit !== -1) {
      const count = await prisma.gmailAccount.count({ where: { userId: req.userId } });
      if (count >= limit)
        return res.status(403).json({ error: `Plan ${user.plan} เพิ่ม Gmail ได้สูงสุด ${limit} บัญชี` });
    }
    const url = getAuthUrl(req.userId);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gmail/callback — Google redirects here after auth
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/dashboard?gmail=error&reason=missing_params`);
  }

  try {
    const email = await handleCallback(code, userId);
    res.redirect(`${frontendUrl}/dashboard?gmail=connected&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('[gmail] OAuth callback error:', err.message);
    res.redirect(`${frontendUrl}/dashboard?gmail=error`);
  }
});

// GET /api/gmail/accounts — list User's own Gmail accounts
router.get('/accounts', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const accounts = await prisma.gmailAccount.findMany({
      where: { userId: req.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        lastPolledAt: true,
        createdAt: true,
        _count: { select: { otps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/gmail/accounts/:id/toggle
router.patch('/accounts/:id/toggle', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const account = await prisma.gmailAccount.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const updated = await prisma.gmailAccount.update({
      where: { id: req.params.id },
      data: { isActive: !account.isActive },
      select: { id: true, email: true, isActive: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/gmail/accounts/:id
router.delete('/accounts/:id', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const account = await prisma.gmailAccount.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    await prisma.gmailAccount.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
