/**
 * מגיליון למערכת.
 *
 * שני שלבים נפרדים בכוונה:
 *   shAnalyzeWorkbook  – קורא את הגיליון ומחזיר תכנית ייבוא לתצוגה. לא משנה כלום.
 *   shBuildImport      – בונה את הסטודיו, המתאמנים וההיסטוריה מתוך התכנית.
 *
 * ההפרדה היא מה שמאפשר למאמן לראות מה המערכת הבינה, לתקן מה שצריך, ורק אז
 * לאשר. ייבוא שמשנה נתונים לפני שראו אותו הוא ייבוא שאי אפשר לסמוך עליו.
 */

import { BY_ID } from '../exercises.js';
import { CONSTRAINTS } from '../constraints.js';
import { EQUIPMENT_LABELS } from '../labels.js';
import { GOALS, LEVELS } from '../taxonomy.js';
import { shClassifyTable, shSheetPersonName } from './classify.js';
import { shCell, shFixHeaderless, shMapColumns } from './columns.js';
import {
  shBool, shDate, shEmpty, shMatch, shMatchAll, shMatchPhrase, shNorm, shNum, shPhone, shEmail,
  shRange, shSplitList, shTokens,
} from './text.js';
import {
  constraintCandidates, equipmentCandidates, exerciseCandidates, GOAL_TERMS, IGNORED_FIELDS,
  LEVEL_TERMS, LIFESTYLE_TERMS, SEVERITY_TERMS, SEX_TERMS, shCandidates, SH_FIELD_LABELS,
  SIDE_TERMS, SPORT_TERMS, WEEKDAY_TERMS,
} from './vocab.js';

const GOAL_CANDS = shCandidates(GOAL_TERMS);
const LEVEL_CANDS = shCandidates(LEVEL_TERMS);
const SEX_CANDS = shCandidates(SEX_TERMS);
const SPORT_CANDS = shCandidates(SPORT_TERMS);
const LIFESTYLE_CANDS = shCandidates(LIFESTYLE_TERMS);
const SEVERITY_CANDS = shCandidates(SEVERITY_TERMS);
const SIDE_CANDS = shCandidates(SIDE_TERMS);
const WEEKDAY_CANDS = shCandidates(WEEKDAY_TERMS);

