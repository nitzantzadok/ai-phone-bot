/**
 * המנוע המרכזי: מקבל מתאמן + סטודיו, ומחזיר תכנית אימונים שבועית מלאה.
 */

import { EXERCISES, BY_ID, getExercise } from '../domain/exercises.js';
import { DAY_LABEL } from '../domain/models.js';
import { MUSCLES } from '../domain/taxonomy.js';
import {
  buildCandidatePool, constraintNotes, prescribedExerciseIds,
} from './filters.js';
import {
  ageAdjustments, externalLoadFactor, isDeloadWeek, prescribe, recoveryScore, suggestLoad,
  volumeMultiplier, weekProgression, weeklyVolumeTargets, GOAL_PROFILES,
} from './prescription.js';
import { DAY_ARCHETYPES, augmentSlots, chooseSplit, fillerSlot, relaxSlot, scheduleDays, segmentSlots } from './split.js';
import { isDefaultStructure, normalizeStructure, structurePlan } from '../domain/structure.js';
import { LEVEL_ORDER, resolveLevel } from '../domain/level.js';
import { LIFESTYLES, MUSCLE_ROLE, SPORTS } from '../domain/taxonomy.js';

/**
 * סדר מילוי כשאין מספיק זמן לכל המשבצות: קודם מה שקובע את איכות האימון.
 * זה מה שמאמן עושה כשנשארו 20 דקות — סקוואט וחתירה, לא כפיפת מרפקים.
 */
const ROLE_FILL_PRIORITY = { main: 0, secondary: 1, prehab: 2, core: 3, accessory: 4, conditioning: 5, warmup: 6, cooldown: 7 };

/** סדר הביצוע בפועל שבו האימון מוצג למאמן. */
const ROLE_DISPLAY_ORDER = ['warmup', 'prehab', 'main', 'secondary', 'accessory', 'core', 'conditioning', 'cooldown'];
import { coachLoad } from '../domain/models.js';
import { alternativesFor, makeRng, pickForSlot } from './select.js';
import { runQualityChecks } from './validate.js';
import { buildProbes } from './probe.js';
import { planLoad } from './loads.js';
import { applyNotes } from '../domain/notes.js';
import { FATIGUE_COST } from '../domain/taxonomy.js';

/** כמה "עייפות" יום אחד יכול לספוג. */
function fatigueBudget(trainee) {
  const base = { beginner: 7, novice: 9, intermediate: 11, advanced: 13 }[trainee.level] ?? 9;
  return Math.round(base * volumeMultiplier(trainee) + trainee.sessionMinutes / 20);
}

/** אומדן זמן לתרגיל בדקות. */
function estimateMinutes(ex, rx) {
  const perRepSec = rx.unit === 'seconds' ? 1 : 3.5;
  const workSec = rx.sets * ((rx.repsMin + rx.repsMax) / 2) * perRepSec;
  const restSec = rx.sets * rx.restSec;
  return +((workSec + restSec + ex.setupSeconds) / 60).toFixed(1);
}

/** פקדי משוב שהמאמן רואה ליד כל תרגיל במסך האימון. */
function controlsFor(ex) {
  return [
    { action: 'log_set', label: 'רישום סט (משקל/חזרות/RPE)', fields: ['load', 'reps', 'rpe'] },
    { action: 'too_easy', label: 'קל מדי' },
    { action: 'too_hard', label: 'קשה מדי' },
    { action: 'pain', label: 'כאב בתרגיל', fields: ['joint', 'painLevel'] },
    { action: 'form_breakdown', label: 'טכניקה מתפרקת' },
    { action: 'equipment_busy', label: 'המכשיר תפוס' },
    { action: 'swap', label: 'החלפת תרגיל', fields: ['alternativeId'] },
    { action: 'skip', label: 'דילוג' },
    { action: 'love_it', label: 'תרגיל מוצלח' },
  ];
}

/** סטי הכנה מתגברים לפני התרגיל הכבד הראשון של האימון. */
function rampUpSets(ex, rx, trainee) {
  if (ex.type !== 'compound' || !ex.loadable) return null;
  if (rx.intensityPct[1] < 70) return null;
  const steps = trainee.level === 'beginner' ? 1 : rx.intensityPct[1] >= 85 ? 3 : 2;
  return {
    steps,
    text: steps === 1
      ? 'סט הכנה אחד במשקל קל לפני סטי העבודה.'
      : `${steps} סטי הכנה מתגברים (כ-50%, 70%${steps === 3 ? ', 85%' : ''} ממשקל העבודה) לפני הסט הראשון.`,
  };
}

