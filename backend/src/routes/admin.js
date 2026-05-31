const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireRole } = require('../middleware/auth');
const PLANS = require('../config/plans');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/admin/users — USER role only
router.get('/users', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'USER' },
      select: {
        id: true, email: true, username: true,
        role: true, plan: true, isActive: true, createdAt: true,
        _count: { select: { gmailAccounts: true, subUsers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id — user detail + sub-users
router.get('/users/:id', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, username: true,
        role: true, plan: true, isActive: true, createdAt: true,
        gmailAccounts: {
          select: { id: true, email: true, isActive: true, lastPolledAt: true, _count: { select: { otps: true } } },
        },
        subUsers: {
          select: {
            id: true, username: true, code: true, isActive: true, createdAt: true,
            assignedGmails: { include: { gmailAccount: { select: { id: true, email: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { gmailAccounts: true, subUsers: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — create user account
router.post('/users', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { email, username, password, plan = 'FREE' } = req.body;
    if (!email || !username || !password)
      return res.status(400).json({ error: 'email, username, password required' });
    if (!['FREE','BASIC','PRO'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan' });

    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username, password: hashed, role: 'USER', plan },
      select: { id: true, email: true, username: true, role: true, plan: true, isActive: true, createdAt: true, _count: { select: { gmailAccounts: true, subUsers: true } } },
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Email or username already taken' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/plan — assign plan to user
router.patch('/users/:id/plan', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['FREE', 'BASIC', 'PRO'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan' });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { plan },
      select: { id: true, username: true, plan: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/toggle
router.patch('/users/:id/toggle', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive },
      select: { id: true, email: true, isActive: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats
router.get('/stats', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const [userCount, gmailCount, otpCount] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.gmailAccount.count({ where: { isActive: true } }),
      prisma.otp.count(),
    ]);
    res.json({ userCount, activeGmailCount: gmailCount, totalOtpCount: otpCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/plans — plan info
router.get('/plans', authenticate, requireRole(['ADMIN']), (req, res) => {
  res.json(PLANS);
});

module.exports = router;
