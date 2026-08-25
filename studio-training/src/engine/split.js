/**
 * בחירת החלוקה השבועית ובניית שלד היום.
 *
 * שלד היום הוא רשימת "משבצות" (slots) מסודרת לפי סדר ביצוע נכון:
 * חימום → תרגילי כוח מורכבים (הכי תובעניים בהתחלה) → עזר → ליבה → קונדישן.
 * המשבצת מגדירה *מה צריך להיות שם*, לא *איזה תרגיל* — הבחירה נעשית בשלב הבא
 * לפי הציוד שיש בסטודיו ולפי המגבלות של המתאמן.
 */

import { SPORTS } from '../domain/taxonomy.js';

const S = (role, patterns, opts = {}) => ({
  role,                                  // warmup|main|secondary|accessory|core|conditioning|prehab
  patterns,                              // דפוסים אפשריים למשבצת
  type: opts.type || null,               // compound | isolation | null (לא אכפת)
  muscles: opts.muscles || null,         // העדפת שריר מטרה
  optional: opts.optional ?? false,      // נזרק ראשון כשאין זמן
  weight: opts.weight ?? 1,              // חשיבות יחסית לתקציב הזמן
  label: opts.label || null,
});

/** ארכיטיפים של ימי אימון. */
export const DAY_ARCHETYPES = {
  full_body: {
    label: 'גוף מלא',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום וניידות' }),
      S('main', ['squat', 'lunge'], { type: 'compound', label: 'דחיפת רגליים' }),
      S('main', ['horizontal_push', 'vertical_push'], { type: 'compound', label: 'דחיפה' }),
      S('main', ['hinge'], { type: 'compound', label: 'הינג׳ / שרשרת אחורית' }),
      S('secondary', ['horizontal_pull', 'vertical_pull'], { label: 'משיכה' }),
      S('accessory', ['shoulder_isolation', 'elbow_flexion', 'elbow_extension', 'calf'], { optional: true, label: 'עזר' }),
      S('core', ['core_antiextension', 'core_antirotation', 'core_antilateralflexion', 'core_flexion', 'carry'], { label: 'ליבה' }),
      S('conditioning', ['conditioning'], { optional: true, label: 'קונדישן' }),
    ],
  },
  upper: {
    label: 'פלג גוף עליון',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['horizontal_push'], { type: 'compound', label: 'דחיפה אופקית' }),
      S('main', ['vertical_pull', 'horizontal_pull'], { type: 'compound', label: 'משיכה' }),
      S('secondary', ['vertical_push'], { label: 'דחיפה אנכית' }),
      S('secondary', ['horizontal_pull', 'vertical_pull'], { label: 'משיכה שנייה' }),
      S('accessory', ['shoulder_isolation'], { label: 'כתף' }),
      S('accessory', ['elbow_flexion'], { label: 'יד קדמית', optional: true }),
      S('accessory', ['elbow_extension'], { label: 'יד אחורית', optional: true }),
      S('core', ['core_antiextension', 'core_antirotation', 'carry'], { label: 'ליבה' }),
    ],
  },
  lower: {
    label: 'פלג גוף תחתון',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['squat'], { type: 'compound', label: 'סקוואט' }),
      S('main', ['hinge'], { type: 'compound', label: 'הינג׳' }),
      S('secondary', ['lunge'], { label: 'חד-צדדי' }),
      S('accessory', ['hinge'], { type: 'isolation', muscles: ['hamstrings'], label: 'אחורי ירך' }),
      S('accessory', ['hip_abduction'], { label: 'ישבן / הרחקה', optional: true }),
      S('accessory', ['calf'], { label: 'תאומים', optional: true }),
      S('core', ['core_antiextension', 'core_antilateralflexion', 'core_flexion'], { label: 'ליבה' }),
      S('conditioning', ['conditioning'], { optional: true, label: 'קונדישן' }),
    ],
  },
  push: {
    label: 'דחיפה',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['horizontal_push'], { type: 'compound', label: 'דחיפה אופקית' }),
      S('main', ['vertical_push'], { type: 'compound', label: 'דחיפה אנכית' }),
      S('secondary', ['horizontal_push'], { label: 'חזה נוסף' }),
      S('accessory', ['shoulder_isolation'], { muscles: ['delts_side'], label: 'כתף צד' }),
      S('accessory', ['elbow_extension'], { label: 'יד אחורית' }),
      S('accessory', ['shoulder_isolation'], { muscles: ['delts_rear'], label: 'כתף אחורית', optional: true }),
      S('core', ['core_antiextension', 'core_antirotation'], { label: 'ליבה', optional: true }),
    ],
  },
  pull: {
    label: 'משיכה',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['vertical_pull'], { type: 'compound', label: 'משיכה אנכית' }),
      S('main', ['horizontal_pull'], { type: 'compound', label: 'משיכה אופקית' }),
      S('secondary', ['horizontal_pull', 'vertical_pull'], { label: 'גב נוסף' }),
      S('accessory', ['shoulder_isolation'], { muscles: ['delts_rear'], label: 'כתף אחורית' }),
      S('accessory', ['elbow_flexion'], { label: 'יד קדמית' }),
      S('core', ['core_antiextension', 'core_antirotation', 'carry'], { label: 'ליבה', optional: true }),
    ],
  },
  legs: {
    label: 'רגליים',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['squat'], { type: 'compound', label: 'סקוואט' }),
      S('main', ['hinge'], { type: 'compound', label: 'הינג׳' }),
      S('secondary', ['lunge'], { label: 'חד-צדדי' }),
      S('accessory', ['hinge'], { type: 'isolation', muscles: ['hamstrings'], label: 'אחורי ירך' }),
      S('accessory', ['hip_abduction'], { label: 'הרחקה/קירוב', optional: true }),
      S('accessory', ['calf'], { label: 'תאומים', optional: true }),
      S('core', ['core_flexion', 'core_antiextension'], { label: 'ליבה', optional: true }),
    ],
  },
  // A/B/C — סבב אימוני גוף מלא עם דגש שונה בכל יום (נפוץ בסטודיו קטן)
  fb_a: {
    label: 'A — דגש סקוואט ודחיפה',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['squat'], { type: 'compound', label: 'סקוואט' }),
      S('main', ['horizontal_push'], { type: 'compound', label: 'דחיפה אופקית' }),
      S('secondary', ['horizontal_pull'], { label: 'משיכה אופקית' }),
      S('accessory', ['hip_abduction', 'calf'], { label: 'עזר רגליים', optional: true }),
      S('accessory', ['elbow_extension'], { label: 'יד אחורית', optional: true }),
      S('core', ['core_antiextension', 'core_antirotation'], { label: 'ליבה' }),
      S('conditioning', ['conditioning'], { optional: true, label: 'קונדישן' }),
    ],
  },
  fb_b: {
    label: 'B — דגש הינג׳ ומשיכה',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['hinge'], { type: 'compound', label: 'הינג׳' }),
      S('main', ['vertical_pull'], { type: 'compound', label: 'משיכה אנכית' }),
      S('secondary', ['vertical_push'], { label: 'דחיפה אנכית' }),
      S('accessory', ['hinge'], { type: 'isolation', muscles: ['hamstrings'], label: 'אחורי ירך', optional: true }),
      S('accessory', ['elbow_flexion'], { label: 'יד קדמית', optional: true }),
      S('core', ['core_antilateralflexion', 'carry'], { label: 'ליבה' }),
      S('conditioning', ['conditioning'], { optional: true, label: 'קונדישן' }),
    ],
  },
  fb_c: {
    label: 'C — דגש חד-צדדי וליבה',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['lunge'], { label: 'חד-צדדי רגליים' }),
      S('main', ['horizontal_pull', 'vertical_pull'], { type: 'compound', label: 'משיכה' }),
      S('secondary', ['horizontal_push', 'vertical_push'], { label: 'דחיפה' }),
      S('accessory', ['shoulder_isolation'], { label: 'כתף' }),
      S('core', ['core_antirotation', 'core_antilateralflexion', 'carry'], { label: 'ליבה' }),
      S('conditioning', ['conditioning'], { optional: true, label: 'קונדישן' }),
    ],
  },
  fb_d: {
    label: 'D — דגש קונדישן ושרירי עזר',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['squat', 'lunge'], { label: 'רגליים' }),
      S('secondary', ['horizontal_push'], { label: 'דחיפה' }),
      S('secondary', ['horizontal_pull'], { label: 'משיכה' }),
      S('accessory', ['shoulder_isolation', 'elbow_flexion', 'elbow_extension'], { label: 'עזר' }),
      S('core', ['core_flexion', 'core_antiextension'], { label: 'ליבה' }),
      S('conditioning', ['conditioning'], { label: 'קונדישן' }),
    ],
  },
  // ברו-ספליט
  chest_tri: {
    label: 'חזה + יד אחורית',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['horizontal_push'], { type: 'compound', label: 'לחיצה' }),
      S('secondary', ['horizontal_push'], { label: 'לחיצה שנייה' }),
      S('accessory', ['horizontal_push'], { type: 'isolation', label: 'פרפר' }),
      S('accessory', ['elbow_extension'], { label: 'יד אחורית' }),
      S('accessory', ['elbow_extension'], { label: 'יד אחורית 2', optional: true }),
      S('core', ['core_antiextension'], { label: 'ליבה', optional: true }),
    ],
  },
  back_bi: {
    label: 'גב + יד קדמית',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['vertical_pull'], { type: 'compound', label: 'משיכה אנכית' }),
      S('main', ['horizontal_pull'], { type: 'compound', label: 'חתירה' }),
      S('accessory', ['vertical_pull'], { type: 'isolation', label: 'גב בידוד', optional: true }),
      S('accessory', ['elbow_flexion'], { label: 'יד קדמית' }),
      S('accessory', ['elbow_flexion'], { label: 'יד קדמית 2', optional: true }),
      S('core', ['carry', 'core_antirotation'], { label: 'ליבה', optional: true }),
    ],
  },
  shoulders: {
    label: 'כתפיים',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['vertical_push'], { type: 'compound', label: 'לחיצת כתפיים' }),
      S('accessory', ['shoulder_isolation'], { muscles: ['delts_side'], label: 'כתף צד' }),
      S('accessory', ['shoulder_isolation'], { muscles: ['delts_rear'], label: 'כתף אחורית' }),
      S('accessory', ['shoulder_isolation'], { label: 'כתף נוספת', optional: true }),
      S('core', ['core_antiextension', 'core_antilateralflexion'], { label: 'ליבה' }),
    ],
  },
  arms: {
    label: 'ידיים',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['elbow_flexion'], { label: 'יד קדמית' }),
      S('main', ['elbow_extension'], { label: 'יד אחורית' }),
      S('accessory', ['elbow_flexion'], { label: 'יד קדמית 2' }),
      S('accessory', ['elbow_extension'], { label: 'יד אחורית 2' }),
      S('core', ['core_flexion', 'core_antiextension'], { label: 'ליבה', optional: true }),
    ],
  },
  mobility_flow: {
    label: 'ניידות ותנועה',
    slots: [
      S('warmup', ['mobility'], { label: 'חימום כללי' }),
      S('main', ['mobility'], { label: 'ניידות ירך' }),
      S('main', ['mobility'], { label: 'ניידות חזה וכתף' }),
      S('secondary', ['squat', 'lunge', 'hinge'], { label: 'שליטה בטווח — פלג תחתון' }),
      S('secondary', ['horizontal_pull', 'vertical_pull'], { label: 'שליטה בטווח — משיכה' }),
      S('core', ['core_antiextension', 'core_antirotation', 'core_antilateralflexion'], { label: 'יציבות ליבה' }),
      S('cooldown', ['mobility'], { label: 'סיום ונשימה', optional: true }),
    ],
  },
  circuit: {
    label: 'מעגל תחנות',
    slots: [
      S('warmup', ['mobility'], { optional: true, label: 'חימום' }),
      S('main', ['squat', 'lunge'], { label: 'תחנה 1 — רגליים' }),
      S('main', ['horizontal_push', 'vertical_push'], { label: 'תחנה 2 — דחיפה' }),
      S('main', ['horizontal_pull', 'vertical_pull'], { label: 'תחנה 3 — משיכה' }),
      S('secondary', ['hinge'], { label: 'תחנה 4 — הינג׳' }),
      S('core', ['core_antiextension', 'core_antirotation', 'carry'], { label: 'תחנה 5 — ליבה' }),
      S('conditioning', ['conditioning'], { label: 'תחנה 6 — קונדישן' }),
    ],
  },
};

