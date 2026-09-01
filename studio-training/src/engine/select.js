/**
 * בחירת התרגיל לכל משבצת.
 *
 * הבחירה היא ניקוד רב-משתני: התאמה לדפוס ולשריר, התאמה למטרה ולרמה,
 * חוב נפח שבועי, נדירות ציוד, גיוון מול שבוע קודם, העדפות המתאמן, ומגבלות.
 * הכול דטרמיניסטי לפי seed — אותה קלט תמיד מייצרת את אותה תכנית.
 */

import { FATIGUE_COST, mergeTrainingStyles, SPORTS } from '../domain/taxonomy.js';
import { fitsLevel, levelForPattern, levelIndex, trainingValue, valueFloor } from '../domain/level.js';

/** מחולל אקראיות דטרמיניסטי (mulberry32) — מאפשר גיוון יציב וניתן לשחזור. */
export function makeRng(seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i++) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** תגיות שכל מטרה "אוהבת". */
/**
 * תגיות שמושכות לכיוון ההפוך מהמטרה.
 *
 * עד עכשיו היו רק בונוסים, ולכן תרגיל פילאטיס בתכנית היפרטרופיה קיבל
 * אפס — לא בונוס אך גם לא קנס — ובמשבצת דלילה הוא ניצח. מטרה היא גם
 * מה שלא עושים, ולכן יש כאן גם מחיר.
 */
const GOAL_TAG_PENALTY = {
  hypertrophy: { pilates: 6, active_aging: 6, rehab_friendly: 3, regression: 4, beginner_friendly: 2 },
  strength: { pilates: 7, active_aging: 6, rehab_friendly: 3, regression: 5, beginner_friendly: 2, isometric: 2 },
  power: { pilates: 7, active_aging: 6, rehab_friendly: 3, regression: 5, low_impact: 3 },
  athletic_performance: { pilates: 5, active_aging: 5, regression: 4 },
  fat_loss: { pilates: 2, active_aging: 2 },
  // שיקום, גיל שלישי, יציבה וניידות: אין קנס — שם אלה בדיוק הכלים הנכונים
};

const GOAL_TAG_BONUS = {
  fat_loss: { conditioning: 3, functional: 2, low_impact: 1 },
  endurance: { conditioning: 3, low_impact: 1 },
  posture: { posture: 4, shoulder_health: 3, back_friendly: 2, rehab_friendly: 2 },
  rehab: { rehab_friendly: 5, joint_friendly: 3, beginner_friendly: 2 },
  strength: {},
  hypertrophy: {},
  power: { power: 4 },
  general_fitness: { functional: 2, beginner_friendly: 1 },
  mobility: { mobility: 4, warmup: 2, cooldown: 2, rehab_friendly: 2 },
  bone_density: { bone_loading: 5, functional: 1 },
  active_aging: { active_aging: 5, balance_training: 4, functional: 3, beginner_friendly: 2, joint_friendly: 2 },
  athletic_performance: { power: 3, functional: 2 },
  stress_relief: { stress_relief: 5, conditioning: 2, low_impact: 1 },
};

/** מדד מסת גוף, כשיש נתוני גובה ומשקל. */
function bmiOf(trainee) {
  if (!trainee.heightCm || !trainee.weightKg) return null;
  return trainee.weightKg / ((trainee.heightCm / 100) ** 2);
}

