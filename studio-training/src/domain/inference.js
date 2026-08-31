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
import { LEVEL_LABELS } from './labels.js';

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
 * מאמן שרשם שמונה תרגילים של ארבעה סטים לא התכוון לאימון של 30 דקות.
 * ההערכה גסה — סט עבודה ומנוחה הם כדקה וחצי בממוצע — אבל היא קרובה
 * הרבה יותר מברירת המחדל, ואורך האימון קובע כמה תרגילים בכלל נכנסים.
 */
function minutesFromPrograms(programs) {
  const perDay = [];
  for (const program of programs) {
    for (const day of program.days || []) {
      const blocks = day.blocks || [];
      if (blocks.length < 3) continue;
      const sets = blocks.reduce((n, b) => n + (b.prescription?.sets || 3), 0);
      // סט + מנוחה ≈ 90 שניות, ועוד חימום קצר בתחילת האימון
      perDay.push(Math.round((sets * 1.5) + 8));
    }
  }
  if (!perDay.length) return null;
  const sorted = perDay.sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.max(20, Math.min(120, Math.round(median / 5) * 5));
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
