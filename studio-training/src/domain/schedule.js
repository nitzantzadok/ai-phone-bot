/**
 * לוח האימונים.
 *
 * תכנית אומרת "שלושה אימונים בשבוע, A/B/C". לוח השנה אומר מתי בדיוק,
 * ומה קרה בפועל. במציאות אימון זז: מתאמן מבטל ביום שני ומגיע ביום רביעי.
 * לכן אימון מתוכנן הוא רשומה עצמאית עם תאריך שניתן לשינוי, ולא נגזרת
 * קשיחה של התכנית.
 */

/** ימות השבוע במספרים כמו ב-Date#getDay: ראשון=0. */
export const WEEKDAYS = [
  { n: 0, key: 'sun', label: 'ראשון', short: 'א' },
  { n: 1, key: 'mon', label: 'שני', short: 'ב' },
  { n: 2, key: 'tue', label: 'שלישי', short: 'ג' },
  { n: 3, key: 'wed', label: 'רביעי', short: 'ד' },
  { n: 4, key: 'thu', label: 'חמישי', short: 'ה' },
  { n: 5, key: 'fri', label: 'שישי', short: 'ו' },
  { n: 6, key: 'sat', label: 'שבת', short: 'ש' },
];

export const STATUS = {
  planned: { label: 'מתוכנן', tone: '' },
  done: { label: 'בוצע', tone: 'ok' },
  missed: { label: 'לא הגיע', tone: 'warn' },
  moved: { label: 'הועבר', tone: 'key' },
};

/** תאריך כמחרוזת YYYY-MM-DD, בלי אזורי זמן ובלי הפתעות. */
export function isoDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** בונה Date מקומי מתוך YYYY-MM-DD בלי הסטה של אזור זמן. */
export function fromIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekdayOf(iso) { return fromIso(iso).getDay(); }

let sesSeq = 0;
const sesId = () => `ses_${Date.now().toString(36)}_${(sesSeq++).toString(36)}`;

