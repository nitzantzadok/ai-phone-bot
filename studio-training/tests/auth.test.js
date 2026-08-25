/**
 * בדיקות חשבונות, בידוד נתונים והיסטוריה.
 *
 * הבדיקה החשובה כאן אינה "האם ההתחברות עובדת" אלא
 * "האם סטודיו אחד יכול לראות או לשנות משהו של סטודיו אחר" — התשובה חייבת להיות לא,
 * בכל נתיב, גם כשמזייפים מזהים בגוף הבקשה.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-auth-')), 'db.json');
process.env.STUDIO_DB_FILE = DB_FILE;

const { server } = await import('../src/server/server.js');
const {
  hashPassword, verifyPassword, validatePassword, validateUsername, readCookie, sessionCookie,
  isLockedOut, LOCKOUT,
} = await import('../src/store/auth.js');
const { groupSessions, personalBests, historySummary, programSnapshot, sameContent } = await import('../src/domain/history.js');

await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); fs.rmSync(path.dirname(DB_FILE), { recursive: true, force: true }); });

/** לקוח HTTP קטן ששומר עוגייה — מדמה דפדפן של סטודיו אחד. */
function client() {
  let cookie = null;
  return {
    get cookie() { return cookie; },
    async call(method, pathname, body) {
      const res = await fetch(`${BASE}${pathname}`, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json() };
    },
    get(p) { return this.call('GET', p); },
    post(p, b = {}) { return this.call('POST', p, b); },
  };
}

/* ---------------------------------------------------------------- סיסמאות */

test('גיבוב סיסמה שונה בכל פעם ומאמת רק את הסיסמה הנכונה', () => {
  const a = hashPassword('correct-horse-battery');
  const b = hashPassword('correct-horse-battery');
  assert.notEqual(a.hash, b.hash, 'מלח אקראי חייב לייצר גיבוב שונה');
  assert.ok(verifyPassword('correct-horse-battery', a));
  assert.ok(!verifyPassword('correct-horse-batter', a));
  assert.ok(!verifyPassword('', a));
});

test('הסיסמה נשמרת מגובבת בלבד — לא בטקסט גלוי', () => {
  const rec = hashPassword('studio-pass-2026');
  assert.ok(!JSON.stringify(rec).includes('studio-pass-2026'));
});

test('כללי סיסמה ושם משתמש', () => {
  assert.ok(!validatePassword('short').ok);
  assert.ok(!validatePassword('12345678').ok, 'ספרות בלבד נדחות');
  assert.ok(validatePassword('gym-tel-aviv-1').ok);
  assert.ok(!validateUsername('a').ok);
  assert.ok(!validateUsername('סטודיו').ok, 'עברית בשם משתמש נדחית כדי למנוע בלבול');
  assert.equal(validateUsername('  Gym.North@Studio  ').username, 'gym.north@studio');
});

test('נעילה אחרי ניסיונות כושלים חוזרים', () => {
  const now = Date.now();
  const many = Array.from({ length: LOCKOUT.attempts }, () => new Date(now).toISOString());
  assert.ok(isLockedOut({ failedAttempts: many }, now));
  const old = Array.from({ length: LOCKOUT.attempts }, () => new Date(now - LOCKOUT.windowMs - 1).toISOString());
  assert.ok(!isLockedOut({ failedAttempts: old }, now), 'ניסיונות ישנים אינם נועלים לנצח');
});

test('עוגיית המושב היא HttpOnly ו-SameSite', () => {
  const c = sessionCookie('abc', { secure: true });
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.equal(readCookie('foo=1; sid=abc; bar=2'), 'abc');
  assert.equal(readCookie(''), null);
});

/* ---------------------------------------------------------------- הרשמה והתחברות */

const gymA = client();
const gymB = client();

test('רישום שני סטודיואים נפרדים', async () => {
  const a = await gymA.post('/api/auth/register', {
    username: 'north-gym', password: 'north-gym-2026', studioName: 'סטודיו צפון',
  });
  assert.equal(a.body.ok, true);
  assert.equal(a.body.account.username, 'north-gym');
  assert.ok(!('hash' in a.body.account), 'הגיבוב לא חוזר ללקוח');

  const b = await gymB.post('/api/auth/register', {
    username: 'south-gym', password: 'south-gym-2026', studioName: 'סטודיו דרום',
  });
  assert.equal(b.body.ok, true);
  assert.notEqual(a.body.account.id, b.body.account.id);
});

test('שם משתמש תפוס נדחה', async () => {
  const r = await client().post('/api/auth/register', { username: 'north-gym', password: 'another-pass-1' });
  assert.equal(r.body.ok, false);
});

