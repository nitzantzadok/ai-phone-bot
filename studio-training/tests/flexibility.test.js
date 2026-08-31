/**
 * שלוש היכולות שהופכות את המערכת לגמישה:
 * מבנה אימון לפי הסטודיו, לוח שנה שאפשר להזיז בו אימונים,
 * ומאגר מתאמנים משותף לכמה סניפים.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STRUCTURE, SEGMENT_KINDS, STRUCTURE_PRESETS, allocateMinutes, describeStructure,
  isDefaultStructure, normalizeSegment, normalizeStructure, segmentActiveOn, structurePlan,
} from '../src/domain/structure.js';
import {
  addSession, isoDate, fromIso, addDays, markDoneByDate, monthGrid, monthSummary, moveSession,
  nextSession, normalizeSession, planWeek, removeSession, setStatus, spreadWeekdays, weekdayOf,
} from '../src/domain/schedule.js';
import { normalizeStudio, normalizeTrainee } from '../src/domain/models.js';
import { generateWeeklyProgram } from '../src/engine/generate.js';

/* ---------------------------------------------------------------- מבנה האימון */

test('מבנה ריק חוזר לברירת המחדל במקום להשאיר אימון בלי שלד', () => {
  assert.equal(normalizeStructure([]).length, DEFAULT_STRUCTURE.length);
  assert.equal(normalizeStructure(null).length, DEFAULT_STRUCTURE.length);
  assert.ok(isDefaultStructure(normalizeStructure(undefined)));
});

test('מקטע לא חוקי מקבל ברירות מחדל שפויות ולא מפיל את המבנה', () => {
  const seg = normalizeSegment({ kind: 'לא_קיים', minutes: -5 });
  assert.equal(seg.kind, 'custom');
  assert.equal(seg.minutes, SEGMENT_KINDS.custom.defaultMinutes);
  assert.ok(seg.id);

  assert.equal(normalizeSegment({ kind: 'core', minutes: 9999 }).minutes, 120, 'זמן חסום מלמעלה');
});

test('המבנה מתכווץ ומתרחב לפי אורך האימון בפועל', () => {
  const structure = normalizeStructure(STRUCTURE_PRESETS.core_first.segments);

  const at60 = allocateMinutes(structure, 60);
  assert.equal(at60.reduce((n, x) => n + x.minutes, 0), 60, 'הסכום הוא בדיוק אורך האימון');
  const core60 = at60.find((x) => x.segment.kind === 'core').minutes;
  assert.ok(core60 >= 13 && core60 <= 17, `רבע שעה בטן, קיבלנו ${core60}`);

  const at45 = allocateMinutes(structure, 45);
  assert.equal(at45.reduce((n, x) => n + x.minutes, 0), 45);
  const core45 = at45.find((x) => x.segment.kind === 'core').minutes;
  assert.ok(core45 < core60, 'באימון קצר יותר גם הבטן מתקצרת');
});

test('מקטע יכול לפעול רק בימים מסוימים', () => {
  const seg = normalizeSegment({ kind: 'core', days: [0, 2] });
  assert.ok(segmentActiveOn(seg, 0));
  assert.ok(!segmentActiveOn(seg, 1));
  assert.ok(segmentActiveOn(normalizeSegment({ kind: 'core' }), 5), 'בלי ימים = כל יום');

  const plan = structurePlan(normalizeStructure([
    { kind: 'core', minutes: 15, days: [0] },
    { kind: 'strength', minutes: 45 },
  ]), 60, 1);
  assert.deepEqual(plan.map((p) => p.kind), ['strength'], 'ביום שאינו ברשימה המקטע לא מופיע');
});

test('תיאור המבנה קריא ומסודר לפי הסדר שהוגדר', () => {
  const text = describeStructure(STRUCTURE_PRESETS.core_first.segments, 60);
  assert.match(text, /→/);
  assert.ok(text.indexOf('בטן') < text.indexOf('כוח'), 'הבטן מופיעה לפני הכוח');
});

/* --------------------------------------------- המבנה משפיע על התכנית בפועל */

