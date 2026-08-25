/**
 * רמת המתאמן ובחירת התרגילים לפיה.
 *
 * הבדיקות כאן נכתבו אחרי תלונה אמיתית: המערכת נתנה למתאמנים מנוסים
 * תרגילים קלים מדי (פלאנק, פילאטיס, תרגילי הפעלה) ותרגילים שאינם
 * רלוונטיים למטרה שלהם. כל בדיקה כאן נועלת היבט אחד של התיקון.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVEL_ORDER, SKILL_CEILING, TRAINING_AGE_MIN_MONTHS, fitsLevel, levelForPattern, levelFromStrength,
  resolveLevel, skillAllowed, standardFor, strengthByPattern, trainingValue, valueFloor,
} from '../src/domain/level.js';
import { BY_ID, EXERCISES } from '../src/domain/exercises.js';
import { normalizeStudio, normalizeTrainee } from '../src/domain/models.js';
import { generateWeeklyProgram } from '../src/engine/generate.js';

const byName = (n) => EXERCISES.find((e) => e.name.includes(n));

const GYM = ['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'bench_flat', 'bench_incline', 'squat_rack',
  'smith_machine', 'cable_crossover', 'lat_pulldown', 'seated_row_machine', 'chest_press_machine',
  'shoulder_press_machine', 'pec_deck', 'leg_press', 'leg_extension', 'leg_curl_seated', 'pullup_bar',
  'dip_station', 'mat', 'plyo_box', 'trx', 'ab_wheel'];

const studio = (over = {}) => normalizeStudio({ id: 'g', name: 'gym', equipment: GYM, dumbbellMaxKg: 50, ...over });
const trainee = (over = {}) => normalizeTrainee({
  id: 't', name: 'מתאמן', age: 28, weightKg: 82, heightCm: 180, sex: 'male',
  primaryGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, ...over,
});

/* ---------------------------------------------------------- קביעת הרמה */

test('הצהרה על רמה גבוהה נחסמת על ידי ותק שאינו מאפשר אותה', () => {
  const r = resolveLevel(trainee({ level: 'advanced', trainingAgeMonths: 3 }), BY_ID);
  assert.equal(r.claimed, 'advanced');
  assert.equal(r.label, 'novice', 'שלושה חודשים אינם הופכים אדם למתקדם');
  assert.ok(r.cappedByAge);
  assert.match(r.reasons[0], /ותק/);
});

test('ותק מספיק משאיר את ההצהרה על כנה', () => {
  const r = resolveLevel(trainee({ level: 'advanced', trainingAgeMonths: 60 }), BY_ID);
  assert.equal(r.label, 'advanced');
  assert.ok(!r.cappedByAge);
});

test('כל דרגה דורשת ותק גדול מזו שלפניה', () => {
  for (let i = 1; i < TRAINING_AGE_MIN_MONTHS.length; i++) {
    assert.ok(TRAINING_AGE_MIN_MONTHS[i] > TRAINING_AGE_MIN_MONTHS[i - 1]);
  }
});

test('כוח יחסי שנרשם בפועל מעלה את הרמה מעל ההצהרה', () => {
  // 150 ק"ג סקוואט על משקל גוף 80 = 1.875 — רמת מתקדם בתקן
  const t = trainee({
    level: 'beginner', trainingAgeMonths: 48, weightKg: 80,
    history: {
      bb_back_squat: { load: 150 },
      bb_bench_press: { load: 110 },
      bb_row: { load: 90 },
    },
  });
  const r = resolveLevel(t, BY_ID);
  assert.ok(r.index >= 2, `הרמה נשארה ${r.label} למרות משקלים של מתקדם`);
  assert.equal(r.confidence, 'high', 'שלושה דפוסים מוכחים = ביטחון גבוה');
  assert.ok(r.reasons.some((x) => x.includes('המשקלים')));
});

test('היעדר נתונים אינו ראיה לחולשה — הרמה נשארת כפי שהוצהרה', () => {
  const r = resolveLevel(trainee({ level: 'intermediate', trainingAgeMonths: 24, history: {} }), BY_ID);
  assert.equal(r.label, 'intermediate');
  assert.equal(r.confidence, 'low');
});

test('דפוס חזק בודד אינו הופך את כל הגוף למתקדם', () => {
  const t = trainee({
    level: 'novice', trainingAgeMonths: 48, weightKg: 80,
    history: { bb_back_squat: { load: 160 }, bb_ohp: { load: 20 }, bb_bench_press: { load: 40 } },
  });
  const r = resolveLevel(t, BY_ID);
  assert.ok(r.index < 3, 'סקוואט חזק לבדו העלה את הרמה לגובה לא מוצדק');
});

test('הרמה נשמרת לכל דפוס בנפרד', () => {
  const t = trainee({
    level: 'novice', trainingAgeMonths: 48, weightKg: 80,
    history: { bb_back_squat: { load: 160 } },
  });
  const r = resolveLevel(t, BY_ID);
  const squatEx = BY_ID.bb_back_squat;
  if (squatEx) {
    assert.ok(levelForPattern(r, squatEx.pattern) >= r.index,
      'דפוס שהוכח בו כוח אינו יכול להיות נמוך מהרמה הכללית');
  }
});

