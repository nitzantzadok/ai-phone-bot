/**
 * אחסון מקומי פשוט בקובץ JSON. ללא תלות חיצונית, ללא קשר לשום מערכת אחרת.
 * מספיק לסטודיו בודד; ניתן להחליף במסד נתונים מאחורי אותו ממשק.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sameContent as sameSnapshotContent } from '../domain/history.js';

// נתיב ברירת המחדל מחושב רק כשצריך אותו: בסביבת קצה (Workers) אין קבצים,
// וחישוב בזמן טעינת המודול היה מפיל את העלייה של ה-Worker.
function defaultDbFile() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../data/db.json');
}

export const SCHEMA_VERSION = 5;

/**
 * מיגרציה בין גרסאות סכימה.
 * מסד ישן נטען ומתעדכן בשקט, בלי לאבד נתונים ובלי לדרוש מהמשתמש כלום.
 */
export function migrate(data) {
  const from = data.meta?.schemaVersion ?? 1;
  if (from >= SCHEMA_VERSION) return data;

  if (from < 2) {
    data.photos = data.photos || {};
    data.changelog = data.changelog || [];
  }
  if (from < 3) {
    // גרסה 3 הוסיפה מדידות, יומן הערות ומלאי משקלים
    for (const t of Object.values(data.trainees || {})) {
      t.measurements = t.measurements || [];
      t.notesLog = t.notesLog || [];
      t.approvedExercises = t.approvedExercises || [];
      t.blockedExercises = t.blockedExercises || [];
      t.customExercises = t.customExercises || [];
    }
  }
  if (from < 4) {
    // גרסה 4 הוסיפה חשבונות, בידוד נתונים בין סטודיואים והיסטוריה מלאה
    data.accounts = data.accounts || {};
    data.sessions = data.sessions || {};
    data.snapshots = data.snapshots || {};
    for (const t of Object.values(data.trainees || {})) t.sessionLog = t.sessionLog || [];
    // מסד קיים מלפני החשבונות: כל מה שבו שייך לחשבון הראשון שייווצר.
    // מסמנים אותו ולא ממציאים בעלים, כדי שלא ניצור שיוך שגוי בשקט.
    for (const st of Object.values(data.studios || {})) {
      if (st.accountId === undefined) st.accountId = null;
    }
  }
  if (from < 5) {
    // גרסה 5: מתאמן שייך לחשבון ויכול להתאמן בכמה סניפים; נוסף לוח אימונים
    for (const t of Object.values(data.trainees || {})) {
      t.homeStudioId = t.homeStudioId || t.studioId || null;
      t.studioIds = t.studioIds && t.studioIds.length
        ? t.studioIds
        : (t.homeStudioId ? [t.homeStudioId] : []);
      t.sessions = t.sessions || [];
      // הבעלים נגזר מהסניף הקיים, כדי שהבידוד יישאר בדיוק כפי שהיה
      const st = data.studios?.[t.homeStudioId];
      if (st && t.accountId === undefined) t.accountId = st.accountId ?? null;
    }
  }
  data.meta = { ...(data.meta || {}), schemaVersion: SCHEMA_VERSION, migratedAt: new Date().toISOString() };
  return data;
}

const EMPTY = {
  /** חשבונות: accountId -> { id, username, salt, hash, studioIds, ... } */
  accounts: {},
  /** מושבים פעילים: token -> { accountId, expiresAt, createdAt, ua } */
  sessions: {},
  /** ארכיון תכניות: snapshotId -> צילום מצב בלתי משתנה */
  snapshots: {},
  studios: {}, trainees: {}, programs: {}, events: [],
  /** תמונות ציוד: photoId -> { studioId, item, dataUrl, at } */
  photos: {},
  /** יומן שינויים — כל פעולה שמשנה מצב, לצורך מעקב וסנכרון. */
  changelog: [],
  meta: { schemaVersion: SCHEMA_VERSION },
};

