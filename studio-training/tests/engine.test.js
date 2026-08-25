import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProgram, buildStudioPrograms, normalizeStudio, normalizeTrainee,
  applyFeedback, advanceWeek, nextTarget, chooseSplit, getExercise,
  buildCandidatePool, buildProbes, achievableLoad,
  sortMeasurements, series, summary, allSeries,
  EXERCISES, CONSTRAINTS, taxonomy,
} from '../src/index.js';
import { FLAGS, STRESS_KEYS } from '../src/domain/exercises.js';
import { swapExercise, generateWeeklyProgram } from '../src/engine/generate.js';
import { STUDIOS, TRAINEES } from '../src/seed.js';

const studioOf = (t) => STUDIOS.find((s) => s.id === t.studioId);
const allBlocks = (p) => p.days.flatMap((d) => d.blocks);

// ---------------------------------------------------------------- שלמות המאגר
test('כל תרגיל במאגר משתמש בטקסונומיה תקינה', () => {
  for (const ex of EXERCISES) {
    assert.ok(taxonomy.PATTERNS.includes(ex.pattern), `דפוס לא מוכר ב-${ex.id}: ${ex.pattern}`);
    assert.ok(ex.eq.length > 0 && ex.eq.every((o) => o.length > 0), `ציוד חסר ב-${ex.id}`);
    for (const opt of ex.eq) for (const item of opt) {
      assert.ok(taxonomy.EQUIPMENT.includes(item), `ציוד לא מוכר ב-${ex.id}: ${item}`);
    }
    for (const f of ex.flags) assert.ok(FLAGS.includes(f), `דגל לא מוכר ב-${ex.id}: ${f}`);
    for (const k of Object.keys(ex.stress)) assert.ok(STRESS_KEYS.includes(k), `מפתח עומס לא מוכר ב-${ex.id}: ${k}`);
    assert.ok(ex.repMin <= ex.repMax, `טווח חזרות הפוך ב-${ex.id}`);
    assert.ok(ex.skill >= 1 && ex.skill <= 5, `רמת מיומנות לא תקינה ב-${ex.id}`);
  }
});

test('כל תרגיל שמופיע כהמלצה במגבלה קיים במאגר', () => {
  for (const [id, c] of Object.entries(CONSTRAINTS)) {
    for (const exId of c.prescribe || []) {
      assert.doesNotThrow(() => getExercise(exId), `${id} ממליץ על תרגיל לא קיים: ${exId}`);
    }
  }
});

// ---------------------------------------------------------------- יצירה בסיסית
test('נוצרת תכנית תקינה לכל מתאמני הדמו, ללא שגיאות איכות', () => {
  for (const t of TRAINEES) {
    const r = buildProgram(t, studioOf(t));
    assert.ok(r.ok, `${t.name}: ${r.errors.join(', ')}`);
    assert.equal(r.program.days.length, normalizeTrainee(t).daysPerWeek);
    assert.ok(r.program.qa.passed, `${t.name}: ${JSON.stringify(r.program.qa.issues.filter((i) => i.level === 'error'))}`);
    assert.ok(r.program.qa.score >= 70, `${t.name}: ציון איכות נמוך ${r.program.qa.score}`);
  }
});

test('אין תרגיל כפול באותו אימון', () => {
  for (const t of TRAINEES) {
    for (const day of buildProgram(t, studioOf(t)).program.days) {
      const ids = day.blocks.map((b) => b.exercise.id);
      assert.equal(new Set(ids).size, ids.length, `${t.name}/${day.dayLabel}: כפילות`);
    }
  }
});

test('אורך האימון המשוער נשאר בתחום סביר סביב הזמן שהוקצה', () => {
  for (const t of TRAINEES) {
    for (const day of buildProgram(t, studioOf(t)).program.days) {
      // אורך האימון נמדד מול הזמן שהוקצה *לאותו יום* (ייתכן שונה מיום ליום)
      assert.ok(day.estimatedMinutes <= day.sessionMinutes * 1.1,
        `${t.name}/${day.dayLabel}: ${day.estimatedMinutes} דק' מול ${day.sessionMinutes}`);
    }
  }
});

test('אותו קלט מייצר בדיוק את אותה תכנית (דטרמיניזם)', () => {
  const t = TRAINEES[0];
  const a = buildProgram(t, studioOf(t)).program;
  const b = buildProgram(t, studioOf(t)).program;
  assert.deepEqual(allBlocks(a).map((x) => x.exercise.id), allBlocks(b).map((x) => x.exercise.id));
});

