/**
 * חשבונות, סיסמאות והפרדת נתונים בין סטודיואים.
 *
 * העיקרון: כל סטודיו הוא חשבון נפרד, ולכל רשומה במסד יש בעלים אחד ויחיד.
 * כל שאילתה עוברת דרך הפילטר הזה — אין נתיב שמחזיר נתונים של חשבון אחר,
 * גם לא בטעות, כי אין פונקציה שמחזירה רשימה גלובלית ללא accountId.
 *
 * ללא תלויות חיצוניות: scrypt ו-randomBytes מגיעים מ-node:crypto.
 */

/*
 * גיבוב הסיסמה נעשה ב-PBKDF2 דרך WebCrypto ולא ב-scrypt של Node.
 *
 * הסיבה מעשית: המערכת רצה בשני מקומות — שרת Node על מחשב או בענן, וגם
 * כפונקציה בקצה (Cloudflare Workers), ששם אין node:crypto מלא. WebCrypto
 * קיים בשניהם, ולכן אותו קוד אימות רץ בשני המקומות בלי ענף נפרד.
 * חשבונות ישנים שנוצרו ב-scrypt ממשיכים להיכנס: האימות מזהה את האלגוריתם
 * מתוך הרשומה עצמה.
 */
/*
 * 100,000 סיבובים ולא יותר: זו התקרה ש-Cloudflare Workers מאפשר, וכל ערך
 * מעליה מפיל את ההרשמה בקצה. מספר הסיבובים נשמר בתוך הרשומה עצמה, ולכן
 * חשבונות שנוצרו עם ערך אחר ממשיכים להיכנס כרגיל.
 */
const PBKDF2 = { iterations: 100000, hash: 'SHA-256', keylen: 32 };

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(String(hex).match(/../g) || [], (h) => parseInt(h, 16));

/** השוואה בזמן קבוע — השוואת מחרוזות רגילה מדליפה מידע דרך זמן התגובה. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password, saltHex, iterations = PBKDF2.iterations) {
  const key = await subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: PBKDF2.hash },
    key, PBKDF2.keylen * 8,
  );
  return new Uint8Array(bits);
}

const randomHex = (bytes) => toHex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));

/** תוקף מושב: שבועיים. מספיק כדי לא להתחבר כל אימון, קצר מספיק כדי שגניבת עוגייה לא תהיה נצחית. */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** חלון נעילה אחרי ניסיונות כושלים. */
export const LOCKOUT = { attempts: 8, windowMs: 15 * 60 * 1000 };

/** גיבוב סיסמה עם מלח אקראי ייחודי לכל משתמש. */
export async function hashPassword(password) {
  const salt = randomHex(16);
  const hash = toHex(await pbkdf2(password, salt));
  return { salt, hash, algo: `pbkdf2:${PBKDF2.hash}:${PBKDF2.iterations}` };
}

/**
 * אימות סיסמה.
 *
 * האלגוריתם נקרא מהרשומה ולא מההגדרה הנוכחית, כדי שחשבון שנוצר בגרסה
 * קודמת ימשיך לעבוד. scrypt מאומת רק כשהסביבה תומכת בו — בקצה אין node,
 * ושם רשומה ישנה פשוט לא תאמת (ואין כאלה: הפריסה בקצה מתחילה נקייה).
 */
export async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const stored = fromHex(record.hash);

  if (String(record.algo || '').startsWith('scrypt')) {
    try {
      const { scryptSync } = await import('node:crypto');
      const [, N, r, p] = String(record.algo).split(':').map(Number);
      const derived = scryptSync(password, record.salt, stored.length,
        { N: N || 16384, r: r || 8, p: p || 1 });
      return sameBytes(new Uint8Array(derived), stored);
    } catch {
      return false;
    }
  }

  const iterations = Number(String(record.algo || '').split(':')[2]) || PBKDF2.iterations;
  const derived = await pbkdf2(password, record.salt, iterations);
  return sameBytes(derived, stored);
}

/** בדיקות תקינות לסיסמה. לא דורשים תווים מיוחדים — אורך עדיף על מורכבות מאולצת. */
export function validatePassword(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('הסיסמה חייבת להיות באורך 8 תווים לפחות.');
  }
  if (/^\d+$/.test(password || '')) errors.push('סיסמה של ספרות בלבד קלה מדי לניחוש.');
  const common = ['12345678', 'password', 'qwerty123', 'aaaaaaaa', '123456789'];
  if (common.includes(String(password).toLowerCase())) errors.push('הסיסמה הזאת נפוצה מדי.');
  return { ok: errors.length === 0, errors };
}

/** נרמול שם משתמש: חסין לרווחים ולאותיות גדולות, כדי ששכחה לא תנעל אנשים בחוץ. */
export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function validateUsername(username) {
  const u = normalizeUsername(username);
  const errors = [];
  if (u.length < 3) errors.push('שם המשתמש חייב להיות באורך 3 תווים לפחות.');
  if (u.length > 64) errors.push('שם המשתמש ארוך מדי.');
  if (!/^[a-z0-9._@-]+$/.test(u)) {
    errors.push('שם המשתמש יכול להכיל אותיות באנגלית, ספרות, נקודה, מקף, קו תחתון או @.');
  }
  return { ok: errors.length === 0, errors, username: u };
}

export function newAccountId() { return `acc_${globalThis.crypto.randomUUID()}`; }

/** אסימון מושב: 32 בתים אקראיים, בכתיב שבטוח בעוגייה ובכתובת. */
export function newSessionToken() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** האם המושב עדיין בתוקף. */
export function sessionValid(session, now = Date.now()) {
  return !!session && new Date(session.expiresAt).getTime() > now;
}

/** ספירת ניסיונות כושלים בחלון הזמן האחרון. */
export function recentFailures(attempts = [], now = Date.now()) {
  return attempts.filter((t) => now - new Date(t).getTime() < LOCKOUT.windowMs).length;
}

export function isLockedOut(account, now = Date.now()) {
  return recentFailures(account?.failedAttempts || [], now) >= LOCKOUT.attempts;
}

/**
 * עוגיית מושב. HttpOnly כדי שסקריפט בדף לא יוכל לקרוא אותה,
 * SameSite=Lax כדי שאתר אחר לא יוכל לבצע פעולות בשם המשתמש,
 * ו-Secure רק כשאנחנו באמת ב-HTTPS (אחרת פיתוח מקומי נשבר).
 */
export function sessionCookie(token, { secure = false, maxAgeMs = SESSION_TTL_MS } = {}) {
  const parts = [
    `sid=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie({ secure = false } = {}) {
  const parts = ['sid=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** קריאת עוגייה מכותרת הבקשה. */
export function readCookie(header, name = 'sid') {
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
