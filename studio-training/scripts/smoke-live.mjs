/**
 * בדיקה חיה של השרת המשותף אחרי פריסה.
 *
 * לא מספיק ש"הפריסה הצליחה": מה שחשוב הוא שהמסך נטען, שנתון שנשמר אצל
 * מאמן אחד באמת יושב במסד, ושמאמן שני שנכנס מדפדפן אחר רואה אותו. הבדיקה
 * הזאת עוברת בדיוק את המסלול הזה מול הכתובת האמיתית.
 *
 * שימוש: node scripts/smoke-live.mjs https://<כתובת>
 */
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('שימוש: node scripts/smoke-live.mjs <כתובת>');
  process.exit(1);
}

function fail(what, extra) {
  console.error(`נכשל: ${what}`);
  if (extra !== undefined) console.error(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2));
  process.exit(1);
}

/** לקוח עם צנצנת עוגיות משלו — כך שני "דפדפנים" נבדלים זה מזה. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* לא JSON — נחזיר את הטקסט */ }
    return { status: res.status, json, text };
  };
}

const stamp = Date.now();
const username = `smoke${stamp}`;
const password = `Smoke-Test-${stamp}`;
const traineeName = `מתאמן בדיקה ${stamp}`;

// 1. המסך נטען, ומגיע כמסמך HTML שלם
const page = await fetch(base);
if (page.status !== 200) fail(`המסך לא נטען (קוד ${page.status})`);
const html = await page.text();
if (!/<html/i.test(html)) fail('מה שהתקבל אינו מסמך HTML', html.slice(0, 200));

// 2. מאמן ראשון נרשם
const a = client();
const reg = await a('POST', '/api/auth/register', { username, password, studioName: 'סטודיו בדיקה' });
if (!reg.json?.ok) fail('הרשמה', reg.json ?? reg.text);

// 3. פותח סטודיו ורושם מתאמן
const studio = await a('POST', '/api/studios', { name: 'סטודיו בדיקה', equipment: ['barbell', 'dumbbell'] });
if (!studio.json?.ok) fail('יצירת סטודיו', studio.json ?? studio.text);
const studioId = studio.json.id;

const created = await a('POST', '/api/trainees', {
  name: traineeName, studioId, level: 'beginner', goal: 'strength', daysPerWeek: 3,
});
if (!created.json || created.json.ok === false) fail('רישום מתאמן', created.json ?? created.text);

// 4. מאמן שני, מדפדפן נפרד, נכנס עם אותו חשבון — וחייב לראות את אותו מתאמן
const b = client();
const login = await b('POST', '/api/auth/login', { username, password });
if (!login.json?.ok) fail('כניסה מהדפדפן השני', login.json ?? login.text);

const list = await b('GET', '/api/trainees');
const names = (Array.isArray(list.json) ? list.json : list.json?.trainees || []).map((t) => t.name);
if (!names.includes(traineeName)) fail('הנתונים אינם משותפים בין שני המאמנים', list.json ?? list.text);

// 5. בלי כניסה אין גישה לנתונים
const anon = client();
const denied = await anon('GET', '/api/trainees');
if (denied.status !== 401) fail(`גישה בלי כניסה החזירה ${denied.status} במקום 401`, denied.json ?? denied.text);

console.log('הכל עובד:');
console.log('  · המסך נטען מהכתובת');
console.log('  · מאמן נרשם, פתח סטודיו ורשם מתאמן');
console.log('  · מאמן שני מדפדפן אחר רואה את אותו מתאמן');
console.log('  · מי שלא נכנס אינו רואה כלום');
