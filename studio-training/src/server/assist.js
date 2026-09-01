/**
 * המוח: שכבת הבנה לשאריות.
 *
 * המנוע של המערכת נשאר דטרמיניסטי, ובכוונה — אותו גיליון מחזיר תמיד אותה
 * תשובה, כל מסקנה מגיעה עם נימוק שאפשר לבדוק, וזה רץ על מאה לשוניות
 * בשנייה וחצי בלי לעלות כסף. בתחום שבו טעות היא פציעה, נימוק שאפשר לבדוק
 * שווה יותר מניחוש חכם.
 *
 * אבל יש מקום אחד שבו קוד תמיד ייכשל: שפה חופשית. "לחיצה צרפתית",
 * "פרפר הפוך בשיפוע", "כאב בכתף ימין רק בלחיצות מעל הראש" — כל אלה
 * נכתבים אחרת בכל סטודיו, ואין רשימת כינויים שתכסה אותם. שם המודל טוב
 * ממני, ורק שם הוא מופעל.
 *
 * שלושה כללים שמגדירים את השכבה הזאת:
 *   1. היא רצה רק על מה שהזיהוי הרגיל *לא* הצליח לפענח. מה שזוהה — נשאר.
 *   2. היא מציעה, לא קובעת. כל הצעה עוברת לאישור המאמן.
 *   3. כל תשובה מאומתת מול המאגר הסגור. מזהה שאינו קיים נזרק.
 *
 * בלי מפתח או בלי SDK — הכול ממשיך לעבוד בדיוק כמו קודם.
 */

import { BY_ID, EXERCISES } from '../domain/exercises.js';
import { CONSTRAINTS } from '../domain/constraints.js';
import { claudeAvailable, claudeCall, claudeJson } from './claude.js';

/** האם השכבה החכמה זמינה בסביבה הזו. */
export async function assistAvailable() {
  return claudeAvailable();
}

/*
 * המאגר נשלח למודל כרשימה סגורה. זה מה שהופך את התשובה לבדיקה במקום
 * ליצירה: המודל בוחר מתוך מה שקיים, ולא ממציא תרגיל חדש.
 */
const EXERCISE_VOCAB = EXERCISES
  .map((e) => `${e.id} = ${e.name}${e.nameEn ? ` (${e.nameEn})` : ''}`)
  .join('\n');

const CONSTRAINT_VOCAB = Object.entries(CONSTRAINTS)
  .map(([id, c]) => `${id} = ${c.name}`)
  .join('\n');

const SYSTEM = `אתה עוזר למאמן כושר לייבא גיליון אימונים למערכת ניהול.

המערכת כבר זיהתה לבד את רוב מה שכתוב בגיליון. אתה מקבל *רק* את מה שהיא לא
הצליחה לפענח: שמות תרגילים שנכתבו בשפה חופשית, והערות חופשיות על מתאמנים.

תפקידך להתאים כל פריט למזהה מתוך הרשימות הסגורות שלמטה. אתה בוחר מתוך רשימה,
לא ממציא.

## תרגילים
${EXERCISE_VOCAB}

## מגבלות ופציעות
${CONSTRAINT_VOCAB}

כללים:
- החזר אך ורק JSON תקין, בלי טקסט לפני או אחרי.
- אל תמציא מזהים. מזהה שאינו ברשימה ייזרק.
- כשאינך בטוח — החזר confidence נמוך. אל תנחש בביטחון גבוה.
- כשאין התאמה סבירה כלל — החזר match: null. זו תשובה לגיטימית ועדיפה על התאמה שגויה.
- reason: משפט קצר בעברית שמסביר למאמן על סמך מה ההתאמה. הוא יראה אותו.
- בהערות: severity הוא mild | moderate | acute לפי חומרת הניסוח.

מבנה התשובה:
{"exercises":[{"input":"לחיצה צרפתית","match":"skullcrusher","confidence":0.9,"reason":"שם עממי לפשיטת מרפקים בשכיבה"}],
 "notes":[{"input":"כאב בכתף ימין בלחיצות מעל הראש","constraints":[{"id":"shoulder_impingement","severity":"moderate","side":"right","confidence":0.85,"reason":"כאב בכתף שמופיע בתנועה מעל הראש"}]}]}`;