/** מבנה השבוע לכל חלוקה, לפי מספר ימים. */
const SPLIT_SEQUENCES = {
  full_body: (d) => Array.from({ length: d }, (_, i) => ['fb_a', 'fb_b', 'fb_c', 'fb_d'][i % 4]),
  ab: (d) => Array.from({ length: d }, (_, i) => ['fb_a', 'fb_b'][i % 2]),
  abc: (d) => Array.from({ length: d }, (_, i) => ['fb_a', 'fb_b', 'fb_c'][i % 3]),
  abcd: (d) => Array.from({ length: d }, (_, i) => ['fb_a', 'fb_b', 'fb_c', 'fb_d'][i % 4]),
  upper_lower: (d) => Array.from({ length: d }, (_, i) => ['upper', 'lower'][i % 2]),
  push_pull: (d) => Array.from({ length: d }, (_, i) => ['push', 'pull'][i % 2]),
  push_pull_legs: (d) => Array.from({ length: d }, (_, i) => ['push', 'pull', 'legs'][i % 3]),
  bro_split: (d) => ['chest_tri', 'back_bi', 'legs', 'shoulders', 'arms', 'full_body'].slice(0, d),
  hybrid_circuit: (d) => Array.from({ length: d }, () => 'circuit'),
  mobility_flow: (d) => Array.from({ length: d }, () => 'mobility_flow'),
};