// ---------------------------------------------------------------- ציוד
test('סטודיו ללא ציוד מייצר תכנית ממשקל גוף בלבד', () => {
  const r = buildProgram({ id: 'bw', name: 'משקל גוף', level: 'novice', daysPerWeek: 3 },
    { id: 'empty', name: 'ללא ציוד', equipment: [] });
  assert.ok(r.ok);
  for (const b of allBlocks(r.program)) {
    assert.deepEqual(b.exercise.equipment, ['bodyweight'], `${b.exercise.name} דורש ציוד שלא קיים`);
  }
});

test('ציוד חסר בסטודיו לעולם לא נבחר', () => {
  for (const t of TRAINEES) {
    const studio = normalizeStudio(studioOf(t));
    for (const b of allBlocks(buildProgram(t, studioOf(t)).program)) {
      for (const item of b.exercise.equipment) {
        assert.ok(studio.equipment.get(item) > 0, `${b.exercise.name} דורש ${item} שאינו בסטודיו`);
      }
    }
  }
});

test('ציוד בחסימה אישית של המתאמן אינו נבחר', () => {
  const t = { ...TRAINEES[1], equipmentBlocklist: ['barbell', 'dumbbell'] };
  for (const b of allBlocks(buildProgram(t, studioOf(TRAINEES[1])).program)) {
    assert.ok(!b.exercise.equipment.includes('barbell'));
    assert.ok(!b.exercise.equipment.includes('dumbbell'));
  }
});

// ---------------------------------------------------------------- פציעות
test('צביטה בכתף — אין אף תרגיל מעל הראש', () => {
  const t = { id: 'x', level: 'intermediate', daysPerWeek: 4, primaryGoal: 'hypertrophy', goals: ['hypertrophy'], constraints: [{ id: 'shoulder_impingement', severity: 'acute' }] };
  for (const b of allBlocks(buildProgram(t, STUDIOS[0]).program)) {
    assert.ok(!getExercise(b.exercise.id).flags.includes('overhead'), `${b.exercise.name} מעל הראש`);
  }
});

test('הריון מתקדם — אין שכיבה על הגב/בטן, כפיפת בטן, זעזוע או עצירת נשימה', () => {
  const t = { id: 'p', level: 'novice', daysPerWeek: 3, primaryGoal: 'general_fitness', goals: ['general_fitness'], constraints: [{ id: 'pregnancy_t2_t3', severity: 'subacute' }] };
  const forbidden = ['lying_supine', 'lying_prone', 'spinal_flexion', 'impact', 'high_valsalva'];
  for (const b of allBlocks(buildProgram(t, STUDIOS[0]).program)) {
    const ex = getExercise(b.exercise.id);
    for (const f of forbidden) assert.ok(!ex.flags.includes(f), `${ex.name} מכיל ${f}`);
  }
});

test('כאב גב תחתון חריף — ללא כפיפת עמוד שדרה וללא עומס מותני גבוה', () => {
  const t = { id: 'lb', level: 'intermediate', daysPerWeek: 4, primaryGoal: 'strength', goals: ['strength'], constraints: [{ id: 'low_back_pain', severity: 'acute' }] };
  for (const b of allBlocks(buildProgram(t, STUDIOS[0]).program)) {
    const ex = getExercise(b.exercise.id);
    assert.ok(!ex.flags.includes('spinal_flexion'), `${ex.name} כופף עמוד שדרה`);
    assert.ok(ex.stress.lumbar <= 1, `${ex.name} מעמיס על הגב התחתון (${ex.stress.lumbar})`);
  }
});

test('כאב ברך — ללא כפיפת ברך עמוקה וללא זעזוע', () => {
  const t = { id: 'k', level: 'novice', daysPerWeek: 3, primaryGoal: 'fat_loss', goals: ['fat_loss'], constraints: [{ id: 'knee_pain_patellofemoral', severity: 'acute' }] };
  for (const b of allBlocks(buildProgram(t, STUDIOS[0]).program)) {
    const ex = getExercise(b.exercise.id);
    assert.ok(!ex.flags.includes('deep_knee_flexion') && !ex.flags.includes('impact'), ex.name);
    assert.ok(ex.stress.knee <= 0, `${ex.name} עומס ברך ${ex.stress.knee}`);
  }
});

