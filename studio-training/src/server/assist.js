/**
 * המוח: שכבת הבנה לשאריות.
 *
 * המנוע של המערכת נשאר דטרמיניסטי, ובכוונה — אותו גיליון מחזיר תמיד אותה
 * תשובה, כל מסקנה מגיעה עם נימוק שאפשר לבדוק, וזה רץ על מאה לשוניות
 * בשנייה וחצי בלי לעלות כסף. בתחום שבו טעות היא פציעה, נימוק שאפשר לבדוק
 * שווה יותר מניחוש חכם.
 *
 * אבל יש מקום אחד שבו קוד תמיד ייכשל: שפה חופשית. "לחיצה צרפתית",
 * "פרפר הפוך בשיפוע", "כאב בכתף ימין רק בלחיצות מעל הראש" — כל אלה
 * נכתבים אחרת בכל סטודיו, ואין רשימת כינויים שתכסה אותם. שם המודל טוב
 * ממני, ורק שם הוא מופעל.
 *
 * שלושה כללים שמגדירים את השכבה הזאת:
 *   1. היא רצה רק על מה שהזיהוי הרגיל *לא* הצליח לפענח. מה שזוהה — נשאר.
 *   2. היא מציעה, לא קובעת. כל הצעה עוברת לאישור המאמן.
 *   3. כל תשובה מאומתת מול המאגר הסגור. מזהה שאינו קיים נזרק.
 *
 * בלי מפתח או בלי SDK — הכול ממשיך לעבוד בדיוק כמו קודם.
 */

import { BY_ID, EXERCISES } from '../domain/exercises.js';
import { CONSTRAINTS } from '../domain/constraints.js';

const MODEL = 'claude-opus-5';

// אותו טריק כמו בזיהוי הציוד: שם מחושב שהמאגד אינו יכול לנתח, כדי
// שהתלות הרשות לא תפיל את הבנייה לפריסה בקצה
const SDK = ['@anthropic-ai', 'sdk'].join('/');

/** האם השכבה החכמה זמינה בסביבה הזו. */
export async function assistAvailable() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return { ok: false, reason: 'no_key' };
  try {
    await import(SDK);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'no_sdk' };
  }
}

/*
 * המאגר נשלח למודל כרשימה סגורה. זה מה שהופך את התשובה לבדיקה במקום
 * ליצירה: המודל בוחר מתוך מה שקיים, ולא ממציא תרגיל חדש.
 */
const EXERCISE_VOCAB = EXERCISES
  .map((e) => `${e.id} = ${e.name}${e.nameEn ? ` (${e.nameEn})` : ''}`)
  .join('\n');

const CONSTRAINT_VOCAB = Object.entries(CONSTRAINTS)
  .map(([id, c]) => `${id} = ${c.name}`)
  .join('\n');

const SYSTEM = `אתה עוזר למאמן כושר לייבא גיליון אימונים למערכת ניהול.

המערכת כבר זיהתה לבד את רוב מה שכתוב בגיליון. אתה מקבל *רק* את מה שהיא לא
הצליחה לפענח: שמות תרגילים שנכתבו בשפה חופשית, והערות חופשיות על מתאמנים.

תפקידך להתאים כל פריט למזהה מתוך הרשימות הסגורות שלמטה. אתה בוחר מתוך רשימה,
לא ממציא.

## תרגילים
${EXERCISE_VOCAB}

## מגבלות ופציעות
${CONSTRAINT_VOCAB}

כללים:
- החזר אך ורק JSON תקין, בלי טקסט לפני או אחרי.
- אל תמציא מזהים. מזהה שאינו ברשימה ייזרק.
- כשאינך בטוח — החזר confidence נמוך. אל תנחש בביטחון גבוה.
- כשאין התאמה סבירה כלל — החזר match: null. זו תשובה לגיטימית ועדיפה על התאמה שגויה.
- reason: משפט קצר בעברית שמסביר למאמן על סמך מה ההתאמה. הוא יראה אותו.
- בהערות: severity הוא mild | moderate | acute לפי חומרת הניסוח.

מבנה התשובה:
{"exercises":[{"input":"לחיצה צרפתית","match":"skullcrusher","confidence":0.9,"reason":"שם עממי לפשיטת מרפקים בשכיבה"}],
 "notes":[{"input":"כאב בכתף ימין בלחיצות מעל הראש","constraints":[{"id":"shoulder_impingement","severity":"moderate","side":"right","confidence":0.85,"reason":"כאב בכתף שמופיע בתנועה מעל הראש"}]}]}`;

