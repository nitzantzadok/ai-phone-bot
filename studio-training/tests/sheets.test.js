/**
 * ייבוא מ-Google Sheets.
 *
 * הבדיקות כאן בנויות סביב גיליונות שנראים כמו גיליונות אמיתיים של סטודיו:
 * כותרת ראשית בשורה הראשונה, עמודות בעברית עם גרשיים, תאריכים בשלושה
 * פורמטים שונים באותה עמודה, שורת "סה״כ" בסוף, ומתאמן שמופיע פעמיים.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shBool, shDate, shEmail, shMatch, shMatchAll, shNorm, shNum, shPhone, shRange, shSimilarity,
  shSplitList,
} from '../src/domain/sheets/text.js';
import { shParseDelimited, shSniffDelimiter, shTableFromText, shToTable } from '../src/domain/sheets/table.js';
import { shFixHeaderless, shMapColumns } from '../src/domain/sheets/columns.js';
import { shClassifyTable } from '../src/domain/sheets/classify.js';
import { shAnalyzeWorkbook, shBuildImport } from '../src/domain/sheets/build.js';
import { constraintCandidates, equipmentCandidates, exerciseCandidates } from '../src/domain/sheets/vocab.js';
import { shGvizToMatrix, shGvizUrl, shParseSheetUrl } from '../src/domain/sheets/google.js';
import { normalizeStudio, normalizeTrainee, validateInput } from '../src/domain/models.js';
import { generateWeeklyProgram } from '../src/engine/generate.js';
import { CONSTRAINTS } from '../src/domain/constraints.js';
import { GOALS, LEVELS } from '../src/domain/taxonomy.js';

const sheet = (name, csv) => ({ name, table: shTableFromText(csv, { name }) });

/* ------------------------------------------------------------------ טקסט */

test('נרמול עברי: ניקוד, גרשיים ואותיות סופיות', () => {
  assert.equal(shNorm('כְּאֵב'), shNorm('כאב'));
  assert.equal(shNorm('ק״ג'), 'קג');
  assert.equal(shNorm('אימון '), shNorm('אימונ'));
  assert.equal(shNorm(''), '');
  assert.equal(shNorm(null), '');
});

test('דמיון: שגיאת כתיב, סיומת ומילה מוכלת', () => {
  assert.ok(shSimilarity('סקוואט', 'סקווט') > 0.62);
  assert.ok(shSimilarity('לחיצת חזה במוט', 'לחיצת חזה') > 0.8);
  assert.ok(shSimilarity('כאב ברך', 'כאב גב') < 0.62, 'ברך וגב אינם אותו דבר');
  assert.equal(shSimilarity('', 'משהו'), 0);
});

test('מספרים מטקסט אנושי', () => {
  assert.equal(shNum('80 ק״ג'), 80);
  assert.equal(shNum('1.75 מ׳'), 1.75);
  assert.equal(shNum('8,5'), 8.5);
  assert.equal(shNum('1,200'), 1200);
  assert.equal(shNum('כ-12 חזרות'), 12);
  assert.equal(shNum('אין'), null);
  assert.equal(shNum(''), null);
  assert.equal(shNum(0), 0, 'אפס הוא ערך ולא היעדר ערך');
});

test('טווחים', () => {
  assert.deepEqual(shRange('2-24'), { min: 2, max: 24 });
  assert.deepEqual(shRange('מ-5 עד 30 ק״ג'), { min: 5, max: 30 });
  assert.deepEqual(shRange('10'), { min: 10, max: 10 });
  assert.equal(shRange('אין'), null);
});

test('תאריכים בכל הפורמטים שמגיעים מגיליון', () => {
  assert.equal(shDate('15/3/2024'), '2024-03-15');
  assert.equal(shDate('15.03.2024'), '2024-03-15');
  assert.equal(shDate('2024-03-15'), '2024-03-15');
  assert.equal(shDate('3/15/2024'), '2024-03-15', 'סדר אמריקאי מזוהה כשהחודש בלתי אפשרי');
  assert.equal(shDate('45000'), '2023-03-15', 'מספר סידורי של Sheets');
  assert.equal(shDate('Date(2024,2,15)'), '2024-03-15', 'הפורמט של gviz');
  assert.equal(shDate('1/2/24'), '2024-02-01', 'שנה דו-ספרתית, סדר ישראלי');
  assert.equal(shDate('שלישי'), null);
  assert.equal(shDate(''), null);
});