/** הערות אימון קצרות למאמן. */
function coachingNotes(ex, cand, trainee) {
  const notes = [];
  if (ex.cues.length) notes.push(...ex.cues);
  if (cand.constraintNotes.length) notes.push(...cand.constraintNotes.slice(0, 2));
  if (ex.unilateral) {
    const injured = trainee.constraints.find((c) => c.side)?.side;
    const sideLabel = { right: 'ימין', left: 'שמאל' }[injured];
    notes.push(sideLabel
      ? `לבצע לכל צד. להתחיל בצד ${sideLabel} (הצד המוגבל) ולהתאים אליו את מספר החזרות בצד השני.`
      : 'לבצע את מספר החזרות לכל צד; להתחיל בצד החלש ולהשוות אליו.');
  }
  if (trainee.level === 'beginner' && ex.skill >= 3) notes.push('סט ראשון קל ללימוד התנועה לפני הוספת משקל.');
  if (trainee.history[ex.id]) {
    const h = trainee.history[ex.id];
    notes.push(`משקל עבודה אחרון: ${h.load ?? '—'} ${trainee.units} × ${h.reps ?? '—'} חזרות.`);
  }
  return [...new Set(notes)];
}

/**
 * דחיסת אימון לתוך הזמן שהוקצה.
 * סדר הוויתורים הוא סדר הוויתורים של מאמן: קודם מורידים סטים מהתרגיל
 * היקר ביותר, ורק אם עדיין לא נכנס — מקצרים מנוחות (עד 30%) ומציינים זאת.
 * @returns {string|null} הערה למאמן אם בוצעה דחיסה חריגה
 */
function compressDay(day, plannedMinutes) {
  const total = () => +day.blocks.reduce((s, b) => s + b.estimatedMinutes, 0).toFixed(1);
  const limit = plannedMinutes * 1.05;
  if (total() <= limit) { day.estimatedMinutes = total(); return null; }

  /*
   * 1. הורדת סטים — אבל לא מתחת לרצפה שבה התרגיל מפסיק לעשות משהו.
   *
   * סט בודד בתרגיל עיקרי אינו גירוי אימון, הוא שורה בטבלה. מאמן שנלחץ
   * בזמן מוותר על התרגיל השולי ומשאיר את העיקרי שלם — ולא מקצץ את כולם
   * לסט אחד עד שהאימון כולו חסר משמעות. הרצפה מגנה על העיקרי, והוויתור
   * על השוליים קורה בשלב 3.
   */
  const setFloor = (b) => (b.role === 'main' || b.role === 'secondary' ? 3 : 2);
  let guard = 40;
  while (total() > limit && guard-- > 0) {
    const candidates = day.blocks.filter((b) => b.prescription.sets > setFloor(b) && b.role !== 'warmup');
    if (!candidates.length) break;
    const worst = candidates.sort((a, b) => b.estimatedMinutes - a.estimatedMinutes)[0];
    worst.prescription.sets -= 1;
    worst.estimatedMinutes = estimateMinutes(getExercise(worst.exercise.id), worst.prescription);
  }

  // 2. קיצור מנוחות כמוצא אחרון
  let note = null;
  if (total() > limit) {
    for (const b of day.blocks) {
      if (b.prescription.restSec <= 45) continue;
      b.prescription.restSec = Math.max(45, Math.round(b.prescription.restSec * 0.7));
      b.estimatedMinutes = estimateMinutes(getExercise(b.exercise.id), b.prescription);
    }
    note = 'המנוחות קוצרו כדי להתאים את האימון לזמן שהוקצה — אם המטרה היא כוח, עדיף להאריך את האימון על פני קיצור המנוחות.';
  }

  /*
   * 3. ויתור על תרגילים שוליים — מהשולי ביותר כלפי מעלה. שלושה תרגילים
   * שנעשים כמו שצריך שווים יותר משישה שנחתכו עד שאין בהם כלום.
   */
  guard = 10;
  while (total() > limit && day.blocks.length > 3 && guard-- > 0) {
    // 'secondary' נמצא ברשימה בכוונה: עדיף אימון כוח של שני תרגילים
    // עיקריים שלמים על פני ארבעה תרגילים שקוצצו לסט אחד כל אחד
    const order = ['cooldown', 'conditioning', 'accessory', 'core', 'secondary'];
    let at = -1;
    for (const role of order) { at = day.blocks.map((b) => b.role).lastIndexOf(role); if (at >= 0) break; }
    if (at < 0) break;
    day.blocks.splice(at, 1);
  }

  /*
   * 4. רק כשלא נשאר ממה לוותר — יורדים אל מתחת לרצפה. זה קורה כשהאימון
   * שהוקצב קצר מכדי להכיל אפילו את הבסיס, והמאמן צריך לדעת את זה.
   */
  guard = 20;
  while (total() > limit && guard-- > 0) {
    const candidates = day.blocks.filter((b) => b.prescription.sets > 1 && b.role !== 'warmup');
    if (!candidates.length) break;
    const worst = candidates.sort((a, b) => b.estimatedMinutes - a.estimatedMinutes)[0];
    worst.prescription.sets -= 1;
    worst.estimatedMinutes = estimateMinutes(getExercise(worst.exercise.id), worst.prescription);
    note = 'האימון קצר מכדי להכיל את התרגילים שנבחרו — מספר הסטים ירד מתחת למומלץ. '
      + 'הארכת האימון או הורדת מספר ימי האימון בשבוע יחזירו נפח אמיתי.';
  }

  day.estimatedMinutes = total();
  return note;
}

