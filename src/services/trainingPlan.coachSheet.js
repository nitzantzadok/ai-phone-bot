/**
 * Coach Sheet Parser
 *
 * Parses the real training spreadsheet layout, where each tab is a trainee:
 *
 *   rows 0..n   profile block: תאריך | שם המתאמן | היסטוריה רפואית + פציעות |
 *               משקל | אחוזי שומן | גיל | מטרות אישיות | מספר אימונים | הערות - טל
 *   rows n..m   measurements block: תאריך | היקף יד | היקף רגל | ...
 *   rows m..    training table:
 *               חודש/שבועות | מספר התרגיל | שם התרגיל + דגש ביצוע |
 *               משקל ק״ג | חזרות | סטים | הערות + דגשים | מנוחה | הערות - טל
 *
 * Structure inside the training table:
 *   - a new week block starts where column 0 reads "מאי-שבוע 2"
 *   - a new workout starts where column 1 resets to "תרגיל 1"
 *   - the workout name ("אימון ראשון שבועי-") sits in column 0 somewhere
 *     inside the workout's rows, not necessarily on its first row
 */

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const PROFILE_FIELDS = [
  { key: 'date', match: /^תאריך$/ },
  { key: 'name', match: /שם המתאמן/ },
  { key: 'medical', match: /היסטוריה רפואית|פציעות/ },
  { key: 'weight', match: /^משקל$/ },
  { key: 'bodyFat', match: /אחוזי שומן/ },
  { key: 'age', match: /^גיל$/ },
  { key: 'goals', match: /מטרות/ },
  { key: 'sessions', match: /מספר אימונים/ },
  { key: 'coachNotes', match: /הערות\s*-/ }
];

const TABLE_COLUMNS = [
  { key: 'block', match: /חודש|שבועות/ },
  { key: 'slot', match: /מספר התרגיל/ },
  { key: 'exercise', match: /שם התרגיל/ },
  { key: 'weight', match: /^משקל/ },
  { key: 'reps', match: /חזרות/ },
  { key: 'sets', match: /סטים/ },
  { key: 'cue', match: /הערות \+ דגשים/ },
  { key: 'rest', match: /מנוחה/ },
  { key: 'coachNote', match: /הערות\s*-/ }
];

const NO_ISSUE_PATTERN = /^\s*(ללא|אין)\s/;

// Words that mark an entry in the medical column as an actual limitation
const INJURY_WORDS = [
  'כאב', 'פציע', 'פצוע', 'ניתוח', 'דלקת', 'קרע', 'נקע', 'שבר', 'בקע',
  'דיסק', 'סחוס', 'גיד', 'מגבל', 'בעיה', 'רגישות', 'תפיסה', 'שיקום'
];

// Body areas. Naming one in the medical column is itself a limitation,
// even without a pain word - "ברכיים - גב - כתפיים" is a list of problems.
const BODY_AREAS = [
  'ברך', 'ברכיים', 'כתף', 'כתפיים', 'גב', 'מותן', 'צוואר', 'קרסול',
  'אכילס', 'מרפק', 'ירך', 'אגן', 'ישבן', 'שורש', 'שוק', 'אמה'
];

function text(cell) {
  return String(cell === null || cell === undefined ? '' : cell).trim();
}

function isBlank(row) {
  return !row.some((c) => text(c));
}

/**
 * Locate the training table header row (the one naming the exercise column).
 * Returns -1 when the tab has no training table at all.
 */
function findTableHeader(grid) {
  return grid.findIndex((row) => row.some((c) => /שם התרגיל/.test(text(c))));
}

/**
 * Map the table header row to column indexes.
 */
function mapTableColumns(headerRow) {
  const columns = {};

  headerRow.forEach((cell, index) => {
    const value = text(cell);
    if (!value) return;

    for (const { key, match } of TABLE_COLUMNS) {
      if (columns[key] === undefined && match.test(value)) {
        columns[key] = index;
        return;
      }
    }
  });

  return columns;
}

/**
 * The rest and cue columns are swapped in some tabs relative to their
 * headers: one tab labels column 6 "מנוחה" while every tab stores the
 * execution cue there and the rest seconds one column over. Header labels
 * are therefore not trustworthy - decide from the data instead.
 *
 * Rest is a bare number of seconds (60, 90, 120); a cue is free text.
 */