test('רמת מיומנות התרגילים לא עולה על רמת המתאמן', () => {
  const t = { id: 'beg', level: 'beginner', daysPerWeek: 3, primaryGoal: 'general_fitness', goals: ['general_fitness'] };
  for (const b of allBlocks(buildProgram(t, STUDIOS[0]).program)) {
    assert.ok(b.exercise.skill <= 2, `${b.exercise.name} ברמה ${b.exercise.skill}`);
  }
});

test('תרגיל שהמתאמן לא אוהב לא מופיע', () => {
  const t = { ...TRAINEES[1], dislikes: ['leg_press', 'lat_pulldown', 'cable_pushdown'] };
  for (const b of allBlocks(buildProgram(t, studioOf(TRAINEES[1])).program)) {
    assert.ok(!t.dislikes.includes(b.exercise.id));
  }
});

// ---------------------------------------------------------------- חלוקה ונפח
test('בחירת החלוקה מתאימה למספר ימי האימון', () => {
  const base = { level: 'intermediate', primaryGoal: 'hypertrophy', goals: ['hypertrophy'], constraints: [] };
  const studio = normalizeStudio(STUDIOS[0]);
  assert.equal(chooseSplit(normalizeTrainee({ ...base, daysPerWeek: 2 }), studio).split, 'full_body');
  assert.equal(chooseSplit(normalizeTrainee({ ...base, daysPerWeek: 3 }), studio).split, 'abc');
  assert.equal(chooseSplit(normalizeTrainee({ ...base, daysPerWeek: 4, level: 'beginner' }), studio).split, 'upper_lower');
  assert.equal(chooseSplit(normalizeTrainee({ ...base, daysPerWeek: 6 }), studio).days.length, 6);
});

test('שבוע דילוד מוריד נפח ומעלה RIR', () => {
  const t = { ...TRAINEES[1], mesocycleWeek: 4, mesocycleLength: 4 };
  const normal = buildProgram({ ...t, mesocycleWeek: 3 }, studioOf(TRAINEES[1])).program;
  const deload = buildProgram(t, studioOf(TRAINEES[1])).program;
  assert.ok(deload.meta.deload);
  const sets = (p) => allBlocks(p).reduce((s, b) => s + b.prescription.sets, 0);
  assert.ok(sets(deload) < sets(normal), 'נפח הדילוד אינו נמוך יותר');
});

test('טווח החזרות תואם גם למטרה וגם לתרגיל', () => {
  for (const t of TRAINEES) {
    for (const b of allBlocks(buildProgram(t, studioOf(t)).program)) {
      const ex = getExercise(b.exercise.id);
      if (ex.type === 'conditioning' || ex.type === 'mobility') continue;
      assert.ok(b.prescription.repsMin >= ex.repMin && b.prescription.repsMax <= ex.repMax,
        `${ex.name}: ${b.prescription.reps} מחוץ לטווח ${ex.repMin}-${ex.repMax}`);
    }
  }
});

test('מטרת כוח מייצרת חזרות נמוכות ומנוחות ארוכות יותר ממטרת סיבולת', () => {
  const mk = (goal) => buildProgram({ id: 'g', level: 'intermediate', daysPerWeek: 3, primaryGoal: goal, goals: [goal] }, STUDIOS[0]).program;
  const strength = mk('strength'); const endurance = mk('endurance');
  const main = (p) => allBlocks(p).filter((b) => b.role === 'main');
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(avg(main(strength).map((b) => b.prescription.repsMax)) < avg(main(endurance).map((b) => b.prescription.repsMax)));
  assert.ok(avg(main(strength).map((b) => b.prescription.restSec)) > avg(main(endurance).map((b) => b.prescription.restSec)));
});

// ---------------------------------------------------------------- משוב ופרוגרסיה
test('דיווח כאב מוסיף מגבלה ומסיר את התרגיל מהתכנית הבאה', () => {
  const trainee = normalizeTrainee(TRAINEES[4]);
  const { trainee: updated, changes } = applyFeedback(trainee, [
    { type: 'pain', exerciseId: 'box_jump', payload: { joint: 'knee', painLevel: 8 } },
  ]);
  assert.ok(updated.constraints.some((c) => c.id === 'knee_pain_patellofemoral' && c.severity === 'acute'));
  // כאב נרשם כחסימה קשה עם סיבה, ולא כ"לא אוהב"
  assert.ok(updated.blockedExercises.some((b) => b.id === 'box_jump' && b.reason.includes('כאב')));
  assert.ok(changes.length >= 2);
  const next = buildProgram(updated, studioOf(TRAINEES[4])).program;
  assert.ok(!allBlocks(next).some((b) => b.exercise.id === 'box_jump'));
});