/** קיבוץ לסופרסטים כשמתאים למטרה ולסטודיו. */
function applySupersets(blocks, trainee, studio) {
  const profile = GOAL_PROFILES[trainee.primaryGoal] || GOAL_PROFILES.general_fitness;
  const wantsSuperset = studio.allowSupersets && profile.setTypes.some((t) => ['superset', 'circuit'].includes(t));
  if (!wantsSuperset) return blocks;
  if (studio.concurrentTrainees > 4) return blocks; // אולם עמוס — תופס יותר מדי עמדות

  const accessory = blocks.filter((b) => b.role === 'accessory');
  for (let i = 0; i + 1 < accessory.length; i += 2) {
    const a = accessory[i]; const b = accessory[i + 1];
    // לא לחבר שני תרגילים על אותו שריר ראשי — זה הופך לסט ענק בלי כוונה
    const overlap = a.exercise.primary.some((m) => b.exercise.primary.includes(m));
    if (overlap) continue;
    const gid = `ss_${a.exercise.id}`;
    a.group = gid; b.group = gid;
    a.setType = 'superset'; b.setType = 'superset';
    b.prescription.restSec = a.prescription.restSec;
    a.prescription.restSec = 15;
  }
  return blocks;
}

/**
 * יצירת תכנית שבועית.
 * @param {object} trainee  אחרי normalizeTrainee
 * @param {object} studio   אחרי normalizeStudio
 * @param {object} [opts]   { seed }
 */
