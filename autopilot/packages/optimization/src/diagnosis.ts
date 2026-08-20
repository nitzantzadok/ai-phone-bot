/**
 * Diagnosis and opportunity ranking.
 *
 * Two things this module refuses to do.
 *
 * It never invents a cause. Every opportunity carries the evidence that produced it —
 * which prompts, which attribute, which competitor, which crawl finding — so the answer to
 * "why are we doing this?" is a row, not a rationalisation.
 *
 * It never promises an outcome it cannot influence. An opportunity whose controllability
 * is NOT_CONTROLLED is surfaced honestly and cannot be turned into an automated action,
 * however attractive the arithmetic looks.
 */
import type { ActionCategory, Controllability, RiskTier } from '@autopilot/shared/domain.ts'
import { clamp01, round } from '@autopilot/shared/stats.ts'
import type { EvidenceGap } from '@autopilot/knowledge/evidence.ts'
import type { TechnicalFinding } from '@autopilot/crawler/audit.ts'
import type { GeneratedPrompt } from '@autopilot/prompts/generator.ts'
import { getVertical } from '@autopilot/prompts/verticals.ts'

export interface PromptOutcome {
  readonly promptId: string
  readonly recommended: boolean
  readonly competitorRecommended: boolean
  readonly requiredAttributes: readonly string[]
  readonly promptScore: number
  readonly difficulty: number
}

export interface Opportunity {
  readonly dedupeKey: string
  readonly title: string
  /** Plain language, for a non-technical owner. Never SEO jargon. */
  readonly explanation: string
  readonly category: ActionCategory
  readonly controllability: Controllability
  readonly riskTier: RiskTier
  readonly businessValue: number
  readonly promptReach: number
  readonly recommendationGap: number
  readonly expectedLift: number
  readonly confidence: number
  readonly controllabilityFactor: number
  readonly estimatedCost: number
  readonly score: number
  readonly evidence: Record<string, unknown>
  readonly attributeKey?: string
  readonly autoFixable: boolean
  /** The action the agent would take. Null when only a human can act. */
  readonly suggestedActionType: string | null
}

/**
 * Opportunity score.
 *
 *   BusinessValue x PromptReach x Gap x ExpectedLift x Confidence x Controllability / Cost
 *
 * Reach is dampened with a square root: an issue touching 40 prompts matters more than one
 * touching 10, but not four times more, and without damping a single broad finding would
 * permanently crowd out everything specific and winnable.
 */
export const scoreOpportunity = (o: {
  businessValue: number
  promptReach: number
  recommendationGap: number
  expectedLift: number
  confidence: number
  controllabilityFactor: number
  estimatedCost: number
}): number => {
  const reach = Math.sqrt(Math.max(0, o.promptReach))
  const raw =
    (o.businessValue *
      reach *
      clamp01(o.recommendationGap) *
      clamp01(o.expectedLift) *
      clamp01(o.confidence) *
      clamp01(o.controllabilityFactor)) /
    Math.max(0.1, o.estimatedCost)
  return round(raw, 4)
}

const CONTROL_FACTOR: Record<Controllability, number> = {
  CONTROLLED: 1,
  INFLUENCEABLE: 0.5,
  NOT_CONTROLLED: 0.15,
}

/** Cost is effort plus risk, not money: a cheap change that needs review is not cheap. */
const ACTION_COST: Record<string, number> = {
  FIX_METADATA: 0.3,
  ADD_SCHEMA: 0.4,
  FIX_CANONICAL: 0.2,
  ADD_SITEMAP: 0.3,
  FIX_LANG_ATTRIBUTE: 0.2,
  ADD_CONTENT_SECTION: 1.2,
  CREATE_PAGE: 2.5,
  UPDATE_BUSINESS_INFO: 0.5,
  FIX_DUPLICATE_TITLES: 0.6,
  RESOLVE_INFO_CONFLICT: 0.5,
}

