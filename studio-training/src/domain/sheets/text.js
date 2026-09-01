/**
 * שכבת הטקסט של הייבוא.
 *
 * גיליון של סטודיו אמיתי לא כתוב בשפה של המנוע. כתוב בו "משקולות יד 2-24",
 * "כאבי ברך (שמאל)", "מתחילה", "3 פעמים בשבוע". התפקיד של הקובץ הזה הוא
 * להפוך טקסט אנושי — עברית עם ניקוד, גרשיים, אותיות סופיות ושגיאות כתיב —
 * למשהו שאפשר להשוות אליו, ולמדוד כמה שתי מחרוזות קרובות זו לזו.
 *
 * אין כאן ידע על אימונים. רק טקסט, מספרים ותאריכים.
 */

/** אותיות סופיות -> רגילות, כדי ש"אימון" ו"אימונים" יתחילו אותו דבר. */
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/**
 * נרמול מחרוזת להשוואה: בלי ניקוד, בלי גרשיים, בלי סימני פיסוק,
 * בלי אותיות סופיות, ובאותיות קטנות.
 */
/*
 * נרמול הוא הפעולה הכי נפוצה בייבוא: כל תא מושווה למאות מונחים, וכל
 * השוואה מנרמלת מחדש את שני הצדדים. בגיליון של סטודיו אמיתי — עשרות
 * לשוניות, אלפי שורות — זה ההבדל בין ניתוח של שנייה לבין דף שנתקע.
 * הזיכרון מוגבל בגודלו כדי שלא יגדל בלי סוף.
 */
const normCache = new Map();
const NORM_CACHE_MAX = 20000;

export function shNorm(value) {
  const key = typeof value === 'string' ? value : null;
  if (key !== null) {
    const hit = normCache.get(key);
    if (hit !== undefined) return hit;
  }
  const out = shNormRaw(value);
  if (key !== null) {
    if (normCache.size >= NORM_CACHE_MAX) normCache.clear();
    normCache.set(key, out);
  }
  return out;
}

function shNormRaw(value) {
  return String(value ?? '')
    .replace(/[֑-ׇ]/g, '')            // ניקוד וטעמים
    .replace(/[‎‏‪-‮]/g, '') // סימני כיווניות שמגיעים מגיליונות
    .replace(/[׳״'"`]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** מילים קצרות שאינן נושאות מידע ורק מרעישות את ההשוואה. */
const STOP = new Set(['של', 'עם', 'על', 'את', 'ואת', 'או', 'גם', 'לא', 'כל', 'the', 'of', 'and', 'a', 'in', 'for'].map(shNorm));

export function shTokens(value) {
  return shNorm(value).split(' ').filter((t) => t && !STOP.has(t));
}

/** מקדם דמיון של Dice על צמדי תווים — עמיד לשגיאות כתיב ולסיומות. */
function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const pairs = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      m.set(p, (m.get(p) || 0) + 1);
    }
    return m;
  };
  const pa = pairs(a); const pb = pairs(b);
  let hit = 0; let total = 0;
  for (const [, n] of pa) total += n;
  for (const [p, n] of pb) {
    total += n;
    const have = pa.get(p) || 0;
    if (have) { hit += Math.min(have, n); }
  }
  return total ? (2 * hit) / total : 0;
}

/**
 * דמיון בין שתי מחרוזות, 0..1.
 *
 * שילוב של שתי מדידות שונות בכוונה: חפיפת מילים תופסת "לחיצת חזה במוט"
 * מול "לחיצת חזה", וצמדי תווים תופסים "סקוואט" מול "סקווט".
 */
/**
 * מילים כלליות שמופיעות בהתחלה של הרבה שמות שונים.
 * "מכונת קפה" ו"מכונת קירוב" חולקות מילה שלמה ולא אומרות דבר דומה, ולכן
 * שיתוף של מילה כללית בלבד אינו נחשב לדמיון אמיתי.
 */
