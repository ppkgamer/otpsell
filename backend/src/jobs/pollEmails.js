const cron = require('node-cron');
const { pollGmailAccount, recoverToEmailForAccount } = require('../services/gmail.service');
const { pollHotmailAccount } = require('../services/hotmail.service');
const prisma = require('../lib/prisma');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let accountsCache = null;
let cacheExpiry = 0;

async function getAccounts() {
  if (accountsCache && Date.now() < cacheExpiry) {
    return accountsCache;
  }

  accountsCache = await prisma.gmailAccount.findMany({
    where: { isActive: true, user: { isActive: true } },
    select: {
      id: true,
      email: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      lastPolledAt: true,
      isActive: true,
    },
  });
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return accountsCache;
}

function invalidateAccountsCache() {
  cacheExpiry = 0;
}

async function runPoll() {
  let accounts;
  try {
    accounts = await getAccounts();
  } catch (err) {
    console.error('[poll] Error fetching accounts:', err.message);
    return;
  }

  if (accounts.length === 0) return;

  for (const account of accounts) {
    try {
      const pollFn = account.provider === 'hotmail' ? pollHotmailAccount : pollGmailAccount;
      const otps = await pollFn(account);
      account.lastPolledAt = new Date();
      if (otps.length > 0) {
        await prisma.otp.createMany({ data: otps, skipDuplicates: true });
        console.log(`[poll] ${account.email}: ${otps.length} item(s) found`);
      }
    } catch (err) {
      console.error(`[poll] Error on ${account.email}:`, err.message);
    }
  }
}

async function runToEmailRecovery() {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const pending = await prisma.otp.findMany({
      where: {
        toEmail: null,
        receivedAt: { gt: twoHoursAgo },
        gmailAccount: { provider: 'gmail' },
      },
      select: { gmailAccountId: true },
      distinct: ['gmailAccountId'],
    });

    if (pending.length === 0) return;

    const accounts = await prisma.gmailAccount.findMany({
      where: { id: { in: pending.map(p => p.gmailAccountId) } },
      select: { id: true, email: true, accessToken: true, refreshToken: true },
    });

    let total = 0;
    for (const account of accounts) {
      try {
        total += await recoverToEmailForAccount(account);
      } catch (err) {
        console.error(`[toEmail-recovery] Error on ${account.email}:`, err.message);
      }
    }
    if (total > 0) {
      console.log(`[toEmail-recovery] Recovered ${total} toEmail value(s)`);
    }
  } catch (err) {
    console.error('[toEmail-recovery] Error:', err.message);
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
  cron.schedule('*/20 * * * * *', runPoll);
  cron.schedule('*/10 * * * *', runCleanup); // cleanup every 10 minutes
  cron.schedule('*/5 * * * *', runToEmailRecovery); // toEmail recovery every 5 minutes
  runCleanup(); // cleanup on startup
  console.log('[poll] Job started — every 20 seconds');
  console.log('[cleanup] Job started — every 10 minutes');
  console.log('[toEmail-recovery] Job started — every 5 minutes');
}

module.exports = { startPollingJob, invalidateAccountsCache };
