/**
 * שכבת הסינון: מה בכלל *מותר* ומה *אפשרי* עבור המתאמן הזה בסטודיו הזה.
 * מפרידים בין שלילה קשה (התרגיל נפסל) לבין קנס רך (התרגיל אפשרי אך פחות מועדף).
 */

import { getConstraint, SEVERITY_STRICTNESS } from '../domain/constraints.js';
import { customToExercise } from '../domain/exercises.js';
import { startingLoad } from './loads.js';
import { coachLoad } from '../domain/models.js';
import { ageAdjustments, LEVEL_MAX_SKILL } from './prescription.js';

/** ציוד שאפשר לקחת לנסיעה / שקיים בכל חדר מלון. */
const TRAVEL_EQUIPMENT = new Set(['bodyweight', 'resistance_band', 'mini_band', 'mat', 'chair', 'wall', 'step', 'stable_support', 'jump_rope']);

/**
 * האם הציוד לתרגיל קיים בסטודיו.
 * @returns {{ok: boolean, option: string[]|null, missing: string[]}}
 */
export function equipmentCheck(exercise, studio, blocklist = [], opts = {}) {
  const blocked = new Set(blocklist);
  if (opts.travelWeek && !exercise.eq.some((o) => o.every((it) => TRAVEL_EQUIPMENT.has(it)))) {
    return { ok: false, option: null, missing: ['ציוד נייד בלבד בשבוע נסיעה'] };
  }
  let bestMissing = null;
  for (const option of exercise.eq) {
    const missing = option.filter((it) => blocked.has(it) || !(studio.equipment.get(it) > 0));
    if (missing.length === 0) return { ok: true, option, missing: [] };
    if (!bestMissing || missing.length < bestMissing.length) bestMissing = missing;
  }
  return { ok: false, option: null, missing: bestMissing || [] };
}

/**
 * מדד נדירות ציוד: 0 (זמין בשפע) עד 1 (פריט בודד וכולם צריכים אותו).
 * בסטודיו עם 8 מתאמנים במקביל, "לחיצת רגליים" אחת היא צוואר בקבוק.
 */
export function scarcity(exercise, studio, option) {
  if (!option) return 1;
  const concurrent = Math.max(1, studio.concurrentTrainees);
  let worst = 0;
  for (const it of option) {
    if (it === 'bodyweight') continue;
    const count = studio.equipment.get(it) || 0;
    const ratio = count === 0 ? 1 : Math.min(1, Math.max(0, 1 - count / concurrent));
    worst = Math.max(worst, ratio);
  }
  return +worst.toFixed(3);
}

/**
 * בדיקת מגבלות רפואיות/פציעות.
 * @returns {{allowed: boolean, blockedBy: string[], reasons: string[], penalty: number, bonuses: string[]}}
 */
export function constraintCheck(exercise, trainee) {
  const reasons = [];
  const blockedBy = [];
  const bonuses = [];
  let penalty = 0;

  for (const c of trainee.constraints) {
    const rule = getConstraint(c.id);
    const strict = SEVERITY_STRICTNESS[c.severity] ?? 0;

    // דגלים אסורים
    for (const f of rule.forbidFlags || []) {
      if (exercise.flags.includes(f)) {
        // ב-managed דגל אסור הופך לקנס כבד במקום לפסילה, למעט מצבים מערכתיים
        if (c.severity === 'managed' && rule.region !== 'systemic') { penalty += 6; reasons.push(`${rule.name}: ${f}`); }
        else { blockedBy.push(c.id); reasons.push(`${rule.name} — נפסל בשל ${flagLabel(f)}`); }
      }
    }
    // דגלים להימנע
    for (const f of rule.avoidFlags || []) {
      if (exercise.flags.includes(f)) { penalty += c.severity === 'acute' ? 4 : 2; reasons.push(`${rule.name} — עדיף להימנע מ${flagLabel(f)}`); }
    }
    // תקרות עומס
    for (const [joint, cap] of Object.entries(rule.maxStress || {})) {
      const effectiveCap = Math.max(0, cap - strict);
      const load = exercise.stress[joint] ?? 0;
      if (load > effectiveCap) { blockedBy.push(c.id); reasons.push(`${rule.name} — עומס ${jointLabel(joint)} גבוה מדי (${load}>${effectiveCap})`); }
      else if (load === effectiveCap && effectiveCap > 0) penalty += 1;
    }
    for (const [joint, cap] of Object.entries(rule.softStress || {})) {
      if ((exercise.stress[joint] ?? 0) > cap) penalty += 2;
    }
    // בונוס לתגיות מועדפות
    for (const t of rule.preferTags || []) {
      if (exercise.tags.includes(t)) { penalty -= 2; bonuses.push(`${rule.name}: ${t}`); }
    }
  }

  return { allowed: blockedBy.length === 0, blockedBy: [...new Set(blockedBy)], reasons, penalty, bonuses };
}

