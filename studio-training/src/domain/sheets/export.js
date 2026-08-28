/**
 * מהמערכת חזרה לגיליון.
 *
 * הייבוא פותר את המעבר פנימה; זה פותר את הכיוון השני. מאמן שרוצה לשלוח
 * תכנית במייל, לצרף אותה לקובץ המעקב של הסטודיו או פשוט לשמור עותק בגיליון
 * שלו — מעתיק טבלה ומדביק. Google Sheets מפרק הדבקה של טקסט מופרד בטאבים
 * לתאים, ולכן זה בדיוק הפורמט שנוצר כאן.
 *
 * הטבלה שיוצאת היא אותה טבלה שהייבוא יודע לקרוא: אפשר להדביק אותה בגיליון,
 * לערוך שם, ולייבא בחזרה בלי אובדן.
 */

/** העמודות, בסדר שמאמן קורא בו: מי, מתי, מה, וכמה. */
export const SH_PROGRAM_COLUMNS = [
  'מתאמן', 'יום', 'סדר', 'תרגיל', 'סטים', 'חזרות', 'משקל', 'מנוחה', 'קצב', 'הערות',
];

/** תא בטוח לטבלה: בלי טאבים ובלי ירידות שורה שישברו את הפריסה. */
const cell = (value) => String(value ?? '')
  .replace(/[\t\r\n]+/g, ' · ')
  .replace(/ {2,}/g, ' ')
  .trim();

/** משקל להצגה: "60", "12 לכל יד", או ריק כשאין מה להעמיס. */
function loadText(block) {
  const load = block.load || {};
  if (load.kg === null || load.kg === undefined || load.kg === '') {
    return block.exercise?.loadable === false ? 'משקל גוף' : '';
  }
  return load.perSide ? `${load.kg} לכל יד` : String(load.kg);
}

/** ההערות שבאמת עוזרות בשטח, מקוצרות לשורת גיליון. */
function noteText(block) {
  const parts = [];
  if (block.setType === 'superset') parts.push('סופרסט');
  if (block.exercise?.unilateral) parts.push('לכל צד');
  if (block.slotLabel) parts.push(block.slotLabel);
  parts.push(...(block.coachingNotes || []).slice(0, 2));
  return cell(parts.join(' · ')).slice(0, 300);
}

/**
 * תכנית אחת -> שורות.
 * @param {object} program התכנית כפי שהמנוע החזיר אותה
 * @param {{header?:boolean}} opts
 */
export function shProgramRows(program, { header = true } = {}) {
  const rows = header ? [[...SH_PROGRAM_COLUMNS]] : [];
  const who = cell(program.traineeName || program.traineeId || '');

  for (const day of program.days || []) {
    const dayLabel = cell(day.label ? `${day.dayLabel} · ${day.label}` : day.dayLabel || `יום ${day.index}`);
    (day.blocks || []).forEach((block, i) => {
      const rx = block.prescription || {};
      rows.push([
        who,
        dayLabel,
        String(i + 1),
        cell(block.exercise?.name),
        cell(rx.sets),
        cell(rx.reps),
        loadText(block),
        rx.restSec ? `${rx.restSec} שנ׳` : '',
        cell(rx.tempo),
        noteText(block),
      ]);
    });
  }
  return rows;
}

/** כמה תכניות בטבלה אחת — כל הסטודיו בהדבקה אחת. */
export function shProgramsRows(programs) {
  const rows = [[...SH_PROGRAM_COLUMNS]];
  for (const program of programs) rows.push(...shProgramRows(program, { header: false }));
  return rows;
}

/**
 * טקסט מופרד בטאבים — הפורמט שגיליון מפרק לתאים בהדבקה.
 * אין כאן מרכאות: התאים כבר נוקו מטאבים ומירידות שורה, וכך ההדבקה נשארת
 * צפויה גם בגיליונות שמפרשים מרכאות אחרת.
 */
export function shToTsv(rows) {
  return rows.map((r) => r.join('\t')).join('\n');
}

/** CSV תקני, לשמירה כקובץ. */
export function shToCsv(rows) {
  const quote = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((r) => r.map(quote).join(',')).join('\n');
}

/**
 * שם הקובץ להורדה — באנגלית בכוונה.
 *
 * דפדפנים משמיטים שם קובץ שאין בו תווי ASCII ומורידים אותו בשם "download"
 * בלי סיומת, וקובץ בלי סיומת אינו נפתח בגיליון בלחיצה. שם המתאמן ממילא
 * מופיע בעמודה הראשונה של הטבלה עצמה, ולכן לא הולך כאן שום מידע לאיבוד.
 */
export function shProgramFileName(program) {
  const latin = String(program.traineeName || '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 30);
  const date = new Date(program.generatedAt || Date.now()).toISOString().slice(0, 10);
  return ['studio-program', latin, date].filter(Boolean).join('-') + '.csv';
}
