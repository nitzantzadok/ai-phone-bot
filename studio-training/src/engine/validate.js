/**
 * בקרת איכות על התכנית המוגמרת.
 *
 * זו רשת הביטחון: גם אם הבורר טעה, הבדיקות כאן יתפסו תכנית לא מאוזנת,
 * תרגיל אסור שחמק, אימון ארוך מדי, או שריר שנשכח.
 * שגיאה (error) = אסור להגיש למאמן. אזהרה = להציג ולתת למאמן להחליט.
 */

import { getExercise } from '../domain/exercises.js';
import { MUSCLE_ROLE, SPORTS } from '../domain/taxonomy.js';
import { constraintCheck, equipmentCheck, spaceCheck } from './filters.js';
import { ageAdjustments } from './prescription.js';
import { muscleLabel } from '../domain/labels.js';

const MAJOR = ['chest', 'back_lats', 'back_upper', 'delts_side', 'quads', 'hamstrings', 'glutes'];

/**
 * סובלנות נפח לפי שריר. ישבן וליבה מקבלים גירוי כמעט מכל תרגיל תחתון,
 * ולכן ספירת סטים "ישירה" עבורם תמיד גבוהה — ואין בכך בעיה אמיתית.
 */
const VOLUME_TOLERANCE = { glutes: 2.0, quads: 1.6, hamstrings: 1.5, core_anterior: 2.0, core_lateral: 2.0, core_posterior: 2.0 };

