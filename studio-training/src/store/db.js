/**
 * אחסון מקומי פשוט בקובץ JSON. ללא תלות חיצונית, ללא קשר לשום מערכת אחרת.
 * מספיק לסטודיו בודד; ניתן להחליף במסד נתונים מאחורי אותו ממשק.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.resolve(HERE, '../../data/db.json');

const EMPTY = {
  studios: {}, trainees: {}, programs: {}, events: [],
  /** תמונות ציוד: photoId -> { studioId, item, dataUrl, at } */
  photos: {},
  /** יומן שינויים — כל פעולה שמשנה מצב, לצורך מעקב וסנכרון. */
  changelog: [],
  meta: { schemaVersion: 2 },
};

export class Db {
  constructor(file = process.env.STUDIO_DB_FILE || DEFAULT_FILE) {
    this.file = file;
    this.data = this.#load();
  }

  #load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return { ...structuredClone(EMPTY), ...JSON.parse(raw) };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    return this;
  }

  // --- סטודיו
  putStudio(s) {
    const existing = this.data.studios[s.id];
    this.data.studios[s.id] = { ...s, createdAt: existing?.createdAt || s.createdAt || new Date().toISOString() };
    this.log(existing ? 'studio_updated' : 'studio_created', { studioId: s.id });
    return this.save();
  }
  getStudio(id) { return this.data.studios[id] || null; }
  listStudios() { return Object.values(this.data.studios); }

  // --- מתאמנים
  putTrainee(t) {
    const existing = this.data.trainees[t.id];
    this.data.trainees[t.id] = { ...t, createdAt: existing?.createdAt || t.createdAt || new Date().toISOString() };
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
  reset() { this.data = structuredClone(EMPTY); return this.save(); }
}
