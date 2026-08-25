/**
 * מבנה האימון של הסטודיו.
 *
 * לכל סטודיו יש סדר עבודה משלו. באחד מתחילים ברבע שעה בטן ורק אז עוברים
 * לכוח; באחר פותחים בניידות, ובשלישי מסיימים בעשר דקות אירובי. המערכת
 * לא מניחה סדר אחד נכון — הסטודיו מגדיר את השלד, והמנוע ממלא אותו.
 *
 * מבנה הוא רשימה מסודרת של מקטעים. לכל מקטע יש סוג, שם שהמאמן רואה,
 * וכמה זמן הוא תופס. סכום הזמנים אינו חייב להיות אורך האימון: המערכת
 * מנרמלת אותו לאורך בפועל, כך שאותו מבנה עובד גם באימון של 45 דקות
 * וגם באימון של 75.
 */

/**
 * סוגי המקטעים. כל סוג יודע לאילו תפקידים (roles) הוא מתורגם במנוע,
 * ומה ברירת המחדל שלו כשהמשתמש לא מפרט.
 */
export const SEGMENT_KINDS = {
  warmup: {
    label: 'חימום', roles: ['warmup'], defaultMinutes: 6,
    hint: 'הכנה כללית ופתיחת טווחים לפני העומס.',
  },
  mobility: {
    label: 'ניידות', roles: ['warmup'], defaultMinutes: 8, muscles: null,
    hint: 'עבודת טווחים ממוקדת — מתאים לפתיחה או לסיום.',
  },
  core: {
    label: 'בטן וליבה', roles: ['core'], defaultMinutes: 15,
    hint: 'מקטע ליבה עצמאי. לדוגמה: רבע שעה בטן בתחילת האימון.',
  },
  prehab: {
    label: 'מניעת פציעות', roles: ['prehab'], defaultMinutes: 8,
    hint: 'תרגילי חיזוק ממוקדים לאזור רגיש או פציעה מנוהלת.',
  },
  strength: {
    label: 'כוח', roles: ['main', 'secondary', 'accessory'], defaultMinutes: 35,
    hint: 'ליבת האימון — התרגילים העיקריים לפי המטרה והחלוקה.',
  },
  conditioning: {
    label: 'אירובי / מטבולי', roles: ['conditioning'], defaultMinutes: 10,
    hint: 'עבודה מטבולית, אינטרוולים או קרדיו מתמשך.',
  },
  cooldown: {
    label: 'שחרור וסיום', roles: ['cooldown'], defaultMinutes: 5,
    hint: 'הורדת דופק, נשימה ומתיחות קלות.',
  },
  custom: {
    label: 'מקטע חופשי', roles: ['accessory'], defaultMinutes: 10,
    hint: 'מקטע שהסטודיו מגדיר בעצמו — המאמן ממלא אותו בשטח.',
  },
};

/** המבנה הקלאסי: חימום, כוח, סיום. זה מה שהמערכת עשתה עד היום. */
export const DEFAULT_STRUCTURE = [
  { kind: 'warmup', minutes: 6 },
  { kind: 'strength', minutes: 45 },
  { kind: 'cooldown', minutes: 5 },
];

/** מבנים מוכנים שסטודיו יכול לבחור בלחיצה במקום לבנות מאפס. */
export const STRUCTURE_PRESETS = {
  classic: {
    label: 'קלאסי — חימום, כוח, שחרור',
    segments: DEFAULT_STRUCTURE,
  },
  core_first: {
    label: 'בטן קודם — רבע שעה ליבה ואז כוח',
    segments: [
      { kind: 'warmup', minutes: 5 },
      { kind: 'core', minutes: 15, label: 'בטן' },
      { kind: 'strength', minutes: 35 },
      { kind: 'cooldown', minutes: 5 },
    ],
  },
  strength_then_core: {
    label: 'כוח ואז בטן',
    segments: [
      { kind: 'warmup', minutes: 6 },
      { kind: 'strength', minutes: 38 },
      { kind: 'core', minutes: 11 },
      { kind: 'cooldown', minutes: 5 },
    ],
  },
  functional: {
    label: 'פונקציונלי — ניידות, כוח, מטבולי',
    segments: [
      { kind: 'mobility', minutes: 8 },
      { kind: 'strength', minutes: 32 },
      { kind: 'conditioning', minutes: 12 },
      { kind: 'cooldown', minutes: 5 },
    ],
  },
  rehab: {
    label: 'שיקומי — מניעה, כוח מבוקר, שחרור',
    segments: [
      { kind: 'warmup', minutes: 8 },
      { kind: 'prehab', minutes: 12 },
      { kind: 'strength', minutes: 28 },
      { kind: 'cooldown', minutes: 8 },
    ],
  },
  express: {
    label: 'אקספרס — כוח בלבד',
    segments: [{ kind: 'strength', minutes: 30 }],
  },
};

let segSeq = 0;
const segId = () => `seg_${Date.now().toString(36)}_${(segSeq++).toString(36)}`;