test('בלי התחברות אין גישה לשום נתון', async () => {
  const anon = client();
  for (const p of ['/api/studios', '/api/trainees', '/api/db/stats', '/api/history?traineeId=x']) {
    const r = await anon.get(p);
    assert.equal(r.status, 401, `${p} חייב לדרוש התחברות`);
  }
  assert.equal((await anon.post('/api/studios', { name: 'פיראט' })).status, 401);
});

test('התחברות עם סיסמה שגויה נכשלת בהודעה אחידה', async () => {
  const c = client();
  const wrong = await c.post('/api/auth/login', { username: 'north-gym', password: 'nope' });
  assert.equal(wrong.body.ok, false);
  const missing = await c.post('/api/auth/login', { username: 'no-such-gym', password: 'nope' });
  assert.deepEqual(missing.body.errors, wrong.body.errors, 'אין להבחין בין משתמש לא קיים לסיסמה שגויה');
});

test('התחברות תקינה מחזירה את הסטודיואים של החשבון בלבד', async () => {
  const c = client();
  const r = await c.post('/api/auth/login', { username: 'north-gym', password: 'north-gym-2026' });
  assert.equal(r.body.ok, true);
  assert.ok(Array.isArray(r.body.studios));
});

/* ---------------------------------------------------------------- בידוד נתונים */

let studioA; let studioB; let traineeA; let traineeB;

test('כל סטודיו רושם את הנתונים שלו', async () => {
  const a = await gymA.post('/api/studios', { name: 'North Gym', equipment: ['dumbbell', 'barbell', 'bench_flat', 'squat_rack'], dumbbellMaxKg: 40 });
  assert.equal(a.body.ok, true);
  studioA = a.body.id;

  const b = await gymB.post('/api/studios', { name: 'South Gym', equipment: ['kettlebell', 'mat', 'resistance_band'] });
  studioB = b.body.id;

  const ta = await gymA.post('/api/trainees', { name: 'דנה', studioId: studioA, goal: 'hypertrophy', level: 'intermediate', daysPerWeek: 3, age: 30, weightKg: 62 });
  assert.equal(ta.body.ok, true, JSON.stringify(ta.body.errors || ''));
  traineeA = ta.body.id;

  const tb = await gymB.post('/api/trainees', { name: 'עומר', studioId: studioB, goal: 'general_fitness', level: 'beginner', daysPerWeek: 2, age: 45, weightKg: 88 });
  traineeB = tb.body.id;
});

test('רשימת הסטודיואים מכילה רק את שלי', async () => {
  const a = await gymA.get('/api/studios');
  assert.equal(a.body.length, 1);
  assert.equal(a.body[0].id, studioA);

  const b = await gymB.get('/api/studios');
  assert.equal(b.body.length, 1);
  assert.equal(b.body[0].id, studioB);
});

test('רשימת המתאמנים מכילה רק את שלי', async () => {
  const a = await gymA.get('/api/trainees');
  assert.deepEqual(a.body.map((t) => t.name), ['דנה']);
  const b = await gymB.get('/api/trainees');
  assert.deepEqual(b.body.map((t) => t.name), ['עומר']);
});

test('סינון לפי סטודיו של חשבון אחר אינו מדליף דבר', async () => {
  const r = await gymA.get(`/api/trainees?studioId=${studioB}`);
  assert.deepEqual(r.body, [], 'מזהה סטודיו זר מחזיר רשימה ריקה, לא את המתאמנים שלו');
});

test('קריאה ישירה למתאמן של חשבון אחר מחזירה "לא נמצא"', async () => {
  const r = await gymA.get(`/api/trainee?id=${traineeB}`);
  assert.equal(r.status, 404);
  assert.ok(!JSON.stringify(r.body).includes('עומר'));
});

test('אי אפשר לבנות תכנית למתאמן של חשבון אחר', async () => {
  const r = await gymA.post('/api/programs/generate', { traineeId: traineeB });
  assert.equal(r.status, 404);
});

test('אי אפשר לזייף מתאמן בגוף הבקשה כדי לעקוף בעלות', async () => {
  const r = await gymA.post('/api/programs/generate', {
    trainee: { id: traineeB, name: 'מזויף', studioId: studioB, goal: 'hypertrophy', daysPerWeek: 3 },
    studio: { id: studioB, name: 'מזויף', equipment: ['dumbbell'] },
  });
  assert.equal(r.status, 404, 'גוף הבקשה אינו מקור סמכות לבעלות');
});

test('אי אפשר לרשום מתאמן לסטודיו של חשבון אחר', async () => {
  const r = await gymA.post('/api/trainees', { name: 'חדירה', studioId: studioB, goal: 'hypertrophy', daysPerWeek: 3 });
  assert.equal(r.status, 404);
});

