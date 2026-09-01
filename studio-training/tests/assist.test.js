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
    assert.ok(r.error.includes('הייבוא'), r.error);
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
