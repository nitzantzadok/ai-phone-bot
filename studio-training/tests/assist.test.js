/**
 * השכבה החכמה.
 *
 * מה שנבדק כאן אינו איכות ההתאמות — היא תלויה במודל — אלא ההגנות סביבן:
 * שמזהה שאינו קיים לא נכנס למערכת, שהמערכת ממשיכה לעבוד בלי מפתח, ושכל
 * הצעה מגיעה עם נימוק שאפשר להראות למאמן.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { assistAvailable, validateSuggestions } from '../src/server/assist.js';
import { ALL_ROUTES } from '../src/server/api.js';
import { BY_ID } from '../src/domain/exercises.js';
import { CONSTRAINTS } from '../src/domain/constraints.js';

test('בלי מפתח השכבה מדווחת שאינה זמינה, במקום להיכשל', async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const token = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    const a = await assistAvailable();
    assert.equal(a.ok, false);
    assert.equal(a.reason, 'no_key');
  } finally {
    if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
    if (token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = token;
  }
});

test('הצעה בלי מפתח מחזירה תשובה מסודרת עם מסלול חלופי', async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const token = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    const r = await ALL_ROUTES['POST /api/assist/match']({ exercises: ['לחיצה צרפתית'] }, null, {});
    assert.equal(r.ok, false);
    assert.equal(r.fallback, 'manual');
    assert.ok(r.error.includes('מפתח'), r.error);
  } finally {
    if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
    if (token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = token;
  }
});

test('בלי שאריות אין קריאה למודל בכלל', async () => {
  const r = await ALL_ROUTES['POST /api/assist/match']({ exercises: [], notes: [] }, null, {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.exercises, []);
  assert.equal(r.model, null);
});

test('השכבה סגורה למי שלא התחבר', async () => {
  const { PUBLIC } = await import('../src/server/api.js');
  assert.ok(!PUBLIC.has('POST /api/assist/match'), 'הצעות פתוחות לכל העולם');
  assert.ok(!PUBLIC.has('GET /api/assist/status'));
});

/*
 * הבדיקה החשובה: תשובה שהמודל המציא אינה יכולה להיכנס למערכת.
 * מאמתים את פונקציית האימות דרך התנהגותה — מזהים תקינים עוברים, מומצאים
 * נזרקים, וערכים לא חוקיים מתוקנים לברירת מחדל זהירה.
 */
test('מזהה שהמודל המציא נזרק, ומזהה אמיתי עובר', () => {
  const out = validateSuggestions({
    exercises: [
      { input: 'לחיצה צרפתית', match: 'skullcrusher', confidence: 0.9, reason: 'שם עממי' },
      { input: 'סופר מגה פרס', match: 'super_mega_press', confidence: 0.99, reason: 'המצאה' },
      { input: 'משהו', match: null, confidence: 0.2, reason: 'אין התאמה' },
    ],
    notes: [
      { input: 'כאב בכתף', constraints: [
        { id: 'shoulder_impingement', severity: 'moderate', side: 'right', confidence: 0.8, reason: 'כאב' },
        { id: 'לא_קיים', severity: 'acute', confidence: 1, reason: 'המצאה' },
      ] },
      { input: 'הכול בסדר', constraints: [{ id: 'עוד_המצאה' }] },
    ],
  });

  assert.equal(out.exercises.length, 3, 'פריטים נעלמו במקום לחזור עם match ריק');
  const byInput = Object.fromEntries(out.exercises.map((e) => [e.input, e]));
  assert.equal(byInput['לחיצה צרפתית'].match, 'skullcrusher');
  assert.equal(byInput['לחיצה צרפתית'].name, BY_ID.skullcrusher.name);
  assert.equal(byInput['סופר מגה פרס'].match, null, 'מזהה מומצא נכנס למערכת');
  assert.equal(byInput['משהו'].match, null);

  // הערה שכל המגבלות שלה מומצאות נעלמת לגמרי; הערה תקינה נשארת עם התקינות בלבד
  assert.equal(out.notes.length, 1);
  assert.equal(out.notes[0].constraints.length, 1);
  assert.equal(out.notes[0].constraints[0].id, 'shoulder_impingement');
  assert.equal(out.notes[0].constraints[0].name, CONSTRAINTS.shoulder_impingement.name);
  assert.equal(out.notes[0].constraints[0].side, 'right');
});

test('ערכים לא חוקיים מתוקנים לברירת מחדל זהירה', () => {
  const out = validateSuggestions({
    exercises: [{ input: 'x', match: 'skullcrusher', confidence: 'הרבה', reason: 'א'.repeat(500) }],
    notes: [{ input: 'y', constraints: [
      { id: 'shoulder_impingement', severity: 'קטלנית', side: 'למעלה', confidence: 42 },
    ] }],
  });
  assert.equal(out.exercises[0].confidence, 0.5, 'ביטחון שאינו מספר לא נוטרל');
  assert.ok(out.exercises[0].reason.length <= 200, 'נימוק בלי גבול אורך');
  assert.equal(out.notes[0].constraints[0].severity, 'moderate', 'חומרה מומצאת התקבלה');
  assert.equal(out.notes[0].constraints[0].side, null);
  assert.equal(out.notes[0].constraints[0].confidence, 0.5);
});

