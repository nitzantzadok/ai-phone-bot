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
import {
  shDecodeBytes, shParseDelimited, shSniffDelimiter, shSplitBlocks, shTableFromText, shToTable,
} from '../src/domain/sheets/table.js';
import { shIsZip, shReadXlsx } from '../src/domain/sheets/xlsx.js';
import { shReadFile } from '../src/domain/sheets/read.js';
import { shLooksLikePerson } from '../src/domain/sheets/person.js';
import { shAnalyzeWorkbookAsync } from '../src/domain/sheets/build.js';
import { shParseAny, shParseHtmlTables, shParseJsonRows } from '../src/domain/sheets/table.js';
import { shFixHeaderless, shMapColumns } from '../src/domain/sheets/columns.js';
import { shClassifyTable } from '../src/domain/sheets/classify.js';
import { shAnalyzeWorkbook, shBuildImport } from '../src/domain/sheets/build.js';
import {
  constraintCandidates, equipmentCandidates, exerciseCandidates, HEADER_TERMS, shCandidates,
  shForgetAliases, shLearnAlias,
} from '../src/domain/sheets/vocab.js';
import { shGvizToMatrix, shGvizUrl, shParseSheetUrl } from '../src/domain/sheets/google.js';
import {
  SH_PROGRAM_COLUMNS, shProgramFileName, shProgramRows, shProgramsRows, shToCsv, shToTsv,
} from '../src/domain/sheets/export.js';
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

test('ייבוא לתוך סטודיו קיים מוסיף ואינו מוחק', () => {
  const existing = {
    id: 'studio_kayam', name: 'סטודיו קיים',
    equipment: [{ item: 'reformer', count: 4 }, { item: 'dumbbell', count: 6 }],
    customExercises: [{ id: 'c1', name: 'תרגיל ותיק של הבית', custom: true }],
  };
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('ציוד', 'פריט,כמות\nמשקולות יד,12\nמוט מתח,1'),
    sheet('תכנית של יעל', 'תרגיל,סטים,חזרות\nסקוואט,3,10\nתרגיל חדש של הבית,3,12'),
  ]), { studioName: 'לא בשימוש', studioId: existing.id, baseStudio: existing });

  const studio = out.studios[0];
  assert.equal(studio.id, 'studio_kayam');
  assert.equal(studio.name, 'סטודיו קיים', 'שם הסטודיו הקיים נשמר');
  assert.ok(studio.equipment.some((e) => e.item === 'reformer'), 'ציוד קיים לא נמחק');
  assert.ok(studio.equipment.some((e) => e.item === 'pullup_bar'), 'ציוד חדש נוסף');
  const dumbbell = studio.equipment.find((e) => e.item === 'dumbbell');
  assert.equal(dumbbell.count, 12, 'הכמות הגדולה מבין השתיים');
  assert.ok(studio.customExercises.some((c) => c.name === 'תרגיל ותיק של הבית'), 'תרגילי הבית נשמרו');
  assert.ok(studio.customExercises.some((c) => c.name === 'תרגיל חדש של הבית'), 'ותרגיל חדש נוסף');
});

test('תיקון ידני של עמודה גובר על הזיהוי האוטומטי', () => {
  const sheets = [sheet('מתאמנים', 'שם,מספר,הערות\nרון כהן,3,אוהב בוקר\nדנה לוי,2,ערב בלבד')];
  const auto = shAnalyzeWorkbook(sheets);
  const numberCol = auto.sheets[0].columns[1];

  const fixed = shAnalyzeWorkbook(sheets, { columnOverrides: { מתאמנים: { 1: 'daysPerWeek' } } });
  assert.equal(fixed.sheets[0].byField.daysPerWeek, 1);
  assert.equal(fixed.sheets[0].columns[1].why, 'נבחר ידנית');
  const built = shBuildImport(fixed, { studioName: 'ס' });
  assert.equal(built.trainees.find((t) => t.name === 'רון כהן').daysPerWeek, 3);

  const off = shAnalyzeWorkbook(sheets, { columnOverrides: { מתאמנים: { 2: 'none' } } });
  assert.equal(off.sheets[0].columns[2].field, null);
  assert.ok(numberCol, 'העמודה קיימת גם בזיהוי האוטומטי');
});

test('כמות שכתובה בתוך שם הפריט נספרת', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('ציוד', '12 זוגות משקולות יד\n2 הליכונים\nמוט מתח אחד\n6 קטלבלים\nמשקולות יד 2-30 ק"ג'),
  ]), { studioName: 'ס' });
  const eq = Object.fromEntries(out.studios[0].equipment.map((e) => [e.item, e.count]));
  assert.equal(eq.dumbbell, 12);
  assert.equal(eq.treadmill, 2);
  assert.equal(eq.kettlebell, 6);
  assert.equal(eq.pullup_bar, 1);
  assert.equal(out.studios[0].dumbbellMaxKg, 30, 'טווח משקלים אינו כמות');
});

test('שם המתאמן נלקח מכותרת הגיליון כשהלשונית חסרת שם', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('גיליון1', 'תכנית אימון — מיכל אבן,,,\n,,,\nתרגיל,סטים,חזרות,משקל\nסקוואט,4,8,60\nמתח,3,6,'),
  ]), { studioName: 'ס' });
  assert.deepEqual(out.trainees.map((t) => t.name), ['מיכל אבן']);
  assert.equal(out.snapshots.length, 1);
  assert.equal(out.snapshots[0].totalExercises, 2);
});

test('הניסוח המקורי של המטרה נשמר לצד הקטגוריה', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('מתאמנים', 'שם,גיל,מטרה\nשירה כהן,29,לרזות לקראת החתונה\nאבי לוי,50,כוח'),
  ]), { studioName: 'ס' });
  const shira = out.trainees.find((t) => t.name === 'שירה כהן');
  assert.equal(shira.primaryGoal, 'fat_loss');
  assert.equal(shira.goalDetail, 'לרזות לקראת החתונה');
  assert.equal(out.trainees.find((t) => t.name === 'אבי לוי').goalDetail, undefined, 'מילה אחת לא צריכה פירוט');
});

test('כותרות באנגלית מזוהות כמו כותרות בעברית', () => {
  const out = shBuildImport(shAnalyzeWorkbook([
    sheet('Members', 'Full Name,Age,Gender,Phone,Weight,Level,Goal,Injuries,Days per week\nRon Cohen,34,M,054-1234567,82,advanced,muscle,knee pain,3'),
  ]), { studioName: 'ס' });
  const ron = out.trainees[0];
  assert.equal(ron.name, 'Ron Cohen');
  assert.equal(ron.age, 34);
  assert.equal(ron.sex, 'male');
  assert.equal(ron.level, 'advanced');
  assert.equal(ron.primaryGoal, 'hypertrophy');
  assert.equal(ron.daysPerWeek, 3);
  assert.equal(ron.constraints[0].id, 'knee_pain_patellofemoral');
});

test('לשונית פרטי סטודיו מזוהה לפי התוכן גם כשהשם שלה חסר משמעות', () => {
  const info = sheet('גיליון2', [
    'שם הסטודיו,פאוור לאב',
    'כתובת,הרצל 5 תל אביב',
    'טלפון,03-1234567',
    'אורך אימון,60',
    'מתאמנים במקביל,8',
    'מאמנים,2',
  ].join('\n'));
  assert.equal(shClassifyTable(info.table).role, 'studio');

  const out = shBuildImport(shAnalyzeWorkbook([info]), { studioName: 'זמני' });
  assert.equal(out.studios[0].name, 'פאוור לאב');
  assert.equal(out.studios[0].sessionMinutes, 60);
  assert.equal(out.studios[0].concurrentTrainees, 8);
  assert.equal(out.studios[0].trainersOnFloor, 2);
  assert.equal(out.studios[0].profile.phone, '03-1234567');

  // רשימת שמות וטלפונים היא אותה צורה בדיוק — ואסור שתיקרא כפרטי מקום
  const people = sheet('גיליון3', 'רון כהן,0541234567\nדנה לוי,0521112222\nיוסי מור,0509998888');
  assert.equal(shClassifyTable(people.table).role, 'trainees');
});

