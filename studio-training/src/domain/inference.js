/**
 * מה אפשר ללמוד על מתאמן מהאימונים שכבר עשה.
 *
 * זו הנקודה שבה גיליון של סטודיו שווה יותר מטופס רישום: בטופס המאמן
 * מצהיר "מתחילה", ובגיליון כתוב שהיא עושה סקוואט מוט 4×5 עם 70 ק"ג ומתח
 * בתוספת משקל. ההצהרה היא זיכרון; הרישום הוא מה שקרה. המודול הזה קורא את
 * מה שקרה — תרגילים, משקלים, סטים, חזרות, תדירות וציוד — ומוציא מזה
 * פרופיל שאפשר לבנות עליו תכנית: רמה, ותק, תרגילים טכניים שהמתאמן כבר
 * מבצע, ומשקלי עבודה שמאפשרים להציע משקל אמיתי כבר בתכנית הראשונה.
 *
 * העיקרון: כל מסקנה נשענת על ראיה, וכל ראיה מוחזרת יחד עם המסקנה. מאמן
 * שרואה "בינוני — לפי סקוואט 70 ק"ג ומתח" יכול להסכים או לחלוק. מסקנה
 * בלי נימוק היא ניחוש שאי אפשר לבדוק.
 */

import { BY_ID } from './exercises.js';
import {
  ABSOLUTE_LOAD_BANDS, LEVEL_ORDER, TRAINING_AGE_MIN_MONTHS, levelFromMovements, levelFromStrength,
} from './level.js';
import { EQUIPMENT_CATEGORIES, LEVEL_LABELS } from './labels.js';
import { MUSCLE_REGION, MUSCLE_ROLE } from './taxonomy.js';

const levelIdxOf = (level) => Math.max(0, LEVEL_ORDER.indexOf(level));
const levelKey = (i) => LEVEL_ORDER[Math.max(0, Math.min(3, i))];
/** שם הרמה בעברית — הנימוקים האלה מוצגים למאמן. */
const heLevel = (i) => LEVEL_LABELS[levelKey(i)] || levelKey(i);

/** תרגיל מהמאגר בלבד. תרגיל שיובא ולא זוהה אינו ראיה למאומה. */
const knownExercise = (byId, id) => (id && !String(id).startsWith('imported_') ? byId[id] : null);

/**
 * כל התרגילים שהמתאמן ביצע, עם המשקל הכבד ביותר שנרשם לכל אחד.
 *
 * מאחדים שלושה מקורות: יומן הביצועים (מה שבוצע), התכניות שיובאו (מה
 * שנרשם לו לעשות), וההיסטוריה שכבר שמורה בכרטיס. הכבד ביותר ולא האחרון —
 * היכולת נקבעת לפי מה שהמתאמן הצליח לבצע.
 */
export function collectPerformed(trainee, { programs = [], logs = [], byId = BY_ID } = {}) {
  const performed = new Map();

  const note = (exerciseId, loadKg, reps, date, perSide = false) => {
    const ex = knownExercise(byId, exerciseId);
    if (!ex) return;
    const load = Number.isFinite(loadKg) && loadKg > 0 ? (perSide ? loadKg * 2 : loadKg) : null;
    const prev = performed.get(ex.id);
    if (!prev) { performed.set(ex.id, { ex, load, reps: reps ?? null, date: date || null, count: 1 }); return; }
    prev.count++;
    if (load !== null && (prev.load === null || load > prev.load)) {
      prev.load = load; prev.reps = reps ?? prev.reps; prev.date = date || prev.date;
    }
    if (!prev.date && date) prev.date = date;
  };

  for (const [id, rec] of Object.entries(trainee.history || {})) {
    note(id, rec?.load ?? rec?.loadKg ?? null, rec?.reps ?? null, rec?.date ?? null, !!rec?.perSide);
  }
  for (const entry of logs) {
    note(entry.exerciseId, entry.loadKg, entry.reps, entry.date);
  }
  for (const program of programs) {
    for (const day of program.days || []) {
      for (const block of day.blocks || []) {
        note(block.exercise?.id, block.load?.kg, block.prescription?.repsMin ?? null,
          block.date || null, !!block.load?.perSide);
      }
    }
  }
  return [...performed.values()];
}

/** הראיה החזקה ביותר בכל דפוס תנועה. */
function bestByPattern(performed) {
  const out = new Map();
  for (const p of performed) {
    const cur = out.get(p.ex.pattern);
    if (!cur || (p.load ?? 0) > (cur.load ?? 0)) out.set(p.ex.pattern, p);
  }
  return out;
}

