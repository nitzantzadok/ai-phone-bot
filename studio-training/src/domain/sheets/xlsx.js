/**
 * קריאת קובץ Excel (.xlsx) בלי ספריות.
 *
 * למה זה נחוץ: בתפריט ההורדה של Google Sheets האפשרות הראשונה היא
 * "Microsoft Excel (.xlsx)", והיא זו שמורידה את *כל* הלשוניות בקובץ אחד.
 * מאמן שמוריד את הגיליון שלו מקבל בדרך כלל בדיוק את זה, ולכן קובץ כזה
 * חייב להיקרא — ולא להחזיר הודעה שתבקש ממנו לנסות שוב אחרת.
 *
 * xlsx הוא ארכיון ZIP של קובצי XML. הדפדפן יודע לפרוס deflate בעצמו
 * (DecompressionStream), והפירוק של ה-ZIP וה-XML נעשה כאן. אין כאן ספרייה
 * חיצונית ואין שליחה של הקובץ לשום מקום — הוא נקרא במחשב של המאמן.
 */

const U8 = (buf) => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));

/** חתימת ZIP: כל xlsx מתחיל ב-PK. */
export function shIsZip(data) {
  const b = U8(data);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
}

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/**
 * טבלת התוכן של הארכיון.
 * קוראים את הספרייה המרכזית ולא סורקים את הקובץ מהתחלה — כך גם ארכיון
 * שנוצר בכלים שונים נקרא נכון.
 */
export function shZipOpen(bytes) {
  const b = U8(bytes);
  // סוף הספרייה המרכזית נמצא בסוף הקובץ; מחפשים אותו לאחור
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('הקובץ אינו ארכיון תקין');

  const count = u16(b, eocd + 10);
  let offset = u32(b, eocd + 16);
  if (offset === 0xffffffff) throw new Error('קובץ גדול מדי (ZIP64) — כדאי לייצא כ-CSV');

  const decoder = new TextDecoder('utf-8');
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(b, offset) !== 0x02014b50) break;
    const method = u16(b, offset + 10);
    const compressedSize = u32(b, offset + 20);
    const nameLen = u16(b, offset + 28);
    const extraLen = u16(b, offset + 30);
    const commentLen = u16(b, offset + 32);
    const localOffset = u32(b, offset + 42);
    const name = decoder.decode(b.subarray(offset + 46, offset + 46 + nameLen));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { bytes: b, entries };
}

/** תוכן קובץ בודד מתוך הארכיון, כטקסט. */
export async function shZipReadText(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const b = zip.bytes;
  const local = entry.localOffset;
  if (u32(b, local) !== 0x04034b50) throw new Error('רשומה פגומה בארכיון');
  const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
  const data = b.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder('utf-8').decode(data);
  if (entry.method !== 8) throw new Error('שיטת דחיסה שאינה נתמכת בקובץ');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/* ------------------------------------------------------------------ XML */

/** כל התגיות מסוג מסוים, עם התכונות והתוכן הפנימי. */
export function* shXmlTags(xml, name) {
  const re = new RegExp(`<${name}(\\s[^>]*?)?(/)?>`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || '';
    if (m[2]) { yield { attrs, inner: '' }; continue; }
    const close = xml.indexOf(`</${name}>`, re.lastIndex);
    const inner = close < 0 ? '' : xml.slice(re.lastIndex, close);
    yield { attrs, inner };
    if (close >= 0) re.lastIndex = close + name.length + 3;
  }
}

export const shXmlAttr = (attrs, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs || '');
  return m ? m[1] : null;
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const shXmlUnescape = (text) => String(text || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e]);

/** הטקסט של תא: איחוד של כל קטעי ה-<t>, כולל טקסט מעוצב שמפוצל לחלקים. */
function textOf(xml) {
  let out = '';
  for (const t of shXmlTags(xml, 't')) out += shXmlUnescape(t.inner);
  return out;
}

/* --------------------------------------------------------------- תאריכים */

/** תבניות התאריך המובנות של Excel. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/**
 * אילו סגנונות הם תאריך.
 * בלי זה תאריך היה מגיע כמספר סידורי (45000) — נכון מבחינת הקובץ, ובלתי
 * קריא לחלוטין למאמן שמסתכל על מסך האישור.
 */
