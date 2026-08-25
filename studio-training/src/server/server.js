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
import {
  clearCookie, hashPassword, isLockedOut, newAccountId, newSessionToken, normalizeUsername,
  readCookie, sessionCookie, SESSION_TTL_MS, sessionValid, validatePassword, validateUsername,
  verifyPassword,
} from '../store/auth.js';
import {
  exerciseHistory, groupSessions, historySummary, normalizeLogEntry, personalBests, programSnapshot,
  SESSION_EVENTS,
} from '../domain/history.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(HERE, '../web');
const DIST_DIR = path.resolve(HERE, '../../dist');
const db = new Db();

const json = (res, code, body, headers = {}) => {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    // התשובות אישיות לחשבון — אין להן מה להישמר במטמון של דפדפן או פרוקסי
    'cache-control': 'no-store',
    ...headers,
  });
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
function resolvePair(body, ctx) {
  // גוף הבקשה לא יכול להביא איתו מתאמן או סטודיו "מבחוץ" —
  // תמיד קוראים מהמסד ותמיד מאמתים בעלות.
  const rawTrainee = requireTrainee(ctx, body.traineeId || body.trainee?.id);
  const rawStudio = requireStudio(ctx, body.studioId || rawTrainee.studioId);
  return { trainee: normalizeTrainee(rawTrainee), studio: normalizeStudio(rawStudio), rawTrainee };
}

/** נתיבים שאינם דורשים התחברות. כל השאר סגור כברירת מחדל. */
const PUBLIC = new Set([
  'GET /api/health', 'GET /api/meta',
  'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout', 'GET /api/auth/me',
]);

const isSecure = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

/** מזהה את החשבון מהעוגייה. מחזיר null כשאין מושב תקף — בלי לזרוק. */
function resolveAccount(req) {
  const token = readCookie(req.headers.cookie);
  const session = db.getSession(token);
  if (!sessionValid(session)) {
    if (session) db.dropSession(token);
    return null;
  }
  const account = db.getAccount(session.accountId);
  return account ? { account, token, session } : null;
}

/** מה שמותר להחזיר על חשבון — בלי גיבוב, בלי מלח. */
const publicAccount = (a) => ({
  id: a.id, username: a.username, studioName: a.studioName || '', contact: a.contact || '',
  createdAt: a.createdAt, lastLoginAt: a.lastLoginAt || null, role: a.role || 'owner',
});

/** בעלות מאומתת על סטודיו, או שגיאה. אין מסלול שלישי. */
function requireStudio(ctx, studioId) {
  if (!studioId) throw new Error('לא נבחר סטודיו');
  if (!db.ownsStudio(ctx.account.id, studioId)) throw notFound('סטודיו לא נמצא');
  return db.getStudio(studioId);
}

/** בעלות מאומתת על מתאמן. */
function requireTrainee(ctx, traineeId) {
  if (!traineeId) throw new Error('לא נבחר מתאמן');
  if (!db.ownsTrainee(ctx.account.id, traineeId)) throw notFound('מתאמן לא נמצא');
  return db.getTrainee(traineeId);
}

/**
 * חשוב: כשהמשאב שייך לחשבון אחר מחזירים "לא נמצא" ולא "אין הרשאה".
 * ההבדל נשמע סמנטי, אבל "אין הרשאה" מאשר לזר שהמזהה קיים.
 */
function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

