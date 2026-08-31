/**
 * קובץ אחד שהמאמן בחר -> לשוניות.
 *
 * מאמן לא יודע — ולא צריך לדעת — אם הקובץ שהוריד הוא xlsx, ods, CSV בעברית
 * של חלונות או ייצוא JSON ממערכת קודמת. הוא בוחר את הקובץ שיש לו. כאן
 * מזוהה מה הוא באמת, לפי התוכן ולא לפי הסיומת, וכל מסלול מוביל לאותה
 * מטריצה. הקובץ אינו נשלח לשום מקום — הוא נקרא במחשב שלו.
 */

import { shIsZip, shReadXlsx, shZipOpen } from './xlsx.js';
import { shIsOds, shReadOds } from './ods.js';
import { shDecodeBytes, shParseAny } from './table.js';

/** סיומות שכדאי להציע בתיבת הבחירה. */
export const SH_FILE_ACCEPT = '.csv,.tsv,.txt,.tab,.xlsx,.xlsm,.ods,.json,.html,.htm';

const isOldExcel = (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
const isPdf = (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

const baseName = (name) => String(name || '').replace(/\.[^.]+$/, '').trim() || 'לשונית';

/**
 * @param {ArrayBuffer|Uint8Array} buffer תוכן הקובץ
 * @param {string} fileName שם הקובץ, לשם הלשונית ותו לא
 * @returns {Promise<Array<{name:string, rows:string[][]}>>}
 */
export async function shReadFile(buffer, fileName = '') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const base = baseName(fileName);
  if (!bytes.length) throw new Error('הקובץ ריק');

  if (shIsZip(bytes)) {
    const zip = shZipOpen(bytes);
    /*
     * xlsx ו-ods הם שניהם ארכיון ZIP, והסיומת לבדה משקרת מדי פעם: קובץ
     * שנשמר מ-LibreOffice בשם xlsx נשאר ods בפנים. לכן ההכרעה היא לפי מה
     * שיש בארכיון.
     */
    const sheets = zip.entries.has('xl/workbook.xml')
      ? await shReadXlsx(bytes)
      : shIsOds(zip)
        ? await shReadOds(zip)
        : null;
    if (!sheets) throw new Error(`${base} הוא קובץ ZIP שאינו גיליון. אם זו תיקייה מכווצת — צריך לחלץ אותה ולבחור את הקבצים שבתוכה.`);
    return sheets.map((s, i) => ({ name: sheets.length > 1 ? s.name : (s.name || base), rows: s.rows, index: i }));
  }

  if (isOldExcel(bytes)) {
    throw new Error(`${base} הוא קובץ Excel בפורמט הישן (xls). בקובץ: קובץ ← שמירה בשם ← xlsx, או הורדה כ-CSV.`);
  }
  if (isPdf(bytes)) {
    throw new Error(`${base} הוא PDF ואי אפשר לקרוא ממנו טבלה. אפשר לסמן את הטבלה ב-PDF, להעתיק, ולהדביק בתיבת ההדבקה למעלה.`);
  }

  const rows = shParseAny(shDecodeBytes(bytes));
  if (!rows.some((r) => r.some((c) => String(c).trim()))) throw new Error(`לא נמצאו שורות ב-${base}`);
  return [{ name: base, rows, index: 0 }];
}