/*
 * מילים שאינן מזהות תרגיל בפני עצמן.
 *
 * "לחיצה" היא משפחה שלמה — חזה, כתפיים, רגליים, צרפתית — ולא תרגיל אחד.
 * כשמילה כזאת לבדה הספיקה להתאמה, "לחיצה צרפתית" נקלטה כלחיצת כתפיים
 * בביטחון מלא, וזה גרוע יותר מאשר לא לזהות בכלל: שם שלא זוהה מוצג למאמן,
 * ושם שזוהה לא נכון נכנס בשקט ולוקח איתו את משקלי העבודה.
 *
 * שתי הצורות — הנסמכת ("לחיצת") והנפרדת ("לחיצה") — כי הנרמול אינו מאחד
 * ביניהן.
 */
const GENERIC = new Set(['מכונת', 'מכונה', 'מכשיר', 'ספסל', 'כדור', 'מוט', 'גומיית', 'תרגיל',
  'אימון', 'לחיצת', 'משיכת', 'כפיפת', 'פשיטת', 'הרמת',
  'לחיצה', 'משיכה', 'כפיפה', 'פשיטה', 'הרמה', 'חתירה', 'הרחקה', 'הרחקת', 'קירוב', 'קירובי',
  'machine', 'bench', 'ball', 'bar', 'press', 'row', 'pull', 'curl', 'extension', 'raise']
  .map(shNorm));

export function shSimilarity(a, b) {
  const na = shNorm(a); const nb = shNorm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = shTokens(a); const tb = shTokens(b);
  const setA = new Set(ta); const setB = new Set(tb);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  // חפיפה יחסית לקצר מבין השניים: "כאב ברך" בתוך "כאב ברך מתמשך שמאל"
  const overlap = shared / Math.max(1, Math.min(setA.size, setB.size));
  /*
   * הכלה היא ראיה חזקה — אבל רק כשהמחרוזת הקצרה היא באמת חלק מהותי מהארוכה.
   * אות בודדת "מוכלת" כמעט בכל מילה, וכך תא של סימון נוכחות היה נקרא כרמת
   * מתאמן. לכן נדרש אורך מינימלי ויחס אורך סביר.
   */
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  // "רון" יושב בתוך "מזרון" ואינו קשור אליו. מילה קצרה או חלק זעיר
  // מהמחרוזת אינם עדות להכלה אמיתית.
  const contains = short.length >= 4 && short.length / long.length >= 0.5 && long.includes(short) ? 0.85 : 0;

  // הצירוף הוא הכלל, אבל אף מדידה לא אמורה להוריד ציון של אחותה:
  // "סקוואט" מול "סקווט" הן מילה אחת בלי חפיפת מילים, וצמדי התווים לבדם
  // צריכים להספיק. לכן לוקחים את הגבוה מבין הצורות.
  let score = Math.max(contains, dice(na, nb), 0.55 * dice(na, nb) + 0.45 * overlap);

  // שתי מחרוזות שכל המשותף להן הוא מילה כללית — הדמיון ביניהן מדומה
  if (!contains && setA.size > 1 && setB.size > 1) {
    const sharedTokens = [...setA].filter((t) => setB.has(t));
    if (sharedTokens.length && sharedTokens.every((t) => GENERIC.has(t))) {
      // אלא אם מה שנשאר אחרי המילה הכללית עדיין מתחיל אותו דבר:
      // "כפיפת ברכיים" ו"כפיפת ברך" הן אותה תנועה, "לחיצת חזה" ו"לחיצת רגליים" לא.
      const rest = (set) => [...set].filter((t) => !GENERIC.has(t));
      const near = rest(setA).some((x) => rest(setB).some((y) => {
        const [sh, lo] = x.length <= y.length ? [x, y] : [y, x];
        return sh.length >= 3 && lo.startsWith(sh);
      }));
      if (!near) score *= 0.7;
    }
  }
  return score;
}

/**
 * ההתאמה הטובה ביותר מתוך רשימת מועמדים.
 * כל מועמד הוא { key, terms } — terms הן כל הצורות שבהן מקובל לכתוב אותו.
 * מחזיר null כשאף מועמד אינו קרוב מספיק; ניחוש גרוע גרוע מלא לנחש.
 */
const matchCache = new WeakMap();

