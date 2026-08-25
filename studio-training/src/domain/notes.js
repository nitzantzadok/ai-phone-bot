/**
 * הערות המאמן.
 *
 * הרבה ממה שקובע תכנית טובה קורה באימון ולא בטופס: "התלונן על הכתף רק
 * בלחיצה", "מגיע שחוק בימי שני", "אוהב לסיים בחבל". כדי שהמערכת תוכל
 * להתחשב בזה ולא רק להציג את זה, כל הערה יכולה לשאת *הנחיה* — פעולה
 * מוגדרת שהמנוע יודע לבצע.
 *
 * הטקסט תמיד נשמר ומוצג. ההנחיה היא זו שמשנה את התכנית, וניתן לכבות
 * אותה או למחוק את ההערה בכל רגע — בלי לאבד את מה שנכתב.
 */

/** ההנחיות שהמנוע יודע לבצע, והתיאור שמוצג למאמן. */
export const DIRECTIVES = {
  none:          { label: 'הערה בלבד — בלי שינוי בתכנית', needs: null },
  avoid_exercise:{ label: 'להימנע מתרגיל', needs: 'exercise' },
  prefer_exercise:{ label: 'להעדיף תרגיל', needs: 'exercise' },
  avoid_pattern: { label: 'להימנע מדפוס תנועה', needs: 'pattern' },
  emphasize_muscle:{ label: 'להדגיש שריר', needs: 'muscle' },
  watch_joint:   { label: 'להיזהר במפרק', needs: 'joint' },
  reduce_load:   { label: 'להוריד משקלי עבודה', needs: 'percent' },
  increase_load: { label: 'להעלות משקלי עבודה', needs: 'percent' },
  reduce_volume: { label: 'להוריד נפח אימון', needs: 'percent' },
  increase_volume:{ label: 'להעלות נפח אימון', needs: 'percent' },
  shorten_session:{ label: 'לקצר את האימון', needs: 'minutes' },
  equipment_unavailable:{ label: 'ציוד לא זמין', needs: 'equipment' },
};

export const DIRECTIVE_TYPES = Object.keys(DIRECTIVES);

/** נרמול הערה בודדת. */
export function normalizeNote(raw = {}) {
  const type = DIRECTIVES[raw.directive?.type] ? raw.directive.type : 'none';
  return {
    id: raw.id || `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: String(raw.text || '').slice(0, 2000),
    at: raw.at || new Date().toISOString(),
    author: raw.author || '',
    /** general — הערה על המתאמן; exercise — הערה שקשורה לתרגיל מסוים. */
    scope: raw.scope === 'exercise' ? 'exercise' : 'general',
    exerciseId: raw.exerciseId || null,
    directive: { type, value: raw.directive?.value ?? null },
    active: raw.active !== false,
    pinned: !!raw.pinned,
  };
}

/**
 * החלת ההערות הפעילות על פרופיל המתאמן, לפני בניית התכנית.
 * @returns {{trainee: object, effects: {noteId:string, text:string, effect:string}[]}}
 */
export function applyNotes(trainee, notes = trainee.notesLog || []) {
  const t = structuredClone(trainee);
  const effects = [];
  const record = (note, effect) => effects.push({ noteId: note.id, text: note.text, effect });

  for (const raw of notes) {
    const note = normalizeNote(raw);
    if (!note.active) continue;
    const { type, value } = note.directive;
    if (type === 'none') { record(note, 'מוצגת למאמן; אינה משנה את התכנית.'); continue; }

    switch (type) {
      case 'avoid_exercise':
        if (value && !t.dislikes.includes(value)) t.dislikes.push(value);
        record(note, 'התרגיל הוסר מהתכניות.');
        break;
      case 'prefer_exercise':
        if (value && !t.likes.includes(value)) t.likes.push(value);
        record(note, 'התרגיל מקבל עדיפות בשיבוץ.');
        break;
      case 'avoid_pattern':
        if (value) t.avoidPatterns = [...new Set([...(t.avoidPatterns || []), value])];
        record(note, 'דפוס התנועה לא ישובץ.');
        break;
      case 'emphasize_muscle':
        if (value && !t.focusMuscles.includes(value)) t.focusMuscles.push(value);
        record(note, 'השריר הוגדר כשריר מיקוד.');
        break;
      case 'watch_joint':
        if (value) t.watchJoints = { ...(t.watchJoints || {}), [value]: 1 };
        record(note, 'תרגילים עם עומס גבוה על המפרק יקבלו עדיפות נמוכה.');
        break;
      case 'reduce_load':
        t.loadAdjustPct = (t.loadAdjustPct || 0) - Math.abs(+value || 10);
        record(note, `משקלי העבודה יורדו ב-${Math.abs(+value || 10)}%.`);
        break;
      case 'increase_load':
        t.loadAdjustPct = (t.loadAdjustPct || 0) + Math.abs(+value || 5);
        record(note, `משקלי העבודה יועלו ב-${Math.abs(+value || 5)}%.`);
        break;
      case 'reduce_volume':
        t.volumeAdjustPct = (t.volumeAdjustPct || 0) - Math.abs(+value || 15);
        record(note, `נפח האימון יורד ב-${Math.abs(+value || 15)}%.`);
        break;
      case 'increase_volume':
        t.volumeAdjustPct = (t.volumeAdjustPct || 0) + Math.abs(+value || 10);
        record(note, `נפח האימון יעלה ב-${Math.abs(+value || 10)}%.`);
        break;
      case 'shorten_session':
        if (+value > 0) t.sessionMinutes = Math.max(20, Math.min(t.sessionMinutes, +value));
        record(note, `אורך האימון הוגבל ל-${t.sessionMinutes} דקות.`);
        break;
      case 'equipment_unavailable':
        if (value && !t.equipmentBlocklist.includes(value)) t.equipmentBlocklist.push(value);
        record(note, 'הציוד לא ישמש בתכנית.');
        break;
      default:
        record(note, 'הנחיה לא מוכרת — ההערה מוצגת בלבד.');
    }
  }

  return { trainee: t, effects };
}

/** עדכון הערה קיימת ברשימה (עריכה, כיבוי הנחיה, נעיצה). */
export function upsertNote(list = [], note) {
  const n = normalizeNote(note);
  const idx = list.findIndex((x) => x.id === n.id);
  if (idx < 0) return [...list, n];
  const next = list.slice();
  next[idx] = { ...next[idx], ...n };
  return next;
}

/** מחיקת הערה. */
export function removeNote(list = [], id) {
  return list.filter((x) => x.id !== id);
}
