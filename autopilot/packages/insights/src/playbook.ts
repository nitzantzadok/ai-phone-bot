/**
 * Turning a diagnosis into a playbook the customer can act on.
 *
 * The diagnosis says what is wrong. This says what to do about it, in order, with the
 * generic advice suppressed where we already have a measured finding — telling someone
 * "state what you are good for" when we have already told them "your site never says
 * romantic and 8 questions depend on it" is worse than saying nothing, because it makes the
 * specific finding look like filler.
 */
import type { Controllability } from '@autopilot/shared/domain.ts'
import type { Opportunity } from '@autopilot/optimization/diagnosis.ts'
import {
  prioritizedInsights,
  type Insight,
  type InsightCategory,
} from './catalogue.ts'

export type Language = 'he' | 'en'

export interface PlaybookItem {
  readonly kind: 'MEASURED' | 'GENERAL'
  readonly title: string
  readonly why: string
  readonly steps: readonly string[]
  readonly controllability: Controllability
  readonly weDoThisForYou: boolean
  readonly howYouWillKnow: string
  /** Present on measured items: the evidence that produced it. */
  readonly evidence?: Record<string, unknown>
}

export interface Playbook {
  readonly headline: string
  readonly items: readonly PlaybookItem[]
  /** Stated separately so it is never mistaken for a task list. */
  readonly outsideOurControl: readonly PlaybookItem[]
}

/** Maps an opportunity category to the insight category it evidences. */
const OPPORTUNITY_TO_INSIGHT: Record<string, InsightCategory> = {
  TECHNICAL: 'ACCESSIBILITY',
  CONTENT: 'ATTRIBUTES',
  ENTITY: 'CONSISTENCY',
  SCHEMA: 'STRUCTURE',
  PROFILE: 'IDENTITY',
}

const localize = (value: { he: string; en: string }, language: Language): string =>
  language === 'he' ? value.he : value.en

const fromInsight = (insight: Insight, language: Language): PlaybookItem => ({
  kind: 'GENERAL',
  title: localize(insight.title, language),
  why: localize(insight.why, language),
  steps: insight.steps.map((s) => localize(s, language)),
  controllability: insight.controllability,
  weDoThisForYou: insight.weDoThisForYou,
  howYouWillKnow: localize(insight.howYouWillKnow, language),
})

const fromOpportunity = (opportunity: Opportunity, language: Language): PlaybookItem => ({
  kind: 'MEASURED',
  title: opportunity.title,
  why: opportunity.explanation,
  steps: opportunity.autoFixable
    ? [
        language === 'he'
          ? 'אנחנו נטפל בזה אוטומטית. תוכלו לראות בדיוק מה שונה, ולבטל בלחיצה.'
          : 'We handle this automatically. You can see exactly what changed and undo it in one click.',
      ]
    : [
        language === 'he'
          ? 'זה דורש החלטה שלכם. נציג לכם בדיוק מה מוצע לפני שמשנים משהו.'
          : 'This needs a decision from you. We show you exactly what we propose before anything changes.',
      ],
  controllability: opportunity.controllability,
  weDoThisForYou: opportunity.autoFixable,
  howYouWillKnow:
    language === 'he'
      ? 'נמדוד מחדש את אותן שאלות ונראה אם המצב השתנה.'
      : 'We re-measure the same questions and see whether it moved.',
  evidence: opportunity.evidence,
})

export interface PlaybookInput {
  readonly vertical: string
  readonly language: Language
  readonly opportunities?: readonly Opportunity[]
  readonly businessName?: string
  /** Cap on general advice, so a measured diagnosis is never buried under priors. */
  readonly maxGeneral?: number
}

export const buildPlaybook = (input: PlaybookInput): Playbook => {
  const language = input.language
  const opportunities = input.opportunities ?? []

  // Categories where we have a real finding. General advice on these is suppressed.
  const measuredCategories = new Set<InsightCategory>(
    opportunities
      .map((o) => OPPORTUNITY_TO_INSIGHT[o.category])
      .filter((c): c is InsightCategory => c !== undefined),
  )

  const measured = opportunities
    .filter((o) => o.controllability !== 'NOT_CONTROLLED')
    .map((o) => fromOpportunity(o, language))

  const general = prioritizedInsights(input.vertical, {
    weakCategories: [...measuredCategories],
  })
    .filter((i) => i.controllability !== 'NOT_CONTROLLED')
    .filter((i) => !measuredCategories.has(i.category))
    .slice(0, input.maxGeneral ?? 4)
    .map((i) => fromInsight(i, language))

  const external = [
    ...opportunities
      .filter((o) => o.controllability === 'NOT_CONTROLLED')
      .map((o) => fromOpportunity(o, language)),
    ...prioritizedInsights(input.vertical)
      .filter((i) => i.controllability === 'NOT_CONTROLLED')
      .map((i) => fromInsight(i, language)),
  ]

  return {
    headline: buildHeadline(measured.length, input.businessName, language),
    items: [...measured, ...general],
    outsideOurControl: external,
  }
}

const buildHeadline = (
  measuredCount: number,
  businessName: string | undefined,
  language: Language,
): string => {
  const name = businessName ?? (language === 'he' ? 'העסק שלכם' : 'your business')

  if (measuredCount === 0) {
    return language === 'he'
      ? `עוד לא מדדנו את ${name}. עד שנמדוד, אלה הדברים שהכי משפיעים בעסקים כמו שלכם.`
      : `We have not measured ${name} yet. Until we do, these are the things that matter most for businesses like yours.`
  }

  return language === 'he'
    ? `מצאנו ${measuredCount} דברים ספציפיים ב-${name} שאפשר לתקן. הם מבוססים על מדידה, לא על עצה כללית.`
    : `We found ${measuredCount} specific things at ${name} that can be fixed. These come from measurement, not from general advice.`
}

/**
 * The starter checklist a business can act on before signing up for anything.
 *
 * Deliberately given away. A business that does these four things is measurably easier for
 * an AI to recommend, whether or not they ever become a customer, and a product that only
 * helps people who pay is a product nobody trusts enough to pay for.
 */
export const starterChecklist = (language: Language): readonly PlaybookItem[] =>
  prioritizedInsights('local_business')
    .filter((i) => i.controllability === 'CONTROLLED' && i.effort !== 'ONGOING')
    .slice(0, 4)
    .map((i) => fromInsight(i, language))
