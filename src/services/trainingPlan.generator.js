/**
 * Weekly Training Plan Generator
 *
 * Takes the parsed history of a trainee (all months, all working weights,
 * all coaching notes) and produces next week's plan.
 *
 * The load numbers are computed deterministically from the history so the
 * output is reproducible and auditable. GPT is used only to phrase the
 * coaching summary in Hebrew - it never changes the weights.
 */

const logger = require('../utils/logger');
const { sortMonths } = require('./trainingPlan.parser');

// Notes that mean "do not add load this week".
// Written as stems so inflections match too ("מגבלה" / "מגבלת").
const CAUTION_KEYWORDS = [
  'כאב', 'פציע', 'פצוע', 'דלקת', 'מגבל', 'זהירות', 'תקוע',
  'לא לעלות', 'לשמור משקל', 'להוריד משקל', 'טכניקה', 'שיקום', 'עייפות', 'עומס יתר'
];

/**
 * Body parts that can appear in a coaching note, mapped to the exercises
 * they actually affect. A note about a knee should not freeze the shoulder
 * press, so a general note is applied only to the matching exercises.
 */
const BODY_PART_MAP = [
  {
    part: ['ברך', 'ברכי', 'רגל', 'רגליים', 'ירך', 'קרסול'],
    exercises: ['סקוואט', 'סקווט', 'squat', 'לג פרס', 'leg press', 'מכרעים', 'לאנג', 'lunge',
      'רגליים', 'ברך', 'עגלה', 'דדליפט', 'רומנית', 'היפ תרסט']
  },
  {
    part: ['כתף', 'כתפיים'],
    exercises: ['לחיצת חזה', 'לחיצת כתפיים', 'חזה', 'כתפיים', 'הרחקה', 'מקבילים',
      'שכיבות סמיכה', 'מתח', 'פולי', 'bench', 'press']
  },
  {
    part: ['גב תחתון', 'גב', 'עמוד שדרה'],
    exercises: ['דדליפט', 'deadlift', 'רומנית', 'סקוואט', 'חתירה', 'גב', 'היפ תרסט']
  },
  {
    part: ['מרפק', 'שורש כף יד', 'יד'],
    exercises: ['כפיפת מרפק', 'פשיטת מרפק', 'יד קדמית', 'יד אחורית', 'בייספס',
      'טרייספס', 'curl', 'extension']
  }
];

// Multi-joint lower body work tolerates bigger jumps
const LOWER_BODY_KEYWORDS = [
  'סקוואט', 'סקווט', 'squat', 'דדליפט', 'deadlift', 'רומנית', 'רגליים',
  'לג פרס', 'leg press', 'מכרעים', 'לאנג', 'lunge', 'היפ תרסט', 'hip thrust', 'עגלה'
];

const DEFAULT_INCREMENT_UPPER = 2.5;
const DEFAULT_INCREMENT_LOWER = 5;

function containsAny(text, keywords) {
  const lower = String(text || '').toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function isLowerBody(exerciseName) {
  return containsAny(exerciseName, LOWER_BODY_KEYWORDS);
}

/**
 * Which of the trainee's free-text notes actually apply to this exercise.
 * A caution note naming a body part applies only to exercises for that
 * body part; a caution note without a body part applies to everything.
 * @returns {Array<string>} the applicable caution notes
 */
function relevantCautionNotes(exerciseName, notes = []) {
  return notes.filter((note) => {
    if (!containsAny(note, CAUTION_KEYWORDS)) return false;

    const mentionedParts = BODY_PART_MAP.filter((entry) => containsAny(note, entry.part));
    if (!mentionedParts.length) return true;

    return mentionedParts.some((entry) => containsAny(exerciseName, entry.exercises));
  });
}

/**
 * How much load to add for one exercise.
 * Base step is 5kg for multi-joint lower body work and 2.5kg elsewhere,
 * reduced for light exercises so the jump never exceeds ~10%.
 */
function progressionStep(exerciseName, currentWeight) {
  const base = isLowerBody(exerciseName) ? DEFAULT_INCREMENT_LOWER : DEFAULT_INCREMENT_UPPER;
  if (!Number.isFinite(currentWeight) || currentWeight <= 0) return base;

  if (base <= currentWeight * 0.1) return base;

  const scaled = roundToIncrement(currentWeight * 0.05, 1.25);
  return Math.max(scaled, 1.25);
}

function roundToIncrement(value, increment) {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value / increment) * increment;
  return Number(rounded.toFixed(2));
}

