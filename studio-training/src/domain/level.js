/**
 * רמת המתאמן — ומה נגזר ממנה על בחירת התרגילים.
 *
 * הבעיה שהמודול הזה פותר: "רמה" אינה תווית אחת שהמתאמן מצהיר עליה.
 * אדם אומר "מתקדם" אחרי שנה, ואדם אחר אומר "מתחיל" אחרי שבע שנים והפסקה.
 * שתי ההצהרות שגויות, ותכנית שנבנית עליהן תיתן תרגילים קלים מדי או קשים מדי.
 *
 * לכן הרמה כאן נגזרת משלושה מקורות בלתי תלויים:
 *
 *   1. ההצהרה של המתאמן — נקודת פתיחה, לא אמת.
 *   2. ותק אימונים — אי אפשר להיות מתקדם אחרי שלושה חודשים, גם אם רוצים.
 *   3. כוח יחסי מוכח — מה שנרשם בפועל ביומן, חלקי משקל הגוף.
 *      זה המקור האובייקטיבי היחיד, ולכן הוא גובר כשהוא קיים.
 *
 * בנוסף, רמה אינה מספר אחד: אפשר להיות מתקדם בסקוואט ומתחיל מעל הראש.
 * לכן נשמרת גם רמה לכל דפוס תנועה, והיא זו שקובעת מה מותר באותו דפוס.
 */

import { LEVEL_LABELS } from './labels.js';

export const LEVEL_ORDER = ['beginner', 'novice', 'intermediate', 'advanced'];

/** שם הרמה בעברית, לשימוש בנימוקים שמוצגים למאמן. */
const he = (i) => LEVEL_LABELS[LEVEL_ORDER[i]] || LEVEL_ORDER[i];
export const levelIndex = (level) => Math.max(0, LEVEL_ORDER.indexOf(level));
export const levelLabelOf = (i) => LEVEL_ORDER[Math.max(0, Math.min(3, Math.round(i)))];

/**
 * ותק מינימלי בחודשים שנדרש כדי להחזיק ברמה.
 * אלה אינם מספרים שרירותיים: הם משקפים כמה זמן לוקח לרקמת חיבור להסתגל
 * ולטכניקה להיות יציבה תחת עומס — לא כמה מהר אפשר להעלות משקל.
 */
export const TRAINING_AGE_MIN_MONTHS = [0, 3, 12, 42];

/**
 * תקני כוח יחסי: משקל עבודה חלקי משקל גוף, לסט עבודה רגיל (לא 1RM).
 * הערכים הם הסף התחתון של כל רמה, לגבר בוגר.
 */
export const STRENGTH_STANDARDS = {
  squat: [0.60, 1.00, 1.45, 1.90],
  hinge: [0.80, 1.25, 1.75, 2.20],
  horizontal_push: [0.40, 0.70, 1.05, 1.35],
  vertical_push: [0.25, 0.45, 0.65, 0.85],
  horizontal_pull: [0.40, 0.70, 1.00, 1.25],
  vertical_pull: [0.30, 0.55, 0.85, 1.10],
  lunge: [0.30, 0.55, 0.80, 1.05],
};

/**
 * מקדם לפי מין. נשים מגיעות לכוח יחסי דומה בפלג גוף תחתון
 * ולנמוך יותר בפלג גוף עליון — זה הבדל פיזיולוגי, לא הבדל ביכולת.
 */
const SEX_FACTOR = {
  female: { upper: 0.68, lower: 0.85 },
  male: { upper: 1, lower: 1 },
  unspecified: { upper: 0.85, lower: 0.93 },
};

const UPPER_PATTERNS = new Set(['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull']);

/** התקן המותאם למתאמן מסוים בדפוס מסוים. */
export function standardFor(pattern, trainee) {
  const base = STRENGTH_STANDARDS[pattern];
  if (!base) return null;
  const f = SEX_FACTOR[trainee.sex] || SEX_FACTOR.unspecified;
  const k = UPPER_PATTERNS.has(pattern) ? f.upper : f.lower;
  return base.map((v) => +(v * k).toFixed(3));
}

