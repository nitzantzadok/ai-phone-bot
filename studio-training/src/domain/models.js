/**
 * מודלים: סטודיו, מתאמן, ואימות קלט.
 * כל אובייקט שנכנס למנוע עובר כאן — כדי שהמנוע לא יצטרך להתגונן מפני קלט חסר.
 */

import { CONSTRAINTS } from './constraints.js';
import { BY_ID } from './exercises.js';
import {
  ALWAYS_AVAILABLE, CYCLE_PHASES, EQUIPMENT, GOALS, LEVELS, LIFESTYLES, SPLITS, SPORTS,
  TRAINING_STYLES,
} from './taxonomy.js';
import { normalizeNote } from './notes.js';
import { normalizeInventory } from './inventory.js';
import { latest, sortMeasurements } from './measurements.js';
import { normalizeStructure } from './structure.js';
import { normalizeSession } from './schedule.js';

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

  const studio = {
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
    /** סגנון: gym | functional | small_group | personal | pilates | boxing | senior | rehab */
    style: raw.style || 'gym',
    /** מאמנים על הרצפה בו-זמנית — קובע כמה תשומת לב כל מתאמן מקבל. */
    trainersOnFloor: raw.trainersOnFloor ?? 1,
    /** גובה תקרה בס"מ — חוסם לחיצות מעל הראש בעמידה, קפיצות וחבל. */
    ceilingHeightCm: raw.ceilingHeightCm ?? 280,
    /** שטח פנוי: small (עמדות בלבד) | medium | large (מסלול הליכה/מזחלת) */
    spaceLevel: raw.spaceLevel || 'medium',
    /** מגבלת רעש (בניין מגורים, שכנים, שעות) — חוסם הטחות, קפיצות והנחת משקל. */
    noiseRestricted: raw.noiseRestricted ?? false,
    /** המשקולת הכבדה ביותר בסטודיו (ק"ג) — תקרה אמיתית לפרוגרסיה. */
    dumbbellMaxKg: raw.dumbbellMaxKg ?? null,
    /** קפיצת המשקל הקטנה ביותר שאפשר להוסיף בפועל (ק"ג). */
    weightIncrementKg: raw.weightIncrementKg ?? 2.5,
    /** האם המקום ממוזג — רלוונטי לטרשת נפוצה, הריון ומצבים לבביים. */
    climateControlled: raw.climateControlled ?? true,
    trainers: raw.trainers || [],
    /** מבנה האימון של הסטודיו: סדר המקטעים והזמן לכל אחד. */
    sessionStructure: normalizeStructure(raw.sessionStructure),
    /** ספריית התרגילים שהמאמנים בסטודיו כתבו בעצמם. */
    customExercises: (raw.customExercises || []).map(normalizeCustomExercise),
    /** פרטי רישום: כתובת, טלפון, שעות, וכל מה שהוזן בתהליך ההרשמה. */
    profile: raw.profile || {},
    /** תמונות ציוד שהועלו בהרשמה: { item: dataUrlOrPath } */
    equipmentPhotos: raw.equipmentPhotos || {},
    /** טווחי משקלים לכל פריט: { dumbbell: {min,max,step}, ... } */
    equipmentWeights: raw.equipmentWeights || {},
    createdAt: raw.createdAt || null,
    notes: raw.notes || '',
  };
  // המלאי המדויק — אילו משקולות, פלטות ומוטות באמת קיימים ובאיזו כמות
  studio.inventory = normalizeInventory(raw.inventory, studio);
  return studio;
}

/**
 * תרגיל שהמאמן כתב בעצמו.
 * שדות החובה הם מה שהמאמן באמת צריך לכתוב; שדות המבנה אופציונליים
 * ומשמשים את המנוע לשיבוץ אוטומטי — בלעדיהם התרגיל נכנס כתרגיל עזר בלבד.
 */
