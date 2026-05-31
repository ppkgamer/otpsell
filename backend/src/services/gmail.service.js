const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(userId) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: userId,
    prompt: 'consent', // always prompt so we get refresh_token
  });
}

async function handleCallback(code, userId) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress;

  await prisma.gmailAccount.upsert({
    where: { userId_email: { userId, email } },
    update: {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
      isActive: true,
    },
    create: {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userId,
    },
  });

  return email;
}

function extractOTP(text) {
  const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Keywords across major languages
  const keywordPattern = [
    // English
    'otp', 'one.time', 'passcode', 'pass.code', 'access.code',
    'verification.code', 'verify', 'confirm', 'pin', 'token',
    'security.code', 'auth.code', 'login.code', 'sign.in.code',
    // Thai
    'รหัส', 'รหัสผ่าน', 'รหัสยืนยัน',
    // Japanese
    'コード', '確認コード', '認証コード', 'ワンタイム',
    // Chinese
    '验证码', '驗證碼', '短信验证码', '动态密码',
    // Korean
    '인증코드', '인증번호', '확인코드',
    // Spanish / Portuguese
    'código', 'codigo', 'verificación', 'verificacao',
    // French / German
    'code', 'code de', 'bestätigung',
    // Russian
    'код', 'пароль',
  ].join('|');

  const keywordMatch = clean.match(
    new RegExp(`(?:${keywordPattern})[^\\d]{0,30}(\\d{4,8})`, 'i')
  );
  if (keywordMatch) return keywordMatch[1];

  // 6 digits isolated (most common OTP)
  const six = clean.match(/\b(\d{6})\b/);
  if (six) return six[1];

  // 4-8 digits fallback
  const other = clean.match(/\b(\d{4,8})\b/);
  if (other) return other[1];

  return null;
}

// ── Netflix Household detection ──────────────────────────────
function isNetflixHousehold(subject, sender) {
  const sub = (subject || '').toLowerCase();
  const from = (sender || '').toLowerCase();
  // ถ้า subject ชัดเจนมากพอ ไม่ต้อง require netflix ใน sender
  const subjectIsObvious = sub.includes('ครัวเรือน') || sub.includes('household');
  if (!from.includes('netflix') && !subjectIsObvious) return false;

  const keywords = [
    // English
    'household', 'update your netflix', 'update netflix', 'primary location',
    // Thai
    'ครัวเรือน', 'อัพเดต',
    // Japanese
    '世帯', 'ネットフリックス', '確認',
    // Chinese (Simplified & Traditional)
    '家庭', '更新', '家庭成员',
    // Korean
    '가구', '업데이트', '넷플릭스',
    // Spanish
    'hogar', 'actualizar', 'actualización',
    // French
    'foyer', 'mettre à jour', 'mise à jour',
    // German
    'haushalt', 'aktualisieren',
    // Portuguese
    'domicílio', 'atualizar', 'residência',
    // Italian
    'famiglia', 'aggiornare',
    // Dutch
    'huishouden', 'bijwerken',
    // Polish
    'gospodarstwo', 'aktualizacja',
    // Turkish
    'hane', 'güncelle',
    // Arabic
    'منزل', 'تحديث',
  ];

  return keywords.some(kw => sub.includes(kw));
}

