/**
 * חשבונות, סיסמאות והפרדת נתונים בין סטודיואים.
 *
 * העיקרון: כל סטודיו הוא חשבון נפרד, ולכל רשומה במסד יש בעלים אחד ויחיד.
 * כל שאילתה עוברת דרך הפילטר הזה — אין נתיב שמחזיר נתונים של חשבון אחר,
 * גם לא בטעות, כי אין פונקציה שמחזירה רשימה גלובלית ללא accountId.
 *
 * ללא תלויות חיצוניות: scrypt ו-randomBytes מגיעים מ-node:crypto.
 */

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

/** פרמטרי scrypt. N=16384 הוא איזון מקובל בין עלות תקיפה לזמן התחברות. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** תוקף מושב: שבועיים. מספיק כדי לא להתחבר כל אימון, קצר מספיק כדי שגניבת עוגייה לא תהיה נצחית. */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** חלון נעילה אחרי ניסיונות כושלים. */
export const LOCKOUT = { attempts: 8, windowMs: 15 * 60 * 1000 };

/** גיבוב סיסמה עם מלח אקראי ייחודי לכל משתמש. */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return { salt, hash, algo: `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}` };
}

/**
 * אימות סיסמה בהשוואה בזמן קבוע.
 * השוואת מחרוזות רגילה מדליפה מידע דרך זמן התגובה; timingSafeEqual לא.
 */
export function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const derived = scryptSync(password, record.salt, SCRYPT.keylen, SCRYPT);
  const stored = Buffer.from(record.hash, 'hex');
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(derived, stored);
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

export function newAccountId() { return `acc_${randomUUID()}`; }
export function newSessionToken() { return randomBytes(32).toString('base64url'); }

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