/** Trim trailing zeros so "2.50" reads as "2.5" and "5.00" as "5" */
function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

/**
 * Collect every appearance of every exercise across the trainee's history,
 * oldest first.
 * @returns {Map<string, Array<Object>>} keyed by normalized exercise name
 */
function buildExerciseHistory(trainee) {
  const history = new Map();
  const months = sortMonths(trainee.months);

  months.forEach((month) => {
    month.workouts.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const key = exercise.name.trim().toLowerCase();
        if (!history.has(key)) history.set(key, []);
        history.get(key).push({
          monthLabel: month.label,
          monthOrder: month.order,
          workoutLabel: workout.label,
          name: exercise.name,
          weight: exercise.weight,
          weightHistory: exercise.weightHistory,
          bodyweight: exercise.bodyweight,
          sets: exercise.sets,
          reps: exercise.reps,
          repsRange: exercise.repsRange,
          notes: exercise.notes
        });
      });
    });
  });

  return history;
}

/**
 * Analyze one exercise: what happened to its working weight over time.
 */
function analyzeExercise(entries) {
  const withWeight = entries.filter((e) => Number.isFinite(e.weight));
  const latest = entries[entries.length - 1];
  const lastWeighted = withWeight[withWeight.length - 1] || null;
  const prevWeighted = withWeight[withWeight.length - 2] || null;

  // Flatten every recorded load, including multiple loads inside one cell
  const loadTimeline = entries.flatMap((e) =>
    (e.weightHistory && e.weightHistory.length ? e.weightHistory : Number.isFinite(e.weight) ? [e.weight] : [])
  );

  let trend = 'new';
  if (lastWeighted && prevWeighted) {
    if (lastWeighted.weight > prevWeighted.weight) trend = 'up';
    else if (lastWeighted.weight < prevWeighted.weight) trend = 'down';
    else trend = 'flat';
  } else if (lastWeighted) {
    trend = loadTimeline.length > 1 ? 'up' : 'new';
  }

  // How many consecutive appearances sat on the same weight
  let stalled = 0;
  if (lastWeighted) {
    for (let i = withWeight.length - 1; i > 0; i -= 1) {
      if (withWeight[i].weight === withWeight[i - 1].weight) stalled += 1;
      else break;
    }
  }

  const allNotes = entries.map((e) => e.notes).filter(Boolean);
  const caution = allNotes.some((n) => containsAny(n, CAUTION_KEYWORDS));

  return {
    name: latest.name,
    appearances: entries.length,
    lastWeight: lastWeighted ? lastWeighted.weight : null,
    prevWeight: prevWeighted ? prevWeighted.weight : null,
    maxWeight: loadTimeline.length ? Math.max(...loadTimeline) : null,
    bodyweight: latest.bodyweight,
    lastSets: latest.sets,
    lastReps: latest.reps,
    lastRepsRange: latest.repsRange,
    lastMonth: latest.monthLabel,
    trend,
    stalled,
    caution,
    notes: allNotes,
    latestNote: latest.notes || ''
  };
}

/**
 * Decide next week's prescription for one exercise.
 */