const authRoutes = {
  /**
   * הרשמת סטודיו חדש. זה השלב שלפני כל השאר: בלי חשבון אין נתונים,
   * ולכל חשבון יש מרחב נתונים משלו שאף חשבון אחר לא רואה.
   */
  'POST /api/auth/register': async (body, _url, ctx) => {
    const u = validateUsername(body.username);
    if (!u.ok) return { ok: false, errors: u.errors };
    const p = validatePassword(body.password);
    if (!p.ok) return { ok: false, errors: p.errors };
    if (db.accountByUsername(u.username)) {
      return { ok: false, errors: ['שם המשתמש הזה כבר תפוס.'] };
    }

    const account = {
      id: newAccountId(),
      username: u.username,
      ...hashPassword(body.password),
      studioName: String(body.studioName || '').trim(),
      contact: String(body.contact || '').trim(),
      role: 'owner',
      createdAt: new Date().toISOString(),
      failedAttempts: [],
    };
    db.putAccount(account);
    db.log('account_created', { accountId: account.id });

    const token = startSession(account, ctx);
    return { ok: true, account: publicAccount(account), studios: [] };
  },

  'POST /api/auth/login': async (body, _url, ctx) => {
    const username = normalizeUsername(body.username);
    const account = db.accountByUsername(username);

    // תשובה אחידה בין "אין משתמש" ל"סיסמה שגויה" — אחרת אפשר למפות משתמשים
    const generic = { ok: false, errors: ['שם משתמש או סיסמה שגויים.'] };
    if (!account) return generic;
    if (isLockedOut(account)) {
      return { ok: false, errors: ['יותר מדי ניסיונות כושלים. נסה שוב בעוד רבע שעה.'] };
    }
    if (!verifyPassword(String(body.password || ''), account)) {
      account.failedAttempts = [...(account.failedAttempts || []), new Date().toISOString()].slice(-20);
      db.putAccount(account);
      return generic;
    }

    account.failedAttempts = [];
    account.lastLoginAt = new Date().toISOString();
    db.putAccount(account);
    startSession(account, ctx);
    return {
      ok: true,
      account: publicAccount(account),
      studios: db.listStudiosFor(account.id).map((st) => ({ id: st.id, name: st.name })),
    };
  },

  'POST /api/auth/logout': async (_body, _url, ctx) => {
    if (ctx.token) db.dropSession(ctx.token);
    ctx.setCookie = clearCookie({ secure: isSecure(ctx.req) });
    return { ok: true };
  },

  'GET /api/auth/me': async (_body, _url, ctx) => (ctx.account
    ? {
      ok: true,
      account: publicAccount(ctx.account),
      studios: db.listStudiosFor(ctx.account.id).map((st) => ({ id: st.id, name: st.name })),
    }
    : { ok: false, anonymous: true }),

  /** החלפת סיסמה — דורשת את הסיסמה הנוכחית, גם כשהמשתמש כבר מחובר. */
  'POST /api/auth/password': async (body, _url, ctx) => {
    if (!ctx.account) throw notFound('לא מחובר');
    if (!verifyPassword(String(body.current || ''), ctx.account)) {
      return { ok: false, errors: ['הסיסמה הנוכחית שגויה.'] };
    }
    const p = validatePassword(body.next);
    if (!p.ok) return { ok: false, errors: p.errors };
    Object.assign(ctx.account, hashPassword(body.next), { passwordChangedAt: new Date().toISOString() });
    db.putAccount(ctx.account);
    // כל המושבים האחרים מתבטלים — זו כל הנקודה בהחלפת סיסמה
    for (const [t, sess] of Object.entries(db.data.sessions)) {
      if (sess.accountId === ctx.account.id && t !== ctx.token) db.dropSession(t);
    }
    db.log('password_changed', { accountId: ctx.account.id });
    return { ok: true };
  },
};

