/**
 * מלאי המשקלים בפועל.
 *
 * "45 ק״ג" זו הצעה תיאורטית. השאלה המעשית היא האם אפשר להרכיב 45 ק״ג
 * מהציוד שבאמת עומד בחדר — ואם לא, מה המשקל הקרוב ביותר שכן.
 *
 * המודל מתאר בדיוק מה יש: אילו משקולות יד ובאיזו כמות, אילו פלטות, אילו
 * מוטות, אילו קטלבלים, ומה הטווח והקפיצה של כל מחסנית מכונה. מכאן המערכת
 * יודעת להגיד "40 ק״ג = מוט 20 + 2×10" במקום מספר שאי אפשר לבנות.
 */

import { SINGLE_IMPLEMENT } from '../engine/loads.js';

/** מלאי ברירת מחדל לסטודיו שלא פירט — נגזר מהמעט שכן ידוע עליו. */
export function defaultInventory(studio) {
  const step = studio.weightIncrementKg || 2.5;
  const max = studio.dumbbellMaxKg || 30;
  const dumbbells = [];
  for (let kg = Math.min(2, step); kg <= max + 0.001; kg += (kg < 10 ? Math.min(1, step) : step)) {
    dumbbells.push({ kg: +kg.toFixed(1), count: 2 });
  }
  return {
    dumbbells,
    kettlebells: [8, 12, 16, 20, 24].map((kg) => ({ kg, count: 1 })),
    plates: [{ kg: 20, count: 4 }, { kg: 15, count: 2 }, { kg: 10, count: 4 },
      { kg: 5, count: 4 }, { kg: 2.5, count: 4 }, { kg: 1.25, count: 4 }],
    bars: [{ kg: 20, count: 1, type: 'olympic' }, { kg: 15, count: 1, type: 'light' }, { kg: 7.5, count: 1, type: 'ez' }],
    fixedBars: [],
    stacks: {},
    generated: true,
  };
}

/** נרמול מלאי שהוזן ידנית. */
export function normalizeInventory(raw, studio) {
  if (!raw || (!raw.dumbbells?.length && !raw.plates?.length && !raw.kettlebells?.length && !raw.fixedBars?.length)) {
    return defaultInventory(studio);
  }
  const clean = (list) => (list || [])
    .map((x) => ({ kg: +x.kg, count: Math.max(1, Math.round(+x.count || 1)), type: x.type }))
    .filter((x) => Number.isFinite(x.kg) && x.kg > 0)
    .sort((a, b) => a.kg - b.kg);

  return {
    dumbbells: clean(raw.dumbbells),
    kettlebells: clean(raw.kettlebells),
    plates: clean(raw.plates),
    bars: clean(raw.bars).length ? clean(raw.bars) : [{ kg: 20, count: 1, type: 'olympic' }],
    fixedBars: clean(raw.fixedBars),
    /** מחסניות מכונה: { leg_press: { max: 200, step: 10 } } */
    stacks: raw.stacks || {},
    generated: false,
  };
}

/**
 * אילו מוטות מתאימים לתרגיל.
 * מוט EZ אינו מוט סקוואט, ומוט קל אינו הבחירה הראשונה לדדליפט —
 * לכן בחירת המוט נגזרת מהתרגיל ולא רק מהמשקל שיוצא הכי נוח.
 */
export function barsFor(ex, inv) {
  if (!ex) return inv.bars;
  const eq = new Set(ex.eq.flat());
  // מוט EZ הוא הבחירה הטבעית לעבודת מרפקים, גם כשהתרגיל מאפשר גם מוט ישר
  const elbowWork = ex.pattern === 'elbow_flexion' || ex.pattern === 'elbow_extension';
  const wantsEz = eq.has('ez_bar') && (elbowWork || !eq.has('barbell'));
  const bars = inv.bars.filter((b) => (wantsEz ? b.type === 'ez' : b.type !== 'ez'));
  if (!bars.length) return inv.bars;
  // המוט הכבד (האולימפי) הוא ברירת המחדל; הקל משמש כשאין ברירה
  return bars.sort((a, b) => b.kg - a.kg);
}

/** כל המשקלים שאפשר להרכיב על מוט, ממוינים. */
export function barbellLoads(inv, { maxKg = 400, ex = null } = {}) {
  const out = new Set();
  for (const bar of barsFor(ex, inv)) {
    out.add(bar.kg);
    // פלטות נטענות בזוגות — צד אחד וצד שני
    const pairs = inv.plates.flatMap((p) => Array(Math.floor(p.count / 2)).fill(p.kg));
    const sums = new Set([0]);
    for (const kg of pairs) {
      for (const s of [...sums]) {
        const next = s + kg;
        if (bar.kg + next * 2 <= maxKg) sums.add(next);
      }
    }
    for (const s of sums) out.add(+(bar.kg + s * 2).toFixed(2));
  }
  return [...out].sort((a, b) => a - b);
}

