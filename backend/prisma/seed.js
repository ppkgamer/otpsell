require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@otpreader.com' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@otpreader.com',
      username: 'admin',
      password,
      role: 'ADMIN',
      credit: 999999,
    },
  });

  console.log('Admin account ready:', admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
