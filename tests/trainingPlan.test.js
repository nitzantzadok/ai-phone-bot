/**
 * Tests for the training plan parser + weekly plan generator.
 * The fixture mimics a hand written trainee tab: months as titles,
 * workouts as blocks, a notes column and free text "דגשים" rows.
 */

const {
  parseTraineeTab,
  parseWeight,
  parseSetsReps,
  detectMonth,
  detectHeader
} = require('../src/services/trainingPlan.parser');

const {
  generateWeeklyPlan,
  prescribe,
  analyzeExercise,
  isLowerBody,
  planToGrid,
  relevantCautionNotes,
  progressionStep
} = require('../src/services/trainingPlan.generator');

const { detectWorkout } = require('../src/services/trainingPlan.parser');

const traineeGrid = [
  ['דני כהן'],
  ['דגשים כלליים: לשים לב לגב תחתון בכל תרגיל דחיפה'],
  [],
  ['ינואר 2026'],
  ['אימון A'],
  ['תרגיל', 'סטים', 'חזרות', 'משקל', 'הערות'],
  ['סקוואט', '4', '8', '60', ''],
  ['לחיצת חזה', '3', '10', '40', 'לשמור מרפקים קרובים'],
  ['חתירה בישיבה', '3', '12', '35', ''],
  [],
  ['פברואר 2026'],
  ['אימון A'],
  ['תרגיל', 'סטים', 'חזרות', 'משקל', 'הערות'],
  ['סקוואט', '4', '8', '65', ''],
  ['לחיצת חזה', '3', '10', '40', 'כאב בכתף ימין'],
  ['חתירה בישיבה', '3', '12', '35', ''],
  ['מתח', '3', '8', 'משקל גוף', ''],
  ['דגשים: להוסיף חימום כתפיים לפני האימון']
];

describe('parseWeight', () => {
  test('parses a plain number', () => {
    expect(parseWeight('60').latest).toBe(60);
  });

  test('parses a number with a Hebrew unit', () => {
    expect(parseWeight('62.5 ק"ג').latest).toBe(62.5);
  });

  test('takes the last value of a progression list', () => {
    const result = parseWeight('60, 62.5, 65');
    expect(result.values).toEqual([60, 62.5, 65]);
    expect(result.latest).toBe(65);
  });

  test('flags bodyweight', () => {
    const result = parseWeight('משקל גוף');
    expect(result.bodyweight).toBe(true);
    expect(result.latest).toBeNull();
  });

  test('returns empty for a blank cell', () => {
    expect(parseWeight('').latest).toBeNull();
  });
});

describe('parseSetsReps', () => {
  test('parses separate columns', () => {
    expect(parseSetsReps('4', '8')).toMatchObject({ sets: 4, reps: 8 });
  });

  test('parses a combined 3x10 cell', () => {
    expect(parseSetsReps('3x10', '')).toMatchObject({ sets: 3, reps: 10 });
  });

  test('parses a reps range', () => {
    expect(parseSetsReps('3', '8-12')).toMatchObject({ sets: 3, repsRange: [8, 12] });
  });
});

describe('detectMonth', () => {
  test('detects a Hebrew month with a year', () => {
    expect(detectMonth(['ינואר 2026'])).toMatchObject({ monthIndex: 1, year: 2026 });
  });

  test('detects "חודש 3"', () => {
    expect(detectMonth(['חודש 3'])).toMatchObject({ monthIndex: 3 });
  });

  test('ignores a dense data row', () => {
    expect(detectMonth(['סקוואט', '4', '8', '60', 'הערה'])).toBeNull();
  });
});

describe('detectHeader', () => {
  test('maps header columns', () => {
    const columns = detectHeader(['תרגיל', 'סטים', 'חזרות', 'משקל', 'הערות']);
    expect(columns).toMatchObject({ exercise: 0, sets: 1, reps: 2, weight: 3, notes: 4 });
  });

  test('rejects a row without an exercise column', () => {
    expect(detectHeader(['סטים', 'חזרות'])).toBeNull();
  });
});

describe('parseTraineeTab', () => {
  const trainee = parseTraineeTab('דני כהן', traineeGrid);

  test('collects general notes', () => {
    expect(trainee.generalNotes.join(' ')).toContain('גב תחתון');
  });

  test('splits into months', () => {
    expect(trainee.months.map((m) => m.label)).toEqual(['ינואר 2026', 'פברואר 2026']);
  });

  test('parses exercises per workout', () => {
    const january = trainee.months[0];
    expect(january.workouts).toHaveLength(1);
    expect(january.workouts[0].exercises.map((e) => e.name)).toEqual([
      'סקוואט',
      'לחיצת חזה',
      'חתירה בישיבה'
    ]);
    expect(january.workouts[0].exercises[0]).toMatchObject({ sets: 4, reps: 8, weight: 60 });
  });

  test('keeps per exercise notes', () => {
    const february = trainee.months[1];
    const bench = february.workouts[0].exercises.find((e) => e.name === 'לחיצת חזה');
    expect(bench.notes).toBe('כאב בכתף ימין');
  });

  test('captures a trailing note row inside the workout', () => {
    const february = trainee.months[1];
    expect(february.workouts[0].notes.join(' ')).toContain('חימום כתפיים');
  });

  test('produces no warnings for a well formed tab', () => {
    expect(trainee.warnings).toEqual([]);
  });
});