function resolveRestAndCue(grid, columns, startRow) {
  const { rest, cue } = columns;
  if (rest === undefined || cue === undefined) return columns;

  const score = (index) => {
    let numeric = 0;
    let textual = 0;

    for (let i = startRow; i < grid.length; i += 1) {
      const value = text(grid[i][index]);
      if (!value) continue;
      if (/^\d{2,3}$/.test(value)) numeric += 1;
      else textual += 1;
    }

    return { numeric, textual };
  };

  const restScore = score(rest);
  const cueScore = score(cue);

  // Swap when the column labelled "cue" is the one holding bare seconds
  if (cueScore.numeric > cueScore.textual && restScore.textual >= restScore.numeric) {
    return { ...columns, rest: cue, cue: rest, restCueSwapped: true };
  }

  return columns;
}

/**
 * Parse the profile block above the training table.
 */
function parseProfile(grid, headerRowIndex) {
  const profile = {
    name: '',
    medical: [],
    goals: [],
    coachNotes: [],
    weight: '',
    bodyFat: '',
    age: '',
    sessionsPerWeek: null
  };

  // Pick the row carrying the most profile labels. Some tabs put a lone
  // "שם המתאמן" on its own row above the real label row, so matching on
  // that one word alone selects the wrong row and shifts every column.
  const labelledColumns = (row) => {
    const columns = {};
    row.forEach((cell, index) => {
      const value = text(cell);
      if (!value) return;
      for (const { key, match } of PROFILE_FIELDS) {
        if (columns[key] === undefined && match.test(value)) {
          columns[key] = index;
          return;
        }
      }
    });
    return columns;
  };

  let labelRow = -1;
  let columns = {};
  for (let i = 0; i < headerRowIndex; i += 1) {
    const candidate = labelledColumns(grid[i]);
    if (Object.keys(candidate).length > Object.keys(columns).length) {
      columns = candidate;
      labelRow = i;
    }
  }

  if (labelRow === -1 || Object.keys(columns).length < 3) return profile;

  // Values run from the row below the labels until the measurements block
  for (let i = labelRow + 1; i < headerRowIndex; i += 1) {
    const row = grid[i];
    if (isBlank(row)) continue;
    // The measurements block starts its own labelled table
    if (row.some((c) => /^היקף/.test(text(c)))) break;

    const push = (key, target) => {
      if (columns[key] === undefined) return;
      const value = text(row[columns[key]]);
      if (value && !target.includes(value)) target.push(value);
    };

    push('medical', profile.medical);
    push('goals', profile.goals);
    push('coachNotes', profile.coachNotes);

    if (columns.name !== undefined && !profile.name) {
      const value = text(row[columns.name]);
      // Guard against reading a neighbouring label as the trainee's name
      const isLabel = PROFILE_FIELDS.some((f) => f.match.test(value));
      if (value && !isLabel) profile.name = value;
    }
    if (columns.weight !== undefined && !profile.weight) profile.weight = text(row[columns.weight]);
    if (columns.bodyFat !== undefined && !profile.bodyFat) profile.bodyFat = text(row[columns.bodyFat]);
    if (columns.age !== undefined && !profile.age) profile.age = text(row[columns.age]);

    if (columns.sessions !== undefined && profile.sessionsPerWeek === null) {
      const raw = text(row[columns.sessions]);
      const match = raw.match(/\d+/);
      if (match) profile.sessionsPerWeek = Number(match[0]);
    }
  }

  return profile;
}

/**
 * Parse a week label such as "מאי-שבוע 2".
 */
function parseWeekLabel(value) {
  const raw = text(value);
  const weekMatch = raw.match(/שבוע\s*(\d+)/);
  if (!weekMatch) return null;

  const month = HEBREW_MONTHS.find((m) => raw.includes(m)) || null;

  return {
    label: raw,
    month,
    monthIndex: month ? HEBREW_MONTHS.indexOf(month) + 1 : null,
    weekNumber: Number(weekMatch[1])
  };
}

function isWorkoutLabel(value) {
  return /^אימון\s+(ראשון|שני|שלישי|רביעי|חמישי|\d)/.test(text(value));
}