/** שורות סיכום בתחתית גיליון — נתון שנראה כמו מתאמן ואינו מתאמן. */
// בלי \b: בעברית אין גבול-מילה במובן של ביטוי רגולרי, ולכן "סה\"כ" בסוף שורה
// לא היה נתפס והשורה הייתה הופכת למתאמן בשם "סה\"כ".
const SUMMARY_ROW = /^(סה"?כ|סהכ|סיכום|ממוצע|total|sum|average|avg)(\s|:|$)/i;

/**
 * שלב א' — קריאה והבנה.
 * @param {Array<{name:string, rows:string[][]}>} sheets לשוניות גולמיות
 * @param {{overrides?:Record<string,string>}} opts תפקיד שהמאמן כפה ללשונית
 */
export function shAnalyzeWorkbook(sheets, { overrides = {}, columnOverrides = {} } = {}) {
  const analyzed = [];
  for (const sheet of sheets) {
    const table = shFixHeaderless(sheet.table || sheet);
    const auto = shClassifyTable(table);
    const role = overrides[sheet.name] || auto.role;
    const mapped = shMapColumns(table, { role });

    // המאמן רשאי לתקן כל עמודה. התיקון גובר על הזיהוי האוטומטי, ולא להפך.
    const fixes = columnOverrides[sheet.name] || {};
    for (const [index, field] of Object.entries(fixes)) {
      const col = mapped.columns[Number(index)];
      if (!col) continue;
      for (const [f, i] of Object.entries(mapped.byField)) if (i === col.index) delete mapped.byField[f];
      col.field = field === 'none' ? null : field;
      col.why = 'נבחר ידנית';
      if (col.field) mapped.byField[col.field] = col.index;
    }
    analyzed.push({
      name: sheet.name || '',
      table,
      role,
      roleAuto: auto.role,
      confidence: auto.confidence,
      why: auto.why,
      alternatives: auto.alternatives || [],
      rowCount: table.rows.length,
      byField: mapped.byField,
      columns: mapped.columns.map((c) => ({
        index: c.index,
        header: c.header,
        field: c.field,
        label: c.field ? (SH_FIELD_LABELS[c.field] || c.field) : '',
        ignored: c.field ? IGNORED_FIELDS.has(c.field) : false,
        why: c.why || '',
        score: c.score,
        samples: c.values.slice(0, 3),
        candidates: c.candidates.map((s) => ({ field: s.field, label: SH_FIELD_LABELS[s.field] || s.field })),
      })),
      headerless: !!table.headerless,
    });
  }

  const counts = {};
  for (const s of analyzed) counts[s.role] = (counts[s.role] || 0) + s.rowCount;
  return { sheets: analyzed, counts };
}

/* ------------------------------------------------------------------ ערכים */

const pickGoals = (raw) => {
  const hits = shMatchAll(raw, GOAL_CANDS, { min: 0.62 });
  return hits.map((h) => h.key).filter((g) => GOALS.includes(g));
};

const pickLevel = (raw) => {
  const hit = shMatch(raw, LEVEL_CANDS, { min: 0.68 });
  return hit && LEVELS.includes(hit.key) ? hit.key : null;
};

/** ותק באימונים מתוך טקסט: "שנתיים", "8 חודשים", "3 שנים". */
function pickTrainingMonths(raw) {
  const s = shNorm(raw);
  if (!s) return null;
  if (/שנתיים|שנתים/.test(s)) return 24;
  const n = shNum(raw);
  if (n === null) return null;
  if (/שנה|שנים|year/.test(s)) return Math.round(n * 12);
  if (/חודש|month/.test(s)) return Math.round(n);
  return n > 24 ? Math.round(n) : Math.round(n * 12); // מספר לבד — כנראה שנים
}

/**
 * מגבלה אחת מתוך טקסט חופשי: "כאב ברך שמאל (חריף)".
 * החומרה והצד נקראים מאותו תא, כי שם המאמן כותב אותם.
 */
function pickConstraint(part) {
  /*
   * החומרה והצד נכתבים כמילה בתוך המשפט ("שמאל", "חריף"), ולכן הם נבדקים
   * מילה-מילה ולא מול המשפט כולו. אחרי שהם מזוהים הם מוסרים מהטקסט: מה
   * שנשאר הוא תיאור המגבלה עצמה, וזה מה שמושווה למאגר.
   */
  let severity = null;
  let side = null;
  const rest = [];
  for (const token of shTokens(part)) {
    const sev = shMatch(token, SEVERITY_CANDS, { min: 0.85 });
    if (sev && !severity) { severity = sev.key; continue; }
    const sd = shMatch(token, SIDE_CANDS, { min: 0.85 });
    if (sd && !side) { side = sd.key; continue; }
    rest.push(token);
  }
  const hit = shMatchPhrase(rest.join(' ') || part, constraintCandidates(), { min: 0.66 });
  if (!hit || !CONSTRAINTS[hit.key]) return null;
  severity = severity || 'subacute';
  return { id: hit.key, severity, side: side === 'both' ? null : side, notes: part.trim().slice(0, 120) };
}

function pickWeekdays(raw) {
  return shMatchAll(raw, WEEKDAY_CANDS, { min: 0.75 }).map((h) => h.key);
}

/** גובה: 178 או 1.78 — שניהם נכתבים בגיליונות. */
function pickHeight(raw) {
  const n = shNum(raw);
  if (n === null) return null;
  if (n > 1.2 && n < 2.3) return Math.round(n * 100);
  return n >= 100 && n <= 230 ? Math.round(n) : null;
}

/* --------------------------------------------------------------- מתאמנים */

function traineeFromRow(row, byField, ctx) {
  const cell = (f) => shCell(row, byField, f);
  const first = cell('firstName'); const last = cell('lastName');
  let name = cell('name').trim();
  if (!name && (first || last)) name = `${first} ${last}`.trim();
  // תא שכולו מספר אינו שם. שם שיש בו ספרה ("מתאמן 3", "דנה 2") הוא כן שם.
  if (!name || SUMMARY_ROW.test(name) || /^[\d.,\s+-]+$/.test(name)) return null;

  const t = { name, importedFrom: ctx.sheetName };
  const setIf = (key, value) => { if (value !== null && value !== undefined && value !== '') t[key] = value; };

  setIf('phone', shPhone(cell('phone')));
  setIf('email', shEmail(cell('email')));
  setIf('sex', shMatch(cell('sex'), SEX_CANDS, { min: 0.8 })?.key || null);

  const age = shNum(cell('age'));
  if (age !== null && age >= 8 && age <= 99) t.age = Math.round(age);
  const birth = shDate(cell('birthDate'));
  if (birth && t.age === undefined) {
    const years = (Date.now() - new Date(birth).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years > 8 && years < 100) t.age = Math.floor(years);
  }

  setIf('heightCm', pickHeight(cell('heightCm')));
  const weight = shNum(cell('weightKg'));
  if (weight !== null && weight >= 30 && weight <= 250) t.weightKg = weight;
  const fat = shNum(cell('bodyFatPct'));
  if (fat !== null && fat > 3 && fat < 60) t.bodyFatPct = fat;

  const level = pickLevel(cell('level'));
  const months = pickTrainingMonths(cell('trainingAgeMonths') || (level ? '' : cell('level')));
  if (months !== null) t.trainingAgeMonths = months;
  if (level) t.level = level;
  else if (months !== null) {
    // בלי הצהרת רמה, הוותק הוא הראיה הזמינה. המנוע יאמת אותה מול משקלים.
    t.level = months >= 42 ? 'advanced' : months >= 12 ? 'intermediate' : months >= 3 ? 'novice' : 'beginner';
  }

  const goals = pickGoals(cell('goal'));
  if (goals.length) { t.goals = goals; t.primaryGoal = goals[0]; }
  else if (!shEmpty(cell('goal'))) { t.goalDetail = cell('goal').slice(0, 200); ctx.unmatched.goals.add(cell('goal').trim()); }
  if (!shEmpty(cell('goalDetail'))) t.goalDetail = cell('goalDetail').slice(0, 200);

  const days = shNum(cell('daysPerWeek'));
  if (days !== null && days >= 1 && days <= 7) t.daysPerWeek = Math.round(days);
  const mins = shNum(cell('sessionMinutes'));
  if (mins !== null && mins >= 20 && mins <= 120) t.sessionMinutes = Math.round(mins);
  const pref = pickWeekdays(cell('preferredDays'));
  if (pref.length) {
    t.preferredDays = pref;
    if (t.daysPerWeek === undefined) t.daysPerWeek = Math.min(6, pref.length);
  }

  const constraints = [];
  for (const part of shSplitList(cell('constraints'))) {
    const c = pickConstraint(part);
    if (c) constraints.push(c);
    else if (!shEmpty(part)) ctx.unmatched.constraints.add(part.trim());
  }
  if (constraints.length) t.constraints = constraints;
  if (!shEmpty(cell('pastInjuries'))) t.pastInjuries = cell('pastInjuries').slice(0, 300);
  if (!shEmpty(cell('medications'))) t.medications = shSplitList(cell('medications')).slice(0, 10);
  const clearance = shBool(cell('medicalClearance'));
  if (clearance !== null) t.medicalClearance = clearance;

  setIf('sport', shMatch(cell('sport'), SPORT_CANDS, { min: 0.7 })?.key || null);
  const ext = shNum(cell('externalSessions'));
  if (ext !== null && ext >= 0 && ext <= 14) t.externalSessions = Math.round(ext);
  setIf('lifestyle', shMatch(cell('lifestyle'), LIFESTYLE_CANDS, { min: 0.7 })?.key || null);
  if (!shEmpty(cell('coach'))) t.coach = cell('coach').slice(0, 40);
  setIf('startDate', shDate(cell('startDate')));
  setIf('targetDate', shDate(cell('targetDate')));
  const hr = shNum(cell('restingHR'));
  if (hr !== null && hr >= 35 && hr <= 120) t.restingHR = Math.round(hr);
  if (!shEmpty(cell('bloodPressure'))) t.bloodPressure = cell('bloodPressure').slice(0, 20);

  // כל מה שלא נכנס לשדה מוכר נשמר כטקסט. עדיף הערה מיותרת מנתון שנעלם.
  const extras = [];
  if (!shEmpty(cell('notes'))) extras.push(cell('notes').trim());
  for (const col of ctx.columns) {
    if (col.field || shEmpty(row[col.index])) continue;
    if (shEmpty(col.header)) continue;
    extras.push(`${col.header.trim()}: ${String(row[col.index]).trim()}`);
  }
  const active = shBool(cell('status'));
  if (active === false) { t.inactive = true; extras.push('מסומן כלא פעיל בגיליון'); }
  if (extras.length) t.notes = extras.join(' · ').slice(0, 600);

  const branch = cell('studio').trim();
  if (branch && !shEmpty(branch)) t.branchName = branch;
  return t;
}

/** מיזוג שתי רשומות של אותו אדם משתי לשוניות. הערך הקיים לא נדרס בריק. */
function mergeTrainee(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (!Array.isArray(out[k]) || !out[k].length) out[k] = v;
      continue;
    }
    if (out[k] === undefined || out[k] === '' || out[k] === null) out[k] = v;
  }
  if (base.notes && extra.notes && base.notes !== extra.notes) {
    out.notes = `${base.notes} · ${extra.notes}`.slice(0, 600);
  }
  return out;
}