export function generateWeeklyProgram(rawTrainee, studio, opts = {}) {
  // ההערות הפעילות של המאמן מוחלות על הפרופיל לפני כל חישוב
  const { trainee, effects: noteEffects } = applyNotes(rawTrainee);
  const seed = opts.seed || `${trainee.id}:${trainee.mesocycleWeek}`;
  const rng = makeRng(seed);

  const { eligible, rejected, coverage } = buildCandidatePool(EXERCISES, trainee, studio);
  const prescribed = new Set(prescribedExerciseIds(trainee).filter((id) => eligible.some((c) => c.exercise.id === id)));
  const ageAdj = ageAdjustments(trainee);
  const { split, reason, days: archetypes } = chooseSplit(trainee, studio);
  const dayKeys = scheduleDays(trainee);
  const targets = weeklyVolumeTargets(trainee);

  const volume = { sets: Object.fromEntries(MUSCLES.map((m) => [m, 0])), target: targets };

  /*
   * הרמה המיושבת מחושבת פעם אחת לתכנית: היא נגזרת מהצהרת המתאמן,
   * מהוותק שלו ומהמשקלים שנרשמו בפועל, ומכאן היא זו שקובעת
   * אילו תרגילים מספקים לו גירוי אמיתי ואילו כבר קטנים עליו.
   */
  const resolvedLevel = resolveLevel(trainee, BY_ID);
  /**
   * אותו מתאמן, עם הרמה שנקבעה בפועל מצורפת — כדי שגם הצעות המשקל
   * ייגזרו ממנה ולא מההצהרה. נשמר כמשתנה נפרד ולא בהשמה חוזרת,
   * כי trainee הוא קבוע והשמה אליו נכשלת בזמן ריצה.
   */
  const traineeLv = { ...trainee, resolvedLevelIndex: resolvedLevel.index };
  const usedThisWeek = new Map();

  const days = [];
  for (let i = 0; i < archetypes.length; i++) {
    const arch = DAY_ARCHETYPES[archetypes[i]];
    const budget = fatigueBudget(trainee);
    const dayKey = dayKeys[i];
    const timeBudget = trainee.sessionMinutesByDay[dayKey] || trainee.sessionMinutes;
    let daySlots = augmentSlots(arch.slots, trainee, ageAdj);

    /*
     * מבנה האימון של הסטודיו.
     * כשהמבנה הוא ברירת המחדל, שום דבר לא משתנה — אותו מסלול שרץ עד היום.
     * מבנה מותאם (למשל רבע שעה בטן לפני הכוח) מפצל את היום למקטעים,
     * כל מקטע עם תקציב זמן משלו וסדר תצוגה משלו.
     */
    const structure = normalizeStructure(studio.sessionStructure);
    const structured = !isDefaultStructure(structure);
    const segPlans = structured ? structurePlan(structure, timeBudget, i) : [];
    // אימון קצר מאוד: מוותרים על חימום מובנה ועל סיום, ומתמקדים בעיקר.
    // המאמן יחמם בשטח — עדיף מלגלוש 30% מעבר לזמן שהמתאמן הקצה.
    if (timeBudget <= 30) daySlots = daySlots.filter((x) => x.role !== 'warmup' && x.role !== 'cooldown');
    /** תקרת מספר תרגילים שנגזרת מהזמן, כדי שהאימון יהיה בר-ביצוע. */
    const maxBlocks = Math.max(3, Math.floor(timeBudget / 5.5));
    // באימון צפוף ממלאים לפי חשיבות ולא לפי סדר הארכיטיפ
    if (daySlots.length > maxBlocks) {
      daySlots = daySlots
        .map((slot, order) => ({ slot, order }))
        .sort((a, b) => (ROLE_FILL_PRIORITY[a.slot.role] ?? 9) - (ROLE_FILL_PRIORITY[b.slot.role] ?? 9) || a.order - b.order)
        .map((x) => x.slot);
    }
    const usedToday = new Set();
    // וריאציות של אותה תנועה, כדי לא לתת פעמיים את אותו דבר בשם אחר
    const usedTodayShapes = new Set();
    let dayFatigue = 0;
    let minutes = 0;
    const blocks = [];
    const unfilled = [];

    /** מוסיף משבצת לאימון אם היא נכנסת בתקציב הזמן והעייפות. */
    const tryFill = (slot, { allowRelax = true, segmentCap = null, requireLevelFit = false } = {}) => {
      const ctx = { trainee, studio, volume, usedThisWeek, usedToday, usedTodayShapes, prescribed, rng, dayFatigue, fatigueBudget: budget, resolvedLevel };
      let best = pickForSlot(eligible, slot, ctx);
      let usedSlot = slot;
      /*
       * מרחיבים את המשבצת לא רק כשאין בה אף מועמד, אלא גם כשהמועמד
       * הטוב ביותר נפסל על היותו מתחת לרמת המתאמן. משבצת צרה שאין בה
       * שום תרגיל ראוי היא בדיוק המקום שבו נכנסו תרגילים קלים מדי.
       */
      if (allowRelax && (!best || best.detail?.belowLevel)) {
        const relaxed = relaxSlot(slot);
        const alt = pickForSlot(eligible, relaxed, ctx);
        if (alt && (!best || alt.score > best.score)) { best = alt; usedSlot = relaxed; }
      }
      if (!best) return { dropped: 'no_candidate' };
      // תוספת רשות שאינה עומדת ברמה — לא מוסיפים אותה בכלל
      if (requireLevelFit && best.detail?.belowLevel) return { dropped: 'below_level' };

      const ex = best.cand.exercise;
      const rx = prescribe(ex, trainee, { goal: trainee.primaryGoal });
      let mins = estimateMinutes(ex, rx);

      /*
       * התאמה לתקציב הזמן: מצמצמים סטים — אבל רק עד הרצפה שבה התרגיל
       * עדיין עושה משהו. תרגיל שנכנס לאימון רק בתור סט בודד אינו "עוד
       * תרגיל", הוא שורה שגוזלת זמן מהתרגילים שכן עובדים; במקום זה
       * מוותרים עליו, והזמן נשאר אצל העיקריים.
       */
      const floor = slot.role === 'main' || slot.role === 'secondary' ? 3 : 2;
      while (rx.sets > floor && minutes + mins > timeBudget) {
        rx.sets -= 1;
        mins = estimateMinutes(ex, rx);
      }
      if (rx.sets <= floor && minutes + mins > timeBudget) return { dropped: 'time' };
      // עודף נפח: שריר שכבר מעל היעד השבועי מקבל סט אחד פחות.
      if (rx.sets > 2 && ex.primary.some((m) => (volume.sets[m] || 0) >= volume.target.max)) {
        rx.sets -= 1;
        mins = estimateMinutes(ex, rx);
      }

      if (blocks.length >= maxBlocks) return { dropped: 'time' };
      // תקציב המקטע גובר: מקטע בטן של רבע שעה לא גולש לתוך הכוח
      if (segmentCap != null && minutes + mins > segmentCap * 1.08) return { dropped: 'time' };
      if (minutes + mins > timeBudget * 1.05) {
        // עדיין לא נכנס: רק אימון שאין בו מינימום סביר מקבל חריגה קטנה
        const wouldOverrun = minutes + mins > timeBudget * 1.12;
        if (slot.optional || blocks.length >= 3 || wouldOverrun) return { dropped: 'time' };
      }

      const isFirstHeavy = !blocks.some((b) => b.role === 'main') && slot.role === 'main';
      const ramp = isFirstHeavy ? rampUpSets(ex, rx, trainee) : null;

      blocks.push({
        slotLabel: usedSlot.relaxed ? `${slot.label} (חלופי)` : slot.label,
        role: slot.role,
        /** לאיזה מקטע במבנה הסטודיו התרגיל שייך (null במבנה ברירת המחדל). */
        segment: slot.segment
          ? { id: slot.segment.segmentId, label: slot.segment.label, kind: slot.segment.kind, order: slot.segment.order }
          : null,
        setType: 'straight',
        group: null,
        relaxed: !!usedSlot.relaxed,
        exercise: {
          id: ex.id, name: ex.name, nameEn: ex.nameEn, pattern: ex.pattern,
          primary: ex.primary, secondary: ex.secondary, type: ex.type,
          equipment: best.cand.equipmentOption, unilateral: ex.unilateral, skill: ex.skill,
          loadable: ex.loadable, demand: ex.demand,
        },
        prescription: rx,
        load: withNoteAdjust(planLoad(ex, rx, traineeLv, studio), trainee),
        rampUp: ramp,
        estimatedMinutes: mins,
        coachingNotes: coachingNotes(ex, best.cand, trainee),
        selection: { score: best.score, detail: best.detail },
        alternatives: alternativesFor(eligible, usedSlot, ctx, ex.id, 3),
        controls: controlsFor(ex),
      });

      usedToday.add(ex.id);
      usedTodayShapes.add(`${ex.pattern}|${[...ex.primary].sort().join('+')}`);
      usedThisWeek.set(ex.id, (usedThisWeek.get(ex.id) || 0) + 1);
      dayFatigue += FATIGUE_COST[ex.fatigue] || 2;
      minutes += mins;
      for (const m of ex.primary) volume.sets[m] = (volume.sets[m] || 0) + rx.sets;
      for (const m of ex.secondary) volume.sets[m] = (volume.sets[m] || 0) + rx.sets * 0.5;
      return { ok: true };
    };

    const droppedForTime = [];
    if (structured) {
      // ממלאים מקטע אחרי מקטע, כל אחד בתוך תקציב הזמן שהוקצה לו
      let spent = 0;
      for (const plan of segPlans) {
        const slots = segmentSlots(plan, daySlots);
        const cap = spent + plan.minutes;
        for (const slot of slots) {
          if (minutes >= cap) { if (!slot.optional) droppedForTime.push(slot.label || plan.label); continue; }
          const res = tryFill({ ...slot, segment: plan }, { segmentCap: cap });
          if (res.ok || slot.optional) continue;
          const label = slot.label || plan.label;
          if (res.dropped === 'time') droppedForTime.push(label);
          else unfilled.push(label);
        }
        spent = Math.max(cap, minutes);
      }
    } else {
      for (const slot of daySlots) {
        const res = tryFill(slot);
        if (res.ok || slot.optional) continue;
        const label = slot.label || slot.patterns.join('/');
        if (res.dropped === 'time') droppedForTime.push(label);
        else unfilled.push(label);
      }
    }

    // השלמת זמן פנוי: מוסיפים עבודת עזר לשרירים שנשארו מתחת ליעד השבועי.
    if (minutes < timeBudget * 0.85) {
      const behind = Object.entries(volume.sets)
        .filter(([m]) => (arch.focusMuscles ? arch.focusMuscles.includes(m) : true))
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
      let added = 0;
      for (const m of behind) {
        if (added >= 2 || minutes >= timeBudget * 0.85 || blocks.length >= Math.min(9, maxBlocks)) break;
        if ((volume.sets[m] || 0) >= volume.target.min) continue;
        // גם השלמת נפח כפופה לרמה: עדיף לסיים אימון קצר מלמלא אותו
        // בתרגיל שאינו מקדם את המתאמן. זו הייתה דלת אחורית לתרגילים קלים מדי.
        if (tryFill(fillerSlot(m), { allowRelax: true, requireLevelFit: true }).ok) added += 1;
      }
    }

    // סידור לסדר ביצוע נכון להצגה למאמן
    // סדר התצוגה: לפי המקטעים כשיש מבנה, ואחרת לפי סדר הביצוע הרגיל
    blocks.sort((a, b) => (structured
      ? (a.segment?.order ?? 99) - (b.segment?.order ?? 99)
        || ROLE_DISPLAY_ORDER.indexOf(a.role) - ROLE_DISPLAY_ORDER.indexOf(b.role)
      : ROLE_DISPLAY_ORDER.indexOf(a.role) - ROLE_DISPLAY_ORDER.indexOf(b.role)));
    applySupersets(blocks, trainee, studio);

    const dayForCompression = { blocks, sessionMinutes: timeBudget, estimatedMinutes: 0 };
    const compressionNote = compressDay(dayForCompression, timeBudget);

    days.push({
      index: i + 1,
      day: dayKeys[i],
      dayLabel: DAY_LABEL[dayKey] || dayKey,
      sessionMinutes: timeBudget,
      archetype: archetypes[i],
      label: arch.label,
      /** המקטעים שהיום נבנה לפיהם, לתצוגה ולבקרה. ריק = מבנה ברירת מחדל. */
      segments: segPlans.map((x) => ({ id: x.segmentId, label: x.label, kind: x.kind, minutes: x.minutes, note: x.note })),
      estimatedMinutes: dayForCompression.estimatedMinutes,
      compressionNote,
      fatigueLoad: dayFatigue,
      blocks,
      unfilledSlots: unfilled,
      droppedForTime,
      status: 'planned',
    });
  }

  // איזון מינימלי: משיכה חשובה יותר מדחיפה שנייה. אם השבוע יצא בלי משיכה
  // כלל — מחליפים את התרגיל הכי שולי ביום העמוס במשיכה.
  const balanceRepair = ensurePullBalance(days, eligible, trainee, studio, volume, usedThisWeek, rng);

  const program = {
    schemaVersion: 1,
    id: `${trainee.id}_w${trainee.mesocycleWeek}`,
    traineeId: trainee.id,
    traineeName: trainee.name,
    studioId: studio.id,
    week: trainee.mesocycleWeek,
    generatedAt: new Date().toISOString(),
    seed,
    meta: {
      split, splitReason: reason,
      goal: trainee.primaryGoal,
      goalLabel: (GOAL_PROFILES[trainee.primaryGoal] || {}).label || trainee.primaryGoal,
      level: trainee.level,
      /**
       * הרמה שהמערכת עבדה לפיה בפועל, והנימוקים שהובילו אליה.
       * מוצג למאמן כדי שיראה למה נבחרו התרגילים האלה ויוכל לחלוק עליהם.
       */
      resolvedLevel: {
        label: resolvedLevel.label,
        claimed: resolvedLevel.claimed,
        confidence: resolvedLevel.confidence,
        cappedByAge: resolvedLevel.cappedByAge,
        reasons: resolvedLevel.reasons,
        byPattern: Object.fromEntries(Object.entries(resolvedLevel.byPattern)
          .map(([k, v]) => [k, { level: LEVEL_ORDER[v.index], ratio: v.ratio, loadKg: v.loadKg }])),
      },
      daysPerWeek: trainee.daysPerWeek,
      sessionMinutes: trainee.sessionMinutes,
      deload: isDeloadWeek(trainee),
      recoveryScore: recoveryScore(trainee),
      volumeMultiplier: volumeMultiplier(trainee),
      eligibleExercises: eligible.length,
      rejectedExercises: rejected.length,
      phase: weekProgression(trainee).phase,
      age: trainee.age,
      ageNote: ageAdj.note,
      externalLoad: {
        sport: trainee.sport,
        sessions: trainee.externalSessions,
        lifestyle: trainee.lifestyle,
        factor: externalLoadFactor(trainee),
        note: LIFESTYLES[trainee.lifestyle]?.note || '',
      },
      coachLoad: +coachLoad(studio).toFixed(1),
      travelWeek: trainee.travelWeek,
      cyclePhase: trainee.cyclePhase,
      poolCoverage: coverage,
    },
    constraints: constraintNotes(trainee),
    weeklyVolume: {},   // מחושב מטה מהתכנית הסופית, אחרי דחיסה ותיקוני איזון
    volumeTarget: targets,
    days,
    /**
     * הצעות "נסה ותגיד לי" לאזורי הפציעה. אינן חלק מהאימון עצמו —
     * הן מוצגות למאמן בנפרד, והתוצאה שלהן משנה את התכניות הבאות.
     */
    probes: buildProbes(trainee, studio),
    /** ההערות הפעילות וההשפעה שלהן על התכנית הזו. */
    noteEffects,
    customExercises: {
      pending: (trainee.customExercises || []).filter((c) => c.status === 'draft'),
      approved: (trainee.customExercises || []).filter((c) => c.status === 'tested_ok'),
    },
    repairs: balanceRepair ? [balanceRepair] : [],
    excluded: summarizeRejections(rejected),
  };

  // הנפח נספר מהתכנית הסופית בלבד — אחרי דחיסת זמן ואחרי תיקוני איזון,
  // אחרת המספר שהמאמן רואה אינו הנפח שהמתאמן באמת יבצע.
  recomputeVolume(program);
  program.qa = runQualityChecks(program, trainee, studio);
  return program;
}