function isFirstSlot(value) {
  return /^תרגיל\s*1$/.test(text(value));
}

/**
 * Parse a weight cell from this sheet.
 * Real values seen: "45", "12.5", "12,5-15", "2-3", "40 קילו",
 * "8-9 פלט", "כל המכונה", "0", "".
 */
function parseWeightCell(value) {
  const raw = text(value);
  const result = { raw, values: [], top: null, unit: 'kg', bodyweight: false, note: '' };

  if (!raw) return result;

  const numbers = (raw.match(/\d+(?:[.,]\d+)?/g) || [])
    .map((n) => Number(n.replace(',', '.')))
    .filter((n) => Number.isFinite(n));

  if (/פלט/.test(raw)) result.unit = 'plate';
  if (/קילו|ק"ג|ק״ג|kg/i.test(raw)) result.unit = 'kg';

  if (!numbers.length) {
    // Text such as "כל המכונה" - a real instruction, just not a number
    result.unit = 'unknown';
    result.note = raw;
    return result;
  }

  result.values = numbers;
  // A range means the top of the range is the working weight
  result.top = Math.max(...numbers);

  // "0" is how bodyweight or unloaded work is written here
  if (result.top === 0) {
    result.bodyweight = true;
    result.top = null;
  }

  return result;
}

function parseRepsCell(value) {
  const raw = text(value);
  if (!raw) return { raw, reps: null, range: null };

  const range = raw.match(/(\d{1,3})\s*[-–]\s*(\d{1,3})/);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    // "120-12" is a typo for "10-12"; keep the sane pair
    if (low <= high && high <= 50) return { raw, reps: high, range: [low, high] };
    return { raw, reps: Math.min(low, high), range: null };
  }

  const single = raw.match(/\d{1,3}/);
  return { raw, reps: single ? Number(single[0]) : null, range: null };
}

/**
 * Parse one trainee tab.
 */
function parseCoachTab(tabTitle, grid) {
  const trainee = {
    tab: tabTitle,
    name: tabTitle.trim(),
    profile: null,
    weeks: [],
    warnings: []
  };

  const headerRowIndex = findTableHeader(grid);
  if (headerRowIndex === -1) {
    trainee.warnings.push('לא נמצאה טבלת אימונים בלשונית');
    trainee.profile = parseProfile(grid, grid.length);
    return trainee;
  }

  trainee.profile = parseProfile(grid, headerRowIndex);
  if (trainee.profile.name) trainee.name = trainee.profile.name.trim() || trainee.name;

  let columns = mapTableColumns(grid[headerRowIndex]);
  if (columns.exercise === undefined) {
    trainee.warnings.push('לא זוהתה עמודת שם התרגיל');
    return trainee;
  }
  columns = resolveRestAndCue(grid, columns, headerRowIndex + 1);
  trainee.columns = columns;

  let currentWeek = null;
  let currentWorkout = null;

  const startWorkout = () => {
    if (!currentWeek) return null;
    currentWorkout = { label: '', exercises: [] };
    currentWeek.workouts.push(currentWorkout);
    return currentWorkout;
  };

  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    const row = grid[i];
    if (isBlank(row)) continue;

    const blockCell = columns.block !== undefined ? row[columns.block] : '';
    const slotCell = columns.slot !== undefined ? row[columns.slot] : '';

    // A repeated table header inside the sheet
    if (/שם התרגיל/.test(text(row[columns.exercise]))) continue;

    const week = parseWeekLabel(blockCell);
    if (week) {
      currentWeek = { ...week, order: trainee.weeks.length, workouts: [] };
      trainee.weeks.push(currentWeek);
      currentWorkout = null;
    }

    if (!currentWeek) continue;

    // A workout begins when the exercise slot counter resets to 1
    if (isFirstSlot(slotCell) || !currentWorkout) startWorkout();

    // The workout's name can appear on any row inside it
    if (isWorkoutLabel(blockCell) && currentWorkout && !currentWorkout.label) {
      currentWorkout.label = text(blockCell).replace(/-$/, '').trim();
    }

    const name = text(row[columns.exercise]);
    if (!name || isWorkoutLabel(name)) continue;

    const weight = parseWeightCell(columns.weight !== undefined ? row[columns.weight] : '');
    const reps = parseRepsCell(columns.reps !== undefined ? row[columns.reps] : '');
    const setsRaw = columns.sets !== undefined ? text(row[columns.sets]) : '';
    const setsMatch = setsRaw.match(/\d{1,2}/);

    currentWorkout.exercises.push({
      slot: text(slotCell),
      name,
      weight,
      reps: reps.reps,
      repsRange: reps.range,
      repsRaw: reps.raw,
      sets: setsMatch ? Number(setsMatch[0]) : null,
      cue: columns.cue !== undefined ? text(row[columns.cue]) : '',
      rest: columns.rest !== undefined ? text(row[columns.rest]) : '',
      coachNote: columns.coachNote !== undefined ? text(row[columns.coachNote]) : '',
      rowIndex: i
    });
  }

  // Drop workouts and weeks that were laid out but never filled in
  trainee.weeks.forEach((w) => {
    w.workouts = w.workouts.filter((workout) => workout.exercises.length > 0);
  });
  const filledWeeks = trainee.weeks.filter((w) => w.workouts.length > 0);

  trainee.plannedWeeks = trainee.weeks.length;
  trainee.weeks = filledWeeks;

  if (!filledWeeks.length) {
    trainee.warnings.push('אין שבוע עם תרגילים שמולאו');
  }

  return trainee;
}