describe('analyzeExercise', () => {
  test('detects an upward trend', () => {
    const analysis = analyzeExercise([
      { name: 'סקוואט', weight: 60, weightHistory: [60], sets: 4, reps: 8, monthLabel: 'ינואר' },
      { name: 'סקוואט', weight: 65, weightHistory: [65], sets: 4, reps: 8, monthLabel: 'פברואר' }
    ]);
    expect(analysis.trend).toBe('up');
    expect(analysis.lastWeight).toBe(65);
  });

  test('counts a stalled weight', () => {
    const analysis = analyzeExercise([
      { name: 'חתירה', weight: 35, weightHistory: [35], sets: 3, reps: 12, monthLabel: 'ינואר' },
      { name: 'חתירה', weight: 35, weightHistory: [35], sets: 3, reps: 12, monthLabel: 'פברואר' },
      { name: 'חתירה', weight: 35, weightHistory: [35], sets: 3, reps: 12, monthLabel: 'מרץ' }
    ]);
    expect(analysis.stalled).toBe(2);
  });
});

describe('prescribe', () => {
  test('adds load when the trend is up', () => {
    const result = prescribe({
      name: 'סקוואט',
      lastWeight: 65,
      prevWeight: 60,
      trend: 'up',
      stalled: 0,
      caution: false,
      lastSets: 4,
      lastReps: 8,
      notes: [],
      latestNote: ''
    });
    expect(result.weight).toBeGreaterThan(65);
  });

  test('holds the weight when a note mentions pain', () => {
    const result = prescribe({
      name: 'לחיצת חזה',
      lastWeight: 40,
      prevWeight: 40,
      trend: 'flat',
      stalled: 1,
      caution: true,
      lastSets: 3,
      lastReps: 10,
      notes: ['כאב בכתף ימין'],
      latestNote: 'כאב בכתף ימין'
    });
    expect(result.weight).toBe(40);
    expect(result.rationale).toContain('כאב');
  });

  test('adds a rep instead of load when stalled', () => {
    const result = prescribe({
      name: 'חתירה בישיבה',
      lastWeight: 35,
      prevWeight: 35,
      trend: 'flat',
      stalled: 2,
      caution: false,
      lastSets: 3,
      lastReps: 12,
      notes: [],
      latestNote: ''
    });
    expect(result.weight).toBe(35);
    expect(result.reps).toBe(13);
  });

  test('handles bodyweight exercises', () => {
    const result = prescribe({
      name: 'מתח',
      lastWeight: null,
      bodyweight: true,
      trend: 'new',
      stalled: 0,
      caution: false,
      lastSets: 3,
      lastReps: 8,
      notes: [],
      latestNote: ''
    });
    expect(result.display).toBe('משקל גוף');
  });
});

describe('isLowerBody', () => {
  test('recognizes squats', () => {
    expect(isLowerBody('סקוואט')).toBe(true);
  });

  test('does not flag bench press', () => {
    expect(isLowerBody('לחיצת חזה')).toBe(false);
  });
});

describe('generateWeeklyPlan', () => {
  const trainee = parseTraineeTab('דני כהן', traineeGrid);
  const plan = generateWeeklyPlan(trainee);

  test('builds on the latest month', () => {
    expect(plan.basedOnMonth).toBe('פברואר 2026');
  });

  test('carries the latest month workouts', () => {
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0].exercises.map((e) => e.name)).toContain('מתח');
  });

  test('raises the squat after two months of progress', () => {
    const squat = plan.workouts[0].exercises.find((e) => e.name === 'סקוואט');
    expect(squat.previousWeight).toBe(65);
    expect(squat.weight).toBeGreaterThan(65);
  });

  test('holds the bench press because of the shoulder note', () => {
    const bench = plan.workouts[0].exercises.find((e) => e.name === 'לחיצת חזה');
    expect(bench.weight).toBe(40);
  });

  test('renders a grid ready for the sheet', () => {
    const grid = planToGrid(plan, 'סיכום בדיקה');
    expect(grid[0][0]).toContain('דני כהן');
    expect(grid.some((row) => row[0] === 'תרגיל')).toBe(true);
  });
});

