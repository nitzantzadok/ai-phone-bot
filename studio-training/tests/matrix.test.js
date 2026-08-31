/**
 * מטריצת כיסוי: ההוכחה שהמערכת מתמודדת עם *כל* צירוף.
 *
 * כאן לא בודקים מקרה בודד אלא סורקים את מרחב הקלט כולו —
 * כל מגבלה × כל חומרה, כל מטרה × כל רמה × כל מספר ימים, כל סוג סטודיו,
 * ועוד מאות פרופילים אקראיים — ומאמתים שאף תכנית לא מפרה כלל בטיחות.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CONSTRAINT_IDS, getConstraint } from '../src/domain/constraints.js';
import { getExercise } from '../src/domain/exercises.js';
import { normalizeStudio, normalizeTrainee, validateInput } from '../src/domain/models.js';
import { GOALS, LEVELS } from '../src/domain/taxonomy.js';
import { generateWeeklyProgram } from '../src/engine/generate.js';
import { equipmentCheck, spaceCheck, skillCheck } from '../src/engine/filters.js';
import { ageAdjustments } from '../src/engine/prescription.js';
import { STUDIOS } from '../src/seed.js';
import { makeRng } from '../src/engine/select.js';

const studios = STUDIOS.map(normalizeStudio);
const byId = Object.fromEntries(studios.map((s) => [s.id, s]));

/**
 * בדיקת בטיחות מלאה על תכנית אחת, בלתי תלויה במנוע שיצר אותה.
 * @returns {string[]} רשימת הפרות; ריקה = תכנית תקינה.
 */
function auditProgram(program, trainee, studio) {
  const problems = [];
  const age = ageAdjustments(trainee);

  for (const day of program.days) {
    const seen = new Set();
    if (day.blocks.length === 0) problems.push(`${day.dayLabel}: אימון ריק`);

    for (const b of day.blocks) {
      const ex = getExercise(b.exercise.id);
      if (seen.has(ex.id)) problems.push(`${day.dayLabel}: ${ex.name} מופיע פעמיים`);
      seen.add(ex.id);

      // ציוד קיים בפועל
      const eq = equipmentCheck(ex, studio, trainee.equipmentBlocklist, { travelWeek: trainee.travelWeek });
      if (!eq.ok) problems.push(`${ex.name}: ציוד חסר (${eq.missing.join(', ')})`);

      // מרחב פיזי
      const sp = spaceCheck(ex, studio);
      if (!sp.ok) problems.push(`${ex.name}: ${sp.reasons.join(', ')}`);

      // מיומנות
      if (!skillCheck(ex, trainee, studio).ok) problems.push(`${ex.name}: מורכב מדי למתאמן/למסגרת`);

      // מגבלות רפואיות — הבדיקה החשובה ביותר
      for (const c of trainee.constraints) {
        const rule = getConstraint(c.id);
        const strict = { acute: 1, subacute: 0, managed: -1 }[c.severity] ?? 0;
        const hardFlags = c.severity === 'managed' && rule.region !== 'systemic' ? [] : (rule.forbidFlags || []);
        for (const f of hardFlags) {
          if (ex.flags.includes(f)) problems.push(`${ex.name}: דגל אסור ${f} תחת ${c.id}/${c.severity}`);
        }
        for (const [joint, cap] of Object.entries(rule.maxStress || {})) {
          const eff = Math.max(0, cap - strict);
          if ((ex.stress[joint] ?? 0) > eff) problems.push(`${ex.name}: עומס ${joint} ${ex.stress[joint]}>${eff} תחת ${c.id}`);
        }
      }

      // תרגילים שהמתאמן פסל
      if (trainee.dislikes.includes(ex.id)) problems.push(`${ex.name}: ברשימת השלילה של המתאמן`);

      // מרשם הגיוני
      const rx = b.prescription;
      if (!(rx.sets >= 1)) problems.push(`${ex.name}: סטים לא תקינים`);
      if (rx.intensityPct[1] > age.maxIntensityPct) problems.push(`${ex.name}: עצימות מעל תקרת הגיל`);
      if (ex.type !== 'conditioning' && ex.type !== 'mobility'
          && (rx.repsMin < ex.repMin || rx.repsMax > ex.repMax)) {
        problems.push(`${ex.name}: טווח חזרות מחוץ לטווח התרגיל`);
      }
    }

    // תקציב זמן
    const planned = day.sessionMinutes || trainee.sessionMinutes;
    if (day.estimatedMinutes > planned * 1.12) {
      problems.push(`${day.dayLabel}: ${day.estimatedMinutes} דק' מול ${planned} מתוכננות`);
    }
  }

  for (const i of program.qa.issues.filter((x) => x.level === 'error')) problems.push(`QA: ${i.message}`);
  return problems;
}

