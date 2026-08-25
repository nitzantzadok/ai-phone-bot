/**
 * שרת HTTP קל לניהול הסטודיו — ללא תלויות חיצוניות.
 * מגיש API למאמן ואת מסך האימון (public/trainer.html).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONSTRAINTS } from '../domain/constraints.js';
import { EXERCISES } from '../domain/exercises.js';
import { normalizeStudio, normalizeTrainee, validateInput } from '../domain/models.js';
import { EQUIPMENT, GOALS, LEVELS, MUSCLES, SPLITS } from '../domain/taxonomy.js';
import { generateWeeklyProgram, swapExercise } from '../engine/generate.js';
import { advanceWeek, applyFeedback } from '../engine/feedback.js';
import { buildProbes } from '../engine/probe.js';
import { normalizeCustomExercise } from '../domain/models.js';
import { EQUIPMENT_CATEGORIES, EQUIPMENT_LABELS, equipmentList } from '../domain/labels.js';
import { identifyEquipment, visionAvailable } from './vision.js';
import { Db } from '../store/db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(HERE, '../web');
const DIST_DIR = path.resolve(HERE, '../../dist');
const db = new Db();

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 2_000_000) { reject(new Error('גוף בקשה גדול מדי')); req.destroy(); }
  });
  req.on('end', () => {
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON לא תקין')); }
  });
  req.on('error', reject);
});

/** מרכיב מתאמן+סטודיו מהמסד לפי מזהי בקשה. */
function resolvePair(body) {
  const rawTrainee = body.trainee || db.getTrainee(body.traineeId);
  if (!rawTrainee) throw new Error('מתאמן לא נמצא');
  const rawStudio = body.studio || db.getStudio(body.studioId || rawTrainee.studioId);
  if (!rawStudio) throw new Error('סטודיו לא נמצא');
  return { trainee: normalizeTrainee(rawTrainee), studio: normalizeStudio(rawStudio), rawTrainee };
}