test('תרגיל שנבדק בשטח ואושר נכנס לתכנית למרות המגבלה', () => {
  const base = {
    id: 'probe1', level: 'novice', daysPerWeek: 3, primaryGoal: 'general_fitness', goals: ['general_fitness'],
    constraints: [{ id: 'knee_pain_patellofemoral', severity: 'acute' }],
  };
  const without = buildProgram(base, STUDIOS[0]).program;
  assert.ok(!allBlocks(without).some((b) => b.exercise.id === 'goblet_squat'), 'הסקוואט אמור להיפסל בלי אישור');

  const withApproval = buildProgram({ ...base, approvedExercises: [{ id: 'goblet_squat', note: 'נבדק, אין כאב' }] }, STUDIOS[0]).program;
  assert.ok(allBlocks(withApproval).some((b) => b.exercise.id === 'goblet_squat'), 'אחרי אישור בשטח התרגיל אמור להיכנס');
});

test('תרגיל חסום לעולם לא חוזר לתכנית', () => {
  const t = { ...TRAINEES[1], blockedExercises: [{ id: 'leg_press', reason: 'כאב' }] };
  assert.ok(!allBlocks(buildProgram(t, studioOf(TRAINEES[1])).program).some((b) => b.exercise.id === 'leg_press'));
});

test('תרגיל בדיקה מוצע לפציעה מקומית ולא למצב מערכתי', () => {
  const knee = normalizeTrainee({ id: 'k', constraints: [{ id: 'knee_pain_patellofemoral', severity: 'acute' }] });
  const probes = buildProbes(knee, normalizeStudio(STUDIOS[0]));
  assert.ok(probes.length >= 1, 'לא הוצע תרגיל בדיקה לברך');
  assert.equal(probes[0].locked, true, 'בפציעה חריפה הבדיקה חייבת להיות נעולה');
  assert.ok(probes[0].stopRule.length > 10);
  assert.ok(getExercise(probes[0].exercise.id).skill <= 2, 'תרגיל הבדיקה חייב להיות פשוט');

  const pregnant = normalizeTrainee({ id: 'p', constraints: [{ id: 'pregnancy_t2_t3', severity: 'subacute' }] });
  assert.equal(buildProbes(pregnant, normalizeStudio(STUDIOS[0])).length, 0,
    'אין להציע תרגיל בדיקה למגבלה מערכתית');
});

test('תוצאת בדיקה חיובית מאשרת, ושלילית חוסמת', () => {
  const t = normalizeTrainee({ id: 'pr', constraints: [{ id: 'knee_pain_patellofemoral', severity: 'subacute' }] });
  const ok = applyFeedback(t, [{ type: 'probe_ok', exerciseId: 'wall_sit' }]).trainee;
  assert.ok(ok.approvedExercises.some((a) => a.id === 'wall_sit' && a.source === 'probe'));

  const bad = applyFeedback(t, [{ type: 'probe_pain', exerciseId: 'wall_sit', payload: { painLevel: 6 } }]).trainee;
  assert.ok(bad.blockedExercises.some((b) => b.id === 'wall_sit'));
  assert.ok(!bad.approvedExercises.some((a) => a.id === 'wall_sit'));
});

test('תרגיל שהמאמן כתב נשמר כטיוטה, ונכנס לשיבוץ רק אחרי בדיקה מוצלחת', () => {
  const base = normalizeTrainee({ id: 'cst', level: 'novice', daysPerWeek: 3, primaryGoal: 'general_fitness', goals: ['general_fitness'] });
  const payload = {
    id: 'custom_rope', name: 'משיכת חבל אלכסונית', description: 'משיכה אלכסונית מלמעלה למטה',
    sets: 3, reps: '10-12', load: '15', notes: 'ליבה מכווצת',
    pattern: 'horizontal_pull', primaryMuscle: 'back_upper', equipment: ['cable_crossover'],
  };
  const added = applyFeedback(base, [{ type: 'custom_add', payload }]).trainee;
  assert.equal(added.customExercises[0].status, 'draft');
  assert.ok(!allBlocks(buildProgram(added, STUDIOS[0]).program).some((b) => b.exercise.id === 'custom_rope'),
    'טיוטה לא אמורה להיכנס לתכנית');

  const tested = applyFeedback(added, [{ type: 'custom_tested_ok', exerciseId: 'custom_rope' }]).trainee;
  assert.equal(tested.customExercises[0].status, 'tested_ok');
  const pool = buildCandidatePool(EXERCISES, tested, normalizeStudio(STUDIOS[0]));
  assert.ok(pool.eligible.some((c) => c.exercise.id === 'custom_rope'),
    'אחרי בדיקה מוצלחת התרגיל אמור להיות זמין לשיבוץ');
});