/** פתיחת מושב וקביעת העוגייה על התשובה הנוכחית. */
function startSession(account, ctx) {
  const token = newSessionToken();
  db.putSession(token, {
    accountId: account.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  ctx.setCookie = sessionCookie(token, { secure: isSecure(ctx.req) });
  ctx.token = token;
  ctx.account = account;
  return token;
}

const routes = {
  'GET /api/health': async () => ({ ok: true, exercises: EXERCISES.length, time: new Date().toISOString() }),

  'GET /api/meta': async () => ({
    goals: GOALS, levels: LEVELS, splits: SPLITS, equipment: EQUIPMENT, muscles: MUSCLES,
    constraints: Object.entries(CONSTRAINTS).map(([id, c]) => ({ id, name: c.name, region: c.region, note: c.note })),
    exercises: EXERCISES.map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, primary: e.primary, type: e.type })),
  }),

  'GET /api/studios': async (_b, _url, ctx) => db.listStudiosFor(ctx.account.id),

  /**
   * רישום סטודיו — השלב הראשון בתהליך.
   * מקבל את כל מה שהמערכת צריכה לדעת על המקום, מאמת, ומחזיר
   * גם רשימה של מה שחסר כדי שהרישום יהיה שלם.
   */
  'POST /api/studios': async (body, _url, ctx) => {
    if (!body.name) throw new Error('חובה למלא שם סטודיו');
    const id = body.id || slug(body.name);
    // עדכון סטודיו קיים מותר רק לבעליו; מזהה שתפוס בחשבון אחר נחסם
    if (db.getStudio(id) && !db.ownsStudio(ctx.account.id, id)) {
      throw new Error('המזהה הזה כבר בשימוש. בחר שם אחר לסטודיו.');
    }
    const studio = { ...body, id, accountId: ctx.account.id };
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
  'POST /api/equipment/photo': async (body, _url, ctx) => {
    if (!body.dataUrl) throw new Error('נדרשת תמונה');
    requireStudio(ctx, body.studioId);
    const photo = db.putPhoto({ studioId: body.studioId, item: body.item || null, dataUrl: body.dataUrl, note: body.note || '' });
    return { ok: true, id: photo.id };
  },
  'GET /api/equipment/photos': async (_b, url, ctx) => {
    const studio = requireStudio(ctx, url.searchParams.get('studioId'));
    return db.photosFor(studio.id);
  },

  'GET /api/trainees': async (_b, url, ctx) => db.listTraineesFor(ctx.account.id, url.searchParams.get('studioId') || null),
  /**
   * רישום מתאמן על ידי בעל הסטודיו — השלב השני בתהליך.
   * מאמת מיד, ומחזיר גם את התכנית הראשונה כדי שהרישום יסתיים במשהו שימושי.
   */
  'POST /api/trainees': async (body, _url, ctx) => {
    if (!body.name) throw new Error('חובה למלא שם מתאמן');
    const rawStudio = requireStudio(ctx, body.studioId);
    if (body.id && db.getTrainee(body.id)) requireTrainee(ctx, body.id);
    const id = body.id || `${slug(body.name)}_${Math.random().toString(36).slice(2, 6)}`;
    const stored = { ...body, id };
    const trainee = normalizeTrainee(stored);
    const studio = normalizeStudio(rawStudio);
    const v = validateInput(trainee, studio);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };

    db.putTrainee(stored);
    const program = generateWeeklyProgram(trainee, studio);
    program.warnings = v.warnings;
    archive(program, 'registered');
    return { ok: true, id, warnings: v.warnings, program };
  },

  'GET /api/trainee': async (_b, url, ctx) => {
    const t = requireTrainee(ctx, url.searchParams.get('id'));
    const trainee = normalizeTrainee(t);
    const studio = normalizeStudio(db.getStudio(t.studioId));
    return {
      trainee,
      probes: buildProbes(trainee, studio),
      history: db.history({ traineeId: trainee.id }).slice(-50),
    };
  },

  /** תרגיל שהמאמן כותב בעצמו — נשמר כטיוטה עד שנבדק בשטח. */
  'POST /api/custom-exercise': async (body, _url, ctx) => {
    const raw = requireTrainee(ctx, body.traineeId);
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
  'POST /api/exercise-trial': async (body, _url, ctx) => {
    const raw = requireTrainee(ctx, body.traineeId);
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

  'POST /api/programs/generate': async (body, _url, ctx) => {
    const { trainee, studio } = resolvePair(body, ctx);
    const v = validateInput(trainee, studio);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    const program = generateWeeklyProgram(trainee, studio, { seed: body.seed });
    program.warnings = v.warnings;
    archive(program, body.reason || 'generated');
    return { ok: true, program };
  },

  'POST /api/programs/generate-all': async (body, _url, ctx) => {
    const studio = normalizeStudio(requireStudio(ctx, body.studioId));
    const trainees = db.listTraineesFor(ctx.account.id, studio.id);
    const results = trainees.map((rt) => {
      const trainee = normalizeTrainee(rt);
      const v = validateInput(trainee, studio);
      if (!v.ok) return { traineeId: trainee.id, name: trainee.name, ok: false, errors: v.errors };
      const program = generateWeeklyProgram(trainee, studio);
      program.warnings = v.warnings;
      archive(program, 'generated_batch');
      return { traineeId: trainee.id, name: trainee.name, ok: true, programId: program.id, qa: program.qa };
    });
    return { ok: true, studio: studio.id, count: results.length, results };
  },

  'GET /api/programs': async (_b, url, ctx) => {
    const t = requireTrainee(ctx, url.searchParams.get('traineeId'));
    return db.listPrograms(t.id).map((p) => ({
      id: p.id, traineeId: p.traineeId, traineeName: p.traineeName, week: p.week, qa: p.qa.score,
    }));
  },

  'POST /api/programs/swap': async (body, _url, ctx) => {
    const program = db.getProgram(body.programId);
    if (!program) throw notFound('תכנית לא נמצאה');
    requireTrainee(ctx, program.traineeId);
    const { trainee, studio } = resolvePair({ traineeId: program.traineeId, studioId: program.studioId }, ctx);
    swapExercise(program, trainee, studio, {
      dayIndex: body.dayIndex, blockIndex: body.blockIndex, alternativeId: body.alternativeId,
    });
    archive(program, 'exercise_swapped');
    return { ok: true, program };
  },

  'POST /api/feedback': async (body, _url, ctx) => {
    const raw = requireTrainee(ctx, body.traineeId);
    const events = (body.events || []).map((e) => ({ ...e, traineeId: body.traineeId, week: body.week }));
    for (const e of events) db.addEvent(e);
    // כל אירוע שהוא רישום אמיתי מהשטח נכנס גם ליומן האימונים הקבוע
    const logEntries = events.filter((e) => SESSION_EVENT_TYPES.has(e.type)).map((e) => normalizeLogEntry({
      ...e, traineeId: raw.id, week: body.week, programId: body.programId,
      dayLabel: e.dayLabel, exerciseName: e.exerciseName,
    }));
    if (logEntries.length) db.appendLog(raw.id, logEntries);
    const trainee = normalizeTrainee(raw);
    const { trainee: updated, changes, flags } = applyFeedback(trainee, events);
    db.putTrainee({ ...raw, ...updated });
    return { ok: true, changes, flags };
  },

  // --- ניהול מסד הנתונים
  /** סטטיסטיקה על מה ששייך לחשבון הזה בלבד. */
  'GET /api/db/stats': async (_b, _url, ctx) => {
    const studios = db.listStudiosFor(ctx.account.id);
    const trainees = db.listTraineesFor(ctx.account.id);
    const full = db.check();
    return {
      ok: full.ok,
      issues: full.issues.filter((i) => studios.some((st) => i.includes(st.id)) || trainees.some((t) => i.includes(t.id))),
      stats: {
        studios: studios.length,
        trainees: trainees.length,
        programs: trainees.reduce((n, t) => n + db.listPrograms(t.id).length, 0),
        snapshots: trainees.reduce((n, t) => n + db.listSnapshots(t.id).length, 0),
        measurements: trainees.reduce((n, t) => n + (t.measurements?.length || 0), 0),
        loggedSets: trainees.reduce((n, t) => n + db.sessionLog(t.id).filter((e) => e.type === 'log_set').length, 0),
        savedAt: db.data.meta?.savedAt || null,
        schemaVersion: db.data.meta?.schemaVersion,
      },
    };
  },
  /** ייצוא של החשבון בלבד — אף פעם לא של המסד כולו. */
  'GET /api/db/export': async (_b, _url, ctx) => db.export(ctx.account.id),
  'POST /api/db/import': async (body, _url, ctx) => importForAccount(body.payload || body, ctx),
  'POST /api/db/backup': async () => ({ ok: true, file: db.backup('manual') }),

  'POST /api/studios/delete': async (body, _url, ctx) => {
    const studio = requireStudio(ctx, body.id);
    const trainees = db.listTraineesFor(ctx.account.id, studio.id);
    if (trainees.length && !body.force) {
      throw new Error(`לסטודיו משויכים ${trainees.length} מתאמנים. יש להעביר אותם או לאשר מחיקה מלאה.`);
    }
    db.backup('pre-delete');
    for (const t of trainees) {
      for (const sn of db.listSnapshots(t.id)) delete db.data.snapshots[sn.id];
      delete db.data.trainees[t.id];
    }
    delete db.data.studios[body.id];
    db.log('studio_deleted', { studioId: body.id, traineesRemoved: trainees.length });
    db.save();
    return { ok: true, removedTrainees: trainees.length };
  },

  'POST /api/trainees/delete': async (body, _url, ctx) => {
    requireTrainee(ctx, body.id);
    db.backup('pre-delete');
    // ההיסטוריה נמחקת יחד עם המתאמן — אחרת נשאר מידע אישי בלי בעלים
    for (const sn of db.listSnapshots(body.id)) delete db.data.snapshots[sn.id];
    delete db.data.trainees[body.id];
    for (const p of db.listPrograms(body.id)) delete db.data.programs[p.id];
    db.log('trainee_deleted', { traineeId: body.id });
    db.save();
    return { ok: true };
  },

  // --- היסטוריה: כל תכנית שהייתה, וכל מה שבאמת בוצע
  /**
   * תמונת ההיסטוריה של מתאמן: סיכום, רשימת האימונים שבוצעו,
   * ארכיון התכניות והשיאים האישיים. הכול בקריאה אחת כי המסך מציג הכול יחד.
   */
  'GET /api/history': async (_b, url, ctx) => {
    const t = requireTrainee(ctx, url.searchParams.get('traineeId'));
    const log = db.sessionLog(t.id);
    const snaps = db.listSnapshots(t.id);
    return {
      ok: true,
      traineeId: t.id,
      traineeName: t.name,
      summary: historySummary(log, snaps),
      sessions: groupSessions(log).slice(0, +(url.searchParams.get('limit') || 60)),
      bests: personalBests(log).slice(0, 20),
      /** רשימת התכניות בלי הגוף המלא — הגוף נשלף רק כשפותחים תכנית מסוימת. */
      programs: snaps.map(({ program, ...meta }) => meta),
    };
  },

  /** פתיחת תכנית מהארכיון, בדיוק כפי שהמאמן ראה אותה אז. */
  'GET /api/history/program': async (_b, url, ctx) => {
    const snap = db.getSnapshot(url.searchParams.get('snapshotId'));
    if (!snap) throw notFound('התכנית לא נמצאה בארכיון');
    requireTrainee(ctx, snap.traineeId);
    return { ok: true, snapshot: snap };
  },

  /** ההיסטוריה של תרגיל בודד — "כמה הוא הרים בפעם שעברה". */
  'GET /api/history/exercise': async (_b, url, ctx) => {
    const t = requireTrainee(ctx, url.searchParams.get('traineeId'));
    return { ok: true, points: exerciseHistory(db.sessionLog(t.id), url.searchParams.get('exerciseId')) };
  },

  /** רישום ישיר ליומן האימונים (סטים, כאב, דילוג) ללא מסלול המשוב. */
  'POST /api/history/log': async (body, _url, ctx) => {
    const t = requireTrainee(ctx, body.traineeId);
    const entries = (body.entries || [body]).filter(Boolean).map((e) => normalizeLogEntry({ ...e, traineeId: t.id }));
    if (!entries.length) throw new Error('אין מה לרשום');
    db.appendLog(t.id, entries);
    return { ok: true, added: entries.length, summary: historySummary(db.sessionLog(t.id), db.listSnapshots(t.id)) };
  },

  /** היסטוריית הסטודיו כולו — מי התאמן השבוע ומי נעלם. */
  'GET /api/history/studio': async (_b, url, ctx) => {
    const studio = requireStudio(ctx, url.searchParams.get('studioId'));
    const trainees = db.listTraineesFor(ctx.account.id, studio.id);
    const since = Date.now() - 1000 * 60 * 60 * 24 * 30;
    return {
      ok: true,
      studioId: studio.id,
      trainees: trainees.map((t) => {
        const log = db.sessionLog(t.id);
        const sum = historySummary(log, db.listSnapshots(t.id));
        return {
          id: t.id, name: t.name, ...sum,
          recentSessions: groupSessions(log).filter((sn) => new Date(sn.date).getTime() >= since).length,
        };
      }).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '')),
    };
  },

  'POST /api/next-week': async (body, _url, ctx) => {
    const raw = requireTrainee(ctx, body.traineeId);
    const events = db.eventsFor(body.traineeId, body.week ?? null);
    const trainee = normalizeTrainee(raw);
    const { trainee: afterFeedback, changes, flags } = applyFeedback(trainee, events);
    const next = advanceWeek(afterFeedback, flags);
    db.putTrainee({ ...raw, ...next });
    const studio = normalizeStudio(db.getStudio(raw.studioId));
    const program = generateWeeklyProgram(next, studio);
    archive(program, 'next_week');
    return { ok: true, changes, flags, program };
  },
};

