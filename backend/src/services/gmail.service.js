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

async function handleCallback(code, userId, isAdminManaged = false) {
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
      isAdminManaged,
    },
    create: {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userId,
      isAdminManaged,
    },
  });

  return email;
}

// เช็คว่า email มาจาก Netflix จริงไหม (domain ต้องลงท้ายด้วย netflix.com)
function isNetflixEmail(sender) {
  return (sender || '').toLowerCase().includes('netflix.com');
}

// ตัด URL ออกจาก text ก่อนวิเคราะห์ — Netflix show ID (8 หลัก) อยู่ใน URL เสมอ
function stripUrls(str) {
  return str.replace(/https?:\/\/[^\s<>"']+/gi, ' ');
}

// เช็คว่าเป็น OTP email จาก Netflix (ทุกภาษา)
// ใช้ fragment สั้นๆ แทน phrase ยาว + แยก subject/body check เพื่อความยืดหยุ่น
function isNetflixOTP(subject, body) {
  const sub = (subject || '').toLowerCase();
  // ตัด URL ออกก่อน เพื่อกัน show ID ที่ฝังใน /watch/xxxxxxxx ไม่ให้นับเป็น OTP
  const bod = stripUrls((body || '').toLowerCase());

  const fragments = [
    // English
    'otp', 'pin', 'passcode', 'one-time', 'sign-in code', 'signin code',
    'login code', 'access code', 'verify', 'verification',
    // Thai — เฉพาะ phrase ที่เจาะจง ไม่ใช่แค่ 'รหัส' คำเดียว
    'รหัสการลงชื่อ', 'รหัสยืนยัน', 'รหัส otp', 'รหัสเข้า',
    // Japanese
    'コード', '確認', '認証', 'ワンタイム',
    // Chinese (Simplified + Traditional)
    '验证', '驗證', '动态密码', '授权码',
    // Korean
    '코드', '인증', '확인',
    // Spanish / Portuguese
    'código', 'codigo', 'verificar', 'verificação', 'verificacion',
    // French
    'vérif', 'connexion',
    // German
    'bestätigung', 'anmeld',
    // Italian
    'codice', 'verifica',
    // Dutch
    'verificat',
    // Polish
    'kod weryfikacyjny', 'kod logowania',
    // Turkish
    'doğrulama', 'giriş kodu',
    // Arabic
    'رمز التحقق', 'كود التحقق', 'رمز الدخول',
    // Russian
    'код подтверждения', 'подтвер',
    // Vietnamese
    'mã xác', 'xác nhận',
    // Indonesian / Malay
    'kode verifikasi', 'kode masuk',
    // Hindi
    'कोड',
  ];

  const matchSub = fragments.some(f => sub.includes(f));
  const matchBod = fragments.some(f => bod.includes(f));
  // Netflix OTP จริงๆ เป็น 4-6 หลักเสมอ — 8 หลักคือ show ID ไม่ใช่ OTP
  const hasOTPDigits = /\b\d{4,6}\b/.test(bod);

  // subject มี keyword → เชื่อเลย
  // body มี keyword + มีตัวเลข 4-6 หลัก (หลังตัด URL แล้ว) → OTP จริง
  return matchSub || (matchBod && hasOTPDigits);
}
function extractOTP(text) {
  const clean = stripUrls(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

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

  // 4-8 digits fallback — กรองปี (1900-2099) และเวลา (เช่น 14:36) ออก
  const allNums = [...clean.matchAll(/\b(\d{4,8})\b/g)].map(m => m[1]);
  for (const num of allNums) {
    // ข้ามถ้าเป็นปี ค.ศ.
    const n = parseInt(num);
    if (num.length === 4 && n >= 1900 && n <= 2100) continue;
    return num;
  }

  return null;
}

// ── Extract original recipient from forwarded email ───────────
// Netflix embeds the real recipient in footer (multiple formats across locales)
function extractOriginalRecipient(text) {
  if (!text) return null;
  const EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

  // Format 1: [email@x.com] — Netflix standard text footer
  const m1 = text.match(new RegExp(`\\[(${EMAIL.source})\\]`));
  if (m1) return m1[1];

  // Format 2: "sent to / ส่งถึง / envoyé à / ..." followed by email
  // Allow up to 120 chars (may include HTML tags) between keyword and email
  const sentToRe = new RegExp(
    `(?:sent\\s+to|was\\s+sent\\s+to|this\\s+email\\s+was\\s+sent\\s+to` +
    `|ส่งถึง|ข้อความนี้ส่งถึง|อีเมลนี้ส่งถึง` +
    `|enviado\\s+a|envoy[eé]\\s+[aà]|gesendet\\s+an` +
    `|送信先|发送至|발송\\s+대상|inviato\\s+a)[\\s\\S]{0,120}?(${EMAIL.source})`,
    'i'
  );
  const m2 = text.match(sentToRe);
  if (m2) return m2[1];

  return null;
}

// ── Netflix Temporary Access Code detection ──────────────────
// อีเมลประเภทนี้ไม่มีตัวเลข OTP ในเนื้อหา แต่มีปุ่ม "รับรหัส" เป็น link
function isNetflixTempCode(subject) {
  const sub = (subject || '').toLowerCase();
  const keywords = [
    // Thai
    'ชั่วคราว',
    // English
    'temporary access', 'temp access', 'travel access', 'temporary code',
    'get a code', 'access code for', 'a temporary',
    // Japanese
    '一時アクセス', '一時的なコード', '一時コード', '一時的アクセス',
    // Korean
    '임시 액세스', '임시 코드', '임시 접속',
    // Chinese (Simplified)
    '临时访问', '临时代码', '暂时访问', '临时密码',
    // Chinese (Traditional)
    '臨時訪問', '臨時代碼', '暫時訪問', '臨時密碼',
    // Spanish
    'acceso temporal', 'código temporal', 'acceso provisorio',
    // French
    'accès temporaire', 'code temporaire', 'accès provisoire',
    // German
    'temporärer zugang', 'temporärer code', 'vorübergehender zugang',
    // Portuguese
    'acesso temporário', 'código temporário', 'acesso provisório',
    // Italian
    'accesso temporaneo', 'codice temporaneo',
    // Dutch
    'tijdelijke toegang', 'tijdelijke code',
    // Polish
    'tymczasowy kod', 'tymczasowy dostęp',
    // Turkish
    'geçici erişim', 'geçici kod',
    // Arabic
    'الوصول المؤقت', 'رمز مؤقت', 'وصول مؤقت',
    // Russian
    'временный доступ', 'временный код', 'временный пароль',
    // Vietnamese
    'truy cập tạm thời', 'mã tạm thời', 'tạm thời',
    // Indonesian / Malay
    'akses sementara', 'kode sementara', 'akses sambungan',
    // Hindi
    'अस्थायी', 'अस्थायी कोड',
    // Swedish
    'tillfällig åtkomst', 'tillfällig kod',
    // Danish / Norwegian
    'midlertidig adgang', 'midlertidig tilgang', 'midlertidig kode',
    // Finnish
    'tilapäinen koodi', 'väliaikainen koodi',
    // Czech
    'dočasný přístup', 'dočasný kód',
    // Hungarian
    'ideiglenes hozzáférés', 'ideiglenes kód',
    // Romanian
    'acces temporar', 'cod temporar',
    // Greek
    'προσωρινή πρόσβαση', 'προσωρινός κωδικός',
    // Hebrew
    'גישה זמנית', 'קוד זמני',
  ];
  return keywords.some(kw => sub.includes(kw));
}

function extractTempCodeLink(html) {
  const SKIP = /unsubscribe|help|privacy|faq|support|terms|cookie/i;

  // ── Priority 1: Netflix URL pattern (ภาษา-agnostic ที่สุด) ──
  // Netflix ใช้ URL format เดียวกันทุกภาษา
  const allHrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  for (const href of allHrefs) {
    if (href.length > 40 && !SKIP.test(href) &&
        /netflix\.com.*(travel[\-_]?access|\/tac[?/]|get[\-_]?code|temporaryaccess|temp[\-_]?access|accs?code)/i.test(href)) {
      return href;
    }
  }

  // ── Priority 2: CTA button text matching (ครอบคลุมทุกภาษา) ──
  const ctaTexts = [
    // Thai
    'รับรหัส', 'รับรหัสชั่วคราว',
    // English
    'get code', 'get my code', 'get your code', 'get a code',
    'access netflix', 'temporary access', 'get temporary',
    // Japanese
    'コードを取得', 'コードを受け取る', '一時コードを取得', 'コードを入手',
    // Korean
    '코드 받기', '코드 가져오기', '임시 코드 받기',
    // Chinese (Simplified)
    '获取代码', '获取验证码', '获取临时码', '获取临时密码', '获取授权码',
    // Chinese (Traditional)
    '取得驗證碼', '取得代碼', '取得臨時碼',
    // Spanish
    'obtener código', 'obtener mi código', 'acceso temporal',
    // Portuguese
    'obter código', 'obter meu código', 'acesso temporário',
    // French
    'obtenir le code', 'obtenir mon code', 'accès temporaire',
    // German
    'code abrufen', 'code erhalten', 'code anfordern',
    // Italian
    'ottieni il codice', 'ottieni codice',
    // Dutch
    'code ophalen', 'code ontvangen',
    // Polish
    'pobierz kod', 'uzyskaj kod',
    // Turkish
    'kodu al', 'kodu alın',
    // Arabic
    'احصل على الرمز', 'الحصول على الرمز', 'احصل على الكود',
    // Russian
    'получить код', 'получить временный код',
    // Vietnamese
    'lấy mã', 'nhận mã', 'lấy mã tạm thời',
    // Indonesian / Malay
    'dapatkan kode', 'ambil kode', 'dapatkan kod',
    // Hindi
    'कोड प्राप्त करें', 'कोड लें',
    // Swedish
    'hämta kod', 'få koden', 'hämta koden',
    // Danish / Norwegian
    'hent kode', 'hent koden',
    // Finnish
    'hae koodi', 'nouda koodi',
    // Czech
    'získat kód', 'zobrazit kód',
    // Hungarian
    'kód kérése', 'kód lekérése',
    // Romanian
    'obțineți codul', 'obține codul',
    // Greek
    'λήψη κωδικού', 'λάβετε κωδικό',
    // Hebrew
    'קבל קוד', 'קבל את הקוד',
  ];

  for (const pattern of ctaTexts) {
    const before = new RegExp(`href="([^"]{20,})"[^>]*>(?:[^<]*<[^>]*>){0,6}[^<]*(?:${pattern})`, 'is');
    const mB = html.match(before);
    if (mB?.[1] && !SKIP.test(mB[1])) return mB[1].replace(/&amp;/g, '&');

    const after = new RegExp(`(?:${pattern})[^<]*(?:<[^>]*>){0,5}[^<]*<a[^>]+href="([^"]{20,})"`, 'is');
    const mA = html.match(after);
    if (mA?.[1] && !SKIP.test(mA[1])) return mA[1].replace(/&amp;/g, '&');
  }

  // ── Priority 3: Netflix long URL fallback ──
  for (const href of allHrefs) {
    if (href.length > 60 && href.includes('netflix.com') && !SKIP.test(href)) {
      return href;
    }
  }

  return null;
}

// ── Netflix New Device / Password Reset detection ────────────
function isNetflixNewDevice(subject) {
  const sub = (subject || '').toLowerCase();
  const keywords = [
    // Thai — new device
    'อุปกรณ์ใหม่', 'ใหม่กำลังใช้งาน',
    // Thai — password reset
    'เปลี่ยนรหัสผ่าน', 'รีเซ็ตรหัสผ่าน', 'ตั้งรหัสผ่านใหม่', 'รีเซ็ตรหัส',
    // English — new device
    'new device', 'new sign-in', 'someone signed in', 'signed into',
    'new login', 'unrecognized device',
    // English — password reset
    'password reset', 'reset your password', 'reset password',
    'complete your password', 'forgot your password', 'password recovery',
    'recover your password', 'update your password',
    // Japanese
    '新しいデバイス', 'パスワードを変更', 'パスワードのリセット', 'パスワードをリセット', 'パスワード再設定',
    // Chinese (Simplified)
    '新设备', '新登录', '更改密码', '密码重置', '重置密码', '找回密码',
    // Chinese (Traditional)
    '新裝置', '新登入', '更改密碼', '密碼重設', '重設密碼',
    // Korean
    '새 기기', '새로운 기기', '비밀번호 변경', '비밀번호 재설정', '비밀번호 초기화',
    // Spanish
    'nuevo dispositivo', 'nueva sesión', 'cambiar contraseña',
    'restablecer contraseña', 'restablecer tu contraseña', 'restablecimiento de contraseña',
    // French
    'nouvel appareil', 'nouvelle connexion', 'changer le mot de passe',
    'réinitialiser le mot de passe', 'réinitialisation du mot de passe',
    // German
    'neues gerät', 'neue anmeldung', 'passwort ändern',
    'passwort zurücksetzen', 'passwort-zurücksetzung', 'kennwort zurücksetzen',
    // Portuguese
    'novo dispositivo', 'nova sessão', 'alterar senha',
    'redefinir senha', 'redefinição de senha', 'recuperar senha',
    // Italian
    'nuovo dispositivo', 'nuovo accesso',
    'reimposta password', 'reimpostazione password', 'recupera password',
    // Dutch
    'nieuw apparaat', 'nieuwe aanmelding',
    'wachtwoord opnieuw instellen', 'wachtwoord resetten',
    // Polish
    'resetowanie hasła', 'zresetuj hasło',
    // Turkish
    'şifreni sıfırla', 'şifre sıfırlama',
    // Arabic
    'إعادة تعيين كلمة المرور', 'استعادة كلمة المرور',
    // Russian
    'сброс пароля', 'сбросить пароль', 'восстановление пароля',
    // Vietnamese
    'đặt lại mật khẩu', 'khôi phục mật khẩu',
    // Indonesian / Malay
    'atur ulang kata sandi', 'reset kata sandi',
    // Hindi
    'पासवर्ड रीसेट', 'पासवर्ड बदलें',
  ];
  return keywords.some(kw => sub.includes(kw));
}

function extractPasswordResetLink(html) {
  const ctaTexts = [
    // Thai
    'เปลี่ยนรหัสผ่าน', 'รีเซ็ตรหัสผ่าน', 'ตั้งรหัสผ่านใหม่',
    // English
    'reset password', 'reset.*password', 'change.*password', 'update.*password',
    'recover.*password', 'set.*new.*password', 'create.*new.*password',
    // Japanese
    'パスワードを変更', 'パスワードをリセット', 'パスワード.*リセット',
    // Chinese (Simplified)
    '更改密码', '重置密码', '密码重置',
    // Chinese (Traditional)
    '更改密碼', '重設密碼',
    // Korean
    '비밀번호 변경', '비밀번호.*재설정', '비밀번호.*초기화',
    // Spanish
    'cambiar contraseña', 'restablecer.*contraseña',
    // French
    'changer.*mot de passe', 'réinitialiser.*mot de passe',
    // German
    'passwort ändern', 'passwort.*zurücksetzen',
    // Portuguese
    'alterar senha', 'redefinir.*senha',
    // Italian
    'reimposta.*password', 'cambia.*password',
    // Dutch
    'wachtwoord.*resetten', 'wachtwoord.*instellen',
    // Polish
    'zresetuj.*hasło', 'zmień.*hasło',
    // Turkish
    'sıfırla', 'şifre.*değiştir',
    // Arabic
    'إعادة.*تعيين', 'تغيير.*كلمة',
    // Russian
    'сброс пароля', 'сбросить пароль', 'изменить пароль',
    // Vietnamese
    'đặt lại mật khẩu', 'thay đổi mật khẩu',
    // Indonesian
    'atur ulang.*kata sandi', 'reset.*kata sandi',
  ];

  for (const pattern of ctaTexts) {
    const before = new RegExp(`href="([^"]{20,})"[^>]*>(?:[^<]*<[^>]*>){0,5}[^<]*(?:${pattern})`, 'is');
    const mBefore = html.match(before);
    if (mBefore?.[1] && !mBefore[1].includes('unsubscribe') && !mBefore[1].includes('help')) {
      return mBefore[1].replace(/&amp;/g, '&');
    }
    const after = new RegExp(`(?:${pattern})[^<]*(?:<[^>]*>){0,5}[^<]*<a[^>]+href="([^"]{20,})"`, 'is');
    const mAfter = html.match(after);
    if (mAfter?.[1] && !mAfter[1].includes('unsubscribe')) {
      return mAfter[1].replace(/&amp;/g, '&');
    }
  }

  // Fallback: หา Netflix password URL
  const allHrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  for (const href of allHrefs) {
    if (/netflix\.com.*(?:password|account\/update|security)/i.test(href)) {
      return href;
    }
  }
  return null;
}

// ── Netflix Household detection ──────────────────────────────
function isNetflixHousehold(subject, sender) {
  const sub = (subject || '').toLowerCase();
  // เช็ค Netflix ก่อนเลย (ผ่านแล้วค่อยเช็ค subject)
  if (!isNetflixEmail(sender)) return false;

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
      gmailAccount.accessToken = tokens.access_token;
      await prisma.gmailAccount.update({
        where: { id: gmailAccount.id },
        data: { accessToken: tokens.access_token },
      });
    }
    if (tokens.refresh_token) {
      gmailAccount.refreshToken = tokens.refresh_token;
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
    const toHeader = headers.find((h) => h.name === 'To')?.value ?? null;

    const body = getBodyFromPayload(detail.data.payload);
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    // Extract original recipient: To header takes priority (Gmail preserves it when forwarding),
    // fall back to [email] pattern in body/HTML footer for cases where To header = inbox email.
    const toEmailFromHeader = toHeader
      ? (toHeader.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/) || [])[1] ?? null
      : null;
    const toEmailFromBody = extractOriginalRecipient(body)
      || extractOriginalRecipient(getHtmlBodyFromPayload(detail.data.payload));
    const toEmail = (toEmailFromHeader && toEmailFromHeader !== gmailAccount.email)
      ? toEmailFromHeader
      : toEmailFromBody;

    // ── เช็ค Netflix ก่อนเลย ถ้าไม่ใช่ข้ามทันที ──
    if (!isNetflixEmail(sender)) {
      continue;
    }

    // Netflix New Device → extract password reset link
    if (isNetflixNewDevice(subject)) {
      const htmlBody = getHtmlBodyFromPayload(detail.data.payload);
      const link = extractPasswordResetLink(htmlBody || body);
      if (link) {
        newOtps.push({
          type: 'password_reset_link',
          code: link,
          sender,
          toEmail,
          subject,
          messageId: msg.id,
          gmailAccountId: gmailAccount.id,
          receivedAt,
        });
        console.log(`[poll] Netflix password reset link found in ${gmailAccount.email}`);
      }
    // Netflix Household email → extract confirmation link
    } else if (isNetflixHousehold(subject, sender)) {
      const htmlBody = getHtmlBodyFromPayload(detail.data.payload);
      const link = extractHouseholdLink(htmlBody || body);
      if (link) {
        newOtps.push({
          type: 'household_link',
          code: link,
          sender,
          toEmail,
          subject,
          messageId: msg.id,
          gmailAccountId: gmailAccount.id,
          receivedAt,
        });
        console.log(`[poll] Netflix household link found in ${gmailAccount.email}`);
      }
    // Netflix Temporary Access Code → ดึง link จากปุ่ม "รับรหัส"
    // ต้องเช็คก่อน isNetflixOTP เพราะ subject มี "รหัส" ทำให้ผ่าน OTP check ด้วย
    } else if (isNetflixTempCode(subject)) {
      const htmlBody = getHtmlBodyFromPayload(detail.data.payload);
      const link = extractTempCodeLink(htmlBody || body);
      if (link) {
        newOtps.push({
          type: 'temp_code_link',
          code: link,
          sender,
          toEmail,
          subject,
          messageId: msg.id,
          gmailAccountId: gmailAccount.id,
          receivedAt,
        });
        console.log(`[poll] Netflix temp code link found in ${gmailAccount.email}`);
      }
    } else if (isNetflixOTP(subject, body)) {
      // เฉพาะ Netflix OTP email จริงๆ (มี keyword รหัส/code/sign-in) เท่านั้น
      const code = extractOTP((subject ?? '') + ' ' + body);
      if (code) {
        newOtps.push({
          type: 'otp',
          code,
          sender,
          toEmail,
          subject,
          messageId: msg.id,
          gmailAccountId: gmailAccount.id,
          receivedAt,
        });
        console.log(`[poll] Netflix OTP found: ${code} (to: ${toEmail ?? 'unknown'}) in ${gmailAccount.email}`);
      }
    }
  }

  await prisma.gmailAccount.update({
    where: { id: gmailAccount.id },
    data: { lastPolledAt: new Date() },
  });

  // ── Retroactive toEmail recovery ──────────────────────────────
  // OTPs in the last 2 hours with null toEmail: re-fetch from Gmail and try again
  const nullToEmailOtps = await prisma.otp.findMany({
    where: {
      gmailAccountId: gmailAccount.id,
      toEmail: null,
      receivedAt: { gt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    select: { id: true, messageId: true },
  });

  for (const record of nullToEmailOtps) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: record.messageId,
        format: 'full',
      });
      const headers = detail.data.payload.headers;
      const toHeader = headers.find(h => h.name === 'To')?.value ?? null;
      const body = getBodyFromPayload(detail.data.payload);
      const htmlBody = getHtmlBodyFromPayload(detail.data.payload);

      const toEmailFromHeader = toHeader
        ? (toHeader.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/) || [])[1] ?? null
        : null;
      const toEmailFromBody = extractOriginalRecipient(body) || extractOriginalRecipient(htmlBody);
      const recovered = (toEmailFromHeader && toEmailFromHeader !== gmailAccount.email)
        ? toEmailFromHeader
        : toEmailFromBody;

      if (recovered) {
        await prisma.otp.update({ where: { id: record.id }, data: { toEmail: recovered } });
        console.log(`[poll] Recovered toEmail=${recovered} for msg ${record.messageId}`);
      }
    } catch (e) {
      console.warn(`[poll] toEmail recovery failed for ${record.messageId}: ${e.message}`);
    }
  }

  return newOtps;
}

module.exports = {
  getAuthUrl, handleCallback, pollGmailAccount,
  isNetflixEmail, isNetflixOTP, extractOTP,
  isNetflixNewDevice, extractPasswordResetLink,
  isNetflixTempCode, extractTempCodeLink,
  isNetflixHousehold, extractHouseholdLink,
  extractOriginalRecipient,
};