/* ------------------------------------------------- מתכנן הייבוא */

test('תכנית מיפוי מאומתת: תפקיד מומצא נזרק, ותיקון אמיתי עובר', async () => {
  const { validatePlan } = await import('../src/server/assist.js');
  const sheets = [
    { name: 'אימוני בוקר', headers: ['שם', 'סטים', 'חזרות', 'משקל'], guessedRole: 'programs' },
    { name: 'מדידות', headers: ['שם', 'תאריך', 'משקל'], guessedRole: 'programs' },
  ];
  const out = validatePlan({ sheets: [
    { sheet: 'אימוני בוקר', role: 'programs', owner: 'רון כהן', columns: { 0: 'exercise', 7: 'load', 2: 'צבע' } },
    { sheet: 'מדידות', role: 'measurements', columns: { 2: 'weightKg' } },
    { sheet: 'לא קיימת', role: 'trainees' },
    { sheet: 'אימוני בוקר', role: 'super_secret_role' },
  ] }, sheets);

  assert.equal(out.overrides['מדידות'], 'measurements', 'תיקון תפקיד אמיתי נזרק');
  assert.ok(!('אימוני בוקר' in out.overrides), 'תפקיד זהה לניחוש נרשם כדריסה מיותרת');
  assert.deepEqual(out.columnOverrides['אימוני בוקר'], { 0: 'exercise' },
    'עמודה מחוץ לטווח או שדה מומצא עברו');
  assert.equal(out.ownerOverrides['אימוני בוקר'], 'רון כהן');
  assert.ok(!('לא קיימת' in out.overrides), 'לשונית שאינה קיימת בגיליון התקבלה');
});

/*
 * המסלול המלא, מקצה לקצה, מול מודל מדומה: גיליון שהזיהוי האוטומטי
 * מתבלבל בו → תקציר → "מודל" שמחזיר תיקונים → ניתוח חוזר → ייבוא נכון.
 * זו הבדיקה שמוכיחה שהצנרת שלמה — בלי לשלם למודל אמיתי על כל הרצת CI.
 */
test('מקצה לקצה עם מודל מדומה: הבנת גיליון מתוקנת אוטומטית', async () => {
  const http = await import('node:http');
  const { planImport } = await import('../src/server/assist.js');
  const { shAnalyzeWorkbook, shBuildImport, shWorkbookDigest } = await import('../src/domain/sheets/build.js');

  // "המודל": מזהה שלשונית ששמה אינו שם של אדם שייכת לרון, לפי הכותרת
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      assert.ok(body.includes('systemGuess'), 'התקציר לא נשלח למודל');
      assert.ok(!body.includes('"050'), 'טלפונים דלפו לתקציר?');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ sheets: [
          { sheet: 'החזקים של הבוקר', role: 'programs', owner: 'רון כהן', why: 'הכותרת מציינת שהתכנית של רון' },
        ] }) }],
      }));
    });
  });
  await new Promise((ok) => server.listen(0, ok));
  const prevBase = process.env.ANTHROPIC_BASE_URL;
  const prevKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  try {
    const sheets = [{ name: 'החזקים של הבוקר', rows: [
      ['תכנית אישית — רון כהן', '', '', ''],
      ['תרגיל', 'סטים', 'חזרות', 'משקל'],
      ['סקוואט מוט על הגב', '4', '6', '100'],
      ['לחיצת חזה במוט', '4', '6', '80']]}];

    const first = shAnalyzeWorkbook(sheets);
    const plan = await planImport(shWorkbookDigest(first));
    assert.equal(plan.ownerOverrides['החזקים של הבוקר'], 'רון כהן');

    const second = shAnalyzeWorkbook(sheets, {
      overrides: plan.overrides, columnOverrides: plan.columnOverrides, ownerOverrides: plan.ownerOverrides,
    });
    const built = shBuildImport(second, { studioName: 'ס' });
    assert.deepEqual(built.trainees.map((t) => t.name), ['רון כהן'],
      `הבעלים מהמודל לא נקלט: ${built.trainees.map((t) => t.name)}`);
    assert.equal(built.trainees[0].history.bb_back_squat.load, 100,
      'המספרים חייבים להגיע מהתאים, לא מהמודל');
  } finally {
    if (prevBase !== undefined) process.env.ANTHROPIC_BASE_URL = prevBase; else delete process.env.ANTHROPIC_BASE_URL;
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey; else delete process.env.ANTHROPIC_API_KEY;
    server.close();
  }
});