test('אי אפשר למחוק סטודיו או מתאמן של חשבון אחר', async () => {
  assert.equal((await gymA.post('/api/studios/delete', { id: studioB, force: true })).status, 404);
  assert.equal((await gymA.post('/api/trainees/delete', { id: traineeB })).status, 404);
  const still = await gymB.get('/api/trainees');
  assert.equal(still.body.length, 1, 'המתאמן של הסטודיו השני שרד');
});

test('אי אפשר לרשום פידבק או הערות על מתאמן זר', async () => {
  assert.equal((await gymA.post('/api/feedback', { traineeId: traineeB, events: [{ type: 'pain' }] })).status, 404);
  assert.equal((await gymA.post('/api/history/log', { traineeId: traineeB, entries: [{ type: 'log_set' }] })).status, 404);
  assert.equal((await gymA.post('/api/custom-exercise', { traineeId: traineeB, name: 'x' })).status, 404);
});

test('סטטיסטיקת המסד מציגה רק את החשבון שלי', async () => {
  const a = await gymA.get('/api/db/stats');
  assert.equal(a.body.stats.studios, 1);
  assert.equal(a.body.stats.trainees, 1);
});

test('ייצוא מכיל רק את הנתונים שלי ולא גיבובי סיסמאות', async () => {
  const r = await gymA.get('/api/db/export');
  const raw = JSON.stringify(r.body);
  assert.ok(raw.includes('דנה'));
  assert.ok(!raw.includes('עומר'), 'ייצוא לא כולל מתאמנים של חשבון אחר');
  assert.ok(!raw.includes('south-gym'), 'ייצוא לא כולל חשבונות אחרים');
  for (const acc of Object.values(r.body.data.accounts)) {
    assert.equal(acc.hash, undefined, 'גיבוב הסיסמה לא יוצא בגיבוי');
    assert.equal(acc.salt, undefined);
  }
  assert.deepEqual(r.body.data.sessions, {}, 'מושבים פעילים לא יוצאים בגיבוי');
});

test('התנתקות מבטלת את הגישה', async () => {
  const c = client();
  await c.post('/api/auth/login', { username: 'south-gym', password: 'south-gym-2026' });
  assert.equal((await c.get('/api/studios')).status, 200);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/studios')).status, 401);
});

test('עוגייה מזויפת אינה מקנה גישה', async () => {
  const res = await fetch(`${BASE}/api/studios`, { headers: { cookie: 'sid=not-a-real-token' } });
  assert.equal(res.status, 401);
});

/* ---------------------------------------------------------------- היסטוריה */

test('כל בניית תכנית נשמרת בארכיון, וזהות אינה נשמרת פעמיים', async () => {
  const before = (await gymA.get(`/api/history?traineeId=${traineeA}`)).body.programs.length;
  await gymA.post('/api/programs/generate', { traineeId: traineeA });
  const same = (await gymA.get(`/api/history?traineeId=${traineeA}`)).body.programs.length;
  assert.equal(same, before, 'תכנית זהה לא מייצרת רשומת ארכיון חדשה');

  await gymA.post('/api/next-week', { traineeId: traineeA });
  const after = (await gymA.get(`/api/history?traineeId=${traineeA}`)).body.programs.length;
  assert.ok(after > before, 'מעבר לשבוע הבא נשמר בארכיון');
});

test('אפשר לפתוח כל תכנית מהארכיון במלואה', async () => {
  const h = await gymA.get(`/api/history?traineeId=${traineeA}`);
  const first = h.body.programs.at(-1);
  assert.ok(first.at && first.week >= 1);
  assert.equal(first.program, undefined, 'הרשימה קלה ולא נושאת את הגוף המלא');

  const full = await gymA.get(`/api/history/program?snapshotId=${first.id}`);
  assert.equal(full.body.ok, true);
  assert.ok(full.body.snapshot.program.days.length > 0, 'התכנית המלאה נשלפת מהארכיון');
});

test('תכנית מהארכיון של חשבון אחר אינה נגישה', async () => {
  await gymB.post('/api/programs/generate', { traineeId: traineeB });
  const hb = await gymB.get(`/api/history?traineeId=${traineeB}`);
  const snapId = hb.body.programs[0].id;
  const stolen = await gymA.get(`/api/history/program?snapshotId=${snapId}`);
  assert.equal(stolen.status, 404);
});