export function shMatch(value, candidates, { min = 0.62 } = {}) {
  const raw = shNorm(value);
  if (!raw) return null;

  // אותו ערך מול אותה רשימת מועמדים מחזיר תמיד אותה תשובה. בגיליון חוזר
  // אותו תרגיל בכל שורה, ובלי הזיכרון הזה הוא נבדק מחדש בכל פעם.
  let byList = matchCache.get(candidates);
  if (!byList) { byList = new Map(); matchCache.set(candidates, byList); }
  const key = `${min}\u0000${raw}`;
  const cached = byList.get(key);
  if (cached !== undefined) return cached;

  let best = null;
  for (const cand of candidates) {
    for (const term of cand.terms) {
      const score = shSimilarity(raw, term);
      if (score >= min && (!best || score > best.score)) {
        best = { key: cand.key, score: +score.toFixed(3), matched: term, value: cand.value };
        if (score === 1) break;
      }
    }
    if (best && best.score === 1) break;
  }
  if (byList.size >= NORM_CACHE_MAX) byList.clear();
  byList.set(key, best);
  return best;
}

/**
 * התאמה לביטוי בתוך משפט.
 *
 * מאמן לא כותב "כאבי ברכיים" אלא "כאבי ברך שמאל (חריף)". השם הקנוני קצר
 * מהתיאור, ולכן השוואה של המשפט כולו תמיד תיתן ציון נמוך. כאן מנסים קודם
 * את המשפט השלם, ואם הוא לא מספיק — כל רצף של מילה עד שלוש מתוכו.
 */
export function shMatchPhrase(value, candidates, opts = {}) {
  const direct = shMatch(value, candidates, opts);
  if (direct && direct.score >= 0.8) return direct;

  const tokens = shTokens(value).slice(0, 8);
  let best = direct;
  for (let size = Math.min(3, tokens.length); size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const window = tokens.slice(i, i + size)
        // "ויציבה" היא "יציבה" עם ו' החיבור. בלי זה מטרה שנייה במשפט נעלמת.
        .map((t) => (t.length > 3 && t.startsWith('ו') ? t.slice(1) : t));
      // "מכונת" לבדה אינה מזהה כלום: היא מופיעה בעשרה פריטים שונים.
      // חלון שכולו מילים כלליות לא נבדק, אחרת "מכונת אספרסו" הייתה מתאימה למשהו.
      if (window.every((t) => GENERIC.has(t))) continue;
      const hit = shMatch(window.join(' '), candidates, opts);
      if (hit && (!best || hit.score > best.score)) best = hit;
    }
  }
  return best;
}

/** כל ההתאמות מעל הסף — לעמודה שמכילה כמה ערכים בתא אחד. */
export function shMatchAll(value, candidates, opts = {}) {
  const out = new Map();
  for (const part of shSplitList(value)) {
    const hit = shMatch(part, candidates, opts) || shMatchPhrase(part, candidates, opts);
    if (hit && (!out.has(hit.key) || out.get(hit.key).score < hit.score)) out.set(hit.key, { ...hit, source: part });
  }
  return [...out.values()];
}

