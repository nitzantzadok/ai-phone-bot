/**
 * Training Plan Parser
 * Turns a raw trainee tab (2D array of cells) into structured data:
 * months -> workouts -> exercises, plus the coaching notes ("דגשים").
 *
 * The parser is deliberately tolerant: it detects month blocks, table
 * headers and workout labels by keyword rather than by fixed coordinates,
 * so the sheet can be written by hand without a rigid template.
 */

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const HEADER_KEYWORDS = {
  exercise: ['תרגיל', 'תרגילים', 'exercise', 'movement'],
  weight: ['משקל', 'משקלים', 'משקל עבודה', 'ק"ג', 'קג', 'weight', 'kg', 'load'],
  sets: ['סטים', 'סט', 'מערכות', 'sets', 'set'],
  reps: ['חזרות', 'חזרה', 'reps', 'rep'],
  rest: ['מנוחה', 'הפסקה', 'rest'],
  tempo: ['טמפו', 'קצב', 'tempo'],
  notes: ['דגש', 'דגשים', 'הערה', 'הערות', 'notes', 'note', 'comments']
};

const NOTE_ROW_PREFIXES = ['דגשים', 'דגש', 'הערות', 'הערה', 'notes', 'note'];

const BODYWEIGHT_TOKENS = ['משקל גוף', 'גוף', 'bw', 'bodyweight'];

/**
 * Normalize a cell for keyword matching: lowercase, strip punctuation
 * that people type inconsistently (quotes, colons, parens).
 */