test('תקן הכוח מתחשב במין, ובפלג גוף עליון יותר מאשר בתחתון', () => {
  const male = { sex: 'male' };
  const female = { sex: 'female' };
  const mUp = standardFor('horizontal_push', male)[2];
  const fUp = standardFor('horizontal_push', female)[2];
  const mLow = standardFor('squat', male)[2];
  const fLow = standardFor('squat', female)[2];
  assert.ok(fUp < mUp, 'התקן העליון לנשים אמור להיות נמוך יותר');
  assert.ok(fLow / mLow > fUp / mUp, 'הפער בפלג הגוף התחתון קטן יותר');
});

test('חישוב הרמה מהכוח היחסי מדויק בגבולות', () => {
  const t = { sex: 'male' };
  assert.equal(levelFromStrength('squat', 40, 80, t).index, 0, '0.5×BW = מתחיל');
  assert.equal(levelFromStrength('squat', 80, 80, t).index, 1, '1.0×BW = מתחיל מתקדם');
  assert.equal(levelFromStrength('squat', 120, 80, t).index, 2, '1.5×BW = בינוני');
  assert.equal(levelFromStrength('squat', 160, 80, t).index, 3, '2.0×BW = מתקדם');
  assert.equal(levelFromStrength('squat', 100, null, t), null, 'בלי משקל גוף אין חישוב');
});

test('משקל לכל יד נספר כפול בחישוב הכוח', () => {
  const t = trainee({ weightKg: 80, history: { db_bench_press: { load: 40, perSide: true } } });
  const byPattern = strengthByPattern(t, BY_ID);
  const push = byPattern[BY_ID.db_bench_press?.pattern];
  if (push) assert.equal(push.loadKg, 80, 'שתי משקולות של 40 הן 80 ק״ג עבודה');
});

/* -------------------------------------------------- ערך אימוני ורצפות */

test('תרגיל הוראה מאבד ערך ככל שהרמה עולה, ותרגיל שניתן להעמיס שומר עליו', () => {
  const plank = byName('פלאנק');
  const squat = byName('סקוואט מוט על הגב');

  assert.ok(trainingValue(plank, 0) > trainingValue(plank, 3), 'פלאנק חייב לרדת בערכו עם הרמה');
  assert.equal(trainingValue(squat, 0), trainingValue(squat, 3), 'סקוואט שומר על ערכו בכל רמה');
});

test('משקל גוף תובעני טכנית אינו נחשב "קל" — מתח והרמת רגליים בתלייה', () => {
  const pullup = byName('מתח באחיזה רחבה');
  const hlr = byName('הרמת רגליים בתלייה');
  assert.ok(trainingValue(pullup, 3) >= valueFloor(3, 'main'), 'מתח נפסל כתרגיל עיקרי למתקדם');
  assert.ok(trainingValue(hlr, 3) >= valueFloor(3, 'core'), 'הרמת רגליים בתלייה נפסלה כליבה למתקדם');
});

test('הרצפה עולה עם הרמה ויורדת ככל שהתפקיד משני יותר', () => {
  for (const role of ['main', 'secondary', 'accessory', 'core']) {
    for (let l = 1; l < 4; l++) {
      assert.ok(valueFloor(l, role) > valueFloor(l - 1, role), `${role}: הרצפה לא עלתה בין רמה ${l - 1} ל-${l}`);
    }
  }
  assert.ok(valueFloor(3, 'main') > valueFloor(3, 'accessory'));
  assert.equal(valueFloor(3, 'warmup'), 0, 'חימום פטור מרצפה');
});

test('תרגיל בידוד אינו יכול לשמש תרגיל עיקרי, גם אם ניתן להעמיס אותו', () => {
  const shrug = byName('משיכת כתפיים');
  assert.equal(shrug.type, 'isolation');
  const main = fitsLevel(shrug, 3, 'main');
  assert.equal(main.ok, false);
  assert.equal(main.hard, true);
  assert.match(main.reason, /בידוד/);
  assert.equal(fitsLevel(shrug, 3, 'accessory').ok, true, 'בעזר הוא לגיטימי');
});

test('תקרת המיומנות מונעת תרגיל טכני ממי שעוד לא שם', () => {
  const deadlift = byName('דדליפט קונבנציונלי');
  assert.ok(deadlift.skill >= 4);
  assert.ok(!skillAllowed(deadlift, 0), 'מתחיל קיבל דדליפט קונבנציונלי');
  assert.ok(skillAllowed(deadlift, 3), 'מתקדם נחסם מדדליפט');
  for (let i = 1; i < SKILL_CEILING.length; i++) {
    assert.ok(SKILL_CEILING[i] >= SKILL_CEILING[i - 1], 'התקרה חייבת לעלות עם הרמה');
  }
});

/* ------------------------------------------- ההשפעה על התכנית בפועל */