/** הרמה שמשקלי העבודה מעידים עליה, גם בלי משקל גוף. */
function levelFromLoads(performed, trainee) {
  const best = bestByPattern(performed);
  const relative = [];
  const absolute = [];
  const details = [];

  for (const [pattern, p] of best) {
    if (!p.load) continue;
    if (trainee.weightKg) {
      const rel = levelFromStrength(pattern, p.load, trainee.weightKg, trainee);
      if (rel) { relative.push(rel.index); details.push({ pattern, name: p.ex.name, load: p.load, level: rel.index, ratio: rel.ratio }); continue; }
    }
    const band = ABSOLUTE_LOAD_BANDS[pattern];
    if (!band) continue;
    let i = -1;
    for (let n = 0; n < band.length; n++) if (p.load >= band[n]) i = n;
    if (i >= 0) { absolute.push(i); details.push({ pattern, name: p.ex.name, load: p.load, level: i }); }
  }

  const median = (arr) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null);
  return {
    relative: median(relative),
    relativeCount: relative.length,
    absolute: median(absolute),
    absoluteCount: absolute.length,
    details,
  };
}

/**
 * אורך האימון בפועל, מתוך מה שהיה כתוב בתכנית.
 *
 * הזמן של סט אינו קבוע, והוא נגזר מטווח החזרות: חמישה סטים של שלוש חזרות
 * בסקוואט כבד הם שלוש דקות מנוחה בין סט לסט, ושנים-עשר חזרות בבידוד הם
 * דקה. הערכה אחידה של דקה וחצי לסט הייתה מקצרת אימון כוח לחצי מאורכו —
 * ואז המנוע היה דוחס את התכנית הבאה לסט אחד לתרגיל, שזו כבר לא תכנית.
 */
function setMinutes(reps) {
  if (reps === null) return 2.5;
  if (reps <= 5) return 3.8;   // כוח: מנוחה של 3 דקות ומעלה
  if (reps <= 8) return 2.6;
  if (reps <= 12) return 2.0;
  return 1.5;                  // סיבולת ובידוד: מנוחה קצרה
}

function minutesFromPrograms(programs) {
  const perDay = [];
  for (const program of programs) {
    for (const day of program.days || []) {
      const blocks = day.blocks || [];
      if (blocks.length < 3) continue;
      let minutes = 0;
      for (const b of blocks) {
        const sets = b.prescription?.sets || 3;
        const min = b.prescription?.repsMin;
        const max = b.prescription?.repsMax;
        const reps = Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2
          : (Number.isFinite(min) ? min : null);
        minutes += sets * setMinutes(reps);
      }
      perDay.push(Math.round(minutes + 8)); // חימום בתחילת האימון
    }
  }
  if (!perDay.length) return null;
  const sorted = perDay.sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  /*
   * רצפה של 45 דקות, כי גיליון של סטודיו מתעד את עבודת הליבה של האימון
   * ולא את האימון כולו: חימום, מתיחות, תרגיל שהוסיפו בשטח ומעברים בין
   * מכשירים אינם נרשמים בו כמעט אף פעם. בלי הרצפה, שלושה תרגילים
   * שנרשמו הפכו ל"אימון של 25 דקות", והמנוע היה בונה לפי זה תכנית
   * מקוצצת — ההפך הגמור ממה שהגיליון מלמד.
   */
  return Math.max(45, Math.min(120, Math.round(median / 5) * 5));
}

/** תדירות אמיתית מתוך התכניות שיובאו. */
function daysFromPrograms(programs) {
  // תכנית של יום אחד אינה תדירות — היא לשונית של אימון בודד
  const counts = programs.map((p) => (p.days || []).length).filter((n) => n >= 2 && n <= 7);
  if (!counts.length) return null;
  return Math.max(...counts);
}

/**
 * הפרופיל שנלמד מהאימונים.
 *
 * @returns {{level:{index:number,label:string,confidence:string,reasons:string[]},
 *            history:object, knownMovements:string[], equipmentSeen:string[],
 *            trainingAgeMonths:number|null, daysPerWeek:number|null, evidence:object}}
 */