const FLAG_LABELS = {
  overhead: 'תנועה מעל הראש',
  spinal_flexion: 'כפיפת עמוד שדרה בעומס',
  spinal_loading: 'עומס צירי על עמוד השדרה',
  spinal_rotation: 'סיבוב עמוד שדרה בעומס',
  deep_knee_flexion: 'כפיפת ברך עמוקה',
  deep_hip_flexion: 'כפיפת ירך עמוקה',
  end_range_shoulder_ext: 'מתיחת כתף בקצה טווח',
  impact: 'זעזוע/קפיצה',
  high_valsalva: 'עצירת נשימה ולחץ תוך-בטני',
  grip_intensive: 'אחיזה תובענית',
  floor_transition: 'ירידה ועלייה מהרצפה',
  lying_supine: 'שכיבה על הגב',
  lying_prone: 'שכיבה על הבטן',
  unstable: 'משטח לא יציב',
  balance: 'שיווי משקל על רגל אחת',
  wrist_extension_load: 'עומס על שורש כף היד',
  axial_neck_load: 'עומס על הצוואר',
  ballistic: 'תנועה בליסטית',
};
const JOINT_LABELS = {
  lumbar: 'גב תחתון', knee: 'ברך', shoulder: 'כתף', elbow: 'מרפק', wrist: 'שורש כף יד',
  hip: 'ירך', neck: 'צוואר', ankle: 'קרסול', cardio: 'לב-ריאה',
};
export function flagLabel(f) { return FLAG_LABELS[f] || f; }
export function jointLabel(j) { return JOINT_LABELS[j] || j; }

/**
 * האם התרגיל אפשרי במרחב הפיזי של הסטודיו:
 * גובה תקרה, שטח פנוי ומגבלת רעש (סטודיו בבניין מגורים).
 */
export function spaceCheck(exercise, studio) {
  const reasons = [];
  if (exercise.ceilingCm && studio.ceilingHeightCm && exercise.ceilingCm > studio.ceilingHeightCm) {
    reasons.push(`דורש תקרה של ${exercise.ceilingCm} ס"מ, בסטודיו ${studio.ceilingHeightCm} ס"מ`);
  }
  const rank = { small: 1, medium: 2, large: 3 };
  if (rank[exercise.space] > rank[studio.spaceLevel]) {
    reasons.push(`דורש שטח ${exercise.space} והסטודיו מוגדר ${studio.spaceLevel}`);
  }
  if (exercise.noisy && studio.noiseRestricted) reasons.push('תרגיל רועש בסטודיו עם מגבלת רעש');
  return { ok: reasons.length === 0, reasons };
}

/**
 * תקרת מיומנות בפועל.
 * מעבר לרמת המתאמן, גיל ויחס מאמן-מתאמנים מגבילים: מאמן שמשגיח על עשרה
 * אנשים לא יכול ללמד תרגיל טכני, ולכן התכנית לא תציע כזה מלכתחילה.
 */
export function skillCheck(exercise, trainee, studio) {
  // תרגיל שהמתאמן כבר מבצע נכון אינו "מורכב מדי" עבורו, גם אם רמתו הכללית נמוכה
  if ((trainee.knownMovements || []).includes(exercise.id)) {
    return { ok: true, max: 5, limiter: 'המתאמן כבר שולט בתרגיל' };
  }
  const byLevel = LEVEL_MAX_SKILL[trainee.level] ?? 3;
  const byAge = ageAdjustments(trainee).skillCap;
  let byCoach = 5;
  if (studio) {
    const load = coachLoad(studio);
    byCoach = load > 8 ? 2 : load > 5 ? 3 : load > 3 ? 4 : 5;
  }
  const max = Math.min(byLevel, byAge, byCoach);
  const limiter = max === byCoach && byCoach < byLevel ? 'יחס מאמן-מתאמנים'
    : max === byAge && byAge < byLevel ? 'גיל' : 'רמת ניסיון';
  return { ok: exercise.skill <= max, max, limiter };
}

/**
 * סינון מלא של מאגר התרגילים עבור מתאמן+סטודיו.
 * מחזיר גם את הפסולים, עם סיבה — כדי שהמאמן יראה *למה* תרגיל לא נבחר.
 */