/* ------------------------------------------------------- ייצוא לגיליון */

const demoProgram = () => {
  const studio = normalizeStudio({
    id: 's1', name: 'סטודיו', dumbbellMaxKg: 40,
    equipment: ['dumbbell', 'barbell', 'bench_flat', 'squat_rack', 'pullup_bar', 'cable_crossover'],
  });
  const trainee = normalizeTrainee({
    id: 't1', name: 'רון כהן', studioId: 's1', level: 'intermediate', primaryGoal: 'hypertrophy',
    daysPerWeek: 3, age: 34, weightKg: 82, trainingAgeMonths: 24,
  });
  return { program: generateWeeklyProgram(trainee, studio), trainee, studio };
};

test('תכנית מיוצאת לטבלה שאפשר להדביק בגיליון', () => {
  const { program } = demoProgram();
  const rows = shProgramRows(program);

  assert.deepEqual(rows[0], SH_PROGRAM_COLUMNS);
  const totalBlocks = program.days.reduce((n, d) => n + d.blocks.length, 0);
  assert.equal(rows.length, totalBlocks + 1);
  assert.ok(rows.every((r) => r.length === SH_PROGRAM_COLUMNS.length), 'כל השורות באותו רוחב');
  assert.ok(rows.slice(1).every((r) => r[0] === 'רון כהן'));

  // תא שמכיל טאב או ירידת שורה היה שובר את ההדבקה לתאים
  const tsv = shToTsv(rows);
  assert.equal(tsv.split('\n').length, rows.length);
  assert.ok(tsv.split('\n').every((line) => line.split('\t').length === SH_PROGRAM_COLUMNS.length));
});

test('טבלה מיוצאת חוזרת פנימה בייבוא בלי אובדן', () => {
  const { program } = demoProgram();
  const tsv = shToTsv(shProgramRows(program));

  const analysis = shAnalyzeWorkbook([{ name: 'תכנית', table: shTableFromText(tsv, { name: 'תכנית' }) }]);
  assert.equal(analysis.sheets[0].role, 'programs');
  const map = analysis.sheets[0].byField;
  for (const field of ['name', 'exercise', 'sets', 'reps', 'load']) {
    assert.ok(map[field] !== undefined, `העמודה ${field} זוהתה בחזרה`);
  }

  const back = shBuildImport(analysis, { studioName: 'סטודיו' });
  assert.equal(back.trainees.length, 1);
  assert.equal(back.trainees[0].name, 'רון כהן');
  assert.equal(back.snapshots.length, 1);
  assert.equal(back.snapshots[0].daysPerWeek, program.days.length, 'אותו מספר ימים');
  assert.equal(back.snapshots[0].totalExercises,
    program.days.reduce((n, d) => n + d.blocks.length, 0), 'אותו מספר תרגילים');
  assert.equal(back.report.unmatched.exercises.length, 0, 'כל התרגילים זוהו בחזרה');

  // הסטים והחזרות של התרגיל הראשון שרדו את הסיבוב המלא
  const first = program.days[0].blocks[0];
  const returned = back.snapshots[0].program.days[0].blocks[0];
  assert.equal(returned.exercise.name, first.exercise.name);
  assert.equal(returned.prescription.sets, first.prescription.sets);
  assert.equal(String(returned.prescription.reps), String(first.prescription.reps));
});

test('כמה תכניות יוצאות בטבלה אחת עם כותרת אחת', () => {
  const { program } = demoProgram();
  const second = { ...structuredClone(program), traineeName: 'דנה לוי', traineeId: 't2' };
  const rows = shProgramsRows([program, second]);
  const header = rows.filter((r) => r[0] === 'מתאמן');
  assert.equal(header.length, 1);
  assert.deepEqual([...new Set(rows.slice(1).map((r) => r[0]))], ['רון כהן', 'דנה לוי']);
});

test('CSV מצטט נכון תא שמכיל פסיק או מרכאות', () => {
  const csv = shToCsv([['שם', 'הערה'], ['רון', 'כבד, אבל נקי'], ['דנה', 'אמרה "מספיק"']]);
  assert.equal(csv.split('\n')[1], 'רון,"כבד, אבל נקי"');
  assert.equal(csv.split('\n')[2], 'דנה,"אמרה ""מספיק"""');
});