/**
 * בחירת חלוקה. מחזיר { split, reason, days: [archetypeKey] }.
 * הכלל המרכזי: תדירות גירוי לכל שריר לפחות פעמיים בשבוע כשאפשר.
 */
export function chooseSplit(trainee, studio) {
  const d = trainee.daysPerWeek;
  const goal = trainee.primaryGoal;
  const level = trainee.level;
  const forced = studio.preferredSplit || trainee.preferredSplit;

  let split;
  let reason;

  if (forced && SPLIT_SEQUENCES[forced]) {
    split = forced;
    reason = 'חלוקה שנקבעה מראש בהגדרות הסטודיו/המתאמן.';
  } else if (studio.style === 'small_group' && d <= 3 && goal === 'fat_loss') {
    split = 'hybrid_circuit';
    reason = 'אימון קבוצתי קצר עם מטרת ירידה בשומן — מבנה תחנות מנצל את הזמן ואת הציוד המשותף.';
  } else if (d <= 2) {
    split = 'full_body';
    reason = 'עד שני אימונים בשבוע — גוף מלא נותן את תדירות הגירוי הגבוהה ביותר לכל שריר.';
  } else if (d === 3) {
    if (level === 'advanced' && goal === 'hypertrophy') {
      split = 'push_pull_legs';
      reason = 'מתקדם עם מטרת מסה בשלושה ימים — PPL מאפשר נפח גבוה יותר לכל קבוצה ביום.';
    } else {
      split = 'abc';
      reason = 'שלושה ימים — סבב A/B/C של גוף מלא עם דגש שונה בכל אימון; כל שריר נעבד 2-3 פעמים בשבוע.';
    }
  } else if (d === 4) {
    if (goal === 'strength' || level === 'beginner' || level === 'novice') {
      split = 'upper_lower';
      reason = 'ארבעה ימים — עליון/תחתון נותן תדירות של פעמיים לכל שריר עם התאוששות מלאה בין אימונים.';
    } else {
      split = 'abcd';
      reason = 'ארבעה ימים — סבב A/B/C/D עם דגשים משתנים לגיוון ולכיסוי מלא.';
    }
  } else if (d === 5) {
    split = level === 'beginner' ? 'upper_lower' : 'push_pull_legs';
    reason = level === 'beginner'
      ? 'חמישה ימים למתחיל — עליון/תחתון בסבב, כדי לשמור על עומס מתון לכל אימון.'
      : 'חמישה ימים — PPL בסבב מתגלגל, נפח גבוה עם התאוששות מקומית טובה.';
  } else {
    split = level === 'advanced' && goal === 'hypertrophy' ? 'push_pull_legs' : 'upper_lower';
    reason = 'שישה ימים — סבב כפול שמאפשר נפח שבועי גבוה עם תדירות של פעמיים לכל שריר.';
  }

  // תיקוני בטיחות והתאמות מטרה — גוברים על בחירת ברירת המחדל.
  if ((goal === 'rehab' || goal === 'posture') && ['bro_split', 'push_pull_legs'].includes(split)) {
    split = 'full_body';
    reason = 'מטרת שיקום/יציבה — גוף מלא בתדירות גבוהה ובעומס נמוך עדיף על חלוקה מפוצלת.';
  }
  if (goal === 'mobility' && !forced) {
    split = 'mobility_flow';
    reason = 'מטרת ניידות — מבנה זרימה שמשלב טווח תנועה עם שליטה בעומס קל.';
  }
  if (goal === 'active_aging' && !forced) {
    split = 'full_body';
    reason = 'תפקוד ועצמאות — גוף מלא בכל אימון, עם שיווי משקל וקימה מכיסא בכל פגישה.';
  }
  if (goal === 'athletic_performance' && !forced && d >= 3 && !['upper_lower', 'full_body'].includes(split)) {
    split = 'upper_lower';
    reason = 'ביצועים בענף ספורט — עליון/תחתון משאיר ימים נקיים לאימוני הענף עצמו.';
  }
  // עומס חיצוני גבוה: לא בונים חמישה-שישה ימי סטודיו על גבי אימוני ענף.
  if (trainee.externalSessions >= 3 && d >= 4 && !forced && split !== 'upper_lower') {
    split = 'upper_lower';
    reason = `${trainee.externalSessions} אימוני ספורט חיצוניים בשבוע — עליון/תחתון מרכז את עומס הסטודיו למינימום ימים תובעניים.`;
  }
  // מגבלות חריפות מרובות: מבנה פשוט וניתן לניהול.
  if (trainee.constraints.filter((c) => c.severity === 'acute').length >= 2 && !forced) {
    split = d <= 3 ? 'full_body' : 'upper_lower';
    reason = 'שתי מגבלות חריפות ומעלה — מבנה פשוט שמאפשר מעקב צמוד ובקרת עומס.';
  }

  const days = SPLIT_SEQUENCES[split](d);
  return { split, reason, days };
}

