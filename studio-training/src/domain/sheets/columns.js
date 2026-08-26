/**
 * מיפוי עמודות: מה כל עמודה בגיליון באמת מחזיקה.
 *
 * הכותרת היא רמז חזק אבל לא תמיד קיים ולא תמיד נכון ("משקל" יכול להיות
 * משקל הגוף של המתאמן או המשקל שהוא מרים בתרגיל). לכן כל עמודה נשפטת
 * פעמיים: לפי הכותרת שלה, ולפי מה שבאמת כתוב בתאים שמתחתיה. ההצלבה בין
 * השניים היא מה שמאפשר לייבא גיליון בלי לשאול את המאמן על כל עמודה.
 */

import {
  shBool, shDate, shEmail, shEmpty, shMatch, shNorm, shNum, shPhone, shSplitList,
} from './text.js';
import {
  constraintCandidates, equipmentCandidates, exerciseCandidates, GOAL_TERMS, HEADER_TERMS,
  LEVEL_TERMS, SEX_TERMS, shCandidates, SPORT_TERMS, WEEKDAY_TERMS,
} from './vocab.js';

const between = (n, lo, hi) => n !== null && n >= lo && n <= hi;
const intBetween = (n, lo, hi) => between(n, lo, hi) && Number.isInteger(n);

