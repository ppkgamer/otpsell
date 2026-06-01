const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAuthUrl, handleCallback } = require('../services/hotmail.service');
const PLANS = require('../config/plans');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/hotmail/connect
router.get('/connect', authenticate, requireRole(['USER', 'ADMIN']), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const limit = PLANS[user.plan].maxGmails;
    if (limit !== -1) {
      const count = await prisma.gmailAccount.count({ where: { userId: req.userId } });
      if (count >= limit)
        return res.status(403).json({ error: `Plan ${user.plan} เพิ่มบัญชีได้สูงสุด ${limit} บัญชี` });
    }
    const url = getAuthUrl(req.userId);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hotmail/callback
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/dashboard?hotmail=error&reason=missing_params`);
  }

  try {
    const email = await handleCallback(code, userId);
    res.redirect(`${frontendUrl}/dashboard?hotmail=connected&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('[hotmail] OAuth callback error:', err.message, err.response?.data);
    const reason = encodeURIComponent(err.message || 'unknown');
    res.redirect(`${frontendUrl}/dashboard?hotmail=error&reason=${reason}`);
  }
});

module.exports = router;
