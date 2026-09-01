/**
 * הביקורת: האם הנתונים נכונים, והאם התכנית באמת מתאימה.
 *
 * למערכת יש כבר בקרת איכות על התכנית — האם היא חוקית, מאוזנת ובטוחה.
 * מה שלא היה לה הוא בקרה על מה שנכנס אליה. תכנית מושלמת שנבנתה על משקל
 * גוף שהוקלד בליברות, על רמה שסותרת את הוותק, או על מתאמן שהנתונים שלו
 * מלפני שנתיים — היא תכנית מושלמת עבור אדם שאינו קיים.
 *
 * שלושה עקרונות:
 *   1. כל ממצא מצביע על *סתירה* או על *חוסר* קונקרטי — לא על תחושה.
 *   2. כל ממצא אומר מה לעשות, ולא רק מה לא בסדר.
 *   3. חומרה אמיתית: 'error' הוא משהו שמייצר תכנית שגויה, 'warning' הוא
 *      משהו שמוריד את איכותה, 'info' הוא שיפור אפשרי. ערימת אזהרות
 *      שכולן צהובות היא רשימה שאיש לא קורא.
 */

import { GOALS, LEVELS, SPORTS } from './taxonomy.js';
import { CONSTRAINTS } from './constraints.js';
import { LEVEL_LABELS } from './labels.js';
import { TRAINING_AGE_MIN_MONTHS } from './level.js';
import { BY_ID } from './exercises.js';

/** ימים בין תאריך למועד ההשוואה. שם ייחודי כי המאגד מאחד את כל המודולים לקובץ אחד. */
const reviewDaysBetween = (from, to) => Math.round((to - new Date(from)) / 86400000);

/** גבולות פיזיולוגיים. מחוץ להם זו כמעט תמיד טעות הקלדה, לא אדם חריג. */
const BOUNDS = {
  weightKg: [30, 250],
  heightCm: [120, 230],
  age: [10, 100],
  bmi: [13, 60],
};

/**
 * ביקורת על מתאמן אחד.
 *
 * @param {object} trainee מתאמן מנורמל
 * @param {{studio?:object, programs?:object[], now?:Date}} ctx
 * @returns {{findings: object[], score: number}}
 */