/**
 * הרמה שהכוח היחסי מוכיח בדפוס מסוים.
 * מחזיר null כשאין מספיק נתונים — היעדר נתון אינו ראיה לחולשה.
 */
export function levelFromStrength(pattern, loadKg, bodyWeightKg, trainee) {
  const std = standardFor(pattern, trainee);
  if (!std || !loadKg || !bodyWeightKg) return null;
  const ratio = loadKg / bodyWeightKg;
  let idx = -1;
  for (let i = 0; i < std.length; i++) if (ratio >= std[i]) idx = i;
  return { index: Math.max(0, idx), ratio: +ratio.toFixed(2), standard: std };
}

/**
 * הרמה המוכחת לכל דפוס, מתוך היסטוריית העבודה בפועל.
 * לוקחים את המשקל הכבד ביותר שנרשם בדפוס — לא את הממוצע — כי
 * היכולת נקבעת לפי מה שהמתאמן הצליח לבצע, לא לפי מה שעשה בממוצע.
 */
export function strengthByPattern(trainee, byId = {}) {
  const bw = trainee.weightKg;
  if (!bw) return {};

  const best = new Map();
  for (const [exId, rec] of Object.entries(trainee.history || {})) {
    const ex = byId[exId];
    const load = rec?.load ?? rec?.loadKg ?? null;
    if (!ex || !load) continue;
    // משקל "לכל יד" נספר כפול: שתי משקולות של 30 הן 60 ק"ג עבודה.
    // הסימון מגיע מהרישום עצמו — שם ידוע איך המשקל נמדד בפועל.
    const effective = rec.perSide ? load * 2 : load;
    const cur = best.get(ex.pattern);
    if (!cur || effective > cur.load) best.set(ex.pattern, { load: effective, exId });
  }

  const out = {};
  for (const [pattern, { load, exId }] of best) {
    const lvl = levelFromStrength(pattern, load, bw, trainee);
    if (lvl) out[pattern] = { ...lvl, loadKg: load, exerciseId: exId };
  }
  return out;
}

/**
 * הרמה המיושבת: מה שהמתאמן הצהיר, מוגבל בוותק, ומורם לפי מה שהוכח.
 *
 * סדר ההכרעה מכוון: ראיה אובייקטיבית מנצחת הצהרה, והצהרה מנצחת ניחוש.
 * מוחזרות גם הסיבות, כדי שהמאמן יראה למה המערכת החליטה מה שהחליטה
 * ויוכל לחלוק עליה במקום לנחש.
 */
export function resolveLevel(trainee, byId = {}) {
  const claimed = levelIndex(trainee.level);
  const months = trainee.trainingAgeMonths ?? 0;
  const reasons = [];

  // 1. תקרה לפי ותק — אי אפשר להצהיר על רמה שהזמן לא מאפשר
  let capped = claimed;
  while (capped > 0 && months < TRAINING_AGE_MIN_MONTHS[capped]) capped -= 1;
  if (capped < claimed) {
    reasons.push(`הוצהר «${he(claimed)}» אך הוותק ${months} חודשים — נלקחה רמת «${he(capped)}».`);
  }

  // 2. ראיה מהשטח: הכוח היחסי שנרשם בפועל
  const byPattern = strengthByPattern(trainee, byId);
  const proven = Object.values(byPattern).map((x) => x.index);
  let resolved = capped;

  if (proven.length >= 2) {
    /*
     * החציון, לא המקסימום, ורק משני דפוסים ומעלה: אדם עם סקוואט חזק
     * ולחיצה חלשה אינו מתקדם — הוא אדם עם סקוואט חזק. העלאת רמה על סמך
     * תרגיל בודד הייתה מכניסה לו תרגילים שהוא לא מוכן אליהם בשאר הגוף.
     */
    const sorted = proven.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > resolved) {
      resolved = median;
      reasons.push(`המשקלים שנרשמו מוכיחים רמת «${he(median)}» — הרמה הועלתה בהתאם.`);
    } else if (median < resolved && proven.length >= 3) {
      // ראיה רחבה שסותרת כלפי מטה מורידה רק דרגה אחת, ובזהירות
      resolved = Math.max(median, resolved - 1);
      reasons.push(`המשקלים שנרשמו נמוכים מהמצופה לרמה שהוצהרה — הרמה הותאמה כלפי מטה.`);
    }
  } else if (proven.length === 1) {
    reasons.push('נרשם משקל בדפוס אחד בלבד — נדרשת ראיה נוספת לפני שינוי רמה.');
  } else if (months >= TRAINING_AGE_MIN_MONTHS[2] && claimed <= 1) {
    // ותק ארוך עם הצהרה נמוכה: כנראה צניעות, לא חוסר יכולת
    reasons.push('ותק ארוך עם הצהרה נמוכה — יש לאמת בשטח; בינתיים נשמרת ההצהרה.');
  }

  return {
    index: resolved,
    label: LEVEL_ORDER[resolved],
    claimed: LEVEL_ORDER[claimed],
    cappedByAge: capped < claimed,
    /** ביטחון נמוך = הרמה נשענת על הצהרה בלבד ולא על נתונים. */
    confidence: proven.length >= 3 ? 'high' : (proven.length ? 'medium' : 'low'),
    byPattern,
    reasons,
  };
}

