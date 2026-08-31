/**
 * מדידות היקפים והרכב גוף לאורך זמן.
 *
 * המשקל על המשקל אינו מספר יחיד: אפשר לרדת 2 ס״מ במותן בלי שהמשקל זז.
 * לכן כל מדידה נשמרת עם תאריך, וההיסטוריה מוצגת כגרף לכל מדד בנפרד —
 * לכל מדד סקאלה משלו, כי ק״ג, אחוזים וסנטימטרים אינם אותו דבר.
 */

/** המדדים שהמערכת עוקבת אחריהם, לפי סדר התצוגה. */
export const METRICS = [
  { key: 'weightKg', label: 'משקל', unit: 'ק״ג', goodDirection: 'context' },
  { key: 'bodyFatPct', label: 'אחוז שומן', unit: '%', goodDirection: 'down' },
  { key: 'chest', label: 'היקף חזה', unit: 'ס״מ', goodDirection: 'context' },
  { key: 'waist', label: 'היקף מותן', unit: 'ס״מ', goodDirection: 'down' },
  { key: 'hips', label: 'היקף ירכיים', unit: 'ס״מ', goodDirection: 'context' },
  { key: 'thigh', label: 'היקף ירך', unit: 'ס״מ', goodDirection: 'context' },
  { key: 'arm', label: 'היקף זרוע', unit: 'ס״מ', goodDirection: 'up' },
  { key: 'calf', label: 'היקף שוק', unit: 'ס״מ', goodDirection: 'context' },
  { key: 'neck', label: 'היקף צוואר', unit: 'ס״מ', goodDirection: 'context' },
];

const GIRTH_KEYS = METRICS.filter((m) => !['weightKg', 'bodyFatPct'].includes(m.key)).map((m) => m.key);

/** נרמול מדידה בודדת. ערכים ריקים נשמטים ולא נשמרים כאפס. */
export function normalizeMeasurement(raw = {}) {
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? +n.toFixed(1) : null;
  };
  const girths = {};
  for (const k of GIRTH_KEYS) {
    const v = num(raw.girths?.[k] ?? raw[k]);
    if (v != null) girths[k] = v;
  }
  return {
    id: raw.id || `meas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: normalizeDate(raw.date),
    weightKg: num(raw.weightKg),
    bodyFatPct: num(raw.bodyFatPct),
    girths,
    notes: String(raw.notes || '').slice(0, 500),
  };
}

function normalizeDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/** מיון כרונולוגי, והסרת כפילויות לפי תאריך (המדידה האחרונה גוברת). */
export function sortMeasurements(list = []) {
  const byDate = new Map();
  for (const raw of list) {
    const m = normalizeMeasurement(raw);
    byDate.set(m.date, m);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** ערך של מדד במדידה אחת. */
export function metricValue(measurement, key) {
  if (key === 'weightKg' || key === 'bodyFatPct') return measurement[key] ?? null;
  return measurement.girths?.[key] ?? null;
}

/**
 * סדרת נקודות למדד אחד: רק מדידות שבהן הערך קיים.
 * @returns {{points: {date:string, value:number}[], first:number, last:number, delta:number, unit:string, label:string}|null}
 */
export function series(measurements, key) {
  const meta = METRICS.find((m) => m.key === key);
  if (!meta) return null;
  const points = sortMeasurements(measurements)
    .map((m) => ({ date: m.date, value: metricValue(m, key) }))
    .filter((p) => p.value != null);
  if (!points.length) return null;

  const first = points[0].value;
  const last = points[points.length - 1].value;
  return {
    key, label: meta.label, unit: meta.unit, goodDirection: meta.goodDirection,
    points, first, last,
    delta: +(last - first).toFixed(1),
    min: Math.min(...points.map((p) => p.value)),
    max: Math.max(...points.map((p) => p.value)),
  };
}

/** כל המדדים שיש להם לפחות נקודה אחת. */
export function allSeries(measurements) {
  return METRICS.map((m) => series(measurements, m.key)).filter(Boolean);
}

/** המדידה האחרונה, לעדכון הפרופיל. */
export function latest(measurements) {
  const sorted = sortMeasurements(measurements);
  return sorted[sorted.length - 1] || null;
}

/**
 * סיכום קצר להצגה: מה השתנה מאז המדידה הראשונה, ובאיזה כיוון.
 */
export function summary(measurements) {
  const s = allSeries(measurements);
  const meas = sortMeasurements(measurements);
  return {
    count: meas.length,
    from: meas[0]?.date || null,
    to: meas[meas.length - 1]?.date || null,
    metrics: s.map((x) => ({
      key: x.key, label: x.label, unit: x.unit,
      last: x.last, delta: x.delta,
      direction: x.delta === 0 ? 'flat' : x.delta > 0 ? 'up' : 'down',
      /** האם השינוי הוא בכיוון הרצוי — כשיש כיוון רצוי ברור. */
      favorable: x.goodDirection === 'context' || x.delta === 0
        ? null
        : (x.goodDirection === 'down' ? x.delta < 0 : x.delta > 0),
    })),
  };
}
