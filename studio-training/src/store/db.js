/**
 * אחסון מקומי פשוט בקובץ JSON. ללא תלות חיצונית, ללא קשר לשום מערכת אחרת.
 * מספיק לסטודיו בודד; ניתן להחליף במסד נתונים מאחורי אותו ממשק.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.resolve(HERE, '../../data/db.json');

const EMPTY = { studios: {}, trainees: {}, programs: {}, events: [] };

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
  putStudio(s) { this.data.studios[s.id] = s; return this.save(); }
  getStudio(id) { return this.data.studios[id] || null; }
  listStudios() { return Object.values(this.data.studios); }

  // --- מתאמנים
  putTrainee(t) { this.data.trainees[t.id] = t; return this.save(); }
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