/** פירוק משקל מוט לפלטות, לתצוגה למאמן. */
export function barbellBreakdown(target, inv, ex = null) {
  let best = null;
  for (const bar of barsFor(ex, inv)) {
    if (bar.kg > target + 0.001) continue;
    const perSide = (target - bar.kg) / 2;
    const used = [];
    let left = perSide;
    for (const p of [...inv.plates].sort((a, b) => b.kg - a.kg)) {
      const available = Math.floor(p.count / 2);
      let n = 0;
      while (n < available && left >= p.kg - 0.001) { left -= p.kg; n += 1; }
      if (n) used.push({ kg: p.kg, perSide: n });
    }
    if (Math.abs(left) < 0.01) {
      const text = used.length
        ? `מוט ${bar.kg} + ${used.map((u) => `${u.perSide}×${u.kg}`).join(' + ')} לכל צד`
        : `מוט ${bar.kg} בלבד`;
      // המוט הראשון ברשימה הוא המועדף לתרגיל; לא מחליפים אותו רק כדי לחסוך פלטה
      if (!best) best = { bar: bar.kg, used, text };
    }
  }
  return best;
}

/** המשקלים הזמינים למשקולות יד — בזוג או בודדת. */
export function dumbbellLoads(inv, needPair) {
  return inv.dumbbells.filter((d) => (needPair ? d.count >= 2 : d.count >= 1)).map((d) => d.kg);
}

export function kettlebellLoads(inv) {
  return inv.kettlebells.map((k) => k.kg);
}

/** הערך הקרוב ביותר ברשימה, בעדיפות לא לחרוג כלפי מעלה. */
function nearest(list, target) {
  if (!list.length) return null;
  const below = list.filter((x) => x <= target + 0.001);
  const above = list.filter((x) => x > target);
  if (!below.length) return above[0];
  if (!above.length) return below[below.length - 1];
  const lo = below[below.length - 1];
  const hi = above[0];
  return (target - lo) <= (hi - target) * 0.75 ? lo : hi;
}

/**
 * המשקל שבאמת אפשר להרכיב לתרגיל הזה בסטודיו הזה.
 * @returns {{kg:number|null, text:string, exact:boolean, source:string}}
 */
export function achievableLoad(target, ex, studio) {
  if (target == null || !Number.isFinite(target)) return { kg: null, text: '', exact: false, source: 'none' };
  const inv = studio.inventory;
  if (!inv) return { kg: target, text: '', exact: false, source: 'none' };

  const eq = new Set(ex.eq.flat());
  const singleImplement = SINGLE_IMPLEMENT.has(ex.id);

  // מכונה עם מחסנית מוגדרת
  for (const item of eq) {
    const stack = inv.stacks?.[item];
    if (!stack) continue;
    const step = stack.step || 5;
    let kg = Math.round(target / step) * step;
    kg = Math.max(step, Math.min(kg, stack.max || kg));
    return { kg, text: `מחסנית ${item} · קפיצות ${step} ק״ג`, exact: true, source: 'stack' };
  }

  if (eq.has('dumbbell')) {
    const needPair = !ex.unilateral && !singleImplement;
    const list = dumbbellLoads(inv, needPair);
    const kg = nearest(list, target);
    if (kg == null) return { kg: target, text: 'אין משקולות מתאימות במלאי', exact: false, source: 'dumbbell' };
    const has = inv.dumbbells.find((d) => d.kg === kg);
    return {
      kg,
      text: needPair ? `זוג משקולות ${kg} ק״ג${has && has.count < 2 ? ' — יש רק אחת!' : ''}` : `משקולת ${kg} ק״ג`,
      exact: Math.abs(kg - target) < 0.01,
      source: 'dumbbell',
    };
  }

  if (eq.has('kettlebell')) {
    const kg = nearest(kettlebellLoads(inv), target);
    if (kg == null) return { kg: target, text: 'אין קטלבלים במלאי', exact: false, source: 'kettlebell' };
    return { kg, text: `קטלבל ${kg} ק״ג`, exact: Math.abs(kg - target) < 0.01, source: 'kettlebell' };
  }

  if (eq.has('fixed_barbell') && inv.fixedBars.length) {
    const kg = nearest(inv.fixedBars.map((b) => b.kg), target);
    return { kg, text: `מוט קבוע ${kg} ק״ג`, exact: Math.abs(kg - target) < 0.01, source: 'fixed_bar' };
  }

  if (eq.has('barbell') || eq.has('ez_bar') || eq.has('trap_bar')) {
    const loads = barbellLoads(inv, { ex });
    const kg = nearest(loads, target);
    if (kg == null) return { kg: target, text: '', exact: false, source: 'barbell' };
    const bd = barbellBreakdown(kg, inv, ex);
    return { kg, text: bd ? bd.text : `${kg} ק״ג`, exact: Math.abs(kg - target) < 0.01, source: 'barbell' };
  }

  return { kg: target, text: '', exact: false, source: 'other' };
}

/** סיכום המלאי לתצוגה. */
export function inventorySummary(inv) {
  if (!inv) return '';
  const parts = [];
  if (inv.dumbbells.length) {
    parts.push(`משקולות ${inv.dumbbells[0].kg}–${inv.dumbbells[inv.dumbbells.length - 1].kg} ק״ג (${inv.dumbbells.length} סוגים)`);
  }
  if (inv.kettlebells.length) parts.push(`${inv.kettlebells.length} קטלבלים`);
  if (inv.plates.length) parts.push(`${inv.plates.reduce((s, p) => s + p.count, 0)} פלטות`);
  if (inv.bars.length) parts.push(`${inv.bars.length} מוטות`);
  return parts.join(' · ');
}