test('כן/לא, טלפון ואימייל', () => {
  assert.equal(shBool('כן'), true);
  assert.equal(shBool('V'), true);
  assert.equal(shBool('לא פעיל'), false, 'שלילה גוברת על המילה שמוכלת בה');
  assert.equal(shBool('אולי'), null);
  assert.equal(shPhone('054-123-4567'), '0541234567');
  assert.equal(shPhone('+972541234567'), '0541234567');
  assert.equal(shPhone('12345'), null);
  assert.equal(shEmail('כתבו לי dana@example.com בבקשה'), 'dana@example.com');
});

test('פיצול רשימה בתא אחד', () => {
  assert.deepEqual(shSplitList('כאב ברך, פריצת דיסק; כתף'), ['כאב ברך', 'פריצת דיסק', 'כתף']);
  assert.deepEqual(shSplitList(''), []);
});

/* --------------------------------------------------------------- מילון */

test('התאמת ציוד, מגבלות ותרגילים לשפה של המערכת', () => {
  const eq = equipmentCandidates();
  assert.equal(shMatch('דמבלים', eq).key, 'dumbbell');
  assert.equal(shMatch('מוט מתח', eq).key, 'pullup_bar');
  assert.equal(shMatch('ספינינג', eq).key, 'bike');
  assert.equal(shMatch('מכונת קפה', eq), null, 'מה שאינו ציוד אימון לא מומצא');

  const co = constraintCandidates();
  assert.equal(shMatch('כאבי ברכיים', co).key, 'knee_pain_patellofemoral');
  assert.equal(shMatch('פריצת דיסק', co).key, 'disc_herniation');
  assert.equal(shMatch('הריון', co).key, 'pregnancy_t2_t3', 'הריון בלי פירוט -> ההגדרה המחמירה');
  for (const c of co) assert.ok(CONSTRAINTS[c.key], `מזהה מגבלה קיים: ${c.key}`);

  const ex = exerciseCandidates();
  assert.equal(shMatch('סקוואט', ex).key, 'bb_back_squat');
  assert.ok(shMatch('מתח', ex).key.includes('pullup'));

  assert.deepEqual(shMatchAll('כאב ברך, פריצת דיסק', co).map((h) => h.key),
    ['knee_pain_patellofemoral', 'disc_herniation']);
});

/* ---------------------------------------------------------------- טבלה */

test('זיהוי תו הפרדה: פסיק, נקודה-פסיק וטאב', () => {
  assert.equal(shSniffDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(shSniffDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(shSniffDelimiter('a\tb\n1\t2'), '\t');
});

test('פירוק CSV עם מרכאות, פסיקים בתוך תא וירידת שורה בתוך תא', () => {
  const rows = shParseDelimited('שם,הערה\n"כהן, רון","שורה\nשנייה"\n');
  assert.deepEqual(rows, [['שם', 'הערה'], ['כהן, רון', 'שורה\nשנייה']]);
});

test('כותרת ראשית ושורות ריקות מעל הטבלה', () => {
  const t = shTableFromText('דוח מתאמנים 2026,,\n,,\nשם,גיל,טלפון\nרון,34,0541234567\nדנה,28,0521112222', { name: 'גיליון1' });
  assert.deepEqual(t.headers, ['שם', 'גיל', 'טלפון']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.title, 'דוח מתאמנים 2026');
});

test('BOM ועמודות ריקות באמצע', () => {
  const t = shTableFromText('﻿שם,,גיל\nרון,,34');
  assert.deepEqual(t.headers, ['שם', 'גיל']);
  assert.deepEqual(t.rows, [['רון', '34']]);
});

test('גיליון בלי שורת כותרת בכלל — השורה הראשונה נשארת נתון', () => {
  const t = shFixHeaderless(shTableFromText([
    'רון כהן,34,054-1234567,מתקדם',
    'דנה לוי,28,0521112222,מתחילה',
    'יוסי מור,45,0509998888,בינוני',
  ].join('\n')));
  assert.equal(t.headerless, true);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0][0], 'רון כהן');
});