export function inferTraineeProfile(trainee, { programs = [], logs = [], byId = BY_ID } = {}) {
  const performed = collectPerformed(trainee, { programs, logs, byId });
  const reasons = [];
  const declared = levelIdxOf(trainee.level);

  const complexity = levelFromMovements(performed.map((p) => p.ex));
  const loads = levelFromLoads(performed, trainee);

  /*
   * הרמה הנלמדת היא הגבוהה מבין הראיות, לא הממוצע שלהן.
   * ראיה אינה סותרת ראיה אחרת: מי שהוכיח כוח בינוני ומבצע תרגיל מתקדם
   * הוא מתקדם שעדיין לא העמיס, ולא בינוני. מה שאין עליו ראיה פשוט אינו
   * משתתף בחישוב — היעדר נתון אינו עדות לחולשה.
   */
  let inferred = 0;
  if (complexity) {
    inferred = Math.max(inferred, complexity.level);
    reasons.push(`מבצע ${complexity.examples.join(', ')} — תרגילים ברמת מיומנות ${complexity.skill}.`);
  }
  if (loads.relative !== null) {
    inferred = Math.max(inferred, loads.relative);
    const top = loads.details.filter((d) => d.ratio).slice(0, 2)
      .map((d) => `${d.name} ${d.load} ק״ג (${d.ratio}× משקל גוף)`);
    if (top.length) reasons.push(`כוח יחסי שנרשם: ${top.join(', ')}.`);
  } else if (loads.absolute !== null) {
    inferred = Math.max(inferred, loads.absolute);
    const top = loads.details.slice(0, 2).map((d) => `${d.name} ${d.load} ק״ג`);
    reasons.push(`משקלי עבודה שנרשמו: ${top.join(', ')}. (בלי משקל גוף ההערכה גסה יותר —`
      + ' השלמת משקל הגוף תחדד אותה.)');
  }

  const evidenceCount = (complexity ? 1 : 0) + loads.relativeCount + loads.absoluteCount;
  const confidence = loads.relativeCount >= 2 ? 'high' : (evidenceCount >= 2 ? 'medium' : (evidenceCount ? 'low' : 'none'));

  /*
   * הצהרה גבוהה מהראיות נשמרת. מאמן שכתב "מתקדם" ראה משהו שהגיליון לא
   * מראה — פציעה שחלפה, שנים שלא נרשמו — והורדת רמה על סמך חוסר נתונים
   * הייתה מייצרת תכנית קלה מדי בלי סיבה.
   */
  const level = Math.max(declared, inferred);
  if (inferred > declared) {
    reasons.unshift(`הרמה עודכנה מ«${heLevel(declared)}» ל«${heLevel(level)}» לפי מה שנרשם בגיליון.`);
  } else if (evidenceCount && inferred < declared) {
    reasons.push(`ההצהרה «${heLevel(declared)}» נשמרה — הראיות בגיליון תומכות ב«${heLevel(inferred)}» ואינן סותרות אותה.`);
  }

  /*
   * ותק: אי אפשר להיות באמצע הדרך אחרי אפס חודשים. כשהראיות מעידות על
   * רמה שדורשת ותק, והוותק שהוזן קטן ממנה, הוא מועלה לרף המינימלי — אחרת
   * המנוע היה מוריד את הרמה בחזרה בגלל תקרת הוותק, וסותר את מה שראה.
   */
  const declaredMonths = trainee.trainingAgeMonths ?? 0;
  const neededMonths = TRAINING_AGE_MIN_MONTHS[level] || 0;
  const trainingAgeMonths = declaredMonths < neededMonths && evidenceCount ? neededMonths : null;
  if (trainingAgeMonths) {
    reasons.push(`הוותק הועלה ל-${trainingAgeMonths} חודשים — זה המינימום שרמה כזאת דורשת.`);
  }

  // תרגילים טכניים שכבר בוצעו: פותחים אותם למנוע במקום לחסום אותם לפי רמה
  const knownMovements = [...new Set([
    ...(trainee.knownMovements || []),
    ...performed.filter((p) => (p.ex.skill ?? 1) >= 3).map((p) => p.ex.id),
  ])];

  const equipmentSeen = [...new Set(performed.flatMap((p) => (p.ex.eq || []).flat()))];

  const history = {};
  for (const p of performed) {
    if (p.load === null) continue;
    history[p.ex.id] = { load: p.load, reps: p.reps, date: p.date, perSide: false, source: 'inferred' };
  }

  return {
    level: { index: level, label: levelKey(level), confidence, reasons },
    history,
    knownMovements,
    equipmentSeen,
    trainingAgeMonths,
    daysPerWeek: daysFromPrograms(programs),
    sessionMinutes: minutesFromPrograms(programs),
    evidence: {
      exercises: performed.length,
      withLoad: performed.filter((p) => p.load !== null).length,
      patterns: bestByPattern(performed).size,
      topSkill: complexity?.skill ?? null,
      loads: loads.details,
    },
  };
}

