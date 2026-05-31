// ทดสอบ Netflix Household detection โดยไม่ต้องรอ email จริง
// รัน: node test-household.js

const { isNetflixHousehold, extractHouseholdLink } = require('./src/services/gmail.service');

// ── ตัวอย่าง HTML จาก Netflix (ภาษาไทย) ─────────────────────
const mockThaiHtml = `
<html><body>
  <table>
    <tr><td>Netflix</td></tr>
    <tr><td>
      <div style="background:#000; border:1px solid #333; border-radius:8px; padding:24px;">
        <img src="device.png" style="background:red" />
        <p>ขอโดย D จาก Haier - สมาร์ททีวี<br/>
           เมื่อ 28 พฤษภาคม เวลา 21:56 ตามเวลา GMT-7</p>
        <a href="https://www.netflix.com/account/update-primary-location?t=APA91b&authURL=https%3A%2F%2Fwww.netflix.com%2Flogin&trkid=12345678"
           style="background:red; color:white; padding:14px 24px; display:block; text-align:center; border-radius:4px; text-decoration:none;">
          ใช่ ฉันเป็นคนขอ
        </a>
        <p>* ลิงก์จะหมดอายุหลังจากครบ 15 นาที</p>
      </div>
    </td></tr>
  </table>
</body></html>
`;

// ── ตัวอย่าง HTML จาก Netflix (ภาษาอังกฤษ) ──────────────────
const mockEnglishHtml = `
<html><body>
  <table>
    <tr><td>
      <div style="background:#141414; border:1px solid #404040; border-radius:12px; padding:32px;">
        <p>Requested by D from Haier - Smart TV<br/>
           May 28 at 9:56 PM GMT-7</p>
        <a href="https://www.netflix.com/account/household/confirm?nftoken=APA91bHPRgkFI0&authURL=https%3A%2F%2Fwww.netflix.com%2Flogin"
           style="background:#E50914; color:white; padding:16px; display:block; border-radius:4px;">
          Yes, this was me
        </a>
        <p style="color:#808080; font-size:12px;">* Link expires after 15 minutes</p>
      </div>
    </td></tr>
  </table>
</body></html>
`;

// ── ตัวอย่าง HTML จาก Netflix (ภาษาสเปน) ─────────────────────
const mockSpanishHtml = `
<html><body>
  <a href="https://www.netflix.com/account/update-primary-location?t=TOKEN123&authURL=encoded_url">
    Sí, fui yo
  </a>
</body></html>
`;

// ── รัน tests ───────────────────────────────────────────────
console.log('='.repeat(60));
console.log('Netflix Household Detection Tests');
console.log('='.repeat(60));

const tests = [
  {
    name: 'Thai email — subject + sender',
    subject: 'อัพเดตครัวเรือน Netflix ของคุณ',
    sender: '"Netflix" <info@account.netflix.com>',
    html: mockThaiHtml,
  },
  {
    name: 'English email — household subject',
    subject: 'Update your Netflix Household',
    sender: 'Netflix <info@mailer.netflix.com>',
    html: mockEnglishHtml,
  },
  {
    name: 'English email — primary location subject',
    subject: 'Confirm your Netflix primary location',
    sender: 'Netflix <info@account.netflix.com>',
    html: mockEnglishHtml,
  },
  {
    name: 'Spanish email',
    subject: 'Actualiza tu hogar de Netflix',
    sender: 'Netflix <info@netflix.com>',
    html: mockSpanishHtml,
  },
  {
    name: 'Not a household email (regular OTP)',
    subject: 'Your Netflix sign-in code is 847291',
    sender: 'Netflix <info@netflix.com>',
    html: '<p>Your code is 847291</p>',
  },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const detected = isNetflixHousehold(test.subject, test.sender);
  const link = detected ? extractHouseholdLink(test.html) : null;
  const isRegular = test.name.includes('regular OTP');
  const success = isRegular ? !detected : (detected && link);

  const icon = success ? '✅' : '❌';
  console.log(`\n${icon} ${test.name}`);
  console.log(`   Subject  : ${test.subject}`);
  console.log(`   Detected : ${detected}`);
  if (detected) {
    console.log(`   Link     : ${link ? link.substring(0, 80) + '...' : 'NOT FOUND ❌'}`);
  }

  if (success) passed++; else failed++;
}

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
