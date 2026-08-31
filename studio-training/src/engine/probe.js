/**
 * תרגיל בדיקה ("נסה ותגיד לי").
 *
 * מגבלה רפואית היא כלל זהירות, לא גזר דין. לפעמים הפציעה ישנה, קלה,
 * או פשוט לא רלוונטית לתנועה מסוימת — והדרך היחידה לדעת היא לנסות
 * בזהירות ולשאול את המתאמן. לכן המערכת מציעה למאמן תרגיל אחד, הכי פשוט
 * והכי בטוח שקיים לאזור, ומבקשת ממנו לדווח מה קרה.
 *
 * שני קווים אדומים שאינם ניתנים לפתיחה:
 *  1. מגבלות מערכתיות (הריון, לב, אוסטאופורוזיס, אפילפסיה וכו') אינן
 *     שאלה של "איך זה מרגיש" — שם לא מוצע תרגיל בדיקה בכלל.
 *  2. בשלב חריף התרגיל נעול, ונפתח רק בלחיצה מפורשת של המאמן.
 */

import { EXERCISES, getExercise } from '../domain/exercises.js';
import { getConstraint } from '../domain/constraints.js';
import { equipmentCheck, spaceCheck, skillCheck } from './filters.js';
import { prescribe } from './prescription.js';

/**
 * דגלים שתרגיל בדיקה לא יישא לעולם, בשום דרגת חומרה.
 * בדיקה נועדה לענות על שאלה אחת — "האם התנועה הזו מרגישה בסדר" — ולכן היא
 * חייבת להיות איטית, מבוקרת וניתנת לעצירה באמצע. זעזוע, תנועה בליסטית או
 * עצירת נשימה שוללים בדיוק את זה, וגם אינם בודקים שום דבר מועיל.
 */
const NEVER_PROBE_FLAGS = [
  'impact', 'ballistic', 'high_valsalva', 'weight_over_head_free',
  'head_below_heart', 'rapid_position_change',
];

/** מעל הסף הזה התרגיל כבר אינו "בדיקה עדינה", ועדיף לא להציע כלום. */
const MAX_PROBE_RISK = 18;

/** מיפוי אזור המגבלה למפרק שעליו מודדים עומס. */
const REGION_JOINT = {
  shoulder: 'shoulder', spine: 'lumbar', knee: 'knee', elbow: 'elbow',
  wrist: 'wrist', hip: 'hip', ankle: 'ankle', neck: 'neck',
};

/** האם למגבלה הזו בכלל מותר להציע תרגיל בדיקה. */
export function probeAllowed(constraintId) {
  const rule = getConstraint(constraintId);
  return !!REGION_JOINT[rule.region];
}

/**
 * ניקוד בטיחות: כמה "עדין" התרגיל עבור האזור הפגוע. נמוך = בטוח יותר.
 */
function riskScore(ex, rule, joint) {
  let risk = 0;
  risk += (ex.stress[joint] ?? 0) * 10;                        // עומס ישיר על האזור
  for (const f of rule.forbidFlags || []) if (ex.flags.includes(f)) risk += 8;
  for (const f of rule.avoidFlags || []) if (ex.flags.includes(f)) risk += 3;
  risk += { low: 0, moderate: 3, high: 7, very_high: 12 }[ex.fatigue] ?? 3;
  risk += ex.skill * 2;
  if (ex.type === 'compound') risk += 4;
  if (ex.loadable) risk += 2;                                   // תרגיל בלי עומס חיצוני עדיף לבדיקה
  for (const t of ['rehab_friendly', 'joint_friendly', 'beginner_friendly', 'isometric']) {
    if (ex.tags.includes(t)) risk -= 4;
  }
  for (const t of rule.preferTags || []) if (ex.tags.includes(t)) risk -= 3;
  // תרגיל שכבר מומלץ על ידי המגבלה אינו "בדיקה" — הוא ממילא בתכנית
  if ((rule.prescribe || []).includes(ex.id)) risk += 25;
  return risk;
}

/**
 * בונה הצעת תרגיל בדיקה אחת לכל מגבלה שרלוונטי לבדוק אותה.
 * @returns {object[]}
 */