export function normalizeCustomExercise(raw = {}) {
  return {
    id: raw.id || `custom_${Math.random().toString(36).slice(2, 9)}`,
    custom: true,
    name: raw.name || 'תרגיל ללא שם',
    description: raw.description || '',
    sets: raw.sets ?? 3,
    reps: raw.reps ?? '10',
    load: raw.load ?? '',
    notes: raw.notes || '',
    // --- אופציונלי: משפר שיבוץ אוטומטי
    pattern: raw.pattern || null,
    primaryMuscle: raw.primaryMuscle || null,
    equipment: raw.equipment || [],
    // --- מצב בדיקה בשטח
    status: raw.status || 'draft',     // draft | tested_ok | tested_failed
    testedAt: raw.testedAt || null,
    testedWith: raw.testedWith || [],  // מזהי מתאמנים שאצלם נבדק בהצלחה
    createdBy: raw.createdBy || '',
    createdAt: raw.createdAt || null,
  };
}

/** יחס מאמן-מתאמנים: כמה מתאמנים על כל מאמן באותו רגע. */
export function coachLoad(studio) {
  return studio.concurrentTrainees / Math.max(1, studio.trainersOnFloor);
}

/** ברירות מחדל למתאמן + נרמול. */
export function normalizeTrainee(raw = {}) {
  const constraints = (raw.constraints || []).map((c) => (typeof c === 'string'
    ? { id: c, severity: 'subacute', side: null, notes: '' }
    : { id: c.id, severity: c.severity || 'subacute', side: c.side || null, notes: c.notes || '' }));

  const goals = (raw.goals && raw.goals.length ? raw.goals : ['general_fitness'])
    .map((g) => (typeof g === 'string' ? { goal: g, weight: 1 } : { goal: g.goal, weight: g.weight ?? 1 }));

  /*
   * שיוך לסטודיו. ארגון אחד יכול להפעיל כמה סניפים עם מכשור שונה
   * ואותו מאגר מתאמנים: המתאמן שייך לחשבון, לא לסניף. homeStudioId הוא
   * הסניף שבו הוא מתאמן בדרך כלל, ו-studioIds הם כל הסניפים שהוא רשאי
   * להתאמן בהם. סטודיו יחיד ממשיך לעבודכרגיל בלי לשנות כלום.
   */
  const homeStudioId = raw.homeStudioId || raw.studioId || null;
  const studioIds = [...new Set([
    ...(Array.isArray(raw.studioIds) ? raw.studioIds : []),
    ...(homeStudioId ? [homeStudioId] : []),
  ])];

  return {
    id: raw.id || `trainee_${Math.random().toString(36).slice(2, 8)}`,
    name: raw.name || 'מתאמן',
    /** הסניף הראשי, והסניפים הנוספים שהמתאמן מורשה להתאמן בהם. */
    homeStudioId,
    studioIds,
    /** נשמר לתאימות: קוד קיים שמצפה ל-studioId ממשיך לעבוד. */
    studioId: homeStudioId,
    /** לוח האימונים של המתאמן — תאריכים אמיתיים שניתן להזיז. */
    sessions: (raw.sessions || []).map(normalizeSession),
    sex: raw.sex || 'unspecified',
    age: raw.age ?? 30,
    heightCm: raw.heightCm ?? null,
    // המדידה האחרונה גוברת על משקל שהוזן פעם אחת בטופס —
    // אחרת הצעות המשקל היו נשארות תקועות על נתון ישן
    weightKg: latest(raw.measurements || [])?.weightKg ?? raw.weightKg ?? null,
    /**
     * האם המתאמן פעיל.
     * מתאמן שהפסיק אינו נמחק — ההיסטוריה שלו שווה משהו, והוא עשוי לחזור —
     * אבל הוא גם לא אמור לקבל תכנית בכל שבוע. ברירת המחדל היא פעיל, כדי
     * שכל מי שכבר רשום במערכת יישאר כפי שהיה.
     */
    active: raw.active !== undefined ? !!raw.active : !raw.inactive,
    /** למה הופסק, ומתי — נשמר כדי שהמאמן יזכור. */
    inactiveReason: raw.inactiveReason || '',
    inactiveAt: raw.inactiveAt || null,
    /**
     * החלוקה השבועית שהמתאמן מקבל. ברירת המחדל היא גוף מלא — זו החלוקה
     * שמתאימה לרוב המתאמנים בסטודיו ולרוב התדירויות. 'auto' מחזיר את
     * ההכרעה למנוע, שבוחר לפי מטרה, רמה ומספר ימים.
     */
    preferredSplit: SPLITS.includes(raw.preferredSplit) ? raw.preferredSplit
      : (raw.preferredSplit === 'auto' ? 'auto' : 'full_body'),
    /** סגנונות האימון שנבחרו למתאמן. אפשר לשלב כמה. */
    trainingStyles: [...new Set((raw.trainingStyles || []).filter((k) => TRAINING_STYLES[k]))],
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
    /** ענף ספורט מחוץ לסטודיו — משנה נפח רגליים ועבודת מניעה. */
    sport: SPORTS[raw.sport] ? raw.sport : 'none',
    /** כמה אימוני ספורט חיצוניים בשבוע — עומס שהמערכת חייבת לספור. */
    externalSessions: clamp(raw.externalSessions ?? 0, 0, 14),
    /** אורח חיים תעסוקתי. */
    lifestyle: LIFESTYLES[raw.lifestyle] ? raw.lifestyle : 'sedentary',
    /** שלב במחזור החודשי — קלט אופציונלי לוויסות עדין בלבד. */
    cyclePhase: CYCLE_PHASES.includes(raw.cyclePhase) ? raw.cyclePhase : 'unknown',
    /** תרופות רלוונטיות (טקסט חופשי) — מוצג למאמן, לא מפורש אוטומטית. */
    medications: raw.medications || [],
    /** אורך אימון שונה בימים מסוימים: { sun: 30, thu: 75 } */
    sessionMinutesByDay: raw.sessionMinutesByDay || {},
    /** שבוע נסיעה/מלון — תכנית ממשקל גוף וגומיות בלבד. */
    travelWeek: raw.travelWeek ?? false,
    units: raw.units === 'lb' ? 'lb' : 'kg',
    /**
     * פרטי קשר. המנוע אינו משתמש בהם, אבל הם מגיעים מכל גיליון קיים של
     * סטודיו, והשמטתם הייתה מאלצת את המאמן לנהל שתי רשימות במקום אחת.
     */
    phone: raw.phone || '',
    email: raw.email || '',
    /** מי המאמן האחראי, ומתי התחיל להתאמן. */
    coach: raw.coach || '',
    startDate: raw.startDate || null,
    /** יעד עם תאריך — חתונה, תחרות, חזרה לספורט. */
    targetDate: raw.targetDate || null,
    goalDetail: raw.goalDetail || '',
    /** מדדים שהמאמן רוצה לראות, גם אם המנוע לא מחשב לפיהם. */
    bodyFatPct: raw.bodyFatPct ?? null,
    restingHR: raw.restingHR ?? null,
    bloodPressure: raw.bloodPressure || '',
    /** שעת אימון מועדפת — משפיעה על אורך החימום. */
    preferredTime: raw.preferredTime || 'any',
    /** תרגילים טכניים שהמתאמן כבר יודע לבצע — מרחיב את תקרת המורכבות. */
    knownMovements: raw.knownMovements || [],
    /** פציעות שהחלימו — לא מסננות, אך מוצגות למאמן כרקע. */
    pastInjuries: raw.pastInjuries || '',
    notes: raw.notes || '',
    /** היסטוריית משקלי עבודה: exerciseId -> { load, reps, date } */
    history: raw.history || {},
    /**
     * תרגילים שהמאמן בדק בשטח ואישר שהמתאמן מבצע אותם בסדר,
     * גם אם מגבלה רפואית הייתה פוסלת אותם. זו העדות מהשטח שגוברת על הכלל.
     */
    approvedExercises: (raw.approvedExercises || []).map((a) => (typeof a === 'string'
      ? { id: a, approvedAt: null, note: '', source: 'manual' }
      : { id: a.id, approvedAt: a.approvedAt || null, note: a.note || '', source: a.source || 'manual' })),
    /** תרגילים שנחסמו בעקבות כאב בשטח — חסימה קשה שאינה נפתחת מאליה. */
    blockedExercises: (raw.blockedExercises || []).map((b) => (typeof b === 'string'
      ? { id: b, reason: '', at: null }
      : { id: b.id, reason: b.reason || '', at: b.at || null })),
    /** תרגילים שהמאמן כתב בעצמו עבור המתאמן הזה. */
    customExercises: (raw.customExercises || []).map(normalizeCustomExercise),
    /** מדידות היקפים והרכב גוף לאורך זמן. */
    measurements: sortMeasurements(raw.measurements || []),
    /** יומן ההערות של המאמנים — כל אחת ניתנת לעריכה, כיבוי או מחיקה. */
    notesLog: (raw.notesLog || []).map(normalizeNote),
    /** התאמות שנובעות מהערות פעילות. */
    loadAdjustPct: raw.loadAdjustPct ?? 0,
    volumeAdjustPct: raw.volumeAdjustPct ?? 0,
    avoidPatterns: raw.avoidPatterns || [],
    watchJoints: raw.watchJoints || {},
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

  // --- שערי בטיחות
  const systemicAcute = trainee.constraints.filter(
    (c) => c.severity === 'acute' && CONSTRAINTS[c.id]?.region === 'systemic');
  if (systemicAcute.length && !trainee.medicalClearance) {
    errors.push(`מצב רפואי מערכתי בשלב חריף (${systemicAcute.map((c) => CONSTRAINTS[c.id].name).join(', ')}) ללא אישור רפואי — לא ניתן להפיק תכנית לפני קבלת אישור.`);
  }
  if (trainee.age < 13) {
    errors.push('גיל מתחת ל-13 — נדרשת תכנית ייעודית לילדים בליווי גורם מוסמך; המערכת אינה מפיקה תכנית התנגדות בגיל זה.');
  } else if (trainee.age < 16) {
    warnings.push('מתאמן/ת מתחת לגיל 16 — התכנית נבנית ללא עומסים מרביים, בדגש על לימוד טכניקה ועל טווח חזרות בינוני.');
  }
  if (trainee.age >= 65) {
    warnings.push('גיל 65 ומעלה — נוספה עבודת שיווי משקל וכוח מהיר, שמפחיתה סיכון נפילות.');
  }
  if (trainee.heightCm && trainee.weightKg) {
    const bmi = trainee.weightKg / ((trainee.heightCm / 100) ** 2);
    if (bmi >= 35) warnings.push(`מדד מסת גוף ${bmi.toFixed(1)} — התכנית מעדיפה תרגילים ללא זעזועים ובעמדות נתמכות. שווה לוודא עם המתאמן שזה מתאים לו.`);
    if (bmi < 16) warnings.push('מדד מסת גוף נמוך מאוד — מומלץ בירור תזונתי/רפואי לפני העלאת עומסים.');
  }
  if (trainee.level === 'beginner' && trainee.daysPerWeek >= 5) {
    warnings.push('חמישה ימי אימון ומעלה למתחיל — סיכון לעומס יתר ולנטישה; 3 ימים איכותיים עדיפים.');
  }
  const totalSessions = trainee.daysPerWeek + trainee.externalSessions;
  if (totalSessions >= 8) {
    warnings.push(`${totalSessions} אימונים שבועיים בסך הכול (כולל ספורט חיצוני) — הנפח בסטודיו הופחת כדי לאפשר התאוששות.`);
  }
  if (trainee.sessionMinutes <= 30 && trainee.daysPerWeek <= 2) {
    warnings.push('פחות משעה שבועית של אימון — הגירוי מוגבל; מומלץ להוסיף יום או להאריך אימון.');
  }
  if (trainee.travelWeek) {
    warnings.push('שבוע נסיעה — התכנית מוגבלת למשקל גוף, גומיות וציוד נייד.');
  }
  if (studio.style === 'pilates' && ['strength', 'hypertrophy', 'power'].includes(trainee.primaryGoal)) {
    warnings.push('מטרת כוח/מסה בסטודיו פילאטיס — הציוד מגביל את הפרוגרסיה בעומס; שווה לתאם ציפיות או להוסיף ציוד התנגדות.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
