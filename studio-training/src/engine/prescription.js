/**
 * מרשם אימון: כמה סטים, כמה חזרות, כמה מנוחה, באיזה קצב ובאיזה מרחק מכשל.
 * הכול נגזר משילוב של מטרה × רמה × סוג התרגיל × מגבלות × מצב התאוששות.
 */

/** פרופיל בסיס לכל מטרה. */
export const GOAL_PROFILES = {
  hypertrophy: {
    label: 'היפרטרופיה',
    compound: { sets: [3, 4], reps: [6, 12], restSec: 120, rir: 2, tempo: '3-0-1-0' },
    isolation: { sets: [2, 4], reps: [10, 15], restSec: 75, rir: 1, tempo: '2-0-1-0' },
    weeklySetsPerMuscle: [10, 20],
    conditioningMinutes: 10,
    intensityPct: [65, 82],
    setTypes: ['straight', 'superset', 'drop'],
  },
  strength: {
    label: 'כוח',
    compound: { sets: [3, 5], reps: [3, 6], restSec: 210, rir: 2, tempo: '2-1-X-0' },
    isolation: { sets: [2, 3], reps: [8, 12], restSec: 90, rir: 2, tempo: '2-0-1-0' },
    weeklySetsPerMuscle: [8, 16],
    conditioningMinutes: 5,
    intensityPct: [80, 92],
    setTypes: ['straight', 'cluster'],
  },
  power: {
    label: 'כוח מתפרץ',
    compound: { sets: [4, 6], reps: [2, 5], restSec: 180, rir: 3, tempo: '2-0-X-0' },
    isolation: { sets: [2, 3], reps: [8, 12], restSec: 75, rir: 2, tempo: '2-0-1-0' },
    weeklySetsPerMuscle: [8, 14],
    conditioningMinutes: 10,
    intensityPct: [50, 75],
    setTypes: ['straight', 'cluster', 'emom'],
  },
  fat_loss: {
    label: 'ירידה באחוזי שומן',
    compound: { sets: [3, 4], reps: [8, 15], restSec: 60, rir: 2, tempo: '2-0-1-0' },
    isolation: { sets: [2, 3], reps: [12, 20], restSec: 45, rir: 1, tempo: '2-0-1-0' },
    weeklySetsPerMuscle: [8, 16],
    conditioningMinutes: 20,
    intensityPct: [60, 75],
    setTypes: ['superset', 'circuit', 'straight'],
  },
  endurance: {
    label: 'סיבולת שרירית',
    compound: { sets: [2, 4], reps: [12, 20], restSec: 60, rir: 2, tempo: '2-0-2-0' },
    isolation: { sets: [2, 3], reps: [15, 25], restSec: 40, rir: 1, tempo: '2-0-2-0' },
    weeklySetsPerMuscle: [8, 16],
    conditioningMinutes: 20,
    intensityPct: [45, 65],
    setTypes: ['circuit', 'straight', 'amrap'],
  },
  general_fitness: {
    label: 'כושר כללי',
    compound: { sets: [2, 4], reps: [8, 12], restSec: 90, rir: 3, tempo: '2-0-1-0' },
    isolation: { sets: [2, 3], reps: [10, 15], restSec: 60, rir: 2, tempo: '2-0-1-0' },
    weeklySetsPerMuscle: [8, 14],
    conditioningMinutes: 12,
    intensityPct: [55, 75],
    setTypes: ['straight', 'superset'],
  },
  rehab: {
    label: 'שיקום',
    compound: { sets: [2, 3], reps: [8, 15], restSec: 90, rir: 4, tempo: '3-1-2-0' },
    isolation: { sets: [2, 3], reps: [10, 20], restSec: 60, rir: 3, tempo: '3-1-2-0' },
    weeklySetsPerMuscle: [6, 12],
    conditioningMinutes: 10,
    intensityPct: [35, 60],
    setTypes: ['straight'],
  },
  posture: {
    label: 'יציבה וכאבי גב',
    compound: { sets: [2, 3], reps: [8, 15], restSec: 75, rir: 3, tempo: '3-0-1-1' },
    isolation: { sets: [2, 4], reps: [12, 20], restSec: 45, rir: 2, tempo: '2-0-2-1' },
    weeklySetsPerMuscle: [8, 14],
    conditioningMinutes: 12,
    intensityPct: [45, 65],
    setTypes: ['straight', 'superset'],
  },
};

/** מקדם נפח לפי רמה (מתחילים סופגים פחות נפח, מתקדמים צריכים יותר). */
export const LEVEL_VOLUME_FACTOR = { beginner: 0.7, novice: 0.85, intermediate: 1.0, advanced: 1.15 };

/** מקדם מורכבות מרבית לפי רמה — מסנן תרגילים שדורשים שליטה גבוהה מדי. */
export const LEVEL_MAX_SKILL = { beginner: 2, novice: 3, intermediate: 4, advanced: 5 };

/** RIR מינימלי לפי רמה — מתחילים לא הולכים לכשל. */
export const LEVEL_MIN_RIR = { beginner: 3, novice: 2, intermediate: 1, advanced: 0 };

/**
 * ציון התאוששות 0..1 מתוך שינה / סטרס / תזונה.
 * ציון נמוך מוריד נפח באופן אוטומטי — זה ה"היגיון של מאמן אנושי" שרואה שהמתאמן שרוף.
 */
