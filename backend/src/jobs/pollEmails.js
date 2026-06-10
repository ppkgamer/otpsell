const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { pollGmailAccount } = require('../services/gmail.service');
const { pollHotmailAccount } = require('../services/hotmail.service');

const prisma = new PrismaClient();

async function runPoll() {
  let accounts;
  try {
    accounts = await prisma.gmailAccount.findMany({
      where: { isActive: true, user: { isActive: true } },
    });
  } catch (err) {
    console.error('[poll] Error fetching accounts:', err.message);
    return;
  }

  if (accounts.length === 0) return;

  for (const account of accounts) {
    try {
      const pollFn = account.provider === 'hotmail' ? pollHotmailAccount : pollGmailAccount;
      const otps = await pollFn(account);
      if (otps.length > 0) {
        await prisma.otp.createMany({ data: otps, skipDuplicates: true });
        console.log(`[poll] ${account.email}: ${otps.length} item(s) found`);
      }
    } catch (err) {
      console.error(`[poll] Error on ${account.email}:`, err.message);
    }
  }
}

async function runCleanup() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await prisma.otp.deleteMany({
      where: { receivedAt: { lt: oneHourAgo } },
    });
    if (result.count > 0) {
      console.log(`[cleanup] Deleted ${result.count} OTP(s) older than 1 hour`);
    }
  } catch (err) {
    console.error('[cleanup] Error:', err.message);
  }
}

function startPollingJob() {
  cron.schedule('*/15 * * * * *', runPoll);
  cron.schedule('*/10 * * * *', runCleanup); // cleanup every 10 minutes
  runCleanup(); // cleanup on startup
  console.log('[poll] Job started — every 15 seconds');
  console.log('[cleanup] Job started — every 10 minutes');
}

module.exports = { startPollingJob };
