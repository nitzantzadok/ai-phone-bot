/**
 * מה כל לשונית בגיליון מחזיקה.
 *
 * סטודיו לא מארגן את הגיליון שלו לפי המודל של המערכת: יש לשונית "לקוחות",
 * לשונית "ציוד", לשונית לכל מתאמן עם התכנית שלו, ולוח נוכחות עם תאריכים
 * בכותרות. כאן מחליטים מה כל אחת מהן, לפי שם הלשונית, לפי השדות שזוהו בה
 * ולפי צורת הנתונים — ולא לפי הנחה על סדר הלשוניות.
 */

import { shDate, shEmpty, shMatch, shNorm, shTokens } from './text.js';
import { HEADER_TERMS, shCandidates } from './vocab.js';
import { shKeyValueTable, shLooksLikeKeyValue } from './table.js';
import { shMapColumns } from './columns.js';
import { equipmentCandidates, exerciseCandidates } from './vocab.js';

/** שמות לשוניות מקובלים לכל תפקיד. */
const SHEET_NAME_TERMS = {
  trainees: ['מתאמנים', 'לקוחות', 'רשימת מתאמנים', 'מנויים', 'תלמידים', 'חברים', 'trainees', 'clients', 'members', 'people'],
  equipment: ['ציוד', 'מכשירים', 'מלאי', 'מכשור', 'רשימת ציוד', 'equipment', 'inventory', 'machines'],
  programs: ['תכניות', 'תוכניות', 'תכנית אימון', 'אימונים', 'תרגילים', 'מערכי אימון', 'programs', 'workouts', 'routines'],
  log: ['יומן', 'ביצועים', 'מעקב', 'רישום', 'תיעוד', 'log', 'tracking', 'history'],
  measurements: ['מדידות', 'היקפים', 'משקלים', 'שקילות', 'measurements', 'metrics', 'body'],
  attendance: ['נוכחות', 'הגעות', 'לוח', 'יומן נוכחות', 'attendance', 'schedule', 'calendar'],
  studio: ['סטודיו', 'פרטי הסטודיו', 'כללי', 'הגדרות', 'מידע', 'studio', 'settings', 'info', 'general'],
};

const NAME_CANDIDATES = Object.entries(SHEET_NAME_TERMS).map(([key, terms]) => ({ key, terms }));

const HEADER_CANDS = shCandidates(HEADER_TERMS);

/** שדות שמופיעים בכרטיס אישי של מתאמן. */
const PERSON_FIELDS = new Set(['name', 'firstName', 'lastName', 'age', 'birthDate', 'sex',
  'weightKg', 'heightCm', 'goal', 'level', 'constraints', 'daysPerWeek', 'sessionMinutes',
  'phone', 'email', 'trainingAgeMonths', 'sport', 'coach']);

/** תוויות שמופיעות בגיליון פרטי סטודיו ולא ברשימת אנשים. */
const STUDIO_LABELS = ['סטודיו', 'כתובת', 'שעות', 'אורכ אימונ', 'משכ אימונ', 'מתאמנימ במקביל',
  'מאמנימ', 'תקרה', 'שטח', 'סוג הסטודיו', 'עיר'].map(shNorm);

/** האם רוב הכותרות הן תאריכים — הסימן המובהק ללוח נוכחות. */
function dateHeaderRatio(table) {
  const filled = table.headers.filter((h) => !shEmpty(h));
  if (filled.length < 3) return 0;
  return filled.filter((h) => shDate(h)).length / filled.length;
}

/**
 * איזה חלק מהערכים בעמודה נראים כמו פריטי ציוד / שמות תרגילים.
 * כשהעמודה זוהתה כבר — בודקים אותה. אחרת בודקים את התא הטקסטואלי הראשון
 * בכל שורה, שהוא כמעט תמיד "מה השורה הזאת מתארת".
 */
function columnLooksLike(table, candidates, { index = null, min = 0.66 } = {}) {
  const values = (index !== null && index !== undefined
    ? table.rows.map((r) => r[index])
    : table.rows.map((r) => r.find((c) => !shEmpty(c))))
    .filter((v) => !shEmpty(v)).slice(0, 30);
  if (!values.length) return 0;
  const hits = values.filter((v) => shMatch(v, candidates, { min })).length;
  // התאמה בודדת אינה "רוב השורות". בטבלה בת שורה אחת כל מילה שמזכירה
  // פריט ציוד הייתה מכריעה את הסיווג של הלשונית כולה.
  if (hits < 2 && values.length < 3) return 0;
  return hits / values.length;
}