test('גיליון עם כותרת אמיתית לא מסומן כחסר כותרת', () => {
  const t = shFixHeaderless(shTableFromText('שם,גיל\nרון,34\nדנה,28'));
  assert.ok(!t.headerless);
  assert.deepEqual(t.headers, ['שם', 'גיל']);
});

test('טבלה ריקה לא מפילה כלום', () => {
  const t = shToTable([], { name: 'ריק' });
  assert.equal(t.empty, true);
  assert.equal(shClassifyTable(t).role, 'empty');
});

/* -------------------------------------------------------------- עמודות */

test('מיפוי עמודות של גיליון מתאמנים', () => {
  const t = shTableFromText([
    'שם מלא,גיל,מין,טלפון,משקל,גובה,רמה,מטרה,פציעות,ימים בשבוע,מחיר',
    'רון כהן,34,ז,054-1234567,82,178,מתקדם,מסה,כאבי ברך,3,250',
    'דנה לוי,28,נ,0521112222,61,165,מתחילה,ירידה במשקל,,2,250',
  ].join('\n'));
  const { byField } = shMapColumns(t, { role: 'trainees' });
  assert.equal(byField.name, 0);
  assert.equal(byField.age, 1);
  assert.equal(byField.sex, 2);
  assert.equal(byField.phone, 3);
  assert.equal(byField.weightKg, 4);
  assert.equal(byField.heightCm, 5);
  assert.equal(byField.level, 6);
  assert.equal(byField.goal, 7);
  assert.equal(byField.constraints, 8);
  assert.equal(byField.daysPerWeek, 9);
  assert.equal(byField.price, 10);
});

test('"משקל" בגיליון תכנית הוא עומס בתרגיל, לא משקל גוף', () => {
  const t = shTableFromText([
    'תרגיל,סטים,חזרות,משקל',
    'סקוואט,4,8,80',
    'לחיצת חזה,3,10,60',
  ].join('\n'));
  const { byField } = shMapColumns(t, { role: 'programs' });
  assert.equal(byField.exercise, 0);
  assert.equal(byField.sets, 1);
  assert.equal(byField.reps, 2);
  assert.ok(byField.load === 3 || byField.weightKg === undefined);
});

test('עמודה בלי כותרת מזוהה לפי התוכן', () => {
  const t = shTableFromText([',,\nרון כהן,054-1234567,dana@example.com', 'דנה לוי,0521112222,ron@example.com'].join('\n'));
  const { byField } = shMapColumns(shFixHeaderless(t), { role: 'trainees' });
  assert.equal(byField.phone !== undefined, true);
  assert.equal(byField.email !== undefined, true);
});

/* ------------------------------------------------------------ סיווג לשוניות */

test('כל סוגי הלשוניות מזוהים נכון', () => {
  const cases = [
    ['גיליון1', 'שם,גיל,טלפון,מטרה\nרון,34,0541234567,מסה\nדנה,28,0521112222,ירידה במשקל', 'trainees'],
    ['ציוד', 'פריט,כמות\nמשקולות יד,12\nמוט מתח,1\nהליכון,2\nקטלבל,6', 'equipment'],
    ['תכנית של רון', 'תרגיל,סטים,חזרות,משקל\nסקוואט,4,8,80\nלחיצת חזה,3,10,60', 'programs'],
    ['מעקב', 'תאריך,תרגיל,משקל,חזרות\n01/02/2026,סקוואט,80,8\n08/02/2026,סקוואט,82,8', 'log'],
    ['מדידות', 'תאריך,משקל,אחוז שומן,מותן\n01/01/2026,82,22,92\n01/02/2026,80,21,90', 'measurements'],
    ['נוכחות', 'שם,01/02/2026,03/02/2026\nרון,V,V\nדנה,,V', 'attendance'],
  ];
  for (const [name, csv, expected] of cases) {
    const got = shClassifyTable(shTableFromText(csv, { name }));
    assert.equal(got.role, expected, `${name} -> ${got.role} (${got.why})`);
    assert.ok(got.why, 'לכל סיווג יש הסבר');
  }
});