/* ------------------------------------------------------------------ ציוד */

function equipmentFromTable(sheet, ctx) {
  const found = new Map();
  const weights = {};
  const eqCands = equipmentCandidates();
  for (const row of sheet.table.rows) {
    const raw = shCell(row, sheet.byField, 'equipmentItem')
      || row.find((c) => !shEmpty(c) && shNum(c) === null) || '';
    if (shEmpty(raw) || SUMMARY_ROW.test(raw)) continue;

    const hit = shMatchPhrase(raw, eqCands, { min: 0.7 });
    if (!hit) { ctx.unmatched.equipment.add(String(raw).trim()); continue; }

    const countCell = shCell(row, sheet.byField, 'count');
    const count = shNum(countCell);
    found.set(hit.key, Math.max(found.get(hit.key) || 0, count !== null && count > 0 ? Math.round(count) : 1));

    const range = shRange(shCell(row, sheet.byField, 'weightRange') || raw);
    if (range && range.max > range.min && range.max <= 200) {
      weights[hit.key] = { min: range.min, max: range.max };
    }
  }
  return { found, weights };
}

/* ------------------------------------------------ תכניות, יומן, מדידות, נוכחות */

const REP_RANGE = /(\d{1,3})\s*[-–xX*]\s*(\d{1,3})/;

function prescriptionFrom(row, byField) {
  const setsN = shNum(shCell(row, byField, 'sets'));
  const repsRaw = shCell(row, byField, 'reps');
  const range = REP_RANGE.exec(repsRaw);
  const repsMin = range ? +range[1] : (shNum(repsRaw) ?? 10);
  const repsMax = range ? +range[2] : repsMin;
  const rest = shNum(shCell(row, byField, 'rest'));
  return {
    sets: setsN !== null && setsN > 0 ? Math.round(setsN) : 3,
    reps: range ? `${repsMin}-${repsMax}` : String(repsMin),
    repsMin,
    repsMax,
    restSec: rest !== null ? Math.round(rest > 20 ? rest : rest * 60) : 90,
    rir: 2,
    tempo: shCell(row, byField, 'tempo') || '2-0-1-0',
    unit: 'reps',
    imported: true,
  };
}

