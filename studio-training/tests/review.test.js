/**
 * הביקורת.
 *
 * שני צדדים נבדקים כאן, והשני חשוב לא פחות מהראשון: שהבדיקה תופסת נתון
 * שגוי, ושהיא *שותקת* על מתאמן תקין. רשימת ממצאים שכולם רעש היא רשימה
 * שאיש לא קורא, ואז גם הממצא האמיתי נבלע בה.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { auditProgramFit, auditTrainee, reviewAll } from '../src/domain/review.js';
import { normalizeTrainee, normalizeStudio } from '../src/domain/models.js';
import { generateWeeklyProgram } from '../src/engine/generate.js';

const codes = (r) => r.findings.map((f) => f.code);

const healthy = () => normalizeTrainee({
  id: 'ok', name: 'מיכל', age: 34, sex: 'female', weightKg: 64, heightCm: 168,
  level: 'intermediate', trainingAgeMonths: 24, daysPerWeek: 3, sessionMinutes: 60,
  primaryGoal: 'hypertrophy', goals: ['hypertrophy'], levelSource: 'inferred',
  history: { bb_back_squat: { load: 70, reps: 6 } },
});

test('מתאמן תקין אינו מייצר אף ממצא', () => {
  const r = auditTrainee(healthy());
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings));
  assert.equal(r.score, 100);
});

test('משקל שהוקלד ביחידה שגויה נתפס לפי היחס לגובה', () => {
  // 185 "ק״ג" בגובה 175 — כמעט תמיד ליברות שהוקלדו כקילוגרמים
  const r = auditTrainee(normalizeTrainee({ ...healthy(), weightKg: 185, heightCm: 175 }));
  assert.ok(codes(r).includes('bmi_impossible'), codes(r).join(','));
  assert.ok(r.findings.find((f) => f.code === 'bmi_impossible').fix.includes('ליברות'));
});

test('ותק שאינו אפשרי בגיל הזה נתפס', () => {
  const r = auditTrainee(normalizeTrainee({ ...healthy(), age: 30, trainingAgeMonths: 300 }));
  assert.ok(codes(r).includes('training_age_before_birth'), codes(r).join(','));
});

test('משקל עבודה עם ספרה מיותרת נתפס לפי היחס למשקל הגוף', () => {
  const r = auditTrainee(normalizeTrainee({
    ...healthy(), weightKg: 64, history: { bb_back_squat: { load: 700, reps: 5 } },
  }));
  const hit = r.findings.find((f) => f.code === 'load_impossible');
  assert.ok(hit, codes(r).join(','));
  assert.ok(hit.message.includes('700'));
});

test('משקל עבודה גבוה אך אפשרי אינו מסומן', () => {
  // דדליפט 180 ק״ג במשקל גוף 80 הוא פי 2.25 — כבד, ולגמרי אמיתי
  const r = auditTrainee(normalizeTrainee({
    ...healthy(), weightKg: 80, history: { conventional_deadlift: { load: 180, reps: 3 } },
  }));
  assert.ok(!codes(r).includes('load_impossible'), 'מתאמן חזק סומן כטעות הקלדה');
});

test('שיקום בלי מגבלה רשומה מסומן, ועם מגבלה — לא', () => {
  const without = auditTrainee(normalizeTrainee({ ...healthy(), primaryGoal: 'rehab', goals: ['rehab'] }));
  assert.ok(codes(without).includes('rehab_without_constraint'));

  const withOne = auditTrainee(normalizeTrainee({
    ...healthy(), primaryGoal: 'rehab', goals: ['rehab'],
    constraints: [{ id: 'lower_back_pain', severity: 'moderate' }],
  }));
  assert.ok(!codes(withOne).includes('rehab_without_constraint'));
});

test('המדידה האחרונה גוברת על מה שהוקלד בטופס, ולכן אין כאן סתירה לדווח עליה', () => {
  const t = normalizeTrainee({ ...healthy(), weightKg: 64, measurements: [{ date: '2026-08-20', weightKg: 78 }] });
  assert.equal(t.weightKg, 78, 'הנרמול אינו מעדיף את המדידה האחרונה');
  assert.ok(!codes(auditTrainee(t)).includes('weight_stale'));
});

test('ימים זמינים שאינם מספיקים למספר האימונים', () => {
  const r = auditTrainee(normalizeTrainee({ ...healthy(), daysPerWeek: 4, preferredDays: ['sun', 'mon'] }));
  assert.ok(codes(r).includes('not_enough_days'));
});

/* ------------------------------------------------- התאמת התכנית למתאמן */

test('מגבלה שנוספה אחרי בניית התכנית היא שגיאה, לא הערה', () => {
  const t = normalizeTrainee({
    ...healthy(),
    constraints: [{ id: 'shoulder_impingement', severity: 'moderate', addedAt: '2026-08-20T00:00:00.000Z' }],
  });
  const snapshot = { at: '2026-08-01T00:00:00.000Z', program: { meta: { level: 'intermediate', goal: 'hypertrophy', daysPerWeek: 3 }, days: [] } };
  const r = auditProgramFit(t, snapshot, { now: new Date('2026-08-25') });
  const hit = r.findings.find((f) => f.code === 'constraint_after_program');
  assert.ok(hit, codes(r).join(','));
  assert.equal(hit.level, 'error');
});

test('תכנית שנבנתה לרמה אחרת מסומנת כדורשת בנייה מחדש', () => {
  const t = normalizeTrainee({ ...healthy(), level: 'advanced', trainingAgeMonths: 60 });
  const snapshot = { at: '2026-08-20T00:00:00.000Z', program: { meta: { level: 'beginner', goal: 'hypertrophy', daysPerWeek: 3 }, days: [] } };
  const r = auditProgramFit(t, snapshot, { now: new Date('2026-08-25') });
  assert.ok(codes(r).includes('level_changed'), codes(r).join(','));
});

test('תכנית טרייה שתואמת את הכרטיס אינה מייצרת ממצאים', () => {
  const t = healthy();
  const studio = normalizeStudio({ id: 's', name: 'ס', equipment: ['barbell', 'dumbbell', 'bench_flat', 'power_rack', 'lat_pulldown', 'cable_crossover', 'mat'] });
  const program = generateWeeklyProgram(t, studio, { week: 1 });
  const snapshot = { at: new Date('2026-08-25').toISOString(), studioId: 's', program };
  const r = auditProgramFit({ ...t, homeStudioId: 's', studioId: 's' }, snapshot, { now: new Date('2026-08-27') });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings.map((x) => x.message)));
});

test('מתאמן בלי תכנית כלל מסומן', () => {
  const r = auditProgramFit(healthy(), null);
  assert.ok(codes(r).includes('no_program'));
});

/* --------------------------------------------------------- מבט על הכול */

test('סקירת הסטודיו מסדרת את המתאמנים לפי דחיפות', () => {
  const broken = normalizeTrainee({ id: 'x', name: 'שבור', age: 30, weightKg: 200, heightCm: 165,
    level: 'beginner', daysPerWeek: 3, primaryGoal: 'general_fitness' });
  const fine = healthy();
  const out = reviewAll([fine, broken], { snapshotsByTrainee: new Map() });

  assert.equal(out.checked, 2);
  assert.equal(out.trainees[0].name, 'שבור', 'המתאמן הבעייתי אינו ראשון ברשימה');
  assert.ok(out.trainees[0].errors >= 1);
  assert.ok(out.common.length, 'אין סיכום של הבעיות הנפוצות');
  assert.ok(out.averageScore < 100);
});
