/**
 * Tests for the coach sheet parser.
 * The fixtures reproduce quirks found in the real spreadsheet: a stray
 * "שם המתאמן" label on its own row, the rest/cue columns swapped relative
 * to their headers, and messy weight cells.
 */

const {
  parseCoachTab,
  parseWeekLabel,
  parseWeightCell,
  parseRepsCell,
  collectNotes,
  toGeneratorShape,
  isWorkoutLabel,
  isFirstSlot
} = require('../src/services/trainingPlan.coachSheet');

const { generateWeeklyPlan, isNegatedCaution } = require('../src/services/trainingPlan.generator');

const HEADER = ['חודש/      שבועות', 'מספר התרגיל', 'שם התרגיל + דגש ביצוע',
  'משקל ק״ג', 'חזרות', 'סטים', 'הערות + דגשים', 'מנוחה', 'הערות - טל'];

const PROFILE = [
  ['תאריך', 'שם המתאמן', 'היסטוריה רפואית + פציעות', 'משקל', 'אחוזי שומן', 'גיל',
    'מטרות אישיות', 'מספר אימונים', 'הערות - טל'],
  ['2.2', 'נועה קרן', 'ברכיים - גב - כתפיים', '48', '28.00%', '15',
    'עלייה במשקל', '2 אישי', 'דגש תרגילים מורכבים'],
  ['', '', '', '', '', '', 'להתמיד בשגרה', '', 'לבנות בסיס טוב וחזק']
];

function buildTab(weeks) {
  return [...PROFILE, HEADER, ...weeks];
}

describe('parseWeekLabel', () => {
  test('parses a month and week', () => {
    expect(parseWeekLabel('מאי-שבוע 2')).toMatchObject({ month: 'מאי', weekNumber: 2 });
  });

  test('returns null for an exercise row', () => {
    expect(parseWeekLabel('אימון ראשון שבועי-')).toBeNull();
  });
});

describe('isWorkoutLabel / isFirstSlot', () => {
  test('recognizes a workout label', () => {
    expect(isWorkoutLabel('אימון ראשון שבועי-')).toBe(true);
  });

  test('rejects a week label', () => {
    expect(isWorkoutLabel('מאי-שבוע 2')).toBe(false);
  });

  test('recognizes the first exercise slot', () => {
    expect(isFirstSlot('תרגיל 1')).toBe(true);
    expect(isFirstSlot('תרגיל 2')).toBe(false);
  });
});

describe('parseWeightCell', () => {
  test('parses a plain number', () => {
    expect(parseWeightCell('45').top).toBe(45);
  });

  test('takes the top of a range', () => {
    expect(parseWeightCell('15-17.5').top).toBe(17.5);
  });

  test('handles a comma decimal inside a range', () => {
    expect(parseWeightCell('12,5-15')).toMatchObject({ top: 15, values: [12.5, 15] });
  });

  test('reads a unit suffix', () => {
    expect(parseWeightCell('40 קילו')).toMatchObject({ top: 40, unit: 'kg' });
  });

  test('flags plates as their own unit', () => {
    expect(parseWeightCell('8-9 פלט')).toMatchObject({ top: 9, unit: 'plate' });
  });

  test('keeps free text as a note', () => {
    expect(parseWeightCell('כל המכונה')).toMatchObject({ top: null, note: 'כל המכונה' });
  });

  test('treats 0 as bodyweight', () => {
    expect(parseWeightCell('0')).toMatchObject({ bodyweight: true, top: null });
  });
});

describe('parseRepsCell', () => {
  test('parses a single value', () => {
    expect(parseRepsCell('12').reps).toBe(12);
  });

  test('parses a range', () => {
    expect(parseRepsCell('10-12')).toMatchObject({ reps: 12, range: [10, 12] });
  });

  test('survives a typo like 120-12', () => {
    expect(parseRepsCell('120-12').reps).toBe(12);
  });
});

