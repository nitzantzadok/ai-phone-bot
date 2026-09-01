/**
 * משקלי עבודה.
 *
 * מאמן טוב לא נותן למתאמן טבלה בלי מספרים. לכן לכל תרגיל שניתן להעמיס
 * מופיע משקל התחלה מוצע בקילוגרמים — לא ניחוש עיוור אלא הערכה שמרנית
 * מתוך משקל הגוף, הרמה והגיל, מעוגלת לקפיצת המשקל שבאמת קיימת בסטודיו.
 *
 * ההצעה היא נקודת פתיחה שמאמתים בסט חימום. ברגע שהמאמן מתקן משקל או
 * רושם סט — המספר שלו הופך למקור האמת, וההצעה כבר לא רלוונטית.
 */

import { LEVEL_LABELS } from '../domain/labels.js';
import { estimate1RM } from './prescription.js';
import { achievableLoad } from '../domain/inventory.js';

/**
 * יחס משקל גוף לכל משפחת תרגילים, לפי רמה.
 * המספרים מכוונים לסט של כ-10 חזרות עם מרווח ביטחון, ונוטים לכיוון
 * הזהיר: עדיף שהמאמן יעלה משקל בסט השני מאשר שהמתאמן ייכשל בראשון.
 */
const BW_RATIO = {
  //                        מתחיל  מתאמן  בינוני  מתקדם
  leg_press:              [0.60, 0.85, 1.15, 1.45],
  squat_barbell:          [0.40, 0.55, 0.75, 1.00],
  squat_machine:          [0.45, 0.65, 0.90, 1.15],
  hinge_barbell:          [0.50, 0.65, 0.90, 1.15],
  hip_thrust:             [0.50, 0.70, 1.00, 1.30],
  leg_isolation:          [0.20, 0.28, 0.36, 0.46],
  calf:                   [0.25, 0.35, 0.50, 0.65],
  press_barbell_horizontal: [0.30, 0.40, 0.55, 0.75],
  press_barbell_vertical: [0.20, 0.27, 0.35, 0.45],
  press_machine:          [0.28, 0.38, 0.50, 0.65],
  row_barbell:            [0.30, 0.40, 0.52, 0.68],
  row_machine:            [0.28, 0.38, 0.50, 0.65],
  pulldown:               [0.35, 0.45, 0.58, 0.75],
  dumbbell_pair:          [0.10, 0.14, 0.19, 0.25],   // לכל יד
  dumbbell_single:        [0.12, 0.17, 0.23, 0.30],   // לכל יד
  kettlebell:             [0.12, 0.16, 0.21, 0.28],
  cable_mid:              [0.10, 0.14, 0.19, 0.25],
  isolation_small:        [0.04, 0.055, 0.075, 0.095],  // לכל יד, משקולת
  cable_isolation:        [0.15, 0.22, 0.30, 0.38],     // מחסנית אחת
};

const LEVEL_INDEX = { beginner: 0, novice: 1, intermediate: 2, advanced: 3 };
const LEVEL_ORDER_L = ['beginner', 'novice', 'intermediate', 'advanced'];

/**
 * מקדם לתרגילים שנעשים בפועל קל יותר ממה שהמשפחה שלהם מרמזת.
 * גוד מורנינג אינו סקוואט, ומכרע בולגרי אינו דדליפט — הטכניקה, ולא הכוח,
 * היא שמגבילה אותם, ולכן הם מתחילים נמוך בהרבה.
 */
/**
 * תרגילים שמוחזקים בכלי אחד בשתי ידיים — המשקל הוא סך הכול ולא "לכל יד".
 * ההבחנה הזו קריטית: 40 ק״ג בגובלט זה כלי אחד, 40 ק״ג בלחיצה זה שתי משקולות.
 */
export const SINGLE_IMPLEMENT = new Set([
  'goblet_squat', 'kb_swing', 'kb_clean', 'overhead_ext', 'russian_twist',
  'med_ball_slam', 'med_ball_rotational_throw', 'sandbag_carry',
  'landmine_press', 'landmine_row', 'cable_crunch', 'pallof_press', 'skullcrusher',
]);

/** תרגילים שמשפחת ברירת המחדל שלהם אינה משקפת את העומס האמיתי. */
const FAMILY_OVERRIDE = {
  goblet_squat: 'squat_barbell', kb_swing: 'hinge_barbell',
  overhead_ext: 'cable_mid', skullcrusher: 'cable_mid',
  farmer_carry: 'dumbbell_single', suitcase_carry: 'dumbbell_single',
};