/** תרגיל מהמאגר, או תרגיל של הסטודיו כשאין התאמה — ובשום מקרה לא נעלם. */
function exerciseFrom(raw, ctx) {
  const hit = shMatchPhrase(raw, ctx.exerciseCands, { min: 0.66 });
  if (hit) {
    const ex = BY_ID[hit.key];
    return {
      block: {
        id: ex.id, name: ex.name, nameEn: ex.nameEn, pattern: ex.pattern,
        primary: ex.primary, secondary: ex.secondary, type: ex.type,
        equipment: ex.eq?.[0] || ['bodyweight'], unilateral: ex.unilateral,
        skill: ex.skill, loadable: ex.loadable, demand: ex.demand,
      },
      matched: true,
      score: hit.score,
    };
  }
  const name = String(raw).trim();
  ctx.unmatched.exercises.add(name);
  const id = `imported_${shNorm(name).replace(/ /g, '_').slice(0, 30) || Math.random().toString(36).slice(2, 8)}`;
  ctx.customExercises.set(id, {
    id, name, custom: true, source: 'sheets',
    notes: 'יובא מהגיליון של הסטודיו. לא זוהה תרגיל מקביל במאגר.',
  });
  return {
    block: {
      id, name, nameEn: '', pattern: null, primary: [], secondary: [], type: 'accessory',
      equipment: ['bodyweight'], unilateral: false, skill: 2, loadable: true, demand: 2,
    },
    matched: false,
    score: 0,
  };
}

/** תכניות: כל שורה היא תרגיל; הקיבוץ הוא לפי מתאמן ולפי יום. */
function programsFromSheet(sheet, ctx) {
  const byTrainee = new Map();
  const sheetPerson = shSheetPersonName(sheet.name, ctx.traineeNames);

  for (const row of sheet.table.rows) {
    const rawEx = shCell(row, sheet.byField, 'exercise')
      || row.find((c) => !shEmpty(c) && shNum(c) === null) || '';
    if (shEmpty(rawEx) || SUMMARY_ROW.test(rawEx)) continue;

    const person = shCell(row, sheet.byField, 'name').trim() || sheetPerson;
    if (!person) continue;
    const dayLabel = shCell(row, sheet.byField, 'day').trim() || 'אימון';
    const key = shNorm(person);

    if (!byTrainee.has(key)) byTrainee.set(key, { name: person, days: new Map() });
    const entry = byTrainee.get(key);
    if (!entry.days.has(dayLabel)) entry.days.set(dayLabel, []);

    const { block, matched } = exerciseFrom(rawEx, ctx);
    const loadKg = shNum(shCell(row, sheet.byField, 'load'));
    entry.days.get(dayLabel).push({
      slotLabel: dayLabel,
      role: 'main',
      segment: null,
      setType: 'straight',
      group: null,
      exercise: block,
      prescription: prescriptionFrom(row, sheet.byField),
      load: { kg: loadKg !== null ? loadKg : null, perSide: false, source: 'imported' },
      estimatedMinutes: 0,
      coachingNotes: matched ? [] : ['תרגיל שיובא מהגיליון ולא זוהה במאגר — כדאי לוודא שהוא מתאים.'],
      imported: true,
      date: shDate(shCell(row, sheet.byField, 'date')),
      note: shCell(row, sheet.byField, 'notes').slice(0, 200),
    });
  }
  return byTrainee;
}

/** יומן ביצועים: מה בוצע בפועל, עם תאריך. */
function logFromSheet(sheet, ctx) {
  const out = [];
  const sheetPerson = shSheetPersonName(sheet.name, ctx.traineeNames);
  for (const row of sheet.table.rows) {
    const rawEx = shCell(row, sheet.byField, 'exercise');
    const date = shDate(shCell(row, sheet.byField, 'date'));
    if (shEmpty(rawEx) && !date) continue;
    const person = shCell(row, sheet.byField, 'name').trim() || sheetPerson;
    if (!person) continue;
    const { block } = rawEx ? exerciseFrom(rawEx, ctx) : { block: null };
    out.push({
      person,
      entry: {
        type: 'log_set',
        date: date || undefined,
        at: date ? `${date}T12:00:00.000Z` : undefined,
        exerciseId: block && !String(block.id).startsWith('imported_') ? block.id : null,
        exerciseName: block ? block.name : String(rawEx).trim(),
        loadKg: shNum(shCell(row, sheet.byField, 'load')),
        reps: shNum(shCell(row, sheet.byField, 'reps')),
        rpe: shNum(shCell(row, sheet.byField, 'rpe')),
        painLevel: shNum(shCell(row, sheet.byField, 'pain')),
        note: shCell(row, sheet.byField, 'notes').slice(0, 200),
        source: 'sheets',
      },
    });
  }
  return out;
}

const GIRTH_FIELDS = ['waist', 'chest', 'hips', 'arm', 'thigh', 'calf'];

