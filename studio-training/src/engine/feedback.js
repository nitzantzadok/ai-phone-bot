/**
 * לולאת המשוב מהשטח.
 *
 * המאמן לוחץ כפתורים במסך האימון; כל לחיצה היא אירוע. כאן האירועים
 * מתורגמים לשינויים בפרופיל המתאמן, כך שהתכנית הבאה כבר "יודעת" מה קרה.
 */

import { getExercise } from '../domain/exercises.js';
import { nextTarget, needsDeload } from './progression.js';
import { applyProbeResult } from './probe.js';
import { normalizeCustomExercise } from '../domain/models.js';

/** סוגי אירועים נתמכים. */
export const EVENT_TYPES = [
  'log_set', 'too_easy', 'too_hard', 'pain', 'form_breakdown',
  'equipment_busy', 'swap', 'skip', 'love_it', 'session_rpe', 'session_done',
  'probe_ok', 'probe_pain', 'custom_add', 'custom_tested_ok', 'custom_tested_failed',
];

/** מיפוי מפרק שבו דווח כאב -> מגבלה שתתווסף לפרופיל. */
export const PAIN_TO_CONSTRAINT = {
  shoulder: 'shoulder_impingement',
  low_back: 'low_back_pain',
  lumbar: 'low_back_pain',
  knee: 'knee_pain_patellofemoral',
  elbow: 'tennis_elbow',
  wrist: 'wrist_pain',
  hip: 'hip_impingement',
  ankle: 'ankle_sprain',
  neck: 'neck_pain',
};

/**
 * @param {object} trainee   פרופיל מנורמל
 * @param {object[]} events  אירועי משוב
 * @returns {{trainee: object, changes: object[], flags: object}}
 */