const LOAD_FACTOR = {
  good_morning: 0.45, rdl_bb: 0.80, rdl_db: 0.80, single_leg_rdl: 0.35,
  bb_front_squat: 0.78, split_squat: 0.45, walking_lunge: 0.40, reverse_lunge: 0.40,
  lateral_lunge: 0.35, step_up: 0.40, landmine_press: 0.55, arnold_press: 0.80,
  preacher_curl: 0.85, kb_swing: 0.55,
  goblet_squat: 0.45, shrug: 1.40, back_extension: 0.35, cable_kickback: 0.35,
  // שני אלה הופיעו כאן פעמיים, וההגדרה השנייה דרסה בשקט את הראשונה.
  // הערכים שנשארו הם אלה שפעלו בפועל ושכל הבדיקות רצו מולם.
  overhead_ext: 0.60, skullcrusher: 0.80, farmer_carry: 1.30, suitcase_carry: 1.10,
  lateral_raise_cable: 0.28, straight_arm_pulldown: 0.65,
};

/** לאיזו משפחה שייך התרגיל. */
export function loadFamily(ex) {
  if (FAMILY_OVERRIDE[ex.id]) return FAMILY_OVERRIDE[ex.id];
  const eq = new Set(ex.eq.flat());
  const p = ex.pattern;
  const iso = ex.type === 'isolation';

  if (eq.has('leg_press')) return 'leg_press';
  if (eq.has('hip_thrust_machine') || ex.id === 'hip_thrust') return 'hip_thrust';
  if (eq.has('leg_extension') || eq.has('leg_curl_lying') || eq.has('leg_curl_seated')) return 'leg_isolation';
  if (p === 'calf') return 'calf';
  if (p === 'hip_abduction') return 'leg_isolation';
  // הפולי העליון מגדיר משפחה רק כשהתרגיל הוא באמת משיכה אנכית —
  // פשיטת מרפקים שמבוצעת על אותה מכונה אינה עובדת באותם משקלים.
  if (p === 'vertical_pull' && (eq.has('lat_pulldown') || eq.has('cable_crossover'))) return 'pulldown';
  if (eq.has('hack_squat') || eq.has('smith_machine')) return 'squat_machine';
  if (p === 'elbow_extension' || p === 'elbow_flexion' || p === 'shoulder_isolation') {
    // משקולת יד = משקל לכל יד; מוט או מחסנית = משקל אחד סך הכול
    if (eq.has('dumbbell')) return 'isolation_small';
    if (eq.has('barbell') || eq.has('ez_bar') || eq.has('fixed_barbell')
        || eq.has('cable_crossover') || eq.has('lat_pulldown')) return 'cable_isolation';
    return null;
  }

  const machine = [...eq].some((i) => i.endsWith('_machine') || i === 'pec_deck' || i === 'seated_row_machine');
  if (machine) return p.includes('pull') ? 'row_machine' : 'press_machine';

  if (eq.has('barbell') || eq.has('trap_bar') || eq.has('ez_bar') || eq.has('fixed_barbell')) {
    if (p === 'squat') return 'squat_barbell';
    if (p === 'hinge') return 'hinge_barbell';
    if (p === 'vertical_push') return 'press_barbell_vertical';
    if (p === 'horizontal_push') return 'press_barbell_horizontal';
    if (p.includes('pull')) return 'row_barbell';
    return iso ? 'isolation_small' : 'cable_mid';
  }
  if (eq.has('kettlebell')) return 'kettlebell';
  if (eq.has('dumbbell')) {
    if (iso || p === 'shoulder_isolation' || p === 'elbow_flexion' || p === 'elbow_extension') return 'isolation_small';
    return ex.unilateral ? 'dumbbell_single' : 'dumbbell_pair';
  }
  if (eq.has('cable_crossover')) {
    // עבודת ליבה בכבל אינה "בידוד קטן" — היא דורשת התנגדות אמיתית
    const core = ex.primary.some((mus) => mus.startsWith('core_'));
    return core || !iso ? 'cable_mid' : 'isolation_small';
  }
  return null;
}

/**
 * משקל התחלה מוצע. מחזיר null כשאין על מה לבסס — ואז המאמן קובע בשטח.
 * @returns {{kg:number, perSide:boolean, basis:string, confidence:'low'|'medium'} | null}
 */