/* ------------------------------------------------------------------ *
 * מה עוד אפשר לקרוא מהתכניות, מעבר לרמה.
 *
 * מתאמן שמופיע בגיליון רק כלשונית של תכנית אינו "שם בלבד": התכנית שלו
 * מספרת איך הוא מתאמן — איך האימון מחולק, אילו טווחי חזרות, כמה בידוד,
 * משקולות חופשיות או מכונות, באילו ימים, ומתי היה כאן לאחרונה. כל אלה
 * שדות שהמאמן היה ממלא ידנית לכל אדם, והם כתובים כבר בגיליון.
 * ------------------------------------------------------------------ */

/** דפוסי בידוד — יחס הבידוד הוא ההבדל בין אימון כוח לאימון פיתוח גוף. */
const ISOLATION_PATTERNS = new Set([
  'elbow_flexion', 'elbow_extension', 'shoulder_isolation', 'calf', 'hip_abduction',
]);

const MACHINE_ITEMS = new Set(EQUIPMENT_CATEGORIES.find((c) => c.key === 'machines')?.items || []);
const FREE_ITEMS = new Set(EQUIPMENT_CATEGORIES.find((c) => c.key === 'free_weights')?.items || []);

/** כל התרגילים של יום אימון, כרשומות מהמאגר. */
function dayExercises(day, byId) {
  return (day.blocks || [])
    .map((b) => knownExercise(byId, b.exercise?.id))
    .filter(Boolean);
}

/**
 * אופיו של יום אימון אחד: פלג עליון, תחתון, גוף מלא, או דחיפה/משיכה.
 * נקבע לפי השרירים הראשיים של התרגילים — לא לפי שם היום, כי "יום א'"
 * אינו אומר דבר ו"חזה+יד אחורית" אומר הכול.
 */
function dayShape(exercises) {
  const regions = { upper: 0, lower: 0, core: 0 };
  const roles = { push: 0, pull: 0, legs: 0, core: 0 };
  for (const ex of exercises) {
    for (const m of ex.primary || []) {
      const r = MUSCLE_REGION[m];
      if (r) regions[r]++;
      const role = MUSCLE_ROLE[m];
      if (role) roles[role]++;
    }
  }
  const lifting = regions.upper + regions.lower;
  if (!lifting) return { region: null, role: null };

  /*
   * יום גוף מלא נמדד לפי הצד הקטן ולא לפי הגדול: אימון של שלושה תרגילי
   * פלג עליון ולחיצת רגליים אחת הוא גוף מלא, ולא "יום עליון". יום עליון
   * אמיתי הוא כזה שאין בו רגליים כמעט בכלל.
   */
  const minorityShare = Math.min(regions.upper, regions.lower) / lifting;
  const region = minorityShare >= 0.2
    ? 'full'
    : (regions.upper >= regions.lower ? 'upper' : 'lower');

  const moves = roles.push + roles.pull + roles.legs;
  let role = null;
  if (moves) {
    const [top, topCount] = Object.entries(roles)
      .filter(([k]) => k !== 'core')
      .sort((a, b) => b[1] - a[1])[0];
    if (topCount / moves >= 0.7) role = top;
  }
  return { region, role };
}

/**
 * החלוקה השבועית שהמתאמן עבד לפיה.
 *
 * זה השדה שקובע איך תיראה התכנית הבאה, וכשהוא נלמד מהגיליון המתאמן
 * ממשיך מאיפה שהפסיק במקום לקבל ברירת מחדל שאינה קשורה אליו.
 */