/** העדפת סוג ציוד לפי מטרה ורמה. */
function equipmentAffinity(ex, trainee, studio) {
  let s = 0;
  const items = new Set(ex.eq.flat());
  const isMachine = [...items].some((i) => i.endsWith('_machine') || ['leg_press', 'lat_pulldown', 'pec_deck', 'hack_squat', 'leg_extension', 'leg_curl_lying', 'leg_curl_seated'].includes(i));
  const isFree = items.has('barbell') || items.has('dumbbell') || items.has('kettlebell');

  if (trainee.level === 'beginner') { if (isMachine) s += 3; if (ex.skill >= 4) s -= 4; }
  if (trainee.level === 'advanced' && isFree) s += 2;
  if (trainee.primaryGoal === 'strength' && items.has('barbell')) s += 4;
  if (trainee.primaryGoal === 'rehab' && isMachine) s += 2;
  if (studio.style === 'functional' && isFree) s += 2;
  if (studio.style === 'gym' && (isMachine || isFree)) s += 2;
  if (studio.style === 'small_group' && ex.setupSeconds <= 20) s += 1;

  // התנגדות מדידה ומתקדמת: בלי משקל שניתן להעלות אין פרוגרסיה אמיתית.
  // גומייה או משקל גוף מצוינים כשאין ברירה — אך לא כשיש מוט, משקולת או מכונה.
  const progressiveGoal = ['hypertrophy', 'strength', 'power'].includes(trainee.primaryGoal);
  if (!ex.loadable) s -= progressiveGoal ? 5 : 2;
  else if (isMachine || isFree) s += 2;
  return s;
}

/**
 * ניקוד מועמד למשבצת.
 * @param {object} cand   מתוך buildCandidatePool
 * @param {object} slot
 * @param {object} ctx    { trainee, studio, volume, usedThisWeek, usedToday, prescribed, rng, dayFatigue, fatigueBudget }
 */
