const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticate, requireRole } = require('../middleware/auth');
const PLANS = require('../config/plans');
const prisma = require('../lib/prisma');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function generateUniqueCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  for (let i = 0; i < 30; i++) {
    let code = '';
    for (let j = 0; j < 2; j++) code += letters[Math.floor(Math.random() * letters.length)];
    for (let j = 0; j < 4; j++) code += digits[Math.floor(Math.random() * digits.length)];
    const exists = await prisma.user.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error('Cannot generate unique code');
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password)
      return res.status(400).json({ error: 'email, username, password required' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username, password: hashed, role: 'USER', plan: 'FREE' },
      select: { id: true, email: true, username: true, role: true, plan: true },
    });
    res.json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Email or username already taken' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ error: 'Account disabled' });

    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, username: user.username, role: user.role, plan: user.plan },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/code-login
router.post('/code-login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const user = await prisma.user.findUnique({ where: { code: code.toUpperCase() } });
    if (!user || user.role !== 'SUBUSER') return res.status(401).json({ error: 'รหัสไม่ถูกต้อง' });
    if (!user.isActive) return res.status(403).json({ error: 'บัญชีถูกปิดใช้งาน' });
    res.json({
      token: signToken(user),
      user: { id: user.id, username: user.username, role: user.role, code: user.code },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, username: true, role: true, plan: true, code: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/password — change own password
router.patch('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/subuser — USER creates sub-user
router.post('/subuser', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });

    // เช็ค plan limit
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const limit = PLANS[user.plan].maxSubUsers;
    if (limit !== -1) {
      const count = await prisma.user.count({ where: { parentId: req.userId, role: 'SUBUSER' } });
      if (count >= limit)
        return res.status(403).json({ error: `Plan ${user.plan} รองรับ sub-user ได้สูงสุด ${limit} คน` });
    }

    const code = await generateUniqueCode();
    const email = `${code.toLowerCase()}@subuser.internal`;
    const password = await bcrypt.hash(code, 10);

    const subUser = await prisma.user.create({
      data: { email, username, password, code, role: 'SUBUSER', parentId: req.userId },
      select: { id: true, username: true, code: true, role: true, isActive: true, createdAt: true },
    });
    res.json(subUser);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username already taken' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/subusers
router.get('/subusers', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const subUsers = await prisma.user.findMany({
      where: { parentId: req.userId, role: 'SUBUSER' },
      select: {
        id: true, username: true, code: true, isActive: true, createdAt: true,
        assignedGmails: { include: { gmailAccount: { select: { id: true, email: true, isAdminManaged: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ subUsers, plan: user.plan }); // return string 'FREE'|'BASIC'|'PRO'
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/subuser/:id/toggle
router.patch('/subuser/:id/toggle', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const su = await prisma.user.findFirst({ where: { id: req.params.id, parentId: req.userId } });
    if (!su) return res.status(404).json({ error: 'Sub-user not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !su.isActive },
      select: { id: true, isActive: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/subuser/:id
router.delete('/subuser/:id', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const su = await prisma.user.findFirst({ where: { id: req.params.id, parentId: req.userId } });
    if (!su) return res.status(404).json({ error: 'Sub-user not found' });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/subuser/:subUserId/assign
router.post('/subuser/:subUserId/assign', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const { subUserId } = req.params;
    const { gmailAccountId } = req.body;
    const subUser = await prisma.user.findFirst({ where: { id: subUserId, parentId: req.userId } });
    if (!subUser) return res.status(404).json({ error: 'Sub-user not found' });
    const gmail = await prisma.gmailAccount.findFirst({ where: { id: gmailAccountId, userId: req.userId } });
    if (!gmail) return res.status(404).json({ error: 'Gmail account not found' });

    // เช็คว่า Gmail นี้ถูก assign ให้ sub-user อื่นของ user นี้แล้วหรือยัง
    const alreadyAssigned = await prisma.subUserGmail.findFirst({
      where: {
        gmailAccountId,
        subUserId: { not: subUserId },
        subUser: { parentId: req.userId },
      },
    });
    if (alreadyAssigned) {
      return res.status(400).json({ error: 'Gmail นี้ถูก assign ให้ sub-user อื่นแล้ว' });
    }

    const assignment = await prisma.subUserGmail.create({ data: { subUserId, gmailAccountId } });
    res.json(assignment);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Already assigned' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/subuser/:subUserId/assign/:gmailAccountId
router.delete('/subuser/:subUserId/assign/:gmailAccountId', authenticate, requireRole(['USER']), async (req, res) => {
  try {
    const { subUserId, gmailAccountId } = req.params;
    const subUser = await prisma.user.findFirst({ where: { id: subUserId, parentId: req.userId } });
    if (!subUser) return res.status(404).json({ error: 'Sub-user not found' });
    // ป้องกันไม่ให้ user ลบ admin-managed account ออก
    const gmail = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } });
    if (gmail?.isAdminManaged) return res.status(403).json({ error: 'Cannot remove admin-managed account' });
    await prisma.subUserGmail.deleteMany({ where: { subUserId, gmailAccountId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