function dateStyles(stylesXml) {
  const isDate = new Set();
  if (!stylesXml) return isDate;

  const custom = new Set();
  for (const fmt of shXmlTags(stylesXml, 'numFmt')) {
    const id = +shXmlAttr(fmt.attrs, 'numFmtId');
    const code = (shXmlAttr(fmt.attrs, 'formatCode') || '').toLowerCase();
    // תבנית שיש בה יום/חודש/שנה היא תאריך; [h] ודומיו הם משך זמן ולא תאריך
    if (/[dmy]/.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''))) custom.add(id);
  }

  const cellXfs = [...shXmlTags(stylesXml, 'cellXfs')][0];
  if (!cellXfs) return isDate;
  let index = 0;
  for (const xf of shXmlTags(cellXfs.inner, 'xf')) {
    const id = +shXmlAttr(xf.attrs, 'numFmtId');
    if (BUILTIN_DATE_FORMATS.has(id) || custom.has(id)) isDate.add(index);
    index++;
  }
  return isDate;
}

/** מספר סידורי של Excel -> YYYY-MM-DD. */
function serialToDate(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** "BF12" -> 57. אות העמודה היא בסיס 26. */
function columnIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref || '');
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/* ----------------------------------------------------------------- גיליון */

function parseSheet(xml, shared, isDateStyle) {
  const rows = [];
  const sheetData = [...shXmlTags(xml, 'sheetData')][0];
  if (!sheetData) return rows;

  for (const row of shXmlTags(sheetData.inner, 'row')) {
    const cells = [];
    for (const c of shXmlTags(row.inner, 'c')) {
      const ref = shXmlAttr(c.attrs, 'r');
      const type = shXmlAttr(c.attrs, 't');
      const style = shXmlAttr(c.attrs, 's');
      let value = '';

      if (type === 'inlineStr') {
        value = textOf(c.inner);
      } else if (type === 's') {
        const v = [...shXmlTags(c.inner, 'v')][0];
        value = v ? (shared[+shXmlUnescape(v.inner)] ?? '') : '';
      } else {
        const v = [...shXmlTags(c.inner, 'v')][0];
        const raw = v ? shXmlUnescape(v.inner).trim() : '';
        if (raw === '') value = '';
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'str' || type === 'e') value = raw;
        else if (style !== null && isDateStyle.has(+style) && Number.isFinite(+raw) && +raw > 0) {
          value = serialToDate(+raw);
        } else value = raw;
      }

      // המיקום נקבע לפי שם התא ולא לפי הסדר: תא ריק אינו נכתב לקובץ,
      // ובלי זה כל העמודות שאחריו היו זזות שמאלה
      const at = columnIndex(ref);
      if (at >= 0) { while (cells.length < at) cells.push(''); cells[at] = value; }
      else cells.push(value);
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * קובץ xlsx -> לשוניות, לפי הסדר שבו הן מופיעות בקובץ.
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {Promise<Array<{name:string, rows:string[][]}>>}
 */
export async function shReadXlsx(data) {
  const zip = shZipOpen(data);
  if (!zip.entries.has('xl/workbook.xml')) throw new Error('זה קובץ ZIP אבל לא קובץ Excel');

  const workbook = await shZipReadText(zip, 'xl/workbook.xml');
  const relsXml = await shZipReadText(zip, 'xl/_rels/workbook.xml.rels');
  const stylesXml = await shZipReadText(zip, 'xl/styles.xml');
  const sharedXml = await shZipReadText(zip, 'xl/sharedStrings.xml');

  const shared = [];
  if (sharedXml) for (const si of shXmlTags(sharedXml, 'si')) shared.push(textOf(si.inner));

  const rels = new Map();
  if (relsXml) {
    for (const r of shXmlTags(relsXml, 'Relationship')) {
      const target = shXmlAttr(r.attrs, 'Target') || '';
      rels.set(shXmlAttr(r.attrs, 'Id'), target.replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
  }

  const isDateStyle = dateStyles(stylesXml);
  const out = [];
  let fallbackIndex = 0;

  for (const sheet of shXmlTags(workbook, 'sheet')) {
    fallbackIndex++;
    const name = shXmlUnescape(shXmlAttr(sheet.attrs, 'name') || `לשונית ${fallbackIndex}`);
    const rid = shXmlAttr(sheet.attrs, 'r:id') || shXmlAttr(sheet.attrs, 'id');
    const path = `xl/${rels.get(rid) || `worksheets/sheet${fallbackIndex}.xml`}`;
    const xml = await shZipReadText(zip, path)
      || await shZipReadText(zip, `xl/worksheets/sheet${fallbackIndex}.xml`);
    if (!xml) continue;
    const rows = parseSheet(xml, shared, isDateStyle);
    // לשונית ריקה לגמרי אינה מעניינת אף אחד, ורק מוסיפה רעש למסך האישור
    if (rows.some((r) => r.some((c) => String(c).trim()))) out.push({ name, rows });
  }

  if (!out.length) throw new Error('לא נמצאו נתונים בקובץ');
  return out;
}
