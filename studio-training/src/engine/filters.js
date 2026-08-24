/**
 * שכבת הסינון: מה בכלל *מותר* ומה *אפשרי* עבור המתאמן הזה בסטודיו הזה.
 * מפרידים בין שלילה קשה (התרגיל נפסל) לבין קנס רך (התרגיל אפשרי אך פחות מועדף).
 */

import { getConstraint } from '../domain/constraints.js';
import { LEVEL_MAX_SKILL } from './prescription.js';
import { SEVERITY_STRICTNESS } from '../domain/constraints.js';

/**
 * האם הציוד לתרגיל קיים בסטודיו.
 * @returns {{ok: boolean, option: string[]|null, missing: string[]}}
 */
export function equipmentCheck(exercise, studio, blocklist = []) {
  const blocked = new Set(blocklist);
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

/** האם רמת המיומנות של התרגיל מתאימה למתאמן. */
export function skillCheck(exercise, trainee) {
  const max = LEVEL_MAX_SKILL[trainee.level] ?? 3;
  return { ok: exercise.skill <= max, max };
}

/**
 * סינון מלא של מאגר התרגילים עבור מתאמן+סטודיו.
 * מחזיר גם את הפסולים, עם סיבה — כדי שהמאמן יראה *למה* תרגיל לא נבחר.
 */
export function buildCandidatePool(exercises, trainee, studio) {
  const eligible = [];
  const rejected = [];

  for (const ex of exercises) {
    const eq = equipmentCheck(ex, studio, trainee.equipmentBlocklist);
    if (!eq.ok) { rejected.push({ id: ex.id, reason: 'equipment', detail: eq.missing }); continue; }

    const cc = constraintCheck(ex, trainee);
    if (!cc.allowed) { rejected.push({ id: ex.id, reason: 'constraint', detail: cc.reasons }); continue; }

    const sk = skillCheck(ex, trainee);
    if (!sk.ok) { rejected.push({ id: ex.id, reason: 'skill', detail: [`דורש רמה ${ex.skill}, מקסימום לרמת המתאמן ${sk.max}`] }); continue; }

    if (trainee.dislikes.includes(ex.id)) { rejected.push({ id: ex.id, reason: 'disliked', detail: [] }); continue; }

    eligible.push({
      exercise: ex,
      equipmentOption: eq.option,
      scarcity: scarcity(ex, studio, eq.option),
      constraintPenalty: cc.penalty,
      constraintNotes: cc.reasons,
      bonuses: cc.bonuses,
    });
  }
  return { eligible, rejected };
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
