/**
 * The Evidence Graph.
 *
 * This is the mechanism the whole product turns on. Given a prompt that demands certain
 * attributes, it answers three questions with data rather than opinion:
 *
 *   1. How strong is our evidence for each demanded attribute?
 *   2. How strong is the competitor's?
 *   3. Is the difference something we can actually fix?
 *
 * The third question is the honest one. An attribute we lack because our own site never
 * mentions it is CONTROLLED and the agent may act. An attribute a competitor owns because
 * a magazine wrote about them is NOT_CONTROLLED, and saying otherwise would be a lie the
 * customer eventually catches.
 */
import type { ConfidenceLevel, Controllability } from '@autopilot/shared/domain.ts'
import { CONFIDENCE_RANK } from '@autopilot/shared/domain.ts'
import { clamp01 } from '@autopilot/shared/stats.ts'
import { attributeLabel } from './attributes.ts'

export interface AttributeEvidence {
  readonly attributeKey: string
  /** 0..1 strength of our claim to this attribute. */
  readonly strength: number
  readonly supportingFactCount: number
  readonly distinctSourceCount: number
  readonly ownerConfirmed: boolean
  readonly presentOnOwnWebsite: boolean
  readonly bestConfidence: ConfidenceLevel
  /** Source URLs, so the explanation can point at something real. */
  readonly sourceUrls: readonly string[]
}

export interface EvidenceInput {
  readonly attributeKey: string
  readonly confidence: ConfidenceLevel
  readonly sourceUrl: string
  readonly ownWebsite: boolean
  readonly ownerConfirmed?: boolean
}

const CONFIDENCE_BASE: Record<ConfidenceLevel, number> = {
  HIGH: 0.55,
  MEDIUM: 0.35,
  LOW: 0.15,
  UNKNOWN: 0.05,
}

/**
 * Evidence strength.
 *
 * Weighted so that corroboration matters but cannot manufacture a claim on its own: three
 * weak mentions never beat one confirmed fact, and nothing reaches full strength without
 * the owner standing behind it.
 */
export const computeEvidenceStrength = (
  inputs: readonly EvidenceInput[],
): AttributeEvidence | null => {
  if (inputs.length === 0) return null

  const attributeKey = inputs[0]!.attributeKey
  const sourceUrls = [...new Set(inputs.map((i) => i.sourceUrl))]
  const ownerConfirmed = inputs.some((i) => i.ownerConfirmed === true)
  const presentOnOwnWebsite = inputs.some((i) => i.ownWebsite)
  const bestConfidence = inputs.reduce<ConfidenceLevel>(
    (best, i) => (CONFIDENCE_RANK[i.confidence] > CONFIDENCE_RANK[best] ? i.confidence : best),
    'UNKNOWN',
  )

  const base = CONFIDENCE_BASE[bestConfidence]
  // Diminishing returns: the second independent source is worth far more than the fifth.
  const corroboration = Math.min(0.2, (sourceUrls.length - 1) * 0.08)
  const ownSite = presentOnOwnWebsite ? 0.1 : 0
  const confirmed = ownerConfirmed ? 0.2 : 0

  return {
    attributeKey,
    strength: clamp01(base + corroboration + ownSite + confirmed),
    supportingFactCount: inputs.length,
    distinctSourceCount: sourceUrls.length,
    ownerConfirmed,
    presentOnOwnWebsite,
    bestConfidence,
    sourceUrls,
  }
}

export interface CompetitorEvidence {
  readonly competitorId: string
  readonly competitorName: string
  readonly attributeKey: string
  readonly strength: number
  readonly distinctSourceCount: number
  /** True when the corroboration comes from sources we cannot influence. */
  readonly externalSources: boolean
}

export interface EvidenceGap {
  readonly attributeKey: string
  readonly attributeLabel: string
  /** Our strength, 0..1. */
  readonly ourStrength: number
  /** The strongest competitor's strength, 0..1. */
  readonly bestCompetitorStrength: number
  readonly bestCompetitorName: string | null
  /** Positive = we are behind. */
  readonly gap: number
  readonly controllability: Controllability
  /** Prompts whose intent demands this attribute, and how much we lose by lacking it. */
  readonly affectedPromptCount: number
  readonly reason: string
}

export interface GapAnalysisInput {
  readonly ourEvidence: ReadonlyMap<string, AttributeEvidence>
  readonly competitorEvidence: readonly CompetitorEvidence[]
  /** attributeKey -> number of monitored prompts demanding it. */
  readonly promptDemand: ReadonlyMap<string, number>
  readonly language?: string
  /** Attributes the business has confirmed it genuinely has. Never invent a claim. */
  readonly ownerConfirmedAttributes?: ReadonlySet<string>
}

/**
 * Where we are losing, and whether we can do anything about it.
 *
 * Controllability rules, in order:
 *  - if our own site does not state an attribute the owner has confirmed, that is
 *    CONTROLLED: write it down, truthfully;
 *  - if we state it and the competitor's advantage is independent corroboration we cannot
 *    create, that is NOT_CONTROLLED and is labelled an external authority gap;
 *  - otherwise the entity signals around it can be strengthened: INFLUENCEABLE.
 */