test('לכל תרגיל במאגר יש תיאור מדויק שמוצג למאמן', () => {
  for (const ex of EXERCISES) {
    assert.ok(ex.description && ex.description.length >= 40,
      `${ex.id} (${ex.name}): תיאור חסר או קצר מדי`);
    assert.ok(/[.!]$/.test(ex.description.trim()), `${ex.id}: התיאור אינו משפט שלם`);
  }
});

test('דילוג פעמיים על אותו תרגיל מסיר אותו', () => {
  const { trainee } = applyFeedback(normalizeTrainee(TRAINEES[0]), [
    { type: 'skip', exerciseId: 'cable_crunch' }, { type: 'skip', exerciseId: 'cable_crunch' },
  ]);
  assert.ok(trainee.dislikes.includes('cable_crunch'));
});

test('דיווחי "קל מדי" חוזרים מעלים את רמת המתאמן', () => {
  const { trainee } = applyFeedback(normalizeTrainee({ ...TRAINEES[0], level: 'beginner' }),
    ['db_curl', 'goblet_squat', 'plank', 'lat_pulldown'].map((id) => ({ type: 'too_easy', exerciseId: id })));
  assert.equal(trainee.level, 'novice');
});

test('ציוד תפוס נחסם לתכנית הבאה', () => {
  const { trainee } = applyFeedback(normalizeTrainee(TRAINEES[1]), [
    { type: 'equipment_busy', exerciseId: 'leg_press', payload: { equipment: ['leg_press'] } },
  ]);
  assert.ok(trainee.equipmentBlocklist.includes('leg_press'));
  assert.ok(!allBlocks(buildProgram(trainee, studioOf(TRAINEES[1])).program).some((b) => b.exercise.id === 'leg_press'));
});

test('הצטברות סימני עומס יתר ממליצה על שבוע דילוד ומקדמת אליו', () => {
  const events = [
    ...Array(3).fill({ type: 'too_hard', exerciseId: 'bb_bench_press' }),
    { type: 'pain', exerciseId: 'bb_bench_press', payload: { joint: 'shoulder', painLevel: 3 } },
    { type: 'skip', exerciseId: 'db_fly' },
  ];
  const { trainee, flags } = applyFeedback(normalizeTrainee({ ...TRAINEES[1], mesocycleWeek: 1 }), events);
  assert.ok(flags.deloadRecommended, `ציון עייפות ${flags.fatigueScore}`);
  assert.equal(advanceWeek(trainee, flags).mesocycleWeek % trainee.mesocycleLength, 0);
});

test('פרוגרסיה: קצה טווח במאמץ נמוך מעלה משקל, מאמץ גבוה מוריד', () => {
  const ex = getExercise('bb_bench_press');
  const rx = { sets: 3, repsMin: 6, repsMax: 10, rir: 2 };
  const up = nextTarget(ex, rx, { load: 60, reps: 10, rpe: 6 });
  assert.equal(up.action, 'increase_load');
  assert.ok(up.load > 60);
  const down = nextTarget(ex, rx, { load: 60, reps: 6, rpe: 9.5 });
  assert.equal(down.action, 'reduce_load');
  assert.ok(down.load < 60);
});

// ---------------------------------------------------------------- החלפת תרגיל
test('החלפת תרגיל בשטח מחליפה, מעדכנת מרשם ומריצה בקרת איכות מחדש', () => {
  const t = normalizeTrainee(TRAINEES[1]);
  const s = normalizeStudio(studioOf(TRAINEES[1]));
  const program = generateWeeklyProgram(t, s);
  const before = program.days[0].blocks[1].exercise.id;
  const alt = program.days[0].blocks[1].alternatives[0].id;
  swapExercise(program, t, s, { dayIndex: 0, blockIndex: 1, alternativeId: alt });
  assert.equal(program.days[0].blocks[1].exercise.id, alt);
  assert.equal(program.days[0].blocks[1].swappedFrom, before);
  assert.ok(program.qa.score > 0);
});