/** התאמת משקל לפי הנחיה בהערה של המאמן. */
function withNoteAdjust(load, trainee) {
  const pct = trainee.loadAdjustPct || 0;
  if (!pct || !load || load.kg == null) return load;
  const kg = Math.max(1, Math.round((load.kg * (1 + pct / 100)) * 2) / 2);
  const dir = pct > 0 ? `הועלה ב-${pct}%` : `הופחת ב-${Math.abs(pct)}%`;
  return { ...load, kg, label: `${load.label} · ${dir} לפי הערת מאמן` };
}

const PULL_PATTERNS = ['horizontal_pull', 'vertical_pull'];

/** תפקיד התרגיל לפי השרירים הראשיים שלו — זהה לחישוב שבבקרת האיכות. */
function roleOf(block) {
  const roles = block.exercise.primary.map((m) => MUSCLE_ROLE[m]);
  if (roles.includes('pull')) return 'pull';
  if (roles.includes('push')) return 'push';
  return roles[0] || 'other';
}

/**
 * מוודא שבתכנית יש עבודת משיכה כשיש עבודת דחיפה.
 * חוסר איזון כזה נוצר כשמשבצת המשיכה נדחקת מסיבות זמן — וזו בדיוק
 * הטעות שמאמן מנוסה לא היה עושה: קודם מוותרים על עזר, לא על משיכה.
 * @returns {object|null} תיאור התיקון שבוצע, או null אם לא נדרש/לא אפשרי
 */