function measurementsFromSheet(sheet, ctx) {
  const out = [];
  const sheetPerson = shSheetPersonName(sheet.name, ctx.traineeNames);
  for (const row of sheet.table.rows) {
    const date = shDate(shCell(row, sheet.byField, 'date'));
    const person = shCell(row, sheet.byField, 'name').trim() || sheetPerson;
    if (!person) continue;
    const m = { date: date || undefined };
    const w = shNum(shCell(row, sheet.byField, 'weightKg'));
    if (w !== null && w >= 30 && w <= 250) m.weightKg = w;
    const f = shNum(shCell(row, sheet.byField, 'bodyFatPct'));
    if (f !== null && f > 3 && f < 60) m.bodyFatPct = f;
    const girths = {};
    for (const g of GIRTH_FIELDS) {
      const v = shNum(shCell(row, sheet.byField, g));
      if (v !== null) girths[g] = v;
    }
    const neck = shNum(shCell(row, sheet.byField, 'neckSize'));
    if (neck !== null) girths.neck = neck;
    if (Object.keys(girths).length) m.girths = girths;
    if (m.weightKg || m.bodyFatPct || m.girths) out.push({ person, measurement: m });
  }
  return out;
}

/**
 * לוח נוכחות: התאריכים בכותרות, שם בעמודה, וסימון בתא.
 * זה המקום היחיד שבו אפשר לדעת כמה המתאמן באמת הגיע — לא כמה תוכנן.
 */
function attendanceFromSheet(sheet) {
  const dateCols = sheet.table.headers
    .map((h, i) => ({ i, date: shDate(h) }))
    .filter((x) => x.date);
  if (!dateCols.length) return [];

  const nameIdx = sheet.byField.name ?? 0;
  const out = [];
  for (const row of sheet.table.rows) {
    const person = String(row[nameIdx] || '').trim();
    if (!person || SUMMARY_ROW.test(person)) continue;
    const dates = [];
    for (const col of dateCols) {
      const mark = row[col.i];
      if (shEmpty(mark)) continue;
      if (shBool(mark) === false) continue;
      dates.push(col.date);
    }
    if (dates.length) out.push({ person, dates });
  }
  return out;
}

/** פרטי הסטודיו מלשונית "תווית: ערך". */
function studioFromKeyValue(sheet) {
  const info = {};
  for (const row of sheet.table.rows) {
    const label = String(row[0] || '').trim();
    const value = String(row[1] || '').trim();
    if (!label || !value) continue;
    const n = shNorm(label);
    if (/שם/.test(n)) info.name = info.name || value;
    else if (/טלפון|נייד/.test(n)) info.phone = value;
    else if (/כתובת|עיר/.test(n)) info.address = value;
    else if (/מייל|אימייל/.test(n)) info.email = value;
    else if (/אורכ אימונ|משכ|דקות/.test(n)) info.sessionMinutes = shNum(value);
    else if (/במקביל|מתאמנימ בו/.test(n)) info.concurrentTrainees = shNum(value);
    else if (/מאמנימ/.test(n)) info.trainersOnFloor = shNum(value);
    else if (/תקרה|גובה/.test(n)) info.ceilingHeightCm = shNum(value);
    else info[label] = value;
  }
  return info;
}

/* ------------------------------------------------------------------ בנייה */

/**
 * מזהה יציב מתוך שם. הנרמול מאחד אותיות סופיות, ולכן שני שמות שונים
 * יכולים להצטמצם לאותו מזהה — לכן נשמרת רשימת מזהים שכבר ניתנו.
 */
function slugId(name, prefix, taken = null) {
  const base = `${prefix}_${shNorm(name).replace(/ /g, '_').slice(0, 24) || Math.random().toString(36).slice(2, 7)}`;
  if (!taken) return base;
  let id = base; let n = 2;
  while (taken.has(id)) id = `${base}_${n++}`;
  taken.add(id);
  return id;
}

/**
 * שלב ב' — בנייה בפועל.
 * מחזיר אובייקטים מוכנים לשמירה, ודוח מלא על מה נבנה וממה.
 */