/** פיצול תא שמכיל רשימה: פסיקים, נקודה-פסיק, קו נטוי, "ו-", ירידות שורה. */
export function shSplitList(value) {
  return String(value ?? '')
    .split(/[,;\/|\n\r+]+|\s+ו-\s*|\s-\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const UNIT_NOISE = /(ק["׳']?ג|קילו|kg|ס["׳']?מ|cm|מטר|מ["׳']|%|אחוז|דק["׳']?|דקות|min|שנים|שנה|חודשים|חודש|פעמים|פעם|יח["׳']?|יחידות|זוגות|זוג)/gi;

/**
 * מספר מתוך טקסט אנושי: "80 ק״ג", "1.75 מ׳", "כ-12", "8,5".
 * מחזיר null כשאין מספר — ולא 0, כי 0 הוא ערך אמיתי.
 */
export function shNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value ?? '').replace(UNIT_NOISE, ' ').replace(/[‎‏]/g, '');
  if (!s.trim()) return null;
  s = s.replace(/(\d{1,3})(,\d{3})+(?!\d)/g, (m) => m.replace(/,/g, ''));  // 1,200 -> 1200
  s = s.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');                          // 8,5 -> 8.5
  // מקף שצמוד לאות הוא חלק ממילה ("כ-12", "מ-5") ואינו סימן מינוס
  s = s.replace(/([\p{L}])-(\d)/gu, '$1 $2');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** טווח מתוך טקסט: "2-24", "מ-5 עד 30", "5 עד 30". מחזיר {min,max} או null. */
export function shRange(value) {
  const s = String(value ?? '').replace(UNIT_NOISE, ' ');
  const nums = (s.match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** הרשימות עוברות את אותו נרמול כמו הקלט — אחרת אות סופית מחביאה מילה שלמה. */
const TRUE_WORDS = new Set(['כן', 'יש', 'קיים', 'קיימת', 'פעיל', 'פעילה', 'v', '✓', '✔', 'x', 'true', 'yes', 'y', '1', 'בוצע', 'הגיע', 'הגיעה', 'אושר', 'ok'].map(shNorm));
const FALSE_WORDS = new Set(['לא', 'אין', 'לא פעיל', 'לא פעילה', 'false', 'no', 'n', '0', 'לא הגיע', 'לא הגיעה', 'ביטול', 'בוטל', '✗', '✘', 'הופסק'].map(shNorm));

/** כן/לא בכל הצורות שמופיעות בגיליונות. מחזיר null כשאי אפשר להכריע. */
export function shBool(value) {
  const s = shNorm(value);
  if (!s) return null;
  if (FALSE_WORDS.has(s)) return false;   // קודם לשלילה: "לא פעיל" מכיל "פעיל"
  if (TRUE_WORDS.has(s)) return true;
  if (/^לא\b/.test(s)) return false;
  return null;
}

/**
 * טלפון ישראלי בכל צורת כתיבה.
 *
 * כולל את המקרה שבו האפס המוביל נעלם: עמודת טלפון שהוגדרה בגיליון
 * כמספר מאבדת אותו, ו-0541234567 נשמר כ-541234567. מספר בן תשע ספרות
 * שמתחיל ב-5 הוא נייד ישראלי בלי האפס, ואין לו פירוש סביר אחר.
 */
export function shPhone(value) {
  const digits = String(value ?? '').replace(/[^\d+]/g, '');
  let local = digits.replace(/^\+?972/, '0');
  if (/^5\d{8}$/.test(local)) local = `0${local}`;
  if (!/^0\d{8,9}$/.test(local)) return null;
  return local;
}

export function shEmail(value) {
  const m = String(value ?? '').match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * תאריך -> YYYY-MM-DD.
 *
 * גיליונות מגישים תאריכים בארבע צורות שונות לפחות: טקסט בסדר ישראלי
 * (יום/חודש/שנה), ISO, מספר סידורי של Sheets, ומחרוזת Date(2024,0,15)
 * שמגיעה מ-gviz. כולן מטופלות כאן, ומה שלא ברור מוחזר null.
 */
export function shDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const gviz = raw.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
  if (gviz) return iso(+gviz[1], +gviz[2] + 1, +gviz[3]);

  const isoHit = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoHit) return iso(+isoHit[1], +isoHit[2], +isoHit[3]);

  const local = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (local) {
    let [, d, m, y] = local;
    d = +d; m = +m; y = +y;
    // בישראל כותבים יום/חודש. אם החלק הראשון לא יכול להיות יום — הופכים.
    if (d > 12 && m <= 12) { /* ברור */ } else if (m > 12 && d <= 12) { [d, m] = [m, d]; }
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return iso(y, m, d);
  }

  // מספר סידורי של גיליון: ימים מאז 30/12/1899
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    const dt = new Date(ms);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(raw)) {
    return iso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return null;
}

/** האם התא ריק לכל דבר ועניין (כולל "-" ו"ללא"). */
export function shEmpty(value) {
  const s = shNorm(value);
  return !s || s === '-' || s === 'ללא' || s === 'אין' || s === 'na' || s === 'n a';
}