function prescribe(analysis, traineeNotes = []) {
  const applicableNotes = relevantCautionNotes(analysis.name, traineeNotes);
  const sets = analysis.lastSets || 3;
  const reps = analysis.lastReps || (analysis.lastRepsRange ? analysis.lastRepsRange[1] : 10);

  const base = {
    name: analysis.name,
    sets,
    reps: analysis.lastRepsRange ? `${analysis.lastRepsRange[0]}-${analysis.lastRepsRange[1]}` : reps,
    previousWeight: analysis.lastWeight,
    weight: analysis.lastWeight,
    change: 0,
    rationale: ''
  };

  if (analysis.bodyweight || !Number.isFinite(analysis.lastWeight)) {
    return {
      ...base,
      weight: null,
      display: analysis.bodyweight ? 'משקל גוף' : '-',
      rationale: analysis.bodyweight
        ? `משקל גוף - להוסיף חזרה אחת לסט מעבר לשבוע שעבר`
        : 'לא נרשם משקל עבודה בחודשים הקודמים - לקבוע משקל במקום'
    };
  }

  if (analysis.caution || applicableNotes.length) {
    const reason = analysis.caution ? analysis.latestNote : applicableNotes[0];
    return {
      ...base,
      display: `${analysis.lastWeight} ק"ג`,
      rationale: `שמירה על אותו משקל בגלל דגש שנרשם: "${reason}"`
    };
  }

  if (analysis.trend === 'down') {
    return {
      ...base,
      display: `${analysis.lastWeight} ק"ג`,
      rationale: 'המשקל ירד בחודש האחרון - לחזור על אותו משקל ולוודא ביצוע נקי לפני עלייה'
    };
  }

  if (analysis.stalled >= 2) {
    return {
      ...base,
      sets,
      reps: typeof base.reps === 'number' ? base.reps + 1 : base.reps,
      display: `${analysis.lastWeight} ק"ג`,
      rationale: `המשקל תקוע ${analysis.stalled} מחזורים - אותו משקל עם חזרה נוספת בכל סט במקום עלייה`
    };
  }

  const step = progressionStep(analysis.name, analysis.lastWeight);
  const nextWeight = roundToIncrement(analysis.lastWeight + step, 1.25);

  return {
    ...base,
    weight: nextWeight,
    change: Number((nextWeight - analysis.lastWeight).toFixed(2)),
    display: `${nextWeight} ק"ג`,
    rationale:
      analysis.trend === 'up'
        ? `מגמת עלייה מ-${analysis.prevWeight} ל-${analysis.lastWeight} ק"ג - להמשיך עם +${formatNumber(nextWeight - analysis.lastWeight)} ק"ג`
        : `עלייה מדורגת מ-${analysis.lastWeight} ק"ג לפי הביצוע האחרון`
  };
}

/**
 * Build next week's plan for one trainee.
 * @param {Object} trainee - output of parseTraineeTab
 * @returns {Object} plan
 */
function generateWeeklyPlan(trainee) {
  const months = sortMonths(trainee.months);
  const latestMonth = months[months.length - 1];

  if (!latestMonth || !latestMonth.workouts.length) {
    return {
      trainee: trainee.name,
      basedOnMonth: null,
      workouts: [],
      notes: trainee.generalNotes,
      warnings: [...trainee.warnings, 'אין חודש אחרון עם אימונים - לא נוצרה תכנית']
    };
  }

  const history = buildExerciseHistory(trainee);
  const traineeNotes = [
    ...trainee.generalNotes,
    ...months.flatMap((m) => m.notes),
    ...months.flatMap((m) => m.workouts.flatMap((w) => w.notes))
  ].filter(Boolean);

  const workouts = latestMonth.workouts.map((workout) => ({
    label: workout.label,
    notes: workout.notes,
    exercises: workout.exercises.map((exercise) => {
      const key = exercise.name.trim().toLowerCase();
      const entries = history.get(key) || [exercise];
      const analysis = analyzeExercise(entries);
      const prescription = prescribe(analysis, traineeNotes);
      return { ...prescription, analysis };
    })
  }));

  return {
    trainee: trainee.name,
    basedOnMonth: latestMonth.label,
    monthsAnalyzed: months.map((m) => m.label),
    workouts,
    notes: traineeNotes,
    warnings: trainee.warnings
  };
}

/**
 * Optional: phrase a short Hebrew coaching summary with GPT.
 * Falls back to a deterministic summary when no API key is configured.
 * The weights in `plan` are never modified.
 */
