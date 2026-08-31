/**
 * המערכת כפונקציה בקצה (Cloudflare Workers), מול מסד D1.
 *
 * למה זה קיים: שני מאמנים באותו סטודיו צריכים לראות את אותם מתאמנים.
 * גרסת הדפדפן שומרת כל חשבון במחשב שבו הוא נפתח, ולכן היא אישית מטבעה.
 * כאן הנתונים יושבים במסד מנוהל אחד, וכל מי שנכנס — מכל מכשיר — רואה את
 * אותה תמונה.
 *
 * הקוד עצמו אינו חדש: זו אותה טבלת נתיבים של השרת (src/server/api.js).
 * מה שמוחלף כאן הוא רק הקצוות — מאיפה נטען המסמך, ולאן הוא נשמר.
 */

import { Db } from '../src/store/db.js';
import { ALL_ROUTES, PUBLIC, resolveAccount, setDb } from '../src/server/api.js';
import APP_HTML from '../dist/app.page.js';

/**
 * המסמך נשמר בפרוסות.
 *
 * סטודיו שעובד שנה צובר מתאמנים, ארכיון תכניות והיסטוריה — ומסמך אחד גדול
 * מסתכן בתקרת גודל של שורה. הפרוסות שומרות כל שורה קטנה, וההרכבה חזרה היא
 * שרשור פשוט. שורת הכותרת מחזיקה את מספר הגרסה ואת מספר הפרוסות, והיא זו
 * שמכריעה מי כתב אחרון.
 */
const DOC_ID = 'main';
const CHUNK = 400_000;

const SCHEMA = `CREATE TABLE IF NOT EXISTS doc (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  savedAt TEXT
)`;