/** פריסת ימי האימון על ימי השבוע, עם מרווחי התאוששות מקסימליים. */
export function scheduleDays(trainee) {
  const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const d = trainee.daysPerWeek;
  if (trainee.preferredDays.length >= d) return trainee.preferredDays.slice(0, d);

  const preferred = [...trainee.preferredDays];
  // פריסות מומלצות שמפזרות את האימונים ומשאירות ימי מנוחה בין ימים כבדים
  const patterns = {
    1: ['sun'],
    2: ['sun', 'wed'],
    3: ['sun', 'tue', 'thu'],
    4: ['sun', 'mon', 'wed', 'thu'],
    5: ['sun', 'mon', 'tue', 'thu', 'fri'],
    6: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'],
  };
  const base = patterns[d] || order.slice(0, d);
  const out = [...new Set([...preferred, ...base])].slice(0, d);
  return out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * התאמת שלד היום למתאמן הספציפי:
 * חימום אירובי כללי, עבודת שיווי משקל בגיל השלישי, מניעה לענף הספורט,
 * וסיום מווסת. אלה תוספות שמאמן אנושי עושה אוטומטית ולא מופיעות בארכיטיפ.
 */
export function augmentSlots(slots, trainee, ageAdj) {
  const out = slots.slice();

  // שיווי משקל וכוח מהיר — הגורם מספר אחת בהפחתת נפילות בגיל השלישי
  if (ageAdj.needsBalance || trainee.primaryGoal === 'active_aging') {
    const at = Math.min(2, out.length);
    out.splice(at, 0, S('prehab', ['core_antilateralflexion', 'squat'], {
      muscles: ['core_lateral', 'quads'], label: 'שיווי משקל וקימה', weight: 1,
    }));
  }

  // עבודת מניעה לענף הספורט של המתאמן
  const sport = SPORTS[trainee.sport];
  if (sport && sport.prehab.length && trainee.externalSessions > 0) {
    out.splice(Math.max(1, out.length - 2), 0, S('prehab', sport.prehab, {
      label: `מניעת פציעות — ${trainee.sport}`, optional: true,
    }));
  }

  // סיום: ניידות ונשימה. חשוב במיוחד למטרות הפגה, יציבה, שיקום וגיל שלישי.
  const wantsCooldown = ['stress_relief', 'posture', 'rehab', 'active_aging', 'mobility'].includes(trainee.primaryGoal)
    || ageAdj.needsBalance;
  if (wantsCooldown && !out.some((x) => x.role === 'cooldown')) {
    out.push(S('cooldown', ['mobility'], { label: 'שחרור וסיום', optional: true }));
  }
  return out;
}

/** הרחבת דפוסים כשאין תרגיל מתאים — כדי שמשבצת לא תישאר ריקה סתם. */
export const PATTERN_FALLBACK = {
  horizontal_push: ['vertical_push', 'elbow_extension'],
  vertical_push: ['horizontal_push', 'shoulder_isolation'],
  horizontal_pull: ['vertical_pull'],
  vertical_pull: ['horizontal_pull'],
  squat: ['lunge', 'hinge'],
  hinge: ['squat', 'lunge', 'hip_abduction'],
  lunge: ['squat', 'hinge'],
  hip_abduction: ['hinge', 'lunge'],
  calf: ['conditioning'],
  elbow_flexion: ['horizontal_pull'],
  elbow_extension: ['horizontal_push'],
  shoulder_isolation: ['vertical_push', 'horizontal_pull'],
  /*
   * דפוסי ליבה מחליפים זה את זה בקלות ברמת המשבצת: כשאין אפשרות ראויה
   * באנטי-כיפוף צידי, פאלוף פרס או כפיפת בטן בכבל הם תחליף לגיטימי.
   * לפני ההרחבה הזאת משבצת צרה נאלצה להסתפק בפלאנק גם למתאמן מנוסה.
   */
  core_flexion: ['core_antiextension', 'core_antirotation', 'core_antilateralflexion', 'carry'],
  core_antiextension: ['core_antirotation', 'core_antilateralflexion', 'core_flexion', 'carry'],
  core_antirotation: ['core_antiextension', 'core_antilateralflexion', 'core_flexion', 'carry'],
  core_antilateralflexion: ['core_antirotation', 'carry', 'core_antiextension', 'core_flexion'],
  carry: ['core_antilateralflexion', 'core_antirotation', 'core_antiextension'],
  conditioning: [],
  mobility: [],
};

/**
 * גרסה "רכה" של המשבצת: מוותרים על סוג התרגיל ועל שריר היעד,
 * ומרחיבים את הדפוסים. משמש רק כשאין אף מועמד למשבצת המקורית.
 */
export function relaxSlot(slot) {
  const extra = slot.patterns.flatMap((p) => PATTERN_FALLBACK[p] || []);
  return { ...slot, type: null, muscles: null, patterns: [...new Set([...slot.patterns, ...extra])], relaxed: true };
}

/** דפוסים שמכסים שריר מסוים — משמש להשלמת נפח חסר בסוף האימון. */
export const MUSCLE_PATTERNS = {
  chest: ['horizontal_push'], back_lats: ['vertical_pull', 'horizontal_pull'],
  back_upper: ['horizontal_pull', 'shoulder_isolation'], delts_front: ['vertical_push'],
  delts_side: ['shoulder_isolation'], delts_rear: ['shoulder_isolation'],
  biceps: ['elbow_flexion'], triceps: ['elbow_extension'], forearms: ['carry'],
  quads: ['squat', 'lunge'], hamstrings: ['hinge'], glutes: ['hinge', 'lunge', 'hip_abduction'],
  adductors: ['hip_abduction', 'lunge'], abductors: ['hip_abduction'], calves: ['calf'],
  core_anterior: ['core_antiextension', 'core_flexion'],
  core_lateral: ['core_antilateralflexion', 'core_antirotation', 'carry'],
  core_posterior: ['core_antirotation', 'hinge'],
};

/** בניית משבצת השלמה לשריר שנשאר מתחת ליעד. */
/**
 * משבצות למקטע שהסטודיו הגדיר במבנה האימון.
 * מתרגם "רבע שעה בטן" לכמות משבצות ליבה סבירה לזמן שהוקצה.
 */
export function segmentSlots(plan, archetypeSlots) {
  const byRole = (role) => archetypeSlots.filter((x) => x.role === role);

  // מקטע כוח לוקח את משבצות הארכיטיפ עצמן — שם יושב הידע על החלוקה
  if (plan.roles.includes('main')) {
    return archetypeSlots.filter((x) => plan.roles.includes(x.role));
  }

  // מקטע אחר: אם לארכיטיפ כבר יש משבצות מהתפקיד הזה, מתחילים מהן
  const role = plan.roles[0];
  const existing = byRole(role);
  const want = plan.maxExercises || Math.max(1, Math.round(plan.minutes / 5));

  const out = existing.slice(0, want).map((x) => ({ ...x, optional: false }));
  while (out.length < want) {
    const template = existing[0] || SEGMENT_TEMPLATE[role];
    if (!template) break;
    out.push({
      ...template,
      role,
      muscles: plan.muscles || template.muscles || null,
      label: out.length ? `${plan.label} ${out.length + 1}` : plan.label,
      optional: out.length >= 1,
    });
  }
  return out.length ? out : (SEGMENT_TEMPLATE[role] ? [{ ...SEGMENT_TEMPLATE[role], label: plan.label }] : []);
}

/** ברירת מחדל למקטע שהארכיטיפ לא כלל בכלל. */
const SEGMENT_TEMPLATE = {
  warmup: S('warmup', ['mobility'], { label: 'חימום' }),
  cooldown: S('cooldown', ['mobility'], { label: 'שחרור' }),
  core: S('core', ['core_antiextension', 'core_antirotation', 'core_antilateralflexion', 'core_flexion', 'carry'], { label: 'ליבה' }),
  conditioning: S('conditioning', ['conditioning'], { label: 'קונדישן' }),
  prehab: S('prehab', ['mobility', 'core_antiextension'], { label: 'מניעה' }),
  accessory: S('accessory', ['shoulder_isolation', 'elbow_flexion', 'elbow_extension', 'calf'], { label: 'עזר' }),
};

export function fillerSlot(muscle) {
  return S('accessory', MUSCLE_PATTERNS[muscle] || ['core_antiextension'], {
    muscles: [muscle], optional: true, label: 'השלמת נפח',
  });
}
