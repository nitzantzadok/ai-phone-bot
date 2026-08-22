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
  type Effort,
  type Insight,
  type InsightCategory,
} from './catalogue.ts'
import { fixGuide, IMPACT_RANK, type FixOwner, type Impact, type Language } from './explain.ts'

export type { Language }

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
  /**
   * How many of the monitored questions this item touches, out of how many there are.
   *
   * The difference between a chore list and a business case. "Add opening hours" is work
   * somebody has to find time for; "this affects 14 of the 22 questions customers ask
   * about you" is a decision with a number attached — and it is a count of real generated
   * questions, not an estimate of anything.
   */
  readonly reach?: { readonly questions: number; readonly of: number }

  /**
   * How much fixing this changes whether an assistant recommends them — not how broken the
   * crawler considers it. See explain.ts; the two disagree often and the customer needs
   * ours, not the crawler's.
   */
  readonly impact?: Impact
  /** Orders findings inside an impact level. See explain.ts. */
  readonly leverage?: number
  /** The honest answer to "can I do this myself". */
  readonly who?: FixOwner
  /** Realistic minutes, so a list of nine items is a plan rather than a threat. */
  readonly minutes?: number
  /** What the thing actually is, for a reader who has never heard the term. */
  readonly what?: string
  /** What it looks like once it is right, so they can check their own work. */
  readonly example?: string
  /** The pages this was found on. */
  readonly affectedUrls?: readonly string[]
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

/**
 * Roughly how long a piece of general advice takes.
 *
 * The catalogue records effort as a band rather than a number because these are content
 * decisions, not tasks with a known length. But a reader comparing a measured item that
 * says "5 minutes" against one that says nothing concludes the second is open-ended and
 * skips it, so a band becomes the honest end of its range. ONGOING gets no number at all:
 * putting one on work that never finishes would be the lie the number exists to avoid.
 */
const MINUTES_BY_EFFORT: Record<Effort, number | undefined> = {
  MINUTES: 15,
  HOURS: 60,
  ONGOING: undefined,
}

const fromInsight = (insight: Insight, language: Language): PlaybookItem => {
  const minutes = MINUTES_BY_EFFORT[insight.effort]
  return {
    kind: 'GENERAL',
    title: localize(insight.title, language),
    why: localize(insight.why, language),
    steps: insight.steps.map((s) => localize(s, language)),
    controllability: insight.controllability,
    weDoThisForYou: insight.weDoThisForYou,
    howYouWillKnow: localize(insight.howYouWillKnow, language),
    // Every insight in the catalogue is content or consistency work on the business's own
    // material. None of it needs somebody who edits code.
    who: 'YOU',
    ...(minutes === undefined ? {} : { minutes }),
  }
}

const findingTypeOf = (opportunity: Opportunity): string | undefined => {
  const value = opportunity.evidence?.findingType
  return typeof value === 'string' ? value : undefined
}

/**
 * Findings about the site as a whole rather than about particular pages.
 *
 * Their `url` is a location that does not exist — that is the finding. Listing
 * "/sitemap.xml" under "which pages" invites the reader to go and look at a 404.
 */
const SITE_LEVEL = new Set(['NO_SITEMAP', 'NO_ROBOTS_TXT'])

const affectedUrlsOf = (opportunity: Opportunity): readonly string[] => {
  if (SITE_LEVEL.has(findingTypeOf(opportunity) ?? '')) return []
  const value = opportunity.evidence?.affectedUrls
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string') : []
}

/**
 * A measured finding, written out for the person who has to act on it.
 *
 * The steps used to say "we handle this automatically" for anything auto-fixable. That is
 * true of a subscriber and false of everybody else, and everybody else is who reads a free
 * scan — so the single most common report this product produces used to list seven
 * problems and zero instructions. Where a fix guide exists it supplies real steps; the
 * "we can do this for you" claim moves to a flag the UI can show next to them, which is
 * what it always was.
 */
const fromOpportunity = (
  opportunity: Opportunity,
  language: Language,
  monitoredQuestions: number,
): PlaybookItem => {
  const guide = fixGuide(findingTypeOf(opportunity) ?? '')
  const localized = (value: { he: string; en: string }) => localize(value, language)

  const fallbackSteps = [
    language === 'he'
      ? 'זה דורש החלטה שלכם. נציג לכם בדיוק מה מוצע לפני שמשנים משהו.'
      : 'This needs a decision from you. We show you exactly what we propose before anything changes.',
  ]

  return {
    kind: 'MEASURED',
    title: guide ? localized(guide.headline) : opportunity.title,
    why: guide ? localized(guide.costs) : opportunity.explanation,
    steps: guide ? guide.steps.map(localized) : fallbackSteps,
    controllability: opportunity.controllability,
    weDoThisForYou: opportunity.autoFixable,
    howYouWillKnow:
      language === 'he'
        ? 'נמדוד מחדש את אותן שאלות ונראה אם המצב השתנה.'
        : 'We re-measure the same questions and see whether it moved.',
    evidence: opportunity.evidence,
    // Only when both numbers are real. A reach of zero out of zero is noise, and a reach
    // larger than the set it is drawn from would be a bug on display.
    ...(opportunity.promptReach > 0 && monitoredQuestions > 0
      ? {
          reach: {
            questions: Math.min(opportunity.promptReach, monitoredQuestions),
            of: monitoredQuestions,
          },
        }
      : {}),
    ...(guide
      ? {
          impact: guide.impact,
          leverage: guide.leverage,
          who: guide.who,
          minutes: guide.minutes,
          what: localized(guide.what),
          ...(guide.example ? { example: localized(guide.example) } : {}),
        }
      : {}),
    ...(affectedUrlsOf(opportunity).length > 0
      ? { affectedUrls: affectedUrlsOf(opportunity) }
      : {}),
  }
}

export interface PlaybookInput {
  readonly vertical: string
  readonly language: Language
  readonly opportunities?: readonly Opportunity[]
  readonly businessName?: string
  /** Cap on general advice, so a measured diagnosis is never buried under priors. */
  readonly maxGeneral?: number
  /** Size of the monitored question set, so each item can state what it touches. */
  readonly monitoredQuestions?: number
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
    .map((o) => fromOpportunity(o, language, input.monitoredQuestions ?? 0))
    // Ordered by what actually decides whether an assistant can recommend them. The
    // opportunity score that produced this list is a blend of reach, lift and cost, and it
    // is good at ranking work; it is not the same question as "which of these is the
    // reason nothing mentions us", and that is the question the reader is asking. Ties
    // keep the upstream order, which is the scored one.
    .sort((a, b) => {
      const byImpact = IMPACT_RANK[a.impact ?? 'MINOR'] - IMPACT_RANK[b.impact ?? 'MINOR']
      return byImpact !== 0 ? byImpact : (b.leverage ?? 0) - (a.leverage ?? 0)
    })

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
      .map((o) => fromOpportunity(o, language, input.monitoredQuestions ?? 0)),
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
