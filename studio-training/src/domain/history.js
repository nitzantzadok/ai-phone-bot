/**
 * היסטוריה: כל תכנית שנבנתה אי פעם, וכל מה שקרה בפועל באימונים.
 *
 * שתי שכבות שונות ולא מתערבבות:
 *   1. ארכיון תכניות — צילום מצב בלתי משתנה של כל תכנית שנוצרה או נערכה.
 *   2. יומן אימונים — מה באמת בוצע: סטים, משקלים, כאב, דילוגים.
 *
 * השכבה הראשונה עונה על "מה תכננו לו לפני חצי שנה",
 * השנייה על "מה הוא באמת הרים ואיך זה הרגיש".
 */

/** גודל צילום מצב מלא הוא בזבוז; שומרים את מה שצריך כדי לשחזר מסך קריא. */
export function programSnapshot(program, { reason = 'generated', at = new Date().toISOString() } = {}) {
  return {
    id: `snap_${program.traineeId}_${new Date(at).getTime()}`,
    programId: program.id,
    traineeId: program.traineeId,
    traineeName: program.traineeName,
    studioId: program.studioId,
    week: program.week,
    at,
    reason,
    qaScore: program.qa?.score ?? null,
    qaPassed: program.qa?.passed ?? null,
    split: program.meta?.split || null,
    goal: program.meta?.goal || null,
    level: program.meta?.level || null,
    daysPerWeek: program.days?.length || 0,
    totalExercises: (program.days || []).reduce((n, d) => n + (d.blocks?.length || 0), 0),
    /** התכנית המלאה — היא זו שמאפשרת לפתוח מחדש מסך זהה לזה שהמאמן ראה. */
    program: structuredClone(program),
  };
}

/** האם שני צילומי מצב זהים מבחינת תוכן. מונע ארכיון שמתמלא בכפילויות. */
export function sameContent(a, b) {
  if (!a || !b) return false;
  if (a.programId !== b.programId || a.week !== b.week) return false;
  return fingerprint(a.program) === fingerprint(b.program);
}

/** טביעת אצבע של התכנית: התרגילים, המרשם והמשקלים — לא חותמות זמן. */
export function fingerprint(program) {
  return (program?.days || []).map((d) => (d.blocks || []).map((b) => [
    b.exercise?.id,
    b.prescription?.sets,
    b.prescription?.repsMin,
    b.prescription?.repsMax,
    b.load?.kg ?? '',
  ].join(':')).join('|')).join('#');
}

export const SESSION_EVENTS = new Set(['log_set', 'pain', 'skip', 'too_easy', 'too_hard', 'form_breakdown', 'equipment_busy']);

/**
 * רישום בודד ביומן האימונים.
 * exerciseName נשמר כטקסט ולא רק כמזהה, כדי שהיסטוריה תישאר קריאה
 * גם אם התרגיל ישתנה או יוסר מהמאגר בעתיד.
 */
export function normalizeLogEntry(raw = {}) {
  const at = raw.at || new Date().toISOString();
  return {
    id: raw.id || `log_${new Date(at).getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    at,
    date: (raw.date || at).slice(0, 10),
    traineeId: raw.traineeId || null,
    programId: raw.programId || null,
    week: raw.week ?? null,
    dayIndex: raw.dayIndex ?? null,
    dayLabel: raw.dayLabel || '',
    type: raw.type || 'log_set',
    exerciseId: raw.exerciseId || null,
    exerciseName: raw.exerciseName || '',
    loadKg: num(raw.loadKg ?? raw.payload?.load),
    perSide: !!(raw.perSide ?? raw.payload?.perSide),
    reps: num(raw.reps ?? raw.payload?.reps),
    rpe: num(raw.rpe ?? raw.payload?.rpe),
    joint: raw.joint || raw.payload?.joint || null,
    painLevel: num(raw.painLevel ?? raw.payload?.painLevel),
    note: raw.note || '',
  };
}

const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? null : +v);

/** קיבוץ היומן לאימונים: אותו תאריך ואותו יום בתכנית הם אימון אחד. */
export function groupSessions(log = []) {
  const map = new Map();
  for (const e of log) {
    const key = `${e.date}#${e.dayIndex ?? 'x'}`;
    if (!map.has(key)) {
      map.set(key, {
        key, date: e.date, dayIndex: e.dayIndex ?? null, dayLabel: e.dayLabel || '',
        week: e.week ?? null, programId: e.programId || null,
        entries: [], sets: 0, volumeKg: 0, painEvents: 0, exercises: new Set(),
      });
    }
    const s = map.get(key);
    s.entries.push(e);
    if (!s.dayLabel && e.dayLabel) s.dayLabel = e.dayLabel;
    if (e.type === 'log_set') {
      s.sets += 1;
      if (e.exerciseName) s.exercises.add(e.exerciseName);
      if (e.loadKg && e.reps) s.volumeKg += e.loadKg * e.reps * (e.perSide ? 2 : 1);
    }
    if (e.type === 'pain') s.painEvents += 1;
  }
  return [...map.values()]
    .map((s) => ({ ...s, exercises: [...s.exercises], volumeKg: Math.round(s.volumeKg) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** ההיסטוריה של תרגיל בודד — הבסיס ל"כמה הוא הרים בפעם שעברה". */
export function exerciseHistory(log = [], exerciseId) {
  return log
    .filter((e) => e.type === 'log_set' && e.exerciseId === exerciseId && e.loadKg != null)
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map((e) => ({ date: e.date, loadKg: e.loadKg, reps: e.reps, rpe: e.rpe, perSide: e.perSide }));
}

/** השיא האישי לפי משקל, ולפי נפח סט בודד. */
export function personalBests(log = []) {
  const best = new Map();
  for (const e of log) {
    if (e.type !== 'log_set' || !e.loadKg) continue;
    const cur = best.get(e.exerciseId);
    const volume = e.loadKg * (e.reps || 1);
    if (!cur || e.loadKg > cur.loadKg || (e.loadKg === cur.loadKg && volume > cur.volume)) {
      best.set(e.exerciseId, {
        exerciseId: e.exerciseId, name: e.exerciseName, loadKg: e.loadKg,
        reps: e.reps, volume, date: e.date, perSide: e.perSide,
      });
    }
  }
  return [...best.values()].sort((a, b) => b.loadKg - a.loadKg);
}

/** תמונת מצב מסכמת לכרטיס המתאמן. */
export function historySummary(log = [], snapshots = []) {
  const sessions = groupSessions(log);
  const totalVolume = sessions.reduce((n, s) => n + s.volumeKg, 0);
  const last = sessions[0] || null;
  const first = sessions[sessions.length - 1] || null;
  return {
    sessions: sessions.length,
    sets: log.filter((e) => e.type === 'log_set').length,
    totalVolumeKg: totalVolume,
    painEvents: log.filter((e) => e.type === 'pain').length,
    programs: snapshots.length,
    weeksCovered: new Set(snapshots.map((s) => s.week)).size,
    firstDate: first?.date || null,
    lastDate: last?.date || null,
    /** ממוצע אימונים בשבוע בפועל — נתון שמאמן שואל וכמעט אף מערכת לא עונה. */
    sessionsPerWeek: (() => {
      if (!first || !last || sessions.length < 2) return null;
      const days = Math.max(7, (new Date(last.date) - new Date(first.date)) / 86400000);
      return +((sessions.length / days) * 7).toFixed(1);
    })(),
  };
}