export function runQualityChecks(program, trainee, studio) {
  const issues = [];
  const add = (level, code, message, data) => issues.push({ level, code, message, ...(data ? { data } : {}) });

  // --- 1. כפילויות ותרגילים אסורים
  for (const day of program.days) {
    const seen = new Set();
    for (const b of day.blocks) {
      if (seen.has(b.exercise.id)) add('error', 'duplicate_exercise', `${day.dayLabel}: התרגיל "${b.exercise.name}" מופיע פעמיים באותו אימון.`);
      seen.add(b.exercise.id);

      const ex = getExercise(b.exercise.id);
      const cc = constraintCheck(ex, trainee);
      if (!cc.allowed) {
        add('error', 'contraindicated', `${day.dayLabel}: "${ex.name}" אינו מתאים למגבלות המתאמן.`, cc.reasons);
      }
      const eq = equipmentCheck(ex, studio, trainee.equipmentBlocklist, { travelWeek: trainee.travelWeek });
      if (!eq.ok) add('error', 'equipment_missing', `${day.dayLabel}: אין בסטודיו ציוד ל"${ex.name}".`, eq.missing);

      const sp = spaceCheck(ex, studio);
      if (!sp.ok) add('error', 'space_conflict', `${day.dayLabel}: "${ex.name}" אינו מתאים למרחב הסטודיו.`, sp.reasons);

      if (rxIntensityTooHigh(b.prescription, trainee)) {
        add('error', 'intensity_over_age_cap', `${day.dayLabel}: "${ex.name}" בעצימות ${b.prescription.intensityPct[1]}% — מעל התקרה לגיל המתאמן.`);
      }

      const rx = b.prescription;
      const rangeChecked = ex.type !== 'conditioning' && ex.type !== 'mobility';
      if (rangeChecked && (rx.repsMin < ex.repMin || rx.repsMax > ex.repMax)) {
        add('warning', 'rep_range', `"${ex.name}": טווח החזרות ${rx.reps} חורג מהטווח המומלץ לתרגיל (${ex.repMin}-${ex.repMax}).`);
      }
      if (rx.sets < 1) add('error', 'bad_sets', `"${ex.name}": מספר סטים לא תקין.`);
    }
    if (day.droppedForTime?.length) {
      add('info', 'dropped_for_time', `${day.dayLabel}: ${day.droppedForTime.join(', ')} הושמט בשל מגבלת זמן האימון.`);
    }
    if (day.unfilledSlots.length) {
      add('warning', 'unfilled_slot', `${day.dayLabel}: לא נמצא תרגיל מתאים למשבצת ${day.unfilledSlots.join(', ')} — ככל הנראה חוסר ציוד או מגבלה רפואית.`);
    }
    if (day.blocks.length < 3) add('warning', 'thin_day', `${day.dayLabel}: האימון דל מדי (${day.blocks.length} תרגילים).`);

    const planned = day.sessionMinutes || trainee.sessionMinutes;
    const over = day.estimatedMinutes - planned;
    if (over > planned * 0.15) {
      add('warning', 'too_long', `${day.dayLabel}: אומדן ${day.estimatedMinutes} דק' מול ${planned} דק' מתוכננות.`);
    } else if (over < -planned * 0.3) {
      add('info', 'short_session', `${day.dayLabel}: אומדן ${day.estimatedMinutes} דק' — יש מקום לתרגיל עזר נוסף.`);
    }
  }

  // --- 2. איזון דחיפה/משיכה
  const roleSets = { push: 0, pull: 0, legs: 0, core: 0 };
  for (const [muscle, sets] of Object.entries(program.weeklyVolume)) {
    const role = MUSCLE_ROLE[muscle];
    if (role) roleSets[role] += sets;
  }
  if (roleSets.push > 0 && roleSets.pull > 0) {
    const ratio = roleSets.push / roleSets.pull;
    if (ratio > 1.6) add('warning', 'push_pull_imbalance', `יחס דחיפה/משיכה ${ratio.toFixed(2)} — עודף דחיפה עלול להעמיס על הכתף הקדמית.`);
    if (ratio < 0.55) add('info', 'pull_dominant', `יחס דחיפה/משיכה ${ratio.toFixed(2)} — התכנית נוטה למשיכה, מקובל למטרת יציבה.`);
  } else if (roleSets.pull === 0 && roleSets.push > 0) {
    const pullAvailable = ['horizontal_pull', 'vertical_pull']
      .some((p) => (program.meta?.poolCoverage?.byPattern || {})[p]);
    if (pullAvailable) {
      add('error', 'no_pull', 'אין בתכנית עבודת משיכה כלל, למרות שקיימים תרגילי משיכה מתאימים.');
    } else {
      add('warning', 'no_pull_possible',
        'אין בתכנית עבודת משיכה — לא קיים בסטודיו תרגיל משיכה שעומד במגבלות המתאמן. מומלץ להוסיף גומיית התנגדות או עמדת חתירה.');
    }
  }

  // --- 3. כיסוי שרירים ותדירות
  const freq = {};
  for (const day of program.days) {
    const inDay = new Set();
    for (const b of day.blocks) for (const m of b.exercise.primary) inDay.add(m);
    for (const m of inDay) freq[m] = (freq[m] || 0) + 1;
  }
  for (const m of MAJOR) {
    const sets = program.weeklyVolume[m] || 0;
    if (sets === 0) {
      add(trainee.daysPerWeek >= 3 ? 'warning' : 'info', 'muscle_uncovered', `לא נמצאה עבודה ישירה עבור ${muscleLabel(m)} השבוע.`);
    } else if (sets < program.volumeTarget.min * 0.5) {
      add('info', 'low_volume', `${muscleLabel(m)}: ${sets} סטים — מתחת ליעד השבועי (${program.volumeTarget.min}).`);
    } else if (sets > program.volumeTarget.max * (VOLUME_TOLERANCE[m] || 1.4)) {
      // אם זה שריר שהמתאמן ביקש למקד — הנפח הגבוה מכוון, ולכן מידע ולא אזהרה.
      const intentional = trainee.focusMuscles.includes(m);
      add(intentional ? 'info' : 'warning', 'high_volume',
        `${muscleLabel(m)}: ${sets} סטים — מעל היעד השבועי (${program.volumeTarget.max})${intentional ? ', בהתאם לשריר המיקוד שנבחר.' : '; סיכון להתאוששות חסרה.'}`);
    }
    if (trainee.daysPerWeek >= 3 && sets > 0 && (freq[m] || 0) < 2) {
      add('info', 'low_frequency', `${muscleLabel(m)} מגורה פעם אחת בשבוע בלבד; תדירות של פעמיים משפרת את התוצאה.`);
    }
  }

  // --- 4. איזון סקוואט/הינג׳
  const patterns = {};
  for (const day of program.days) for (const b of day.blocks) patterns[b.exercise.pattern] = (patterns[b.exercise.pattern] || 0) + b.prescription.sets;
  const sq = patterns.squat || 0; const hg = patterns.hinge || 0;
  if (sq > 0 && hg === 0) add('warning', 'no_hinge', 'אין בתכנית דפוס הינג׳ (שרשרת אחורית) — פער נפוץ שמוביל לחוסר איזון קדמי/אחורי.');
  if (hg > 0 && sq === 0 && trainee.daysPerWeek >= 3) add('info', 'no_squat', 'אין בתכנית דפוס סקוואט.');

  // --- 5. עומס שבועי כולל
  // סטים בפועל לאימון (לא ספירת נפח לפי שריר) — זה המדד שמאמן מרגיש בשטח.
  const workingSets = program.days.map((d) => d.blocks
    .filter((b) => b.role !== 'warmup' && b.exercise.type !== 'mobility')
    .reduce((sum, b) => sum + b.prescription.sets, 0));
  const perSession = workingSets.reduce((a, b) => a + b, 0) / Math.max(1, workingSets.length);
  if (perSession > 28) add('warning', 'session_volume_high', `ממוצע ${perSession.toFixed(0)} סטי עבודה לאימון — גבוה; שקול צמצום נפח.`);

  // --- 6. התאמות אישיות שחייבות להופיע בתכנית
  const ageAdj = ageAdjustments(trainee);
  const allBlocks = program.days.flatMap((d) => d.blocks);

  if (ageAdj.needsBalance) {
    const hasBalance = allBlocks.some((b) => {
      const ex = getExercise(b.exercise.id);
      return ex.tags.includes('balance_training') || ex.flags.includes('balance');
    });
    if (!hasBalance) {
      add('warning', 'no_balance_work', 'גיל 65+ ללא עבודת שיווי משקל — זהו המרכיב עם ההשפעה הגדולה ביותר על סיכון נפילות.');
    }
  }

  if (trainee.sport !== 'none' && trainee.externalSessions > 0) {
    const prehab = SPORTS[trainee.sport]?.prehab || [];
    const covered = prehab.some((pat) => allBlocks.some((b) => b.exercise.pattern === pat));
    if (!covered && prehab.length) {
      add('info', 'no_sport_prehab', `לא נכנסה עבודת מניעה ייעודית ל${trainee.sport} — שווה לפנות לה מקום.`);
    }
    const weeklyTotal = trainee.daysPerWeek + trainee.externalSessions;
    if (weeklyTotal >= 9) {
      add('warning', 'total_load_high', `${weeklyTotal} אימונים שבועיים בסך הכול — סיכון להצטברות עומס; לוודא שינה ותזונה או להוריד יום.`);
    }
  }

  if (trainee.travelWeek) {
    const portable = allBlocks.every((b) => {
      const eq = equipmentCheck(getExercise(b.exercise.id), studio, trainee.equipmentBlocklist, { travelWeek: true });
      return eq.ok;
    });
    if (!portable) add('error', 'not_portable', 'שבוע נסיעה — התכנית כוללת תרגיל שדורש ציוד שאינו נייד.');
  }

  const coverage = program.meta?.poolCoverage;
  if (coverage?.missingPatterns?.length) {
    add('info', 'pattern_unavailable',
      `אין תרגיל זמין לדפוסים: ${coverage.missingPatterns.join(', ')} — שילוב של הציוד בסטודיו והמגבלות של המתאמן. המערכת השתמשה בדפוסים חלופיים.`);
  }
  if (coverage && coverage.total < 20) {
    add('warning', 'thin_pool',
      `נותרו ${coverage.total} תרגילים מתאימים בלבד מתוך המאגר — התכנית מוגבלת מאוד; שווה לשקול התאמה אישית או הוספת ציוד.`);
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const score = Math.max(0, 100 - errors * 25 - warnings * 6 - issues.filter((i) => i.level === 'info').length * 1);

  return { passed: errors === 0, score, errors, warnings, issues };
}

/** האם העצימות שנרשמה חורגת מתקרת הגיל. */
function rxIntensityTooHigh(rx, trainee) {
  const cap = ageAdjustments(trainee).maxIntensityPct;
  return Array.isArray(rx.intensityPct) && rx.intensityPct[1] > cap;
}

export { muscleLabel };