export class Db {
  /**
   * @param {string|{data?:object, persist?:(data:object)=>void}} source
   *
   * ברירת המחדל היא קובץ JSON על הדיסק — כך זה עבד תמיד, וכך זה ממשיך
   * לעבוד בשרת מקומי. אבל אותה מערכת רצה גם במקום שאין בו מערכת קבצים
   * (פונקציה בקצה, מול מסד מנוהל), ולכן אפשר להזין לה במקום זה מסמך
   * טעון ופונקציית שמירה. כל שאר הקוד — הנתיבים, ההרשאות, המנוע — אינו
   * יודע ולא צריך לדעת מאיפה הנתונים הגיעו.
   */
  constructor(source = process.env.STUDIO_DB_FILE || defaultDbFile()) {
    if (source && typeof source === 'object') {
      this.file = null;
      this.persist = source.persist || null;
      this.data = migrate({ ...structuredClone(EMPTY), ...(source.data || {}) });
      return;
    }
    this.file = source;
    this.persist = null;
    this.data = this.#load();
  }

  #load() {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return structuredClone(EMPTY);
      // הקובץ קיים אך פגום — לא מוחקים אותו, שומרים בצד ומתחילים נקי
      const rescued = `${this.file}.corrupt-${Date.now()}`;
      try { fs.renameSync(this.file, rescued); } catch { /* ניסינו */ }
      console.error(`מסד הנתונים היה פגום ונשמר בצד: ${rescued}`);
      return structuredClone(EMPTY);
    }
    return migrate({ ...structuredClone(EMPTY), ...parsed });
  }

  /**
   * בדיקת שלמות: מוצאת הפניות שבורות ורשומות חסרות מזהה.
   * @returns {{ok:boolean, issues:string[], stats:object}}
   */
  check() {
    const issues = [];
    const studioIds = new Set(Object.keys(this.data.studios));

    for (const [id, s] of Object.entries(this.data.studios)) {
      if (s.id !== id) issues.push(`סטודיו ${id}: המזהה בתוך הרשומה אינו תואם (${s.id})`);
      if (!s.name) issues.push(`סטודיו ${id}: אין שם`);
    }
    for (const [id, t] of Object.entries(this.data.trainees)) {
      if (t.id !== id) issues.push(`מתאמן ${id}: המזהה בתוך הרשומה אינו תואם (${t.id})`);
      if (!t.studioId) issues.push(`מתאמן ${id}: לא משויך לסטודיו`);
      else if (!studioIds.has(t.studioId)) issues.push(`מתאמן ${id}: משויך לסטודיו שאינו קיים (${t.studioId})`);
    }
    for (const [id, p] of Object.entries(this.data.programs)) {
      if (!this.data.trainees[p.traineeId]) issues.push(`תכנית ${id}: המתאמן ${p.traineeId} אינו קיים`);
    }
    for (const [id, st] of Object.entries(this.data.studios)) {
      if (!st.accountId) issues.push(`סטודיו ${id}: אין חשבון בעלים — הנתונים אינם מבודדים`);
      else if (!this.data.accounts[st.accountId]) issues.push(`סטודיו ${id}: החשבון ${st.accountId} אינו קיים`);
    }
    for (const [id, sn] of Object.entries(this.data.snapshots)) {
      if (!this.data.trainees[sn.traineeId]) issues.push(`צילום תכנית ${id}: המתאמן ${sn.traineeId} אינו קיים`);
    }
    for (const ph of Object.values(this.data.photos)) {
      if (!studioIds.has(ph.studioId)) issues.push(`תמונה ${ph.id}: סטודיו ${ph.studioId} אינו קיים`);
    }

    return { ok: issues.length === 0, issues, stats: this.stats() };
  }

  /** תמונת מצב מספרית של המסד. */
  stats() {
    return {
      schemaVersion: this.data.meta?.schemaVersion ?? 1,
      savedAt: this.data.meta?.savedAt || null,
      studios: Object.keys(this.data.studios).length,
      trainees: Object.keys(this.data.trainees).length,
      programs: Object.keys(this.data.programs).length,
      photos: Object.keys(this.data.photos).length,
      events: this.data.events.length,
      changelog: this.data.changelog.length,
      measurements: Object.values(this.data.trainees).reduce((n, t) => n + (t.measurements?.length || 0), 0),
      notes: Object.values(this.data.trainees).reduce((n, t) => n + (t.notesLog?.length || 0), 0),
      accounts: Object.keys(this.data.accounts).length,
      sessions: Object.keys(this.data.sessions).length,
      snapshots: Object.keys(this.data.snapshots).length,
      scheduledSessions: Object.values(this.data.trainees)
        .reduce((n, t) => n + (t.sessions || []).length, 0),
      loggedSets: Object.values(this.data.trainees)
        .reduce((n, t) => n + (t.sessionLog || []).filter((e) => e.type === 'log_set').length, 0),
      fileSizeKb: (() => { try { return +(fs.statSync(this.file).size / 1024).toFixed(1); } catch { return 0; } })(),
    };
  }

  /**
   * ייצוא לגיבוי חיצוני.
   * גיבוי הוא קובץ שיוצא מהשרת ולכן מקבל יחס בהתאם: גיבובי הסיסמאות
   * והמושבים הפעילים לא נכללים בו לעולם. שחזור מגיבוי מחזיר את הנתונים,
   * ובעלי החשבונות קובעים סיסמה מחדש.
   * accountId=null מייצא הכול (גיבוי מנהל); accountId מסוים מייצא רק אותו.
   */
  export(accountId = null) {
    const safeAccounts = Object.fromEntries(Object.entries(this.data.accounts)
      .filter(([id]) => !accountId || id === accountId)
      .map(([id, a]) => [id, { ...a, salt: undefined, hash: undefined, algo: undefined }]));

    if (!accountId) {
      return {
        exportedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
        data: { ...this.data, accounts: safeAccounts, sessions: {} },
      };
    }

    const studios = Object.fromEntries(this.listStudiosFor(accountId).map((s) => [s.id, s]));
    const trainees = Object.fromEntries(this.listTraineesFor(accountId).map((t) => [t.id, t]));
    const traineeIds = new Set(Object.keys(trainees));
    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      scope: accountId,
      data: {
        accounts: safeAccounts,
        sessions: {},
        studios,
        trainees,
        programs: Object.fromEntries(Object.entries(this.data.programs).filter(([, p]) => traineeIds.has(p.traineeId))),
        snapshots: Object.fromEntries(Object.entries(this.data.snapshots).filter(([, sn]) => traineeIds.has(sn.traineeId))),
        photos: Object.fromEntries(Object.entries(this.data.photos).filter(([, ph]) => studios[ph.studioId])),
        events: this.data.events.filter((e) => traineeIds.has(e.traineeId)),
        changelog: this.data.changelog.filter((c) => traineeIds.has(c.traineeId) || studios[c.studioId]),
        meta: { schemaVersion: SCHEMA_VERSION },
      },
    };
  }

  /**
   * ייבוא. מגבה את הקיים לפני הכתיבה, ומאמת שהמבנה הגיוני
   * לפני שהוא נוגע במשהו.
   */
  import(payload, { merge = false } = {}) {
    const incoming = payload?.data || payload;
    if (!incoming || typeof incoming !== 'object' || !incoming.studios || !incoming.trainees) {
      throw new Error('קובץ הגיבוי אינו במבנה מוכר');
    }
    const backup = this.backup('pre-import');
    const next = migrate({ ...structuredClone(EMPTY), ...incoming });
    this.data = merge
      ? {
        ...this.data,
        studios: { ...this.data.studios, ...next.studios },
        trainees: { ...this.data.trainees, ...next.trainees },
        programs: { ...this.data.programs, ...next.programs },
        photos: { ...this.data.photos, ...next.photos },
        accounts: { ...this.data.accounts, ...next.accounts },
        snapshots: { ...this.data.snapshots, ...next.snapshots },
        events: [...this.data.events, ...next.events],
        changelog: [...this.data.changelog, ...next.changelog],
      }
      : next;
    this.save();
    this.log('db_imported', { merge, backup });
    return { ok: true, backup, stats: this.stats() };
  }

  /**
   * שמירה אטומית: כותבים לקובץ זמני ורק אז מחליפים.
   * כך נפילה באמצע הכתיבה לא משאירה מסד פגום — הקובץ הישן נשאר שלם
   * עד הרגע שבו החדש מוכן במלואו.
   */
  save() {
    this.data.meta = { ...(this.data.meta || {}), schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString() };
    // מסד בזיכרון: מי שהזין אותו אחראי לשמירה, והוא זה שיודע לאן
    if (!this.file) { if (this.persist) this.persist(this.data); return this; }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    this.data.meta = { ...(this.data.meta || {}), schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString() };
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    return this;
  }

  /** גיבוי מתוארך לפני פעולה הרסנית. */
  backup(reason = 'manual') {
    if (!fs.existsSync(this.file)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = `${this.file}.${stamp}.${reason}.bak`;
    fs.copyFileSync(this.file, dest);
    this.#pruneBackups();
    return dest;
  }

  /** שומרים עשרה גיבויים אחרונים; מעבר לזה זה רק מבזבז מקום. */
  #pruneBackups() {
    const dir = path.dirname(this.file);
    const base = path.basename(this.file);
    const backups = fs.readdirSync(dir)
      .filter((f) => f.startsWith(`${base}.`) && f.endsWith('.bak'))
      .sort();
    for (const f of backups.slice(0, Math.max(0, backups.length - 10))) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* לא קריטי */ }
    }
  }

  // --- סטודיו
  putStudio(s) {
    const existing = this.data.studios[s.id];
    // הבעלות לעולם לא נמחקת בעדכון: מי שהקים את הסטודיו נשאר הבעלים,
    // גם אם גוף הבקשה לא כלל את השדה.
    const accountId = existing?.accountId ?? s.accountId ?? null;
    this.data.studios[s.id] = {
      ...s, accountId,
      createdAt: existing?.createdAt || s.createdAt || new Date().toISOString(),
    };
    this.log(existing ? 'studio_updated' : 'studio_created', { studioId: s.id });
    return this.save();
  }
  getStudio(id) { return this.data.studios[id] || null; }
  listStudios() { return Object.values(this.data.studios); }

  // --- מתאמנים
  putTrainee(t) {
    const existing = this.data.trainees[t.id];
    // הבעלות נקבעת פעם אחת ואינה משתנה דרך גוף בקשה
    const accountId = existing?.accountId ?? t.accountId
      ?? this.data.studios[t.homeStudioId || t.studioId]?.accountId ?? null;
    this.data.trainees[t.id] = {
      ...t, accountId,
      createdAt: existing?.createdAt || t.createdAt || new Date().toISOString(),
    };
    this.log(existing ? 'trainee_updated' : 'trainee_created', { traineeId: t.id, studioId: t.studioId });
    return this.save();
  }
  getTrainee(id) { return this.data.trainees[id] || null; }
  listTrainees(studioId) {
    const all = Object.values(this.data.trainees);
    return studioId ? all.filter((t) => t.studioId === studioId) : all;
  }

  // --- תכניות
  putProgram(p) { this.data.programs[p.id] = p; return this.save(); }
  getProgram(id) { return this.data.programs[id] || null; }
  listPrograms(traineeId) {
    const all = Object.values(this.data.programs);
    return traineeId ? all.filter((p) => p.traineeId === traineeId) : all;
  }
  latestProgram(traineeId) {
    return this.listPrograms(traineeId).sort((a, b) => b.week - a.week)[0] || null;
  }

  // --- תמונות ציוד
  putPhoto(photo) {
    const id = photo.id || `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.data.photos[id] = { ...photo, id, at: photo.at || new Date().toISOString() };
    this.save();
    return this.data.photos[id];
  }
  photosFor(studioId) { return Object.values(this.data.photos).filter((p) => p.studioId === studioId); }

  // --- יומן שינויים
  log(action, detail = {}) {
    this.data.changelog.push({ action, ...detail, at: new Date().toISOString() });
    if (this.data.changelog.length > 5000) this.data.changelog = this.data.changelog.slice(-3000);
    return this.save();
  }
  history(filter = {}) {
    return this.data.changelog.filter((e) => Object.entries(filter).every(([k, v]) => e[k] === v));
  }

  // --- אירועי משוב
  addEvent(ev) {
    this.data.events.push({ ...ev, at: ev.at || new Date().toISOString() });
    return this.save();
  }
  eventsFor(traineeId, sinceWeek = null) {
    return this.data.events.filter((e) => e.traineeId === traineeId && (sinceWeek == null || e.week === sinceWeek));
  }
  // --- חשבונות ובידוד נתונים
  /**
   * כל הפונקציות כאן מקבלות accountId ולא מחזירות דבר מחוצה לו.
   * זה הגבול היחיד שמפריד בין הסטודיואים, ולכן הוא נאכף כאן במסד
   * ולא רק בשכבת ה-API — נתיב חדש שישכח לסנן פשוט לא יקבל נתונים.
   */
  putAccount(acc) {
    this.data.accounts[acc.id] = acc;
    this.save();
    return acc;
  }
  getAccount(id) { return this.data.accounts[id] || null; }
  accountByUsername(username) {
    return Object.values(this.data.accounts).find((a) => a.username === username) || null;
  }
  accountCount() { return Object.keys(this.data.accounts).length; }

  putSession(token, session) {
    this.data.sessions[token] = session;
    this.#pruneSessions();
    this.save();
    return session;
  }
  getSession(token) { return (token && this.data.sessions[token]) || null; }
  dropSession(token) { delete this.data.sessions[token]; return this.save(); }
  /** ניקוי מושבים שפגו — אחרת הקובץ גדל לנצח. */
  #pruneSessions() {
    const now = Date.now();
    for (const [t, s] of Object.entries(this.data.sessions)) {
      if (new Date(s.expiresAt).getTime() <= now) delete this.data.sessions[t];
    }
  }

  /** האם הסטודיו שייך לחשבון. התשובה השלילית היא ברירת המחדל. */
  ownsStudio(accountId, studioId) {
    const st = this.data.studios[studioId];
    return !!(st && accountId && st.accountId === accountId);
  }
  /**
   * האם המתאמן שייך לחשבון.
   * מתאמן יכול להיות משויך לכמה סניפים, ולכן הבעלות נקבעת לפי החשבון עצמו,
   * ורק כגיבוי לפי הסניף הראשי (רשומות שנוצרו לפני גרסה 5).
   */
  ownsTrainee(accountId, traineeId) {
    const t = this.data.trainees[traineeId];
    if (!t || !accountId) return false;
    if (t.accountId) return t.accountId === accountId;
    return this.ownsStudio(accountId, t.homeStudioId || t.studioId);
  }

  listStudiosFor(accountId) {
    return Object.values(this.data.studios).filter((s) => s.accountId === accountId);
  }
  /**
   * מתאמני החשבון. סינון לפי סניף מחזיר את מי שמורשה להתאמן בו —
   * לא רק את מי שהסניף הזה הוא ביתו.
   */
  listTraineesFor(accountId, studioId = null) {
    const mine = new Set(this.listStudiosFor(accountId).map((s) => s.id));
    return Object.values(this.data.trainees).filter((t) => {
      const owned = t.accountId ? t.accountId === accountId : mine.has(t.homeStudioId || t.studioId);
      if (!owned) return false;
      if (!studioId) return true;
      const ids = t.studioIds && t.studioIds.length ? t.studioIds : [t.homeStudioId || t.studioId];
      return ids.includes(studioId);
    });
  }

  // --- ארכיון תכניות
  /**
   * שמירת צילום מצב. אם התוכן זהה לצילום האחרון של אותו מתאמן —
   * לא נוצרת רשומה חדשה, כי ארכיון שמלא בכפילויות הוא ארכיון שאי אפשר לקרוא.
   */
  /**
   * שמירת צילום תכנית, עם גג לכל מתאמן.
   *
   * כל בניית תכנית מייצרת צילום, וצילום הוא התכנית המלאה — עשרות קילובייט.
   * בלי גג, מתאמן ותיק לבדו מגיע למאות מגה, והמסד נהיה כבד עד שהוא מפסיק
   * להישמר. שנים-עשר האחרונים הם רבעון שלם של היסטוריה, וזה מה שמאמן
   * באמת מסתכל עליו.
   */
  putSnapshot(snap, keep = 12) {
    const last = this.listSnapshots(snap.traineeId)[0];
    if (last && sameSnapshotContent(last, snap)) return last;
    this.data.snapshots[snap.id] = snap;
    for (const old of this.listSnapshots(snap.traineeId).slice(keep)) delete this.data.snapshots[old.id];
    this.save();
    return snap;
  }
  getSnapshot(id) { return this.data.snapshots[id] || null; }
  /** הצילומים של מתאמן, מהחדש לישן. */
  listSnapshots(traineeId) {
    return Object.values(this.data.snapshots)
      .filter((s) => s.traineeId === traineeId)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  snapshotsForStudio(studioId) {
    return Object.values(this.data.snapshots)
      .filter((s) => s.studioId === studioId)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  // --- יומן אימונים
  appendLog(traineeId, entries) {
    const t = this.data.trainees[traineeId];
    if (!t) throw new Error('מתאמן לא נמצא');
    t.sessionLog = [...(t.sessionLog || []), ...entries];
    this.save();
    return t.sessionLog;
  }
  sessionLog(traineeId) { return this.data.trainees[traineeId]?.sessionLog || []; }

  reset() {
    this.backup('pre-reset');
    this.data = structuredClone(EMPTY);
    return this.save();
  }
}