export function applyFeedback(trainee, events = []) {
  const t = structuredClone(trainee);
  const changes = [];
  const note = (msg, data) => changes.push({ message: msg, ...(data ? { data } : {}) });

  const skipCount = {};
  const hardCount = {};
  const easyCount = {};

  for (const ev of events) {
    if (!EVENT_TYPES.includes(ev.type)) { note(`אירוע לא מוכר: ${ev.type}`); continue; }
    const ex = ev.exerciseId ? safeExercise(ev.exerciseId) : null;

    switch (ev.type) {
      case 'log_set': {
        if (!ex) break;
        const p = ev.payload || {};
        const prev = t.history[ex.id] || {};
        // שומרים את הסט הטוב ביותר של האימון
        const better = !prev.load || (p.load ?? 0) > prev.load || ((p.load ?? 0) === prev.load && (p.reps ?? 0) > (prev.reps ?? 0));
        if (better) {
          t.history[ex.id] = { load: p.load ?? prev.load ?? null, reps: p.reps ?? prev.reps ?? null, rpe: p.rpe ?? null, date: ev.at || new Date().toISOString() };
        }
        if (ev.prescription) {
          const target = nextTarget(ex, ev.prescription, p);
          t.history[ex.id] = { ...t.history[ex.id], nextTarget: target };
          note(`${ex.name}: ${target.reason}`, target);
        }
        break;
      }
      case 'too_easy': {
        if (!ex) break;
        easyCount[ex.id] = (easyCount[ex.id] || 0) + 1;
        const h = t.history[ex.id] || {};
        t.history[ex.id] = { ...h, adjust: 'increase', adjustPct: (h.adjustPct || 0) + 5 };
        note(`${ex.name}: דווח כקל — העלאת עומס של 5% בתכנית הבאה.`);
        break;
      }
      case 'too_hard': {
        if (!ex) break;
        hardCount[ex.id] = (hardCount[ex.id] || 0) + 1;
        const h = t.history[ex.id] || {};
        t.history[ex.id] = { ...h, adjust: 'decrease', adjustPct: (h.adjustPct || 0) - 10 };
        note(`${ex.name}: דווח כקשה מדי — הורדת עומס של 10% ובדיקת טכניקה.`);
        break;
      }
      case 'pain': {
        const joint = ev.payload?.joint;
        const level = ev.payload?.painLevel ?? 5;
        if (ex) {
          // כאב הוא חסימה קשה, לא "לא אוהב" — ולכן נרשם ברשימה נפרדת
          if (!t.blockedExercises.some((b) => b.id === ex.id)) {
            t.blockedExercises.push({ id: ex.id, reason: `כאב בשטח (${level}/10)`, at: ev.at || new Date().toISOString() });
          }
          t.approvedExercises = t.approvedExercises.filter((a) => a.id !== ex.id);
          note(`${ex.name}: נחסם עבור המתאמן בעקבות דיווח כאב.`);
        }
        const cid = PAIN_TO_CONSTRAINT[joint];
        if (cid) {
          const severity = level >= 7 ? 'acute' : level >= 4 ? 'subacute' : 'managed';
          const existing = t.constraints.find((c) => c.id === cid);
          if (existing) {
            if (rank(severity) > rank(existing.severity)) {
              existing.severity = severity;
              note(`עודכנה חומרת המגבלה "${cid}" ל-${severity}.`);
            }
          } else {
            t.constraints.push({ id: cid, severity, side: ev.payload?.side || null, notes: `נוסף אוטומטית מדיווח כאב בשטח (${level}/10)` });
            note(`נוספה מגבלה "${cid}" בחומרה ${severity} — התכנית הבאה תסונן בהתאם.`);
          }
        }
        break;
      }
      case 'form_breakdown': {
        if (!ex) break;
        const h = t.history[ex.id] || {};
        t.history[ex.id] = { ...h, adjust: 'decrease', adjustPct: (h.adjustPct || 0) - 10, technique: 'needs_work' };
        if (ex.skill >= 4) {
          if (!t.dislikes.includes(ex.id)) t.dislikes.push(ex.id);
          note(`${ex.name}: תרגיל מורכב שהטכניקה בו מתפרקת — יוחלף בגרסה פשוטה יותר.`);
        } else {
          note(`${ex.name}: הורדת עומס ודגש טכני בסט הראשון.`);
        }
        break;
      }
      case 'equipment_busy': {
        const items = ev.payload?.equipment || [];
        for (const it of items) if (!t.equipmentBlocklist.includes(it)) t.equipmentBlocklist.push(it);
        note(`ציוד תפוס/לא זמין: ${items.join(', ')} — יילקח בחשבון בתכנית הבאה.`, { items });
        break;
      }
      case 'swap': {
        const altId = ev.payload?.alternativeId;
        if (ex && !t.dislikes.includes(ex.id)) t.dislikes.push(ex.id);
        if (altId && !t.likes.includes(altId)) t.likes.push(altId);
        note(`הוחלף ${ex ? ex.name : ''} ב-${altId ? safeExercise(altId)?.name || altId : 'חלופה'}.`);
        break;
      }
      case 'skip': {
        if (!ex) break;
        skipCount[ex.id] = (skipCount[ex.id] || 0) + 1;
        break;
      }
      case 'love_it': {
        if (ex && !t.likes.includes(ex.id)) t.likes.push(ex.id);
        note(`${ex?.name}: סומן כתרגיל מוצלח — יקבל עדיפות.`);
        break;
      }
      case 'session_rpe': {
        const rpe = ev.payload?.rpe ?? 0;
        if (rpe >= 9) { t.sleepQuality = Math.max(1, t.sleepQuality - 0); t.stressLevel = Math.min(5, t.stressLevel + 1); note('אימון בעצימות גבוהה מאוד — נלקח בחשבון בחישוב ההתאוששות.'); }
        break;
      }
      // --- תוצאות תרגיל בדיקה באזור הפציעה
      case 'probe_ok': {
        if (!ev.exerciseId) break;
        const res = applyProbeResult(t, { exerciseId: ev.exerciseId, result: 'ok', note: ev.payload?.note });
        Object.assign(t, res.trainee);
        note(res.message);
        break;
      }
      case 'probe_pain': {
        if (!ev.exerciseId) break;
        const res = applyProbeResult(t, {
          exerciseId: ev.exerciseId, result: 'pain',
          note: ev.payload?.note, painLevel: ev.payload?.painLevel,
        });
        Object.assign(t, res.trainee);
        note(res.message);
        break;
      }

      // --- תרגילים שהמאמן כותב בעצמו
      case 'custom_add': {
        const c = normalizeCustomExercise({ ...(ev.payload || {}), createdAt: ev.at || new Date().toISOString() });
        t.customExercises = [...(t.customExercises || []).filter((x) => x.id !== c.id), c];
        note(`נוסף תרגיל מותאם "${c.name}" כטיוטה. לאחר בדיקה מוצלחת בשטח הוא ייכנס לשיבוץ האוטומטי.`);
        break;
      }
      case 'custom_tested_ok': {
        const c = (t.customExercises || []).find((x) => x.id === ev.exerciseId);
        if (!c) { note(`תרגיל מותאם לא נמצא: ${ev.exerciseId}`); break; }
        c.status = 'tested_ok';
        c.testedAt = ev.at || new Date().toISOString();
        if (ev.payload?.sets) c.sets = ev.payload.sets;
        if (ev.payload?.reps) c.reps = ev.payload.reps;
        if (ev.payload?.load) c.load = ev.payload.load;
        if (ev.payload?.notes) c.notes = ev.payload.notes;
        note(`"${c.name}" נבדק בהצלחה ונכנס למאגר — המערכת תשבץ אותו בתכניות הבאות.`);
        break;
      }
      case 'custom_tested_failed': {
        const c = (t.customExercises || []).find((x) => x.id === ev.exerciseId);
        if (!c) break;
        c.status = 'tested_failed';
        c.testedAt = ev.at || new Date().toISOString();
        note(`"${c.name}" סומן כלא מתאים למתאמן ולא ישובץ.`);
        break;
      }

      case 'session_done':
        break;
    }
  }

  // דילוג חוזר על אותו תרגיל = סימן שהוא לא עובד למתאמן הזה
  for (const [id, n] of Object.entries(skipCount)) {
    if (n >= 2 && !t.dislikes.includes(id)) {
      t.dislikes.push(id);
      note(`${safeExercise(id)?.name || id}: דולג פעמיים ומעלה — הוסר מהתכנית.`);
    }
  }

  // "קל מדי" חוזר על מספר תרגילים = המתאמן מוכן לעלות רמה
  const easyTotal = Object.values(easyCount).reduce((a, b) => a + b, 0);
  if (easyTotal >= 4 && t.level !== 'advanced') {
    const order = ['beginner', 'novice', 'intermediate', 'advanced'];
    t.level = order[Math.min(order.length - 1, order.indexOf(t.level) + 1)];
    note(`רמת המתאמן עודכנה ל-${t.level} בעקבות דיווחי "קל מדי" חוזרים.`);
  }

  const deload = needsDeload(events);
  const flags = { deloadRecommended: deload.deload, deloadReason: deload.reason, fatigueScore: deload.score };
  if (deload.deload) note(deload.reason);

  return { trainee: t, changes, flags };
}

function rank(sev) { return { managed: 1, subacute: 2, acute: 3 }[sev] || 0; }

function safeExercise(id) {
  try { return getExercise(id); } catch { return null; }
}

/**
 * קידום שבוע: מעביר את המתאמן לשבוע הבא במחזור, כולל דילוד לא מתוכנן.
 */
export function advanceWeek(trainee, flags = {}) {
  const t = structuredClone(trainee);
  t.mesocycleWeek = t.mesocycleWeek + 1;
  if (flags.deloadRecommended) {
    // מקדמים ישירות לשבוע הדילוד של המחזור
    t.mesocycleWeek = Math.ceil(t.mesocycleWeek / t.mesocycleLength) * t.mesocycleLength;
  }
  return t;
}