describe('parseCoachTab', () => {
  const tab = buildTab([
    ['מאי-שבוע 1', 'תרגיל 1', 'לחיצת חזה מוט', '45', '8', '3', '', '90', ''],
    ['אימון ראשון שבועי-', 'תרגיל 2', 'חתירה משולש', '50', '10-12', '4', 'מוט רחב', '90', ''],
    ['אימון שני שבועי-', 'תרגיל 1', 'סקוואט', '30', '12', '3', '', '60', ''],
    ['מאי-שבוע 2', 'תרגיל 1', 'לחיצת חזה מוט', '47.5', '8', '3', '', '90', ''],
    ['אימון ראשון שבועי-', 'תרגיל 2', 'חתירה משולש', '55', '10-12', '4', '', '90', ''],
    ['אימון שני שבועי-', 'תרגיל 1', 'סקוואט', '35', '12', '3', '', '60', ''],
    ['מאי-שבוע 3', 'תרגיל 1', '', '', '', '', '', '', '']
  ]);

  const trainee = parseCoachTab('נועה קרן', tab);

  test('reads the profile', () => {
    expect(trainee.profile.medical).toEqual(['ברכיים - גב - כתפיים']);
    expect(trainee.profile.sessionsPerWeek).toBe(2);
    expect(trainee.profile.age).toBe('15');
  });

  test('collects multi-row coach notes', () => {
    expect(trainee.profile.coachNotes).toEqual(['דגש תרגילים מורכבים', 'לבנות בסיס טוב וחזק']);
  });

  test('collects multi-row goals', () => {
    expect(trainee.profile.goals).toEqual(['עלייה במשקל', 'להתמיד בשגרה']);
  });

  test('splits into week blocks, dropping empty ones', () => {
    expect(trainee.weeks.map((w) => w.label)).toEqual(['מאי-שבוע 1', 'מאי-שבוע 2']);
    expect(trainee.plannedWeeks).toBe(3);
  });

  test('splits each week into workouts on the slot reset', () => {
    expect(trainee.weeks[0].workouts).toHaveLength(2);
    expect(trainee.weeks[0].workouts[0].exercises.map((e) => e.name))
      .toEqual(['לחיצת חזה מוט', 'חתירה משולש']);
  });

  test('names the workout from the label inside its rows', () => {
    expect(trainee.weeks[0].workouts[0].label).toBe('אימון ראשון שבועי');
  });

  test('keeps the execution cue', () => {
    expect(trainee.weeks[0].workouts[0].exercises[1].cue).toBe('מוט רחב');
  });

  test('parses with no warnings', () => {
    expect(trainee.warnings).toEqual([]);
  });
});

describe('rest and cue columns swapped in the header', () => {
  // One tab labels the columns the other way round while storing the data
  // in the usual order, so the labels must not be trusted
  const swappedHeader = ['חודש/      שבועות', 'מספר התרגיל', 'שם התרגיל + דגש ביצוע',
    'משקל ק״ג', 'חזרות', 'סטים', 'מנוחה', 'הערות + דגשים', ''];

  const tab = [
    ...PROFILE,
    swappedHeader,
    ['מאי-שבוע 1', 'תרגיל 1', 'לחיצת חזה מוט', '45', '8', '3', 'סופרסט', '90', ''],
    ['אימון ראשון שבועי-', 'תרגיל 2', 'לאנג', '7', '12', '3', 'בולגרי', '60', ''],
    ['', 'תרגיל 3', 'הרחקות כתף', '4', '12', '3', 'מהקונצנטרי', '90', '']
  ];

  const trainee = parseCoachTab('יהוא', tab);
  const first = trainee.weeks[0].workouts[0].exercises[0];

  test('detects the swap from the data', () => {
    expect(trainee.columns.restCueSwapped).toBe(true);
  });

  test('puts the seconds in rest', () => {
    expect(first.rest).toBe('90');
  });

  test('puts the text in the cue', () => {
    expect(first.cue).toBe('סופרסט');
  });
});