/**
 * הרמה בדפוס מסוים. דפוס שהוכח בו כוח גובר על הרמה הכללית,
 * כי אדם יכול להיות מתקדם בסקוואט ומתחיל בלחיצה מעל הראש.
 */
export function levelForPattern(resolved, pattern) {
  const p = resolved.byPattern?.[pattern];
  return p ? Math.max(p.index, resolved.index - 1) : resolved.index;
}

/* ================================================================
   ערך אימוני של תרגיל ברמה נתונה.

   זה הלב של "אילו תרגילים מתאימים למי". המדד הישן היה 'demand' —
   כמה התרגיל תובעני. אבל תובענות אינה ערך: פלאנק תובעני נמוך והוא
   מצוין למתחיל וחסר תועלת למתקדם, ואילו סקוואט תובעני גבוה ומועיל לשניהם.
   מה שנדרש הוא ערך אימוני *ברמה מסוימת*, וזה מה שמחושב כאן.
   ================================================================ */

/** תגיות שמסמנות תרגיל שנועד ללמד, להפעיל או לשקם — ולא להעמיס. */
const TEACHING_TAGS = ['regression', 'beginner_friendly', 'rehab_friendly', 'active_aging', 'pilates'];

/**
 * ערך אימוני בטווח 0..1 עבור רמה נתונה.
 *
 * העיקרון: תרגיל שנועד ללמד תנועה מאבד ערך ככל שהמתאמן כבר יודע אותה,
 * ותרגיל שניתן להעמיס בו שומר על ערכו לנצח. תרגיל טכני שווה הרבה —
 * אבל רק למי שיכול לבצע אותו.
 */
