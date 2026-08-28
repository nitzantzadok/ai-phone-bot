/**
 * מגיליון גולמי לטבלה שאפשר לעבוד איתה.
 *
 * גיליון אמיתי כמעט אף פעם לא מתחיל בשורת כותרת בשורה 1: יש כותרת ראשית
 * ממוזגת, שורה ריקה, לפעמים לוגו. יש עמודות ריקות באמצע ושורות סיכום בסוף.
 * הקוד כאן מוצא איפה הטבלה באמת מתחילה, ומנקה את השאר.
 */

import { shEmpty, shNorm, shNum } from './text.js';

/**
 * פענוח קובץ לטקסט.
 *
 * Excel בעברית שומר CSV בקידוד windows-1255 ולא ב-UTF-8. קריאה של קובץ
 * כזה כ-UTF-8 מחזירה ג'יבריש גמור — וזה נראה למאמן כמו מערכת שבורה, לא
 * כמו בעיית קידוד. לכן מזהים את הקידוד לפי סימן הסדר בתחילת הקובץ, ואם
 * אין כזה — בודקים אם הפענוח כ-UTF-8 בכלל חוקי, ורק אז נופלים לעברית של
 * חלונות.
 */
export function shDecodeBytes(buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(b.subarray(3));
  }
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(b);
    return text;
  } catch {
    // לא UTF-8 תקין: כמעט תמיד זה ייצוא CSV מ-Excel בעברית
    try { return new TextDecoder('windows-1255').decode(b); } catch { /* אין תמיכה */ }
    return new TextDecoder('utf-8').decode(b);
  }
}

/** תווי הפרדה אפשריים, לפי סבירות. Excel בעברית מייצא לרוב עם נקודה-פסיק. */
const DELIMS = ['\t', ',', ';', '|'];

/** מזהה את תו ההפרדה לפי איזה מהם מייצר מספר עמודות עקבי בשורות הראשונות. */
export function shSniffDelimiter(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (!lines.length) return ',';
  let best = { delim: ',', score: -1 };
  for (const delim of DELIMS) {
    const counts = lines.map((l) => shParseLine(l, delim).length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    // עקביות חשובה יותר מכמות: 6 עמודות בכל שורה עדיף על 9 ואז 2
    const common = counts.filter((c) => c === max).length / counts.length;
    const score = max * common;
    if (score > best.score) best = { delim, score };
  }
  return best.delim;
}

/** פיצול שורה בודדת בכבוד למרכאות — לצורך זיהוי ההפרדה בלבד. */
function shParseLine(line, delim) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur === '') quoted = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * טקסט מופרד -> מטריצה. תומך במרכאות, בשורות בתוך תא, וב-BOM.
 * זה הפורמט שמתקבל גם מהדבקה ישירה מ-Google Sheets (טאבים).
 */
export function shParseDelimited(text, delim) {
  let src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const d = delim || shSniffDelimiter(src);
  const rows = []; let row = []; let cur = ''; let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    /*
     * מרכאה פותחת תא רק בתחילתו. גרשיים בתוך מילה — "סה\"כ", "ק\"ג", 'צ\"ג' —
     * הם חלק מהעברית ולא תחביר, ומרכאה שנפתחת באמצע תא בולעת את שאר הגיליון.
     */
    } else if (c === '"' && cur === '') quoted = true;
    else if (c === d) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur.trim());
  rows.push(row);
  // שורות ריקות נשמרות בכוונה: הן מה שמפריד בין שתי טבלאות באותה לשונית.
  // הסרתן נעשית בשלב בניית הטבלה, אחרי שהחלוקה לגושים כבר נעשתה.
  while (rows.length && rows.at(-1).every((c) => c === '')) rows.pop();
  return rows;
}

/**
 * חלוקת לשונית לגושים.
 *
 * בגיליון אמיתי יושבות לפעמים שתי טבלאות באותה לשונית — רשימת מתאמנים
 * למעלה ורשימת ציוד מתחתיה, מופרדות בשורות ריקות. בלי החלוקה הזאת השנייה
 * נבלעת בראשונה ונקראת כשורות פגומות.
 */
export function shSplitBlocks(rows, { minGap = 2, minRows = 2 } = {}) {
  const blocks = [];
  let current = [];
  let gap = 0;
  const isEmpty = (r) => !r || r.every((c) => shEmpty(c));

  for (const row of rows) {
    if (isEmpty(row)) {
      gap++;
      if (gap >= minGap && current.length) { blocks.push(current); current = []; }
      continue;
    }
    gap = 0;
    current.push(row);
  }
  if (current.length) blocks.push(current);

  const real = blocks.filter((b) => b.length >= minRows);
  return real.length ? real : [rows.filter((r) => !isEmpty(r))];
}