export const ACTION_RISK: Record<string, RiskTier> = {
  FIX_METADATA: 'LOW',
  ADD_SCHEMA: 'LOW',
  FIX_CANONICAL: 'LOW',
  ADD_SITEMAP: 'LOW',
  FIX_LANG_ATTRIBUTE: 'LOW',
  FIX_DUPLICATE_TITLES: 'LOW',
  ADD_CONTENT_SECTION: 'MEDIUM',
  CREATE_PAGE: 'MEDIUM',
  UPDATE_BUSINESS_INFO: 'MEDIUM',
  RESOLVE_INFO_CONFLICT: 'MEDIUM',
  DELETE_PAGE: 'HIGH',
  CHANGE_PRICING: 'HIGH',
  CHANGE_BUSINESS_CATEGORY: 'HIGH',
  CHANGE_LEGAL_CLAIMS: 'HIGH',
}

/** Which finding types the agent is allowed to fix without a human. */
const FINDING_TO_ACTION: Record<string, string> = {
  MISSING_TITLE: 'FIX_METADATA',
  TITLE_LENGTH: 'FIX_METADATA',
  MISSING_META_DESCRIPTION: 'FIX_METADATA',
  META_DESCRIPTION_LENGTH: 'FIX_METADATA',
  MISSING_CANONICAL: 'FIX_CANONICAL',
  NO_SITEMAP: 'ADD_SITEMAP',
  NO_STRUCTURED_DATA: 'ADD_SCHEMA',
  MISSING_LANG_ATTRIBUTE: 'FIX_LANG_ATTRIBUTE',
  LANGUAGE_MISMATCH: 'FIX_LANG_ATTRIBUTE',
  DUPLICATE_TITLE: 'FIX_DUPLICATE_TITLES',
}

const SEVERITY_VALUE: Record<TechnicalFinding['severity'], number> = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.25,
}

export interface DiagnosisInput {
  readonly prompts: readonly GeneratedPrompt[]
  readonly outcomes: readonly PromptOutcome[]
  readonly evidenceGaps: readonly EvidenceGap[]
  readonly technicalFindings: readonly TechnicalFinding[]
  readonly missingPageTypes: readonly string[]
  readonly factConflicts: readonly { factKind: string; values: readonly { value: string }[] }[]
  readonly vertical: string
  readonly language?: 'en' | 'he'
}

export interface Diagnosis {
  readonly summary: string
  readonly opportunities: readonly Opportunity[]
  readonly recommendationRate: number
  readonly lostPromptCount: number
  readonly externalAuthorityGapCount: number
}