/**
 * איזה חלק מהשמות חוזרים על עצמם.
 * רשימת מתאמנים היא רשימת אנשים — כל אחד פעם אחת. יומן ומדידות חוזרים על
 * אותו אדם שוב ושוב. זה ההבדל שמפריד בין השניים כשהעמודות דומות.
 */
function nameRepeatRatio(table, index) {
  if (index === undefined || index === null || table.rows.length < 2) return 0;
  const names = table.rows.map((r) => shNorm(r[index])).filter(Boolean);
  if (names.length < 2) return 0;
  return 1 - (new Set(names).size / names.length);
}

/**
 * תפקיד הלשונית + רמת ביטחון + הסבר.
 * ההסבר אינו קישוט: הוא מה שמאפשר למאמן לראות למה המערכת החליטה כך
 * ולתקן בלחיצה אחת כשהיא טועה.
 */
export function shClassifyTable(table) {
  if (table.empty) return { role: 'empty', confidence: 1, why: 'לשונית ריקה', fields: [] };

  const neutral = shMapColumns(table);
  const fields = new Set(Object.keys(neutral.byField));
  const has = (...f) => f.every((x) => fields.has(x));
  const any = (...f) => f.some((x) => fields.has(x));

  const scores = [];
  const add = (role, score, why) => scores.push({ role, score, why });

  /*
   * לוח נוכחות נבדק ראשון: יש בו עמודת שם ולכן הוא נראה בדיוק כמו רשימת
   * מתאמנים, וההבדל היחיד — שהתאריכים יושבים בכותרות — מכריע.
   */
  const dateHeaders = dateHeaderRatio(table);
  if (dateHeaders >= 0.5) {
    add('attendance', 2.6 + dateHeaders, 'התאריכים נמצאים בכותרות העמודות');
  }

  const byName = shMatch(table.name, NAME_CANDIDATES, { min: 0.7 });
  if (byName) add(byName.key, 1.2 * byName.score, `שם הלשונית "${table.name}"`);

  /*
   * שם יכול להגיע כעמודה אחת או כשתיים — "שם פרטי" ו"שם משפחה" הן פריסה
   * נפוצה ברשימות חברים, ובלי לזהות אותה כשם הלשונית כולה לא נקראת.
   */
  const hasName = has('name') || (has('firstName') && has('lastName')) || has('firstName');
  const nameColumn = neutral.byField.name ?? neutral.byField.firstName;
  const repeat = nameRepeatRatio(table, nameColumn);
  if (dateHeaders < 0.5 && hasName && !fields.has('exercise')
      && any('phone', 'age', 'goal', 'level', 'constraints', 'weightKg', 'sex', 'birthDate',
        'email', 'startDate', 'daysPerWeek', 'sessionMinutes', 'coach', 'heightCm')) {
    add('trainees', 2.2 - 2.4 * repeat, repeat > 0.15
      ? 'עמודת שם עם פרטים, אבל שמות חוזרים'
      : 'עמודת שם יחד עם פרטים אישיים');
  } else if (hasName && fields.size >= 3 && !fields.has('exercise')) {
    add('trainees', 1.1 - repeat, 'עמודת שם ועוד פרטים');
  }

  const eqRatio = columnLooksLike(table, equipmentCandidates(), { index: neutral.byField.equipmentItem });
  if (fields.has('equipmentItem') || eqRatio >= 0.5) {
    add('equipment', 1.4 + eqRatio, eqRatio >= 0.5 ? 'רוב השורות הן שמות של ציוד' : 'עמודת ציוד');
  }

  const exRatio = columnLooksLike(table, exerciseCandidates(), { index: neutral.byField.exercise, min: 0.7 });
  if (fields.has('exercise') || exRatio >= 0.45) {
    const strength = 1.1 + exRatio;
    if (any('sets', 'reps')) add('programs', strength + 0.8, 'תרגילים עם סטים וחזרות');
    if (has('date') && any('load', 'reps', 'rpe', 'weightKg')) {
      add('log', strength + 0.9 + repeat, 'תרגילים עם תאריך וביצוע בפועל');
    }
    if (!any('sets', 'reps', 'date')) add('programs', strength, 'רשימת תרגילים');
  }

  if (has('date') && any('weightKg', 'bodyFatPct', 'waist', 'chest', 'hips', 'arm', 'thigh') && !fields.has('exercise')) {
    // תאריך לצד מדדי גוף הוא חתימה חד-משמעית: רשימת מתאמנים לא נראית כך
    add('measurements', 2.4 + repeat, 'תאריך יחד עם מדדי גוף');
  }

  /*
   * פרטי הסטודיו נכתבים כרשימת "תווית: ערך" ולא כטבלה. רשימת מתאמנים
   * של שם וטלפון נראית אותו דבר, ולכן לא די בצורה — נדרש שהתוויות עצמן
   * ידברו על המקום ולא על אנשים.
   */
  if (shLooksLikeKeyValue(table)) {
    const flat = shKeyValueTable(table);
    const labels = flat.headers.map((l) => shNorm(l));
    const hits = labels.filter((l) => STUDIO_LABELS.some((t) => l.includes(t))).length;
    if (hits >= 2) add('studio', 1.4 + hits * 0.2, 'רשימה של פרטי המקום');

    /*
     * אותה צורה משמשת גם לכרטיס אישי של מתאמן — "שם / גיל / משקל / מטרה"
     * בשורות. ההכרעה נעשית לפי התוויות עצמן ולא לפי הערכים: ברשימת
     * מתאמנים רגילה העמודה הראשונה מכילה שמות של אנשים, לא שמות של שדות.
     */
    const person = flat.headers.filter((label) => {
      const hit = shMatch(label, HEADER_CANDS, { min: 0.78 });
      return hit && PERSON_FIELDS.has(hit.key);
    }).length;
    if (person >= 3) add('trainee_card', 1.6 + person * 0.2, 'כרטיס אישי: פרט בכל שורה');
  }

  if (!scores.length) add('unknown', 0.2, 'לא זוהה מבנה מוכר');

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  return {
    role: top.role,
    confidence: +Math.min(1, top.score / 3).toFixed(2),
    why: top.why,
    alternatives: second ? scores.slice(1, 3).map((s) => ({ role: s.role, why: s.why })) : [],
    fields: [...fields],
  };
}