/**
 * הצעות התאמה לשאריות של ייבוא.
 *
 * @param {{exercises?: string[], notes?: string[]}} leftovers
 * @returns {Promise<{exercises: object[], notes: object[], model: string}>}
 */
export async function suggestMatches(leftovers = {}) {
  const exercises = [...new Set((leftovers.exercises || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 120);
  const notes = [...new Set((leftovers.notes || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 60);
  if (!exercises.length && !notes.length) return { exercises: [], notes: [], model: null };

  const payload = JSON.stringify({ exercises, notes }, null, 1);
  const { text, model } = await claudeCall({
    system: SYSTEM,
    user: `הנה מה שלא זוהה. החזר JSON בלבד.\n\n${payload}`,
  });
  return { ...validateSuggestions(claudeJson(text)), model };
}

/*
 * אימות מול המאגר.
 *
 * זה החלק שהופך את השכבה לבטוחה: מזהה שאינו קיים נזרק בשקט, חומרה לא
 * חוקית מתוקנת לברירת מחדל זהירה, וביטחון שאינו מספר הופך ל-0.5. גם אם
 * המודל יחזיר שטויות, מה שייצא מכאן הוא תמיד נתון תקין של המערכת.
 */
export function validateSuggestions(parsed) {
  const validSeverity = new Set(['mild', 'moderate', 'acute']);
  const num = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.5);

  const exercises = (parsed.exercises || [])
    .filter((e) => e && typeof e.input === 'string')
    .map((e) => ({
      input: e.input,
      match: e.match && BY_ID[e.match] ? e.match : null,
      name: e.match && BY_ID[e.match] ? BY_ID[e.match].name : null,
      confidence: num(e.confidence),
      reason: String(e.reason || '').slice(0, 200),
    }));

  const notes = (parsed.notes || [])
    .filter((n) => n && typeof n.input === 'string')
    .map((n) => ({
      input: n.input,
      constraints: (n.constraints || [])
        .filter((c) => c && CONSTRAINTS[c.id])
        .map((c) => ({
          id: c.id,
          name: CONSTRAINTS[c.id].name,
          severity: validSeverity.has(c.severity) ? c.severity : 'moderate',
          side: ['right', 'left', 'both'].includes(c.side) ? c.side : null,
          confidence: num(c.confidence),
          reason: String(c.reason || '').slice(0, 200),
        })),
    }))
    .filter((n) => n.constraints.length);

  return { exercises, notes };
}

/* ================================================================
   הביקורת החכמה.

   הבדיקות הדטרמיניסטיות תופסות סתירות וחוסרים — משקל בלתי אפשרי, מגבלה
   שנוספה אחרי התכנית, ותק שסותר את הגיל. מה שהן לא יכולות לתפוס הוא
   שיקול דעת: האם *התכנית הזאת*, למתאמן *הזה*, הגיונית. מאמן ותיק שמסתכל
   על כרטיס ועל תכנית רואה דברים שאין להם כלל — ושם המודל מוסיף ערך.

   גם כאן: מציע ולא קובע, ומקבל רק את מה שכבר עבר את הבדיקות.
   ================================================================ */

const REVIEW_SYSTEM = `אתה מאמן כושר ותיק שעובר על כרטיס מתאמן ועל תכנית האימון שנבנתה לו,
ומחווה דעה מקצועית עבור המאמן שאחראי עליו.

המערכת כבר בדקה לבד את כל מה שניתן לבדוק בכללים: ערכים בלתי אפשריים, סתירות בין
שדות, מגבלות שלא נלקחו בחשבון, איזון דחיפה/משיכה, נפח שבועי, וציוד חסר. אל תחזור
על אלה. תפקידך הוא מה שדורש שיקול דעת של אדם.

דוגמאות למה שכן שווה לומר:
- התכנית לא הגיונית עבור המטרה המוצהרת, גם אם היא חוקית.
- שילוב של גיל, מגבלה ועצימות שמצדיק זהירות נוספת.
- פער בין מה שהמתאמן עושה בפועל לבין מה שהוגדר לו.
- משהו חסר בכרטיס שהיה משנה את התכנית באופן מהותי.

כללים:
- החזר אך ורק JSON תקין, בלי טקסט לפני או אחרי.
- לכל הערה: level הוא error | warning | info. השתמש ב-error רק כשמשהו עלול להזיק.
- אל תמציא נתונים שאינם בקלט. אם חסר לך מידע — זו עצמה יכולה להיות ההערה.
- עד שש הערות. אם הכול סביר, החזר רשימה ריקה. רשימה ריקה היא תשובה טובה.
- כתוב בעברית, במשפט אחד או שניים, כפי שמאמן היה אומר לעמית.

מבנה התשובה:
{"findings":[{"level":"warning","message":"...","fix":"..."}],"summary":"משפט אחד על המתאמן"}`;

/**
 * חוות דעת על מתאמן ועל התכנית שלו.
 *
 * הקלט מצומצם בכוונה למה שנחוץ למקצוע: אין שם, אין טלפון, אין אימייל.
 * מה שנשלח הוא פרופיל אימון — גיל, מין, משקל, רמה, מטרה, מגבלות ותכנית.
 *
 * @param {{trainee: object, program?: object, findings?: object[]}} input
 */
export async function reviewTrainee({ trainee, program = null, findings = [] } = {}) {
  if (!trainee) throw new Error('חסר מתאמן לביקורת');

  const payload = JSON.stringify({ trainee: profileFor(trainee), program: programFor(program), knownFindings: findings.map((x) => x.message) }, null, 1);
  const { text, model: served } = await claudeCall({
    system: REVIEW_SYSTEM,
    user: `עבור על הכרטיס והתכנית. החזר JSON בלבד.\n\n${payload}`,
  });
  const parsed = claudeJson(text);
  const levels = new Set(['error', 'warning', 'info']);
  return {
    model: served,
    summary: String(parsed.summary || '').slice(0, 300),
    findings: (parsed.findings || [])
      .filter((x) => x && typeof x.message === 'string')
      .slice(0, 6)
      .map((x) => ({
        level: levels.has(x.level) ? x.level : 'info',
        message: String(x.message).slice(0, 300),
        fix: String(x.fix || '').slice(0, 300),
        source: 'assist',
      })),
  };
}

/** פרופיל אימון בלבד — בלי פרטים מזהים. */
function profileFor(t) {
  return {
    age: t.age, sex: t.sex, weightKg: t.weightKg, heightCm: t.heightCm,
    level: t.level, trainingAgeMonths: t.trainingAgeMonths,
    primaryGoal: t.primaryGoal, trainingStyles: t.trainingStyles, preferredSplit: t.preferredSplit,
    daysPerWeek: t.daysPerWeek, sessionMinutes: t.sessionMinutes,
    sport: t.sport, externalSessions: t.externalSessions, lifestyle: t.lifestyle,
    constraints: (t.constraints || []).map((c) => ({ id: c.id, severity: c.severity, side: c.side })),
    sleepQuality: t.sleepQuality, stressLevel: t.stressLevel,
    workingLoads: Object.entries(t.history || {}).slice(0, 20)
      .map(([id, h]) => ({ exercise: BY_ID[id]?.name || id, kg: h.load ?? h.loadKg ?? null, reps: h.reps ?? null })),
  };
}

/** התכנית כפי שמאמן היה קורא אותה, בלי שדות פנימיים. */
function programFor(p) {
  if (!p) return null;
  return {
    split: p.meta?.split || null,
    days: (p.days || []).map((d) => ({
      label: d.dayLabel || d.label,
      minutes: d.estimatedMinutes,
      exercises: (d.blocks || []).map((b) => ({
        name: b.exercise?.name,
        role: b.role,
        sets: b.prescription?.sets,
        reps: b.prescription?.reps,
        kg: b.load?.kg ?? null,
      })),
    })),
  };
}

/* ================================================================
   מתכנן הייבוא — המוח של הבנת הגיליון.

   הרעיון: לא נותנים למודל לקרוא את הקובץ ולהמציא נתונים. מחלקים את
   העבודה לפי מה שכל צד באמת טוב בו:

     המודל מחליט *מה כל דבר* — מה כל לשונית, מה כל עמודה, של מי היא.
       זה שיקול דעת על שפה חופשית, ושם כללים תמיד יפספסו.
     הקוד קורא *את הערכים* — כל מספר, כל תאריך, כל שם, מהתאים עצמם.
       המודל לא נוגע במספרים בכלל, ולכן אין לו איך להמציא משקל.

   לכן הקלט אינו הקובץ אלא תקציר: כותרות וכמה שורות דוגמה מכל לשונית,
   לצד מה שהזיהוי האוטומטי כבר החליט. הפלט הוא תכנית מיפוי — תיקונים
   בלבד — שמוזרמת חזרה לאותו מנגנון דריסה שכבר קיים למאמן. גיליון של
   מאה לשוניות מתומצת לאלפי טוקנים בודדים, וכל תו בפלט מאומת מול
   רשימות סגורות.
   ================================================================ */

/** התפקידים שהמערכת מכירה; המודל בוחר מתוכם ולא ממציא. */
const PLAN_ROLES = new Set(['trainees', 'trainee_card', 'programs', 'log', 'measurements', 'attendance', 'equipment', 'studio', 'ignore']);

/** השדות שעמודה יכולה להיות; 'none' פירושו להתעלם מהעמודה. */
const PLAN_FIELDS = new Set(['none',
  'name', 'firstName', 'lastName', 'phone', 'email', 'sex', 'age', 'birthDate', 'heightCm', 'weightKg',
  'bodyFatPct', 'level', 'trainingAgeMonths', 'goal', 'goalDetail', 'daysPerWeek', 'sessionMinutes',
  'preferredDays', 'preferredTime', 'constraints', 'pastInjuries', 'medicalClearance', 'sport',
  'lifestyle', 'coach', 'studio', 'startDate', 'status', 'trainingStyle', 'notes',
  'exercise', 'sets', 'reps', 'load', 'rest', 'tempo', 'rpe', 'day', 'date', 'week', 'pain',
  'waist', 'chest', 'hips', 'arm', 'thigh', 'calf',
  'equipmentItem', 'count', 'weightRange',
]);

const PLAN_SYSTEM = `אתה מומחה לקריאת גיליונות מעקב של סטודיו לאימון כוח, ואתה עוזר למערכת לייבא אותם.

המערכת כבר ניתחה את הגיליון בעצמה. אתה מקבל תקציר: לכל לשונית — שמה, הכותרות, שורות
דוגמה, ומה שהמערכת החליטה (תפקיד הלשונית ומיפוי העמודות). תפקידך לבדוק את ההחלטות
ולתקן רק את מה ששגוי. אל תחזיר לשוניות שההבנה שלהן נכונה.

תפקידי לשונית אפשריים (בחר רק מאלה):
- trainees: רשימת מתאמנים, שורה לאדם
- trainee_card: כרטיס של מתאמן יחיד, פרט בכל שורה (מפתח-ערך)
- programs: תכנית אימונים — תרגילים עם סטים/חזרות/משקל
- log: יומן ביצועים עם תאריכים — מה בוצע בפועל
- measurements: מדידות גוף (משקל גוף, היקפים, אחוז שומן)
- attendance: נוכחות — מי הגיע מתי
- equipment: ציוד הסטודיו
- studio: פרטי הסטודיו
- ignore: הוראות, סיכומים, לשונית שאין לייבא

שדות עמודה אפשריים (בחר רק מאלה): name, phone, email, sex, age, heightCm, weightKg,
bodyFatPct, level, trainingAgeMonths, goal, daysPerWeek, sessionMinutes, preferredDays,
constraints, pastInjuries, sport, lifestyle, coach, studio, startDate, status, trainingStyle,
notes, exercise, sets, reps, load, rest, tempo, rpe, day, date, week, pain, waist, chest,
hips, arm, thigh, calf, equipmentItem, count, weightRange, none.

הבחנות שחשוב לדייק בהן:
- "משקל" בלשונית מדידות הוא weightKg (משקל גוף); "משקל" ליד תרגיל הוא load (משקל עבודה).
- עמודה ששמה "שם" אבל הערכים בה הם תרגילים — היא exercise, לא name.
- owner: כשלשונית שלמה שייכת לאדם אחד ושמו כתוב בשם הלשונית או בכותרת — ציין את שמו.
- אינך קורא מספרים ואינך ממציא ערכים. אתה קובע רק מה כל דבר.

החזר אך ורק JSON תקין:
{"sheets":[{"sheet":"<שם הלשונית>","role":"programs","owner":"רון כהן","columns":{"0":"exercise","3":"load"},"why":"משפט קצר בעברית"}]}
- כלול לשונית רק אם אתה מתקן בה משהו. columns כולל רק עמודות שגויות. owner רק כשידוע.
- רשימה ריקה {"sheets":[]} היא תשובה מצוינת כשהמערכת הבינה הכול נכון.`;

/**
 * תכנית מיפוי לייבוא: מה המודל מתקן בהבנת הגיליון.
 *
 * @param {{sheets: Array<{name:string, headers:string[], sample:string[][], rowCount:number,
 *          guessedRole:string, guessedColumns:Array<{index:number, field:string|null}>}>}} digest
 * @returns {Promise<{overrides:object, columnOverrides:object, ownerOverrides:object,
 *           explanations:string[], model:string|null}>}
 */
export async function planImport(digest = {}) {
  const sheets = (digest.sheets || []).slice(0, 100);
  if (!sheets.length) return { overrides: {}, columnOverrides: {}, ownerOverrides: {}, explanations: [], model: null };

  const compact = sheets.map((sh) => ({
    sheet: String(sh.name || '').slice(0, 60),
    rows: sh.rowCount,
    headers: (sh.headers || []).slice(0, 20).map((h) => String(h).slice(0, 30)),
    sample: (sh.sample || []).slice(0, 6).map((r) => r.slice(0, 20).map((c) => String(c ?? '').slice(0, 30))),
    systemGuess: {
      role: sh.guessedRole,
      columns: Object.fromEntries((sh.guessedColumns || [])
        .filter((c) => c.field).map((c) => [c.index, c.field])),
    },
  }));

  const { text, model } = await claudeCall({
    system: PLAN_SYSTEM,
    user: `הנה תקציר הגיליון. החזר JSON בלבד, עם תיקונים בלבד.\n\n${JSON.stringify(compact, null, 1)}`,
  });

  return { ...validatePlan(claudeJson(text), sheets), model };
}

/**
 * אימות התכנית מול הרשימות הסגורות ומול הגיליון עצמו.
 * תפקיד לא מוכר, שדה לא מוכר או עמודה שאינה קיימת — נזרקים בשקט.
 * מה שיוצא מכאן בטוח להזרמה ישירה למנגנון הדריסה.
 */
export function validatePlan(parsed, sheets = []) {
  const known = new Map(sheets.map((s) => [String(s.name || ''), s]));
  const overrides = {};
  const columnOverrides = {};
  const ownerOverrides = {};
  const explanations = [];

  for (const fix of parsed?.sheets || []) {
    const sheetName = String(fix?.sheet || '');
    const src = known.get(sheetName);
    if (!src) continue;

    if (fix.role && PLAN_ROLES.has(fix.role) && fix.role !== src.guessedRole) {
      overrides[sheetName] = fix.role;
    }
    const cols = {};
    for (const [idx, field] of Object.entries(fix.columns || {})) {
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || i >= (src.headers || []).length) continue;
      if (!PLAN_FIELDS.has(field)) continue;
      cols[i] = field;
    }
    if (Object.keys(cols).length) columnOverrides[sheetName] = cols;
    if (typeof fix.owner === 'string' && fix.owner.trim() && fix.owner.trim().length <= 40) {
      ownerOverrides[sheetName] = fix.owner.trim();
    }
    if (fix.why) explanations.push(`${sheetName}: ${String(fix.why).slice(0, 160)}`);
  }
  return { overrides, columnOverrides, ownerOverrides, explanations };
}