export function scoreCandidate(cand, slot, ctx) {
  const ex = cand.exercise;
  const { trainee, studio, volume, usedThisWeek, usedToday, prescribed } = ctx;
  const detail = {};
  let score = 0;

  // 1. התאמת דפוס — תנאי סף רך; דפוס לא מתאים מקבל ציון שלילי חזק.
  if (!slot.patterns.includes(ex.pattern)) return { score: -Infinity, detail: { pattern: 'לא תואם' } };
  detail.pattern = 10;
  score += 10;

  // 2. התאמת סוג (מורכב/בידוד)
  if (slot.type && ex.type !== slot.type) {
    if (slot.type === 'compound' && ex.type === 'isolation') { score -= 8; detail.type = -8; }
    else if (slot.type === 'isolation' && ex.type === 'compound') { score -= 4; detail.type = -4; }
  } else if (slot.type) { score += 3; detail.type = 3; }

  // 2ב. התאמת תפקיד המשבצת: חימום פותח את האימון, שחרור סוגר אותו.
  //     בלי זה תרגיל נשימות לסיום עלול לנחות דווקא בפתיחה.
  if (slot.role === 'warmup') {
    if (ex.tags.includes('warmup')) { score += 5; detail.slotRole = 5; }
    if (ex.tags.includes('cooldown') && !ex.tags.includes('warmup')) { score -= 8; detail.slotRole = -8; }
  } else if (slot.role === 'cooldown') {
    if (ex.tags.includes('cooldown')) { score += 5; detail.slotRole = 5; }
    if (ex.tags.includes('warmup') && !ex.tags.includes('cooldown')) { score -= 4; detail.slotRole = -4; }
  }

  // 2ג. רצפת דרישה: תרגיל עיקרי חייב לספק גירוי שתואם את רמת המתאמן.
  //     בלי זה מתאמן מתקדם עלול לקבל גרסה מוקלת רק משום שהיא בטוחה יותר.
  const isKeySlot = slot.role === 'main' || slot.role === 'secondary';

  /*
   * רצפת ערך אימוני.
   *
   * זה השינוי המרכזי מול הגרסה הקודמת: הרצפה חלה על *כל* תפקיד עבודה,
   * ולא רק על התרגילים העיקריים. קודם לכן מתאמן מתקדם קיבל פלאנק
   * ותרגילי פילאטיס במשבצות הליבה והעזר, כי שם לא נבדק כלום.
   *
   * בנוסף הרמה שנבדקת היא הרמה המיושבת (הצהרה + ותק + כוח מוכח)
   * ולא ההצהרה בלבד, והיא נבדקת לפי הדפוס — אדם יכול להיות מתקדם
   * בסקוואט ומתחיל מעל הראש.
   */
  if (ex.type !== 'mobility' && slot.role !== 'warmup' && slot.role !== 'cooldown') {
    const lvl = ctx.resolvedLevel
      ? levelForPattern(ctx.resolvedLevel, ex.pattern)
      : levelIndex(trainee.level);
    const fit = fitsLevel(ex, lvl, slot.role);
    if (fit.hard) {
      // פסילה מבנית: תרגיל בידוד במשבצת עיקרית. זו אינה שאלה של ניקוד
      // אלא של תפקיד, ולכן הקנס בסדר גודל של אי-התאמת דפוס.
      score -= 80; detail.wrongRole = -80;
    } else if (!fit.ok) {
      /*
       * ככל שהפער גדול יותר כך הפסילה חדה יותר. תרגיל שאיבד את כל ערכו
       * למתאמן הזה (פלאנק למי שמתאמן שבע שנים) מקבל קנס בסדר גודל של
       * פסילה מבנית — אחרת הוא עדיין מנצח כשהמשבצת דלילה, וזו בדיוק
       * הדרך שבה תרגילים קלים מדי חזרו לתכניות של מתקדמים.
       */
      const gap = fit.floor - fit.value;
      const penalty = fit.value <= 0.05 ? 80 : Math.round(20 + 130 * gap);
      score -= penalty; detail.belowLevel = -penalty;
    } else if (fit.value >= fit.floor + 0.15) {
      score += 4; detail.levelFit = 4;
    }
  }

  // 2ג2. תרגיל שהמשקולות בסטודיו כבר קלות מדי עבור המתאמן הזה
  if (isKeySlot && cand.ceilingLimited) { score -= 9; detail.atCeiling = -9; }

  // 2ד. מפרק שהמאמן ביקש להיזהר בו (מתוך הערה פעילה)
  for (const [joint, level] of Object.entries(trainee.watchJoints || {})) {
    const load = ex.stress[joint] ?? 0;
    if (load >= 2) { score -= 10 * level; detail.watchJoint = -10 * level; }
    else if (load === 1) { score -= 3 * level; detail.watchJoint = -3 * level; }
  }

  // 2ה. דפוס שהמאמן ביקש להימנע ממנו
  if ((trainee.avoidPatterns || []).includes(ex.pattern)) return { score: -Infinity, detail: { avoided: 'הערת מאמן' } };

  // 3. שריר מטרה של המשבצת
  if (slot.muscles) {
    const hit = slot.muscles.some((m) => ex.primary.includes(m));
    score += hit ? 6 : -6;
    detail.slotMuscle = hit ? 6 : -6;
  }

  // 4. חוב נפח שבועי — תרגיל ששריריו מפגרים אחרי היעד מקבל דחיפה.
  let debt = 0;
  for (const m of ex.primary) debt += Math.max(0, (volume.target.min - (volume.sets[m] || 0))) / Math.max(1, volume.target.min);
  const debtScore = +(debt * 6).toFixed(2);
  score += debtScore; detail.volumeDebt = debtScore;

  // 4ב. עודף נפח — שריר שכבר עבר את התקרה השבועית לא צריך עוד סטים.
  let surplus = 0;
  for (const m of ex.primary) surplus += Math.max(0, ((volume.sets[m] || 0) - volume.target.max)) / Math.max(1, volume.target.max);
  const surplusScore = +(surplus * 14).toFixed(2);
  if (surplusScore) { score -= surplusScore; detail.volumeSurplus = -surplusScore; }

  // 5. שרירי מיקוד שהמתאמן ביקש
  const focusHit = ex.primary.filter((m) => trainee.focusMuscles.includes(m)).length;
  if (focusHit) { score += 4 * focusHit; detail.focus = 4 * focusHit; }

  // 6. התאמת מטרה לפי תגיות
  const tagPenalty = GOAL_TAG_PENALTY[trainee.primaryGoal] || {};
  let tagCost = 0;
  for (const t of ex.tags || []) tagCost += tagPenalty[t] || 0;
  if (tagCost) { score -= tagCost; detail.offGoal = -tagCost; }

  const tagBonus = GOAL_TAG_BONUS[trainee.primaryGoal] || {};
  let tagScore = 0;
  for (const t of ex.tags) tagScore += tagBonus[t] || 0;
  score += tagScore; detail.goalTags = tagScore;

  /*
   * 6ב. סגנון האימון שנבחר למתאמן.
   *
   * המטרה קובעת לאן הולכים; הסגנון קובע איך. שני מתאמנים עם אותה מטרה
   * ואותה רמה יקבלו תרגילים אחרים אם אחד מתאמן אתלטיקה והשני פיתוח גוף.
   */
  const style = ctx.style !== undefined ? ctx.style : mergeTrainingStyles(trainee.trainingStyles);
  if (style) {
    let styleScore = 0;
    for (const t of ex.tags) styleScore += style.tagBonus[t] || 0;
    // בידוד: פיתוח גוף מחפש אותו, כוח ואתלטיות מעדיפים תרגילים מורכבים
    if (ex.type === 'isolation') styleScore += style.isolation;
    if (ex.type === 'compound') styleScore += Math.max(0, -style.isolation) / 2;
    if (style.equipment !== 'any') {
      const items = new Set(ex.eq.flat());
      const machine = [...items].some((i) => i.endsWith('_machine') || i === 'leg_press' || i === 'lat_pulldown' || i === 'cable_machine');
      const free = items.has('barbell') || items.has('dumbbell') || items.has('kettlebell');
      if (style.equipment === 'free' && free) styleScore += 3;
      if (style.equipment === 'machine' && machine) styleScore += 3;
    }
    if (styleScore) { score += styleScore; detail.trainingStyle = +styleScore.toFixed(2); }
  }

  // 7. התאמת ציוד לרמה/למטרה/לסגנון הסטודיו
  const eqAff = equipmentAffinity(ex, trainee, studio);
  score += eqAff; detail.equipmentAffinity = eqAff;

  // 8. מגבלות רפואיות — קנס רך (הפסילות כבר סוננו קודם)
  score -= cand.constraintPenalty; detail.constraintPenalty = -cand.constraintPenalty;

  // 9. תרגילים שהמגבלה ממליצה לשלב
  if (prescribed.has(ex.id)) { score += 7; detail.prescribed = 7; }

  // 10. נדירות ציוד — בסטודיו עמוס לא בונים תכנית סביב מכונה יחידה
  const scarcityPenalty = +(cand.scarcity * (studio.concurrentTrainees > 1 ? 3 : 0.5)).toFixed(2);
  score -= scarcityPenalty; detail.scarcity = -scarcityPenalty;

  // 11. גיוון: אותו תרגיל פעמיים באותו יום — פסול. פעמיים בשבוע — תלוי בהעדפה.
  if (usedToday.has(ex.id)) return { score: -Infinity, detail: { duplicate: 'כבר באימון הזה' } };
  /*
   * גם תרגיל אחר יכול להיות אותו תרגיל: רומנית במוט ורומנית עם משקולות
   * הן אותו דפוס ואותם שרירים, ואימון שמכיל את שתיהן נראה למאמן כמו
   * טעות. חסימה מלאה הייתה מקצינה — יש ימים שבהם וריאציה שנייה מוצדקת —
   * ולכן זהו קנס כבד: הן ייבחרו רק כשאין באמת חלופה.
   */
  const shape = `${ex.pattern}|${[...ex.primary].sort().join('+')}`;
  if (ctx.usedTodayShapes?.has(shape)) { score -= 25; detail.sameMovement = -25; }
  const weekUses = usedThisWeek.get(ex.id) || 0;
  if (weekUses > 0) {
    const varietyPenalty = { low: 0, balanced: 4, high: 9 }[trainee.varietyPreference] ?? 4;
    score -= varietyPenalty * weekUses; detail.repeat = -varietyPenalty * weekUses;
  }

  // 12. תרגילים שהמתאמן אוהב
  if (trainee.likes.includes(ex.id)) { score += 5; detail.liked = 5; }

  // 13. תקציב עייפות יומי — לא שלושה תרגילים "יקרים" ברצף
  const cost = FATIGUE_COST[ex.fatigue] || 2;
  if (ctx.dayFatigue + cost > ctx.fatigueBudget) { score -= 12; detail.fatigue = -12; }

  // 14. היסטוריה: תרגיל שכבר יש לו משקלי עבודה מוכרים קל יותר לתפעל
  if (trainee.history[ex.id]) { score += 2; detail.known = 2; }

  // 15. ספורט מחוץ לסטודיו: עבודת מניעה לענף מקבלת עדיפות,
  //     ורגליים מקבלות פחות כשהמתאמן ממילא רץ או רוכב שלוש פעמים בשבוע.
  const sport = SPORTS[trainee.sport];
  if (sport && trainee.sport !== 'none') {
    if (sport.prehab.includes(ex.pattern)) { score += 3; detail.sportPrehab = 3; }
    const legPattern = ['squat', 'lunge', 'hinge'].includes(ex.pattern);
    if (sport.legLoad === 'high' && legPattern && trainee.externalSessions >= 3) {
      score -= 3; detail.sportLegLoad = -3;
    }
    if (sport.impact && ex.flags.includes('impact')) { score -= 3; detail.sportImpact = -3; }
  }

  // 16. אי-סימטריה: כשיש פציעה בצד אחד, עבודה חד-צדדית מאפשרת לעבוד
  //     סביב הפער במקום להסתיר אותו מאחורי הצד החזק.
  if (ex.unilateral && trainee.constraints.some((c) => c.side)) { score += 4; detail.asymmetry = 4; }

  // 17. משקל גוף גבוה: העדפה לעמדות נתמכות ולתרגילים ללא זעזוע ובלי ירידה לרצפה.
  const bmi = bmiOf(trainee);
  if (bmi && bmi >= 35) {
    let bm = 0;
    for (const t of ['low_impact', 'joint_friendly', 'beginner_friendly']) if (ex.tags.includes(t)) bm += 3;
    if (ex.flags.includes('floor_transition')) bm -= 3;
    if (ex.flags.includes('impact')) bm -= 5;
    if (bm) { score += bm; detail.bodyMass = bm; }
  }

  // 18. אורח חיים יושבני: עבודת גב עליון ופתיחת ירך שוות יותר.
  if (trainee.lifestyle === 'sedentary') {
    if (ex.tags.includes('posture')) { score += 2; detail.lifestyle = 2; }
  }

  // 19. רעש דטרמיניסטי קטן לשבירת שוויון ולגיוון בין שבועות
  const noise = ctx.rng() * 1.5;
  score += noise; detail.noise = +noise.toFixed(2);

  return { score: +score.toFixed(2), detail };
}

/** בוחר את המועמד הטוב ביותר למשבצת. */
export function pickForSlot(pool, slot, ctx) {
  let best = null;
  for (const cand of pool) {
    const { score, detail } = scoreCandidate(cand, slot, ctx);
    if (score === -Infinity) continue;
    if (!best || score > best.score) best = { cand, score, detail };
  }
  return best;
}

/** מחזיר עד N חלופות לתרגיל שנבחר — למאמן שרוצה להחליף בשטח. */
export function alternativesFor(pool, slot, ctx, chosenId, n = 3) {
  const scored = [];
  for (const cand of pool) {
    if (cand.exercise.id === chosenId) continue;
    const { score } = scoreCandidate(cand, slot, { ...ctx, rng: () => 0 });
    if (score === -Infinity) continue;
    scored.push({ cand, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((s) => ({
    id: s.cand.exercise.id,
    name: s.cand.exercise.name,
    score: s.score,
    equipment: s.cand.equipmentOption,
    why: s.cand.bonuses.length ? s.cand.bonuses.join(', ') : 'חלופה תואמת דפוס וציוד',
  }));
}
