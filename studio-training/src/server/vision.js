/**
 * זיהוי ציוד מתמונה.
 *
 * זהו המסלול האופציונלי בהרשמת הסטודיו: בעל הסטודיו מצלם את החדר או מכשיר
 * בודד, והמערכת מציעה רשימת ציוד לאישור. הצ'קליסט הידני תמיד עובד גם בלעדיו.
 *
 * הקריאה למודל עוברת דרך הלקוח המשותף (claude.js) — HTTP ישיר, בלי SDK —
 * ולכן עובדת זהה בשרת Node ובקצה. בלי מפתח הממשק נופל חזרה לצ'קליסט.
 */

import { EQUIPMENT } from '../domain/taxonomy.js';
import { EQUIPMENT_LABELS } from '../domain/labels.js';

import { claudeAvailable, claudeCall, claudeJson } from './claude.js';

/** האם זיהוי אוטומטי זמין בסביבה הזו. */
export async function visionAvailable() {
  return claudeAvailable();
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
  const content = [
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
    { type: 'text', text: 'אילו פריטי ציוד נראים כאן? החזר JSON בלבד לפי המבנה שהוגדר.' },
  ];
  const { text, model } = await claudeCall({ system: SYSTEM, user: content, maxTokens: 4000 });
  const parsed = claudeJson(text);
  const valid = new Set(EQUIPMENT);

  return {
    model,
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

