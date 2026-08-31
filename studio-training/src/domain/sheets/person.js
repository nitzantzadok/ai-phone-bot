/**
 * האם המחרוזת הזאת היא שם של אדם.
 *
 * זו השאלה שהכי קל לטעות בה בייבוא, והכי יקר לטעות בה: גיליון של סטודיו
 * מלא בטבלאות שנראות כמו רשימת מתאמנים — עמודת תרגילים, רשימת ציוד,
 * שורות סיכום — ואם כל ערך בעמודה הראשונה נחשב לשם, המערכת נפתחת עם
 * "לחיצת חזה" ו"מוט אולימפי" כמתאמנים. אדם אמיתי הוא מילה או שתיים,
 * בלי מספרים, ובלי מילים שהן שם של תרגיל, של מכשיר או של כותרת.
 *
 * הכלל הפוך מכלל הזיהוי הרגיל: כאן מחפשים ראיות *נגד*. בהיעדר ראיה
 * נגדית המחרוזת מתקבלת — כי שם של אדם יכול להיות כל דבר, ואסור שהמערכת
 * תמחק מתאמן אמיתי רק כי שמו נדיר.
 */

import { shMatch, shNorm, shTokens } from './text.js';
import {
  equipmentCandidates, exerciseCandidates, GOAL_TERMS, HEADER_TERMS, LEVEL_TERMS, shCandidates,
  WEEKDAY_TERMS,
} from './vocab.js';

/**
 * מילים שמופיעות בשמות תרגילים ולעולם לא בשם של אדם.
 * די באחת מהן כדי לפסול — "לחיצת חזה בשיפוע" אינו אדם, גם אם המאגר
 * לא מכיר את הצורה המדויקת הזאת.
 */
const EXERCISE_WORDS = [
  'לחיצת', 'לחיצה', 'משיכת', 'משיכה', 'כפיפת', 'כפיפה', 'פשיטת', 'פשיטה', 'הרמת', 'הרמה',
  'מתיחת', 'מתיחה', 'סקוואט', 'דדליפט', 'חתירה', 'מקבילים', 'מתח', 'שכיבות', 'בטן', 'פלאנק',
  'קיקבק', 'לאנג', 'לאנג׳', 'ברפי', 'קפיצות', 'הליכה', 'ריצה', 'אופניים', 'חתירת',
  'תרגיל', 'אימון', 'חימום', 'סקווט', 'מכרעים', 'מכרע', 'גשר', 'עליות', 'דחיפת', 'דחיפה',
  // שמות של אזורי גוף: הם מופיעים בכל שם תרגיל שני, ולעולם לא כשם פרטי
  'רגליים', 'חזה', 'כתפיים', 'כתף', 'ידיים', 'ישבן', 'ירך', 'תאומים', 'טרייצפס', 'ביצפס',
  'יד', 'זרוע', 'ליבה', 'גב',
  'press', 'squat', 'deadlift', 'row', 'curl', 'lunge', 'plank', 'pushup', 'pullup', 'raise',
  'extension', 'fly', 'crunch', 'bridge', 'thrust',
];

/** מילים של ציוד ושל מבנה הטבלה. גם הן אינן שם של אדם. */
const OBJECT_WORDS = [
  'מכונת', 'מכונה', 'מכשיר', 'ספסל', 'מוט', 'משקולת', 'משקולות', 'גומייה', 'גומיית', 'כבל',
  'כדור', 'מזרן', 'מזרון', 'טיאר״קס', 'סטים', 'חזרות', 'משקל', 'מנוחה', 'קצב', 'הערות',
  'סיכום', 'סהכ', 'ממוצע', 'תאריך', 'יום', 'שבוע', 'שם', 'טלפון', 'אימייל', 'גיל', 'מטרה',
  'סניף', 'מאמן', 'סטודיו', 'ציוד', 'פריט', 'כמות', 'סטטוס', 'הערה', 'total', 'sum', 'average',
  'name', 'phone', 'email', 'date', 'week', 'day', 'sets', 'reps', 'weight', 'rest', 'notes',
];

const WORD_SET = (words) => new Set(words.map(shNorm).filter(Boolean));
const EXERCISE_WORD_SET = WORD_SET(EXERCISE_WORDS);
const OBJECT_WORD_SET = WORD_SET(OBJECT_WORDS);

/** ביטויים שלמים שמאמנים כותבים במקום שם, ואינם אדם מסוים. */
const PLACEHOLDERS = WORD_SET([
  'מתאמן', 'מתאמנת', 'מתאמנים', 'לקוח', 'לקוחה', 'שם המתאמן', 'שם מלא', 'ללא שם', 'פנוי',
  'ריק', 'חופש', 'מבחן', 'דוגמה', 'trainee', 'client', 'member', 'test', 'sample', 'example',
]);

const allCandidates = () => [
  ...exerciseCandidates(), ...equipmentCandidates(),
  ...shCandidates(HEADER_TERMS), ...shCandidates(GOAL_TERMS),
  ...shCandidates(LEVEL_TERMS), ...shCandidates(WEEKDAY_TERMS),
];