export const diagnose = (input: DiagnosisInput): Diagnosis => {
  // Israel-first: a Hebrew customer must not receive Hebrew advice interleaved with
  // English findings. Every customer-visible string below is localized.
  const language = input.language ?? 'en'
  const opportunities: Opportunity[] = []
  const total = input.outcomes.length
  const recommended = input.outcomes.filter((o) => o.recommended).length
  const lost = input.outcomes.filter((o) => !o.recommended)
  const vertical = getVertical(input.vertical)

  /* ------------------------------------------------------- evidence gaps ----- */
  for (const gap of input.evidenceGaps) {
    const lostForAttribute = lost.filter((o) =>
      o.requiredAttributes.includes(gap.attributeKey),
    )
    // A gap that costs us nothing measurable is not worth a customer's attention.
    if (lostForAttribute.length === 0 && gap.affectedPromptCount === 0) continue

    const businessValue =
      lostForAttribute.length > 0
        ? lostForAttribute.reduce((s, o) => s + o.promptScore, 0) / lostForAttribute.length
        : 0.5

    const actionType =
      gap.controllability === 'CONTROLLED'
        ? gap.ourStrength === 0
          ? 'ADD_CONTENT_SECTION'
          : 'ADD_CONTENT_SECTION'
        : null

    opportunities.push({
      dedupeKey: `attribute-gap:${gap.attributeKey}`,
      title:
        gap.controllability === 'NOT_CONTROLLED'
          ? language === 'he'
            ? `פער מקורות חיצוניים: ${gap.attributeLabel}`
            : `External authority gap: ${gap.attributeLabel}`
          : language === 'he'
            ? `ה-AI לא מקשר ביניכם לבין ${gap.attributeLabel}`
            : `AI does not associate you with ${gap.attributeLabel}`,
      explanation: buildAttributeExplanation(gap, lostForAttribute.length, total, language),
      category: 'CONTENT',
      controllability: gap.controllability,
      riskTier: actionType ? (ACTION_RISK[actionType] ?? 'MEDIUM') : 'LOW',
      businessValue,
      promptReach: gap.affectedPromptCount,
      recommendationGap: clamp01(gap.gap),
      // Closing a controllable evidence gap is the intervention we have most reason to
      // believe in; an uncontrollable one has almost no expected lift by definition.
      expectedLift: gap.controllability === 'CONTROLLED' ? 0.35 : 0.1,
      confidence: gap.controllability === 'CONTROLLED' ? 0.7 : 0.3,
      controllabilityFactor: CONTROL_FACTOR[gap.controllability],
      estimatedCost: actionType ? (ACTION_COST[actionType] ?? 1) : 3,
      score: 0,
      evidence: {
        attributeKey: gap.attributeKey,
        ourStrength: round(gap.ourStrength, 3),
        competitorStrength: round(gap.bestCompetitorStrength, 3),
        competitor: gap.bestCompetitorName,
        lostPrompts: lostForAttribute.length,
        reason: gap.reason,
      },
      attributeKey: gap.attributeKey,
      autoFixable: gap.controllability === 'CONTROLLED',
      suggestedActionType: actionType,
    })
  }

  /* -------------------------------------------------- technical findings ----- */
  const byType = new Map<string, TechnicalFinding[]>()
  for (const finding of input.technicalFindings) {
    byType.set(finding.findingType, [...(byType.get(finding.findingType) ?? []), finding])
  }

  for (const [findingType, findings] of byType) {
    const actionType = FINDING_TO_ACTION[findingType] ?? null
    const first = findings[0]!
    opportunities.push({
      dedupeKey: `technical:${findingType}`,
      title: titleForFinding(findingType, findings.length, language),
      explanation:
        findings.length === 1
          ? first.plainLanguage
          : language === 'he'
            ? `${first.plainLanguage} זה נוגע ל-${findings.length} עמודים.`
            : `${first.plainLanguage} This affects ${findings.length} pages.`,
      category: 'TECHNICAL',
      controllability: 'CONTROLLED',
      riskTier: actionType ? (ACTION_RISK[actionType] ?? 'MEDIUM') : 'LOW',
      businessValue: SEVERITY_VALUE[first.severity],
      // Technical issues affect discoverability of the whole monitored set.
      promptReach: Math.min(total, findings.length * 3),
      recommendationGap: SEVERITY_VALUE[first.severity],
      expectedLift: first.severity === 'HIGH' ? 0.25 : 0.12,
      confidence: first.confidence,
      controllabilityFactor: 1,
      estimatedCost: actionType ? (ACTION_COST[actionType] ?? 1) : 2,
      score: 0,
      evidence: { findingType, affectedUrls: findings.slice(0, 10).map((f) => f.url) },
      autoFixable: actionType !== null && findings.every((f) => f.autoFixable),
      suggestedActionType: actionType,
    })
  }

  /* -------------------------------------------------- missing page types ----- */
  for (const pageType of input.missingPageTypes) {
    if (!vertical.expectedPageTypes.includes(pageType)) continue
    opportunities.push({
      dedupeKey: `missing-page:${pageType}`,
      title:
        language === 'he'
          ? `אין לכם עמוד ${pageType}`
          : `You have no ${pageType} page`,
      explanation:
        language === 'he'
          ? `לעסקים כמוכם יש בדרך כלל עמוד ${pageType}, ולקוחות שואלים שאלות שהוא היה עונה ` +
            `עליהן. בלעדיו פשוט אין ל-AI מה לקרוא בנושא הזה.`
          : `Businesses like yours normally have a ${pageType} page, and customers ask AI ` +
            `questions it would answer. Without one there is nothing for an AI to read on that topic.`,
      category: 'CONTENT',
      controllability: 'CONTROLLED',
      riskTier: 'MEDIUM',
      businessValue: 0.6,
      promptReach: Math.max(1, Math.round(total * 0.15)),
      recommendationGap: 0.5,
      expectedLift: 0.2,
      confidence: 0.5,
      controllabilityFactor: 1,
      estimatedCost: ACTION_COST.CREATE_PAGE!,
      score: 0,
      evidence: { pageType, expectedFor: vertical.id },
      autoFixable: false,
      suggestedActionType: 'CREATE_PAGE',
    })
  }

  /* ------------------------------------------------------ fact conflicts ----- */
  for (const conflict of input.factConflicts) {
    opportunities.push({
      dedupeKey: `conflict:${conflict.factKind}`,
      title:
        language === 'he'
          ? `ה${factKindLabel(conflict.factKind, 'he')} שלכם שונה במקומות שונים`
          : `Your ${factKindLabel(conflict.factKind, 'en')} is different in different places`,
      explanation:
        language === 'he'
          ? `מצאנו יותר מ${factKindLabel(conflict.factKind, 'he')} אחד לעסק שלכם ` +
            `(${conflict.values.map((v) => v.value).slice(0, 3).join(', ')}). ` +
            'פרטים סותרים גורמים למערכות AI להיות פחות בטוחות שמדובר באותו עסק.'
          : `We found more than one ${factKindLabel(conflict.factKind, 'en')} for your business ` +
            `(${conflict.values.map((v) => v.value).slice(0, 3).join(', ')}). ` +
            'Inconsistent details make AI systems less certain it is describing the same business.',
      category: 'ENTITY',
      controllability: 'CONTROLLED',
      riskTier: 'MEDIUM',
      businessValue: 0.7,
      promptReach: total,
      recommendationGap: 0.4,
      expectedLift: 0.2,
      // High: we are certain the inconsistency exists, we just cannot pick the right value.
      confidence: 0.9,
      controllabilityFactor: 1,
      estimatedCost: ACTION_COST.RESOLVE_INFO_CONFLICT!,
      score: 0,
      evidence: { factKind: conflict.factKind, values: conflict.values.map((v) => v.value) },
      autoFixable: false, // only the owner knows which value is correct
      suggestedActionType: 'RESOLVE_INFO_CONFLICT',
    })
  }

  const scored = opportunities
    .map((o) => ({ ...o, score: scoreOpportunity(o) }))
    .sort((a, b) => b.score - a.score)

  return {
    summary: buildSummary(recommended, total, scored, language),
    opportunities: scored,
    recommendationRate: total === 0 ? 0 : recommended / total,
    lostPromptCount: lost.length,
    externalAuthorityGapCount: scored.filter((o) => o.controllability === 'NOT_CONTROLLED').length,
  }
}