/** בדיקות תוכן לכל שדה: איזה חלק מהערכים בעמודה מתאים לשדה הזה. */
const VALUE_TESTS = {
  name: (v) => /\p{L}/u.test(v) && shNum(v) === null && v.length >= 2 && v.length <= 40,
  firstName: (v) => /^\p{L}[\p{L}'"-]{1,14}$/u.test(v.trim()),
  lastName: (v) => /^\p{L}[\p{L}'"-]{1,18}$/u.test(v.trim()),
  phone: (v) => shPhone(v) !== null,
  email: (v) => shEmail(v) !== null,
  sex: (v) => !!shMatch(v, shCandidates(SEX_TERMS), { min: 0.8 }),
  age: (v) => intBetween(shNum(v), 8, 99) && v.length <= 6,
  birthDate: (v) => !!shDate(v) && +String(shDate(v)).slice(0, 4) < new Date().getFullYear() - 5,
  heightCm: (v) => between(shNum(v), 120, 220) || between(shNum(v), 1.2, 2.2),
  weightKg: (v) => between(shNum(v), 30, 250),
  bodyFatPct: (v) => between(shNum(v), 3, 60),
  level: (v) => !!shMatch(v, shCandidates(LEVEL_TERMS), { min: 0.7 }),
  goal: (v) => shSplitList(v).some((p) => !!shMatch(p, shCandidates(GOAL_TERMS), { min: 0.65 })),
  daysPerWeek: (v) => intBetween(shNum(v), 1, 7) && v.length <= 12,
  sessionMinutes: (v) => between(shNum(v), 20, 180),
  preferredDays: (v) => shSplitList(v).some((p) => !!shMatch(p, shCandidates(WEEKDAY_TERMS), { min: 0.75 })),
  constraints: (v) => shSplitList(v).some((p) => !!shMatch(p, constraintCandidates(), { min: 0.66 })),
  medications: (v) => /\p{L}/u.test(v) && v.length > 2,
  medicalClearance: (v) => shBool(v) !== null,
  sport: (v) => !!shMatch(v, shCandidates(SPORT_TERMS), { min: 0.7 }),
  externalSessions: (v) => intBetween(shNum(v), 0, 14),
  coach: (v) => /\p{L}/u.test(v) && v.length <= 30 && shNum(v) === null,
  studio: (v) => /\p{L}/u.test(v) && v.length <= 30,
  startDate: (v) => !!shDate(v),
  targetDate: (v) => !!shDate(v),
  status: (v) => shBool(v) !== null,
  notes: (v) => v.length > 12,
  restingHR: (v) => between(shNum(v), 35, 120),
  bloodPressure: (v) => /\d{2,3}\s*[/\\]\s*\d{2,3}/.test(v),
  equipmentItem: (v) => !!shMatch(v, equipmentCandidates(), { min: 0.7 }),
  count: (v) => intBetween(shNum(v), 0, 500),
  weightRange: (v) => /\d+\s*[-–]\s*\d+/.test(v),
  // רק התאמה אמיתית למאגר. עמודת טקסט חופשי אינה עמודת תרגילים רק כי יש בה מילים.
  exercise: (v) => !!shMatch(v, exerciseCandidates(), { min: 0.66 }),
  sets: (v) => intBetween(shNum(v), 1, 12) && v.length <= 5,
  reps: (v) => /^\s*\d{1,3}\s*([-–xX*]\s*\d{1,3})?\s*$/.test(v) || between(shNum(v), 1, 100),
  load: (v) => between(shNum(v), 0.5, 400),
  rest: (v) => between(shNum(v), 10, 600),
  rpe: (v) => between(shNum(v), 1, 10),
  day: (v) => /^[A-Za-zא-ת]?\s*\d?$/.test(v.trim()) || /יום|אימון|day|workout/i.test(v),
  date: (v) => !!shDate(v),
  week: (v) => intBetween(shNum(v), 1, 60),
  pain: (v) => between(shNum(v), 0, 10),
  waist: (v) => between(shNum(v), 40, 200),
  chest: (v) => between(shNum(v), 50, 200),
  hips: (v) => between(shNum(v), 50, 200),
  arm: (v) => between(shNum(v), 15, 70),
  thigh: (v) => between(shNum(v), 25, 100),
  calf: (v) => between(shNum(v), 20, 70),
  neckSize: (v) => between(shNum(v), 25, 60),
  price: (v) => between(shNum(v), 0, 100000),
  idNumber: (v) => /^\d{7,9}$/.test(v.trim()),
  address: (v) => /\p{L}/u.test(v) && v.length > 5,
};

/**
 * שדות שכמעט לכל מספר יש סיכוי להיראות כמוהם. בלי כותרת תומכת
 * לא נכריע לפיהם, אחרת כל עמודת מספרים הייתה הופכת ל"מחיר".
 */
const NEEDS_HEADER = new Set([
  'price', 'idNumber', 'week', 'rest', 'rpe', 'pain', 'count', 'externalSessions',
  'restingHR', 'waist', 'chest', 'hips', 'arm', 'thigh', 'calf', 'neckSize',
  'bodyFatPct', 'notes', 'coach', 'studio', 'address', 'status', 'medications',
  'firstName', 'lastName', 'medicalClearance', 'day', 'targetDate', 'birthDate',
  'goalDetail', 'pastInjuries', 'trainingAgeMonths', 'preferredTime', 'tempo',
]);

/** שדות שמתאימים לתפקיד טבלה מסוים — הטיה עדינה, לא כלל נוקשה. */
const ROLE_BIAS = {
  trainees: { name: 0.5, phone: 0.3, goal: 0.3, level: 0.3, constraints: 0.3, weightKg: 0.25, age: 0.3, load: -1 },
  equipment: { equipmentItem: 0.6, count: 0.5, weightRange: 0.4 },
  // בגיליון תכנית "משקל" הוא תמיד העומס בתרגיל. משקל גוף אינו נרשם לצד תרגיל.
  programs: { exercise: 0.6, sets: 0.5, reps: 0.5, load: 1.2, day: 0.3, weightKg: -2 },
  log: { exercise: 0.5, date: 0.5, load: 1.2, reps: 0.4, rpe: 0.3, weightKg: -2 },
  measurements: { date: 0.5, weightKg: 0.6, bodyFatPct: 0.4, waist: 0.4, chest: 0.3, hips: 0.3, load: -1 },
};

const HEADER_CANDIDATES = shCandidates(HEADER_TERMS);

/** כמה מהערכים בעמודה עומדים במבחן של שדה מסוים. */
function valueFit(values, field) {
  const test = VALUE_TESTS[field];
  if (!test || !values.length) return 0;
  let hit = 0;
  for (const v of values) { try { if (test(v)) hit++; } catch { /* ערך משונה — לא נחשב */ } }
  return hit / values.length;
}

/**
 * מיפוי כל עמודות הטבלה.
 * מחזיר לכל עמודה את השדה שנבחר, את הניקוד ואת ההסבר — ההסבר מוצג
 * למאמן, כי ייבוא שאי אפשר לבדוק אותו הוא ייבוא שאי אפשר לסמוך עליו.
 */
export function shMapColumns(table, { role = null, sample = 40 } = {}) {
  const bias = ROLE_BIAS[role] || {};
  const columns = table.headers.map((header, index) => {
    const values = table.rows.map((r) => r[index]).filter((v) => !shEmpty(v)).slice(0, sample);
    const headerHit = shMatch(header, HEADER_CANDIDATES, { min: 0.7 });
    const scores = [];

    for (const field of Object.keys(VALUE_TESTS)) {
      const byHeader = headerHit && headerHit.key === field ? headerHit.score : 0;
      const byValue = valueFit(values, field);
      if (!byHeader && NEEDS_HEADER.has(field)) continue;
      if (!byHeader && byValue < 0.6) continue;
      const score = byHeader * 3 + byValue * 2 + (bias[field] || 0);
      if (score > 0.9) scores.push({ field, score: +score.toFixed(3), byHeader: +byHeader.toFixed(2), byValue: +byValue.toFixed(2) });
    }
    scores.sort((a, b) => b.score - a.score);

    return {
      index,
      header,
      values,
      filled: values.length,
      candidates: scores.slice(0, 4),
      field: null,
      score: 0,
    };
  });

  // הקצאה חמדנית: העמודה עם הראיה החזקה ביותר בוחרת ראשונה.
  // כך "משקל" בגיליון מתאמנים הולך למשקל גוף, ובגיליון תכנית — לעומס.
  const taken = new Set();
  const all = columns.flatMap((c) => c.candidates.map((s) => ({ ...s, column: c })));
  all.sort((a, b) => b.score - a.score);
  for (const item of all) {
    if (item.column.field || taken.has(item.field)) continue;
    item.column.field = item.field;
    item.column.score = item.score;
    item.column.why = item.byHeader >= 0.7
      ? (item.byValue >= 0.5 ? 'כותרת ותוכן' : 'כותרת')
      : 'תוכן העמודה';
    taken.add(item.field);
  }

  const byField = {};
  for (const c of columns) if (c.field) byField[c.field] = c.index;
  return { columns, byField };
}

/** ערך תא לפי שם שדה — הדרך היחידה שבה שאר הקוד ניגש לנתונים. */
export function shCell(row, byField, field) {
  const i = byField[field];
  return i === undefined ? '' : (row[i] || '');
}

/** האם השדה קיים בטבלה ויש בו ערך בשורה הזו. */
export function shHas(row, byField, field) {
  return !shEmpty(shCell(row, byField, field));
}

export { VALUE_TESTS as SH_VALUE_TESTS, shNorm as shNormValue };

/**
 * גיליון בלי שורת כותרת בכלל.
 *
 * זיהוי הכותרת מניח שיש כותרת, ולכן בגיליון שמתחיל ישר בנתונים המתאמן
 * הראשון היה הופך לכותרת ונעלם. כאן בודקים את ההפך: אם השורה שנבחרה
 * מתנהגת כמו הנתונים שמתחתיה ואינה נשמעת ככותרת — היא נתונים, ומוחזרת.
 */
export function shFixHeaderless(table) {
  if (!table.headers.length || !table.rows.length) return table;

  const named = table.headers.filter((h) => !shEmpty(h)
    && shMatch(h, HEADER_CANDIDATES, { min: 0.75 })).length;
  if (named >= 1) return table;

  let dataLike = 0; let checked = 0;
  table.headers.forEach((cell, i) => {
    if (shEmpty(cell)) return;
    checked++;
    const values = table.rows.map((r) => r[i]).filter((v) => !shEmpty(v)).slice(0, 20);
    if (!values.length) return;
    for (const field of Object.keys(VALUE_TESTS)) {
      if (NEEDS_HEADER.has(field)) continue;
      if (valueFit(values, field) >= 0.7 && valueFit([cell], field) === 1) { dataLike++; return; }
    }
  });

  if (!checked || dataLike / checked < 0.6) return table;
  return {
    ...table,
    headerRow: -1,
    headers: table.headers.map(() => ''),
    rows: [table.headers, ...table.rows],
    headerless: true,
  };
}