/** האירועים שנחשבים "קרה משהו באימון" ולכן נכנסים ליומן הקבוע. */
const SESSION_EVENT_TYPES = SESSION_EVENTS;

/**
 * שמירת תכנית + צילום מצב לארכיון.
 * התכנית ה"חיה" נדרסת בכל בנייה מחדש; הארכיון לא נדרס לעולם,
 * וזה מה שמאפשר לפתוח כל תכנית שהייתה אי פעם.
 */
function archive(program, reason) {
  db.putProgram(program);
  db.putSnapshot(programSnapshot(program, { reason }));
  return program;
}

/**
 * ייבוא לחשבון הנוכחי בלבד.
 * כל רשומה נכנסת עם accountId של המייבא — כך קובץ גיבוי של סטודיו אחד
 * לא יכול "להשתיל" נתונים אצל סטודיו אחר.
 */
function importForAccount(payload, ctx) {
  const incoming = payload?.data || payload;
  if (!incoming?.studios || !incoming?.trainees) throw new Error('קובץ הגיבוי אינו במבנה מוכר');
  db.backup('pre-import');

  const idMap = new Map();
  for (const st of Object.values(incoming.studios)) {
    const id = db.getStudio(st.id) && !db.ownsStudio(ctx.account.id, st.id) ? `${st.id}_${Date.now().toString(36)}` : st.id;
    idMap.set(st.id, id);
    db.data.studios[id] = { ...st, id, accountId: ctx.account.id };
  }
  let trainees = 0;
  for (const t of Object.values(incoming.trainees)) {
    const studioId = idMap.get(t.studioId);
    if (!studioId) continue;
    db.data.trainees[t.id] = { ...t, studioId };
    trainees += 1;
  }
  const mine = new Set(Object.keys(incoming.trainees));
  for (const sn of Object.values(incoming.snapshots || {})) {
    if (mine.has(sn.traineeId)) db.data.snapshots[sn.id] = sn;
  }
  for (const pr of Object.values(incoming.programs || {})) {
    if (mine.has(pr.traineeId)) db.data.programs[pr.id] = pr;
  }
  db.save();
  db.log('db_imported', { accountId: ctx.account.id, studios: idMap.size, trainees });
  return { ok: true, studios: idMap.size, trainees };
}

