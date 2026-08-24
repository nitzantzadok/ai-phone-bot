/**
 * המנוע המרכזי: מקבל מתאמן + סטודיו, ומחזיר תכנית אימונים שבועית מלאה.
 */

import { EXERCISES, BY_ID } from '../domain/exercises.js';
import { DAY_LABEL } from '../domain/models.js';
import { MUSCLES } from '../domain/taxonomy.js';
import {
  buildCandidatePool, constraintNotes, prescribedExerciseIds,
} from './filters.js';
import { isDeloadWeek, prescribe, recoveryScore, volumeMultiplier, weeklyVolumeTargets, GOAL_PROFILES } from './prescription.js';
import { DAY_ARCHETYPES, chooseSplit, fillerSlot, relaxSlot, scheduleDays } from './split.js';
import { alternativesFor, makeRng, pickForSlot } from './select.js';
import { runQualityChecks } from './validate.js';
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

/** הערות אימון קצרות למאמן. */
function coachingNotes(ex, cand, trainee) {
  const notes = [];
  if (ex.cues.length) notes.push(...ex.cues);
  if (cand.constraintNotes.length) notes.push(...cand.constraintNotes.slice(0, 2));
  if (ex.unilateral) notes.push('לבצע את מספר החזרות לכל צד; להתחיל בצד החלש.');
  if (trainee.level === 'beginner' && ex.skill >= 3) notes.push('סט ראשון קל ללימוד התנועה לפני הוספת משקל.');
  if (trainee.history[ex.id]) {
    const h = trainee.history[ex.id];
    notes.push(`משקל עבודה אחרון: ${h.load ?? '—'} ק"ג × ${h.reps ?? '—'} חזרות.`);
  }
  return [...new Set(notes)];
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
export function generateWeeklyProgram(trainee, studio, opts = {}) {
  const seed = opts.seed || `${trainee.id}:${trainee.mesocycleWeek}`;
  const rng = makeRng(seed);

  const { eligible, rejected } = buildCandidatePool(EXERCISES, trainee, studio);
  const prescribed = new Set(prescribedExerciseIds(trainee).filter((id) => eligible.some((c) => c.exercise.id === id)));
  const { split, reason, days: archetypes } = chooseSplit(trainee, studio);
  const dayKeys = scheduleDays(trainee);
  const targets = weeklyVolumeTargets(trainee);

  const volume = { sets: Object.fromEntries(MUSCLES.map((m) => [m, 0])), target: targets };
  const usedThisWeek = new Map();

  const days = [];
  for (let i = 0; i < archetypes.length; i++) {
    const arch = DAY_ARCHETYPES[archetypes[i]];
    const budget = fatigueBudget(trainee);
    const timeBudget = trainee.sessionMinutes;
    const usedToday = new Set();
    let dayFatigue = 0;
    let minutes = 0;
    const blocks = [];
    const unfilled = [];

    /** מוסיף משבצת לאימון אם היא נכנסת בתקציב הזמן והעייפות. */
    const tryFill = (slot, { allowRelax = true } = {}) => {
      const ctx = { trainee, studio, volume, usedThisWeek, usedToday, prescribed, rng, dayFatigue, fatigueBudget: budget };
      let best = pickForSlot(eligible, slot, ctx);
      let usedSlot = slot;
      if (!best && allowRelax) {
        usedSlot = relaxSlot(slot);
        best = pickForSlot(eligible, usedSlot, ctx);
      }
      if (!best) return { dropped: 'no_candidate' };

      const ex = best.cand.exercise;
      const rx = prescribe(ex, trainee, { goal: trainee.primaryGoal });
      let mins = estimateMinutes(ex, rx);

      // התאמה לתקציב הזמן: מצמצמים סטים לפני שמוותרים על התרגיל.
      while (rx.sets > 1 && minutes + mins > timeBudget) {
        rx.sets -= 1;
        mins = estimateMinutes(ex, rx);
      }
      // עודף נפח: שריר שכבר מעל היעד השבועי מקבל סט אחד פחות.
      if (rx.sets > 2 && ex.primary.some((m) => (volume.sets[m] || 0) >= volume.target.max)) {
        rx.sets -= 1;
        mins = estimateMinutes(ex, rx);
      }

      if (minutes + mins > timeBudget * 1.05) {
        // עדיין לא נכנס: משבצת רשות נזרקת, משבצת חובה נכנסת רק אם האימון עוד ריק
        if (slot.optional || blocks.length >= 4) return { dropped: 'time' };
      }

      blocks.push({
        slotLabel: usedSlot.relaxed ? `${slot.label} (חלופי)` : slot.label,
        role: slot.role,
        setType: 'straight',
        group: null,
        relaxed: !!usedSlot.relaxed,
        exercise: {
          id: ex.id, name: ex.name, nameEn: ex.nameEn, pattern: ex.pattern,
          primary: ex.primary, secondary: ex.secondary, type: ex.type,
          equipment: best.cand.equipmentOption, unilateral: ex.unilateral, skill: ex.skill,
        },
        prescription: rx,
        estimatedMinutes: mins,
        coachingNotes: coachingNotes(ex, best.cand, trainee),
        selection: { score: best.score, detail: best.detail },
        alternatives: alternativesFor(eligible, usedSlot, ctx, ex.id, 3),
        controls: controlsFor(ex),
      });

      usedToday.add(ex.id);
      usedThisWeek.set(ex.id, (usedThisWeek.get(ex.id) || 0) + 1);
      dayFatigue += FATIGUE_COST[ex.fatigue] || 2;
      minutes += mins;
      for (const m of ex.primary) volume.sets[m] = (volume.sets[m] || 0) + rx.sets;
      for (const m of ex.secondary) volume.sets[m] = (volume.sets[m] || 0) + rx.sets * 0.5;
      return { ok: true };
    };

    const droppedForTime = [];
    for (const slot of arch.slots) {
      const res = tryFill(slot);
      if (res.ok || slot.optional) continue;
      const label = slot.label || slot.patterns.join('/');
      if (res.dropped === 'time') droppedForTime.push(label);
      else unfilled.push(label);
    }

    // השלמת זמן פנוי: מוסיפים עבודת עזר לשרירים שנשארו מתחת ליעד השבועי.
    if (minutes < timeBudget * 0.85) {
      const behind = Object.entries(volume.sets)
        .filter(([m]) => (arch.focusMuscles ? arch.focusMuscles.includes(m) : true))
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
      let added = 0;
      for (const m of behind) {
        if (added >= 2 || minutes >= timeBudget * 0.85 || blocks.length >= 9) break;
        if ((volume.sets[m] || 0) >= volume.target.min) continue;
        if (tryFill(fillerSlot(m), { allowRelax: false }).ok) added += 1;
      }
    }

    applySupersets(blocks, trainee, studio);

    days.push({
      index: i + 1,
      day: dayKeys[i],
      dayLabel: DAY_LABEL[dayKeys[i]] || dayKeys[i],
      archetype: archetypes[i],
      label: arch.label,
      estimatedMinutes: +blocks.reduce((s, b) => s + b.estimatedMinutes, 0).toFixed(1),
      fatigueLoad: dayFatigue,
      blocks,
      unfilledSlots: unfilled,
      droppedForTime,
      status: 'planned',
    });
  }

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
      daysPerWeek: trainee.daysPerWeek,
      sessionMinutes: trainee.sessionMinutes,
      deload: isDeloadWeek(trainee),
      recoveryScore: recoveryScore(trainee),
      volumeMultiplier: volumeMultiplier(trainee),
      eligibleExercises: eligible.length,
      rejectedExercises: rejected.length,
    },
    constraints: constraintNotes(trainee),
    weeklyVolume: Object.fromEntries(Object.entries(volume.sets).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(1)])),
    volumeTarget: targets,
    days,
    excluded: summarizeRejections(rejected),
  };

  program.qa = runQualityChecks(program, trainee, studio);
  return program;
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
    },
    prescription: rx,
    estimatedMinutes: estimateMinutes(ex, rx),
    coachingNotes: coachingNotes(ex, cand, trainee),
    alternatives: alternativesFor(eligible, slot, ctx, ex.id, 3),
    controls: controlsFor(ex),
  };

  day.estimatedMinutes = +day.blocks.reduce((s, b) => s + b.estimatedMinutes, 0).toFixed(1);
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