function extractHouseholdLink(html) {
  // Strategy 1: Find href closest to the CTA button text
  const ctaTexts = [
    // Thai
    'ใช่.*?เป็นคนขอ', 'ยืนยัน.*?คำขอ', 'อัพเดตครัวเรือน',
    // English
    'yes,? this was me', 'yes,? i requested', 'confirm.*?request', 'update.*?household',
    // Japanese
    'はい.*?私です', 'リクエストを確認',
    // Chinese
    '是的.*?是我', '确认请求', '確認請求',
    // Korean
    '예.*?저입니다', '요청 확인',
    // Spanish
    'sí.*?fui yo', 'sí.*?yo',
    // French
    'oui.*?c\'est moi', 'confirmer',
    // German
    'ja.*?war ich', 'bestätigen',
    // Portuguese
    'sim.*?fui eu', 'confirmar',
    // Italian
    'sì.*?ero io', 'conferma',
    // Dutch
    'ja.*?was ik', 'bevestigen',
  ];

  for (const pattern of ctaTexts) {
    // href before button text
    const before = new RegExp(`href="([^"]{30,})"[^>]*>(?:[^<]*<[^>]*>){0,5}[^<]*(?:${pattern})`, 'is');
    const mBefore = html.match(before);
    if (mBefore?.[1] && !mBefore[1].includes('unsubscribe')) {
      return mBefore[1].replace(/&amp;/g, '&');
    }

    // href after button text
    const after = new RegExp(`(?:${pattern})[^<]*(?:<[^>]*>){0,5}[^<]*<a[^>]+href="([^"]{30,})"`, 'is');
    const mAfter = html.match(after);
    if (mAfter?.[1] && !mAfter[1].includes('unsubscribe')) {
      return mAfter[1].replace(/&amp;/g, '&');
    }
  }

  // Strategy 2: Netflix-specific URL pattern
  const allHrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  for (const href of allHrefs) {
    if (/netflix\.com.*(?:household|update.+location|update.+primary|update.+home)/i.test(href)) {
      return href;
    }
  }

  // Strategy 3: Any long Netflix URL (likely the action link)
  for (const href of allHrefs) {
    if (href.includes('netflix.com') && href.length > 60 && !href.includes('unsubscribe') && !href.includes('help')) {
      return href;
    }
  }

  return null;
}

function getBodyFromPayload(payload) {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const body = getBodyFromPayload(part);
      if (body) return body;
    }
  }
  return '';
}

function getHtmlBodyFromPayload(payload) {
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const html = getHtmlBodyFromPayload(part);
      if (html) return html;
    }
  }
  return '';
}

async function pollGmailAccount(gmailAccount) {
  const auth = createOAuthClient();
  auth.setCredentials({
    access_token: gmailAccount.accessToken,
    refresh_token: gmailAccount.refreshToken,
  });

  // Persist refreshed access token automatically
  auth.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.gmailAccount.update({
        where: { id: gmailAccount.id },
        data: { accessToken: tokens.access_token },
      });
    }
  });

  const gmail = google.gmail({ version: 'v1', auth });

  const since = gmailAccount.lastPolledAt
    ? Math.floor(gmailAccount.lastPolledAt.getTime() / 1000)
    : Math.floor((Date.now() - 30000) / 1000);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `after:${since}`,
    maxResults: 10,
  });

  const messages = listRes.data.messages || [];
  const newOtps = [];

  for (const msg of messages) {
    const exists = await prisma.otp.findUnique({
      where: { messageId_gmailAccountId: { messageId: msg.id, gmailAccountId: gmailAccount.id } },
    });
    if (exists) continue;

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });

    const headers = detail.data.payload.headers;
    const sender = headers.find((h) => h.name === 'From')?.value ?? null;
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? null;
    const dateStr = headers.find((h) => h.name === 'Date')?.value;

    const body = getBodyFromPayload(detail.data.payload);
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    // Netflix Household email → extract confirmation link
    if (isNetflixHousehold(subject, sender)) {
      const htmlBody = getHtmlBodyFromPayload(detail.data.payload);
      const link = extractHouseholdLink(htmlBody || body);
      if (link) {
        newOtps.push({
          type: 'household_link',
          code: link,
          sender,
          subject,
          messageId: msg.id,
          gmailAccountId: gmailAccount.id,
          receivedAt,
        });
        console.log(`[poll] Netflix household link found in ${gmailAccount.email}`);
      }
    } else {
      // Normal email → extract OTP digits
      const code = extractOTP((subject ?? '') + ' ' + body);
      if (code) {
        newOtps.push({
          type: 'otp',
          code,
          sender,
          subject,
          messageId: msg.id,
          gmailAccountId: gmailAccount.id,
          receivedAt,
        });
      }
    }
  }

  await prisma.gmailAccount.update({
    where: { id: gmailAccount.id },
    data: { lastPolledAt: new Date() },
  });

  return newOtps;
}

module.exports = { getAuthUrl, handleCallback, pollGmailAccount, isNetflixHousehold, extractHouseholdLink };
