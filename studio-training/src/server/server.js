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
  'POST /api/studios': async (body) => { db.putStudio(body); return { ok: true, id: body.id }; },

  'GET /api/trainees': async (_b, url) => db.listTrainees(url.searchParams.get('studioId')),
  'POST /api/trainees': async (body) => {
    const t = normalizeTrainee(body);
    const stored = { ...body, id: t.id };
    db.putTrainee(stored);
    return { ok: true, id: t.id };
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

const PORT = process.env.PORT || 4310;
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`מערכת תכניות האימון פועלת: http://localhost:${PORT}`));
}

export { server, db };