function ensurePullBalance(days, eligible, trainee, studio, volume, usedThisWeek, rng) {
  const all = days.flatMap((d) => d.blocks);
  const hasPush = all.some((b) => roleOf(b) === 'push');
  const hasPull = all.some((b) => roleOf(b) === 'pull');
  if (!hasPush || hasPull) return null;
  if (!eligible.some((c) => PULL_PATTERNS.includes(c.exercise.pattern))) {
    return { type: 'pull_unavailable', note: 'אין בסטודיו תרגיל משיכה שמתאים למגבלות המתאמן.' };
  }

  // היום העמוס ביותר, והבלוק שהכי פחות יעלה לוותר עליו
  const day = days.slice().sort((a, b) => b.blocks.length - a.blocks.length)[0];
  let idx = -1;
  // 1. קונדישן, 2. עזר, 3. דחיפה עודפת (כשיש יותר מאחת), 4. ליבה, 5. שיווי משקל
  for (const role of ['conditioning', 'accessory']) {
    idx = day.blocks.map((b) => b.role).lastIndexOf(role);
    if (idx >= 0) break;
  }
  if (idx < 0 && day.blocks.filter((b) => roleOf(b) === 'push').length > 1) {
    idx = day.blocks.map(roleOf).lastIndexOf('push');
  }
  if (idx < 0) {
    for (const role of ['core', 'prehab']) {
      idx = day.blocks.map((b) => b.role).lastIndexOf(role);
      if (idx >= 0) break;
    }
  }
  if (idx < 0) idx = day.blocks.length - 1;

  const removed = day.blocks[idx];
  const usedToday = new Set(day.blocks.map((b) => b.exercise.id));
  usedToday.delete(removed.exercise.id);
  const slot = { role: 'secondary', patterns: PULL_PATTERNS, type: null, muscles: null, label: 'משיכה (איזון)' };
  // גם תיקון האיזון בונה בלוק מלא, ולכן הוא זקוק לרמה שנקבעה בפועל
  const resolvedLevel = resolveLevel(trainee, BY_ID);
  const traineeLv = { ...trainee, resolvedLevelIndex: resolvedLevel.index };
  const ctx = {
    trainee, studio, volume, usedThisWeek, usedToday,
    prescribed: new Set(prescribedExerciseIds(trainee)), rng,
    dayFatigue: day.fatigueLoad, fatigueBudget: fatigueBudget(trainee) + 3,
    resolvedLevel,
  };
  const best = pickForSlot(eligible, slot, ctx);
  if (!best) return { type: 'pull_unavailable', note: 'לא נמצא תרגיל משיכה שמתאים ליום זה.' };

  const ex = best.cand.exercise;
  const rx = prescribe(ex, trainee, { goal: trainee.primaryGoal });
  day.blocks[idx] = {
    slotLabel: 'משיכה (איזון)',
    role: 'secondary',
    setType: 'straight',
    group: null,
    relaxed: false,
    exercise: {
      id: ex.id, name: ex.name, nameEn: ex.nameEn, pattern: ex.pattern,
      primary: ex.primary, secondary: ex.secondary, type: ex.type,
      equipment: best.cand.equipmentOption, unilateral: ex.unilateral, skill: ex.skill,
    },
    prescription: rx,
    load: withNoteAdjust(planLoad(ex, rx, traineeLv, studio), trainee),
    rampUp: null,
    estimatedMinutes: estimateMinutes(ex, rx),
    coachingNotes: coachingNotes(ex, best.cand, trainee),
    selection: { score: best.score, detail: best.detail },
    alternatives: alternativesFor(eligible, slot, ctx, ex.id, 3),
    controls: controlsFor(ex),
  };
  // התיקון לא רשאי להאריך את האימון מעבר לזמן שהוקצה
  const compressionNote = compressDay(day, day.sessionMinutes || trainee.sessionMinutes);
  if (compressionNote) day.compressionNote = compressionNote;
  for (const m of ex.primary) volume.sets[m] = (volume.sets[m] || 0) + rx.sets;
  for (const m of ex.secondary) volume.sets[m] = (volume.sets[m] || 0) + rx.sets * 0.5;
  usedThisWeek.set(ex.id, (usedThisWeek.get(ex.id) || 0) + 1);

  return {
    type: 'pull_balance',
    note: `התכנית יצאה בלי עבודת משיכה, ולכן "${removed.exercise.name}" הוחלף ב"${ex.name}" ב${day.dayLabel}.`,
  };
}