export function normalizeSession(raw = {}) {
  const date = isoDate(raw.date) || isoDate(new Date());
  return {
    id: raw.id || sesId(),
    traineeId: raw.traineeId || null,
    programId: raw.programId || null,
    studioId: raw.studioId || null,
    week: raw.week ?? null,
    /** אינדקס היום בתכנית (0 = היום הראשון), כדי לדעת איזה אימון זה. */
    dayIndex: raw.dayIndex ?? 0,
    dayLabel: raw.dayLabel || '',
    date,
    status: STATUS[raw.status] ? raw.status : 'planned',
    /** התאריך המקורי, אם האימון הוזז. שומר את ההיסטוריה של השינוי. */
    movedFrom: raw.movedFrom || null,
    movedAt: raw.movedAt || null,
    note: String(raw.note || '').slice(0, 300),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

/**
 * פריסת תכנית על לוח השנה.
 *
 * מחפשת את ימי האימון שהמתאמן בחר, ומניחה עליהם את ימי התכנית לפי הסדר.
 * אם לא נבחרו ימים, פורסת במרווחים שווים כדי לא לדחוס אימונים ברצף.
 */
export function planWeek(program, { startDate = isoDate(new Date()), weekdays = null } = {}) {
  const days = program?.days || [];
  if (!days.length) return [];

  const wanted = Array.isArray(weekdays) && weekdays.length
    ? [...new Set(weekdays.map(Number))].sort((a, b) => a - b)
    : spreadWeekdays(days.length, weekdayOf(startDate));

  const out = [];
  for (let i = 0; i < days.length; i++) {
    const target = wanted[i % wanted.length];
    // מתקדמים מתחילת השבוע קדימה עד שמוצאים את היום המבוקש
    let date = startDate;
    for (let step = 0; step < 14; step++) {
      if (weekdayOf(date) === target && !out.some((s) => s.date === date)) break;
      date = addDays(date, 1);
    }
    out.push(normalizeSession({
      traineeId: program.traineeId,
      programId: program.id,
      studioId: program.studioId,
      week: program.week,
      dayIndex: i,
      dayLabel: days[i].label || days[i].dayLabel || `יום ${i + 1}`,
      date,
    }));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** פריסה שווה של N אימונים על השבוע, בלי שני אימונים כבדים ברצף. */
export function spreadWeekdays(count, from = 0) {
  const gap = Math.max(1, Math.floor(7 / Math.max(1, count)));
  const out = [];
  for (let i = 0; i < count; i++) out.push((from + i * gap) % 7);
  return out;
}

/**
 * העברת אימון לתאריך אחר.
 *
 * זו הפעולה שהמאמן עושה הכי הרבה: המתאמן לא הגיע ביום שני, נקבע רביעי.
 * שומרים מאיפה הוא זז — כדי שאפשר יהיה לראות שהאימון לא אבד אלא הועבר.
 */
export function moveSession(sessions, sessionId, toDate) {
  const date = isoDate(toDate);
  if (!date) throw new Error('תאריך לא תקין');
  return sessions.map((s) => (s.id === sessionId
    ? {
      ...s,
      date,
      movedFrom: s.movedFrom || s.date,
      movedAt: new Date().toISOString(),
      // אימון שהוזז חוזר להיות מתוכנן, אלא אם כבר בוצע
      status: s.status === 'done' ? 'done' : 'planned',
    }
    : s));
}

export function setStatus(sessions, sessionId, status) {
  if (!STATUS[status]) throw new Error('סטטוס לא מוכר');
  return sessions.map((s) => (s.id === sessionId ? { ...s, status } : s));
}

export function removeSession(sessions, sessionId) {
  return sessions.filter((s) => s.id !== sessionId);
}

/** מוסיף אימון בודד ידנית — למשל אימון השלמה שלא היה בתכנית. */
export function addSession(sessions, data) {
  return [...sessions, normalizeSession(data)].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * סימון אוטומטי של אימון כבוצע לפי רישום מהשטח.
 * אם אין אימון מתוכנן באותו תאריך, נוצר אחד — כי מה שקרה בפועל
 * חשוב יותר ממה שתוכנן.
 */
export function markDoneByDate(sessions, date, extra = {}) {
  const iso = isoDate(date);
  const hit = sessions.find((s) => s.date === iso);
  if (hit) return sessions.map((s) => (s.id === hit.id ? { ...s, status: 'done' } : s));
  return addSession(sessions, { ...extra, date: iso, status: 'done' });
}

/**
 * רשת חודש לתצוגה: שבועות של שבעה תאים, כולל ימים גולשים מהחודש הקודם והבא
 * כדי שהרשת תמיד תהיה מלאה ולא קופצת.
 */
export function monthGrid(year, month, sessions = [], { today = isoDate(new Date()) } = {}) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  const byDate = new Map();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }

  const weeks = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = isoDate(cursor);
      week.push({
        date: iso,
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        isToday: iso === today,
        weekday: cursor.getDay(),
        sessions: byDate.get(iso) || [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // אם השבוע הבא כבר כולו מחוץ לחודש, אין טעם בשורה נוספת
    if (cursor.getMonth() !== month && cursor > new Date(year, month + 1, 0)) break;
  }
  return weeks;
}

/** סיכום חודשי קצר לכותרת הלוח. */
export function monthSummary(sessions, year, month) {
  const inMonth = sessions.filter((s) => {
    const d = fromIso(s.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  return {
    total: inMonth.length,
    done: inMonth.filter((s) => s.status === 'done').length,
    planned: inMonth.filter((s) => s.status === 'planned').length,
    missed: inMonth.filter((s) => s.status === 'missed').length,
    moved: inMonth.filter((s) => s.movedFrom).length,
  };
}

/** האימון הבא שעוד לא בוצע. */
export function nextSession(sessions, from = isoDate(new Date())) {
  return sessions
    .filter((s) => s.status === 'planned' && s.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}
