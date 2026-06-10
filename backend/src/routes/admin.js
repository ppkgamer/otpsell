const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidateAccountsCache } = require('../jobs/pollEmails');
const PLANS = require('../config/plans');
const prisma = require('../lib/prisma');

const router = express.Router();

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

// GET /api/admin/users/:id/gmail/connect — admin เชื่อม Gmail ให้ user (hidden)
router.get('/users/:id/gmail/connect', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { getAuthUrl } = require('../services/gmail.service');
    const url = getAuthUrl(`admin:${req.params.id}`);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id/hotmail/connect — admin เชื่อม Hotmail ให้ user (hidden)
router.get('/users/:id/hotmail/connect', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { getAuthUrl } = require('../services/hotmail.service');
    const url = getAuthUrl(`admin:${req.params.id}`);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id/gmail/:gmailId — admin ลบ gmail ของ user
router.delete('/users/:id/gmail/:gmailId', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const acc = await prisma.gmailAccount.findFirst({ where: { id: req.params.gmailId, userId: req.params.id } });
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    await prisma.gmailAccount.delete({ where: { id: req.params.gmailId } });
    invalidateAccountsCache();
    res.json({ success: true });
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
          select: { id: true, email: true, provider: true, isAdminManaged: true, isActive: true, lastPolledAt: true, _count: { select: { otps: true } } },
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

// DELETE /api/admin/subusers/:subUserId — admin deletes a sub-user
router.delete('/subusers/:subUserId', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const su = await prisma.user.findFirst({ where: { id: req.params.subUserId, role: 'SUBUSER' } });
    if (!su) return res.status(404).json({ error: 'Sub-user not found' });
    await prisma.user.delete({ where: { id: req.params.subUserId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/subusers/:subUserId/assign — admin assigns gmail to sub-user
router.post('/subusers/:subUserId/assign', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { gmailAccountId } = req.body;
    const su = await prisma.user.findFirst({ where: { id: req.params.subUserId, role: 'SUBUSER' } });
    if (!su) return res.status(404).json({ error: 'Sub-user not found' });
    const gmail = await prisma.gmailAccount.findFirst({ where: { id: gmailAccountId, userId: su.parentId } });
    if (!gmail) return res.status(404).json({ error: 'Gmail not found or not owned by this user' });

    const alreadyAssigned = await prisma.subUserGmail.findFirst({
      where: { gmailAccountId, subUserId: { not: req.params.subUserId }, subUser: { parentId: su.parentId } },
    });
    if (alreadyAssigned) return res.status(400).json({ error: 'Gmail already assigned to another sub-user' });

    const assignment = await prisma.subUserGmail.create({
      data: { subUserId: req.params.subUserId, gmailAccountId },
    });
    res.json(assignment);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Already assigned' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/subusers/:subUserId/assign/:gmailAccountId — admin removes gmail assignment
router.delete('/subusers/:subUserId/assign/:gmailAccountId', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    await prisma.subUserGmail.deleteMany({
      where: { subUserId: req.params.subUserId, gmailAccountId: req.params.gmailAccountId },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