function splitFromPrograms(programs, byId) {
  const shapes = [];
  for (const program of programs) {
    const days = (program.days || []).map((d) => dayShape(dayExercises(d, byId)));
    if (days.length >= 2) shapes.push(days);
  }
  if (!shapes.length) return null;

  // התכנית הארוכה ביותר היא העדות הטובה ביותר לחלוקה
  const days = shapes.sort((a, b) => b.length - a.length)[0];
  const regions = days.map((d) => d.region).filter(Boolean);
  const roles = days.map((d) => d.role).filter(Boolean);
  if (!regions.length) return null;

  const all = (arr, v) => arr.length && arr.every((x) => x === v);
  const has = (v) => roles.includes(v);

  if (all(regions, 'full')) {
    return { split: 'full_body', reason: `כל ${days.length} האימונים בתכנית משלבים פלג גוף עליון ותחתון.` };
  }
  if (has('push') && has('pull') && has('legs')) {
    return { split: 'push_pull_legs', reason: 'האימונים מחולקים לדחיפה, משיכה ורגליים.' };
  }
  if (regions.includes('upper') && regions.includes('lower') && !regions.includes('full')) {
    return { split: 'upper_lower', reason: 'האימונים מתחלקים בין פלג גוף עליון לתחתון.' };
  }
  if (days.length >= 4 && regions.filter((r) => r !== 'full').length >= 3) {
    return { split: 'bro_split', reason: `תכנית של ${days.length} ימים, כל יום מוקדש לקבוצת שרירים.` };
  }
  return null;
}

/** טווח החזרות שנרשם בפועל — ממוצע על פני כל התכניות. */
function repsFromPrograms(programs) {
  const reps = [];
  for (const program of programs) {
    for (const day of program.days || []) {
      for (const block of day.blocks || []) {
        const min = block.prescription?.repsMin;
        const max = block.prescription?.repsMax;
        if (Number.isFinite(min) && Number.isFinite(max)) reps.push((min + max) / 2);
        else if (Number.isFinite(min)) reps.push(min);
      }
    }
  }
  if (!reps.length) return null;
  return reps.reduce((a, b) => a + b, 0) / reps.length;
}

/**
 * סגנון האימון שהמתאמן כבר מתאמן בו.
 *
 * המטרה עונה על "בשביל מה", והסגנון על "איך" — וה"איך" כתוב בגיליון
 * במפורש: חמישה סטים של שלוש חזרות במוט הם אימון כוח; שנים-עשר חזרות
 * במכונות עם הרבה בידוד הם פיתוח גוף. מוחזרים עד שני סגנונות, כי מאמן
 * שרושם גם וגם באמת עושה שילוב.
 */
function stylesFromTraining(performed, programs) {
  const exercises = performed.map((p) => p.ex);
  if (exercises.length < 4) return null;

  const share = (fn) => exercises.filter(fn).length / exercises.length;
  const isolation = share((e) => e.type === 'isolation' || ISOLATION_PATTERNS.has(e.pattern));
  const conditioning = share((e) => e.type === 'conditioning' || e.pattern === 'conditioning');
  const mobility = share((e) => e.type === 'mobility' || e.pattern === 'mobility');
  const machine = share((e) => (e.eq || []).flat().some((i) => MACHINE_ITEMS.has(i)));
  const free = share((e) => (e.eq || []).flat().some((i) => FREE_ITEMS.has(i)));
  const avgReps = repsFromPrograms(programs);

  const picked = [];
  const reasons = [];
  const add = (key, why) => { if (!picked.includes(key) && picked.length < 2) { picked.push(key); reasons.push(why); } };

  if (avgReps !== null && avgReps <= 6 && free >= 0.4) {
    add('strength', `טווח החזרות בתכניות נמוך (ממוצע ${avgReps.toFixed(1)}) ורוב התרגילים במשקל חופשי.`);
  }
  if (isolation >= 0.3 || (machine >= 0.4 && avgReps !== null && avgReps >= 8)) {
    add('bodybuilding', `${Math.round(isolation * 100)}% מהתרגילים הם תרגילי בידוד`
      + `${machine >= 0.4 ? ` ו-${Math.round(machine * 100)}% במכונות` : ''}.`);
  }
  if (conditioning >= 0.2) {
    add('conditioning', `${Math.round(conditioning * 100)}% מהתרגילים הם עבודת מאמץ אירובי.`);
  }
  if (mobility >= 0.25) {
    add('mobility', `${Math.round(mobility * 100)}% מהתרגילים הם ניידות.`);
  }
  if (!picked.length && avgReps !== null && avgReps >= 8 && avgReps <= 15) {
    add('bodybuilding', `טווח החזרות בתכניות הוא ${avgReps.toFixed(1)} בממוצע — טווח בניית שריר.`);
  }
  if (!picked.length) return null;
  return { styles: picked, reasons };
}

/**
 * ימי השבוע שנרשמו בתכנית — "יום א'" בשם היום הוא מידע ולא קישוט.
 *
 * הזיהוי עובד על מילים שלמות ולא על ביטוי רגולרי עם גבול-מילה: ב-JavaScript
 * אות עברית נחשבת תו שאינו מילה, ולכן \b ו-\W אינם גבול בעברית כלל — הג'
 * שבתוך "רגליים" היה נקרא כ"יום ג׳".
 */