test('יומן האימונים נשמר ומצטבר לאימונים', async () => {
  await gymA.post('/api/history/log', {
    traineeId: traineeA,
    entries: [
      { type: 'log_set', date: '2026-08-01', dayIndex: 0, dayLabel: 'A', exerciseId: 'back_squat', exerciseName: 'סקוואט', loadKg: 50, reps: 8 },
      { type: 'log_set', date: '2026-08-01', dayIndex: 0, dayLabel: 'A', exerciseId: 'back_squat', exerciseName: 'סקוואט', loadKg: 52.5, reps: 6 },
      { type: 'log_set', date: '2026-08-04', dayIndex: 1, dayLabel: 'B', exerciseId: 'back_squat', exerciseName: 'סקוואט', loadKg: 55, reps: 5 },
    ],
  });
  const h = await gymA.get(`/api/history?traineeId=${traineeA}`);
  assert.equal(h.body.summary.sets, 3);
  assert.equal(h.body.sessions.length, 2, 'שני תאריכים = שני אימונים');
  assert.equal(h.body.sessions[0].date, '2026-08-04', 'החדש ביותר ראשון');
  assert.equal(h.body.bests[0].loadKg, 55, 'השיא האישי מזוהה');

  const ex = await gymA.get(`/api/history/exercise?traineeId=${traineeA}&exerciseId=back_squat`);
  assert.equal(ex.body.points.length, 3);
  assert.deepEqual(ex.body.points.map((p) => p.loadKg), [50, 52.5, 55], 'ההיסטוריה מסודרת כרונולוגית');
});

test('סקירת הסטודיו מראה מי התאמן ומתי', async () => {
  const r = await gymA.get(`/api/history/studio?studioId=${studioA}`);
  assert.equal(r.body.ok, true);
  const dana = r.body.trainees.find((t) => t.name === 'דנה');
  assert.equal(dana.sessions, 2);
  assert.ok(dana.lastDate);
});

test('מחיקת מתאמן מוחקת גם את ההיסטוריה שלו', async () => {
  const tmp = await gymA.post('/api/trainees', { name: 'זמני', studioId: studioA, goal: 'general_fitness', level: 'beginner', daysPerWeek: 2, age: 30, weightKg: 70 });
  const id = tmp.body.id;
  assert.ok((await gymA.get(`/api/history?traineeId=${id}`)).body.programs.length >= 1);
  await gymA.post('/api/trainees/delete', { id });
  assert.equal((await gymA.get(`/api/history?traineeId=${id}`)).status, 404);
});

/* ---------------------------------------------------------------- פונקציות ההיסטוריה */

test('חישובי היסטוריה: נפח, שיאים וסיכום', () => {
  const log = [
    { type: 'log_set', date: '2026-01-01', dayIndex: 0, exerciseId: 'a', exerciseName: 'A', loadKg: 20, reps: 10 },
    { type: 'log_set', date: '2026-01-01', dayIndex: 0, exerciseId: 'a', exerciseName: 'A', loadKg: 20, reps: 10 },
    { type: 'log_set', date: '2026-01-08', dayIndex: 0, exerciseId: 'a', exerciseName: 'A', loadKg: 22.5, reps: 8, perSide: true },
    { type: 'pain', date: '2026-01-08', dayIndex: 0, joint: 'knee', painLevel: 3 },
  ];
  const sessions = groupSessions(log);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[1].volumeKg, 400, '20×10 פעמיים');
  assert.equal(sessions[0].volumeKg, 360, 'משקל לכל יד נספר פעמיים');
  assert.equal(sessions[0].painEvents, 1);

  const best = personalBests(log)[0];
  assert.equal(best.loadKg, 22.5);

  const sum = historySummary(log, [{ week: 1 }, { week: 2 }]);
  assert.equal(sum.sessions, 2);
  assert.equal(sum.sets, 3);
  assert.equal(sum.painEvents, 1);
  assert.equal(sum.programs, 2);
  assert.equal(sum.firstDate, '2026-01-01');
});

test('צילום מצב מזהה תוכן זהה מול תוכן שהשתנה', () => {
  const program = {
    id: 'p1', traineeId: 't', traineeName: 'x', studioId: 's', week: 1, qa: { score: 90, passed: true }, meta: {},
    days: [{ blocks: [{ exercise: { id: 'squat' }, prescription: { sets: 3, repsMin: 8, repsMax: 10 }, load: { kg: 40 } }] }],
  };
  const a = programSnapshot(program);
  const b = programSnapshot(structuredClone(program));
  assert.ok(sameContent(a, b), 'אותה תכנית בזמן אחר היא אותו תוכן');

  const changed = structuredClone(program);
  changed.days[0].blocks[0].load.kg = 45;
  assert.ok(!sameContent(a, programSnapshot(changed)), 'שינוי משקל הוא תוכן חדש');
  assert.equal(a.totalExercises, 1);
});
