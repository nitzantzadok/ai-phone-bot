/**
 * הפריסה לקצה — אותה מערכת, מסד משותף.
 *
 * מה שנבדק כאן הוא בדיוק מה שמבדיל את הפריסה המשותפת מגרסת הדפדפן:
 * ששני מאמנים שנכנסים מאותו חשבון רואים את אותם נתונים, שהנתונים שורדים
 * "הפעלה מחדש" של הפונקציה, ושכתיבה מקבילה אינה מוחקת עבודה של אף אחד.
 *
 * ה-D1 כאן הוא מימוש מקומי של אותו ממשק (prepare/bind/run/first) מעל
 * אובייקט בזיכרון — מספיק כדי לבדוק את הלוגיקה שלנו, שהיא מה שיכול להישבר.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/** D1 מזויף: תומך בדיוק בשאילתות שהעובד מריץ, כולל הפרוסות. */
function fakeD1() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          if (!/^SELECT json/.test(sql)) return null;
          const row = rows.get(args[0]);
          return row ? { json: row.json, version: row.version } : null;
        },
        async run() {
          if (/CREATE TABLE/.test(sql)) return { meta: { changes: 0 } };
          if (/INSERT OR IGNORE/.test(sql)) {
            const [id, json] = args;
            if (rows.has(id)) return { meta: { changes: 0 } };
            rows.set(id, { json, version: 1 });
            return { meta: { changes: 1 } };
          }
          if (/INSERT OR REPLACE/.test(sql)) {
            const [id, json, version] = args;
            rows.set(id, { json, version });
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM doc WHERE id LIKE/.test(sql)) {
            const [, version] = args;
            let changes = 0;
            for (const [id, row] of [...rows]) {
              if (id.startsWith('main#') && row.version < version) { rows.delete(id); changes++; }
            }
            return { meta: { changes } };
          }
          if (/UPDATE doc SET/.test(sql)) {
            const [json, , id, version] = args;
            const row = rows.get(id);
            if (!row || row.version !== version) return { meta: { changes: 0 } };
            rows.set(id, { json, version: row.version + 1 });
            return { meta: { changes: 1 } };
          }
          throw new Error(`שאילתה לא צפויה: ${sql}`);
        },
      };
      return stmt;
    },
  };
}

const worker = (await import('../worker/index.js')).default;

