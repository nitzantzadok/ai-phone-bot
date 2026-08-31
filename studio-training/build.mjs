/**
 * בנייה לעמוד יחיד: מאחד את כל מודולי המנוע לקובץ HTML עצמאי
 * שרץ במלואו בדפדפן, ללא שרת וללא תלויות.
 *
 *   node build.mjs   ->  dist/app.html       (עמוד מלא, מוגש גם מהשרת)
 *                        dist/artifact.html  (תוכן בלבד, לפרסום כארטיפקט)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** סדר תלויות — כל מודול מסתמך רק על אלה שלפניו. */
const MODULES = [
  'src/domain/taxonomy.js',
  'src/domain/notes.js',
  'src/domain/measurements.js',
  'src/domain/structure.js',
  'src/domain/schedule.js',
  'src/domain/history.js',
  'src/domain/inventory.js',
  'src/domain/labels.js',
  'src/domain/level.js',
  'src/domain/descriptions.js',
  'src/domain/exercises.js',
  'src/domain/constraints.js',
  'src/domain/inference.js',
  // ייבוא מגיליון: תלוי בטקסונומיה, בתוויות, בתרגילים ובמגבלות — ולכן אחריהם
  'src/domain/sheets/text.js',
  'src/domain/sheets/vocab.js',
  'src/domain/sheets/table.js',
  'src/domain/sheets/person.js',
  'src/domain/sheets/columns.js',
  'src/domain/sheets/classify.js',
  'src/domain/sheets/build.js',
  'src/domain/sheets/google.js',
  'src/domain/sheets/export.js',
  'src/domain/sheets/xlsx.js',
  'src/domain/sheets/ods.js',
  'src/domain/sheets/read.js',
  'src/domain/models.js',
  'src/engine/prescription.js',
  'src/engine/split.js',
  'src/engine/filters.js',
  'src/engine/select.js',
  'src/engine/loads.js',
  'src/engine/probe.js',
  'src/engine/progression.js',
  'src/engine/feedback.js',
  'src/engine/validate.js',
  'src/engine/generate.js',
  'src/index.js',
  'src/seed.js',
];

/**
 * שמות שמוגדרים ברמה העליונה של כל מודול.
 *
 * הבנייה מדביקה את כל המודולים לקובץ אחד, ולכן שני מודולים שהגדירו
 * `const label` שוברים את הדף כולו — ולא בבנייה אלא בדפדפן, בשקט, אחרי
 * שהכול כבר עלה. הבדיקה הזאת הופכת את זה לשגיאת בנייה.
 */
function topLevelNames(source) {
  const names = [];
  const re = /^(?:export\s+)?(?:async\s+)?(const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(source))) names.push(m[2]);
  return names;
}

/** הופך מודול ES לקטע קוד שטוח: בלי import, בלי export, בלי בלוקי CLI. */
function flatten(source, file) {
  let out = source;

  /*
   * 1. ייבוא — בכל צורותיו.
   *
   * שינוי שם בייבוא (`import { X as Y }`) נשבר כאן בשקט: ההצהרה נמחקת,
   * והשם החדש פשוט אינו קיים בקובץ המאוחד. השגיאה מתגלה רק בדפדפן, בזמן
   * ריצה, בתוך try שבולע אותה. לכן היא נעצרת כאן.
   */
  const aliased = source.match(/^import\s*\{[^}]*\bas\b[^}]*\}\s*from/m);
  if (aliased) throw new Error(`ייבוא עם שינוי שם אינו נתמך בבנייה לקובץ אחד (${file}): ${aliased[0]}`);
  out = out.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  out = out.replace(/^import\s+['"][^'"]+['"];?[ \t]*$/gm, '');

  // 2. ייצוא חוזר (export ... from '...') — מיותר בקובץ אחד, ושובר את התחביר
  out = out.replace(/^export\s+[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');

  // 3. רשימת ייצוא עצמאית: export { a, b };
  out = out.replace(/^export\s+\{[^{}]*\};?[ \t]*$/gm, '');

  // 4. המילה export לפני הגדרה
  out = out.replace(/^export\s+(?=(const|let|var|function|class|async)\b)/gm, '');

  // 5. בלוק ההרצה הישירה (node src/seed.js)
  out = out.replace(/if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{[\s\S]*?\n\}/g, '');

  if (/^\s*(import|export)\s/m.test(out) || out.includes('import.meta')) {
    const line = out.split('\n').find((l) => /^\s*(import|export)\s/.test(l) || l.includes('import.meta'));
    throw new Error(`נותרה הפניית מודול ב-${file}: ${line}`);
  }
  return `\n/* ===== ${file} ===== */\n${out.trim()}\n`;
}

const pieces = MODULES.map((f) => ({ file: f, code: flatten(fs.readFileSync(path.join(HERE, f), 'utf8'), f) }));

// שם שמוגדר פעמיים ברמה העליונה שובר את הדף כולו בזמן ריצה — נעצר כאן
const seen = new Map();
const clashes = [];
for (const { file, code } of pieces) {
  for (const name of topLevelNames(code)) {
    if (seen.has(name) && seen.get(name) !== file) clashes.push(`${name} — ${seen.get(name)} וגם ${file}`);
    else seen.set(name, file);
  }
}
if (clashes.length) {
  throw new Error(`שמות שמוגדרים פעמיים אחרי האיחוד:\n  ${clashes.join('\n  ')}`);
}

const engine = pieces.map((p) => p.code).join('\n');

const template = fs.readFileSync(path.join(HERE, 'src/web/app.html'), 'utf8');
if (!template.includes('/*ENGINE*/')) throw new Error('התבנית חסרה את הסמן /*ENGINE*/');

const page = template.replace('/*ENGINE*/', engine);

fs.mkdirSync(path.join(HERE, 'dist'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'dist/app.html'), page, 'utf8');

// גרסת ארטיפקט: ללא עטיפת המסמך, שהמארח מוסיף בעצמו
const body = page
  .replace(/^[\s\S]*?<body[^>]*>/, '')
  .replace(/<\/body>[\s\S]*$/, '');
const head = page.match(/<title>[\s\S]*?<\/title>/)[0]
  + '\n' + (page.match(/<link[^>]*fonts\.googleapis[^>]*>/g) || []).join('\n')
  + '\n' + page.match(/<style>[\s\S]*?<\/style>/)[0];
fs.writeFileSync(path.join(HERE, 'dist/artifact.html'), `${head}\n${body.replace(/<style>[\s\S]*?<\/style>/, '')}`, 'utf8');

/*
 * אותו מסך, כמודול JavaScript.
 *
 * הפריסה לקצה מגישה את המסך מתוך הפונקציה עצמה ולא מדיסק, ולכן הוא חייב
 * להיות ניתן לייבוא. קובץ JS פשוט עובד גם ב-Node (לבדיקות) וגם בכל
 * מאגד — בלי להסתמך על הגדרה מיוחדת של אף אחד מהם.
 */
fs.writeFileSync(
  path.join(HERE, 'dist/app.page.js'),
  `// נוצר על ידי build.mjs — אין לערוך.\nexport default ${JSON.stringify(page)};\n`,
  'utf8',
);

const kb = (f) => (fs.statSync(path.join(HERE, f)).size / 1024).toFixed(0);
console.log(`נבנה dist/app.html (${kb('dist/app.html')}KB), dist/artifact.html (${kb('dist/artifact.html')}KB)`
  + ` ו-dist/app.page.js (${kb('dist/app.page.js')}KB)`);
