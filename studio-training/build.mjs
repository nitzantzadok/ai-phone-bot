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

/** הופך מודול ES לקטע קוד שטוח: בלי import, בלי export, בלי בלוקי CLI. */
function flatten(source, file) {
  let out = source;

  // 1. ייבוא — בכל צורותיו
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

const engine = MODULES
  .map((f) => flatten(fs.readFileSync(path.join(HERE, f), 'utf8'), f))
  .join('\n');

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

const kb = (f) => (fs.statSync(path.join(HERE, f)).size / 1024).toFixed(0);
console.log(`נבנה dist/app.html (${kb('dist/app.html')}KB) ו-dist/artifact.html (${kb('dist/artifact.html')}KB)`);