const buildAttributeExplanation = (
  gap: EvidenceGap,
  lostPrompts: number,
  totalPrompts: number,
  language: 'en' | 'he',
): string => {
  if (language === 'he') {
    const base =
      `${gap.affectedPromptCount} מתוך ${totalPrompts} השאלות שאנחנו עוקבים אחריהן תלויות ` +
      `ב"${gap.attributeLabel}".`
    const performance = lostPrompts > 0 ? ` אתם לא מומלצים ב-${lostPrompts} מהן.` : ''
    const competitor = gap.bestCompetitorName
      ? ` ל${gap.bestCompetitorName} יש ראיות חזקות יותר לכך.`
      : ''
    return `${base}${performance}${competitor} ${gap.reason}`
  }

  const base =
    `${gap.affectedPromptCount} of the ${totalPrompts} questions we monitor depend on ` +
    `"${gap.attributeLabel}".`
  const performance =
    lostPrompts > 0
      ? ` You are not recommended in ${lostPrompts} of them.`
      : ''
  const competitor = gap.bestCompetitorName
    ? ` ${gap.bestCompetitorName} has noticeably stronger evidence for it.`
    : ''
  return `${base}${performance}${competitor} ${gap.reason}`
}

/** Fact kinds as a customer would name them, per language. */
const factKindLabel = (factKind: string, language: 'en' | 'he'): string => {
  const labels: Record<string, { he: string; en: string }> = {
    phone: { he: 'טלפון', en: 'phone number' },
    address: { he: 'כתובת', en: 'address' },
    business_name: { he: 'שם העסק', en: 'business name' },
    opening_hours: { he: 'שעות הפתיחה', en: 'opening hours' },
    price_range: { he: 'טווח המחירים', en: 'price range' },
  }
  const label = labels[factKind]
  if (!label) return factKind.replace(/_/g, ' ')
  return language === 'he' ? label.he : label.en
}