/**
 * נרמול מקטע בודד.
 * מקטע לא חוקי אינו מפיל את המבנה — הוא מקבל ברירות מחדל שפויות.
 */
export function normalizeSegment(raw = {}) {
  const kind = SEGMENT_KINDS[raw.kind] ? raw.kind : 'custom';
  const spec = SEGMENT_KINDS[kind];
  const minutes = Number.isFinite(+raw.minutes) && +raw.minutes > 0
    ? Math.min(120, Math.round(+raw.minutes))
    : spec.defaultMinutes;
  return {
    id: raw.id || segId(),
    kind,
    label: String(raw.label || spec.label).trim().slice(0, 40),
    minutes,
    /** כמה תרגילים לכל היותר במקטע. null = לפי הזמן. */
    maxExercises: Number.isFinite(+raw.maxExercises) && +raw.maxExercises > 0
      ? Math.min(12, Math.round(+raw.maxExercises)) : null,
    /** שרירים שהמקטע מתמקד בהם (אופציונלי) — למשל בטן בלבד. */
    muscles: Array.isArray(raw.muscles) && raw.muscles.length ? raw.muscles.slice(0, 6) : null,
    /** באילו ימים המקטע פעיל. null = בכל יום. */
    days: Array.isArray(raw.days) && raw.days.length ? raw.days.map(Number) : null,
    /** הערה שתופיע למאמן בראש המקטע. */
    note: String(raw.note || '').slice(0, 200),
  };
}

/**
 * נרמול מבנה שלם.
 * מבנה ריק חוזר לברירת המחדל — עדיף אימון קלאסי תקין מאשר אימון בלי שלד.
 */
export function normalizeStructure(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.segments || null);
  if (!list || !list.length) return DEFAULT_STRUCTURE.map(normalizeSegment);
  const segments = list.map(normalizeSegment).slice(0, 10);
  // מבנה בלי כוח אפשרי (שיעור ליבה בלבד), אבל מבנה בלי שום מקטע אינו אפשרי
  return segments.length ? segments : DEFAULT_STRUCTURE.map(normalizeSegment);
}

/** האם המקטע פעיל ביום מסוים (dayIndex מ-0). */
export function segmentActiveOn(segment, dayIndex) {
  return !segment.days || segment.days.includes(dayIndex);
}

/**
 * חלוקת אורך האימון בפועל בין המקטעים.
 *
 * המבנה מגדיר יחסים, לא דקות מוחלטות: סטודיו שהגדיר 15 דקות בטן מתוך 60
 * יקבל 11 דקות בטן באימון של 45. כך אותו מבנה נכון לכל אורך אימון.
 */
export function allocateMinutes(structure, sessionMinutes, dayIndex = 0) {
  const active = structure.filter((s) => segmentActiveOn(s, dayIndex));
  if (!active.length) return [];
  const declared = active.reduce((n, s) => n + s.minutes, 0) || 1;
  const scale = sessionMinutes / declared;

  const out = active.map((s) => ({ segment: s, minutes: Math.max(3, Math.round(s.minutes * scale)) }));

  // תיקון עיגול: מוסיפים או מורידים מהמקטע הגדול ביותר כדי לפגוע בסך הכול
  const sum = out.reduce((n, x) => n + x.minutes, 0);
  const drift = sessionMinutes - sum;
  if (drift !== 0 && out.length) {
    const biggest = out.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    biggest.minutes = Math.max(3, biggest.minutes + drift);
  }
  return out;
}

/**
 * תרגום המבנה לתפקידים שהמנוע מכיר, עם תקציב זמן לכל תפקיד.
 * זה הגשר בין מה שהסטודיו הגדיר לבין איך שהמנוע בונה יום.
 */
export function structurePlan(structure, sessionMinutes, dayIndex = 0) {
  return allocateMinutes(structure, sessionMinutes, dayIndex).map(({ segment, minutes }, order) => ({
    order,
    segmentId: segment.id,
    kind: segment.kind,
    label: segment.label,
    note: segment.note,
    minutes,
    roles: SEGMENT_KINDS[segment.kind].roles,
    muscles: segment.muscles,
    maxExercises: segment.maxExercises,
  }));
}

/** האם המבנה שווה למבנה ברירת המחדל — שימושי כדי לא להציג רעש למאמן. */
export function isDefaultStructure(structure) {
  const a = normalizeStructure(structure).map((s) => `${s.kind}:${s.minutes}`).join('|');
  const b = normalizeStructure(DEFAULT_STRUCTURE).map((s) => `${s.kind}:${s.minutes}`).join('|');
  return a === b;
}

/** תיאור קצר וקריא של המבנה, לתצוגה בכרטיס הסטודיו. */
export function describeStructure(structure, sessionMinutes = 60) {
  return structurePlan(normalizeStructure(structure), sessionMinutes)
    .map((p) => `${p.label} ${p.minutes}′`)
    .join(' → ');
}