export function shBuildImport(analysis, {
  studioName = 'הסטודיו שלי',
  studioId = null,
  baseStudio = null,
} = {}) {
  const ctx = {
    unmatched: { equipment: new Set(), exercises: new Set(), constraints: new Set(), goals: new Set() },
    customExercises: new Map(),
    exerciseCands: exerciseCandidates(),
    traineeNames: [],
  };
  const perSheet = [];
  const warnings = [];

  // --- מתאמנים תחילה: שמותיהם נחוצים לזיהוי לשוניות אישיות
  const traineesByKey = new Map();
  for (const sheet of analysis.sheets.filter((s) => s.role === 'trainees')) {
    let added = 0;
    for (const row of sheet.table.rows) {
      const t = traineeFromRow(row, sheet.byField, {
        sheetName: sheet.name, columns: sheet.columns, unmatched: ctx.unmatched,
      });
      if (!t) continue;
      const key = shNorm(t.name);
      traineesByKey.set(key, traineesByKey.has(key) ? mergeTrainee(traineesByKey.get(key), t) : t);
      added++;
    }
    perSheet.push({ name: sheet.name, role: sheet.role, rows: sheet.rowCount, built: added, what: 'מתאמנים' });
  }
  ctx.traineeNames = [...traineesByKey.values()].map((t) => t.name);

  // --- סניפים: עמודת "סניף" מייצרת סטודיו לכל ערך שונה
  const branches = new Map();
  for (const t of traineesByKey.values()) {
    if (!t.branchName) continue;
    const key = shNorm(t.branchName);
    if (!branches.has(key)) branches.set(key, { name: t.branchName, id: null });
  }

  const usedIds = new Set();
  /*
   * רשת שכל המתאמנים שלה משויכים לסניפים לא צריכה סטודיו ראשי נוסף וריק:
   * הוא היה מופיע ברשימה בלי אף מתאמן ונראה כאילו הייבוא נכשל. במקרה כזה
   * הסניף הראשון הוא הסטודיו הראשי, והוא זה שמחזיק את הציוד.
   * כשמייבאים לתוך סטודיו קיים — הוא תמיד נשאר הראשי.
   */
  const everyoneHasBranch = traineesByKey.size > 0 && branches.size > 0
    && [...traineesByKey.values()].every((t) => t.branchName);
  const collapseInto = !studioId && !baseStudio && everyoneHasBranch
    ? [...branches.values()][0]
    : null;

  const mainId = studioId || slugId(collapseInto ? collapseInto.name : studioName, 'studio', usedIds);
  // ייבוא לתוך סטודיו קיים מוסיף ולא מוחק: הציוד שכבר רשום נשאר.
  const baseEquipment = (baseStudio?.equipment || []).map((e) => (typeof e === 'string'
    ? { item: e, count: 1 }
    : { item: e.item, count: e.count ?? 1 })).filter((e) => e.item && e.item !== 'bodyweight');
  const studios = [{
    ...(baseStudio || {}),
    id: mainId,
    name: baseStudio?.name || collapseInto?.name || studioName,
    equipment: baseEquipment,
    customExercises: [],
    profile: { ...(baseStudio?.profile || {}), importedAt: new Date().toISOString(), importedFrom: 'google_sheets' },
  }];
  for (const b of branches.values()) {
    if (shNorm(b.name) === shNorm(studios[0].name)) { b.id = mainId; continue; }
    b.id = slugId(b.name, 'studio', usedIds);
    studios.push({ id: b.id, name: b.name, equipment: [], customExercises: [], profile: { importedFrom: 'google_sheets' } });
  }
  const studioIdFor = (branchName) => (branchName && branches.get(shNorm(branchName))?.id) || mainId;

  // --- ציוד
  for (const sheet of analysis.sheets.filter((s) => s.role === 'equipment')) {
    const { found, weights } = equipmentFromTable(sheet, ctx);
    // ציוד שנרשם עם שם סניף בשורה שייך לסניף; אחרת לכל הסטודיו
    const target = studios.find((s) => shNorm(s.name) === shNorm(sheet.name)) || studios[0];
    for (const [item, count] of found) {
      const existing = target.equipment.find((e) => e.item === item);
      if (existing) existing.count = Math.max(existing.count, count);
      else target.equipment.push({ item, count });
    }
    target.equipmentWeights = { ...(target.equipmentWeights || {}), ...weights };
    if (weights.dumbbell?.max) target.dumbbellMaxKg = weights.dumbbell.max;
    perSheet.push({ name: sheet.name, role: sheet.role, rows: sheet.rowCount, built: found.size, what: 'פריטי ציוד' });
  }

  // --- תכניות
  const programs = [];
  for (const sheet of analysis.sheets.filter((s) => s.role === 'programs')) {
    const byTrainee = programsFromSheet(sheet, ctx);
    let built = 0;
    for (const entry of byTrainee.values()) {
      const key = shNorm(entry.name);
      if (!traineesByKey.has(key)) {
        // מתאמן שמופיע רק בתכנית — עדיין מתאמן. נוצר עם מה שיש.
        traineesByKey.set(key, { name: entry.name, importedFrom: sheet.name });
        ctx.traineeNames.push(entry.name);
      }
      const days = [...entry.days.entries()].map(([label, blocks], i) => ({
        index: i + 1,
        day: null,
        dayLabel: label,
        label,
        sessionMinutes: null,
        segments: [],
        estimatedMinutes: 0,
        blocks,
        unfilledSlots: [],
        droppedForTime: [],
        status: 'planned',
      }));
      programs.push({ traineeKey: key, traineeName: entry.name, days, sheetName: sheet.name });
      built += days.length;
    }
    perSheet.push({ name: sheet.name, role: sheet.role, rows: sheet.rowCount, built, what: 'ימי אימון' });
  }

  // --- יומן, מדידות, נוכחות
  const logs = [];
  for (const sheet of analysis.sheets.filter((s) => s.role === 'log')) {
    const rows = logFromSheet(sheet, ctx);
    for (const r of rows) {
      const key = shNorm(r.person);
      if (!traineesByKey.has(key)) traineesByKey.set(key, { name: r.person, importedFrom: sheet.name });
      logs.push({ traineeKey: key, entry: r.entry });
    }
    perSheet.push({ name: sheet.name, role: sheet.role, rows: sheet.rowCount, built: rows.length, what: 'רישומי ביצוע' });
  }

  const measurements = [];
  for (const sheet of analysis.sheets.filter((s) => s.role === 'measurements')) {
    const rows = measurementsFromSheet(sheet, ctx);
    for (const r of rows) {
      const key = shNorm(r.person);
      if (!traineesByKey.has(key)) traineesByKey.set(key, { name: r.person, importedFrom: sheet.name });
      measurements.push({ traineeKey: key, measurement: r.measurement });
    }
    perSheet.push({ name: sheet.name, role: sheet.role, rows: sheet.rowCount, built: rows.length, what: 'מדידות' });
  }

  const attendance = [];
  for (const sheet of analysis.sheets.filter((s) => s.role === 'attendance')) {
    const rows = attendanceFromSheet(sheet);
    for (const r of rows) {
      const key = shNorm(r.person);
      if (!traineesByKey.has(key)) traineesByKey.set(key, { name: r.person, importedFrom: sheet.name });
      attendance.push({ traineeKey: key, dates: r.dates });
    }
    perSheet.push({
      name: sheet.name, role: sheet.role, rows: sheet.rowCount,
      built: rows.reduce((n, r) => n + r.dates.length, 0), what: 'הגעות',
    });
  }

  // --- פרטי הסטודיו
  for (const sheet of analysis.sheets.filter((s) => s.role === 'studio')) {
    const info = studioFromKeyValue(sheet);
    const s = studios[0];
    if (info.name && !baseStudio?.name) s.name = info.name;
    if (info.sessionMinutes) s.sessionMinutes = Math.round(info.sessionMinutes);
    if (info.concurrentTrainees) s.concurrentTrainees = Math.round(info.concurrentTrainees);
    if (info.trainersOnFloor) s.trainersOnFloor = Math.round(info.trainersOnFloor);
    if (info.ceilingHeightCm) s.ceilingHeightCm = Math.round(info.ceilingHeightCm);
    s.profile = { ...s.profile, ...info };
    perSheet.push({ name: sheet.name, role: sheet.role, rows: sheet.rowCount, built: Object.keys(info).length, what: 'פרטי סטודיו' });
  }

  // --- הרכבה סופית של המתאמנים
  const trainees = [];
  for (const [key, raw] of traineesByKey) {
    const branchId = studioIdFor(raw.branchName);
    const t = {
      ...raw,
      id: slugId(raw.name, 'trainee', usedIds),
      homeStudioId: branchId,
      // גם השדה הישן: שרת וקוד קיים עדיין מצפים ל-studioId
      studioId: branchId,
      studioIds: [branchId],
      source: 'google_sheets',
    };
    delete t.branchName;

    const own = measurements.filter((m) => m.traineeKey === key).map((m) => m.measurement);
    if (own.length) t.measurements = own;
    const days = attendance.find((a) => a.traineeKey === key);
    if (days) {
      t.sessions = days.dates.map((d, i) => ({
        traineeId: t.id, studioId: branchId, date: d, status: 'done', dayIndex: i, dayLabel: 'יובא מהגיליון',
      }));
      const weeks = attendanceWeeks(days.dates);
      if (weeks >= 2 && t.daysPerWeek === undefined) {
        t.daysPerWeek = Math.max(1, Math.min(6, Math.round(days.dates.length / weeks)));
        t.frequencyFromAttendance = true;
      }
    }
    const ownLogs = logs.filter((l) => l.traineeKey === key).map((l) => l.entry);
    if (ownLogs.length) {
      t.sessionLog = ownLogs;
      // משקלי עבודה אחרונים: מה שמאפשר למנוע להציע משקל אמיתי כבר בתכנית הראשונה
      const history = {};
      for (const e of ownLogs) {
        if (!e.exerciseId || e.loadKg === null) continue;
        const prev = history[e.exerciseId];
        if (!prev || (e.date || '') >= (prev.date || '')) {
          history[e.exerciseId] = { load: e.loadKg, reps: e.reps ?? null, date: e.date || null };
        }
      }
      if (Object.keys(history).length) t.history = history;
    }
    trainees.push(t);
  }

  // --- תכניות -> צילומי מצב, אחרי שלמתאמנים יש מזהים
  const idByKey = new Map(trainees.map((t) => [shNorm(t.name), t.id]));
  const studioByKey = new Map(trainees.map((t) => [shNorm(t.name), t.homeStudioId]));
  const snapshots = programs.map((p) => {
    const traineeId = idByKey.get(p.traineeKey);
    const traineeStudio = studioByKey.get(p.traineeKey) || mainId;
    const at = latestDate(p.days) || new Date().toISOString();
    const program = {
      schemaVersion: 1,
      id: `${traineeId}_imported_${shNorm(p.sheetName).replace(/ /g, '_').slice(0, 16) || 'sheet'}`,
      traineeId,
      traineeName: p.traineeName,
      studioId: traineeStudio,
      week: 0,
      generatedAt: at,
      imported: true,
      meta: {
        imported: true,
        source: 'google_sheets',
        sheet: p.sheetName,
        split: null,
        goal: null,
        level: null,
        daysPerWeek: p.days.length,
        note: 'תכנית שיובאה מהגיליון של הסטודיו כפי שהייתה, בלי שינוי.',
      },
      days: p.days,
      qa: { score: null, passed: null, errors: [], warnings: [], info: [] },
      notes: [],
    };
    return {
      id: `snap_${traineeId}_${p.sheetName.replace(/\s/g, '_')}`,
      programId: program.id,
      traineeId,
      traineeName: p.traineeName,
      studioId: traineeStudio,
      week: 0,
      at,
      reason: 'imported',
      qaScore: null,
      qaPassed: null,
      split: null,
      goal: null,
      level: null,
      daysPerWeek: p.days.length,
      totalExercises: p.days.reduce((n, d) => n + d.blocks.length, 0),
      program,
    };
  });

  /*
   * סניף בלי לשונית ציוד משלו מקבל את הציוד של הסטודיו הראשי.
   * זו ההתנהגות הנכונה כמעט תמיד: רשת כותבת רשימת ציוד אחת. סניף שבאמת
   * שונה נערך אחר כך במסך הסטודיו, וההודעה בדוח אומרת זאת במפורש.
   */
  const shared = studios[0].equipment;
  const inherited = studios.slice(1).filter((s) => !s.equipment.length);
  for (const s of inherited) {
    s.equipment = shared.map((e) => ({ ...e }));
    if (studios[0].equipmentWeights) s.equipmentWeights = { ...studios[0].equipmentWeights };
    if (studios[0].dumbbellMaxKg) s.dumbbellMaxKg = studios[0].dumbbellMaxKg;
  }
  if (inherited.length && shared.length) {
    warnings.push(`הציוד הועתק גם ל${inherited.length === 1 ? 'סניף' : `-${inherited.length} הסניפים`} ${inherited.map((s) => s.name).join(', ')}. אם המכשור שם שונה — אפשר לערוך כל סניף בנפרד.`);
  }

  /*
   * תרגילים שלא זוהו נשמרים כספריית התרגילים של הסטודיו — בתוספת למה
   * שכבר קיים בו. ייבוא לסטודיו פעיל לא מוחק תרגילים שהמאמנים כתבו.
   */
  const existingCustom = baseStudio?.customExercises || [];
  const customByName = new Map(existingCustom.map((c) => [shNorm(c.name), c]));
  for (const c of ctx.customExercises.values()) {
    if (!customByName.has(shNorm(c.name))) customByName.set(shNorm(c.name), c);
  }
  studios[0].customExercises = [...customByName.values()];

  if (!studios[0].equipment.length) {
    warnings.push('לא נמצאה לשונית ציוד. אפשר לבחור חבילת ציוד במסך הסטודיו — זה לוקח פחות מדקה.');
  }
  if (!trainees.length) warnings.push('לא זוהו מתאמנים בגיליון. כדאי לבדוק את בחירת סוג הלשונית.');
  const noGoal = trainees.filter((t) => !t.primaryGoal).length;
  if (noGoal) warnings.push(`ל-${noGoal} מתאמנים לא נמצאה מטרה — הוגדרה "כושר כללי" עד שתעדכן.`);

  return {
    studios,
    trainees,
    snapshots,
    report: {
      perSheet,
      warnings,
      counts: {
        studios: studios.length,
        trainees: trainees.length,
        equipment: studios.reduce((n, s) => n + s.equipment.length, 0),
        programs: snapshots.length,
        programDays: snapshots.reduce((n, s) => n + s.daysPerWeek, 0),
        logs: logs.length,
        measurements: measurements.length,
        attendance: attendance.reduce((n, a) => n + a.dates.length, 0),
        customExercises: ctx.customExercises.size,
      },
      unmatched: {
        equipment: [...ctx.unmatched.equipment].slice(0, 40),
        exercises: [...ctx.unmatched.exercises].slice(0, 40),
        constraints: [...ctx.unmatched.constraints].slice(0, 40),
        goals: [...ctx.unmatched.goals].slice(0, 40),
      },
    },
  };
}