/* --------------------------------------------------------------- בנייה */

const FULL_WORKBOOK = () => [
  sheet('מתאמנים', [
    'רשימת מתאמנים,,,,,,,,,,',
    'שם,גיל,מין,טלפון,משקל,גובה,רמה,מטרה,פציעות,ימים בשבוע,סניף',
    'רון כהן,34,ז,054-1234567,82,178,מתקדם,מסה,כאבי ברך שמאל (חריף),3,סניף צפון',
    'דנה לוי,28,נ,0521112222,61,165,מתחילה,ירידה במשקל,אחרי לידה,2,סניף דרום',
    'יוסי מור,45,ז,0509998888,95,180,בינוני,"כוח, יציבה",פריצת דיסק,4,סניף צפון',
    'רון כהן,34,,,,,,,,,סניף צפון',
    'סה"כ,3,,,,,,,,,',
  ].join('\n')),
  sheet('ציוד', [
    'פריט,כמות,טווח משקלים',
    'משקולות יד,12,2-30',
    'מוט מתח,1,',
    'הליכון,2,',
    'קטלבל,6,8-24',
    'מכונת אספרסו,1,',
  ].join('\n')),
  sheet('רון כהן', [
    'יום,תרגיל,סטים,חזרות,משקל',
    'A,סקוואט,4,8,80',
    'A,לחיצת חזה במוט,3,8-10,60',
    'B,מתח,4,6,',
    'B,תרגיל הבית של הסטודיו,3,10,',
  ].join('\n')),
  sheet('יומן', [
    'תאריך,שם,תרגיל,משקל,חזרות',
    '01/02/2026,רון כהן,סקוואט,80,8',
    '08/02/2026,רון כהן,סקוואט,85,8',
    '08/02/2026,דנה לוי,לחיצת רגליים,40,12',
  ].join('\n')),
  sheet('מדידות', [
    'תאריך,שם,משקל,אחוז שומן,מותן',
    '01/01/2026,רון כהן,84,22,92',
    '01/02/2026,רון כהן,82,21,90',
  ].join('\n')),
  sheet('נוכחות', [
    'שם,01/02/2026,03/02/2026,08/02/2026,10/02/2026',
    'רון כהן,V,V,V,',
    'דנה לוי,,V,,V',
  ].join('\n')),
];

