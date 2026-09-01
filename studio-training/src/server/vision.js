/**
 * זיהוי ציוד מתמונה.
 *
 * זהו המסלול האופציונלי בהרשמת הסטודיו: בעל הסטודיו מצלם את החדר או מכשיר
 * בודד, והמערכת מציעה רשימת ציוד לאישור. הצ'קליסט הידני תמיד עובד גם בלעדיו.
 *
 * ה-SDK של Anthropic נטען בעצלתיים ואינו תלות חובה — מנוע התכניות עצמו
 * נשאר נקי לחלוטין מתלויות. אם החבילה לא מותקנת או שאין מפתח, הפונקציה
 * מחזירה שגיאה מפורשת והממשק נופל חזרה לצ'קליסט.
 */

import { EQUIPMENT } from '../domain/taxonomy.js';
import { EQUIPMENT_LABELS } from '../domain/labels.js';

const MODEL = 'claude-opus-5';

/*
 * שם החבילה מורכב בזמן ריצה ולא נכתב כמחרוזת קבועה.
 *
 * הסיבה מעשית: מאגד שבונה את המערכת לפריסה בקצה מנסה לפתור כל ייבוא
 * שהוא רואה — גם ייבוא עצל שנמצא בתוך try ושנועד להיכשל בשקט — ונופל
 * כי החבילה אינה מותקנת. כשהשם מחושב, המאגד אינו יכול לנתח אותו, והייבוא
 * נשאר מה שהוא: ניסיון בזמן ריצה שנכשל בסדר גמור כשאין SDK.
 */
const SDK = ['@anthropic-ai', 'sdk'].join('/');

/** האם זיהוי אוטומטי זמין בסביבה הזו. */
export async function visionAvailable() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return { ok: false, reason: 'no_key' };
  try {
    await import(SDK);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'no_sdk' };
  }
}

const VOCAB = EQUIPMENT.map((id) => `${id} = ${EQUIPMENT_LABELS[id] || id}`).join('\n');

const SYSTEM = `אתה עוזר לרשום סטודיו כושר למערכת ניהול אימונים.
מוצגת לך תמונה של סטודיו או של מכשיר. עליך לזהות אילו פריטי ציוד נראים בתמונה,
ולהתאים אותם *אך ורק* למזהים מהרשימה הסגורה הבאה:

${VOCAB}

כללים:
- החזר אך ורק JSON תקין, בלי טקסט לפני או אחרי.
- אל תמציא מזהים שאינם ברשימה.
- אם אתה לא בטוח לגבי פריט, כלול אותו עם confidence נמוך במקום להשמיט.
- count: כמה יחידות נראות בתמונה (1 אם לא ברור).
- weightsVisible: אם רואים משקלים מסומנים (למשל טווח משקולות), תאר במילים.

מבנה התשובה:
{"items":[{"id":"dumbbell","count":10,"confidence":0.9,"weightsVisible":"2-20 ק\\"ג","note":""}],"unrecognized":["תיאור פריט שלא ברשימה"]}`;

/**
 * @param {{base64: string, mediaType: string}[]} images
 * @returns {Promise<{items: object[], unrecognized: string[], model: string}>}
 */
export async function identifyEquipment(images) {
  const avail = await visionAvailable();
  if (!avail.ok) {
    const err = new Error(avail.reason === 'no_sdk'
      ? 'זיהוי אוטומטי אינו מותקן. להפעלה: npm install @anthropic-ai/sdk (ולהגדיר ANTHROPIC_API_KEY). עד אז ניתן להשלים את הרישום מהצ׳קליסט.'
      : 'לא הוגדר מפתח API. יש להגדיר ANTHROPIC_API_KEY, או להשלים את הרישום מהצ׳קליסט.');
    err.code = avail.reason;
    throw err;
  }

  const { default: Anthropic } = await import(SDK);
  const client = new Anthropic();

  const content = [
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
    { type: 'text', text: 'אילו פריטי ציוד נראים כאן? החזר JSON בלבד לפי המבנה שהוגדר.' },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    const err = new Error('הבקשה נדחתה על ידי המודל. אפשר להשלים את הרישום מהצ׳קליסט.');
    err.code = 'refusal';
    throw err;
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const parsed = parseJson(text);
  const valid = new Set(EQUIPMENT);

  return {
    model: response.model,
    items: (parsed.items || [])
      .filter((it) => valid.has(it.id))
      .map((it) => ({
        id: it.id,
        label: EQUIPMENT_LABELS[it.id] || it.id,
        count: Number(it.count) > 0 ? Math.round(Number(it.count)) : 1,
        confidence: typeof it.confidence === 'number' ? it.confidence : 0.5,
        weightsVisible: it.weightsVisible || '',
        note: it.note || '',
      })),
    unrecognized: parsed.unrecognized || [],
    /** הזיהוי הוא הצעה בלבד — בעל הסטודיו מאשר או מתקן לפני שמירה. */
    requiresConfirmation: true,
  };
}

/** חילוץ JSON גם כשהמודל עטף אותו בטקסט או בגדר קוד. */
function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return {};
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return {}; }
}
