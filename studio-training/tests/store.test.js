/**
 * מסד הנתונים: שמירה, מיגרציה, שלמות, גיבוי ושחזור.
 * הנתונים של סטודיו הם התיק הרפואי והאימוני של הלקוחות שלו — אסור לאבד אותם.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { Db, SCHEMA_VERSION, migrate } from '../src/store/db.js';

const tmpFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stdb-')), name);

test('שמירה וטעינה משמרות את הנתונים במלואם', () => {
  const file = tmpFile('db.json');
  const db = new Db(file);
  db.putStudio({ id: 's1', name: 'סטודיו א', equipment: [{ item: 'dumbbell', count: 8 }] });
  db.putTrainee({ id: 't1', studioId: 's1', name: 'דנה', measurements: [{ date: '2026-01-01', weightKg: 70 }] });

  const reopened = new Db(file);
  assert.equal(reopened.getStudio('s1').name, 'סטודיו א');
  assert.equal(reopened.getTrainee('t1').measurements[0].weightKg, 70);
  assert.equal(reopened.data.meta.schemaVersion, SCHEMA_VERSION);
});

test('כתיבה אטומית: לא נשאר קובץ זמני, והקובץ תמיד JSON תקין', () => {
  const file = tmpFile('db.json');
  const db = new Db(file);
  for (let i = 0; i < 20; i++) db.putTrainee({ id: `t${i}`, studioId: 's', name: `מתאמן ${i}` });
  assert.ok(!fs.existsSync(`${file}.tmp`), 'נשאר קובץ זמני');
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')));
});

test('קובץ פגום נשמר בצד ולא נמחק', () => {
  const file = tmpFile('db.json');
  fs.writeFileSync(file, '{ תוכן פגום');
  const db = new Db(file);
  assert.deepEqual(db.data.studios, {}, 'המסד לא אותחל נקי');
  const rescued = fs.readdirSync(path.dirname(file)).filter((f) => f.includes('corrupt'));
  assert.equal(rescued.length, 1, 'הקובץ הפגום לא נשמר בצד');
  assert.match(fs.readFileSync(path.join(path.dirname(file), rescued[0]), 'utf8'), /פגום/);
});

test('מיגרציה מגרסה ישנה משלימה שדות בלי לאבד נתונים', () => {
  const old = {
    meta: { schemaVersion: 1 },
    studios: { s: { id: 's', name: 'ישן' } },
    trainees: { t: { id: 't', studioId: 's', name: 'ותיק', history: { bb_bench_press: { load: 60 } } } },
    programs: {}, events: [],
  };
  const migrated = migrate(structuredClone(old));
  assert.equal(migrated.meta.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.trainees.t.name, 'ותיק', 'נתון קיים אבד');
  assert.equal(migrated.trainees.t.history.bb_bench_press.load, 60, 'היסטוריה אבדה');
  assert.deepEqual(migrated.trainees.t.measurements, []);
  assert.deepEqual(migrated.trainees.t.notesLog, []);
});

test('בדיקת שלמות מזהה הפניות שבורות', () => {
  const db = new Db(tmpFile('db.json'));
  db.putAccount({ id: 'acc1', username: 'owner' });
  db.putStudio({ id: 's1', name: 'קיים', accountId: 'acc1' });
  db.putTrainee({ id: 'ok', studioId: 's1', name: 'תקין' });
  db.putTrainee({ id: 'bad', studioId: 'nope', name: 'יתום' });
  const r = db.check();
  assert.equal(r.ok, false);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0], /אינו קיים/);
  assert.equal(r.stats.trainees, 2);
});

test('סטודיו ללא חשבון בעלים נחשב תקלת שלמות — נתונים חייבים בעלים', () => {
  const db = new Db(tmpFile('db.json'));
  db.putStudio({ id: 's1', name: 'יתום' });
  const r = db.check();
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes('אין חשבון בעלים')));
});

test('בעלות על סטודיו נשמרת גם כשעדכון לא כולל אותה', () => {
  const db = new Db(tmpFile('db.json'));
  db.putAccount({ id: 'acc1', username: 'owner' });
  db.putStudio({ id: 's1', name: 'סטודיו', accountId: 'acc1' });
  db.putStudio({ id: 's1', name: 'סטודיו מעודכן' });
  assert.equal(db.getStudio('s1').accountId, 'acc1');
  assert.ok(db.ownsStudio('acc1', 's1'));
  assert.ok(!db.ownsStudio('acc2', 's1'));
  assert.ok(!db.ownsStudio(null, 's1'), 'בלי חשבון אין בעלות');
});

test('ייצוא וייבוא משחזרים מצב מלא, עם גיבוי אוטומטי', () => {
  const src = new Db(tmpFile('db.json'));
  src.putStudio({ id: 's1', name: 'מקור' });
  src.putTrainee({ id: 't1', studioId: 's1', name: 'לקוח', notesLog: [{ id: 'n', text: 'הערה', directive: { type: 'none' } }] });
  const payload = src.export();

  const dest = new Db(tmpFile('db.json'));
  dest.putStudio({ id: 'other', name: 'יעד' });
  const result = dest.import(payload);

  assert.equal(result.ok, true);
  assert.ok(result.backup && fs.existsSync(result.backup), 'לא נוצר גיבוי לפני הייבוא');
  assert.equal(dest.getStudio('s1').name, 'מקור');
  assert.equal(dest.getStudio('other'), null, 'ייבוא מלא היה אמור להחליף');
  assert.equal(dest.getTrainee('t1').notesLog[0].text, 'הערה');
});

test('ייבוא במיזוג שומר את הקיים ומוסיף את החדש', () => {
  const src = new Db(tmpFile('db.json'));
  src.putStudio({ id: 'new', name: 'חדש' });

  const dest = new Db(tmpFile('db.json'));
  dest.putStudio({ id: 'existing', name: 'קיים' });
  dest.import(src.export(), { merge: true });

  assert.equal(dest.getStudio('existing').name, 'קיים');
  assert.equal(dest.getStudio('new').name, 'חדש');
});

test('ייבוא של קובץ שאינו גיבוי נדחה לפני שנוגעים בנתונים', () => {
  const db = new Db(tmpFile('db.json'));
  db.putStudio({ id: 's', name: 'לא למחוק' });
  assert.throws(() => db.import({ something: 'else' }), /מבנה מוכר/);
  assert.equal(db.getStudio('s').name, 'לא למחוק', 'הנתונים נפגעו למרות שהייבוא נכשל');
});

test('איפוס מגבה קודם', () => {
  const db = new Db(tmpFile('db.json'));
  db.putStudio({ id: 's', name: 'לפני איפוס' });
  db.reset();
  assert.deepEqual(db.data.studios, {});
  const backups = fs.readdirSync(path.dirname(db.file)).filter((f) => f.endsWith('.bak'));
  assert.ok(backups.length >= 1, 'לא נוצר גיבוי לפני האיפוס');
});

test('יומן השינויים מתעד כל פעולה ואינו גדל בלי גבול', () => {
  const db = new Db(tmpFile('db.json'));
  db.putStudio({ id: 's', name: 'א' });
  db.putTrainee({ id: 't', studioId: 's', name: 'ב' });
  db.putTrainee({ id: 't', studioId: 's', name: 'ב מעודכן' });
  const actions = db.data.changelog.map((c) => c.action);
  assert.deepEqual(actions, ['studio_created', 'trainee_created', 'trainee_updated']);

  for (let i = 0; i < 5200; i++) db.log('noise', {});
  assert.ok(db.data.changelog.length <= 5000, `היומן גדל ל-${db.data.changelog.length}`);
});

test('ארכיון: היסטוריה שיובאה אינה נמחקת בגלל תכניות שנבנו', () => {
  const db = new Db(tmpFile('archive.json'));
  const traineeId = 'trainee_hist';

  // עשרים תכניות מהגיליון — ההיסטוריה האמיתית של הסטודיו
  for (let i = 0; i < 20; i++) {
    db.putSnapshot({
      id: `imp_${i}`, traineeId, studioId: 's', week: 0, at: '2025-01-01T00:00:00.000Z',
      reason: 'imported', sheetName: `לשונית ${i}`, daysPerWeek: 2, totalExercises: 6,
      program: { id: `p_imp_${i}`, traineeId, meta: { imported: true, sheet: `לשונית ${i}` },
        days: [{ index: 1, blocks: [{ exercise: { id: `ex_${i}` }, prescription: { sets: 3 } }] }] },
    });
  }
  // ואז עשרים בנייה שוטפת, שאמורות לגזום רק את עצמן
  for (let i = 0; i < 20; i++) {
    db.putSnapshot({
      id: `gen_${i}`, traineeId, studioId: 's', week: i + 1, at: `2025-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      reason: 'generated', daysPerWeek: 3, totalExercises: 9,
      program: { id: `p_gen_${i}`, traineeId,
        days: [{ index: 1, blocks: [{ exercise: { id: `gen_ex_${i}` }, prescription: { sets: 4 } }] }] },
    });
  }

  const all = db.listSnapshots(traineeId);
  const imported = all.filter((s) => s.reason === 'imported');
  const generated = all.filter((s) => s.reason === 'generated');
  assert.equal(imported.length, 20, 'היסטוריה שיובאה נמחקה');
  assert.equal(generated.length, 12, 'תכניות שנבנו לא נגזמו');

  // סדר יציב: אותו תאריך בדיוק, ובכל זאת סדר קבוע לפי סדר הכניסה
  const sameDay = imported.map((s) => s.id);
  assert.deepEqual(sameDay, db.listSnapshots(traineeId).filter((s) => s.reason === 'imported').map((s) => s.id));
  assert.equal(sameDay[0], 'imp_19', 'האחרון שנכנס אינו ראשון ברשימה');
});

/*
 * שלמות התוצר.
 *
 * הבדיקות מריצות מודולים בודדים, והדפדפן מריץ קובץ אחד מאוחד. שגיאה
 * שנולדת רק באיחוד — שם שהוגדר פעמיים בשני מודולים, קוד שנפל לתוך
 * אובייקט — עברה בעבר את כל הבדיקות ונחתה אצל המשתמש כמסך לבן.
 */
test('הדף הבנוי הוא קוד תקין ומכיל את כל המודולים', () => {
  const file = path.join(process.cwd(), 'dist/app.html');
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length, 'אין קוד בתוצר');
  for (const code of scripts) {
    assert.doesNotThrow(() => new Function(code), 'התוצר אינו קוד תקין');
  }
  // פונקציות שהמסכים נשענים עליהן חייבות להימצא בתוצר, לא רק במקור
  for (const name of ['reviewAll', 'auditTrainee', 'auditProgramFit', 'inferTrainingPreferences']) {
    assert.ok(html.includes(`function ${name}`), `${name} אינו נכלל בתוצר`);
  }
});