test('שם קובץ להורדה הוא ASCII — אחרת הדפדפן משמיט אותו', () => {
  // שם עברי בלבד: הדפדפן היה מוריד "download" בלי סיומת
  assert.equal(shProgramFileName({ traineeName: 'רון כהן', generatedAt: '2026-02-03T10:00:00.000Z' }),
    'studio-program-2026-02-03.csv');
  assert.equal(shProgramFileName({ traineeName: 'Ron Cohen', generatedAt: '2026-02-03T10:00:00.000Z' }),
    'studio-program-ron-cohen-2026-02-03.csv');
  for (const name of ['רון/כהן', 'A*B?C', '']) {
    const file = shProgramFileName({ traineeName: name, generatedAt: '2026-02-03T10:00:00.000Z' });
    assert.ok(/^[\x20-\x7e]+$/.test(file), `ASCII בלבד: ${file}`);
    assert.ok(file.endsWith('.csv'));
    assert.ok(!/[\\/:*?"<>|]/.test(file), `בלי תווים אסורים במערכת קבצים: ${file}`);
  }
});


/* =================================================================== קובץ Excel */

/** בונה קובץ xlsx אמיתי — ZIP עם CRC נכון, דחוס או שמור. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes) => {
  let c = 0xFFFFFFFF;
  for (const x of bytes) c = CRC_TABLE[(c ^ x) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

async function makeZip(files, { compress = true } = {}) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  const num = (n, size) => {
    const b = new Uint8Array(size);
    for (let i = 0; i < size; i++) b[i] = (n >> (8 * i)) & 0xff;
    return b;
  };
  const put = (arr) => { parts.push(arr); offset += arr.length; };

  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = compress
      ? new Uint8Array(await new Response(new Blob([raw]).stream()
        .pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : raw;
    const method = compress ? 8 : 0;
    const crc = crc32(raw);
    const nameBytes = enc.encode(name);
    const local = offset;
    put(new Uint8Array([0x50, 0x4b, 0x03, 0x04])); put(num(20, 2)); put(num(0, 2)); put(num(method, 2));
    put(num(0, 2)); put(num(0, 2)); put(num(crc, 4)); put(num(data.length, 4)); put(num(raw.length, 4));
    put(num(nameBytes.length, 2)); put(num(0, 2)); put(nameBytes); put(data);
    central.push([new Uint8Array([0x50, 0x4b, 0x01, 0x02]), num(20, 2), num(20, 2), num(0, 2),
      num(method, 2), num(0, 2), num(0, 2), num(crc, 4), num(data.length, 4), num(raw.length, 4),
      num(nameBytes.length, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 4),
      num(local, 4), nameBytes]);
  }
  const cdStart = offset;
  for (const c of central) for (const arr of c) put(arr);
  const cdSize = offset - cdStart;
  put(new Uint8Array([0x50, 0x4b, 0x05, 0x06])); put(num(0, 2)); put(num(0, 2));
  put(num(central.length, 2)); put(num(central.length, 2));
  put(num(cdSize, 4)); put(num(cdStart, 4)); put(num(0, 2));

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const xlsxFixture = (compress = true) => {
  const shared = ['שם', 'גיל', 'מטרה', 'תאריך הצטרפות', 'רון כהן', 'מסה', 'דנה לוי', 'פריט', 'כמות', 'משקולות יד'];
  return makeZip({
    'xl/workbook.xml': '<?xml version="1.0"?><workbook><sheets>'
      + '<sheet name="מתאמנים" sheetId="1" r:id="rId1"/><sheet name="ציוד" sheetId="2" r:id="rId2"/>'
      + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships>'
      + '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst>${shared.map((x) => `<si><t>${x}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet><numFmts>'
      + '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
      + '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>'
      + '<c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>34</v></c>'
      + '<c r="C2" t="s"><v>5</v></c><c r="D2" s="1"><v>45000</v></c></row>'
      // דנה בלי גיל: התא פשוט אינו קיים בקובץ, והעמודות שאחריו חייבות להישאר במקומן
      + '<row r="3"><c r="A3" t="s"><v>6</v></c><c r="C3" t="inlineStr"><is><t>כושר כללי</t></is></c></row>'
      + '</sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<?xml version="1.0"?><worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>7</v></c><c r="B1" t="s"><v>8</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>9</v></c><c r="B2"><v>12</v></c></row>'
      + '</sheetData></worksheet>',
  }, { compress });
};

test('קובץ xlsx נקרא במלואו — דחוס ולא דחוס', async () => {
  for (const compress of [true, false]) {
    const bytes = await xlsxFixture(compress);
    assert.ok(shIsZip(bytes));
    const sheets = await shReadXlsx(bytes);
    assert.deepEqual(sheets.map((s) => s.name), ['מתאמנים', 'ציוד'], `דחיסה=${compress}`);
    assert.deepEqual(sheets[0].rows[0], ['שם', 'גיל', 'מטרה', 'תאריך הצטרפות']);
    assert.deepEqual(sheets[0].rows[1], ['רון כהן', '34', 'מסה', '2023-03-15'], 'מספר סידורי הפך לתאריך');
    assert.deepEqual(sheets[0].rows[2], ['דנה לוי', '', 'כושר כללי'], 'תא חסר אינו מזיז עמודות');
    assert.deepEqual(sheets[1].rows[1], ['משקולות יד', '12']);
  }
});

test('קובץ xlsx עובר את כל מסלול הייבוא', async () => {
  const sheets = await shReadXlsx(await xlsxFixture());
  const analysis = shAnalyzeWorkbook(sheets.map((s) => ({ name: s.name, rows: s.rows })));
  assert.deepEqual(analysis.sheets.map((s) => s.role), ['trainees', 'equipment']);

  const out = shBuildImport(analysis, { studioName: 'סטודיו' });
  assert.deepEqual(out.trainees.map((t) => t.name), ['רון כהן', 'דנה לוי']);
  assert.equal(out.trainees[0].age, 34);
  assert.equal(out.trainees[0].startDate, '2023-03-15');
  assert.equal(out.trainees[1].primaryGoal, 'general_fitness');
  assert.ok(out.studios[0].equipment.some((e) => e.item === 'dumbbell' && e.count === 12));
});

test('קובץ שאינו Excel אינו מתחזה לכזה', async () => {
  assert.ok(!shIsZip(new TextEncoder().encode('שם,גיל\nרון,34')));
  await assert.rejects(() => shReadXlsx(new TextEncoder().encode('לא ארכיון')));
  await assert.rejects(() => shReadXlsx(makeZip({ 'hello.txt': 'שלום' })));
});

/* ------------------------------------------------------------- קידוד וגושים */

test('CSV שנשמר בעברית של Excel נקרא נכון ולא כג׳יבריש', () => {
  const utf8 = new TextEncoder().encode('שם,גיל\nרון,34');
  assert.equal(shDecodeBytes(utf8), 'שם,גיל\nרון,34');

  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  assert.equal(shDecodeBytes(withBom), 'שם,גיל\nרון,34');

  // windows-1255: אלף=0xE0 ... כמו שExcel בעברית שומר
  const cp1255 = new Uint8Array([0xf9, 0xed, 0x2c, 0xe2, 0xe9, 0xec]);
  assert.equal(shDecodeBytes(cp1255), 'שם,גיל');

  const utf16 = new Uint8Array([0xff, 0xfe, 0xe9, 0x05, 0xdd, 0x05]);
  assert.equal(shDecodeBytes(utf16), 'שם');
});

test('שתי טבלאות באותה לשונית נקראות בנפרד', () => {
  const rows = shParseDelimited([
    'שם,גיל,מטרה', 'רון כהן,34,מסה', 'דנה לוי,28,כושר',
    '', '',
    'פריט,כמות', 'משקולות יד,12', 'מוט מתח,1',
  ].join('\n'));
  assert.equal(shSplitBlocks(rows).length, 2);

  const analysis = shAnalyzeWorkbook([{ name: 'גיליון1', rows }]);
  assert.deepEqual(analysis.sheets.map((s) => s.role), ['trainees', 'equipment']);
  const out = shBuildImport(analysis, { studioName: 'ס' });
  assert.equal(out.trainees.length, 2);
  assert.ok(out.studios[0].equipment.some((e) => e.item === 'dumbbell'));
});

/* ------------------------------------------------- פריסות אמיתיות של גיליונות */

test('שם מפוצל לשתי עמודות מזוהה כרשימת מתאמנים', () => {
  const analysis = shAnalyzeWorkbook([{
    name: 'גיליון1',
    rows: shParseDelimited([
      'שם פרטי,שם משפחה,טלפון,גיל,מין,מצב רפואי,מטרה',
      'רון,כהן,541234567,34,ז,כאבי ברך שמאל,מסה',
      'דנה,לוי,0521112222,28,נ,,ירידה במשקל',
      'סה"כ,2,,,,,',
    ].join('\n')),
  }]);
  assert.equal(analysis.sheets[0].role, 'trainees');

  const out = shBuildImport(analysis, { studioName: 'ס' });
  assert.deepEqual(out.trainees.map((t) => t.name), ['רון כהן', 'דנה לוי']);
  assert.equal(out.trainees[0].phone, '0541234567', 'אפס מוביל שנמחק בגיליון מוחזר');
  assert.equal(out.trainees[0].constraints[0].side, 'left');
});

test('כרטיס אישי אנכי הופך למתאמן אחד', () => {
  const analysis = shAnalyzeWorkbook([{
    name: 'רון',
    rows: shParseDelimited([
      'שם,רון כהן', 'גיל,34', 'משקל,82', 'גובה,178', 'מטרה,מסה',
      'רמה,מתקדם', 'פציעות,כאב ברך שמאל', 'ימים בשבוע,3', 'טלפון,054-1234567',
    ].join('\n')),
  }]);
  assert.equal(analysis.sheets[0].role, 'trainee_card');

  const out = shBuildImport(analysis, { studioName: 'ס' });
  assert.equal(out.trainees.length, 1);
  const t = out.trainees[0];
  assert.equal(t.name, 'רון כהן');
  assert.equal(t.age, 34);
  assert.equal(t.weightKg, 82);
  assert.equal(t.heightCm, 178);
  assert.equal(t.level, 'advanced');
  assert.equal(t.daysPerWeek, 3);
  assert.equal(t.constraints[0].id, 'knee_pain_patellofemoral');
});

test('רשימת מתאמנים קצרה אינה נקראת כטבלה אנכית', () => {
  const analysis = shAnalyzeWorkbook([{
    name: 'מתאמנים',
    rows: shParseDelimited('שם,מספר,הערות\nרון כהן,3,אוהב בוקר\nדנה לוי,2,ערב בלבד'),
  }]);
  assert.equal(analysis.sheets[0].role, 'trainees');
  assert.equal(shBuildImport(analysis, { studioName: 'ס' }).trainees.length, 2);
});

test('צ׳קליסט ציוד: מה שמסומן כלא קיים אינו מיובא', () => {
  const mixed = shBuildImport(shAnalyzeWorkbook([{
    name: 'ציוד',
    rows: shParseDelimited('פריט,קיים\nמשקולות יד,V\nמוט מתח,כן\nהליכון,X\nריפורמר,לא'),
  }]), { studioName: 'ס' });
  assert.deepEqual(mixed.studios[0].equipment.map((e) => e.item).sort(), ['dumbbell', 'pullup_bar']);

  // טבלה שכולה X — הסימון פירושו "יש", ואין ממה להסיק אחרת
  const allX = shBuildImport(shAnalyzeWorkbook([{
    name: 'ציוד',
    rows: shParseDelimited('פריט,סימון\nמשקולות יד,X\nהליכון,X'),
  }]), { studioName: 'ס' });
  assert.equal(allX.studios[0].equipment.length, 2);
});

test('רעש בלתי נראה בתאים אינו נדבק לשמות', () => {
  const out = shBuildImport(shAnalyzeWorkbook([{
    name: 'מתאמנים',
    rows: shParseDelimited('שם\u200f,גיל,טלפון\n\u200eרון  כהן\u00a0,34,054-1234567'),
  }]), { studioName: 'ס' });
  assert.equal(out.trainees[0].name, 'רון כהן');
});

test('עמודת מספר רץ אינה נקראת כמשקל', () => {
  const out = shBuildImport(shAnalyzeWorkbook([{
    name: 'מתאמנים',
    rows: shParseDelimited('קוד,סניף,שם מלא,גיל,מטרה\n101,מרכז,רון כהן,34,מסה\n102,מרכז,דנה לוי,28,כושר'),
  }]), { studioName: 'ס' });
  assert.equal(out.trainees[0].name, 'רון כהן');
  assert.equal(out.trainees[0].weightKg, undefined, 'מספר רץ אינו משקל גוף');
});

test('שתי מטרות בתא אחד, מחוברות בו׳', () => {
  const out = shBuildImport(shAnalyzeWorkbook([{
    name: 'מתאמנים',
    rows: shParseDelimited('שם,גיל,מטרה\nרון,34,חיזוק ויציבה'),
  }]), { studioName: 'ס' });
  assert.deepEqual(out.trainees[0].goals, ['strength', 'posture']);
});

/* ==================================================================
   כל הדרכים להכניס גיליון פנימה

   מאמן לא בוחר פורמט — הוא לוקח את מה שיש לו. הבדיקות כאן עוברות על כל
   הדרכים שבהן גיליון מגיע בפועל: קובץ ods, הדבקה של טבלה מדף, ייצוא JSON,
   טבלה מיושרת ברווחים, וקבצים שאי אפשר לקרוא ושחייבים להסביר למה.
   ================================================================== */

const odsFixture = (cells) => makeZip({
  'mimetype': 'application/vnd.oasis.opendocument.spreadsheet',
  'content.xml': `<?xml version="1.0"?><office:document-content><office:body><office:spreadsheet>
    <table:table table:name="מתאמנים">${cells}</table:table>
  </office:spreadsheet></office:body></office:document-content>`,
});

test('ods: קובץ LibreOffice נקרא כמו כל גיליון אחר', async () => {
  const bytes = await odsFixture(
    '<table:table-row><table:table-cell><text:p>שם</text:p></table:table-cell>'
    + '<table:table-cell><text:p>גיל</text:p></table:table-cell>'
    + '<table:table-cell><text:p>הצטרפות</text:p></table:table-cell></table:table-row>'
    + '<table:table-row><table:table-cell><text:p>רון כהן</text:p></table:table-cell>'
    + '<table:table-cell office:value-type="float" office:value="34"><text:p>34</text:p></table:table-cell>'
    + '<table:table-cell office:value-type="date" office:date-value="2024-03-01T00:00:00"/></table:table-row>',
  );
  const sheets = await shReadFile(bytes, 'הסטודיו שלי.ods');
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'מתאמנים');
  assert.deepEqual(sheets[0].rows[0], ['שם', 'גיל', 'הצטרפות']);
  assert.deepEqual(sheets[0].rows[1], ['רון כהן', '34', '2024-03-01']);
});

test('ods: תא ריק שחוזר על עצמו אינו מזיז את העמודות שאחריו', async () => {
  const bytes = await odsFixture(
    '<table:table-row><table:table-cell><text:p>שם</text:p></table:table-cell>'
    + '<table:table-cell table:number-columns-repeated="2"/>'
    + '<table:table-cell><text:p>מטרה</text:p></table:table-cell></table:table-row>'
    + '<table:table-row><table:table-cell><text:p>דנה</text:p></table:table-cell>'
    + '<table:table-cell table:number-columns-repeated="2"/>'
    + '<table:table-cell><text:p>מסה</text:p></table:table-cell></table:table-row>',
  );
  const [sheet] = await shReadFile(bytes, 'a.ods');
  assert.equal(sheet.rows[1][3], 'מסה');
});

test('ods נקרא גם כששמו נגמר ב-xlsx: ההכרעה היא לפי תוכן הארכיון', async () => {
  const bytes = await odsFixture('<table:table-row><table:table-cell><text:p>שם</text:p></table:table-cell>'
    + '<table:table-cell><text:p>רון</text:p></table:table-cell></table:table-row>');
  const [sheet] = await shReadFile(bytes, 'trainees.xlsx');
  assert.deepEqual(sheet.rows[0], ['שם', 'רון']);
});

test('הדבקה: טבלת HTML מהלוח נשמרת עם גבולות התאים', () => {
  const rows = shParseAny(`<table><tr><th>שם</th><th>הערה</th></tr>
    <tr><td>רון כהן</td><td>כאב<br>בכתף</td></tr>
    <tr><td>דנה&nbsp;לוי</td><td></td></tr></table>`);
  assert.deepEqual(rows[1], ['רון כהן', 'כאב בכתף']);
  assert.deepEqual(rows[2], ['דנה לוי', '']);
});

test('הדבקה: תא ממוזג ב-HTML אינו מסיט את שאר השורה', () => {
  const rows = shParseAny('<table><tr><td colspan="2">מתאמני הסטודיו</td></tr>'
    + '<tr><td>שם</td><td>גיל</td></tr><tr><td>רון</td><td>34</td></tr></table>');
  assert.deepEqual(rows[0], ['מתאמני הסטודיו', '']);
  assert.deepEqual(rows[2], ['רון', '34']);
});

test('הדבקה: טבלה שמיושרת ברווחים בלבד מפוצלת לעמודות', () => {
  const rows = shParseAny('שם        גיל   מטרה\nרון כהן    34    מסה\nדנה לוי    28    כוח');
  assert.deepEqual(rows[0], ['שם', 'גיל', 'מטרה']);
  assert.deepEqual(rows[1], ['רון כהן', '34', 'מסה']);
});

test('הדבקה: רווח בודד בתוך שם אינו נחשב גבול עמודה', () => {
  const rows = shParseAny('שם,גיל\nרון כהן,34');
  assert.deepEqual(rows[1], ['רון כהן', '34']);
});

test('JSON: ייצוא ממערכת אחרת הופך לטבלה עם כותרות', () => {
  const rows = shParseJsonRows(JSON.stringify([
    { name: 'רון כהן', age: 34, goals: ['מסה', 'כוח'] },
    { name: 'דנה לוי', phone: '050-1234567' },
  ]));
  assert.deepEqual(rows[0], ['name', 'age', 'goals', 'phone']);
  assert.deepEqual(rows[1], ['רון כהן', '34', 'מסה, כוח', '']);
  assert.deepEqual(rows[2], ['דנה לוי', '', '', '050-1234567']);
});

test('JSON: מערך עטוף באובייקט נמצא גם הוא', () => {
  const rows = shParseJsonRows('{"ok":true,"trainees":[{"שם":"רון"},{"שם":"דנה"}]}');
  assert.deepEqual(rows, [['שם'], ['רון'], ['דנה']]);
});

test('JSON: טקסט שאינו JSON אינו נחטף מהמסלול הרגיל', () => {
  assert.equal(shParseJsonRows('שם,גיל\nרון,34'), null);
  assert.deepEqual(shParseAny('שם,גיל\nרון,34')[1], ['רון', '34']);
});

test('קובץ JSON נקרא דרך אותה נקודת כניסה', async () => {
  const bytes = new TextEncoder().encode('[{"שם":"רון כהן","גיל":34}]');
  const [sheet] = await shReadFile(bytes, 'מתאמנים.json');
  assert.equal(sheet.name, 'מתאמנים');
  assert.deepEqual(sheet.rows, [['שם', 'גיל'], ['רון כהן', '34']]);
});

test('CSV בעברית של חלונות נקרא נכון גם בלי סימן סדר', async () => {
  // windows-1255: "שם,גיל" ואחריו שורה עם שם עברי
  const bytes = Uint8Array.from([0xf9, 0xed, 0x2c, 0xe2, 0xe9, 0xec, 0x0a, 0xf8, 0xe5, 0xef, 0x2c, 0x33, 0x34]);
  const [sheet] = await shReadFile(bytes, 'trainees.csv');
  assert.deepEqual(sheet.rows[0], ['שם', 'גיל']);
  assert.deepEqual(sheet.rows[1], ['רון', '34']);
});

test('קובץ xls ישן ו-PDF מוסברים במקום להיקרא כג׳יבריש', async () => {
  const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(() => shReadFile(xls, 'ישן.xls'), /xlsx|CSV/);
  const pdf = new TextEncoder().encode('%PDF-1.7\n...');
  await assert.rejects(() => shReadFile(pdf, 'תכנית.pdf'), /PDF/);
  await assert.rejects(() => shReadFile(new Uint8Array(0), 'ריק.csv'), /ריק/);
});

test('xlsx ממשיך להיקרא דרך נקודת הכניסה האחידה', async () => {
  const sheets = await shReadFile(await xlsxFixture(), 'הסטודיו.xlsx');
  assert.deepEqual(sheets.map((s) => s.name), ['מתאמנים', 'ציוד']);
});

test('כל הדרכים מגיעות לאותו סטודיו: הדבקה, HTML ו-JSON', () => {
  const expected = (rows) => {
    const out = shBuildImport(shAnalyzeWorkbook([{ name: 'מתאמנים', rows }]), { studioName: 'ס' });
    return out.trainees.map((t) => [t.name, t.age]);
  };
  const csv = expected(shParseAny('שם,גיל,מטרה\nרון כהן,34,מסה\nדנה לוי,28,כוח'));
  const html = expected(shParseAny('<table><tr><td>שם</td><td>גיל</td><td>מטרה</td></tr>'
    + '<tr><td>רון כהן</td><td>34</td><td>מסה</td></tr><tr><td>דנה לוי</td><td>28</td><td>כוח</td></tr></table>'));
  const json = expected(shParseAny(JSON.stringify([
    { שם: 'רון כהן', גיל: 34, מטרה: 'מסה' }, { שם: 'דנה לוי', גיל: 28, מטרה: 'כוח' },
  ])));
  assert.deepEqual(csv, [['רון כהן', 34], ['דנה לוי', 28]]);
  assert.deepEqual(html, csv);
  assert.deepEqual(json, csv);
});

/* ==================================================================
   גיליון גדול: לשונית לכל מתאמן

   סטודיו שמנהל לכל מתאמן לשונית משלו מגיע עם מאה לשוניות ואלף שורות בכל
   אחת. הבדיקות כאן שומרות על שני דברים: שהניתוח נשאר בסדר גודל של שניות
   ולא של דקות, ושאפשר לנתח אותו בהפוגות בלי להקפיא את המסך.
   ================================================================== */

const bigWorkbook = (tabs, rowsPer) => {
  const ex = ['לחיצת חזה', 'סקוואט', 'מתח', 'חתירה', 'לחיצת כתפיים', 'דדליפט'];
  const first = ['מיקה', 'שי', 'יהוא', 'אילן', 'נועה', 'לודה', 'אריאל', 'יהב', 'נבו', 'אורי'];
  const last = ['מנדל', 'דמתי', 'כהן', 'אפרים', 'קרן', 'שפירא', 'בוגרוב', 'סימנה', 'שלוש', 'לוי'];
  const names = [];
  for (const f of first) for (const l of last) names.push(`${f} ${l}`);
  return names.slice(0, tabs).map((name) => ({
    name,
    rows: [['תרגיל', 'סטים', 'חזרות', 'משקל'],
      ...Array.from({ length: rowsPer }, (_, i) => [ex[i % ex.length], '3', '10', '40'])],
  }));
};

test('גיליון של 60 לשוניות ואלף שורות מנותח בזמן סביר', () => {
  const started = Date.now();
  const analysis = shAnalyzeWorkbook(bigWorkbook(60, 1000));
  const elapsed = Date.now() - started;
  assert.equal(analysis.sheets.length, 60);
  assert.ok(analysis.sheets.every((s) => s.role === 'programs'), 'כל לשונית היא תכנית של מתאמן');
  // לפני המטמון זה לקח דקות, והדפדפן הציע לסגור את הדף
  assert.ok(elapsed < 20000, `הניתוח לקח ${elapsed}ms`);
});

test('כל לשונית הופכת למתאמן עם התכנית שלו, בלי לאבד אף אחד', () => {
  const built = shBuildImport(shAnalyzeWorkbook(bigWorkbook(40, 50)), { studioName: 'ס' });
  assert.equal(built.trainees.length, 40);
  assert.equal(built.snapshots.length, 40);
  assert.equal(new Set(built.trainees.map((t) => t.id)).size, 40, 'מזהים ייחודיים');
});

test('הניתוח בהפוגות מחזיר בדיוק את אותה תוצאה, ומדווח התקדמות', async () => {
  const sheets = bigWorkbook(6, 20);
  const sync = shAnalyzeWorkbook(sheets);
  const steps = [];
  let breathed = 0;
  const async = await shAnalyzeWorkbookAsync(sheets, {
    onProgress: (done, total) => steps.push([done, total]),
    breathe: () => { breathed++; return Promise.resolve(); },
  });
  assert.deepEqual(async.counts, sync.counts);
  assert.deepEqual(async.sheets.map((s) => [s.name, s.role]), sync.sheets.map((s) => [s.name, s.role]));
  assert.deepEqual(steps.at(-1), [6, 6]);
  assert.equal(breathed, 6);
});

test('אותה השוואה חוזרת מחזירה את אותה תשובה גם דרך המטמון', () => {
  const a = shMatch('לחיצת חזה במוט', exerciseCandidates(), { min: 0.66 });
  const b = shMatch('לחיצת חזה במוט', exerciseCandidates(), { min: 0.66 });
  assert.deepEqual(a, b);
  // סף אחר הוא שאלה אחרת, ואסור שהמטמון יחזיר עליה את התשובה הקודמת
  const strict = shMatch('לחיצת חזה במוט', exerciseCandidates(), { min: 0.999 });
  assert.ok(!strict || strict.score >= 0.999);
  assert.equal(shCandidates(HEADER_TERMS), shCandidates(HEADER_TERMS), 'רשימת מועמדים נבנית פעם אחת');
});

test('יום עם מאות תרגילים נחתך, והמאמן מקבל הסבר איך לפצל אותו', () => {
  const ex = ['לחיצת חזה', 'סקוואט', 'מתח', 'חתירה'];
  const rows = [['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ...Array.from({ length: 400 }, (_, i) => [ex[i % 4], '3', '10', '40'])];
  const built = shBuildImport(shAnalyzeWorkbook([{ name: 'מיקה מנדל', rows }]), { studioName: 'ס' });
  const day = built.snapshots[0].program.days[0];
  assert.equal(day.blocks.length, 40);
  const warning = built.report.warnings.find((w) => w.includes('תרגילים'));
  assert.match(warning, /360 שורות/);
  assert.match(warning, /תאריך/);
  // הצילום נשאר בגודל שאפשר לשמור בדפדפן
  assert.ok(JSON.stringify(built.snapshots[0]).length < 60000);
});

test('תכנית בגודל רגיל אינה נחתכת ואינה מייצרת אזהרה', () => {
  const rows = [['תרגיל', 'סטים', 'חזרות'],
    ['לחיצת חזה', '3', '10'], ['סקוואט', '4', '8'], ['חתירה', '3', '12']];
  const built = shBuildImport(shAnalyzeWorkbook([{ name: 'שי דמתי', rows }]), { studioName: 'ס' });
  assert.equal(built.snapshots[0].program.days[0].blocks.length, 3);
  assert.ok(!built.report.warnings.some((w) => w.includes('לא נכנסו לתכנית')));
});

/* ==================================================================
   מה נחשב שם של אדם

   זו הטעות שהכי כואבת בייבוא: עמודת תרגילים או רשימת ציוד שנקראת
   כרשימת מתאמנים, והמאמן פותח את המערכת ומוצא בה "לחיצת חזה" כמתאמן.
   ================================================================== */

test('שמות של אנשים מתקבלים, ושמות של תרגילים וציוד נפסלים', () => {
  const people = ['רון כהן', 'דנה', 'מיקה מנדל', 'נועה בן דוד', 'Alex Cohen', 'חן לוי',
    'שרון אראל', 'יהב רוזנצוייג', 'אור', 'גיא גרימברג'];
  for (const name of people) assert.ok(shLooksLikePerson(name), `נפסל בטעות: ${name}`);

  const notPeople = ['לחיצת חזה במוט', 'סקוואט', 'מוט אולימפי', 'מכונת חזה', 'חתירה בישיבה',
    'דחיפת רגליים', 'סה"כ', 'ממוצע', 'שם מלא', 'יום שני', 'מתחילה', 'ירידה במשקל',
    '054-1234567', 'a@b.com', 'מתאמן', '12', 'משקולות יד'];
  for (const value of notPeople) assert.ok(!shLooksLikePerson(value), `התקבל בטעות: ${value}`);
});

test('לשונית תרגילים שסווגה בטעות כמתאמנים אינה מייצרת מתאמנים', () => {
  const rows = [['שם', 'סטים', 'חזרות'], ['לחיצת חזה במוט', '3', '10'],
    ['סקוואט', '4', '8'], ['חתירה בישיבה', '3', '12']];
  const built = shBuildImport(
    shAnalyzeWorkbook([{ name: 'גיליון', rows }], { overrides: { גיליון: 'trainees' } }),
    { studioName: 'ס' },
  );
  assert.equal(built.trainees.length, 0);
  assert.equal(built.report.rejectedNames.length, 3);
  assert.match(built.report.rejectedNames[0].why, /תרגיל/);
  assert.ok(built.report.warnings.some((w) => w.includes('לא זוהה אף מתאמן')));
});

test('עמודת תרגילים אינה ממופה כעמודת שם', () => {
  const table = shTableFromText('תרגיל,סטים\nלחיצת חזה,3\nסקוואט,4\nחתירה,3');
  const mapped = shMapColumns(table);
  assert.notEqual(mapped.columns[0].field, 'name');
});

test('בדיקת שם לא מאטה גיליון גדול', () => {
  const started = Date.now();
  for (let i = 0; i < 3000; i++) shLooksLikePerson(`נועה ${i} כהן`);
  assert.ok(Date.now() - started < 2000, 'בדיקת השמות איטית מדי');
});

test('סגנון אימון וסטטוס מיובאים מהגיליון', () => {
  const rows = [['שם', 'גיל', 'מטרה', 'סוג אימון', 'סטטוס'],
    ['רון כהן', '34', 'מסה', 'כוח + פיתוח גוף', 'פעיל'],
    ['דנה לוי', '28', 'כושר כללי', 'פונקציונלי', 'לא פעיל']];
  const built = shBuildImport(shAnalyzeWorkbook([{ name: 'מתאמנים', rows }]), { studioName: 'ס' });
  const [ron, dana] = built.trainees;
  assert.deepEqual(ron.trainingStyles, ['strength', 'bodybuilding']);
  assert.equal(ron.active, true);
  assert.deepEqual(dana.trainingStyles, ['functional']);
  assert.equal(dana.active, false);
});

test('ייבוא לומד רמה, ותק, משקלים ואורך אימון מהתכנית של המתאמן', () => {
  const trainees = [['שם', 'גיל', 'מין', 'משקל', 'מטרה', 'רמה'],
    ['רון כהן', '34', 'גבר', '82', 'מסה', 'מתחיל'],
    ['דנה לוי', '28', 'אישה', '', 'כוח', 'מתחילה']];
  const ron = [['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['סקוואט מוט על הגב', '4', '5', '110'],
    ['לחיצת חזה במוט', '4', '5', '80'],
    ['מתח', '3', '8', '0'],
    ['חתירה בהרכנה', '3', '8', '70']];
  const dana = [['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['לחיצת רגליים במכונה', '3', '12', '45'],
    ['לחיצת חזה במכונה', '3', '12', '20'],
    ['משיכת פולי עליון', '3', '12', '27']];

  const built = shBuildImport(shAnalyzeWorkbook([
    { name: 'מתאמנים', rows: trainees },
    { name: 'רון כהן', rows: ron },
    { name: 'דנה לוי', rows: dana },
  ]), { studioName: 'ס' });

  const byName = Object.fromEntries(built.trainees.map((t) => [t.name, t]));
  // מוצהר "מתחיל", אבל סקוואט 110 ומתח אומרים אחרת
  assert.equal(byName['רון כהן'].level, 'intermediate');
  assert.ok(byName['רון כהן'].trainingAgeMonths >= 12);
  assert.ok(byName['רון כהן'].knownMovements.includes('pullup'));
  assert.equal(byName['רון כהן'].history.bb_back_squat.load, 110);
  assert.ok(byName['רון כהן'].sessionMinutes >= 20);

  // מכונות במשקלים קלים אינן מעלות רמה
  assert.equal(byName['דנה לוי'].level, 'beginner');

  // והמאמן רואה מה נלמד ולמה
  const learned = built.report.learned.find((l) => l.name === 'רון כהן');
  assert.ok(learned.reasons.some((r) => r.includes('מיומנות')), learned.reasons.join(' | '));
  assert.ok(built.report.warnings.some((w) => w.includes('משקל גוף')), 'אין אזהרה על משקל גוף חסר');
});

test('ציוד הסטודיו מוסק מהתרגילים כשאין לשונית ציוד', () => {
  const built = shBuildImport(shAnalyzeWorkbook([
    { name: 'מתאמנים', rows: [['שם', 'מטרה'], ['רון כהן', 'מסה']] },
    { name: 'רון כהן', rows: [['תרגיל', 'סטים', 'חזרות', 'משקל'], ['לחיצת רגליים במכונה', '3', '12', '80']] },
  ]), { studioName: 'ס' });
  assert.ok(built.studios[0].equipment.some((e) => e.item === 'leg_press'));
  assert.ok(built.report.warnings.some((w) => w.includes('זוהו מתוך התרגילים')));
});

/* ------------------------------------------- מה עוד נלמד מתכנית שיובאה */

test('ייבוא לומד חלוקה, סגנון, ימים ודגשים ממתאמן שקיים רק כתכנית', () => {
  // מתאמן שאין לו שורה בשום רשימה — רק לשונית תכנית משלו, כמו בסטודיו אמיתי
  const yossi = [['יום', 'תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['יום א׳ — חזה וגב', 'לחיצת חזה במוט', '5', '3', '100'],
    ['יום א׳ — חזה וגב', 'חתירה בהרכנה', '5', '3', '90'],
    ['יום א׳ — חזה וגב', 'מתח', '4', '5', '10'],
    ['יום ד׳ — רגליים', 'סקוואט מוט על הגב', '5', '3', '140'],
    ['יום ד׳ — רגליים', 'דדליפט', '4', '3', '160'],
    ['יום ד׳ — רגליים', 'מכרעים עם משקולות', '3', '6', '30']];

  const built = shBuildImport(shAnalyzeWorkbook([
    { name: 'יוסי אברהם', rows: yossi },
  ]), { studioName: 'ס' });

  const t = built.trainees.find((x) => x.name === 'יוסי אברהם');
  assert.ok(t, 'מתאמן שמופיע רק בתכנית לא נכנס');

  // חלוקה: יום עליון מלא ויום תחתון מלא — פלג עליון/תחתון
  assert.equal(t.preferredSplit, 'upper_lower');
  // סגנון: 3 חזרות במשקל חופשי הוא אימון כוח
  assert.deepEqual(t.trainingStyles, ['strength']);
  assert.equal(t.primaryGoal, 'strength');
  // ימי האימון כתובים בשם היום ולא הולכים לאיבוד
  assert.deepEqual(t.preferredDays, ['sun', 'wed']);
  // והרמה, הוותק והמשקלים נלמדים כרגיל
  assert.equal(t.level, 'advanced');
  assert.equal(t.history.bb_back_squat.load, 140);
  // כל מסקנה מגיעה עם נימוק שהמאמן יכול לקרוא
  assert.ok(t.profileReasons.some((r) => r.includes('פלג')), t.profileReasons.join(' | '));
});

test('אימון מכונות בטווח בינוני מזוהה כפיתוח גוף, וגוף מלא כגוף מלא', () => {
  const maya = [['יום', 'תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['אימון 1', 'לחיצת חזה במכונה', '3', '12', '25'],
    ['אימון 1', 'משיכת פולי עליון', '3', '12', '30'],
    ['אימון 1', 'לחיצת רגליים במכונה', '3', '12', '60'],
    ['אימון 1', 'כפיפת מרפקים עם משקולות', '3', '12', '8'],
    ['אימון 2', 'לחיצת כתפיים במכונה', '3', '12', '20'],
    ['אימון 2', 'חתירה בישיבה בכבל', '3', '12', '35'],
    ['אימון 2', 'פשיטת ברכיים במכונה', '3', '12', '30'],
    ['אימון 2', 'פשיטת מרפקים בפולי', '3', '12', '15']];

  const built = shBuildImport(shAnalyzeWorkbook([
    { name: 'מאיה גל', rows: maya },
  ]), { studioName: 'ס' });

  const t = built.trainees.find((x) => x.name === 'מאיה גל');
  assert.equal(t.preferredSplit, 'full_body');
  assert.ok(t.trainingStyles.includes('bodybuilding'), JSON.stringify(t.trainingStyles));
});

test('מתאמן שלא נרשם לו דבר חודשים ארוכים מסומן לא פעיל, עם סיבה', () => {
  const log = [['תאריך', 'שם', 'תרגיל', 'משקל', 'חזרות'],
    ['01/02/2024', 'עמית דור', 'סקוואט מוט על הגב', '60', '8'],
    ['08/02/2024', 'עמית דור', 'לחיצת חזה במוט', '40', '8']];

  const built = shBuildImport(shAnalyzeWorkbook([
    { name: 'יומן אימונים', rows: log },
  ]), { studioName: 'ס' });

  const t = built.trainees.find((x) => x.name === 'עמית דור');
  assert.equal(t.active, false);
  assert.ok(t.inactiveReason.includes('2024'), t.inactiveReason);
  assert.ok(built.report.warnings.some((w) => w.includes('לא פעילים')));
});

test('מה שהמאמן כתב בגיליון גובר על מה שהמערכת הסיקה', () => {
  const trainees = [['שם', 'סגנון אימון', 'סטטוס'],
    ['נועה שמש', 'פיתוח גוף', 'פעיל']];
  // התכנית נראית כמו אימון כוח, אבל בגיליון כתוב פיתוח גוף
  const noa = [['יום', 'תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['יום א', 'סקוואט מוט על הגב', '5', '3', '100'],
    ['יום א', 'לחיצת חזה במוט', '5', '3', '70'],
    ['יום א', 'דדליפט', '5', '3', '120'],
    ['יום א', 'מתח', '4', '4', '5']];

  const built = shBuildImport(shAnalyzeWorkbook([
    { name: 'מתאמנים', rows: trainees },
    { name: 'נועה שמש', rows: noa },
  ]), { studioName: 'ס' });

  const t = built.trainees.find((x) => x.name === 'נועה שמש');
  assert.deepEqual(t.trainingStyles, ['bodybuilding'], 'ההצהרה בגיליון נדרסה');
  assert.notEqual(t.active, false);
});

test('כינוי שהמאמן אישר נכנס לזיהוי הרגיל ומשנה את תוצאת הייבוא', () => {
  const rows = [['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['הדחיפה של יוסי', '3', '10', '25']];

  // לפני הלימוד: שם עממי שאינו במאגר נשמר כתרגיל חופשי ואינו מלמד כלום
  const before = shBuildImport(shAnalyzeWorkbook([{ name: 'עידו', rows }]), { studioName: 'ס' });
  assert.ok(before.report.unmatched.exercises.includes('הדחיפה של יוסי'),
    JSON.stringify(before.report.unmatched));
  assert.ok(!before.trainees[0].history?.skullcrusher);

  // המאמן אישר את ההצעה
  assert.equal(shLearnAlias('הדחיפה של יוסי', 'skullcrusher'), true);
  try {
    const after = shBuildImport(shAnalyzeWorkbook([{ name: 'עידו', rows }]), { studioName: 'ס' });
    assert.ok(!after.report.unmatched.exercises.includes('הדחיפה של יוסי'), 'הכינוי לא נלמד');
    assert.equal(after.trainees[0].history.skullcrusher.load, 25,
      'המשקל לא נרשם לתרגיל הנכון אחרי הלימוד');
  } finally {
    shForgetAliases();
  }

  // ואחרי שכחה — חוזרים למצב ההתחלתי, בלי דליפה בין ייבואים
  const reset = shBuildImport(shAnalyzeWorkbook([{ name: 'עידו', rows }]), { studioName: 'ס' });
  assert.ok(reset.report.unmatched.exercises.includes('הדחיפה של יוסי'));
});

/* ================================================================
   גיליונות כמו שמאמנים באמת כותבים אותם.
   כל בדיקה כאן נולדה מכשל אמיתי שנמצא מול דפוס אמיתי — לא מנוסחת
   סביב הקוד אלא סביב מה שמאמן היה מצפה שיקרה.
   ================================================================ */

test('שורות "יום א" ו"שם מתאמן" כמפרידים בתוך טבלת תכנית', () => {
  const b = shBuildImport(shAnalyzeWorkbook([{ name: 'תכניות', rows: [
    ['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['רון כהן', '', '', ''],
    ['יום א — רגליים', '', '', ''],
    ['סקוואט מוט על הגב', '4', '6', '100'],
    ['יום ב — עליון', '', '', ''],
    ['לחיצת חזה במוט', '4', '6', '80'],
    ['דנה לוי', '', '', ''],
    ['לחיצת רגליים', '3', '12', '60']]}]), { studioName: 'ס' });

  const names = b.trainees.map((t) => t.name).sort();
  assert.deepEqual(names, ['דנה לוי', 'רון כהן'], `אנשים שגויים: ${names}`);
  const ron = b.snapshots.find((s) => s.traineeName === 'רון כהן');
  assert.equal(ron.program.days.length, 2, 'שורות היום לא פיצלו ימים');
  const allEx = b.snapshots.flatMap((s) => s.program.days.flatMap((d) => d.blocks.map((x) => x.exercise.name)));
  assert.ok(!allEx.some((n) => /^יום/.test(n)), `שורת יום הפכה לתרגיל: ${allEx}`);
  const dana = b.snapshots.find((s) => s.traineeName === 'דנה לוי');
  assert.ok(!dana.program.days.flatMap((d) => d.blocks).some((x) => x.exercise.id === 'bb_back_squat'),
    'התרגילים של רון נכנסו לדנה');
});

test('עמודת "שם" שמכילה תרגילים אינה מייצרת מתאמנים, והמאמן מקבל הסבר', () => {
  const b = shBuildImport(shAnalyzeWorkbook([{ name: 'אימוני בוקר', rows: [
    ['שם', 'סטים', 'חזרות', 'משקל'],
    ['סקוואט מוט על הגב', '4', '8', '80'],
    ['לחיצת חזה במוט', '4', '8', '55'],
    ['מתח', '4', '6', '0']]}]), { studioName: 'ס' });
  assert.deepEqual(b.trainees, [], `תרגילים או שם קבוצה הפכו לאנשים: ${b.trainees.map((t) => t.name)}`);
  assert.ok(b.report.warnings.some((w) => w.includes('שייכות')), 'אין אזהרה שמסבירה מה קרה');
});

test('"4X8" בתא אחד הוא ארבעה סטים של שמונה', () => {
  const b = shBuildImport(shAnalyzeWorkbook([{ name: 'יואב לב', rows: [
    ['תרגיל', 'סטים וחזרות', 'משקל'],
    ['סקוואט מוט על הגב', '4X8', '80'],
    ['לחיצת חזה במוט', '3x10', '55']]}]), { studioName: 'ס' });
  const sq = b.snapshots[0].program.days[0].blocks.find((x) => x.exercise.id === 'bb_back_squat');
  assert.equal(sq.prescription.sets, 4);
  assert.equal(sq.prescription.repsMin, 8);
});

test('"2X12" בעמודת משקל הוא 12 לכל יד, ו"משקל גוף" אינו מספר', () => {
  const b = shBuildImport(shAnalyzeWorkbook([{ name: 'שרון טל', rows: [
    ['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['מתח', '4', '6', 'משקל גוף'],
    ['לחיצת חזה בשיפוע 0 עם משקולות', '4', '8', '2X12'],
    ['סקוואט מוט על הגב', '4', '8', '60']]}]), { studioName: 'ס' });
  const t2 = b.trainees.find((x) => x.name === 'שרון טל');
  const press = b.snapshots[0].program.days[0].blocks.find((x) => x.exercise.id === 'db_bench_press');
  assert.equal(press.load.kg, 12, `"2X12" נקרא שגוי: ${JSON.stringify(press.load)}`);
  assert.equal(press.load.perSide, true);
  assert.ok(!t2.history?.pullup?.load, '"משקל גוף" קיבל מספר');
  assert.equal(b.snapshots[0].program.days[0].blocks.find((x) => x.exercise.id === 'bb_back_squat').load.kg, 60);
});

test('לשונית "מדידות גיא בר" משויכת לגיא, והמשקל העדכני נכנס לכרטיס', () => {
  const b = shBuildImport(shAnalyzeWorkbook([
    { name: 'מתאמנים', rows: [['שם'], ['גיא בר']] },
    { name: 'מדידות גיא בר', rows: [
      ['תאריך', 'משקל', 'היקף מותן'],
      ['01/05/2026', '92', '98'],
      ['01/06/2026', '90', '96']]}]), { studioName: 'ס' });
  const guy = b.trainees.find((x) => x.name === 'גיא בר');
  assert.equal((guy.measurements || []).length, 2, 'המדידות לא שויכו');
  assert.equal(guy.weightKg, 90, 'משקל הגוף מהמדידה האחרונה לא נכנס לכרטיס בזמן הייבוא');
});

test('ספריית תרגילים עם עמודת "שם" ועמודת "מאמן" ברשימה — אף אחד מהם אינו מתאמן', () => {
  const b = shBuildImport(shAnalyzeWorkbook([
    { name: 'מתאמנים', rows: [['שם', 'גיל', 'מאמן'], ['רון כהן', '30', 'עידן שגב']] },
    { name: 'רשימת תרגילים', rows: [
      ['שם', 'קבוצת שרירים'],
      ['סקוואט', 'רגליים'], ['לחיצת חזה', 'חזה'], ['עליות מתח', 'גב']]}]), { studioName: 'ס' });
  assert.deepEqual(b.trainees.map((t) => t.name), ['רון כהן'],
    `נוצרו אנשים מיותרים: ${b.trainees.map((t) => t.name)}`);
});

test('עמודת 1RM לצד משקל עבודה — נלקח משקל העבודה', () => {
  const b = shBuildImport(shAnalyzeWorkbook([{ name: 'נדב אור', rows: [
    ['תרגיל', 'סטים', 'חזרות', 'משקל עבודה', '1RM משוער'],
    ['סקוואט מוט על הגב', '4', '5', '100', '125']]}]), { studioName: 'ס' });
  assert.equal(b.trainees[0].history.bb_back_squat.load, 100);
});

test('שורת-על ממוזגת מעל הכותרות אינה משבשת את המיפוי', () => {
  const b = shBuildImport(shAnalyzeWorkbook([{ name: 'נטע רם', rows: [
    ['שבוע 1', '', '', ''],
    ['תרגיל', 'סטים', 'חזרות', 'משקל'],
    ['סקוואט מוט על הגב', '4', '8', '70']]}]), { studioName: 'ס' });
  assert.equal(b.trainees[0]?.history?.bb_back_squat?.load, 70,
    `המיפוי השתבש: ${JSON.stringify(b.trainees[0]?.history)}`);
});