test('ייבוא מלא: סטודיו, סניפים, מתאמנים, תכניות והיסטוריה', () => {
  const analysis = shAnalyzeWorkbook(FULL_WORKBOOK());
  assert.deepEqual(analysis.sheets.map((s) => s.role),
    ['trainees', 'equipment', 'programs', 'log', 'measurements', 'attendance']);

  const out = shBuildImport(analysis, { studioName: 'רשת הסטודיו' });

  // שלושה מתאמנים, לא ארבעה: שורה כפולה מתמזגת ושורת סיכום נזרקת
  assert.equal(out.trainees.length, 3);
  assert.ok(!out.trainees.some((t) => /סה"?כ/.test(t.name)));

  const ron = out.trainees.find((t) => t.name === 'רון כהן');
  assert.equal(ron.age, 34);
  assert.equal(ron.sex, 'male');
  assert.equal(ron.phone, '0541234567');
  assert.equal(ron.weightKg, 82);
  assert.equal(ron.heightCm, 178);
  assert.equal(ron.level, 'advanced');
  assert.equal(ron.primaryGoal, 'hypertrophy');
  assert.equal(ron.daysPerWeek, 3);
  assert.deepEqual(ron.constraints, [{
    id: 'knee_pain_patellofemoral', severity: 'acute', side: 'left', notes: 'כאבי ברך שמאל (חריף)',
  }]);
  assert.equal(ron.measurements.length, 2);
  assert.equal(ron.sessions.length, 3, 'שלוש הגעות מלוח הנוכחות');
  assert.equal(ron.sessionLog.length, 2);
  assert.equal(ron.history.bb_back_squat.load, 85, 'המשקל האחרון הוא המשקל הקובע');

  const yossi = out.trainees.find((t) => t.name === 'יוסי מור');
  assert.deepEqual(yossi.goals, ['strength', 'posture']);
  assert.equal(yossi.constraints[0].id, 'disc_herniation');

  // סניפים: שניים בלבד. כשכל המתאמנים משויכים לסניף אין טעם בסטודיו ראשי ריק.
  assert.equal(out.studios.length, 2);
  assert.deepEqual(out.studios.map((s) => s.name).sort(), ['סניף דרום', 'סניף צפון']);
  assert.ok(out.studios.every((s) => s.equipment.length >= 4), 'סניף בלי לשונית ציוד יורש את הציוד');
  assert.ok(out.studios.every((s) => out.trainees.some((t) => t.homeStudioId === s.id)),
    'לכל סטודיו שנוצר יש מתאמנים');
  assert.equal(ron.homeStudioId, out.studios.find((s) => s.name === 'סניף צפון').id);

  // ציוד
  const main = out.studios.find((s) => s.name === 'סניף צפון');
  assert.ok(main.equipment.some((e) => e.item === 'dumbbell' && e.count === 12));
  assert.equal(main.dumbbellMaxKg, 30);
  assert.deepEqual(out.report.unmatched.equipment, ['מכונת אספרסו']);

  // תכנית שיובאה
  assert.equal(out.snapshots.length, 1);
  const snap = out.snapshots[0];
  assert.equal(snap.traineeId, ron.id);
  assert.equal(snap.daysPerWeek, 2);
  assert.equal(snap.totalExercises, 4);
  assert.equal(snap.program.days[0].blocks[0].exercise.id, 'bb_back_squat');
  assert.equal(snap.program.days[0].blocks[0].load.kg, 80);
  assert.equal(snap.program.days[0].blocks[0].prescription.sets, 4);
  assert.equal(snap.program.days[0].blocks[1].prescription.reps, '8-10');

  // תרגיל שלא זוהה נשמר ולא נעלם
  assert.ok(out.report.unmatched.exercises.includes('תרגיל הבית של הסטודיו'));
  assert.ok(main.customExercises.some((c) => c.name === 'תרגיל הבית של הסטודיו'));

  assert.equal(out.report.counts.trainees, 3);
  assert.ok(out.report.counts.attendance >= 5);
});

test('המתאמנים שיובאו עוברים את האימות ומייצרים תכנית אמיתית', () => {
  const out = shBuildImport(shAnalyzeWorkbook(FULL_WORKBOOK()), { studioName: 'רשת הסטודיו' });
  for (const raw of out.trainees) {
    const trainee = normalizeTrainee(raw);
    const studio = normalizeStudio(out.studios.find((s) => s.id === trainee.homeStudioId));
    assert.ok(LEVELS.includes(trainee.level));
    assert.ok(GOALS.includes(trainee.primaryGoal));
    const v = validateInput(trainee, studio);
    assert.equal(v.ok, true, `${trainee.name}: ${v.errors.join(', ')}`);
    const program = generateWeeklyProgram(trainee, studio);
    assert.ok(program.days.length >= 1);
    assert.ok(program.days.every((d) => d.blocks.length > 0));
  }
});

test('מתאמן שמופיע רק בלשונית תכנית נוצר גם הוא', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('מיכל אבן', 'תרגיל,סטים,חזרות\nסקוואט,3,10\nמתח,3,8'),
  ]), { studioName: 'סטודיו' });
  assert.equal(out.trainees.length, 1);
  assert.equal(out.trainees[0].name, 'מיכל אבן');
  assert.equal(out.snapshots[0].traineeId, out.trainees[0].id);
});

test('תדירות אמיתית נגזרת מהנוכחות כשאין עמודת ימים בשבוע', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('נוכחות', [
      'שם,05/01/2026,07/01/2026,12/01/2026,14/01/2026,19/01/2026,21/01/2026',
      'תמר גל,V,V,V,V,V,V',
    ].join('\n')),
  ]), { studioName: 'סטודיו' });
  const tamar = out.trainees[0];
  assert.equal(tamar.sessions.length, 6);
  assert.equal(tamar.daysPerWeek, 2);
  assert.equal(tamar.frequencyFromAttendance, true);
});