/** סורק תכנית ומחזיר כל תרגיל עבודה שנמצא מתחת לרצפה של רמתו. */
function belowFloor(program, levelIdx) {
  const out = [];
  for (const d of program.days) {
    for (const b of d.blocks) {
      if (b.role === 'warmup' || b.role === 'cooldown') continue;
      const ex = BY_ID[b.exercise.id];
      if (!ex || ex.type === 'mobility') continue;
      if (trainingValue(ex, levelIdx) < valueFloor(levelIdx, b.role)) {
        out.push(`${b.role}: ${ex.name}`);
      }
    }
  }
  return out;
}

test('מתאמן מתקדם אינו מקבל אף תרגיל מתחת לרמתו — בשום תפקיד', () => {
  const t = trainee({ level: 'advanced', trainingAgeMonths: 84 });
  const p = generateWeeklyProgram(t, studio());
  assert.deepEqual(belowFloor(p, 3), [], 'תרגילים קלים מדי חזרו לתכנית של מתקדם');
});

test('הכלל מחזיק בכל שילוב של רמה, מטרה וציוד', () => {
  const small = ['dumbbell', 'kettlebell', 'resistance_band', 'mat', 'bench_flat', 'pullup_bar'];
  const problems = [];
  for (const eq of [GYM, small]) {
    for (const [level, months] of [['beginner', 2], ['novice', 8], ['intermediate', 20], ['advanced', 84]]) {
      for (const goal of ['hypertrophy', 'strength', 'fat_loss', 'general_fitness']) {
        const t = trainee({ level, trainingAgeMonths: months, primaryGoal: goal, goals: [goal] });
        const r = resolveLevel(t, BY_ID);
        const p = generateWeeklyProgram(t, normalizeStudio({ id: 'g', name: 'g', equipment: eq, dumbbellMaxKg: 50 }));
        const bad = belowFloor(p, r.index);
        if (bad.length) problems.push(`${level}/${goal}/${eq.length}eq: ${bad.join(', ')}`);
      }
    }
  }
  assert.deepEqual(problems, [], 'נמצאו תרגילים מתחת לרמה');
});

test('פלאנק ופילאטיס מתאימים למתחיל ונעלמים אצל מתקדם', () => {
  const soft = ['פלאנק', 'פילאטיס', 'ברד-דוג', 'איזומטרי צוואר'];
  const names = (p) => p.days.flatMap((d) => d.blocks
    .filter((b) => b.role !== 'warmup' && b.role !== 'cooldown')
    .map((b) => b.exercise.name));

  const adv = names(generateWeeklyProgram(trainee({ level: 'advanced', trainingAgeMonths: 84 }), studio()));
  const found = adv.filter((n) => soft.some((s) => n.includes(s)));
  assert.deepEqual(found, [], 'מתקדם קיבל תרגילי הוראה');
});

test('תרגילי שיקום נעלמים מהיפרטרופיה אך נשארים במטרת שיקום', () => {
  const offGoal = (p) => p.days.flatMap((d) => d.blocks)
    .filter((b) => b.role !== 'warmup' && b.role !== 'cooldown')
    .filter((b) => (BY_ID[b.exercise.id]?.tags || []).some((t) => ['pilates', 'rehab_friendly', 'regression'].includes(t)))
    .map((b) => b.exercise.name);

  const hyp = generateWeeklyProgram(
    trainee({ level: 'intermediate', trainingAgeMonths: 24, primaryGoal: 'hypertrophy', goals: ['hypertrophy'] }), studio(),
  );
  assert.deepEqual(offGoal(hyp), [], 'תרגילי שיקום הופיעו בתכנית היפרטרופיה');

  const reh = generateWeeklyProgram(
    trainee({ level: 'novice', trainingAgeMonths: 6, primaryGoal: 'rehab', goals: ['rehab'] }), studio(),
  );
  assert.ok(offGoal(reh).length > 0, 'תכנית שיקום נשארה בלי תרגילי שיקום — הקנס גורף מדי');
});

test('רמה שהוסקה מהשטח משנה את התכנית בפועל', () => {
  const base = { level: 'beginner', trainingAgeMonths: 48, weightKg: 80 };
  const plain = generateWeeklyProgram(trainee(base), studio());
  const proven = generateWeeklyProgram(trainee({
    ...base,
    history: { bb_back_squat: { load: 150 }, bb_bench_press: { load: 110 }, bb_row: { load: 90 } },
  }), studio());

  const ids = (p) => p.days.flatMap((d) => d.blocks.map((b) => b.exercise.id)).join('|');
  assert.notEqual(ids(plain), ids(proven), 'משקלים שמוכיחים רמה גבוהה לא שינו את התכנית');
});

test('כל התכניות עדיין עוברות בקרת איכות אחרי ההחמרה', () => {
  for (const [level, months] of [['beginner', 1], ['novice', 6], ['intermediate', 18], ['advanced', 72]]) {
    const p = generateWeeklyProgram(trainee({ level, trainingAgeMonths: months }), studio());
    assert.equal(p.qa.errors, 0, `${level}: בקרת האיכות נכשלה`);
    assert.ok(p.days.every((d) => d.blocks.length >= 3), `${level}: יום כמעט ריק`);
  }
});