/** כמה "כותרתית" נראית שורה: טקסט קצר, ייחודי, לא מספרים. */
function headerScore(row, below) {
  const filled = row.filter((c) => !shEmpty(c));
  if (filled.length < 2) return -1;
  const distinct = new Set(filled.map(shNorm)).size / filled.length;
  const numeric = filled.filter((c) => shNum(c) !== null && String(c).trim() === String(shNum(c))).length / filled.length;
  const short = filled.filter((c) => String(c).length <= 28).length / filled.length;
  const density = filled.length / Math.max(1, row.length);

  // כותרת אמיתית שונה מהשורות שמתחתיה: מתחתיה יש מספרים, תאריכים ושמות
  let contrast = 0;
  if (below.length) {
    const belowNumeric = below.reduce((n, r) => n + r.filter((c) => shNum(c) !== null).length, 0)
      / Math.max(1, below.length * Math.max(1, row.length));
    contrast = Math.max(0, belowNumeric - numeric);
  }
  return distinct * 1.2 + short * 0.8 + density * 0.8 + contrast * 1.5 - numeric * 2;
}

/**
 * מטריצה -> טבלה עם כותרות.
 * מחפש את שורת הכותרת בעשר השורות הראשונות, ומתעלם ממה שמעליה.
 */
export function shToTable(matrix, { name = '' } = {}) {
  // תווי כיווניות ורווחים קשיחים מגיעים מגיליונות בעברית ואינם נראים לעין,
  // אבל הם נשארים בתוך השם ומונעים התאמה בין לשוניות
  const clean = (c) => String(c ?? '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g, '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const grid = (matrix || []).map((r) => r.map(clean));
  if (!grid.length) return { name, headers: [], rows: [], headerRow: -1, title: '', empty: true };

  let bestIdx = 0; let bestScore = -Infinity;
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const s = headerScore(grid[i], grid.slice(i + 1, i + 6));
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }

  const headerCells = grid[bestIdx] || [];
  const width = Math.max(...grid.map((r) => r.length), headerCells.length);
  const headers = [];
  for (let c = 0; c < width; c++) headers.push(headerCells[c] || '');

  const body = grid.slice(bestIdx + 1)
    .map((r) => Array.from({ length: width }, (_, c) => r[c] || ''))
    .filter((r) => r.some((cell) => !shEmpty(cell)));

  // עמודות ריקות לגמרי לא מוסיפות מידע ורק מבלבלות את המיפוי
  const keep = [];
  for (let c = 0; c < width; c++) {
    if (!shEmpty(headers[c]) || body.some((r) => !shEmpty(r[c]))) keep.push(c);
  }

  return {
    name,
    title: bestIdx > 0 ? (grid[0].find((c) => !shEmpty(c)) || '') : '',
    headerRow: bestIdx,
    headers: keep.map((c) => headers[c]),
    rows: body.map((r) => keep.map((c) => r[c])),
    /**
     * הרשת המלאה כפי שהיא, לפני ההפרדה לכותרת ולגוף. גיליון בפריסה אנכית
     * אינו מחולק כך, ובלי המקור היו נעלמות ממנו כל השורות שמעל השורה
     * שנבחרה בטעות ככותרת.
     */
    raw: grid,
    empty: body.length === 0,
  };
}

/** טבלה מטקסט: הדרך המהירה — הדבקה מהגיליון או קובץ CSV. */
export function shTableFromText(text, { name = '', delim = null } = {}) {
  return shToTable(shParseDelimited(text, delim), { name });
}

/**
 * גיליון בפריסת "תווית: ערך" (שתי עמודות, שורה לכל פרט).
 * כך נראים לרוב פרטי הסטודיו עצמו, ולא רשימת מתאמנים.
 */
/**
 * גיליון אנכי -> טבלה רגילה בת שורה אחת.
 *
 * "שם | רון כהן" בשורה, "גיל | 34" בשורה הבאה — כך נראה כרטיס אישי של
 * מתאמן, וגם דף פרטי הסטודיו. ההיפוך מאפשר לזהות אותו עם אותו קוד בדיוק
 * שמזהה טבלה רגילה, בלי ענף נפרד לכל שדה.
 */
export function shKeyValueTable(table) {
  const rows = table.raw || (table.headers.some((h) => !shEmpty(h))
    ? [table.headers, ...table.rows]
    : table.rows);
  const labels = [];
  const values = [];
  for (const row of rows) {
    const label = String(row[0] || '').trim();
    const value = String(row[1] || '').trim();
    if (!label || shEmpty(value)) continue;
    labels.push(label);
    values.push(value);
  }
  return { name: table.name, headers: labels, rows: [values], empty: !labels.length };
}

export function shLooksLikeKeyValue(table) {
  const rows = table.raw || table.rows;
  if (rows.length < 2) return false;
  const width = Math.max(...rows.map((r) => r.filter((c) => !shEmpty(c)).length));
  if (width > 3) return false;
  const pairs = rows.filter((r) => !shEmpty(r[0]) && !shEmpty(r[1]));
  if (pairs.length < Math.max(2, rows.length * 0.7)) return false;
  return new Set(pairs.map((r) => shNorm(r[0]))).size === pairs.length;
}