/** לקוח קטן ששומר עוגייה — מדמה דפדפן של מאמן אחד. */
function coach(env) {
  let cookie = null;
  return {
    get cookie() { return cookie; },
    async call(method, path, body) {
      const res = await worker.fetch(new Request(`https://studio.example${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), env);
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    get(p) { return this.call('GET', p); },
    post(p, b = {}) { return this.call('POST', p, b); },
  };
}

test('הפונקציה מגישה את מסך המאמן בכל נתיב שאינו API', async () => {
  const res = await worker.fetch(new Request('https://studio.example/'), { DB: fakeD1() });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.ok(html.includes('מסך המאמן'), 'המסך לא הוגש');
  assert.ok(html.length > 100000, 'נראה שהמסך לא נבנה לפני הפריסה');
});

test('שני מאמנים באותו חשבון רואים את אותם מתאמנים', async () => {
  const env = { DB: fakeD1() };
  const first = coach(env);
  const second = coach(env);

  const reg = await first.post('/api/auth/register', {
    username: 'north-gym', password: 'gym-pass-2026', studioName: 'סטודיו צפון',
  });
  assert.equal(reg.body.ok, true, JSON.stringify(reg.body));

  const studio = await first.post('/api/studios', { name: 'סטודיו צפון', equipment: ['dumbbell', 'bench_flat'] });
  assert.equal(studio.body.ok, true);
  const added = await first.post('/api/trainees', {
    name: 'רון כהן', studioId: studio.body.id, primaryGoal: 'hypertrophy', daysPerWeek: 3,
  });
  assert.equal(added.body.ok, true, JSON.stringify(added.body.errors));

  // המאמן השני נכנס מהמכשיר שלו — ורואה את אותו מתאמן
  const login = await second.post('/api/auth/login', { username: 'north-gym', password: 'gym-pass-2026' });
  assert.equal(login.body.ok, true);
  const trainees = await second.get('/api/trainees');
  assert.deepEqual(trainees.body.map((t) => t.name), ['רון כהן']);

  // ומה שהוא משנה, הראשון רואה
  await second.post('/api/trainees', { ...trainees.body[0], name: 'רון כהן-לוי' });
  const back = await first.get('/api/trainees');
  assert.deepEqual(back.body.map((t) => t.name), ['רון כהן-לוי']);
});

test('הנתונים שורדים הפעלה מחדש של הפונקציה', async () => {
  const db = fakeD1();
  const one = coach({ DB: db });
  await one.post('/api/auth/register', { username: 'south-gym', password: 'gym-pass-2026', studioName: 'דרום' });
  await one.post('/api/studios', { name: 'דרום', equipment: ['dumbbell'] });

  // אותו מסד, "מופע" חדש: אין שום מצב בזיכרון שנשאר בין הרצות
  const later = coach({ DB: db });
  const login = await later.post('/api/auth/login', { username: 'south-gym', password: 'gym-pass-2026' });
  assert.equal(login.body.ok, true);
  const studios = await later.get('/api/studios');
  assert.deepEqual(studios.body.map((s) => s.name), ['דרום']);
});

test('חשבון אחר אינו רואה את הנתונים', async () => {
  const env = { DB: fakeD1() };
  const mine = coach(env);
  const theirs = coach(env);
  await mine.post('/api/auth/register', { username: 'gym-a', password: 'gym-pass-2026', studioName: 'א' });
  await mine.post('/api/studios', { name: 'א', equipment: ['dumbbell'] });
  await theirs.post('/api/auth/register', { username: 'gym-b', password: 'gym-pass-2026', studioName: 'ב' });
  assert.deepEqual((await theirs.get('/api/studios')).body, []);
});

test('בלי מושב תקף אין גישה לנתונים', async () => {
  const env = { DB: fakeD1() };
  const anon = coach(env);
  const res = await anon.get('/api/trainees');
  assert.equal(res.status, 401);
  assert.equal(res.body.login, true);
});

test('כתיבה מקבילה אינה מוחקת עבודה של המאמן השני', async () => {
  const env = { DB: fakeD1() };
  const a = coach(env);
  const b = coach(env);
  await a.post('/api/auth/register', { username: 'busy-gym', password: 'gym-pass-2026', studioName: 'עמוס' });
  const studio = await a.post('/api/studios', { name: 'עמוס', equipment: ['dumbbell'] });
  await b.post('/api/auth/login', { username: 'busy-gym', password: 'gym-pass-2026' });

  // שני המאמנים רושמים מתאמן בו-זמנית
  const [x, y] = await Promise.all([
    a.post('/api/trainees', { name: 'דנה לוי', studioId: studio.body.id, primaryGoal: 'strength', daysPerWeek: 3 }),
    b.post('/api/trainees', { name: 'יוסי כהן', studioId: studio.body.id, primaryGoal: 'fat_loss', daysPerWeek: 3 }),
  ]);
  assert.equal(x.body.ok, true);
  assert.equal(y.body.ok, true);

  const all = (await a.get('/api/trainees')).body.map((t) => t.name).sort();
  assert.deepEqual(all, ['דנה לוי', 'יוסי כהן'], 'אחד המתאמנים נמחק בכתיבה מקבילה');
});

test('בלי מסד מחובר הפונקציה אומרת זאת במפורש', async () => {
  const res = await worker.fetch(new Request('https://studio.example/api/health'), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /מסד/);
});

test('מסמך גדול נשמר בפרוסות ונקרא בחזרה במלואו', async () => {
  const db = fakeD1();
  const one = coach({ DB: db });
  await one.post('/api/auth/register', { username: 'big-gym', password: 'gym-pass-2026', studioName: 'גדול' });
  const studio = await one.post('/api/studios', { name: 'גדול', equipment: ['dumbbell', 'bench_flat', 'barbell'] });

  // מספיק מתאמנים כדי לעבור את גודל הפרוסה
  for (let i = 0; i < 40; i++) {
    const res = await one.post('/api/trainees', {
      name: `מתאמן מספר ${i}`, studioId: studio.body.id, primaryGoal: 'general_fitness', daysPerWeek: 3,
      notes: 'הערה ארוכה כדי להגדיל את המסמך '.repeat(60),
    });
    assert.equal(res.body.ok, true, JSON.stringify(res.body.errors));
  }

  const chunks = [...db.rows.keys()].filter((k) => k.startsWith('main#'));
  assert.ok(chunks.length >= 2, `המסמך לא נחתך לפרוסות (${chunks.length})`);

  // "הפעלה מחדש": הכול נקרא בחזרה, ואף מתאמן לא אבד בתפר
  const later = coach({ DB: db });
  await later.post('/api/auth/login', { username: 'big-gym', password: 'gym-pass-2026' });
  const trainees = (await later.get('/api/trainees')).body;
  assert.equal(trainees.length, 40);
  assert.ok(trainees.every((t) => t.notes.length > 1000), 'תוכן נחתך בתפר בין הפרוסות');
});

test('ארכיון התכניות אינו גדל בלי גבול', async () => {
  const env = { DB: fakeD1() };
  const c = coach(env);
  await c.post('/api/auth/register', { username: 'arch-gym', password: 'gym-pass-2026', studioName: 'ארכיון' });
  const studio = await c.post('/api/studios', { name: 'ארכיון', equipment: ['dumbbell', 'bench_flat'] });
  const t = await c.post('/api/trainees', {
    name: 'רון כהן', studioId: studio.body.id, primaryGoal: 'hypertrophy', daysPerWeek: 3,
  });

  // מטרה משתנה בכל סבב: אחרת התכנית זהה, והארכיון בכוונה אינו שומר כפילות
  const goals = ['hypertrophy', 'strength', 'fat_loss', 'endurance', 'general_fitness'];
  for (let week = 1; week <= 20; week++) {
    await c.post('/api/trainees', {
      id: t.body.id, name: 'רון כהן', studioId: studio.body.id,
      primaryGoal: goals[week % goals.length], daysPerWeek: 3 + (week % 3),
    });
    const res = await c.post('/api/programs/generate', {
      traineeId: t.body.id, studioId: studio.body.id, reason: `week_${week}`,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  const history = await c.get(`/api/history?traineeId=${encodeURIComponent(t.body.id)}`);
  const kept = history.body.programs || [];
  assert.ok(kept.length > 1, 'לא נשמרו צילומים בכלל — הבדיקה אינה בודקת כלום');
  assert.ok(kept.length <= 12, `נשמרו ${kept.length} צילומים`);
});