/**
 * הצעות התאמה לשאריות של ייבוא.
 *
 * @param {{exercises?: string[], notes?: string[]}} leftovers
 * @returns {Promise<{exercises: object[], notes: object[], model: string}>}
 */
export async function suggestMatches(leftovers = {}) {
  const exercises = [...new Set((leftovers.exercises || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 120);
  const notes = [...new Set((leftovers.notes || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 60);
  if (!exercises.length && !notes.length) return { exercises: [], notes: [], model: null };

  const avail = await assistAvailable();
  if (!avail.ok) {
    const err = new Error(avail.reason === 'no_sdk'
      ? 'השכבה החכמה אינה מותקנת. להפעלה: npm install @anthropic-ai/sdk ולהגדיר ANTHROPIC_API_KEY. הייבוא עובד גם בלעדיה.'
      : 'לא הוגדר מפתח API לשכבה החכמה. הייבוא עובד גם בלעדיה — השמות שלא זוהו נשמרים כתרגילים חופשיים.');
    err.code = avail.reason;
    throw err;
  }

  const { default: Anthropic } = await import(SDK);
  const client = new Anthropic();

  const payload = JSON.stringify({ exercises, notes }, null, 1);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    // המאגר הוא החלק היציב והגדול בבקשה, והוא זהה בכל ייבוא — שמירתו
    // במטמון הופכת ייבוא שני ואילך לזול משמעותית
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `הנה מה שלא זוהה. החזר JSON בלבד.\n\n${payload}` }],
  });

  if (response.stop_reason === 'refusal') {
    const err = new Error('הבקשה נדחתה על ידי המודל. הייבוא ממשיך בלי השכבה החכמה.');
    err.code = 'refusal';
    throw err;
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { ...validateSuggestions(parseJson(text)), model: response.model };
}

/*
 * אימות מול המאגר.
 *
 * זה החלק שהופך את השכבה לבטוחה: מזהה שאינו קיים נזרק בשקט, חומרה לא
 * חוקית מתוקנת לברירת מחדל זהירה, וביטחון שאינו מספר הופך ל-0.5. גם אם
 * המודל יחזיר שטויות, מה שייצא מכאן הוא תמיד נתון תקין של המערכת.
 */
export function validateSuggestions(parsed) {
  const validSeverity = new Set(['mild', 'moderate', 'acute']);
  const num = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.5);

  const exercises = (parsed.exercises || [])
    .filter((e) => e && typeof e.input === 'string')
    .map((e) => ({
      input: e.input,
      match: e.match && BY_ID[e.match] ? e.match : null,
      name: e.match && BY_ID[e.match] ? BY_ID[e.match].name : null,
      confidence: num(e.confidence),
      reason: String(e.reason || '').slice(0, 200),
    }));

  const notes = (parsed.notes || [])
    .filter((n) => n && typeof n.input === 'string')
    .map((n) => ({
      input: n.input,
      constraints: (n.constraints || [])
        .filter((c) => c && CONSTRAINTS[c.id])
        .map((c) => ({
          id: c.id,
          name: CONSTRAINTS[c.id].name,
          severity: validSeverity.has(c.severity) ? c.severity : 'moderate',
          side: ['right', 'left', 'both'].includes(c.side) ? c.side : null,
          confidence: num(c.confidence),
          reason: String(c.reason || '').slice(0, 200),
        })),
    }))
    .filter((n) => n.constraints.length);

  return { exercises, notes };
}

/** JSON מתוך תשובה שעשויה להגיע עטופה בגדר קוד. */
function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const at = cleaned.indexOf('{');
    const to = cleaned.lastIndexOf('}');
    if (at >= 0 && to > at) {
      try { return JSON.parse(cleaned.slice(at, to + 1)); } catch { /* נופל לשגיאה למטה */ }
    }
    const err = new Error('התשובה מהמודל לא הייתה JSON תקין. הייבוא ממשיך בלי השכבה החכמה.');
    err.code = 'bad_json';
    throw err;
  }
}