test('מתאמן לא פעיל מיובא ומסומן, ולא נמחק בשקט', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('מתאמנים', 'שם,גיל,סטטוס\nאורי דן,50,לא פעיל\nגלית שי,33,פעיל'),
  ]), { studioName: 'סטודיו' });
  const uri = out.trainees.find((t) => t.name === 'אורי דן');
  assert.equal(uri.inactive, true);
  assert.ok(uri.notes.includes('לא פעיל'));
  assert.ok(!out.trainees.find((t) => t.name === 'גלית שי').inactive);
});

test('עמודות שלא זוהו נשמרות כהערה ולא נזרקות', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('מתאמנים', 'שם,גיל,מידת חולצה,שם בן/בת הזוג\nניר לוי,40,L,מיכל'),
  ]), { studioName: 'סטודיו' });
  const nir = out.trainees[0];
  assert.ok(nir.notes.includes('מידת חולצה: L'), nir.notes);
  assert.ok(nir.notes.includes('מיכל'));
});

test('גיליון ריק או חסר משמעות אינו מייצר נתונים ואינו נופל', () => {
  const empty = shBuildImport(shAnalyzeWorkbook([sheet('ריק', ''), sheet('כותרת בלבד', 'שם,גיל')]), { studioName: 'ס' });
  assert.equal(empty.trainees.length, 0);
  assert.ok(empty.report.warnings.some((w) => w.includes('לא זוהו מתאמנים')));

  const junk = shBuildImport(shAnalyzeWorkbook([sheet('משהו', '1,2,3\n4,5,6\n7,8,9')]), { studioName: 'ס' });
  assert.equal(junk.trainees.length, 0);
});

test('שמות ששונים רק באות סופית לא מתמזגים למזהה אחד', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('מתאמנים', 'שם,גיל,טלפון\nרון כהן,30,0541111111\nרונ כהנ,31,0542222222'),
  ]), { studioName: 'ס' });
  const ids = out.trainees.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'מזהים ייחודיים');
});

test('גיליון גדול עובר בזמן סביר', () => {
  const rows = ['שם,גיל,טלפון,מטרה,פציעות,ימים בשבוע'];
  for (let i = 0; i < 2000; i++) {
    rows.push(`מתאמן ${i},${20 + (i % 50)},05${String(10000000 + i)},כושר כללי,${i % 7 === 0 ? 'כאבי ברך' : ''},${1 + (i % 5)}`);
  }
  const started = Date.now();
  const out = shBuildImport(shAnalyzeWorkbook([sheet('מתאמנים', rows.join('\n'))]), { studioName: 'ס' });
  const elapsed = Date.now() - started;
  assert.equal(out.trainees.length, 2000);
  assert.ok(elapsed < 15000, `הייבוא לקח ${elapsed}ms`);
});

test('טקסט עוין בתא לא הופך לקוד ולא שובר את הייבוא', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('מתאמנים', 'שם,גיל,הערות\n"<script>alert(1)</script>",30,"=1+1"\n"__proto__",25,x'),
  ]), { studioName: 'ס' });
  assert.equal(out.trainees.length, 2);
  assert.equal(typeof ({}).polluted, 'undefined');
  assert.ok(out.trainees.every((t) => typeof t.name === 'string'));
});

/* --------------------------------------------------------------- Google */

test('קריאת כתובת של גיליון', () => {
  assert.deepEqual(shParseSheetUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=555'),
    { id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', gid: '555', kind: 'standard' });
  assert.equal(shParseSheetUrl('https://example.com/x'), null);
  assert.equal(shParseSheetUrl(''), null);
  assert.ok(shGvizUrl('ID', { gid: '5' }).startsWith('https://docs.google.com/spreadsheets/d/ID/gviz/tq?'));
});

test('תשובת gviz הופכת למטריצה עם שורת כותרות', () => {
  const matrix = shGvizToMatrix({
    table: {
      cols: [{ label: 'שם' }, { label: 'תאריך' }],
      rows: [{ c: [{ v: 'רון' }, { v: 'Date(2026,1,3)', f: '03/02/2026' }] }, { c: [{ v: 'דנה' }, null] }],
    },
  });
  assert.deepEqual(matrix, [['שם', 'תאריך'], ['רון', '03/02/2026'], ['דנה', '']]);
  assert.deepEqual(shGvizToMatrix({}), []);
});
