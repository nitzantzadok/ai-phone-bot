/**
 * קריאת גיליון OpenDocument‏ (.ods).
 *
 * זה הפורמט של LibreOffice, וגם אחת מאפשרויות ההורדה של Google Sheets.
 * מאמן שבחר בה מקבל קובץ שגם הוא ארכיון ZIP — ולכן זוהה עד היום כקובץ
 * Excel פגום, והייבוא נעצר עם הודעה שאינה נכונה. כאן הוא פשוט נקרא.
 */

import { shZipOpen, shZipReadText, shXmlTags, shXmlAttr, shXmlUnescape } from './xlsx.js';

/** ארכיון שיש בו content.xml הוא מסמך OpenDocument. */
export function shIsOds(zip) {
  return zip.entries.has('content.xml');
}

/** הטקסט של תא: כל פסקאות ה-<text:p>, כל אחת שורה בפני עצמה. */
function cellText(inner) {
  const parts = [];
  for (const p of shXmlTags(inner, 'text:p')) {
    parts.push(shXmlUnescape(p.inner.replace(/<text:s\/>/g, ' ').replace(/<[^>]*>/g, '')).trim());
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * ערך התא.
 * ב-ODS הערך המדויק יושב בתכונה (office:value, office:date-value) והטקסט
 * הוא רק התצוגה. מעדיפים את התצוגה כשהיא קיימת — היא מה שהמאמן רואה
 * בגיליון — ונופלים לערך הגולמי כשאין.
 */
function cellValue(attrs, inner) {
  const shown = cellText(inner);
  if (shown) return shown;
  const date = shXmlAttr(attrs, 'office:date-value');
  if (date) return date.slice(0, 10);
  const value = shXmlAttr(attrs, 'office:value');
  if (value !== null) return value;
  const bool = shXmlAttr(attrs, 'office:boolean-value');
  if (bool !== null) return bool === 'true' ? 'TRUE' : 'FALSE';
  return '';
}

const repeat = (attrs, name, cap) => {
  const n = +(shXmlAttr(attrs, name) || 1);
  return Number.isFinite(n) && n > 0 ? Math.min(n, cap) : 1;
};

function parseTable(inner) {
  const rows = [];
  for (const row of shXmlTags(inner, 'table:table-row')) {
    const cells = [];
    for (const c of shXmlTags(row.inner, 'table:table-cell')) {
      const value = cellValue(c.attrs, c.inner);
      // תאים ריקים בסוף השורה נכתבים כחזרה אחת של אלפי עמודות. מותר לחזור
      // עליהם, אבל לא לבנות מהם שורה באורך של מיליון תאים.
      const times = repeat(c.attrs, 'table:number-columns-repeated', value ? 1000 : 64);
      for (let i = 0; i < times; i++) cells.push(value);
    }
    while (cells.length && cells.at(-1) === '') cells.pop();
    const times = repeat(row.attrs, 'table:number-rows-repeated', cells.length ? 1000 : 1);
    for (let i = 0; i < times; i++) rows.push([...cells]);
  }
  while (rows.length && rows.at(-1).every((c) => c === '')) rows.pop();
  return rows;
}

/**
 * קובץ ods -> לשוניות.
 * @param {ArrayBuffer|Uint8Array|object} data קובץ, או ארכיון פתוח
 * @returns {Promise<Array<{name:string, rows:string[][]}>>}
 */
export async function shReadOds(data) {
  const zip = data && data.entries instanceof Map ? data : shZipOpen(data);
  const xml = await shZipReadText(zip, 'content.xml');
  if (!xml) throw new Error('זה קובץ ZIP אבל לא גיליון OpenDocument');

  const out = [];
  let index = 0;
  for (const table of shXmlTags(xml, 'table:table')) {
    index++;
    const name = shXmlUnescape(shXmlAttr(table.attrs, 'table:name') || `לשונית ${index}`);
    const rows = parseTable(table.inner);
    if (rows.some((r) => r.some((c) => String(c).trim()))) out.push({ name, rows });
  }
  if (!out.length) throw new Error('לא נמצאו נתונים בקובץ');
  return out;
}
