/**
 * מודלים: סטודיו, מתאמן, ואימות קלט.
 * כל אובייקט שנכנס למנוע עובר כאן — כדי שהמנוע לא יצטרך להתגונן מפני קלט חסר.
 */

import { CONSTRAINTS } from './constraints.js';
import { BY_ID } from './exercises.js';
import { ALWAYS_AVAILABLE, EQUIPMENT, GOALS, LEVELS, SPLITS } from './taxonomy.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEK_DAYS = DAYS;

export const DAY_LABEL = {
  sun: 'ראשון', mon: 'שני', tue: 'שלישי', wed: 'רביעי', thu: 'חמישי', fri: 'שישי', sat: 'שבת',
};

/**
 * נרמול סטודיו.
 * equipment יכול להגיע כמערך מחרוזות או כמערך {item, count}.
 */
export function normalizeStudio(raw = {}) {
  const equipment = new Map();
  for (const it of raw.equipment || []) {
    if (typeof it === 'string') equipment.set(it, (equipment.get(it) || 0) + 1);
    else if (it && it.item) equipment.set(it.item, Math.max(equipment.get(it.item) || 0, it.count ?? 1));
  }
  for (const it of ALWAYS_AVAILABLE) if (!equipment.has(it)) equipment.set(it, 99);

  return {
    id: raw.id || 'studio',
    name: raw.name || 'סטודיו',
    equipment,                                           // Map<item, count>
    /** כמה מתאמנים מתאמנים במקביל באותה שעה — משפיע על ציוד נדיר. */
    concurrentTrainees: raw.concurrentTrainees ?? 1,
    /** האם מותר לשלב סופרסטים (דורש תפיסת שתי עמדות). */
    allowSupersets: raw.allowSupersets ?? true,
    /** אורכי אימון סטנדרטיים בדקות. */
    sessionMinutes: raw.sessionMinutes ?? 60,
    /** העדפת חלוקה ברירת מחדל של הסטודיו (אופציונלי). */
    preferredSplit: raw.preferredSplit || null,
    /** סגנון הסטודיו: 'gym' | 'functional' | 'small_group' | 'personal' | 'reformer' */
    style: raw.style || 'gym',
    trainers: raw.trainers || [],
    notes: raw.notes || '',
  };
}

/** ברירות מחדל למתאמן + נרמול. */
export function normalizeTrainee(raw = {}) {
  const constraints = (raw.constraints || []).map((c) => (typeof c === 'string'
    ? { id: c, severity: 'subacute', side: null, notes: '' }
    : { id: c.id, severity: c.severity || 'subacute', side: c.side || null, notes: c.notes || '' }));

  const goals = (raw.goals && raw.goals.length ? raw.goals : ['general_fitness'])
    .map((g) => (typeof g === 'string' ? { goal: g, weight: 1 } : { goal: g.goal, weight: g.weight ?? 1 }));

  return {
    id: raw.id || `trainee_${Math.random().toString(36).slice(2, 8)}`,
    name: raw.name || 'מתאמן',
    sex: raw.sex || 'unspecified',
    age: raw.age ?? 30,
    heightCm: raw.heightCm ?? null,
    weightKg: raw.weightKg ?? null,
    level: LEVELS.includes(raw.level) ? raw.level : 'beginner',
    trainingAgeMonths: raw.trainingAgeMonths ?? 0,
    goals,
    primaryGoal: raw.primaryGoal || goals[0].goal,
    daysPerWeek: clamp(raw.daysPerWeek ?? 3, 1, 6),
    sessionMinutes: clamp(raw.sessionMinutes ?? 60, 20, 120),
    preferredDays: (raw.preferredDays || []).filter((d) => DAYS.includes(d)),
    constraints,
    dislikes: raw.dislikes || [],
    likes: raw.likes || [],
    focusMuscles: raw.focusMuscles || [],
    /** נתוני התאוששות 1-5 — משפיעים על נפח ועל תדירות. */
    sleepQuality: raw.sleepQuality ?? 3,
    stressLevel: raw.stressLevel ?? 3,
    nutritionAdherence: raw.nutritionAdherence ?? 3,
    /** האם המתאמן אוהב מגוון גדול או שגרה קבועה. */
    varietyPreference: raw.varietyPreference ?? 'balanced', // low | balanced | high
    /** מספר השבוע במחזור האימונים (1..N). משמש לפרוגרסיה ולדילוד. */
    mesocycleWeek: raw.mesocycleWeek ?? 1,
    mesocycleLength: raw.mesocycleLength ?? 4,
    medicalClearance: raw.medicalClearance ?? true,
    equipmentBlocklist: raw.equipmentBlocklist || [],
    notes: raw.notes || '',
    /** היסטוריית משקלי עבודה: exerciseId -> { load, reps, date } */
    history: raw.history || {},
  };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * אימות קלט. מחזיר { ok, errors, warnings }.
 * שגיאות עוצרות יצירת תכנית; אזהרות רק מוצגות למאמן.
 */
export function validateInput(trainee, studio) {
  const errors = [];
  const warnings = [];

  if (!GOALS.includes(trainee.primaryGoal)) errors.push(`מטרה לא מוכרת: ${trainee.primaryGoal}`);
  for (const g of trainee.goals) if (!GOALS.includes(g.goal)) errors.push(`מטרה לא מוכרת: ${g.goal}`);
  for (const c of trainee.constraints) {
    if (!CONSTRAINTS[c.id]) errors.push(`מגבלה לא מוכרת: ${c.id}`);
  }
  for (const d of trainee.dislikes) if (!BY_ID[d]) warnings.push(`תרגיל לא מוכר ברשימת "לא אוהב": ${d}`);
  for (const [item] of studio.equipment) {
    if (!EQUIPMENT.includes(item)) warnings.push(`פריט ציוד לא מוכר בסטודיו: ${item}`);
  }
  if (studio.preferredSplit && !SPLITS.includes(studio.preferredSplit)) {
    warnings.push(`חלוקה מועדפת לא מוכרת: ${studio.preferredSplit}`);
  }
  if (trainee.preferredDays.length && trainee.preferredDays.length < trainee.daysPerWeek) {
    warnings.push('מספר הימים המועדפים קטן ממספר ימי האימון המבוקש — המערכת תשלים ימים נוספים.');
  }
  if (!trainee.medicalClearance && trainee.constraints.some((c) => CONSTRAINTS[c.id]?.region === 'systemic')) {
    warnings.push('קיים מצב רפואי מערכתי ללא אישור רפואי מתועד — נדרש אישור לפני התחלת התכנית.');
  }
  if (studio.equipment.size <= 1) {
    warnings.push('לא הוגדר ציוד בסטודיו — התכנית תיבנה ממשקל גוף בלבד.');
  }
  const acute = trainee.constraints.filter((c) => c.severity === 'acute');
  if (acute.length >= 3) {
    warnings.push('שלוש מגבלות חריפות ומעלה — מומלץ אימון בהתאמה אישית ובליווי גורם רפואי.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