export function trainingValue(ex, levelIdx) {
  const tags = ex.tags || [];
  let v = 0.5;

  // ניתן להעמיס = ניתן להתקדם בו. זה הגורם החזק ביותר לאורך זמן.
  if (ex.loadable !== false) v += 0.2;
  if (ex.type === 'compound') v += 0.15;
  if (ex.type === 'isolation') v += 0.02;
  if (ex.type === 'mobility') v -= 0.35;

  // תובענות היא עדיין אות, רק לא האות היחיד
  v += ((ex.demand ?? 2) - 2) * 0.07;

  // תרגילי הוראה והפעלה: ערך גבוה בהתחלה, יורד ככל שעולים
  const teaching = TEACHING_TAGS.filter((t) => tags.includes(t)).length;
  if (teaching) v -= teaching * 0.09 * levelIdx;

  // איזומטרי סטטי: כלי מצוין ללמידה ולשליטה, לא לגירוי אצל מנוסים
  if (tags.includes('isometric')) v -= 0.10 * levelIdx;

  // תרגיל טכני שווה יותר למי שיכול לבצע אותו, ופחות למי שלא
  const skill = ex.skill ?? 1;
  if (skill >= 3) v += levelIdx >= 2 ? 0.12 : -0.05;

  /*
   * מתקדם זקוק לעומס אמיתי. אבל "לא ניתן להוסיף משקל" אינו זהה ל"קל":
   * מתח והרמת רגליים בתלייה הם משקל גוף וגם תרגילים מתקדמים מעולים,
   * כי מתקדמים בהם בחזרות, בטווח ובמינוף. הקנס חל רק על עבודה
   * שגם אינה ניתנת להעמסה וגם אינה תובענית טכנית — שם היא באמת קלה מדי.
   */
  const bodyweightButHard = (ex.skill ?? 1) >= 3 || ex.type === 'compound';
  if (levelIdx >= 2 && ex.loadable === false && ex.type !== 'conditioning' && !bodyweightButHard) {
    v -= 0.18;
  }

  return Math.max(0, Math.min(1, +v.toFixed(3)));
}

/**
 * הרצפה: הערך האימוני המינימלי שתרגיל חייב לספק, לפי רמה ולפי תפקידו.
 *
 * חימום ושחרור פטורים — פלאנק בחימום הוא לגיטימי בכל רמה. כל השאר
 * הוא זמן אימון, ובזמן אימון של מתקדם אין מקום לתרגיל שלא מקדם אותו.
 */
export const ROLE_FLOOR_WEIGHT = {
  main: 1, secondary: 0.9, accessory: 0.72, core: 0.66,
  conditioning: 0.5, prehab: 0.35, warmup: 0, cooldown: 0,
};

export function valueFloor(levelIdx, role) {
  const w = ROLE_FLOOR_WEIGHT[role] ?? 0.6;
  // הרצפה עולה עם הרמה: מתחיל צריך שהתרגיל יהיה בטוח, מתקדם שיהיה מקדם
  const base = 0.28 + levelIdx * 0.13;
  return +(base * w).toFixed(3);
}

/**
 * האם התרגיל מתאים למתאמן בתפקיד הזה, ולמה לא.
 * מוחזרת סיבה קריאה כדי שאפשר יהיה להסביר למאמן ולא רק לפסול בשקט.
 */
export function fitsLevel(ex, levelIdx, role) {
  const value = trainingValue(ex, levelIdx);
  const floor = valueFloor(levelIdx, role);

  /*
   * דרישה מבנית, נפרדת מהערך האימוני: תרגיל עיקרי הוא תרגיל מורכב.
   * משיכת כתפיים ניתנת להעמסה ויש לה ערך אימוני סביר, אבל היא עבודת
   * בידוד ומקומה בעזר — לא בפתיחת האימון. בלי הכלל הזה תרגיל בידוד
   * "כבד" היה יכול לתפוס משבצת עיקרית ולדחוק סקוואט או לחיצה.
   */
  if ((role === 'main' || role === 'secondary') && ex.type === 'isolation') {
    return {
      ok: false, hard: true, value, floor,
      reason: `${ex.name}: תרגיל בידוד אינו יכול לשמש תרגיל עיקרי או משני`,
    };
  }

  if (value >= floor) return { ok: true, value, floor };
  return {
    ok: false,
    value,
    floor,
    reason: `${ex.name}: ערך אימוני ${value} מתחת לרצפה ${floor} עבור «${he(levelIdx)}» בתפקיד ${role}`,
  };
}

/**
 * תקרת מיומנות: תרגיל טכני מדי למי שעוד לא שם.
 * מתחיל אינו מקבל דדליפט קונבנציונלי, גם אם הוא חזק.
 */
export const SKILL_CEILING = [2, 3, 4, 5];

export function skillAllowed(ex, levelIdx, patternLevelIdx = null) {
  const idx = patternLevelIdx ?? levelIdx;
  return (ex.skill ?? 1) <= SKILL_CEILING[Math.max(0, Math.min(3, idx))];
}
