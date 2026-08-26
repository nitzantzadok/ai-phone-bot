/**
 * מגיליון גולמי לטבלה שאפשר לעבוד איתה.
 *
 * גיליון אמיתי כמעט אף פעם לא מתחיל בשורת כותרת בשורה 1: יש כותרת ראשית
 * ממוזגת, שורה ריקה, לפעמים לוגו. יש עמודות ריקות באמצע ושורות סיכום בסוף.
 * הקוד כאן מוצא איפה הטבלה באמת מתחילה, ומנקה את השאר.
 */

import { shEmpty, shNorm, shNum } from './text.js';

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
  return rows.filter((r) => r.some((cell) => cell !== ''));
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
  const grid = (matrix || []).map((r) => r.map((c) => String(c ?? '').trim()));
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
    empty: body.length === 0,
  };
}

/** ערכי עמודה אחת, בלי תאים ריקים — הבסיס לזיהוי לפי תוכן. */
export function shColumn(table, index) {
  return table.rows.map((r) => r[index]).filter((v) => !shEmpty(v));
}

/** טבלה מטקסט: הדרך המהירה — הדבקה מהגיליון או קובץ CSV. */
export function shTableFromText(text, { name = '', delim = null } = {}) {
  return shToTable(shParseDelimited(text, delim), { name });
}

/**
 * גיליון בפריסת "תווית: ערך" (שתי עמודות, שורה לכל פרט).
 * כך נראים לרוב פרטי הסטודיו עצמו, ולא רשימת מתאמנים.
 */
export function shLooksLikeKeyValue(table) {
  if (table.headers.length > 3 || table.rows.length < 2) return false;
  const twoCols = table.rows.filter((r) => !shEmpty(r[0]) && !shEmpty(r[1]));
  if (twoCols.length < Math.max(2, table.rows.length * 0.7)) return false;
  const distinctLabels = new Set(twoCols.map((r) => shNorm(r[0]))).size;
  return distinctLabels === twoCols.length;
}
