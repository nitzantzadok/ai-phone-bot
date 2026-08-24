/**
 * בקרת איכות על התכנית המוגמרת.
 *
 * זו רשת הביטחון: גם אם הבורר טעה, הבדיקות כאן יתפסו תכנית לא מאוזנת,
 * תרגיל אסור שחמק, אימון ארוך מדי, או שריר שנשכח.
 * שגיאה (error) = אסור להגיש למאמן. אזהרה = להציג ולתת למאמן להחליט.
 */

import { getExercise } from '../domain/exercises.js';
import { MUSCLE_ROLE } from '../domain/taxonomy.js';
import { constraintCheck, equipmentCheck } from './filters.js';

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
      const eq = equipmentCheck(ex, studio, trainee.equipmentBlocklist);
      if (!eq.ok) add('error', 'equipment_missing', `${day.dayLabel}: אין בסטודיו ציוד ל"${ex.name}".`, eq.missing);

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

    const over = day.estimatedMinutes - trainee.sessionMinutes;
    if (over > trainee.sessionMinutes * 0.15) {
      add('warning', 'too_long', `${day.dayLabel}: אומדן ${day.estimatedMinutes} דק' מול ${trainee.sessionMinutes} דק' מתוכננות.`);
    } else if (over < -trainee.sessionMinutes * 0.3) {
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
    add('error', 'no_pull', 'אין בתכנית עבודת משיכה כלל.');
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

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const score = Math.max(0, 100 - errors * 25 - warnings * 6 - issues.filter((i) => i.level === 'info').length * 1);

  return { passed: errors === 0, score, errors, warnings, issues };
}

const MUSCLE_LABELS = {
  chest: 'חזה', back_lats: 'רחב גבי', back_upper: 'גב עליון', delts_front: 'כתף קדמית',
  delts_side: 'כתף צד', delts_rear: 'כתף אחורית', biceps: 'יד קדמית', triceps: 'יד אחורית',
  forearms: 'אמות', quads: 'ארבע ראשי', hamstrings: 'אחורי ירך', glutes: 'ישבן',
  adductors: 'מקרבים', abductors: 'מרחיקים', calves: 'תאומים', core_anterior: 'ליבה קדמית',
  core_lateral: 'ליבה צידית', core_posterior: 'ליבה אחורית', neck: 'צוואר',
};
export function muscleLabel(m) { return MUSCLE_LABELS[m] || m; }