/**
 * כמה שבועות שונים מכסות ההגעות.
 * ספירת שבועות ולא חלוקה של הטווח: שישה אימונים בפרישה של שלושה שבועות
 * הם פעמיים בשבוע, גם אם הטווח בימים מתחלק אחרת.
 */
function attendanceWeeks(dates) {
  const weeks = new Set();
  for (const d of dates) {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) continue;
    // תחילת השבוע (ראשון) כמפתח — כך כל תאריך נופל לשבוע קלנדרי אחד בדיוק
    dt.setDate(dt.getDate() - dt.getDay());
    weeks.add(dt.toISOString().slice(0, 10));
  }
  return Math.max(1, weeks.size);
}

function latestDate(days) {
  const all = days.flatMap((d) => d.blocks.map((b) => b.date).filter(Boolean));
  if (!all.length) return null;
  return `${all.sort().at(-1)}T12:00:00.000Z`;
}

/** תוויות לתצוגה: מה נמצא בגיליון ומה נבנה ממנו. */
export const SH_UNMATCHED_LABELS = {
  equipment: 'פריטי ציוד שלא זוהו',
  exercises: 'תרגילים שלא זוהו במאגר',
  constraints: 'מגבלות שלא זוהו',
  goals: 'מטרות שלא זוהו',
};

export const shEquipmentLabel = (item) => EQUIPMENT_LABELS[item] || item;