export const analyzeGaps = (input: GapAnalysisInput): EvidenceGap[] => {
  const language = input.language ?? 'en'
  const confirmed = input.ownerConfirmedAttributes ?? new Set<string>()
  const gaps: EvidenceGap[] = []

  const byAttribute = new Map<string, CompetitorEvidence[]>()
  for (const c of input.competitorEvidence) {
    byAttribute.set(c.attributeKey, [...(byAttribute.get(c.attributeKey) ?? []), c])
  }

  const attributeKeys = new Set([
    ...input.promptDemand.keys(),
    ...input.ourEvidence.keys(),
    ...byAttribute.keys(),
  ])

  for (const attributeKey of attributeKeys) {
    const demand = input.promptDemand.get(attributeKey) ?? 0
    // An attribute nobody asks about is not a gap worth a customer's attention.
    if (demand === 0) continue

    const ours = input.ourEvidence.get(attributeKey)
    const ourStrength = ours?.strength ?? 0
    const competitors = (byAttribute.get(attributeKey) ?? []).sort((a, b) => b.strength - a.strength)
    const best = competitors[0]
    const bestStrength = best?.strength ?? 0
    const gap = bestStrength - ourStrength

    // Only report a gap that is both real and material.
    if (gap <= 0.1 && ourStrength >= 0.5) continue

    const ownerBacksIt = confirmed.has(attributeKey)
    const onOurSite = ours?.presentOnOwnWebsite ?? false

    let controllability: Controllability
    let reason: string

    // Israel-first: the reason is written in the customer's language, not translated at
    // the point of display. A Hebrew report with an English sentence inside it reads as a
    // machine talking to itself.
    const hebrew = language === 'he'

    if (ownerBacksIt && !onOurSite) {
      controllability = 'CONTROLLED'
      reason = hebrew
        ? 'אישרתם שזה נכון לגבי העסק שלכם, אבל האתר שלכם לא אומר את זה בשום מקום. ' +
          'אנחנו יכולים לנסח את זה בבירור, במילים שלכם.'
        : 'You confirmed this is true of your business, but your website never says so. ' +
          'We can state it clearly in your own words.'
    } else if (!ownerBacksIt && ourStrength < 0.2) {
      // We must not assert something the business has not confirmed.
      controllability = 'INFLUENCEABLE'
      reason = hebrew
        ? 'מצאנו מעט מאוד ראיות שזה רלוונטי אליכם. אם זה נכון, אישור שלכם יאפשר לנו ' +
          'לתאר את זה במדויק; אם לא, זה לא פער ששווה לרדוף אחריו.'
        : 'We found little evidence that this applies to you. If it is true, confirming it ' +
          'lets us describe it accurately; if not, this is not a gap worth chasing.'
    } else if (onOurSite && best && best.externalSources && gap > 0.2) {
      controllability = 'NOT_CONTROLLED'
      reason = hebrew
        ? `האתר שלכם כבר אומר את זה. ל${best.competitorName} יש גיבוי ממקורות עצמאיים ` +
          'שאנחנו לא יכולים לייצר עבורכם. זה פער של סמכות חיצונית.'
        : `Your site already states this. ${best.competitorName} is corroborated by ` +
          'independent sources we cannot create for you. This is an external authority gap.'
    } else {
      controllability = 'INFLUENCEABLE'
      reason = hebrew
        ? 'המידע קיים אצלכם, אבל הוא לא כתוב מספיק ברור או מספיק עקבי כדי שמערכות AI ' +
          'יקשרו אותו אליכם.'
        : 'Your information exists but is not stated clearly or consistently enough for AI ' +
          'systems to associate it with you.'
    }

    gaps.push({
      attributeKey,
      attributeLabel: attributeLabel(attributeKey, language),
      ourStrength,
      bestCompetitorStrength: bestStrength,
      bestCompetitorName: best?.competitorName ?? null,
      gap,
      controllability,
      affectedPromptCount: demand,
      reason,
    })
  }

  // Rank by what it is worth fixing: size of gap, how many prompts it touches, and
  // whether we can actually act on it.
  const controlWeight: Record<Controllability, number> = {
    CONTROLLED: 1,
    INFLUENCEABLE: 0.6,
    NOT_CONTROLLED: 0.2,
  }
  return gaps.sort(
    (a, b) =>
      b.gap * b.affectedPromptCount * controlWeight[b.controllability] -
      a.gap * a.affectedPromptCount * controlWeight[a.controllability],
  )
}

/** 0..1 attribute match: how well our evidence covers what the monitored prompts demand. */
export const attributeMatchScore = (
  ourEvidence: ReadonlyMap<string, AttributeEvidence>,
  promptDemand: ReadonlyMap<string, number>,
): number => {
  let weighted = 0
  let total = 0
  for (const [attributeKey, demand] of promptDemand) {
    total += demand
    weighted += demand * (ourEvidence.get(attributeKey)?.strength ?? 0)
  }
  return total === 0 ? 0 : weighted / total
}
