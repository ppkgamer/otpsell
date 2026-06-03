const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const {
  isNetflixOTP, extractOTP,
  isNetflixHousehold, extractHouseholdLink,
  isNetflixNewDevice, extractPasswordResetLink,
  isNetflixTempCode, extractTempCodeLink,
  extractOriginalRecipient,
} = require('./gmail.service');

const prisma = new PrismaClient();

// /common = personal (Hotmail/Outlook.com) + organizational accounts
const MS_AUTH_BASE   = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_BASE     = 'https://graph.microsoft.com/v1.0';
const SCOPES         = 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access';

function getAuthUrl(userId) {
  // ใช้ encodeURIComponent แทน URLSearchParams เพื่อกัน space → %20 (ไม่ใช่ +)
  const q = [
    `client_id=${process.env.MS_CLIENT_ID}`,
    `response_type=code`,
    `redirect_uri=${encodeURIComponent(process.env.MS_REDIRECT_URI)}`,
    `scope=${encodeURIComponent(SCOPES)}`,
    `state=${encodeURIComponent(userId)}`,
  ].join('&');
  return `${MS_AUTH_BASE}/authorize?${q}`;
}

async function getTokens(code) {
  const res = await axios.post(
    `${MS_AUTH_BASE}/token`,
    new URLSearchParams({
      client_id:     process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      code,
      redirect_uri:  process.env.MS_REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const res = await axios.post(
    `${MS_AUTH_BASE}/token`,
    new URLSearchParams({
      client_id:     process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
      scope:         SCOPES,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

async function getValidToken(account) {
  return account.accessToken;
}

async function refreshIfNeeded(account, err) {
  if (err.response?.status !== 401) throw err;
  const refreshed = await refreshAccessToken(account.refreshToken);
  const newToken = refreshed.access_token;
  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: {
      accessToken: newToken,
      ...(refreshed.refresh_token && { refreshToken: refreshed.refresh_token }),
    },
  });
  return newToken;
}

async function handleCallback(code, userId, isAdminManaged = false) {
  const tokens = await getTokens(code);

  const res = await axios.get(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const email = res.data.mail || res.data.userPrincipalName;

  await prisma.gmailAccount.upsert({
    where: { userId_email: { userId, email } },
    update: {
      accessToken:  tokens.access_token,
      provider:     'hotmail',
      isActive:     true,
      isAdminManaged,
      ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
    },
    create: {
      email,
      provider:      'hotmail',
      accessToken:   tokens.access_token,
      refreshToken:  tokens.refresh_token || '',
      userId,
      isAdminManaged,
    },
  });

  return email;
}

function isNetflixSender(sender) {
  return (sender || '').toLowerCase().includes('netflix.com');
}

async function pollHotmailAccount(account) {
  let token = await getValidToken(account);

  const since = account.lastPolledAt
    ? account.lastPolledAt.toISOString()
    : new Date(Date.now() - 30000).toISOString();

  let listRes;
  try {
    listRes = await axios.get(`${GRAPH_BASE}/me/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        $filter:  `receivedDateTime gt ${since}`,
        $top:     10,
        $select:  'id,subject,from,receivedDateTime,body,bodyPreview',
        $orderby: 'receivedDateTime desc',
      },
    });
  } catch (err) {
    // token หมดอายุ — refresh แล้วลองใหม่
    token = await refreshIfNeeded(account, err);
    listRes = await axios.get(`${GRAPH_BASE}/me/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        $filter:  `receivedDateTime gt ${since}`,
        $top:     10,
        $select:  'id,subject,from,receivedDateTime,body,bodyPreview',
        $orderby: 'receivedDateTime desc',
      },
    });
  }

  const messages = listRes.data.value || [];
  const newOtps  = [];

  for (const msg of messages) {
    const exists = await prisma.otp.findUnique({
      where: { messageId_gmailAccountId: { messageId: msg.id, gmailAccountId: account.id } },
    });
    if (exists) continue;

    const sender  = msg.from?.emailAddress?.address || '';
    const subject = msg.subject || '';
    const body    = msg.body?.content || msg.bodyPreview || '';
    const receivedAt = new Date(msg.receivedDateTime);
    const toEmail = extractOriginalRecipient(body);

    if (!isNetflixSender(sender)) continue;

    if (isNetflixNewDevice(subject)) {
      const link = extractPasswordResetLink(body);
      if (link) {
        newOtps.push({ type: 'password_reset_link', code: link, sender, toEmail, subject, messageId: msg.id, gmailAccountId: account.id, receivedAt });
        console.log(`[hotmail-poll] Netflix password reset link in ${account.email}`);
      }
    } else if (isNetflixHousehold(subject, sender)) {
      const link = extractHouseholdLink(body);
      if (link) {
        newOtps.push({ type: 'household_link', code: link, sender, toEmail, subject, messageId: msg.id, gmailAccountId: account.id, receivedAt });
        console.log(`[hotmail-poll] Netflix household link in ${account.email}`);
      }
    } else if (isNetflixTempCode(subject)) {
      const link = extractTempCodeLink(body);
      if (link) {
        newOtps.push({ type: 'temp_code_link', code: link, sender, toEmail, subject, messageId: msg.id, gmailAccountId: account.id, receivedAt });
        console.log(`[hotmail-poll] Netflix temp code link in ${account.email}`);
      }
    } else if (isNetflixOTP(subject, body)) {
      const code = extractOTP(subject + ' ' + body);
      if (code) {
        newOtps.push({ type: 'otp', code, sender, toEmail, subject, messageId: msg.id, gmailAccountId: account.id, receivedAt });
        console.log(`[hotmail-poll] Netflix OTP ${code} (to: ${toEmail ?? 'unknown'}) in ${account.email}`);
      }
    }
  }

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: { lastPolledAt: new Date() },
  });

  return newOtps;
}

module.exports = { getAuthUrl, handleCallback, pollHotmailAccount };
