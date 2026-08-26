/**
 * חיבור ל-Google Sheets בלי מפתחות, בלי הרשאות ובלי שרת אמצע.
 *
 * גיליון שהשיתוף שלו הוא "כל מי שיש לו הקישור" נגיש דרך נקודת הקצה
 * הציבורית gviz, שהיא חלק מ-Google Sheets עצמו. הבקשה נטענת כתגית script
 * עם פונקציית תגובה — כך היא עוברת גם כשהדפדפן חוסם קריאות בין-אתריות,
 * וכך הנתונים עוברים ישירות מהגיליון לדפדפן של המאמן. הם לא עוברים דרכנו.
 *
 * כשהחיבור הישיר חסום (דף מוגן, גיליון פרטי, אין רשת) נשארות שתי הדרכים
 * שתמיד עובדות: הדבקה ישירה מהגיליון, וקובץ CSV. הן אינן פחות טובות —
 * הן רק דורשות פעולה אחת נוספת מהמאמן.
 */

/** מזהה הגיליון והלשונית מתוך כתובת שהודבקה. */
export function shParseSheetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  // מזהה שהודבק לבדו, בלי כתובת
  if (/^[A-Za-z0-9_-]{25,}$/.test(raw)) return { id: raw, gid: null, kind: 'id' };

  const pub = raw.match(/\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/);
  if (pub) return { id: pub[1], gid: gidFrom(raw), kind: 'published' };

  const std = raw.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (std) return { id: std[1], gid: gidFrom(raw), kind: 'standard' };

  return null;
}

function gidFrom(url) {
  const m = String(url).match(/[#&?]gid=(\d+)/);
  return m ? m[1] : null;
}

/** כתובת ה-API הציבורית של הגיליון. */
export function shGvizUrl(id, { gid = null, sheetName = null, callback = null } = {}) {
  const params = [`tqx=out:json${callback ? `;responseHandler:${callback}` : ''}`, 'headers=0'];
  if (gid) params.push(`gid=${encodeURIComponent(gid)}`);
  else if (sheetName) params.push(`sheet=${encodeURIComponent(sheetName)}`);
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?${params.join('&')}`;
}

/** תגובת gviz -> מטריצת מחרוזות, כולל שורת הכותרות אם Google זיהה כזו. */
export function shGvizToMatrix(payload) {
  const table = payload?.table;
  if (!table) return [];
  const cols = table.cols || [];
  const out = [];

  // כשה-API מזהה כותרות הן חוזרות כתוויות עמודה ולא כשורה. מחזירים אותן פנימה,
  // כי זיהוי הכותרת שלנו עובד על הטבלה המלאה.
  if (cols.some((c) => c && c.label)) out.push(cols.map((c) => String(c.label ?? '')));

  for (const row of table.rows || []) {
    out.push((row.c || []).map((cell) => {
      if (!cell) return '';
      if (cell.f !== undefined && cell.f !== null) return String(cell.f);
      if (cell.v === null || cell.v === undefined) return '';
      return String(cell.v);
    }));
  }
  return out;
}

/** שם הלשונית מתוך התגובה, כשהוא מגיע. לא כל תשובה כוללת אותו. */
export const shGvizSheetName = (payload) => payload?.sheetName || payload?.table?.name || '';

let jsonpSeq = 0;

/**
 * טעינת תשובת gviz דרך תגית script.
 * דורש דפדפן. מחזיר שגיאה ברורה בעברית כשהטעינה נכשלת, כי המאמן צריך
 * לדעת אם הבעיה היא בהרשאות השיתוף או ברשת.
 */
export function shFetchGviz(id, { gid = null, sheetName = null, timeoutMs = 20000 } = {}) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('חיבור ישיר לגיליון אפשרי רק מהדפדפן'));
  }
  return new Promise((resolve, reject) => {
    const cb = `shGviz_${Date.now().toString(36)}_${(jsonpSeq++).toString(36)}`;
    const script = document.createElement('script');
    let done = false;

    const cleanup = () => {
      done = true;
      delete window[cb];
      clearTimeout(timer);
      script.remove();
    };
    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('הגיליון לא הגיב. צריך שהשיתוף יהיה "כל מי שיש לו הקישור — צפייה".'));
    }, timeoutMs);

    window[cb] = (payload) => {
      if (done) return;
      cleanup();
      if (payload?.status === 'error') {
        const detail = (payload.errors || []).map((e) => e.detailed_message || e.message).join(' ');
        reject(new Error(`הגיליון החזיר שגיאה: ${stripTags(detail) || 'אין גישה'}`));
        return;
      }
      resolve(payload);
    };

    script.src = shGvizUrl(id, { gid, sheetName, callback: cb });
    script.onerror = () => {
      if (done) return;
      cleanup();
      reject(new Error('לא הצלחנו לפנות לגיליון מהדפדפן הזה. אפשר להדביק את הנתונים ישירות — זה עובד תמיד.'));
    };
    document.head.appendChild(script);
  });
}

const stripTags = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * ניסיון לגלות את כל הלשוניות בגיליון.
 * עובד בגיליון שפורסם לאינטרנט; בגיליון רגיל הדפדפן חוסם את הקריאה, ואז
 * מחזירים רשימה ריקה והמאמן מוסיף לשוניות לפי קישור. אין כאן כישלון —
 * יש מסלול ראשי ומסלול גיבוי.
 */
export async function shDiscoverTabs(id) {
  if (typeof fetch === 'undefined') return [];
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/pubhtml`,
    `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(id)}/pubhtml`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) continue;
      const html = await res.text();
      const tabs = [];
      const re = /<li[^>]*id="sheet-button-(\d+)"[^>]*>(?:<a[^>]*>)?([^<]*)/g;
      let m;
      while ((m = re.exec(html))) tabs.push({ gid: m[1], name: stripTags(m[2]) || `לשונית ${tabs.length + 1}` });
      if (tabs.length) return tabs;
    } catch { /* חסום — ממשיכים למסלול הגיבוי */ }
  }
  return [];
}

/**
 * טעינת גיליון שלם: מגלה לשוניות אם אפשר, ואחרת טוען את הלשונית שבקישור.
 * @returns {Promise<Array<{name:string, rows:string[][], gid:string|null}>>}
 */
export async function shLoadGoogleSheet(url, { onProgress = () => {} } = {}) {
  const ref = shParseSheetUrl(url);
  if (!ref) throw new Error('זה לא נראה כמו קישור לגיליון Google. צריך את הכתובת מהדפדפן, זו שמתחילה ב-https://docs.google.com/spreadsheets/');

  onProgress('מחפש את הלשוניות בגיליון…');
  let tabs = await shDiscoverTabs(ref.id);
  if (!tabs.length) tabs = [{ gid: ref.gid, name: '' }];

  const sheets = [];
  const failures = [];
  for (const tab of tabs) {
    onProgress(`קורא ${tab.name || 'את הלשונית'}…`);
    try {
      const payload = await shFetchGviz(ref.id, { gid: tab.gid });
      const rows = shGvizToMatrix(payload);
      if (rows.length) sheets.push({ name: tab.name || shGvizSheetName(payload) || 'לשונית', rows, gid: tab.gid });
    } catch (err) {
      failures.push(`${tab.name || 'לשונית'}: ${err.message}`);
    }
  }
  if (!sheets.length) throw new Error(failures[0] || 'לא נמצאו נתונים בגיליון.');
  return sheets;
}
