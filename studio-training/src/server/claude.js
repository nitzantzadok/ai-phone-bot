/**
 * הלקוח למודל — קריאת HTTP ישירה, בלי SDK.
 *
 * הבחירה מהונדסת ולא אסתטית: המערכת רצה בשני מקומות — שרת Node וקצה
 * (Cloudflare Workers). טעינת SDK בזמן ריצה אינה אפשרית בקצה, מה שאומר
 * שהשכבה החכמה כולה הייתה כבויה בדיוק בסביבה שבה המערכת באמת רצה.
 * ה-API עצמו הוא בקשת POST אחת, ו-fetch קיים בשתי הסביבות. אפס תלויות,
 * התנהגות זהה בכל מקום.
 */

const VERSION = '2023-06-01';
export const CLAUDE_MODEL = 'claude-opus-5';

const baseUrl = () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const apiKey = () => process.env.ANTHROPIC_API_KEY || '';

/** האם המודל זמין בסביבה הזאת. בלי מפתח — הכול ממשיך לעבוד בלעדיו. */
export function claudeAvailable() {
  return apiKey()
    ? { ok: true }
    : { ok: false, reason: 'no_key' };
}

/**
 * קריאה אחת למודל. מחזירה את הטקסט המאוחד של התשובה.
 *
 * @param {{system: string, user: string|object[], maxTokens?: number}} req
 * user יכול להיות טקסט או מערך בלוקים (לתמונות).
 * @returns {Promise<{text: string, model: string}>}
 */
export async function claudeCall({ system, user, maxTokens = 8000 }) {
  const avail = claudeAvailable();
  if (!avail.ok) {
    const err = new Error('לא הוגדר מפתח API לשכבה החכמה. המערכת ממשיכה לעבוד בלעדיה.');
    err.code = avail.reason;
    throw err;
  }

  const res = await fetch(`${baseUrl()}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey(),
      'anthropic-version': VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      /*
       * המערכת שולחת בכל קריאה את אותו הסבר ואת אותם מאגרים סגורים —
       * שמירתם במטמון של הספק הופכת כל קריאה אחרי הראשונה לזולה בהרבה.
       */
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`המודל החזיר שגיאה (${res.status}). המערכת ממשיכה בלי השכבה החכמה.`);
    err.code = res.status === 401 ? 'bad_key' : (res.status === 429 ? 'rate_limited' : 'http_error');
    err.detail = body.slice(0, 300);
    throw err;
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    const err = new Error('הבקשה נדחתה על ידי המודל.');
    err.code = 'refusal';
    throw err;
  }
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { text, model: data.model || CLAUDE_MODEL };
}

/** JSON מתוך תשובה שעשויה להגיע עטופה בגדר קוד או בטקסט מסביר. */
export function claudeJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const at = cleaned.indexOf('{');
    const to = cleaned.lastIndexOf('}');
    if (at >= 0 && to > at) {
      try { return JSON.parse(cleaned.slice(at, to + 1)); } catch { /* למטה */ }
    }
    const err = new Error('התשובה מהמודל לא הייתה JSON תקין.');
    err.code = 'bad_json';
    throw err;
  }
}