export function buildCandidatePool(exercises, trainee, studio) {
  const eligible = [];
  const rejected = [];

  const approved = new Map(trainee.approvedExercises.map((a) => [a.id, a]));
  const blocked = new Set(trainee.blockedExercises.map((b) => b.id));

  // תרגילים שהמאמן כתב בעצמו ונבדקו בשטח מצטרפים למאגר המועמדים
  const pool = [...exercises, ...eligibleCustomExercises(trainee, studio)];

  for (const ex of pool) {
    if (blocked.has(ex.id)) {
      const reason = trainee.blockedExercises.find((b) => b.id === ex.id)?.reason || '';
      rejected.push({ id: ex.id, reason: 'blocked', detail: [reason || 'נחסם בעקבות דיווח מהשטח'] });
      continue;
    }
    const eq = equipmentCheck(ex, studio, trainee.equipmentBlocklist, { travelWeek: trainee.travelWeek });
    if (!eq.ok) { rejected.push({ id: ex.id, reason: 'equipment', detail: eq.missing }); continue; }

    const sp = spaceCheck(ex, studio);
    if (!sp.ok) { rejected.push({ id: ex.id, reason: 'space', detail: sp.reasons }); continue; }

    // תרגיל שנבדק בשטח ואושר גובר על הכלל הרפואי — זו עדות ישירה על
    // המתאמן הזה, והיא שווה יותר מהנחת ברירת המחדל של המערכת.
    const isApproved = approved.has(ex.id);
    const cc = constraintCheck(ex, trainee);
    if (!cc.allowed && !isApproved) { rejected.push({ id: ex.id, reason: 'constraint', detail: cc.reasons }); continue; }

    const sk = skillCheck(ex, trainee, studio);
    if (!sk.ok) { rejected.push({ id: ex.id, reason: 'skill', detail: [`דורש רמה ${ex.skill}; התקרה בפועל ${sk.max} (${sk.limiter})`] }); continue; }

    if (trainee.dislikes.includes(ex.id)) { rejected.push({ id: ex.id, reason: 'disliked', detail: [] }); continue; }

    eligible.push({
      exercise: ex,
      equipmentOption: eq.option,
      scarcity: scarcity(ex, studio, eq.option),
      constraintPenalty: isApproved ? 0 : cc.penalty,
      constraintNotes: isApproved
        ? [`אושר בבדיקת שטח: ${approved.get(ex.id).note || 'בוצע ללא כאב'}`]
        : cc.reasons,
      bonuses: cc.bonuses,
      approved: isApproved,
      /**
       * האם המשקל הדרוש למתאמן הזה כבר עובר את הציוד הכבד ביותר בסטודיו.
       * תרגיל כזה אינו מאפשר התקדמות אמיתית, ולכן הוא לא ישמש כתרגיל עיקרי.
       */
      ceilingLimited: atStudioCeiling(ex, trainee, studio),
    });
  }
  return { eligible, rejected, coverage: poolCoverage(eligible) };
}

/**
 * מפת הכיסוי של מאגר המועמדים: כמה תרגילים נשארו לכל דפוס תנועה.
 * דפוס עם אפס מועמדים הוא ההסבר לכל "משבצת חלופית" בהמשך, ולכן הוא
 * מדווח למאמן במקום להיעלם בשקט.
 */
export function poolCoverage(eligible) {
  const byPattern = {};
  for (const c of eligible) byPattern[c.exercise.pattern] = (byPattern[c.exercise.pattern] || 0) + 1;
  const missing = ['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull']
    .filter((p) => !byPattern[p]);
  return { total: eligible.length, byPattern, missingPatterns: missing };
}

/** האם המשקל המוצע לתרגיל כבר מגיע לתקרת המשקולות של הסטודיו. */
function atStudioCeiling(ex, trainee, studio) {
  if (!studio.dumbbellMaxKg || !trainee.weightKg) return false;
  if (!ex.eq.flat().includes('dumbbell')) return false;
  const start = startingLoad(ex, trainee, studio);
  return !!(start && start.kg >= studio.dumbbellMaxKg);
}

/**
 * אילו תרגילים מותאמים רשאים להיכנס לשיבוץ אוטומטי.
 * רק כאלה שנבדקו בשטח והצליחו — טיוטה נשמרת אך אינה נכנסת לתכנית מעצמה.
 */
export function eligibleCustomExercises(trainee, studio) {
  const fromTrainee = trainee.customExercises || [];
  const fromStudio = (studio.customExercises || []).filter((c) => (c.testedWith || []).includes(trainee.id));
  const all = [...fromTrainee, ...fromStudio];
  const seen = new Set();
  return all
    .filter((c) => c.status === 'tested_ok')
    .filter((c) => (seen.has(c.id) ? false : seen.add(c.id)))
    .map(customToExercise);
}

/** תרגילים שהמגבלות ממליצות לשלב באופן אקטיבי (עבודת פרה-האב). */
export function prescribedExerciseIds(trainee) {
  const out = [];
  for (const c of trainee.constraints) {
    const rule = getConstraint(c.id);
    for (const id of rule.prescribe || []) out.push(id);
  }
  return [...new Set(out)];
}

/** הערות שיוצגו למאמן בראש התכנית. */
export function constraintNotes(trainee) {
  return trainee.constraints.map((c) => {
    const rule = getConstraint(c.id);
    return {
      id: c.id,
      name: rule.name,
      severity: c.severity,
      side: c.side,
      note: rule.note,
      traineeNote: c.notes || '',
    };
  });
}
