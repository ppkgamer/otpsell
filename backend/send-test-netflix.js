// ส่ง mock Netflix Household email เพื่อทดสอบระบบ
// รัน: node send-test-netflix.js
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Mock Netflix Household HTML (เหมือนอีเมลจริง)
function buildNetflixHtml(recipientEmail) {
  const fakeLink = `https://www.netflix.com/account/update-primary-location?t=TESTTOKEN_${Date.now()}&authURL=https%3A%2F%2Fwww.netflix.com%2Flogin&trkid=12345678`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:8px;overflow:hidden;">

        <!-- Netflix Logo -->
        <tr>
          <td style="background:#141414;padding:20px 40px;">
            <span style="color:#E50914;font-size:28px;font-weight:bold;letter-spacing:-1px;">NETFLIX</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="color:#333;font-size:16px;line-height:1.6;">
              เราได้รับคำขออัปเดตครัวเรือน Netflix สำหรับบัญชีที่เชื่อมโยงกับ <strong>${recipientEmail}</strong>
            </p>

            <!-- Black card -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#1a1a1a;border:1px solid #333;border-radius:12px;margin:24px 0;">
              <tr>
                <td style="padding:24px;">
                  <!-- Device icon + request info -->
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:40px;vertical-align:top;">
                        <div style="width:32px;height:32px;background:#E50914;border-radius:6px;
                                    display:flex;align-items:center;justify-content:center;">
                          <span style="color:white;font-size:14px;">📺</span>
                        </div>
                      </td>
                      <td style="padding-left:12px;color:#ccc;font-size:14px;line-height:1.8;">
                        ขอโดย <strong style="color:white;">D</strong> จาก <strong style="color:white;">Haier - สมาร์ททีวี</strong><br/>
                        เมื่อ ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}<br/>
                        เวลา ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} ตามเวลา GMT+7
                      </td>
                    </tr>
                  </table>

                  <!-- Red CTA button -->
                  <a href="${fakeLink}"
                     style="display:block;margin-top:20px;padding:16px;
                            background:#E50914;color:white;text-align:center;
                            text-decoration:none;border-radius:6px;
                            font-size:16px;font-weight:bold;">
                    ใช่ ฉันเป็นคนขอ
                  </a>

                  <p style="color:#888;font-size:12px;margin-top:12px;text-align:center;">
                    * ลิงก์จะหมดอายุหลังจากครบ 15 นาที
                  </p>
                </td>
              </tr>
            </table>

            <p style="color:#666;font-size:14px;">
              หากคุณไม่ได้ส่งคำขอนี้ คุณสามารถละเว้นอีเมลนี้ได้
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4f4f4;padding:20px 40px;text-align:center;color:#999;font-size:12px;">
            Netflix International B.V., Filmweg 2, 2153 WT Nieuw-Vennep, Netherlands<br/>
            ส่งถึง ${recipientEmail}
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function makeRawEmail({ from, to, subject, html }) {
  const boundary = 'boundary_' + Date.now();
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    subject,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(raw).toString('base64url');
}

async function main() {
  // หา Gmail account ที่ active อยู่
  const gmailAccounts = await prisma.gmailAccount.findMany({
    where: { isActive: true },
    include: { user: { select: { role: true } } },
  });

  if (gmailAccounts.length === 0) {
    console.log('❌ ไม่มี Gmail account ที่เชื่อมต่อ');
    return;
  }

  console.log(`พบ ${gmailAccounts.length} Gmail account(s):`);
  gmailAccounts.forEach((g, i) => console.log(`  ${i + 1}. ${g.email} (${g.user.role})`));

  // ใช้ account แรก
  const account = gmailAccounts[0];
  console.log(`\n📤 กำลังส่งจาก: ${account.email}`);

  const auth = createOAuthClient();
  auth.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  auth.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.gmailAccount.update({
        where: { id: account.id },
        data: { accessToken: tokens.access_token },
      });
    }
  });

  const gmail = google.gmail({ version: 'v1', auth });

  const html = buildNetflixHtml(account.email);
  const raw = makeRawEmail({
    from: `"Netflix" <info@account.netflix.com>`,
    to: account.email,
    subject: 'อัพเดตครัวเรือน Netflix ของคุณ',
    html,
  });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  console.log('✅ ส่ง mock Netflix Household email แล้ว!');
  console.log(`📧 ไปที่: ${account.email}`);
  console.log('\n⏳ รอ 15-30 วินาที แล้วดูใน OTP dashboard');
  console.log('   ควรเห็น "Household Update Link" card ขึ้นมา');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  prisma.$disconnect();
});