/** מריץ קלט אחד דרך כל הצינור ומחזיר את ההפרות. */
function run(rawTrainee, studio, label) {
  const trainee = normalizeTrainee(rawTrainee);
  const v = validateInput(trainee, studio);
  if (!v.ok) return { skipped: true, errors: v.errors };
  const program = generateWeeklyProgram(trainee, studio);
  return { skipped: false, problems: auditProgram(program, trainee, studio), program, label };
}

// ---------------------------------------------------------------- כל מגבלה, כל חומרה
test('כל מגבלה רפואית × כל דרגת חומרה × כמה סוגי סטודיו — אף הפרה', () => {
  const failures = [];
  let checked = 0;
  for (const cid of CONSTRAINT_IDS) {
    for (const severity of ['acute', 'subacute', 'managed']) {
      for (const studio of [byId.full_gym, byId.boutique_small, byId.senior_center]) {
        const r = run({
          id: `c_${cid}`, name: cid, age: 45, level: 'novice', daysPerWeek: 3, sessionMinutes: 60,
          primaryGoal: 'general_fitness', goals: ['general_fitness'],
          constraints: [{ id: cid, severity }], medicalClearance: true,
        }, studio, `${cid}/${severity}/${studio.id}`);
        if (r.skipped) continue;
        checked += 1;
        if (r.problems.length) failures.push(`${r.label}: ${r.problems.slice(0, 3).join(' | ')}`);
      }
    }
  }
  assert.ok(checked > 400, `נבדקו ${checked} צירופים בלבד`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} כשלים מתוך ${checked}`);
});

// ---------------------------------------------------------------- כל מטרה × רמה × ימים
test('כל מטרה × כל רמה × 1-6 ימים × כל סוגי הסטודיו — אף הפרה', () => {
  const failures = [];
  let checked = 0;
  for (const goal of GOALS) {
    for (const level of LEVELS) {
      for (let days = 1; days <= 6; days++) {
        for (const studio of studios) {
          const r = run({
            id: `g_${goal}_${level}_${days}`, name: goal, age: 35, level, daysPerWeek: days,
            sessionMinutes: 60, primaryGoal: goal, goals: [goal],
          }, studio, `${goal}/${level}/${days}d/${studio.id}`);
          if (r.skipped) continue;
          checked += 1;
          if (r.problems.length) failures.push(`${r.label}: ${r.problems.slice(0, 2).join(' | ')}`);
          if (r.program.days.length !== days) failures.push(`${r.label}: נוצרו ${r.program.days.length} ימים`);
        }
      }
    }
  }
  assert.ok(checked > 2000, `נבדקו ${checked} צירופים`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} כשלים מתוך ${checked}`);
});