/**
 * Collect every coaching note recorded for the trainee.
 *
 * Entries from the medical history column are prefixed so the generator
 * reads them as a limitation: the column itself means "be careful", even
 * when the text is only a list of body parts such as "ברכיים - גב - כתפיים".
 */
/**
 * Whole-word body area match, reusing the generator's Hebrew-aware matcher
 * so "גב" is not found inside "מגבלות".
 */
function matchesArea(entry, area) {
  const { matchesTerm } = require('./trainingPlan.generator');
  return matchesTerm(entry, area);
}

function collectNotes(trainee) {
  const notes = [];
  const profile = trainee.profile || {};

  (profile.medical || []).forEach((entry) => {
    if (!entry) return;

    // The column doubles as a free notes field: "ירד הרבה במשקל" lives here
    // too. Only flag an entry as a limitation when it reads like one,
    // otherwise every trainee ends up frozen on every exercise.
    const negated = NO_ISSUE_PATTERN.test(entry);
    const looksLikeInjury =
      !negated &&
      (INJURY_WORDS.some((w) => entry.includes(w)) ||
        BODY_AREAS.some((a) => matchesArea(entry, a)));

    notes.push(looksLikeInjury ? `מגבלה רפואית: ${entry}` : entry);
  });

  (profile.coachNotes || []).forEach((n) => notes.push(n));
  (profile.goals || []).forEach((g) => notes.push(`מטרה: ${g}`));

  return notes.filter(Boolean);
}

/**
 * Convert the parsed tab into the shape the plan generator consumes, so the
 * progression logic and its tests are shared between sheet layouts.
 * Each week block becomes one period in the history.
 */
function toGeneratorShape(trainee) {
  return {
    name: trainee.name,
    generalNotes: collectNotes(trainee),
    warnings: trainee.warnings,
    months: trainee.weeks.map((week, index) => ({
      label: week.label,
      monthIndex: null,
      year: null,
      order: index,
      notes: [],
      workouts: week.workouts.map((workout, wIndex) => ({
        label: workout.label || `אימון ${wIndex + 1}`,
        notes: [],
        exercises: workout.exercises.map((exercise) => ({
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          repsRange: exercise.repsRange,
          weight: exercise.weight.top,
          weightHistory: exercise.weight.values,
          bodyweight: exercise.weight.bodyweight,
          weightRaw: exercise.weight.raw,
          rest: exercise.rest,
          tempo: '',
          notes: [exercise.cue, exercise.coachNote].filter(Boolean).join(' | '),
          rowIndex: exercise.rowIndex
        }))
      }))
    }))
  };
}

module.exports = {
  parseCoachTab,
  toGeneratorShape,
  collectNotes,
  parseProfile,
  parseWeekLabel,
  parseWeightCell,
  parseRepsCell,
  mapTableColumns,
  resolveRestAndCue,
  findTableHeader,
  isWorkoutLabel,
  isFirstSlot,
  HEBREW_MONTHS
};