export function recoveryScore(trainee) {
  const sleep = clamp01((trainee.sleepQuality - 1) / 4);
  const stress = clamp01((5 - trainee.stressLevel) / 4);
  const nutrition = clamp01((trainee.nutritionAdherence - 1) / 4);
  return +(0.45 * sleep + 0.35 * stress + 0.2 * nutrition).toFixed(3);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/** האם השבוע הנוכחי הוא שבוע דילוד (הורדת עומס מתוכננת). */
export function isDeloadWeek(trainee) {
  return trainee.mesocycleLength > 1 && trainee.mesocycleWeek % trainee.mesocycleLength === 0;
}

/**
 * מכפיל נפח שבועי כולל.
 */
export function volumeMultiplier(trainee) {
  const level = LEVEL_VOLUME_FACTOR[trainee.level] ?? 1;
  const rec = 0.85 + 0.3 * recoveryScore(trainee);       // 0.85 .. 1.15
  const deload = isDeloadWeek(trainee) ? 0.55 : 1;
  const acute = trainee.constraints.filter((c) => c.severity === 'acute').length;
  const injury = 1 - Math.min(0.3, acute * 0.12);
  return +(level * rec * deload * injury).toFixed(3);
}

/**
 * המרשם בפועל לתרגיל בודד.
 * @param {object} exercise
 * @param {object} trainee
 * @param {object} opts { goal, weekProgress: 0..1, isAccessory: boolean }
 */
export function prescribe(exercise, trainee, opts = {}) {
  const goal = opts.goal || trainee.primaryGoal;
  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES.general_fitness;
  const deload = isDeloadWeek(trainee);
  const vm = volumeMultiplier(trainee);

  // חימום/ניידות: מנה קצרה, בלי מנוחות ובלי נפח מיותר.
  if (exercise.type === 'mobility') {
    return {
      sets: 1, reps: `${exercise.repMin}-${Math.min(exercise.repMax, exercise.repMin + 6)}`,
      repsMin: exercise.repMin, repsMax: Math.min(exercise.repMax, exercise.repMin + 6),
      restSec: 15, tempo: 'שליטה', rir: 5, intensityPct: [0, 0],
      unit: exercise.repMax > 30 ? 'seconds' : 'reps',
    };
  }
  // קונדישן: מוגדר בדקות לפי המטרה, לא בסטים וחזרות.
  if (exercise.type === 'conditioning') {
    const minutes = Math.max(4, Math.round(profile.conditioningMinutes * (deload ? 0.6 : 1)));
    const intervals = goal === 'fat_loss' || goal === 'power' ? Math.min(8, Math.max(3, Math.round(minutes / 2))) : 1;
    const perSet = Math.round((minutes * 60) / intervals);
    return {
      sets: intervals,
      reps: `${perSet} שניות`,
      repsMin: perSet, repsMax: perSet,
      restSec: intervals > 1 ? Math.round(perSet * 0.75) : 0,
      tempo: 'רציף', rir: 3,
      intensityPct: goal === 'fat_loss' ? [70, 85] : [60, 75],
      unit: 'seconds',
      totalMinutes: minutes,
    };
  }

  const isIso = exercise.type === 'isolation';
  const base = isIso ? profile.isolation : profile.compound;

  // סטים: בסיס לפי מטרה, ואז התאמה לרמה/התאוששות/דילוד.
  let sets = Math.round(avg(base.sets) * vm);
  sets = clampInt(sets, base.sets[0] - (deload ? 1 : 0), base.sets[1]);
  sets = Math.max(1, sets);

  // חזרות: מצטלבות בין טווח המטרה לטווח שהתרגיל "אוהב".
  const lo = Math.max(base.reps[0], exercise.repMin);
  const hi = Math.min(base.reps[1], exercise.repMax);
  const reps = lo <= hi
    ? [lo, hi]
    : [clampInt(base.reps[0], exercise.repMin, exercise.repMax), clampInt(base.reps[1], exercise.repMin, exercise.repMax)];

  // מנוחה: יותר לתרגילים יקרים ולמתאמנים עם מגבלה מערכתית.
  const fatigueBump = { low: -15, moderate: 0, high: 20, very_high: 40 }[exercise.fatigue] || 0;
  const systemic = trainee.constraints.some((c) => ['hypertension', 'cardiac'].includes(c.id)) ? 30 : 0;
  const restSec = Math.max(30, base.restSec + fatigueBump + systemic);

  // RIR: לא פחות מהמינימום המותר לרמה, ויותר שמרני בפציעה חריפה או בדילוד.
  let rir = Math.max(base.rir, LEVEL_MIN_RIR[trainee.level] ?? 2);
  if (deload) rir += 2;
  if (trainee.constraints.some((c) => c.severity === 'acute')) rir += 1;
  if (isMedicallyCapped(trainee)) rir = Math.max(rir, 3);

  const intensityPct = deload
    ? profile.intensityPct.map((p) => Math.round(p * 0.85))
    : profile.intensityPct.slice();

  return {
    sets,
    reps: reps[0] === reps[1] ? `${reps[0]}` : `${reps[0]}-${reps[1]}`,
    repsMin: reps[0],
    repsMax: reps[1],
    restSec,
    tempo: base.tempo,
    rir,
    intensityPct,
    unit: exercise.type === 'carry' || exercise.tags.includes('isometric') ? 'seconds' : 'reps',
  };
}

function isMedicallyCapped(trainee) {
  return trainee.constraints.some((c) => ['hypertension', 'cardiac', 'pregnancy_t1', 'pregnancy_t2_t3', 'postpartum', 'hernia'].includes(c.id));
}

function avg(a) { return (a[0] + a[1]) / 2; }
function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); }

/** יעד נפח שבועי לכל שריר (סטים) עבור המתאמן. */
export function weeklyVolumeTargets(trainee) {
  const profile = GOAL_PROFILES[trainee.primaryGoal] || GOAL_PROFILES.general_fitness;
  const [lo, hi] = profile.weeklySetsPerMuscle;
  const vm = volumeMultiplier(trainee);
  return { min: Math.round(lo * vm), max: Math.round(hi * vm) };
}