test('החלפה לתרגיל שאינו זמין בסטודיו נדחית', () => {
  const t = normalizeTrainee(TRAINEES[2]);
  const s = normalizeStudio(studioOf(TRAINEES[2]));
  const program = generateWeeklyProgram(t, s);
  assert.throws(() => swapExercise(program, t, s, { dayIndex: 0, blockIndex: 0, alternativeId: 'hack_squat' }), /אינו זמין|אינו מתאים/);
});

// ---------------------------------------------------------------- אימות קלט
test('קלט לא תקין נעצר עם הודעה ברורה', () => {
  const r = buildProgram({ id: 'bad', primaryGoal: 'לרוץ מהר', goals: ['לרוץ מהר'], constraints: [{ id: 'no_such_injury' }] }, STUDIOS[0]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('מטרה לא מוכרת')));
  assert.ok(r.errors.some((e) => e.includes('מגבלה לא מוכרת')));
});

test('יצירה קבוצתית לכל מתאמני הסטודיו', () => {
  const trainees = TRAINEES.filter((t) => t.studioId === 'full_gym');
  const batch = buildStudioPrograms(trainees, STUDIOS[0]);
  assert.equal(batch.total, trainees.length);
  assert.equal(batch.failed, 0);
  assert.equal(batch.qaFailed, 0);
});

// ---------------------------------------------------------------- משקלים, דרישה והערות
test('לכל תרגיל שמעמיסים בו מופיע משקל עבודה בקילוגרמים', () => {
  const t = { id: 'w', name: 'עם משקל', level: 'intermediate', age: 32, weightKg: 82,
    daysPerWeek: 3, primaryGoal: 'hypertrophy', goals: ['hypertrophy'] };
  const program = buildProgram(t, STUDIOS[0]).program;
  const loadable = allBlocks(program).filter((b) => b.exercise.loadable
    && !['mobility', 'conditioning'].includes(b.exercise.type));
  assert.ok(loadable.length >= 8, 'מעט מדי תרגילים שניתן להעמיס בהם');
  for (const b of loadable) {
    assert.ok(b.load && typeof b.load.kg === 'number' && b.load.kg > 0,
      `${b.exercise.name}: אין משקל עבודה`);
    assert.ok(b.load.label, `${b.exercise.name}: אין הסבר מאיפה המשקל`);
  }
});

test('משקל שהמאמן קבע גובר על ההצעה ונשמר לשבוע הבא', () => {
  const base = { id: 'set', level: 'intermediate', age: 30, weightKg: 80, daysPerWeek: 3,
    primaryGoal: 'strength', goals: ['strength'] };
  const before = buildProgram(base, STUDIOS[0]).program;
  const target = allBlocks(before).find((b) => b.load?.source === 'estimate');
  assert.ok(target, 'לא נמצא תרגיל עם הצעת משקל');

  const withSet = buildProgram({
    ...base,
    history: { [target.exercise.id]: { trainerSet: { kg: 63.5, perSide: false, at: new Date().toISOString() } } },
  }, STUDIOS[0]).program;
  const after = allBlocks(withSet).find((b) => b.exercise.id === target.exercise.id);
  assert.equal(after.load.kg, 63.5);
  assert.equal(after.load.source, 'trainer');
});

test('משקל מוצע לעולם אינו עובר את המשקולת הכבדה בסטודיו', () => {
  const studio = { ...STUDIOS[0], dumbbellMaxKg: 12 };
  const program = buildProgram({ id: 'cap', level: 'advanced', age: 28, weightKg: 95,
    daysPerWeek: 3, primaryGoal: 'hypertrophy', goals: ['hypertrophy'] }, studio).program;
  for (const b of allBlocks(program)) {
    if (b.load?.perSide && b.exercise.equipment.includes('dumbbell')) {
      assert.ok(b.load.kg <= 12, `${b.exercise.name}: ${b.load.kg} ק״ג מעל תקרת הסטודיו`);
    }
  }
});