export function startingLoad(ex, trainee, studio) {
  if (!ex.loadable) return null;
  const family = loadFamily(ex);
  if (!family) return null;
  const bw = trainee.weightKg;
  if (!bw) return null;

  /*
   * הערכת המשקל נשענת על הרמה שנקבעה בפועל ולא על ההצהרה: מי שהצהיר
   * "מתקדם" אחרי שלושה חודשים אינו אמור לקבל הצעת משקל של מתקדם.
   */
  const idx = trainee.resolvedLevelIndex ?? LEVEL_INDEX[trainee.level] ?? 1;
  let kg = bw * BW_RATIO[family][idx] * (LOAD_FACTOR[ex.id] ?? 1);

  // התאמות גיל — שתיהן זהירות בכוונה
  if (trainee.age >= 70) kg *= 0.75;
  else if (trainee.age >= 60) kg *= 0.85;
  if (trainee.age < 16) kg *= 0.55;

  // פציעה חריפה באזור — פותחים נמוך יותר
  const acuteNearby = trainee.constraints.some((c) => c.severity === 'acute');
  if (acuteNearby) kg *= 0.75;

  // ותק אימונים קצר מאוד — הרמה לבדה לא מספיקה
  if ((trainee.trainingAgeMonths ?? 0) < 3) kg *= 0.9;

  // "לכל יד" נכון רק כשבאמת מחזיקים כלי בכל יד, או כשעובדים צד-צד.
  const usesDumbbells = ex.eq.flat().includes('dumbbell');
  const perSide = !SINGLE_IMPLEMENT.has(ex.id)
    && ((family.startsWith('dumbbell'))
        || (family === 'isolation_small' && usesDumbbells)
        || ((family === 'kettlebell' || family === 'cable_isolation' || family === 'cable_mid') && ex.unilateral));
  kg = roundToIncrement(kg, studio, perSide);

  const cap = perSide && studio.dumbbellMaxKg ? studio.dumbbellMaxKg : null;
  const capped = cap && kg > cap;
  if (capped) kg = cap;

  return {
    kg,
    perSide,
    basis: `הצעת פתיחה לפי ${bw} ק״ג משקל גוף ורמת ${LEVEL_LABELS[LEVEL_ORDER_L[idx]] || LEVEL_ORDER_L[idx]}`,
    confidence: 'low',
    atStudioCeiling: !!capped,
  };
}

/**
 * התאמת המשקל למה שבאמת אפשר להרכיב מהמלאי, והוספת הפירוט למאמן:
 * "מוט 20 + 2×10 לכל צד" במקום מספר שאי אפשר לבנות ממנו כלום.
 */
function snap(load, ex, studio) {
  if (load.kg == null || !studio.inventory) return load;
  const real = achievableLoad(load.kg, ex, studio);
  if (real.kg == null) return load;
  return {
    ...load,
    kg: real.kg,
    setup: real.text || null,
    exactFromInventory: real.exact,
    label: real.exact || Math.abs(real.kg - load.kg) < 0.01
      ? load.label
      : `${load.label} · הותאם למלאי הסטודיו`,
  };
}

/** עיגול לקפיצת המשקל שבאמת קיימת בסטודיו. */
export function roundToIncrement(kg, studio, perSide = false) {
  const step = perSide ? Math.min(studio.weightIncrementKg || 2.5, 2) : (studio.weightIncrementKg || 2.5);
  return Math.max(step, Math.round(kg / step) * step);
}

/**
 * המשקל שיוצג בתכנית לתרגיל אחד.
 * סדר העדיפויות: מה שהמאמן קבע ידנית → מה שנרשם בפועל → הצעת פתיחה.
 */
export function planLoad(ex, rx, trainee, studio) {
  const h = trainee.history?.[ex.id];

  // משקל שהמאמן קבע מוצג כפי שהוא — הוא ראה את הציוד במו עיניו
  if (h?.trainerSet?.kg) {
    return {
      kg: h.trainerSet.kg,
      perSide: !!h.trainerSet.perSide,
      source: 'trainer',
      label: 'נקבע על ידי המאמן',
      editedAt: h.trainerSet.at || null,
    };
  }

  if (h?.load) {
    const e1rm = estimate1RM(h.load, h.reps || rx.repsMin);
    const target = (rx.intensityPct[0] + rx.intensityPct[1]) / 2 / 100;
    let kg = e1rm ? e1rm * target : h.load;
    if (h.adjustPct) kg *= 1 + h.adjustPct / 100;
    const perSide = !!h.perSide;
    kg = roundToIncrement(kg, studio, perSide);
    const cap = perSide && studio.dumbbellMaxKg ? studio.dumbbellMaxKg : null;
    return snap({
      kg: cap && kg > cap ? cap : kg,
      perSide,
      source: 'history',
      label: `לפי הביצוע האחרון: ${h.load} ק״ג × ${h.reps || '?'} חזרות`,
      atStudioCeiling: !!(cap && kg > cap),
    }, ex, studio);
  }

  const start = startingLoad(ex, trainee, studio);
  if (start) return snap({ ...start, source: 'estimate', label: `${start.basis} — לאמת בסט חימום` }, ex, studio);

  return {
    kg: null,
    source: 'unknown',
    label: ex.loadable ? 'לקבוע בסט חימום ולרשום' : 'משקל גוף',
  };
}