const titleForFinding = (
  findingType: string,
  count: number,
  language: 'en' | 'he',
): string => {
  const titles: Record<string, { he: string; en: string }> = {
    MISSING_TITLE: { he: 'עמודים בלי כותרת', en: 'Pages with no title' },
    MISSING_META_DESCRIPTION: { he: 'עמודים בלי תיאור קצר', en: 'Pages with no summary' },
    MISSING_CANONICAL: {
      he: 'עמודים שלא מציינים את הכתובת הרשמית שלהם',
      en: 'Pages that do not state their official address',
    },
    NO_SITEMAP: { he: 'לאתר שלכם אין מפת אתר', en: 'Your site has no sitemap' },
    NO_STRUCTURED_DATA: {
      he: 'בעמודים שלכם אין מידע עסקי קריא למכונה',
      en: 'Your pages carry no machine-readable business information',
    },
    MISSING_LANG_ATTRIBUTE: {
      he: 'עמודים שלא מצהירים באיזו שפה הם',
      en: 'Pages that do not declare their language',
    },
    LANGUAGE_MISMATCH: {
      he: 'עמודים שמצהירים על השפה הלא נכונה',
      en: 'Pages that declare the wrong language',
    },
    DUPLICATE_TITLE: { he: 'עמודים עם אותה כותרת', en: 'Pages sharing the same title' },
    BROKEN_LINK: {
      he: 'קישורים לעמודים שכבר לא עובדים',
      en: 'Links pointing to pages that no longer work',
    },
    THIN_CONTENT: { he: 'עמודים עם מעט מאוד טקסט', en: 'Pages with very little text' },
    NOINDEX: { he: 'עמודים מוסתרים ממנועי חיפוש', en: 'Pages hidden from search engines' },
  }
  const entry = titles[findingType]
  const title = entry
    ? language === 'he'
      ? entry.he
      : entry.en
    : findingType.replace(/_/g, ' ').toLowerCase()
  return count > 1 ? `${title} (${count})` : title
}

const buildSummary = (
  recommended: number,
  total: number,
  opportunities: readonly Opportunity[],
  language: 'en' | 'he',
): string => {
  if (total === 0) {
    return language === 'he'
      ? 'עוד לא נאספו מדידות עבור העסק הזה.'
      : 'No measurements have been collected for this business yet.'
  }
  const controllable = opportunities.filter((o) => o.controllability === 'CONTROLLED').length
  const external = opportunities.filter((o) => o.controllability === 'NOT_CONTROLLED').length

  if (language === 'he') {
    return (
      `העסק שלך הומלץ ב-${recommended} מתוך ${total} שאלות שנבדקו. ` +
      `מצאנו ${controllable} דברים שאנחנו יכולים לתקן בעצמנו` +
      (external > 0 ? `, ו-${external} פערים שתלויים בגורמים חיצוניים.` : '.')
    )
  }
  return (
    `You were recommended in ${recommended} of ${total} monitored questions. ` +
    `We found ${controllable} things we can fix directly` +
    (external > 0
      ? `, and ${external} gap(s) that depend on independent coverage we cannot create.`
      : '.')
  )
}

/** The top opportunities to show a customer. Controllable work first, always. */
export const topOpportunities = (
  opportunities: readonly Opportunity[],
  limit = 5,
): readonly Opportunity[] =>
  [...opportunities]
    .sort((a, b) => {
      if (a.autoFixable !== b.autoFixable) return a.autoFixable ? -1 : 1
      return b.score - a.score
    })
    .slice(0, limit)