test('מתאמן מתקדם לא מקבל גרסאות מוקלות כתרגיל עיקרי', () => {
  const program = buildProgram({ id: 'adv', level: 'advanced', age: 29, weightKg: 88,
    daysPerWeek: 4, primaryGoal: 'hypertrophy', goals: ['hypertrophy'] }, STUDIOS[0]).program;
  const key = allBlocks(program).filter((b) => ['main', 'secondary'].includes(b.role)
    && !['mobility', 'conditioning'].includes(b.exercise.type));
  const tooEasy = key.filter((b) => getExercise(b.exercise.id).demand < 3);
  assert.deepEqual(tooEasy.map((b) => b.exercise.name), [],
    'תרגילים בעלי דרישה נמוכה מדי שובצו כעיקריים למתאמן מתקדם');
});

test('הערת מאמן משנה את התכנית בפועל, וכיבוי ההערה מחזיר אותה', () => {
  const base = { id: 'nt', level: 'intermediate', age: 35, weightKg: 80, daysPerWeek: 3,
    primaryGoal: 'hypertrophy', goals: ['hypertrophy'] };
  const plain = buildProgram(base, STUDIOS[0]).program;
  const sets = (p) => allBlocks(p).reduce((s, b) => s + b.prescription.sets, 0);

  const note = { id: 'n1', text: 'שבוע עמוס', directive: { type: 'reduce_volume', value: 25 }, active: true };
  const reduced = buildProgram({ ...base, notesLog: [note] }, STUDIOS[0]).program;
  assert.ok(sets(reduced) < sets(plain), 'הנפח לא ירד למרות ההנחיה');
  assert.ok(reduced.noteEffects.some((e) => e.effect.includes('25%')));

  const off = buildProgram({ ...base, notesLog: [{ ...note, active: false }] }, STUDIOS[0]).program;
  assert.equal(sets(off), sets(plain), 'הערה מושבתת עדיין השפיעה');
  assert.equal(off.noteEffects.length, 0);
});

test('הנחיה בהערה מסירה תרגיל וחוסמת ציוד', () => {
  const program = buildProgram({
    id: 'nt2', level: 'intermediate', age: 30, weightKg: 78, daysPerWeek: 3,
    primaryGoal: 'general_fitness', goals: ['general_fitness'],
    notesLog: [
      { text: 'לא אוהב לחיצת רגליים', directive: { type: 'avoid_exercise', value: 'leg_press' } },
      { text: 'הפולי מקולקל', directive: { type: 'equipment_unavailable', value: 'lat_pulldown' } },
    ],
  }, STUDIOS[0]).program;
  assert.ok(!allBlocks(program).some((b) => b.exercise.id === 'leg_press'));
  assert.ok(!allBlocks(program).some((b) => b.exercise.equipment.includes('lat_pulldown')));
});

test('תרגיל שהמתאמן כבר שולט בו מותר לו גם מעל רמתו', () => {
  const base = { id: 'kn', level: 'beginner', age: 26, weightKg: 74, daysPerWeek: 3,
    primaryGoal: 'strength', goals: ['strength'] };
  const studio = normalizeStudio(STUDIOS[0]);
  const plain = buildCandidatePool(EXERCISES, normalizeTrainee(base), studio);
  assert.ok(!plain.eligible.some((c) => c.exercise.id === 'conventional_deadlift'));

  const known = buildCandidatePool(EXERCISES,
    normalizeTrainee({ ...base, knownMovements: ['conventional_deadlift'] }), studio);
  assert.ok(known.eligible.some((c) => c.exercise.id === 'conventional_deadlift'),
    'תרגיל שסומן כידוע עדיין נחסם');
});

// ---------------------------------------------------------------- מלאי משקלים
test('משקל מותאם למה שבאמת אפשר להרכיב מהמלאי', () => {
  const studio = normalizeStudio({
    id: 'inv', equipment: ['barbell', 'dumbbell', 'squat_rack', 'bench_flat'],
    inventory: {
      bars: [{ kg: 20, count: 1, type: 'olympic' }],
      plates: [{ kg: 20, count: 4 }, { kg: 10, count: 2 }, { kg: 5, count: 2 }],
      dumbbells: [{ kg: 10, count: 2 }, { kg: 15, count: 2 }, { kg: 20, count: 1 }],
      kettlebells: [], fixedBars: [],
    },
  });
  const ex = getExercise('bb_back_squat');
  // מוט 20 + פלטות בזוגות: 20, 30, 40, 50, 60, 70, 80, 90, 100
  const r = achievableLoad(77, ex, studio);
  assert.ok([70, 80].includes(r.kg), `התקבל ${r.kg} — לא ניתן להרכבה`);
  assert.ok(r.text.includes('מוט 20'), 'אין פירוט הרכבה');

  // 100 ק״ג בדיוק: 20 + 2×(20+20)
  assert.equal(achievableLoad(100, ex, studio).kg, 100);

  // משקולת יד שיש ממנה רק אחת אינה זמינה כזוג
  const pair = achievableLoad(20, getExercise('db_bench_press'), studio);
  assert.equal(pair.kg, 15, 'נבחרה משקולת שאין ממנה זוג');
});