/** תפקידים שאפשר לבחור מהם ידנית כשהזיהוי טעה. */
export const SHEET_ROLES = [
  { key: 'trainees', label: 'מתאמנים' },
  { key: 'trainee_card', label: 'כרטיס מתאמן אחד' },
  { key: 'equipment', label: 'ציוד' },
  { key: 'programs', label: 'תכניות אימון' },
  { key: 'log', label: 'יומן ביצועים' },
  { key: 'measurements', label: 'מדידות' },
  { key: 'attendance', label: 'נוכחות' },
  { key: 'studio', label: 'פרטי הסטודיו' },
  { key: 'skip', label: 'לא לייבא' },
];

export const ROLE_LABEL = Object.fromEntries(SHEET_ROLES.map((r) => [r.key, r.label]));

/** האם שם הלשונית הוא שם של אדם — לשונית תכנית אישית. */
export function shSheetPersonName(name, traineeNames = []) {
  /*
   * "תכנית של רון" ו"אימון — דנה" הן דרכים נפוצות לקרוא ללשונית אישית.
   * מסירים את המילים שמתארות את הלשונית, ומה שנשאר הוא השם.
   */
  const stripped = String(name || '')
    .replace(/^\s*(תכנית|תוכנית|מערך|אימון|אימונים|תכנית אימון|תוכנית אימון|program|workout|plan)\s*/i, '')
    .replace(/^\s*(של|עבור|ל|for|of)\s+/i, '')
    .trim();
  const candidate = stripped || String(name || '');
  const n = shNorm(candidate);
  if (!n) return null;
  if (shMatch(candidate, NAME_CANDIDATES, { min: 0.75 })) return null;
  const hit = traineeNames.find((t) => shNorm(t) === n);
  if (hit) return hit;
  const near = traineeNames.find((t) => shMatch(candidate, [{ key: t, terms: [t] }], { min: 0.85 }));
  if (near) return near;

  /*
   * לשונית בשם פרטי בלבד — "רון" — שייכת ל"רון כהן" כשהוא היחיד בשם הזה.
   * כששני מתאמנים חולקים שם פרטי אין דרך לדעת למי היא שייכת, ואז עדיף
   * ליצור רשומה נפרדת מאשר לצרף תכנית לאדם הלא נכון.
   */
  const byFirstName = traineeNames.filter((t) => shTokens(t)[0] === n);
  if (byFirstName.length === 1) return byFirstName[0];
  // שתי מילים בעברית בלי מספרים — נראה כמו שם פרטי ומשפחה
  return /^[\p{L}]+( [\p{L}]+){0,2}$/u.test(candidate) && !/\d/.test(candidate) ? candidate : null;
}