const routes = {
  'GET /api/health': async () => ({ ok: true, exercises: EXERCISES.length, time: new Date().toISOString() }),

  'GET /api/meta': async () => ({
    goals: GOALS, levels: LEVELS, splits: SPLITS, equipment: EQUIPMENT, muscles: MUSCLES,
    constraints: Object.entries(CONSTRAINTS).map(([id, c]) => ({ id, name: c.name, region: c.region, note: c.note })),
    exercises: EXERCISES.map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, primary: e.primary, type: e.type })),
  }),

  'GET /api/studios': async () => db.listStudios(),

  /**
   * רישום סטודיו — השלב הראשון בתהליך.
   * מקבל את כל מה שהמערכת צריכה לדעת על המקום, מאמת, ומחזיר
   * גם רשימה של מה שחסר כדי שהרישום יהיה שלם.
   */
  'POST /api/studios': async (body) => {
    if (!body.name) throw new Error('חובה למלא שם סטודיו');
    const id = body.id || slug(body.name);
    const studio = { ...body, id };
    const normalized = normalizeStudio(studio);
    db.putStudio(studio);
    return {
      ok: true,
      id,
      summary: studioSummary(normalized),
      missing: missingStudioInfo(normalized),
    };
  },

  'GET /api/equipment/catalog': async () => ({
    /** קטלוג הציוד לצ׳קליסט, מקובץ לקטגוריות שאדם חושב בהן. */
    categories: EQUIPMENT_CATEGORIES.map((c) => ({
      key: c.key, label: c.label,
      items: c.items.map((id) => ({ id, label: EQUIPMENT_LABELS[id] || id })),
    })),
    vision: await visionAvailable(),
  }),

  /** זיהוי ציוד מתמונה — הצעה בלבד, בעל הסטודיו מאשר. */
  'POST /api/equipment/identify': async (body) => {
    const images = (body.images || []).map((img) => {
      const m = String(img).match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!m) throw new Error('פורמט תמונה לא נתמך — נדרש data URL של תמונה');
      if (m[2].length > 7_000_000) throw new Error('התמונה גדולה מדי; יש לצלם בפחות פירוט');
      return { mediaType: m[1], base64: m[2] };
    });
    if (!images.length) throw new Error('לא צורפה תמונה');
    try {
      return { ok: true, ...(await identifyEquipment(images)) };
    } catch (err) {
      return { ok: false, code: err.code || 'error', error: err.message, fallback: 'checklist' };
    }
  },

  /** שמירת תמונת ציוד כתיעוד, בין אם זוהתה אוטומטית ובין אם לא. */
  'POST /api/equipment/photo': async (body) => {
    if (!body.studioId || !body.dataUrl) throw new Error('נדרשים מזהה סטודיו ותמונה');
    const photo = db.putPhoto({ studioId: body.studioId, item: body.item || null, dataUrl: body.dataUrl, note: body.note || '' });
    return { ok: true, id: photo.id };
  },
  'GET /api/equipment/photos': async (_b, url) => db.photosFor(url.searchParams.get('studioId')),

  'GET /api/trainees': async (_b, url) => db.listTrainees(url.searchParams.get('studioId')),
  /**
   * רישום מתאמן על ידי בעל הסטודיו — השלב השני בתהליך.
   * מאמת מיד, ומחזיר גם את התכנית הראשונה כדי שהרישום יסתיים במשהו שימושי.
   */
  'POST /api/trainees': async (body) => {
    if (!body.name) throw new Error('חובה למלא שם מתאמן');
    if (!body.studioId || !db.getStudio(body.studioId)) throw new Error('יש לבחור סטודיו קיים');
    const id = body.id || `${slug(body.name)}_${Math.random().toString(36).slice(2, 6)}`;
    const stored = { ...body, id };
    const trainee = normalizeTrainee(stored);
    const studio = normalizeStudio(db.getStudio(body.studioId));
    const v = validateInput(trainee, studio);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };

    db.putTrainee(stored);
    const program = generateWeeklyProgram(trainee, studio);
    program.warnings = v.warnings;
    db.putProgram(program);
    return { ok: true, id, warnings: v.warnings, program };
  },

  'GET /api/trainee': async (_b, url) => {
    const t = db.getTrainee(url.searchParams.get('id'));
    if (!t) throw new Error('מתאמן לא נמצא');
    const trainee = normalizeTrainee(t);
    const studio = normalizeStudio(db.getStudio(t.studioId));
    return {
      trainee,
      probes: buildProbes(trainee, studio),
      history: db.history({ traineeId: trainee.id }).slice(-50),
    };
  },

  /** תרגיל שהמאמן כותב בעצמו — נשמר כטיוטה עד שנבדק בשטח. */
  'POST /api/custom-exercise': async (body) => {
    const raw = db.getTrainee(body.traineeId);
    if (!raw) throw new Error('מתאמן לא נמצא');
    if (!body.name) throw new Error('חובה למלא שם תרגיל');
    const custom = normalizeCustomExercise({ ...body, createdAt: new Date().toISOString() });
    raw.customExercises = [...(raw.customExercises || []).filter((c) => c.id !== custom.id), custom];
    db.putTrainee(raw);
    if (body.alsoToStudioLibrary) {
      const studio = db.getStudio(raw.studioId);
      studio.customExercises = [...(studio.customExercises || []).filter((c) => c.id !== custom.id), custom];
      db.putStudio(studio);
    }
    db.log('custom_exercise_added', { traineeId: raw.id, exerciseId: custom.id, name: custom.name });
    return { ok: true, exercise: custom };
  },

  /** תוצאת בדיקה של תרגיל — מותאם או תרגיל בדיקה באזור פציעה. */
  'POST /api/exercise-trial': async (body) => {
    const raw = db.getTrainee(body.traineeId);
    if (!raw) throw new Error('מתאמן לא נמצא');
    const type = body.result === 'ok'
      ? (body.kind === 'custom' ? 'custom_tested_ok' : 'probe_ok')
      : (body.kind === 'custom' ? 'custom_tested_failed' : 'probe_pain');
    const ev = { type, exerciseId: body.exerciseId, payload: body.payload || {}, traineeId: raw.id };
    db.addEvent(ev);
    const { trainee, changes } = applyFeedback(normalizeTrainee(raw), [ev]);
    db.putTrainee({ ...raw, ...trainee });
    db.log('exercise_trial', { traineeId: raw.id, exerciseId: body.exerciseId, result: body.result });
    return { ok: true, changes };
  },

  'POST /api/programs/generate': async (body) => {
    const { trainee, studio } = resolvePair(body);
    const v = validateInput(trainee, studio);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    const program = generateWeeklyProgram(trainee, studio, { seed: body.seed });
    program.warnings = v.warnings;
    db.putProgram(program);
    return { ok: true, program };
  },

  'POST /api/programs/generate-all': async (body) => {
    const studio = normalizeStudio(db.getStudio(body.studioId) || body.studio);
    const trainees = db.listTrainees(studio.id);
    const results = trainees.map((rt) => {
      const trainee = normalizeTrainee(rt);
      const v = validateInput(trainee, studio);
      if (!v.ok) return { traineeId: trainee.id, name: trainee.name, ok: false, errors: v.errors };
      const program = generateWeeklyProgram(trainee, studio);
      program.warnings = v.warnings;
      db.putProgram(program);
      return { traineeId: trainee.id, name: trainee.name, ok: true, programId: program.id, qa: program.qa };
    });
    return { ok: true, studio: studio.id, count: results.length, results };
  },

  'GET /api/programs': async (_b, url) => db.listPrograms(url.searchParams.get('traineeId')).map((p) => ({
    id: p.id, traineeId: p.traineeId, traineeName: p.traineeName, week: p.week, qa: p.qa.score,
  })),

  'POST /api/programs/swap': async (body) => {
    const program = db.getProgram(body.programId);
    if (!program) throw new Error('תכנית לא נמצאה');
    const { trainee, studio } = resolvePair({ traineeId: program.traineeId, studioId: program.studioId });
    swapExercise(program, trainee, studio, {
      dayIndex: body.dayIndex, blockIndex: body.blockIndex, alternativeId: body.alternativeId,
    });
    db.putProgram(program);
    return { ok: true, program };
  },

  'POST /api/feedback': async (body) => {
    const events = (body.events || []).map((e) => ({ ...e, traineeId: body.traineeId, week: body.week }));
    for (const e of events) db.addEvent(e);
    const raw = db.getTrainee(body.traineeId);
    if (!raw) throw new Error('מתאמן לא נמצא');
    const trainee = normalizeTrainee(raw);
    const { trainee: updated, changes, flags } = applyFeedback(trainee, events);
    db.putTrainee({ ...raw, ...updated });
    return { ok: true, changes, flags };
  },

  // --- ניהול מסד הנתונים
  'GET /api/db/stats': async () => db.check(),
  'GET /api/db/export': async () => db.export(),
  'POST /api/db/import': async (body) => db.import(body.payload || body, { merge: !!body.merge }),
  'POST /api/db/backup': async () => ({ ok: true, file: db.backup('manual'), stats: db.stats() }),

  'POST /api/studios/delete': async (body) => {
    const studio = db.getStudio(body.id);
    if (!studio) throw new Error('סטודיו לא נמצא');
    const trainees = db.listTrainees(body.id);
    if (trainees.length && !body.force) {
      throw new Error(`לסטודיו משויכים ${trainees.length} מתאמנים. יש להעביר אותם או לאשר מחיקה מלאה.`);
    }
    db.backup('pre-delete');
    for (const t of trainees) delete db.data.trainees[t.id];
    delete db.data.studios[body.id];
    db.log('studio_deleted', { studioId: body.id, traineesRemoved: trainees.length });
    db.save();
    return { ok: true, removedTrainees: trainees.length };
  },

  'POST /api/trainees/delete': async (body) => {
    const t = db.getTrainee(body.id);
    if (!t) throw new Error('מתאמן לא נמצא');
    db.backup('pre-delete');
    delete db.data.trainees[body.id];
    for (const p of db.listPrograms(body.id)) delete db.data.programs[p.id];
    db.log('trainee_deleted', { traineeId: body.id });
    db.save();
    return { ok: true };
  },

  'POST /api/next-week': async (body) => {
    const raw = db.getTrainee(body.traineeId);
    if (!raw) throw new Error('מתאמן לא נמצא');
    const events = db.eventsFor(body.traineeId, body.week ?? null);
    const trainee = normalizeTrainee(raw);
    const { trainee: afterFeedback, changes, flags } = applyFeedback(trainee, events);
    const next = advanceWeek(afterFeedback, flags);
    db.putTrainee({ ...raw, ...next });
    const studio = normalizeStudio(db.getStudio(raw.studioId));
    const program = generateWeeklyProgram(next, studio);
    db.putProgram(program);
    return { ok: true, changes, flags, program };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  try {
    if (routes[key]) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      return json(res, 200, await routes[key](body, url));
    }
    if (url.pathname === '/api/program' && req.method === 'GET') {
      const p = db.getProgram(url.searchParams.get('id'));
      return p ? json(res, 200, p) : json(res, 404, { error: 'תכנית לא נמצאה' });
    }
    // קבצים סטטיים: מסך המאמן הבנוי, ואחריו קבצי המקור
    const file = url.pathname === '/' ? 'app.html' : path.basename(url.pathname);
    const candidates = [path.join(DIST_DIR, file), path.join(WEB_DIR, file)];
    const full = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!full && url.pathname === '/') {
      return json(res, 503, { error: 'מסך המאמן טרם נבנה. הרץ: npm run build' });
    }
    if (full) {
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
      res.writeHead(200, { 'content-type': types[path.extname(full)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(full));
    }
    return json(res, 404, { error: 'לא נמצא' });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
});