test('סקוואט לא נבנה על מוט EZ, וכפיפת מרפקים כן', () => {
  const studio = normalizeStudio({ id: 'bars', equipment: ['barbell', 'ez_bar', 'squat_rack'] });
  const squat = achievableLoad(40, getExercise('bb_back_squat'), studio);
  assert.ok(squat.text.includes('מוט 20') || squat.text.includes('מוט 15'), squat.text);
  const curl = achievableLoad(20, getExercise('ez_curl'), studio);
  assert.ok(curl.text.includes('מוט 7.5'), `כפיפת מרפקים לא השתמשה במוט EZ: ${curl.text}`);
});

test('התכנית מציגה פירוט הרכבה לתרגילי מוט', () => {
  const program = buildProgram({ id: 'bd', level: 'intermediate', age: 30, weightKg: 84,
    daysPerWeek: 3, primaryGoal: 'strength', goals: ['strength'] }, STUDIOS[0]).program;
  const barbell = allBlocks(program).find((b) => b.exercise.equipment.includes('barbell') && b.load?.kg);
  if (barbell) assert.ok(barbell.load.setup?.includes('מוט'), `אין פירוט: ${JSON.stringify(barbell.load)}`);
});

// ---------------------------------------------------------------- מדידות
test('מדידות: מיון, מניעת כפילות תאריך, וסדרות לכל מדד', () => {
  const list = [
    { date: '2026-03-05', weightKg: 88, girths: { waist: 97 } },
    { date: '2026-01-05', weightKg: 92, bodyFatPct: 28, girths: { waist: 104 } },
    { date: '2026-03-05', weightKg: 87.5, girths: { waist: 96 } },
  ];
  const sorted = sortMeasurements(list);
  assert.equal(sorted.length, 2, 'כפילות תאריך לא אוחדה');
  assert.equal(sorted[0].date, '2026-01-05');
  assert.equal(sorted[1].weightKg, 87.5, 'המדידה המאוחרת לא גברה');

  const w = series(sorted, 'weightKg');
  assert.equal(w.points.length, 2);
  assert.equal(w.delta, -4.5);

  const bf = series(sorted, 'bodyFatPct');
  assert.equal(bf.points.length, 1, 'נקודה ללא ערך נכללה בטעות');
});

test('סיכום מדידות מזהה אם השינוי בכיוון הרצוי', () => {
  const s = summary([
    { date: '2026-01-01', bodyFatPct: 30, girths: { arm: 33 } },
    { date: '2026-02-01', bodyFatPct: 27, girths: { arm: 34 } },
  ]);
  const fat = s.metrics.find((m) => m.key === 'bodyFatPct');
  const arm = s.metrics.find((m) => m.key === 'arm');
  assert.equal(fat.favorable, true, 'ירידה באחוז שומן לא סומנה כרצויה');
  assert.equal(arm.favorable, true, 'עלייה בהיקף זרוע לא סומנה כרצויה');
});

test('המדידה האחרונה קובעת את המשקל לחישוב עומסים', () => {
  const t = normalizeTrainee({
    id: 'm', weightKg: 100,
    measurements: [{ date: '2026-01-01', weightKg: 95 }, { date: '2026-04-01', weightKg: 88 }],
  });
  assert.equal(t.weightKg, 88, 'המשקל לא נלקח מהמדידה האחרונה');
});

test('מדידה ריקה או תאריך לא תקין אינם שוברים כלום', () => {
  const clean = sortMeasurements([{ date: 'לא תאריך' }, { date: '2026-05-05', weightKg: 'abc' }]);
  assert.equal(clean.length, 2);
  for (const m of clean) {
    assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(m.weightKg, null);
  }
  assert.deepEqual(allSeries(clean), [], 'נוצרה סדרה בלי נתונים');
});