export function auditTrainee(trainee, { studio = null, programs = [], now = new Date() } = {}) {
  const f = [];
  const add = (level, code, message, fix) => f.push({ level, code, message, fix: fix || '' });
  const t = trainee;

  /* ---------------------------------------------------------- ערכים בלתי אפשריים */

  if (t.weightKg && (t.weightKg < BOUNDS.weightKg[0] || t.weightKg > BOUNDS.weightKg[1])) {
    add('error', 'weight_impossible', `משקל גוף ${t.weightKg} ק״ג אינו סביר.`,
      'לתקן בכרטיס המתאמן — כל הצעות המשקל נגזרות ממנו.');
  }
  if (t.heightCm && (t.heightCm < BOUNDS.heightCm[0] || t.heightCm > BOUNDS.heightCm[1])) {
    add('error', 'height_impossible', `גובה ${t.heightCm} ס״מ אינו סביר.`, 'לתקן בכרטיס המתאמן.');
  }
  if (t.age && (t.age < BOUNDS.age[0] || t.age > BOUNDS.age[1])) {
    add('error', 'age_impossible', `גיל ${t.age} אינו סביר.`, 'לתקן בכרטיס המתאמן.');
  }

  /*
   * BMI חריג הוא לרוב סימן לבלבול יחידות — משקל שהוקלד בליברות או גובה
   * במטרים. זו טעות שקטה: המספר נראה תקין בפני עצמו, והתכנית שנבנית ממנו
   * שגויה לחלוטין.
   */
  if (t.weightKg && t.heightCm) {
    const bmi = t.weightKg / ((t.heightCm / 100) ** 2);
    if (bmi < BOUNDS.bmi[0] || bmi > BOUNDS.bmi[1]) {
      add('error', 'bmi_impossible',
        `היחס בין המשקל (${t.weightKg} ק״ג) לגובה (${t.heightCm} ס״מ) אינו אפשרי — BMI ${bmi.toFixed(0)}.`,
        'לרוב זו יחידה שגויה: משקל בליברות במקום בקילוגרמים, או גובה במטרים במקום בסנטימטרים.');
    }
  }

  /* ---------------------------------------------------------- סתירות פנימיות */

  const months = t.trainingAgeMonths;
  if (Number.isFinite(months) && months > 0 && t.age) {
    // אי אפשר להתחיל להתאמן לפני גיל שמונה בערך
    const maxMonths = Math.max(0, (t.age - 8) * 12);
    if (months > maxMonths) {
      add('error', 'training_age_before_birth',
        `ותק של ${months} חודשים אינו אפשרי בגיל ${t.age}.`, 'לתקן את הוותק או את הגיל.');
    }
  }
  const needed = TRAINING_AGE_MIN_MONTHS[LEVELS.indexOf(t.level)] || 0;
  if (Number.isFinite(months) && months > 0 && months < needed) {
    add('warning', 'level_over_training_age',
      `רמת «${LEVEL_LABELS[t.level] || t.level}» עם ותק של ${months} חודשים בלבד.`,
      `המערכת מתייחסת אליו לפי הוותק. אם הרמה נכונה — לעדכן את הוותק ל-${needed} חודשים לפחות.`);
  }

  if ((t.preferredDays || []).length && t.preferredDays.length < t.daysPerWeek) {
    add('warning', 'not_enough_days',
      `${t.daysPerWeek} אימונים בשבוע אבל רק ${t.preferredDays.length} ימים מסומנים כזמינים.`,
      'להוסיף ימים זמינים או להוריד את מספר האימונים.');
  }

  if (t.primaryGoal && !GOALS.includes(t.primaryGoal)) {
    add('error', 'unknown_goal', `המטרה "${t.primaryGoal}" אינה מוכרת למערכת.`, 'לבחור מטרה מהרשימה.');
  }
  if (t.sport && !SPORTS[t.sport]) {
    add('warning', 'unknown_sport', `ענף הספורט "${t.sport}" אינו מוכר.`, 'לבחור מהרשימה כדי שעבודת המניעה תיכנס.');
  }
  for (const c of t.constraints || []) {
    if (!CONSTRAINTS[c.id]) {
      add('warning', 'unknown_constraint', `המגבלה "${c.id}" אינה מוכרת ולכן אינה מסננת תרגילים.`,
        'לבחור מגבלה מהרשימה בכרטיס המתאמן — אחרת התכנית אינה מתחשבת בה.');
    }
  }

  /*
   * שיקום בלי מגבלה רשומה: המטרה מבקשת זהירות, אבל אין למערכת מה לסנן.
   * זה בדיוק המצב שבו התכנית נראית "רגילה" למרות שהמאמן ביקש שיקום.
   */
  if (t.primaryGoal === 'rehab' && !(t.constraints || []).length) {
    add('warning', 'rehab_without_constraint',
      'המטרה היא שיקום, אבל לא נרשמה שום מגבלה.',
      'בלי מגבלה רשומה המערכת אינה יודעת ממה להימנע — כדאי להוסיף את האזור והחומרה.');
  }

  /* ---------------------------------------------------------- נתונים שהתיישנו */

  /*
   * אין כאן בדיקה של "המשקל בכרטיס התיישן": הנרמול ממילא מעדיף את המדידה
   * האחרונה על פני מה שהוקלד פעם בטופס, ולכן הסתירה הזאת לא יכולה להתקיים.
   * כלל שלא יכול לפעול הוא כלל שמייצר ביטחון מדומה.
   */

  /*
   * משקל עבודה שאינו אפשרי ביחס למשקל הגוף הוא כמעט תמיד טעות הקלדה
   * (ספרה נוספת), והוא מרעיל את כל ההערכות: הרמה עולה, והצעות המשקל
   * בתכנית הבאה נגזרות ממנו.
   */
  if (t.weightKg) {
    for (const [id, rec] of Object.entries(t.history || {})) {
      const load = rec?.load ?? rec?.loadKg;
      if (!Number.isFinite(load) || load <= 0) continue;
      const ex = BY_ID[id];
      const ratio = load / t.weightKg;
      if (ratio > 4) {
        add('error', 'load_impossible',
          `נרשם ${load} ק״ג ב"${ex?.name || id}" — פי ${ratio.toFixed(1)} ממשקל הגוף.`,
          'כמעט תמיד ספרה מיותרת. משקל שגוי כאן מעלה את הרמה ומזיז את כל התכנית.');
      }
    }
  }

  const future = (t.sessionLog || []).filter((e) => e.date && new Date(e.date) > now).length;
  if (future) {
    add('warning', 'future_log', `${future} רישומי אימון נושאים תאריך עתידי.`,
      'לרוב שגיאת תאריך בייבוא. רישום עתידי נחשב כ"האימון האחרון" ומסתיר אימון אמיתי.');
  }

  /* ---------------------------------------------------------- מצב וטיפול */

  const lastSeen = lastActivity(t, programs);
  if (t.active !== false && lastSeen && reviewDaysBetween(lastSeen, now) > 120) {
    add('info', 'dormant',
      `לא נרשם דבר כבר ${Math.round(reviewDaysBetween(lastSeen, now) / 30)} חודשים, והמתאמן מסומן כפעיל.`,
      'סימון כלא-פעיל ימנע ממנו לקבל תכנית בהפקה לכולם.');
  }

  if (!t.weightKg) {
    add('warning', 'no_weight', 'אין משקל גוף.',
      'בלי משקל גוף הצעות המשקל נשענות על טווחים מוחלטים בלבד — זה הנתון היחיד שמשפר הכי הרבה.');
  }
  if (!Object.keys(t.history || {}).length && t.levelSource !== 'inferred') {
    add('info', 'no_evidence', 'הרמה הוזנה ידנית ואין עדיין משקלי עבודה שנרשמו.',
      'רישום סטים באימון הופך את ההערכה למדידה.');
  }

  return { findings: f, score: scoreOf(f) };
}