function summarizeRejections(rejected) {
  const byReason = {};
  for (const r of rejected) {
    byReason[r.reason] = byReason[r.reason] || [];
    byReason[r.reason].push({ id: r.id, name: BY_ID[r.id]?.name || r.id, detail: r.detail });
  }
  return byReason;
}

/**
 * החלפת תרגיל בתכנית קיימת (המאמן לחץ "החלף" במסך האימון).
 * המרשם מחושב מחדש לתרגיל החדש, והחלופות מתעדכנות.
 * @param {object} program
 * @param {object} trainee
 * @param {object} studio
 * @param {{dayIndex:number, blockIndex:number, alternativeId?:string}} sel
 */
export function swapExercise(program, trainee, studio, sel) {
  const day = program.days[sel.dayIndex];
  if (!day) throw new Error('יום לא קיים בתכנית');
  const block = day.blocks[sel.blockIndex];
  if (!block) throw new Error('תרגיל לא קיים ביום זה');

  const { eligible } = buildCandidatePool(EXERCISES, trainee, studio);
  const usedToday = new Set(day.blocks.map((b) => b.exercise.id).filter((id) => id !== block.exercise.id));
  // גם בהחלפה ידנית הרמה שנקבעה בפועל היא זו שקובעת את הצעת המשקל
  const swapLevel = resolveLevel(trainee, BY_ID);
  const traineeLv = { ...trainee, resolvedLevelIndex: swapLevel.index };

  let cand;
  if (sel.alternativeId) {
    cand = eligible.find((c) => c.exercise.id === sel.alternativeId);
    if (!cand) throw new Error('התרגיל המבוקש אינו זמין בסטודיו זה או שאינו מתאים למגבלות המתאמן');
    if (usedToday.has(sel.alternativeId)) throw new Error('התרגיל כבר קיים באימון הזה');
  } else {
    const alt = block.alternatives.find((a) => !usedToday.has(a.id));
    if (!alt) throw new Error('לא נמצאה חלופה זמינה');
    cand = eligible.find((c) => c.exercise.id === alt.id);
  }

  const ex = cand.exercise;
  const rx = prescribe(ex, trainee, { goal: trainee.primaryGoal });
  const slot = { role: block.role, patterns: [ex.pattern], type: null, muscles: null, label: block.slotLabel };
  const ctx = {
    trainee, studio,
    volume: { sets: Object.fromEntries(MUSCLES.map((m) => [m, 0])), target: program.volumeTarget },
    usedThisWeek: new Map(), usedToday, prescribed: new Set(prescribedExerciseIds(trainee)),
    rng: () => 0, dayFatigue: 0, fatigueBudget: fatigueBudget(trainee),
  };

  day.blocks[sel.blockIndex] = {
    ...block,
    swappedFrom: block.exercise.id,
    exercise: {
      id: ex.id, name: ex.name, nameEn: ex.nameEn, pattern: ex.pattern,
      primary: ex.primary, secondary: ex.secondary, type: ex.type,
      equipment: cand.equipmentOption, unilateral: ex.unilateral, skill: ex.skill,
      loadable: ex.loadable, demand: ex.demand,
    },
    prescription: rx,
    estimatedMinutes: estimateMinutes(ex, rx),
    coachingNotes: coachingNotes(ex, cand, trainee),
    alternatives: alternativesFor(eligible, slot, ctx, ex.id, 3),
    controls: controlsFor(ex),
  };

  day.estimatedMinutes = +day.blocks.reduce((s, b) => s + b.estimatedMinutes, 0).toFixed(1);
  recomputeVolume(program);
  // הנפח נספר מהתכנית הסופית בלבד — אחרי דחיסת זמן ואחרי תיקוני איזון,
  // אחרת המספר שהמאמן רואה אינו הנפח שהמתאמן באמת יבצע.
  recomputeVolume(program);
  program.qa = runQualityChecks(program, trainee, studio);
  return program;
}

/** חישוב מחדש של הנפח השבועי אחרי שינוי ידני. */
export function recomputeVolume(program) {
  const sets = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const day of program.days) {
    for (const b of day.blocks) {
      for (const m of b.exercise.primary) sets[m] = (sets[m] || 0) + b.prescription.sets;
      for (const m of b.exercise.secondary) sets[m] = (sets[m] || 0) + b.prescription.sets * 0.5;
    }
  }
  program.weeklyVolume = Object.fromEntries(Object.entries(sets).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(1)]));
  return program;
}