describe('a stray name label above the real header row', () => {
  const tab = [
    ['', '', 'שם המתאמן', '', '', '', '', '', ''],
    ['תאריך', 'יהוא אמיר', 'היסטוריה רפואית + פציעות', 'משקל', 'אחוזי שומן', 'גיל',
      'מטרות אישיות', 'מספר אימונים', 'הערות - טל'],
    ['4.6.25', '', 'ירד הרבה במשקל', '73', '27%', '15', 'לחטב את הגוף', '2',
      'לחזק חגורת כתפיים'],
    HEADER,
    ['מאי-שבוע 1', 'תרגיל 1', 'לחיצת חזה מוט', '45', '8', '3', '', '90', '']
  ];

  const trainee = parseCoachTab('יהוא', tab);

  test('picks the row with the most labels', () => {
    expect(trainee.profile.medical).toEqual(['ירד הרבה במשקל']);
    expect(trainee.profile.age).toBe('15');
  });

  test('does not mistake a label for the trainee name', () => {
    expect(trainee.name).toBe('יהוא');
  });
});

describe('collectNotes', () => {
  test('flags a medical entry naming body parts', () => {
    const trainee = parseCoachTab('נועה קרן', buildTab([
      ['מאי-שבוע 1', 'תרגיל 1', 'סקוואט', '30', '12', '3', '', '60', '']
    ]));
    expect(collectNotes(trainee)).toContain('מגבלה רפואית: ברכיים - גב - כתפיים');
  });

  test('does not flag a general remark that happens to sit in the medical column', () => {
    const profile = [
      ['תאריך', 'שם המתאמן', 'היסטוריה רפואית + פציעות', 'משקל', 'אחוזי שומן', 'גיל',
        'מטרות אישיות', 'מספר אימונים', 'הערות - טל'],
      ['4.6', 'יהוא', 'ירד הרבה במשקל', '73', '27%', '15', 'לחטב', '2', '']
    ];
    const trainee = parseCoachTab('יהוא', [...profile, HEADER,
      ['מאי-שבוע 1', 'תרגיל 1', 'סקוואט', '30', '12', '3', '', '60', '']]);

    const notes = collectNotes(trainee);
    expect(notes).toContain('ירד הרבה במשקל');
    expect(notes.some((n) => n.startsWith('מגבלה רפואית'))).toBe(false);
  });
});

describe('isNegatedCaution', () => {
  test('treats "ללא כאב" as no limitation', () => {
    expect(isNegatedCaution('ללא כאב כתפיים-משולב')).toBe(true);
  });

  test('still catches a real complaint', () => {
    expect(isNegatedCaution('כאב בכתף ימין')).toBe(false);
  });

  test('is false when there is no caution word at all', () => {
    expect(isNegatedCaution('לעבוד על טווח תנועה')).toBe(false);
  });
});

describe('end to end on a coach tab', () => {
  // This trainee's medical entry names knees, back and shoulders, so only
  // the elbow work is free to progress
  const tab = buildTab([
    ['מאי-שבוע 1', 'תרגיל 1', 'לחיצת חזה מוט', '45', '8', '3', '', '90', ''],
    ['אימון ראשון שבועי-', 'תרגיל 2', 'סקוואט', '30', '12', '3', '', '60', ''],
    ['', 'תרגיל 3', 'כפיפת מרפק סופינציה', '10', '12', '3', '', '60', ''],
    ['מאי-שבוע 2', 'תרגיל 1', 'לחיצת חזה מוט', '50', '8', '3', '', '90', ''],
    ['אימון ראשון שבועי-', 'תרגיל 2', 'סקוואט', '35', '12', '3', '', '60', ''],
    ['', 'תרגיל 3', 'כפיפת מרפק סופינציה', '12', '12', '3', '', '60', '']
  ]);

  const plan = generateWeeklyPlan(toGeneratorShape(parseCoachTab('נועה קרן', tab)));
  const find = (name) => plan.workouts[0].exercises.find((e) => e.name === name);

  test('builds on the latest filled week', () => {
    expect(plan.basedOnMonth).toBe('מאי-שבוע 2');
  });

  test('progresses an exercise the limitation does not touch', () => {
    expect(find('כפיפת מרפק סופינציה').weight).toBeGreaterThan(12);
  });

  test('holds the squat because of the knee limitation', () => {
    const squat = find('סקוואט');
    expect(squat.weight).toBe(35);
    expect(squat.rationale).toContain('מגבלה רפואית');
  });

  test('holds the bench press because of the shoulder limitation', () => {
    expect(find('לחיצת חזה מוט').weight).toBe(50);
  });
});