// ---------------------------------------------------------------- פרופילים אקראיים
test('600 פרופילים אקראיים על פני כל סוגי הסטודיו — אף הפרה', () => {
  const rng = makeRng('matrix-fuzz-v1');
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const failures = [];
  let checked = 0;
  let skipped = 0;

  for (let i = 0; i < 600; i++) {
    const nConstraints = Math.floor(rng() * 4);
    const constraints = [];
    for (let k = 0; k < nConstraints; k++) {
      const id = pick(CONSTRAINT_IDS);
      if (!constraints.some((c) => c.id === id)) {
        constraints.push({ id, severity: pick(['acute', 'subacute', 'managed']), side: pick([null, 'left', 'right']) });
      }
    }
    const studio = pick(studios);
    const trainee = {
      id: `fuzz_${i}`, name: `אקראי ${i}`,
      sex: pick(['female', 'male', 'unspecified']),
      age: 14 + Math.floor(rng() * 76),
      heightCm: 150 + Math.floor(rng() * 45),
      weightKg: 45 + Math.floor(rng() * 75),
      level: pick(LEVELS),
      primaryGoal: pick(GOALS), goals: [pick(GOALS)],
      daysPerWeek: 1 + Math.floor(rng() * 6),
      sessionMinutes: pick([20, 30, 45, 60, 75, 90, 120]),
      constraints,
      sport: pick(['none', 'running', 'cycling', 'swimming', 'football', 'basketball', 'tennis', 'crossfit', 'martial_arts', 'dance', 'climbing', 'hiking']),
      externalSessions: Math.floor(rng() * 5),
      lifestyle: pick(['sedentary', 'active', 'physical_job', 'shift_work']),
      cyclePhase: pick(['unknown', 'menstrual', 'follicular', 'luteal', 'postmenopause']),
      sleepQuality: 1 + Math.floor(rng() * 5),
      stressLevel: 1 + Math.floor(rng() * 5),
      nutritionAdherence: 1 + Math.floor(rng() * 5),
      varietyPreference: pick(['low', 'balanced', 'high']),
      mesocycleWeek: 1 + Math.floor(rng() * 4),
      travelWeek: rng() < 0.08,
      medicalClearance: true,
    };
    const r = run(trainee, studio, `fuzz#${i}/${studio.id}`);
    if (r.skipped) { skipped += 1; continue; }
    checked += 1;
    if (r.problems.length) failures.push(`${r.label}: ${r.problems.slice(0, 2).join(' | ')}`);
  }

  assert.ok(checked >= 550, `נבדקו ${checked} פרופילים (דולגו ${skipped})`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} כשלים מתוך ${checked}`);
});

// ---------------------------------------------------------------- מקרי קיצון מוגדרים
test('מקרי קיצון: סטודיו ריק, תקרה נמוכה, מגבלת רעש, שבוע נסיעה, שלוש מגבלות חריפות', () => {
  const cases = [
    {
      label: 'סטודיו ללא ציוד כלל',
      studio: normalizeStudio({ id: 'nothing', equipment: [], spaceLevel: 'small' }),
      trainee: { id: 'e1', level: 'novice', daysPerWeek: 3, primaryGoal: 'general_fitness', goals: ['general_fitness'] },
    },
    {
      label: 'תקרה נמוכה + מגבלת רעש + שטח קטן',
      studio: byId.home_micro,
      trainee: { id: 'e2', level: 'intermediate', daysPerWeek: 4, primaryGoal: 'hypertrophy', goals: ['hypertrophy'] },
    },
    {
      label: 'שבוע נסיעה בחדר מלון',
      studio: byId.full_gym,
      trainee: { id: 'e3', level: 'intermediate', daysPerWeek: 3, primaryGoal: 'fat_loss', goals: ['fat_loss'], travelWeek: true },
    },
    {
      label: 'שלוש מגבלות חריפות במקביל',
      studio: byId.full_gym,
      trainee: {
        id: 'e4', level: 'novice', daysPerWeek: 3, primaryGoal: 'rehab', goals: ['rehab'],
        constraints: [
          { id: 'low_back_pain', severity: 'acute' },
          { id: 'shoulder_impingement', severity: 'acute' },
          { id: 'knee_pain_patellofemoral', severity: 'acute' },
        ],
      },
    },
    {
      label: 'הריון מתקדם בסטודיו פילאטיס',
      studio: byId.pilates_studio,
      trainee: {
        id: 'e5', level: 'novice', daysPerWeek: 2, primaryGoal: 'general_fitness', goals: ['general_fitness'],
        constraints: [{ id: 'pregnancy_t2_t3', severity: 'subacute' }],
      },
    },
    {
      label: 'בן 16 בסטודיו אגרוף',
      studio: byId.boxing_gym,
      trainee: {
        id: 'e6', age: 16, level: 'beginner', daysPerWeek: 3, primaryGoal: 'athletic_performance',
        goals: ['athletic_performance'], sport: 'martial_arts', externalSessions: 3,
      },
    },
    {
      label: 'בן 82 עם פרקינסון וירך מוחלפת',
      studio: byId.senior_center,
      trainee: {
        id: 'e7', age: 82, level: 'beginner', daysPerWeek: 2, primaryGoal: 'active_aging', goals: ['active_aging'],
        constraints: [{ id: 'parkinsons', severity: 'managed' }, { id: 'hip_replacement', severity: 'managed', side: 'right' }],
      },
    },
    {
      label: 'אימון של 20 דקות פעם בשבוע',
      studio: byId.boutique_small,
      trainee: { id: 'e8', level: 'beginner', daysPerWeek: 1, sessionMinutes: 20, primaryGoal: 'general_fitness', goals: ['general_fitness'] },
    },
  ];

  for (const c of cases) {
    const r = run(c.trainee, c.studio, c.label);
    assert.equal(r.skipped, false, `${c.label}: נחסם באימות`);
    assert.deepEqual(r.problems, [], `${c.label}`);
    assert.ok(r.program.days.every((d) => d.blocks.length >= 3), `${c.label}: יש אימון עם פחות מ-3 תרגילים`);
  }
});

test('קלט שחייב להיחסם נחסם, ולא מיוצר עבורו אימון', () => {
  const child = run({ id: 'kid', age: 9, level: 'beginner', daysPerWeek: 3, primaryGoal: 'strength', goals: ['strength'] }, byId.full_gym);
  assert.equal(child.skipped, true);
  assert.ok(child.errors.some((e) => e.includes('13')));

  const noClearance = run({
    id: 'nc', age: 60, level: 'novice', daysPerWeek: 3, primaryGoal: 'general_fitness', goals: ['general_fitness'],
    constraints: [{ id: 'cardiac', severity: 'acute' }], medicalClearance: false,
  }, byId.full_gym);
  assert.equal(noClearance.skipped, true);
  assert.ok(noClearance.errors.some((e) => e.includes('אישור רפואי')));
});