const ALL_ROUTES = { ...authRoutes, ...routes };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  try {
    if (ALL_ROUTES[key]) {
      const resolved = resolveAccount(req);
      const ctx = { req, account: resolved?.account || null, token: resolved?.token || null, setCookie: null };

      // שער אחד לכל ה-API: בלי מושב תקף, שום נתיב נתונים לא נפתח
      if (!PUBLIC.has(key) && !ctx.account) {
        return json(res, 401, { error: 'נדרשת התחברות', login: true });
      }

      const body = req.method === 'POST' ? await readBody(req) : {};
      const payload = await ALL_ROUTES[key](body, url, ctx);
      const headers = ctx.setCookie ? { 'set-cookie': ctx.setCookie } : {};
      return json(res, 200, payload, headers);
    }
    if (url.pathname === '/api/program' && req.method === 'GET') {
      const resolved = resolveAccount(req);
      if (!resolved) return json(res, 401, { error: 'נדרשת התחברות', login: true });
      const p = db.getProgram(url.searchParams.get('id'));
      if (!p || !db.ownsTrainee(resolved.account.id, p.traineeId)) {
        return json(res, 404, { error: 'תכנית לא נמצאה' });
      }
      return json(res, 200, p);
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
    return json(res, err.status || 400, { error: err.message });
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