/** כל המילים שמופיעות באוצר המילים של התרגילים, הציוד והכותרות. */
let vocabTokenCache = null;
function vocabTokens() {
  if (vocabTokenCache) return vocabTokenCache;
  vocabTokenCache = new Set();
  for (const cand of allCandidates()) {
    for (const term of cand.terms) for (const token of shTokens(term)) vocabTokenCache.add(token);
  }
  return vocabTokenCache;
}

/** כל המונחים השלמים, בצורתם המנורמלת. השוואה מדויקת וזולה. */
let vocabTermCache = null;
function vocabTerms() {
  if (vocabTermCache) return vocabTermCache;
  vocabTermCache = new Set();
  for (const cand of allCandidates()) for (const term of cand.terms) vocabTermCache.add(shNorm(term));
  vocabTermCache.delete('');
  return vocabTermCache;
}

/**
 * @param {string} value
 * @returns {{ok:boolean, why:string}} למה התקבל או נדחה — מוצג למאמן במסך הייבוא
 */
export function shPersonCheck(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, why: 'תא ריק' };
  if (raw.length > 40) return { ok: false, why: 'ארוך מכדי להיות שם' };

  const norm = shNorm(raw);
  if (!norm) return { ok: false, why: 'אין בו אותיות' };
  if (PLACEHOLDERS.has(norm)) return { ok: false, why: 'מציין מקום ולא שם של אדם' };
  if (/^[\d.,\s+\-/:]+$/.test(raw)) return { ok: false, why: 'מספר ולא שם' };
  if (/@/.test(raw)) return { ok: false, why: 'כתובת אימייל' };

  const tokens = shTokens(raw);
  if (!tokens.length) return { ok: false, why: 'אין בו אותיות' };
  if (tokens.length > 4) return { ok: false, why: 'משפט ולא שם' };

  // ספרות בתוך שם קורות ("מתאמן 3"), אבל רוב-ספרות הוא קוד ולא אדם
  const digits = (raw.match(/\d/g) || []).length;
  if (digits > raw.replace(/\s/g, '').length / 2) return { ok: false, why: 'רובו ספרות' };

  for (const token of tokens) {
    if (EXERCISE_WORD_SET.has(token)) return { ok: false, why: `"${token}" היא מילה מתוך שם של תרגיל` };
    if (OBJECT_WORD_SET.has(token)) return { ok: false, why: `"${token}" היא מילה של ציוד או של כותרת` };
  }

  /*
   * ההשוואה למאגר יקרה: מאות מונחים לכל ערך, ובגיליון עם אלפי שמות
   * ייחודיים אין למטמון מה לתפוס. לכן קודם שואלים שאלה זולה — האם יש
   * בכלל מילה משותפת בין הערך לבין אוצר המילים של התרגילים והציוד. שם
   * של אדם כמעט לעולם אינו חולק מילה עם "לחיצת חזה במוט", ולכן הוא נחסך
   * מכל ההשוואה.
   */
  const shared = tokens.filter((t) => vocabTokens().has(t)).length;
  if (vocabTerms().has(norm)) return { ok: false, why: 'ערך מתוך אוצר המילים של המערכת, לא שם' };
  /*
   * ההשוואה המטושטשת שמורה למקרים שבהם היא באמת יכולה לשנות תשובה:
   * ערך שכולו מילה אחת מאוצר המילים, או ערך שחולק עם המאגר שתי מילים
   * ומעלה. "דנה כהן" אינו אחד מהם, וכך אלפי שמות נחסכים ממנה.
   */
  if (!(shared >= 2 || (tokens.length === 1 && shared === 1))) return { ok: true, why: '' };

  /*
   * התאמה למאגר נדרשת להיות גבוהה מאוד. שם פרטי קצר יכול להידמות במקרה
   * למונח מהמאגר, ומחיקת מתאמן אמיתי גרועה בהרבה מהוספת שורה מיותרת
   * שהמאמן ימחק בלחיצה.
   */
  const exercise = shMatch(raw, exerciseCandidates(), { min: 0.86 });
  if (exercise) return { ok: false, why: `זהה לתרגיל במאגר (${exercise.matched})` };
  const equipment = shMatch(raw, equipmentCandidates(), { min: 0.88 });
  if (equipment) return { ok: false, why: `זהה לפריט ציוד (${equipment.matched})` };
  const header = shMatch(raw, shCandidates(HEADER_TERMS), { min: 0.9 });
  if (header) return { ok: false, why: 'כותרת עמודה ולא שורת נתונים' };
  for (const [terms, label] of [[GOAL_TERMS, 'מטרת אימון'], [LEVEL_TERMS, 'רמת מתאמן'], [WEEKDAY_TERMS, 'יום בשבוע']]) {
    if (shMatch(raw, shCandidates(terms), { min: 0.9 })) return { ok: false, why: `${label} ולא שם` };
  }

  return { ok: true, why: '' };
}

export const shLooksLikePerson = (value) => shPersonCheck(value).ok;