const STUDIO = {
  id: 's1', name: 'סטודיו', equipment: ['dumbbell', 'barbell', 'bench_flat', 'squat_rack', 'mat', 'kettlebell', 'pullup_bar', 'cable_crossover'],
  dumbbellMaxKg: 40, sessionMinutes: 60,
};
const TRAINEE = {
  id: 't1', name: 'מתאמן', studioId: 's1', age: 32, weightKg: 78,
  level: 'intermediate', primaryGoal: 'hypertrophy', daysPerWeek: 3, sessionMinutes: 60,
};

test('בלי מבנה מותאם התכנית נבנית בדיוק כמו קודם', () => {
  const p = generateWeeklyProgram(normalizeTrainee(TRAINEE), normalizeStudio(STUDIO));
  assert.ok(p.days.length > 0);
  assert.deepEqual(p.days[0].segments, [], 'מבנה ברירת מחדל לא מייצר מקטעים');
  assert.ok(p.days[0].blocks.every((b) => b.segment === null));
});

test('סטודיו שמתחיל ברבע שעה בטן — הבטן באמת ראשונה בתכנית', () => {
  const studio = normalizeStudio({ ...STUDIO, sessionStructure: STRUCTURE_PRESETS.core_first.segments });
  const p = generateWeeklyProgram(normalizeTrainee(TRAINEE), studio);

  const day = p.days[0];
  assert.ok(day.segments.length >= 3, 'היום נבנה לפי מקטעים');
  assert.equal(day.segments[1].kind, 'core');

  const kinds = day.blocks.map((b) => b.segment?.kind).filter(Boolean);
  const firstCore = kinds.indexOf('core');
  const firstStrength = kinds.indexOf('strength');
  assert.ok(firstCore >= 0, 'יש תרגילי ליבה בתכנית');
  if (firstStrength >= 0) {
    assert.ok(firstCore < firstStrength, `הליבה חייבת לבוא לפני הכוח (core=${firstCore}, strength=${firstStrength})`);
  }
});

test('מקטע הליבה לא גולש על חשבון הכוח', () => {
  const studio = normalizeStudio({ ...STUDIO, sessionStructure: STRUCTURE_PRESETS.core_first.segments });
  const p = generateWeeklyProgram(normalizeTrainee(TRAINEE), studio);
  for (const day of p.days) {
    const coreMinutes = day.blocks
      .filter((b) => b.segment?.kind === 'core')
      .reduce((n, b) => n + b.estimatedMinutes, 0);
    const budget = day.segments.find((x) => x.kind === 'core')?.minutes ?? 0;
    assert.ok(coreMinutes <= budget * 1.25 + 3,
      `ליבה ${coreMinutes}׳ מול תקציב ${budget}׳ ביום ${day.index}`);
  }
});

test('כל מבנה מוכן מייצר תכנית תקינה שעוברת בקרת איכות', () => {
  for (const [key, preset] of Object.entries(STRUCTURE_PRESETS)) {
    const studio = normalizeStudio({ ...STUDIO, sessionStructure: preset.segments });
    const p = generateWeeklyProgram(normalizeTrainee(TRAINEE), studio);
    assert.ok(p.days.length > 0, `${key}: אין ימים`);
    assert.ok(p.days.every((d) => d.blocks.length > 0), `${key}: יום ריק`);
    assert.equal(p.qa.errors, 0, `${key}: ${JSON.stringify(p.qa.findings?.slice(0, 2) || '')}`);
    for (const d of p.days) {
      assert.ok(d.estimatedMinutes <= d.sessionMinutes * 1.2,
        `${key}: יום ${d.index} אורך ${d.estimatedMinutes}׳ מול ${d.sessionMinutes}׳`);
    }
  }
});

/* ---------------------------------------------------------------- לוח שנה */