/** התאריך האחרון שיש עליו עדות כלשהי. */
function lastActivity(t, programs) {
  const dates = [
    ...(t.sessionLog || []).map((e) => e.date),
    ...(t.sessions || []).map((s) => s.date),
    ...(t.measurements || []).map((m) => m.date),
    ...programs.map((p) => p.at || p.generatedAt),
  ].filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * האם התכנית שנבנתה עדיין מתאימה למתאמן שהיא נבנתה עבורו.
 *
 * תכנית אינה מתיישנת בגלל הזמן שעבר אלא בגלל מה שהשתנה מאז: רמה, מטרה,
 * מגבלה חדשה, סניף אחר. הבדיקה הזאת מחפשת בדיוק את הפער הזה.
 */
export function auditProgramFit(trainee, snapshot, { now = new Date() } = {}) {
  const f = [];
  const add = (level, code, message, fix) => f.push({ level, code, message, fix: fix || '' });

  if (!snapshot) {
    add('warning', 'no_program', 'לא נבנתה למתאמן אף תכנית.', 'לבנות תכנית ממסך המתאמנים.');
    return { findings: f, score: scoreOf(f) };
  }

  const p = snapshot.program || snapshot;
  const meta = p.meta || {};

  // תכנית שיובאה מהגיליון אינה נמדדת מול המנוע — היא רישום היסטורי
  if (meta.imported || snapshot.reason === 'imported') {
    add('info', 'imported_only', 'התכנית האחרונה היא רישום שיובא מהגיליון ולא תכנית שנבנתה.',
      'בניית תכנית חדשה תתאים אותה לרמה, לציוד ולמגבלות הרשומים היום.');
    return { findings: f, score: scoreOf(f) };
  }

  if (meta.level && meta.level !== trainee.level) {
    add('warning', 'level_changed',
      `התכנית נבנתה לרמת «${LEVEL_LABELS[meta.level] || meta.level}», והמתאמן מסומן היום כ«${LEVEL_LABELS[trainee.level] || trainee.level}».`,
      'בנייה מחדש תעדכן עצימות, נפח ובחירת תרגילים.');
  }
  if (meta.goal && meta.goal !== trainee.primaryGoal) {
    add('warning', 'goal_changed', 'המטרה בכרטיס שונה מזו שהתכנית נבנתה לפיה.', 'לבנות תכנית מחדש.');
  }
  if (meta.daysPerWeek && meta.daysPerWeek !== trainee.daysPerWeek) {
    add('warning', 'days_changed',
      `התכנית בנויה ל-${meta.daysPerWeek} ימים והמתאמן מסומן ל-${trainee.daysPerWeek}.`, 'לבנות תכנית מחדש.');
  }
  const studioId = trainee.homeStudioId || trainee.studioId;
  if (p.studioId && studioId && p.studioId !== studioId) {
    add('error', 'studio_changed',
      'התכנית נבנתה לסניף אחר מזה שהמתאמן משויך אליו — ייתכן שהציוד שבה אינו קיים שם.',
      'לבנות תכנית מחדש בסניף הנוכחי.');
  }

  /*
   * מגבלה שנוספה אחרי בניית התכנית היא המקרה המסוכן: התכנית חוקית לפי
   * מה שהיה ידוע אז, ואינה חוקית לפי מה שידוע היום.
   */
  const at = snapshot.at || p.generatedAt;
  const constraintNames = (trainee.constraints || [])
    .filter((c) => c.addedAt && at && c.addedAt > at)
    .map((c) => CONSTRAINTS[c.id]?.name || c.id);
  if (constraintNames.length) {
    add('error', 'constraint_after_program',
      `נוספה מגבלה (${constraintNames.join(', ')}) אחרי שהתכנית נבנתה.`,
      'התכנית אינה מתחשבת בה. יש לבנות מחדש לפני האימון הבא.');
  }

  const qaErrors = (p.qa?.errors || []).length;
  if (qaErrors) {
    add('error', 'qa_errors', `בתכנית ${qaErrors} שגיאות בקרת איכות.`, 'לפתוח את התכנית ולבנות מחדש.');
  }

  if (at && reviewDaysBetween(at, now) > 35) {
    add('info', 'program_old', `התכנית נבנתה לפני ${Math.round(reviewDaysBetween(at, now) / 7)} שבועות.`,
      'מחזור אימונים אורך ארבעה שבועות — כדאי לקדם שבוע או לבנות מחדש.');
  }

  return { findings: f, score: scoreOf(f) };
}

/**
 * ציון 0..100. שגיאה עולה הרבה יותר מאזהרה, כי שגיאה משנה את התכנית
 * בפועל ואזהרה רק מורידה את איכותה.
 */
function scoreOf(findings) {
  const cost = { error: 25, warning: 8, info: 2 };
  const total = findings.reduce((n, x) => n + (cost[x.level] || 0), 0);
  return Math.max(0, 100 - total);
}

/**
 * ביקורת על כל הסטודיו: מי דורש טיפול, ומה הבעיה הנפוצה ביותר.
 *
 * זו התשובה לשאלה שמאמן באמת שואל — "על מי אני צריך להסתכל היום" — ולא
 * רשימה של מאה כרטיסים שכולם נראים אותו דבר.
 */
export function reviewAll(trainees, { snapshotsByTrainee = new Map(), now = new Date() } = {}) {
  const perTrainee = [];
  const byCode = new Map();

  for (const t of trainees) {
    const snaps = snapshotsByTrainee.get(t.id) || [];
    const data = auditTrainee(t, { programs: snaps, now });
    const fit = auditProgramFit(t, snaps[0] || null, { now });
    const findings = [...data.findings, ...fit.findings];
    for (const x of findings) {
      const e = byCode.get(x.code) || { code: x.code, level: x.level, message: x.message, count: 0, names: [] };
      e.count++;
      if (e.names.length < 8) e.names.push(t.name);
      byCode.set(x.code, e);
    }
    perTrainee.push({
      id: t.id,
      name: t.name,
      active: t.active !== false,
      score: Math.round((data.score + fit.score) / 2),
      errors: findings.filter((x) => x.level === 'error').length,
      warnings: findings.filter((x) => x.level === 'warning').length,
      findings,
    });
  }

  perTrainee.sort((a, b) => (b.errors - a.errors) || (b.warnings - a.warnings) || (a.score - b.score));
  const common = [...byCode.values()].sort((a, b) => b.count - a.count);

  return {
    checked: trainees.length,
    clean: perTrainee.filter((x) => !x.errors && !x.warnings).length,
    withErrors: perTrainee.filter((x) => x.errors).length,
    averageScore: perTrainee.length
      ? Math.round(perTrainee.reduce((n, x) => n + x.score, 0) / perTrainee.length) : 100,
    common,
    trainees: perTrainee,
  };
}