describe('detectWorkout', () => {
  test('detects a bare workout label', () => {
    expect(detectWorkout(['אימון A'])).toMatchObject({ label: 'אימון A' });
  });

  // Regression: \b is ASCII-only and never matches after Hebrew letters
  test('detects a workout label with a Hebrew suffix', () => {
    expect(detectWorkout(['אימון 1 - פלג גוף תחתון'])).toMatchObject({
      label: 'אימון 1 - פלג גוף תחתון'
    });
  });

  test('detects "יום 2"', () => {
    expect(detectWorkout(['יום 2'])).toMatchObject({ label: 'יום 2' });
  });

  test('ignores an exercise row', () => {
    expect(detectWorkout(['סקוואט', '4', '8', '60'])).toBeNull();
  });
});

describe('relevantCautionNotes', () => {
  const notes = ['מגבלת ברך שמאל - בלי עומס מקסימלי'];

  test('applies a knee note to lower body work', () => {
    expect(relevantCautionNotes('סקוואט', notes)).toHaveLength(1);
  });

  test('does not apply a knee note to shoulder press', () => {
    expect(relevantCautionNotes('לחיצת כתפיים', notes)).toHaveLength(0);
  });

  test('applies a note without a body part to everything', () => {
    expect(relevantCautionNotes('לחיצת כתפיים', ['לא לעלות במשקל החודש'])).toHaveLength(1);
  });

  test('ignores notes that carry no caution', () => {
    expect(relevantCautionNotes('סקוואט', ['להגיע 10 דקות לפני האימון'])).toHaveLength(0);
  });

  describe('a shoulder note', () => {
    const shoulderNote = ['כאב בכתף ימין בלחיצות מעל הראש'];

    test('freezes overhead pressing', () => {
      expect(relevantCautionNotes('לחיצת כתפיים בישיבה', shoulderNote)).toHaveLength(1);
    });

    test('freezes bench press', () => {
      expect(relevantCautionNotes('לחיצת חזה במוט', shoulderNote)).toHaveLength(1);
    });

    // Regression: "פולי" is a machine, not a muscle group
    test('does not freeze a triceps pushdown', () => {
      expect(relevantCautionNotes('פשיטת מרפק בפולי', shoulderNote)).toHaveLength(0);
    });

    test('does not freeze a lat pulldown', () => {
      expect(relevantCautionNotes('פולי עליון', shoulderNote)).toHaveLength(0);
    });

    test('does not freeze squats', () => {
      expect(relevantCautionNotes('סקוואט', shoulderNote)).toHaveLength(0);
    });
  });
});

describe('progressionStep', () => {
  test('uses 5kg for heavy lower body work', () => {
    expect(progressionStep('לג פרס', 80)).toBe(5);
  });

  test('uses 2.5kg for upper body work', () => {
    expect(progressionStep('פולי עליון', 32.5)).toBe(2.5);
  });

  test('shrinks the step for light weights', () => {
    expect(progressionStep('לחיצת כתפיים', 15)).toBe(1.25);
  });
});

describe('generateWeeklyPlan with per-workout splits', () => {
  const grid = [
    ['מיכל לוי'],
    ['דגשים כלליים: מגבלת ברך שמאל - בלי עומס מקסימלי'],
    [],
    ['ינואר 2026'],
    ['אימון 1 - פלג גוף תחתון'],
    ['תרגיל', 'סטים', 'חזרות', 'משקל עבודה', 'דגשים'],
    ['סקוואט', '3', '10', '45', ''],
    ['אימון 2 - פלג גוף עליון'],
    ['תרגיל', 'סטים', 'חזרות', 'משקל עבודה', 'דגשים'],
    ['לחיצת כתפיים', '3', '10', '15', '']
  ];

  const trainee = parseTraineeTab('מיכל לוי', grid);
  const plan = generateWeeklyPlan(trainee);

  test('does not treat the tab title as a coaching note', () => {
    expect(trainee.generalNotes.join(' ')).not.toContain('מיכל לוי');
  });

  test('keeps the two workouts separate', () => {
    expect(plan.workouts.map((w) => w.label)).toEqual([
      'אימון 1 - פלג גוף תחתון',
      'אימון 2 - פלג גוף עליון'
    ]);
  });

  test('holds the squat because of the knee note', () => {
    const squat = plan.workouts[0].exercises[0];
    expect(squat.weight).toBe(45);
    expect(squat.rationale).toContain('ברך');
  });

  test('still progresses the shoulder press', () => {
    const press = plan.workouts[1].exercises[0];
    expect(press.weight).toBe(16.25);
  });
});

describe('generateWeeklyPlan on an empty tab', () => {
  test('warns instead of throwing', () => {
    const trainee = parseTraineeTab('ריק', [['שם המתאמן']]);
    const plan = generateWeeklyPlan(trainee);
    expect(plan.workouts).toEqual([]);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