export function buildProbes(trainee, studio, opts = {}) {
  const probes = [];
  const alreadyApproved = new Set(trainee.approvedExercises.map((a) => a.id));
  const blocked = new Set(trainee.blockedExercises.map((b) => b.id));

  for (const c of trainee.constraints) {
    if (!probeAllowed(c.id)) continue;
    const rule = getConstraint(c.id);
    const joint = REGION_JOINT[rule.region];

    // מועמדים: תרגילים שנוגעים באזור הפגוע, זמינים בסטודיו ומתאימים לרמה
    const candidates = EXERCISES.filter((ex) => {
      if (alreadyApproved.has(ex.id) || blocked.has(ex.id)) return false;
      if (trainee.dislikes.includes(ex.id)) return false;
      if (ex.flags.some((f) => NEVER_PROBE_FLAGS.includes(f))) return false;
      // התרגיל חייב באמת לגעת באזור הנבדק — או בעומס ישיר על המפרק,
      // או בדגל תנועה שהמגבלה אוסרת ושניתן לבדוק אותו בבטחה.
      const touches = (ex.stress[joint] ?? 0) > 0
        || (rule.forbidFlags || []).some((f) => ex.flags.includes(f));
      if (!touches) return false;
      if (!equipmentCheck(ex, studio, trainee.equipmentBlocklist, { travelWeek: trainee.travelWeek }).ok) return false;
      if (!spaceCheck(ex, studio).ok) return false;
      if (!skillCheck(ex, trainee, studio).ok) return false;
      if (ex.skill > 2) return false;              // תרגיל בדיקה חייב להיות פשוט
      if (ex.fatigue === 'very_high') return false;
      return true;
    });

    if (!candidates.length) continue;
    const best = candidates
      .map((ex) => ({ ex, risk: riskScore(ex, rule, joint) }))
      .sort((a, b) => a.risk - b.risk)[0];
    // אין תרגיל עדין מספיק — עדיף לא להציע כלום מאשר להציע בדיקה מסוכנת
    if (best.risk > MAX_PROBE_RISK) continue;

    const ex = best.ex;
    const rx = prescribe(ex, trainee, { goal: 'rehab' });
    // מנה מינימלית בכוונה: בודקים תחושה, לא מאמנים
    rx.sets = 1;
    rx.rir = Math.max(rx.rir, 4);

    probes.push({
      constraintId: c.id,
      constraintName: rule.name,
      severity: c.severity,
      side: c.side,
      locked: c.severity === 'acute',
      exercise: {
        id: ex.id, name: ex.name, description: ex.description,
        equipment: ex.eq.find((o) => equipmentCheck({ ...ex, eq: [o] }, studio, trainee.equipmentBlocklist).ok) || ex.eq[0],
        pattern: ex.pattern, primary: ex.primary,
      },
      prescription: rx,
      riskScore: best.risk,
      instructions: [
        'להתחיל ללא משקל כלל, או במשקל הקל ביותר שיש.',
        'טווח תנועה קטן בהתחלה, ולהגדיל רק אם אין שום תחושה באזור.',
        c.side ? `לבדוק קודם את הצד הבריא ואז את צד ${c.side === 'right' ? 'ימין' : 'שמאל'} להשוואה.` : 'לבדוק את שני הצדדים ולהשוות תחושה.',
        'לשאול את המתאמן במהלך הסט, לא רק בסוף.',
      ],
      stopRule: 'עוצרים מיד בכל כאב חד, בהקרנה לגפה, או בתחושה שמחמירה מחזרה לחזרה. תחושת מתיחה קלה אינה כאב.',
      lockNote: c.severity === 'acute'
        ? 'המגבלה מסומנת כחריפה. הבדיקה נפתחת רק באישור מפורש שלך, והאחריות על ההחלטה היא שלך. אם יש טיפול רפואי פעיל — לתאם מולו לפני.'
        : null,
      note: rule.note,
    });
  }

  return opts.limit ? probes.slice(0, opts.limit) : probes;
}

/**
 * החלת תוצאת בדיקה על פרופיל המתאמן.
 * @param {object} trainee
 * @param {{exerciseId: string, result: 'ok'|'pain', note?: string, painLevel?: number}} outcome
 */
export function applyProbeResult(trainee, outcome) {
  const t = structuredClone(trainee);
  const ex = safeName(outcome.exerciseId);

  if (outcome.result === 'ok') {
    if (!t.approvedExercises.some((a) => a.id === outcome.exerciseId)) {
      t.approvedExercises.push({
        id: outcome.exerciseId,
        approvedAt: new Date().toISOString(),
        note: outcome.note || 'נבדק בשטח ועבר ללא כאב',
        source: 'probe',
      });
    }
    return { trainee: t, message: `${ex}: אושר לשימוש עבור המתאמן — ייכנס לתכניות הבאות למרות המגבלה.` };
  }

  if (!t.blockedExercises.some((b) => b.id === outcome.exerciseId)) {
    t.blockedExercises.push({
      id: outcome.exerciseId,
      reason: outcome.note || `כאב בבדיקה${outcome.painLevel ? ` (${outcome.painLevel}/10)` : ''}`,
      at: new Date().toISOString(),
    });
  }
  return { trainee: t, message: `${ex}: נחסם עבור המתאמן בעקבות תחושה בבדיקה.` };
}

function safeName(id) {
  try { return getExercise(id).name; } catch { return id; }
}