/** מזהה קריא מתוך שם בעברית. */
function slug(name) {
  const clean = String(name).trim().replace(/\s+/g, '_').replace(/[^\w\u0590-\u05FF_-]/g, '');
  return clean || `s_${Math.random().toString(36).slice(2, 8)}`;
}

function studioSummary(studio) {
  return {
    id: studio.id, name: studio.name, style: studio.style,
    equipmentCount: studio.equipment.size,
    equipment: equipmentList([...studio.equipment.keys()].slice(0, 12)),
    concurrentTrainees: studio.concurrentTrainees,
    trainersOnFloor: studio.trainersOnFloor,
  };
}

/** מה עוד כדאי למלא כדי שהתכניות יהיו מדויקות. */
function missingStudioInfo(studio) {
  const missing = [];
  if (studio.equipment.size <= 1) missing.push('לא נבחר ציוד — התכניות ייבנו ממשקל גוף בלבד.');
  if (!studio.dumbbellMaxKg && studio.equipment.get('dumbbell')) {
    missing.push('לא הוגדר המשקל הכבד ביותר של המשקולות — בלעדיו אי אפשר לדעת מתי מתאמן הגיע לתקרה.');
  }
  if (!studio.ceilingHeightCm) missing.push('לא הוגדר גובה תקרה — משפיע על לחיצות מעל הראש ועל קפיצות.');
  if (!studio.trainersOnFloor) missing.push('לא הוגדר מספר מאמנים במקביל — משפיע על מורכבות התרגילים שיוצעו.');
  if (!studio.sessionMinutes) missing.push('לא הוגדר אורך אימון סטנדרטי.');
  return missing;
}

const PORT = process.env.PORT || 4310;
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`מערכת תכניות האימון פועלת: http://localhost:${PORT}`));
}

export { server, db };