function normalize(cell) {
  return String(cell || '')
    .replace(/["'׳״)(:\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isEmptyRow(row) {
  return row.every((cell) => !String(cell || '').trim());
}

function nonEmptyCount(row) {
  return row.filter((cell) => String(cell || '').trim()).length;
}

/**
 * Does this row start a month block? Returns the month descriptor or null.
 * Matches "ינואר", "ינואר 2026", "חודש 3", "03/2026".
 */
function detectMonth(row) {
  // A month header is a sparse row - a title, not a data row
  if (nonEmptyCount(row) > 3) return null;

  for (const cell of row) {
    const raw = String(cell || '').trim();
    if (!raw) continue;
    const text = normalize(raw);

    const namedMonth = HEBREW_MONTHS.find((m) => text.includes(m));
    if (namedMonth) {
      const yearMatch = raw.match(/(20\d{2})/);
      return {
        label: raw,
        monthIndex: HEBREW_MONTHS.indexOf(namedMonth) + 1,
        year: yearMatch ? Number(yearMatch[1]) : null
      };
    }

    const chodesh = text.match(/^חודש\s*(\d{1,2})$/);
    if (chodesh) {
      return { label: raw, monthIndex: Number(chodesh[1]), year: null };
    }

    const numeric = raw.match(/^(\d{1,2})[./](20\d{2})$/);
    if (numeric) {
      return { label: raw, monthIndex: Number(numeric[1]), year: Number(numeric[2]) };
    }
  }

  return null;
}

/**
 * Does this row start a workout block ("אימון A", "יום 2")?
 */
function detectWorkout(row) {
  if (nonEmptyCount(row) > 2) return null;

  for (const cell of row) {
    const raw = String(cell || '').trim();
    if (!raw) continue;
    // No \b here: it is ASCII-only, so it never matches after Hebrew letters
    if (/^(אימון|יום|workout|day)(\s|[-–—:.]|$)/i.test(raw)) {
      return { label: raw };
    }
  }

  return null;
}

/**
 * Map a header row to column indexes. Returns null if the row does not
 * look like a table header (needs an exercise column plus one data column).
 */
function detectHeader(row) {
  const columns = {};

  row.forEach((cell, index) => {
    const text = normalize(cell);
    if (!text) return;

    for (const [field, keywords] of Object.entries(HEADER_KEYWORDS)) {
      if (columns[field] !== undefined) continue;
      // Match whole words so "משקל" does not swallow "משקל גוף" data cells
      if (keywords.some((kw) => text === kw || text.startsWith(`${kw} `) || text.endsWith(` ${kw}`))) {
        columns[field] = index;
        return;
      }
    }
  });

  if (columns.exercise === undefined) return null;
  const hasData = ['weight', 'sets', 'reps'].some((f) => columns[f] !== undefined);
  if (!hasData) return null;

  return columns;
}

/**
 * Is this row a free-text notes row ("דגשים: ...")?
 * Returns the note text or null.
 */
function detectNoteRow(row) {
  const cells = row.map((c) => String(c || '').trim());
  const firstIndex = cells.findIndex((c) => c);
  if (firstIndex === -1) return null;

  const head = normalize(cells[firstIndex]);
  const matched = NOTE_ROW_PREFIXES.find((p) => head === p || head.startsWith(`${p} `));
  if (!matched) return null;

  const inline = cells[firstIndex].replace(/^[^:]*:/, '').trim();
  const rest = cells.slice(firstIndex + 1).filter(Boolean).join(' ').trim();
  const text = [inline === cells[firstIndex] ? '' : inline, rest].filter(Boolean).join(' ').trim();

  return text || null;
}

/**
 * Parse a weight cell into structured load info.
 * Handles "60", "60 ק\"ג", "60-65", "60/62.5/65", "משקל גוף", "3x10x60".
 */
function parseWeight(cell) {
  const raw = String(cell || '').trim();
  if (!raw) return { values: [], latest: null, bodyweight: false, raw };

  const text = normalize(raw);
  if (BODYWEIGHT_TOKENS.some((t) => text === t || text.includes('משקל גוף'))) {
    return { values: [], latest: null, bodyweight: true, raw };
  }

  const numbers = (raw.match(/\d+(?:[.,]\d+)?/g) || [])
    .map((n) => Number(n.replace(',', '.')))
    .filter((n) => Number.isFinite(n));

  if (!numbers.length) {
    return { values: [], latest: null, bodyweight: false, raw };
  }

  return {
    values: numbers,
    // A progression written left-to-right means the last number is current
    latest: numbers[numbers.length - 1],
    max: Math.max(...numbers),
    bodyweight: false,
    raw
  };
}

/**
 * Parse sets/reps. Accepts a combined cell ("3x10", "4/8-12") or two cells.
 */
function parseSetsReps(setsCell, repsCell) {
  const result = { sets: null, reps: null, repsRange: null, raw: { sets: setsCell, reps: repsCell } };

  const combined = String(setsCell || '').trim();
  const combinedMatch = combined.match(/^(\d{1,2})\s*[xX*×\/]\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);
  if (combinedMatch && !String(repsCell || '').trim()) {
    result.sets = Number(combinedMatch[1]);
    result.reps = Number(combinedMatch[2]);
    if (combinedMatch[3]) result.repsRange = [Number(combinedMatch[2]), Number(combinedMatch[3])];
    return result;
  }

  const setsNum = String(setsCell || '').match(/\d{1,2}/);
  if (setsNum) result.sets = Number(setsNum[0]);

  const repsRaw = String(repsCell || '').trim();
  const range = repsRaw.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (range) {
    result.repsRange = [Number(range[1]), Number(range[2])];
    result.reps = Number(range[2]);
  } else {
    const repsNum = repsRaw.match(/\d{1,2}/);
    if (repsNum) result.reps = Number(repsNum[0]);
  }

  return result;
}

function parseExerciseRow(row, columns, rowIndex) {
  const name = String(row[columns.exercise] || '').trim();
  if (!name) return null;

  // Skip rows that are actually repeated headers or note rows
  if (detectHeader(row) || detectNoteRow(row)) return null;

  const weight = parseWeight(columns.weight !== undefined ? row[columns.weight] : '');
  const setsReps = parseSetsReps(
    columns.sets !== undefined ? row[columns.sets] : '',
    columns.reps !== undefined ? row[columns.reps] : ''
  );

  return {
    name,
    sets: setsReps.sets,
    reps: setsReps.reps,
    repsRange: setsReps.repsRange,
    weight: weight.latest,
    weightHistory: weight.values,
    bodyweight: weight.bodyweight,
    weightRaw: weight.raw,
    rest: columns.rest !== undefined ? String(row[columns.rest] || '').trim() : '',
    tempo: columns.tempo !== undefined ? String(row[columns.tempo] || '').trim() : '',
    notes: columns.notes !== undefined ? String(row[columns.notes] || '').trim() : '',
    rowIndex
  };
}

/**
 * Parse a full trainee tab.
 * @param {string} traineeName - tab title
 * @param {Array<Array<string>>} grid
 * @returns {Object} structured trainee plan history
 */
function parseTraineeTab(traineeName, grid) {
  const trainee = {
    name: traineeName,
    generalNotes: [],
    months: [],
    warnings: []
  };

  let currentMonth = null;
  let currentWorkout = null;
  let columns = null;

  const ensureMonth = () => {
    if (!currentMonth) {
      currentMonth = {
        label: 'ללא חודש',
        monthIndex: null,
        year: null,
        order: trainee.months.length,
        notes: [],
        workouts: []
      };
      trainee.months.push(currentMonth);
    }
    return currentMonth;
  };

  const ensureWorkout = () => {
    const month = ensureMonth();
    if (!currentWorkout) {
      currentWorkout = { label: `אימון ${month.workouts.length + 1}`, notes: [], exercises: [] };
      month.workouts.push(currentWorkout);
    }
    return currentWorkout;
  };

  grid.forEach((row, rowIndex) => {
    if (isEmptyRow(row)) return;

    // A title row repeating the trainee's name is not a coaching note
    if (rowIndex === 0 && nonEmptyCount(row) === 1) {
      const first = row.find(Boolean).trim();
      if (normalize(first) === normalize(traineeName)) return;
    }

    const month = detectMonth(row);
    if (month) {
      currentMonth = {
        ...month,
        order: trainee.months.length,
        notes: [],
        workouts: []
      };
      trainee.months.push(currentMonth);
      currentWorkout = null;
      columns = null;
      return;
    }

    const workout = detectWorkout(row);
    if (workout) {
      ensureMonth();
      currentWorkout = { label: workout.label, notes: [], exercises: [] };
      currentMonth.workouts.push(currentWorkout);
      return;
    }

    const header = detectHeader(row);
    if (header) {
      columns = header;
      return;
    }

    const note = detectNoteRow(row);
    if (note) {
      if (currentWorkout) currentWorkout.notes.push(note);
      else if (currentMonth) currentMonth.notes.push(note);
      else trainee.generalNotes.push(note);
      return;
    }

    if (columns) {
      const exercise = parseExerciseRow(row, columns, rowIndex);
      if (exercise) {
        ensureWorkout().exercises.push(exercise);
      }
      return;
    }

    // Text before any table - treat a sparse line as a general note
    if (!currentMonth && nonEmptyCount(row) <= 3) {
      trainee.generalNotes.push(row.filter(Boolean).join(' ').trim());
    }
  });

  if (!trainee.months.length) {
    trainee.warnings.push('לא זוהו חודשים או טבלאות תרגילים בלשונית');
  }

  const totalExercises = trainee.months.reduce(
    (sum, m) => sum + m.workouts.reduce((s, w) => s + w.exercises.length, 0),
    0
  );
  if (!totalExercises) {
    trainee.warnings.push('לא זוהו שורות תרגילים - בדוק שיש שורת כותרת עם "תרגיל" ו"משקל"');
  }

  return trainee;
}

/**
 * Sort months chronologically when dates are known, otherwise keep the
 * sheet order (assumed top = oldest).
 */
function sortMonths(months) {
  return [...months].sort((a, b) => {
    if (a.year && b.year && a.year !== b.year) return a.year - b.year;
    if (a.monthIndex && b.monthIndex && a.monthIndex !== b.monthIndex) {
      return a.monthIndex - b.monthIndex;
    }
    return a.order - b.order;
  });
}

module.exports = {
  parseTraineeTab,
  sortMonths,
  detectMonth,
  detectWorkout,
  detectHeader,
  detectNoteRow,
  parseWeight,
  parseSetsReps,
  normalize,
  HEBREW_MONTHS
};
