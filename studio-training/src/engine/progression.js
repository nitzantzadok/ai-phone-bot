/**
 * פרוגרסיה: איך מתקדמים ממה שקרה בפועל בשטח למרשם של השבוע הבא.
 * העיקרון: פרוגרסיה כפולה — קודם מוסיפים חזרות בטווח, ורק כשמגיעים
 * לקצה העליון בטווח ה-RIR המבוקש מוסיפים משקל.
 */

/** קפיצת משקל מינימלית סבירה לפי סוג התרגיל. */
export function loadIncrement(exercise, currentLoad) {
  if (!exercise.loadable || !currentLoad) return 0;
  const lowerBody = exercise.primary.some((m) => ['quads', 'glutes', 'hamstrings'].includes(m));
  const pct = lowerBody ? 0.05 : 0.025;
  const raw = currentLoad * pct;
  const step = exercise.eq.flat().includes('dumbbell') ? 2 : 2.5;
  return Math.max(step, Math.round(raw / step) * step);
}

/**
 * חישוב היעד לשבוע הבא מתוך הביצוע בפועל.
 * @param {object} exercise
 * @param {object} rx      המרשם שניתן
 * @param {object} actual  { load, reps, rpe }  (rpe 1-10)
 */
export function nextTarget(exercise, rx, actual) {
  const targetRpe = 10 - rx.rir;
  const out = { load: actual.load ?? null, reps: actual.reps ?? rx.repsMin, sets: rx.sets, action: 'hold', reason: '' };

  if (actual.rpe != null && actual.rpe <= targetRpe - 2) {
    // קל בהרבה מהמתוכנן
    if (actual.reps >= rx.repsMax) {
      out.load = (actual.load || 0) + loadIncrement(exercise, actual.load);
      out.reps = rx.repsMin;
      out.action = 'increase_load';
      out.reason = 'הגיע לקצה העליון של טווח החזרות במאמץ נמוך מהמתוכנן.';
    } else {
      out.reps = Math.min(rx.repsMax, (actual.reps || rx.repsMin) + 2);
      out.action = 'increase_reps';
      out.reason = 'מאמץ נמוך מהמתוכנן — מוסיפים חזרות לפני שמוסיפים משקל.';
    }
  } else if (actual.rpe != null && actual.rpe >= targetRpe + 1.5) {
    out.load = actual.load ? Math.max(0, actual.load - loadIncrement(exercise, actual.load)) : null;
    out.action = 'reduce_load';
    out.reason = 'המאמץ בפועל היה גבוה מהמתוכנן — הורדת עומס כדי לשמור על איכות טכנית.';
  } else if (actual.reps != null && actual.reps >= rx.repsMax) {
    out.load = (actual.load || 0) + loadIncrement(exercise, actual.load);
    out.reps = rx.repsMin;
    out.action = 'increase_load';
    out.reason = 'הושלם קצה הטווח — מעלים משקל וחוזרים לתחתית הטווח.';
  } else {
    out.reps = Math.min(rx.repsMax, (actual.reps || rx.repsMin) + 1);
    out.action = 'increase_reps';
    out.reason = 'התקדמות הדרגתית בתוך הטווח.';
  }
  return out;
}

/**
 * החלטה על דילוד לא מתוכנן: הצטברות סימני עייפות מהשטח.
 * @param {object[]} recentEvents אירועי משוב מהשבוע
 */
export function needsDeload(recentEvents) {
  const hard = recentEvents.filter((e) => e.type === 'too_hard').length;
  const skips = recentEvents.filter((e) => e.type === 'skip').length;
  const pain = recentEvents.filter((e) => e.type === 'pain').length;
  const highRpe = recentEvents.filter((e) => e.type === 'log_set' && (e.payload?.rpe ?? 0) >= 9.5).length;
  const score = hard * 2 + skips + pain * 3 + highRpe;
  return { deload: score >= 8, score, reason: score >= 8 ? 'הצטברות סימני עומס יתר מהשטח — שבוע הורדת עומס מתוכנן.' : '' };
}