test('תאריכים נשמרים בלי הפתעות של אזור זמן', () => {
  assert.equal(isoDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(isoDate('2026-03-01'), '2026-03-01');
  assert.equal(isoDate('לא תאריך'), null);
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(fromIso('2026-05-10').getDate(), 10);
});

test('פריסת תכנית מניחה אימון לכל יום, בלי כפילות תאריכים', () => {
  const program = {
    id: 'p1', traineeId: 't1', studioId: 's1', week: 1,
    days: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
  };
  const sessions = planWeek(program, { startDate: '2026-08-02', weekdays: [0, 2, 4] });
  assert.equal(sessions.length, 3);
  assert.equal(new Set(sessions.map((s) => s.date)).size, 3, 'אין שני אימונים באותו יום');
  assert.deepEqual(sessions.map((s) => weekdayOf(s.date)), [0, 2, 4]);
  assert.deepEqual(sessions.map((s) => s.dayLabel), ['A', 'B', 'C']);
  assert.ok(sessions.every((s) => s.status === 'planned'));
});

test('בלי ימים מוגדרים האימונים נפרסים במרווחים ולא ברצף', () => {
  const spread = spreadWeekdays(3, 0);
  assert.equal(new Set(spread).size, 3);
  assert.notDeepEqual(spread, [0, 1, 2], 'שלושה אימונים ברצף זה לא פריסה');
});

test('העברת אימון לתאריך אחר שומרת מאיפה הוא זז', () => {
  const s1 = normalizeSession({ id: 'a', date: '2026-08-03', dayLabel: 'A' });
  const s2 = normalizeSession({ id: 'b', date: '2026-08-05', dayLabel: 'B' });

  const moved = moveSession([s1, s2], 'a', '2026-08-06');
  const a = moved.find((x) => x.id === 'a');
  assert.equal(a.date, '2026-08-06');
  assert.equal(a.movedFrom, '2026-08-03', 'התאריך המקורי נשמר');
  assert.ok(a.movedAt);
  assert.equal(moved.find((x) => x.id === 'b').date, '2026-08-05', 'אימון אחר לא זז');

  // העברה שנייה שומרת את המקור הראשון ולא דורסת אותו
  const again = moveSession(moved, 'a', '2026-08-09');
  assert.equal(again.find((x) => x.id === 'a').movedFrom, '2026-08-03');
});

test('אימון שבוצע נשאר בוצע גם אחרי העברה', () => {
  const done = normalizeSession({ id: 'a', date: '2026-08-03', status: 'done' });
  assert.equal(moveSession([done], 'a', '2026-08-04')[0].status, 'done');
  const planned = normalizeSession({ id: 'b', date: '2026-08-03', status: 'missed' });
  assert.equal(moveSession([planned], 'b', '2026-08-04')[0].status, 'planned', 'החמצה שהועברה חוזרת לתכנון');
});

test('תאריך לא תקין להעברה נדחה ולא משחית את הלוח', () => {
  const s = [normalizeSession({ id: 'a', date: '2026-08-03' })];
  assert.throws(() => moveSession(s, 'a', 'בלגן'), /תאריך/);
  assert.equal(s[0].date, '2026-08-03');
});

test('רישום מהשטח מסמן את היום כבוצע, וגם יוצר אימון שלא היה מתוכנן', () => {
  const planned = [normalizeSession({ id: 'a', date: '2026-08-03' })];
  assert.equal(markDoneByDate(planned, '2026-08-03')[0].status, 'done');

  const surprise = markDoneByDate(planned, '2026-08-07', { traineeId: 't1' });
  assert.equal(surprise.length, 2, 'אימון שלא תוכנן נוסף ללוח');
  assert.equal(surprise.find((s) => s.date === '2026-08-07').status, 'done');
});

test('סטטוס, הוספה והסרה של אימון', () => {
  let list = [normalizeSession({ id: 'a', date: '2026-08-03' })];
  list = setStatus(list, 'a', 'missed');
  assert.equal(list[0].status, 'missed');
  assert.throws(() => setStatus(list, 'a', 'משהו'), /סטטוס/);

  list = addSession(list, { date: '2026-08-01', dayLabel: 'השלמה' });
  assert.equal(list[0].date, '2026-08-01', 'הרשימה ממוינת לפי תאריך');
  assert.equal(removeSession(list, 'a').length, 1);
});

test('רשת החודש מלאה, מסמנת היום ומכילה את האימונים', () => {
  const sessions = [
    normalizeSession({ id: 'a', date: '2026-08-03', dayLabel: 'A' }),
    normalizeSession({ id: 'b', date: '2026-08-03', dayLabel: 'B' }),
    normalizeSession({ id: 'c', date: '2026-08-20' }),
  ];
  const weeks = monthGrid(2026, 7, sessions, { today: '2026-08-03' });
  assert.ok(weeks.length >= 5);
  assert.ok(weeks.every((w) => w.length === 7), 'כל שבוע הוא שבעה תאים');

  const cells = weeks.flat();
  const aug3 = cells.find((c) => c.date === '2026-08-03');
  assert.equal(aug3.sessions.length, 2, 'שני אימונים באותו יום מוצגים יחד');
  assert.ok(aug3.isToday);
  assert.ok(aug3.inMonth);
  assert.ok(cells.some((c) => !c.inMonth), 'יש ימים גולשים כדי שהרשת תהיה מלאה');
});

test('סיכום חודשי סופר רק את החודש הנכון', () => {
  const sessions = [
    normalizeSession({ id: 'a', date: '2026-08-03', status: 'done' }),
    normalizeSession({ id: 'b', date: '2026-08-10', status: 'planned' }),
    normalizeSession({ id: 'c', date: '2026-09-01', status: 'done' }),
  ];
  const sum = monthSummary(sessions, 2026, 7);
  assert.equal(sum.total, 2);
  assert.equal(sum.done, 1);
  assert.equal(sum.planned, 1);

  assert.equal(nextSession(sessions, '2026-08-01').id, 'b', 'האימון הבא שטרם בוצע');
  assert.equal(nextSession(sessions, '2026-12-01'), null);
});

/* ------------------------------------------- כמה סניפים, מאגר מתאמנים אחד */

test('מתאמן יכול להיות משויך לכמה סניפים', () => {
  const t = normalizeTrainee({ id: 't1', name: 'דנה', homeStudioId: 'north', studioIds: ['south'] });
  assert.equal(t.homeStudioId, 'north');
  assert.deepEqual([...t.studioIds].sort(), ['north', 'south'], 'הסניף הראשי תמיד נכלל');
  assert.equal(t.studioId, 'north', 'תאימות לאחור נשמרת');
});

test('סטודיו יחיד ממשיך לעבוד בלי שינוי', () => {
  const t = normalizeTrainee({ id: 't1', name: 'דנה', studioId: 'only' });
  assert.equal(t.homeStudioId, 'only');
  assert.deepEqual(t.studioIds, ['only']);
});

test('אותו מתאמן מקבל תכנית שונה בכל סניף לפי הציוד שם', () => {
  const trainee = normalizeTrainee({ ...TRAINEE, homeStudioId: 'north', studioIds: ['north', 'south'] });

  const north = normalizeStudio({ id: 'north', name: 'צפון', equipment: ['barbell', 'squat_rack', 'bench_flat', 'dumbbell', 'pullup_bar'], dumbbellMaxKg: 40 });
  const south = normalizeStudio({ id: 'south', name: 'דרום', equipment: ['kettlebell', 'resistance_band', 'mat'] });

  const pN = generateWeeklyProgram(trainee, north);
  const pS = generateWeeklyProgram(trainee, south);

  assert.equal(pN.qa.errors, 0);
  assert.equal(pS.qa.errors, 0);
  assert.equal(pN.studioId, 'north');
  assert.equal(pS.studioId, 'south');

  const idsN = pN.days.flatMap((d) => d.blocks.map((b) => b.exercise.id));
  const idsS = pS.days.flatMap((d) => d.blocks.map((b) => b.exercise.id));
  assert.notDeepEqual(idsN, idsS, 'ציוד שונה חייב לייצר תכנית שונה');

  // הסניף בלי מוט לא יכול לתת תרגילי מוט
  const barbellUsed = pS.days.flatMap((d) => d.blocks)
    .filter((b) => (b.exercise.equipment || []).includes('barbell'));
  assert.equal(barbellUsed.length, 0, 'סניף בלי מוט קיבל תרגיל מוט');
});

test('מבנה אימון נקבע לפי הסניף, כך שלכל סניף סדר עבודה משלו', () => {
  const trainee = normalizeTrainee({ ...TRAINEE, homeStudioId: 'a', studioIds: ['a', 'b'] });
  const withCore = normalizeStudio({ ...STUDIO, id: 'a', sessionStructure: STRUCTURE_PRESETS.core_first.segments });
  const classic = normalizeStudio({ ...STUDIO, id: 'b' });

  assert.ok(generateWeeklyProgram(trainee, withCore).days[0].segments.length > 0);
  assert.deepEqual(generateWeeklyProgram(trainee, classic).days[0].segments, []);
});
