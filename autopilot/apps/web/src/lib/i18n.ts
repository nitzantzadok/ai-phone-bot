/**
 * Interface copy, in both launch languages.
 *
 * Kept as data rather than scattered through components so that a Hebrew reviewer can read
 * every customer-facing string in one place. The rule the copy follows: say what happened
 * in words a restaurant owner uses, never in words an SEO consultant uses.
 */
export type UiLanguage = 'he' | 'en'

export const DICTIONARY = {
  he: {
    dir: 'rtl',
    locale: 'he-IL',
    appName: 'AI Recommendation Autopilot',
    score: 'ציון ההמלצה ב-AI',
    scoreOutOf: 'מתוך 100',
    thisMonth: 'החודש',
    visibility: 'הנראות שלך',
    recommendationShare: 'נתח ההמלצות',
    mentioned: 'הוזכרתם',
    top3: 'בשלושת הראשונים',
    top1: 'בחירה ראשונה',
    agentActivity: 'פעילות הסוכן',
    opportunities: 'הזדמנויות',
    accuracy: 'דיוק המידע',
    competitors: 'מתחרים',
    applied: 'בוצע',
    waiting: 'ממתין לאישור',
    approve: 'אישור',
    reject: 'דחייה',
    viewChange: 'הצגת השינוי',
    whyThis: 'למה זה חשוב',
    controlled: 'בשליטתנו',
    influenceable: 'ניתן להשפיע',
    notControlled: 'לא בשליטתנו',
    lastChecked: 'נבדק לאחרונה',
    source: 'מקור',
    confidence: 'רמת ודאות',
    simulated: 'סימולציה',
    noData: 'עוד לא נאספו נתונים',
  },
  en: {
    dir: 'ltr',
    locale: 'en-IL',
    appName: 'AI Recommendation Autopilot',
    score: 'AI Recommendation Score',
    scoreOutOf: 'out of 100',
    thisMonth: 'this month',
    visibility: 'Your AI visibility',
    recommendationShare: 'Recommendation share',
    mentioned: 'Mentioned',
    top3: 'Top 3',
    top1: 'First choice',
    agentActivity: 'Agent activity',
    opportunities: 'Opportunities',
    accuracy: 'Information accuracy',
    competitors: 'Competitors',
    applied: 'Applied',
    waiting: 'Waiting for you',
    approve: 'Approve',
    reject: 'Reject',
    viewChange: 'View the change',
    whyThis: 'Why this matters',
    controlled: 'We can fix this',
    influenceable: 'We can influence this',
    notControlled: 'Outside our control',
    lastChecked: 'Last checked',
    source: 'Source',
    confidence: 'Confidence',
    simulated: 'Simulated',
    noData: 'No data collected yet',
  },
} as const

export const t = (language: UiLanguage) => DICTIONARY[language]