let schemaReady = null;
async function ensureSchema(d1) {
  if (!schemaReady) schemaReady = d1.prepare(SCHEMA).run().catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

async function loadDoc(d1) {
  await ensureSchema(d1);
  const head = await d1.prepare('SELECT json, version FROM doc WHERE id = ?').bind(DOC_ID).first();
  if (!head) return { data: {}, version: 0, fresh: true };

  let text = head.json;
  const parts = Number(JSON.parse(text || '{}').parts || 0);
  if (parts) {
    const chunks = [];
    for (let i = 0; i < parts; i++) {
      const row = await d1.prepare('SELECT json FROM doc WHERE id = ?').bind(`${DOC_ID}#${i}`).first();
      chunks.push(row?.json || '');
    }
    text = chunks.join('');
  }

  try {
    return { data: JSON.parse(text), version: head.version, fresh: false };
  } catch {
    // מסמך פגום לא נמחק: הוא נשמר בצד כדי שאפשר יהיה לשחזר ממנו ידנית
    await d1.prepare('INSERT OR REPLACE INTO doc (id, json, version, savedAt) VALUES (?, ?, ?, ?)')
      .bind(`corrupt-${Date.now()}`, text.slice(0, CHUNK), head.version, new Date().toISOString()).run();
    return { data: {}, version: head.version, fresh: false };
  }
}

/**
 * כתיבה שלא דורסת שינוי של מישהו אחר.
 * שני מאמנים שעובדים במקביל הם המצב הרגיל כאן, ולכן העדכון מותנה במספר
 * הגרסה שנקרא: אם מישהו הספיק לכתוב בינתיים, הכתיבה נדחית והבקשה תרוץ
 * שוב על המסמך העדכני במקום למחוק את עבודתו.
 */
async function saveDoc(d1, data, version, fresh) {
  const json = JSON.stringify(data);
  const now = new Date().toISOString();
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  const head = JSON.stringify({ parts: chunks.length, bytes: json.length });

  /*
   * הכותרת נכתבת ראשונה ורק אם איש לא הקדים אותנו. אם היא נדחתה, הפרוסות
   * כלל לא נכתבות — וכך אין מצב שבו חצי מהנתונים החדשים כבר בפנים.
   */
  const claimed = fresh
    ? await d1.prepare('INSERT OR IGNORE INTO doc (id, json, version, savedAt) VALUES (?, ?, 1, ?)')
      .bind(DOC_ID, head, now).run()
    : await d1.prepare('UPDATE doc SET json = ?, version = version + 1, savedAt = ? WHERE id = ? AND version = ?')
      .bind(head, now, DOC_ID, version).run();
  if ((claimed.meta?.changes ?? 0) === 0) return false;

  for (let i = 0; i < chunks.length; i++) {
    await d1.prepare('INSERT OR REPLACE INTO doc (id, json, version, savedAt) VALUES (?, ?, ?, ?)')
      .bind(`${DOC_ID}#${i}`, chunks[i], version + 1, now).run();
  }
  // פרוסות שנשארו מגרסה גדולה יותר היו נקראות בטעות אילו המסמך היה גדל שוב
  await d1.prepare('DELETE FROM doc WHERE id LIKE ? AND version < ?').bind(`${DOC_ID}#%`, version + 1).run();
  return true;
}

/*
 * בקשות ה-API רצות אחת אחרי השנייה בתוך אותו מופע.
 * טבלת הנתיבים עובדת מול מסד יחיד, ובלי התור הזה שתי בקשות שנכנסות
 * באותו רגע היו מחליפות אותו זו לזו באמצע העבודה.
 */
let queue = Promise.resolve();
const serialize = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

async function handleApi(request, url, env) {
  const key = `${request.method} ${url.pathname}`;
  const d1 = env.DB;
  if (!d1) return json({ error: 'המסד אינו מחובר לפריסה הזאת' }, 503);

  /*
   * גוף הבקשה נקרא פעם אחת בלבד.
   * הריצה החוזרת (כשמישהו אחר כתב בינתיים) מקבלת את אותו גוף — ניסיון
   * לקרוא אותו שוב מהבקשה היה מחזיר ריק, והבקשה הייתה נכשלת דווקא בגלל
   * מנגנון ההגנה מפני דריסה.
   */
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await loadDoc(d1);
    let dirty = false;

    const db = new Db({ data: doc.data, persist: () => { dirty = true; } });
    const ctx = {
      account: null, token: null,
      // בקצה החיבור תמיד מוצפן, ולכן עוגיית המושב תמיד Secure
      secure: true,
      setCookie: null,
    };

    const result = await serialize(async () => {
      setDb(db);
      const resolved = resolveAccount(request.headers.get('cookie'));
      ctx.account = resolved?.account || null;
      ctx.token = resolved?.token || null;

      if (ALL_ROUTES[key]) {
        if (!PUBLIC.has(key) && !ctx.account) return { status: 401, body: { error: 'נדרשת התחברות', login: true } };
        return { status: 200, body: await ALL_ROUTES[key](body, url, ctx) };
      }
      if (url.pathname === '/api/program' && request.method === 'GET') {
        if (!ctx.account) return { status: 401, body: { error: 'נדרשת התחברות', login: true } };
        const p = db.getProgram(url.searchParams.get('id'));
        if (!p || !db.ownsTrainee(ctx.account.id, p.traineeId)) return { status: 404, body: { error: 'תכנית לא נמצאה' } };
        return { status: 200, body: p };
      }
      return { status: 404, body: { error: 'לא נמצא' } };
    }).catch((err) => ({ status: err.status || 400, body: { error: err.message } }));

    if (!dirty) {
      return json(result.body, result.status, ctx.setCookie ? { 'set-cookie': ctx.setCookie } : {});
    }
    if (await saveDoc(d1, db.data, doc.version, doc.fresh)) {
      return json(result.body, result.status, ctx.setCookie ? { 'set-cookie': ctx.setCookie } : {});
    }
    // מישהו אחר כתב בינתיים — מריצים שוב על המסמך העדכני
  }
  return json({ error: 'המסד עסוק כרגע. נסו שוב בעוד רגע.' }, 503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, url, env);

    // כל נתיב אחר מחזיר את מסך המאמן — זו אפליקציית עמוד יחיד
    return new Response(APP_HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
      },
    });
  },
};