async function summarizePlan(plan) {
  const deterministic = buildFallbackSummary(plan);

  if (!process.env.OPENAI_API_KEY) {
    return deterministic;
  }

  try {
    // Required lazily so the deterministic path works without the SDK
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL_FAST || 'gpt-3.5-turbo';

    const context = plan.workouts
      .map((w) => {
        const lines = w.exercises
          .map((e) => `- ${e.name}: ${e.display} ${e.sets}x${e.reps} (${e.rationale})`)
          .join('\n');
        return `${w.label}\n${lines}`;
      })
      .join('\n\n');

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 300,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'אתה מאמן כוח. נסח סיכום קצר בעברית (עד 5 שורות) למתאמן על התכנית לשבוע הקרוב. ' +
            'אל תשנה משקלים, סטים או חזרות - רק הסבר את ההיגיון ואת הדגשים. בלי כותרות ובלי אימוג׳ים.'
        },
        {
          role: 'user',
          content: `מתאמן: ${plan.trainee}\nדגשים שנרשמו: ${plan.notes.join(' | ') || 'אין'}\n\n${context}`
        }
      ]
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text || deterministic;
  } catch (err) {
    logger.warn('GPT summary failed, using deterministic summary', { error: err.message });
    return deterministic;
  }
}

function buildFallbackSummary(plan) {
  const increases = plan.workouts
    .flatMap((w) => w.exercises)
    .filter((e) => e.change > 0);
  const holds = plan.workouts
    .flatMap((w) => w.exercises)
    .filter((e) => e.change === 0 && e.previousWeight);

  const parts = [
    `התכנית נבנתה על בסיס ${plan.basedOnMonth || 'החודש האחרון'} ומכל היסטוריית המשקלים בגיליון.`
  ];

  if (increases.length) {
    parts.push(`עלייה במשקל ב-${increases.length} תרגילים: ${increases.map((e) => e.name).join(', ')}.`);
  }
  if (holds.length) {
    parts.push(`שמירה על אותו משקל ב-${holds.length} תרגילים בהתאם לדגשים ולביצוע האחרון.`);
  }
  if (plan.notes.length) {
    parts.push(`דגשים פתוחים: ${plan.notes.slice(0, 3).join(' | ')}.`);
  }

  return parts.join(' ');
}

/**
 * Render the plan as a 2D array ready to be written into a sheet tab.
 */
function planToGrid(plan, summary) {
  const rows = [];

  rows.push([`תכנית שבועית - ${plan.trainee}`]);
  rows.push([`נבנתה על בסיס: ${plan.basedOnMonth || '-'}`]);
  rows.push([`חודשים שנותחו: ${(plan.monthsAnalyzed || []).join(', ') || '-'}`]);
  if (summary) {
    rows.push(['סיכום', summary]);
  }
  rows.push([]);

  plan.workouts.forEach((workout) => {
    rows.push([workout.label]);
    if (workout.notes && workout.notes.length) {
      rows.push(['דגשים לאימון', workout.notes.join(' | ')]);
    }
    rows.push(['תרגיל', 'סטים', 'חזרות', 'משקל עבודה', 'משקל קודם', 'הסבר']);

    workout.exercises.forEach((exercise) => {
      rows.push([
        exercise.name,
        exercise.sets ?? '',
        exercise.reps ?? '',
        exercise.display ?? '',
        exercise.previousWeight ?? '',
        exercise.rationale
      ]);
    });

    rows.push([]);
  });

  if (plan.notes.length) {
    rows.push(['דגשים כלליים']);
    plan.notes.forEach((note) => rows.push([note]));
    rows.push([]);
  }

  if (plan.warnings.length) {
    rows.push(['אזהרות פרסור']);
    plan.warnings.forEach((warning) => rows.push([warning]));
  }

  return rows;
}

module.exports = {
  generateWeeklyPlan,
  summarizePlan,
  planToGrid,
  analyzeExercise,
  buildExerciseHistory,
  prescribe,
  relevantCautionNotes,
  progressionStep,
  isLowerBody,
  roundToIncrement,
  CAUTION_KEYWORDS,
  BODY_PART_MAP
};