const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const WEEKDAY_NAMES = [
  ['ראשון', 'sunday', 'sun'],
  ['שני', 'monday', 'mon'],
  ['שלישי', 'tuesday', 'tue'],
  ['רביעי', 'wednesday', 'wed'],
  ['חמישי', 'thursday', 'thu'],
  ['שישי', 'friday', 'fri'],
  ['שבת', 'saturday', 'sat'],
];

function weekdayFromLabel(label) {
  // פיצול למילים: כל מה שאינו אות עברית או לטינית הוא מפריד
  // רק אותיות עצמן: גרש וגרשיים עבריים יושבים בתוך הטווח העברי, ובלי
  // הוצאתם "א׳" היה נשאר מילה אחת שאינה שווה ל"א"
  const words = String(label).toLowerCase().split(/[^\u05D0-\u05EAa-z]+/).filter(Boolean);
  for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
    if (words.some((w) => WEEKDAY_NAMES[i].includes(w))) return i;
  }
  // "יום א" — אות בודדת, ורק כשהמילה שלפניה היא "יום"
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] !== 'יום') continue;
    const n = WEEKDAY_LETTERS.indexOf(words[i + 1]);
    if (n >= 0) return n;
  }
  return null;
}

function weekdaysFromPrograms(programs) {
  const days = new Set();
  for (const program of programs) {
    for (const day of program.days || []) {
      const index = weekdayFromLabel(day.dayLabel || day.label || '');
      if (index !== null) days.add(index);
    }
  }
  return days.size ? [...days].sort((a, b) => a - b) : null;
}

/** התאריך האחרון שיש עליו עדות כלשהי. */
function lastSeenFrom(programs, logs) {
  let last = null;
  const seen = (d) => { if (d && (!last || d > last)) last = d; };
  for (const entry of logs) seen(entry.date);
  for (const program of programs) {
    for (const day of program.days || []) for (const block of day.blocks || []) seen(block.date);
  }
  return last;
}

/** השרירים שקיבלו הכי הרבה תשומת לב — הבסיס לדגש בתכנית הבאה. */
function emphasisFrom(performed) {
  const count = {};
  for (const p of performed) {
    for (const m of p.ex.primary || []) count[m] = (count[m] || 0) + (p.count || 1);
  }
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  if (total < 6) return [];
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, n]) => n / total >= 0.12)
    .map(([m]) => m);
}

/**
 * כל מה שהתכניות מלמדות על המתאמן, מעבר לרמה.
 *
 * מופרד מ-inferTraineeProfile כדי שאפשר יהיה לקרוא לו גם על מתאמן קיים
 * שמייבאים לו תכניות חדשות, בלי לגעת ברמה שהמאמן קבע ידנית.
 */
export function inferTrainingPreferences(trainee, { programs = [], logs = [], byId = BY_ID, today = null } = {}) {
  const performed = collectPerformed(trainee, { programs, logs, byId });
  const split = splitFromPrograms(programs, byId);
  const styles = stylesFromTraining(performed, programs);
  const weekdays = weekdaysFromPrograms(programs);
  const lastSeen = lastSeenFrom(programs, logs);

  /*
   * פעיל או לא: מי שלא נרשם לו דבר כבר חודשים אינו מתאמן פעיל, ותכנית
   * שתופק לו בלחיצת "כל הפעילים" היא בזבוז. הסף רחב בכוונה — גיליון
   * מתעדכן בעצלתיים, וסימון שגוי של מתאמן פעיל כלא-פעיל גרוע יותר.
   */
  let active = null;
  let inactiveReason = '';
  if (lastSeen) {
    const now = today ? new Date(today) : new Date();
    const days = Math.round((now - new Date(lastSeen)) / 86400000);
    if (days > 120) {
      active = false;
      inactiveReason = `הרישום האחרון בגיליון הוא מ-${lastSeen} (לפני ${Math.round(days / 30)} חודשים).`;
    } else if (days >= 0) {
      active = true;
    }
  }

  return {
    preferredSplit: split?.split || null,
    splitReason: split?.reason || '',
    trainingStyles: styles?.styles || [],
    styleReasons: styles?.reasons || [],
    weekdays,
    emphasis: emphasisFrom(performed),
    lastSeen,
    active,
    inactiveReason,
  };
}
