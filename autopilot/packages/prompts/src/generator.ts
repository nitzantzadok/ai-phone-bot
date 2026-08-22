/**
 * Prompt Universe generation.
 *
 * The unit of demand in this product is a question a real customer would type into an AI
 * assistant, not a keyword. "Best Italian restaurant in Tel Aviv for a date" is a demand
 * for `romantic` + `Italian` + Tel Aviv; that decomposition is what lets a lost prompt be
 * traced to a missing piece of evidence.
 *
 * Quality over volume, deliberately (brief section 12). Ten thousand near-duplicate
 * variations would inflate every metric, cost a fortune to measure and teach us nothing.
 * The generator produces a bounded set of realistic questions, scores them, and keeps the
 * best.
 */
import { newId, type BusinessId, type PromptId } from '@autopilot/shared/ids.ts'
import type { LanguageCode } from '@autopilot/shared/locale.ts'
import { clamp01, round } from '@autopilot/shared/stats.ts'
import { agree, GOOD, PREFERABLE, RECOMMENDED, SUITABLE, WHICH } from './hebrew.ts'
import { getVertical, type VerticalConfig } from './verticals.ts'
import { attributeLabel } from '@autopilot/knowledge/attributes.ts'

export const GENERATOR_VERSION = 'prompt-generator-v1'

/**
 * Intent categories. Each behaves differently: DISCOVERY is high-volume and hard to win,
 * CONSTRAINT is lower-volume and far more winnable, which is what Recommendation
 * Territories are built on.
 */
export const INTENT_CATEGORIES = [
  'DISCOVERY', // "best X in Y"
  'OCCASION', // "where should I go for Z"
  'CONSTRAINT', // "X in Y with Z"
  'AUDIENCE', // "X in Y for <people>"
  'PROXIMITY', // "X near <neighborhood>"
  'COMPARISON', // "which X is better for Z"
  'TRANSACTIONAL', // "book / call / order"
  'INFORMATIONAL', // "how much does X cost"
] as const
export type IntentCategory = (typeof INTENT_CATEGORIES)[number]

export interface GeneratedPrompt {
  readonly id: PromptId
  readonly queryText: string
  /** Language-independent identity, so Hebrew and English variants pair up. */
  readonly canonicalIntent: string
  readonly intentCategory: IntentCategory
  readonly vertical: string
  readonly language: LanguageCode
  readonly locale: string
  readonly country: string
  readonly city: string | null
  readonly neighborhood: string | null
  readonly dimensions: Readonly<Record<string, string>>
  /** Attribute keys an answer must satisfy. The join into the evidence graph. */
  readonly requiredAttributes: readonly string[]
  readonly commercialIntent: number
  readonly localIntent: number
  readonly specificity: number
  readonly askLikelihood: number
  readonly promptScore: number
  readonly difficulty: number
}

export interface GenerationInput {
  readonly businessId: BusinessId
  readonly vertical: string
  readonly city: string
  readonly neighborhoods?: readonly string[]
  readonly country: string
  readonly languages: readonly LanguageCode[]
  /**
   * The city name per language. A Hebrew speaker asks about "תל אביב", not "Tel Aviv", and
   * measuring the English string in a Hebrew query measures a question nobody asks.
   */
  readonly cityNames?: Partial<Record<LanguageCode, string>>
  /** What the business actually is, e.g. "Italian" for a restaurant. */
  readonly qualifiers?: readonly string[]
  /** The same qualifiers per language, e.g. { he: ['איטלקית'], en: ['Italian'] }. */
  readonly qualifierNames?: Partial<Record<LanguageCode, readonly string[]>>
  /** Attributes the owner has confirmed. Only these seed constraint prompts. */
  readonly confirmedAttributes?: readonly string[]
  /** Hard cap. The measurement budget is finite and this is where it is spent. */
  readonly maxPrompts?: number
}

const LOCALES: Record<LanguageCode, (country: string) => string> = {
  he: (c) => `he-${c}`,
  en: (c) => `en-${c}`,
  ar: (c) => `ar-${c}`,
  ru: (c) => `ru-${c}`,
}

/* -------------------------------------------------------------- phrasing ----- */

const serviceTerm = (vertical: VerticalConfig, language: LanguageCode, index = 0): string => {
  const terms = vertical.serviceTerms[language] ?? vertical.serviceTerms.en ?? ['business']
  return terms[index % terms.length]!
}

/**
 * Renders one question.
 *
 * Templates are written per language rather than translated, because a translated query is
 * not the query a Hebrew speaker would actually type, and measuring the wrong question
 * produces a confidently wrong answer.
 */
const render = (
  category: IntentCategory,
  language: LanguageCode,
  parts: {
    service: string
    qualifier?: string
    city: string
    neighborhood?: string
    occasion?: string
    audience?: string
    attribute?: string
  },
): string | null => {
  const q = parts.qualifier ? `${parts.qualifier} ` : ''

  if (language === 'he') {
    const service = parts.qualifier ? `${parts.service} ${parts.qualifier}` : parts.service
    // Agreement is taken from the service term, not assumed: see ./hebrew.ts.
    const which = agree(parts.service, WHICH)
    const suitable = agree(parts.service, SUITABLE)
    switch (category) {
      case 'DISCOVERY':
        return `${service} ${agree(parts.service, RECOMMENDED)} ב${parts.city}`
      case 'OCCASION':
        return parts.occasion
          ? `${which} ${service} ב${parts.city} ${suitable} ל${parts.occasion}?`
          : null
      case 'CONSTRAINT':
        return parts.attribute ? `${service} ב${parts.city} עם ${parts.attribute}` : null
      case 'AUDIENCE':
        return parts.audience ? `${service} ב${parts.city} ל${parts.audience}` : null
      case 'PROXIMITY':
        return parts.neighborhood
          ? `${service} ${agree(parts.service, GOOD)} ליד ${parts.neighborhood}`
          : null
      case 'COMPARISON':
        return parts.occasion
          ? `${which} ${service} ב${parts.city} ${agree(parts.service, PREFERABLE)} ל${parts.occasion} ולמה?`
          : null
      case 'TRANSACTIONAL':
        return `איפה כדאי להזמין ${service} ב${parts.city} להיום?`
      case 'INFORMATIONAL':
        return `כמה עולה ${service} ב${parts.city}?`
    }
  }

  switch (category) {
    case 'DISCOVERY':
      return `What is the best ${q}${parts.service} in ${parts.city}?`
    case 'OCCASION':
      return parts.occasion
        ? `Where should I go in ${parts.city} for ${parts.occasion}?`
        : null
    case 'CONSTRAINT':
      return parts.attribute
        ? `${q}${parts.service} in ${parts.city} with ${parts.attribute}`
        : null
    case 'AUDIENCE':
      return parts.audience
        ? `Good ${q}${parts.service} in ${parts.city} for ${parts.audience}`
        : null
    case 'PROXIMITY':
      return parts.neighborhood
        ? `Good ${q}${parts.service} near ${parts.neighborhood}`
        : null
    case 'COMPARISON':
      return parts.occasion
        ? `Which ${q}${parts.service} in ${parts.city} is better for ${parts.occasion}, and why?`
        : null
    case 'TRANSACTIONAL':
      return `Where can I book a ${q}${parts.service} in ${parts.city} today?`
    case 'INFORMATIONAL':
      return `How much does a ${q}${parts.service} in ${parts.city} cost?`
  }
}

/* --------------------------------------------------------------- scoring ----- */

/** How close the query is to a purchase decision. */
const COMMERCIAL_INTENT: Record<IntentCategory, number> = {
  DISCOVERY: 0.7,
  OCCASION: 0.85,
  CONSTRAINT: 0.8,
  AUDIENCE: 0.75,
  PROXIMITY: 0.8,
  COMPARISON: 0.9,
  TRANSACTIONAL: 0.95,
  INFORMATIONAL: 0.4,
}

/** How often a question of this shape is realistically asked. */
const ASK_LIKELIHOOD: Record<IntentCategory, number> = {
  DISCOVERY: 0.95,
  OCCASION: 0.75,
  CONSTRAINT: 0.6,
  AUDIENCE: 0.55,
  PROXIMITY: 0.7,
  COMPARISON: 0.45,
  TRANSACTIONAL: 0.5,
  INFORMATIONAL: 0.6,
}

/**
 * Prompt score: what the measurement budget should be spent on first.
 *
 * Weighted toward commercial value and realism. Deliberately NOT weighted toward
 * winnability — a prompt we lose badly is exactly the one worth watching.
 */
export const scorePrompt = (p: {
  commercialIntent: number
  localIntent: number
  specificity: number
  askLikelihood: number
}): number =>
  round(
    clamp01(
      0.35 * p.commercialIntent +
        0.25 * p.localIntent +
        0.2 * p.askLikelihood +
        0.2 * p.specificity,
    ),
    4,
  )

/**
 * Difficulty: how hard this prompt is to win.
 *
 * Broad questions are dominated by established players; specific ones are winnable with
 * good evidence. This is what makes Recommendation Territories actionable rather than
 * aspirational (brief section 51).
 */
export const estimateDifficulty = (
  category: IntentCategory,
  specificity: number,
  requiredAttributes: number,
): number => {
  const base: Record<IntentCategory, number> = {
    DISCOVERY: 0.9,
    OCCASION: 0.6,
    CONSTRAINT: 0.45,
    AUDIENCE: 0.5,
    PROXIMITY: 0.5,
    COMPARISON: 0.65,
    TRANSACTIONAL: 0.55,
    INFORMATIONAL: 0.4,
  }
  return round(clamp01(base[category] - specificity * 0.25 - requiredAttributes * 0.05), 4)
}

/* ------------------------------------------------------------ generation ----- */

export const generatePrompts = (input: GenerationInput): GeneratedPrompt[] => {
  const vertical = getVertical(input.vertical)
  const maxPrompts = input.maxPrompts ?? 60
  const confirmed = new Set(input.confirmedAttributes ?? [])
  const prompts: GeneratedPrompt[] = []
  const seen = new Set<string>()

  const push = (
    category: IntentCategory,
    language: LanguageCode,
    queryText: string | null,
    options: {
      canonicalIntent: string
      dimensions: Record<string, string>
      requiredAttributes: string[]
      specificity: number
      city: string | null
      neighborhood?: string | null
    },
  ): void => {
    if (!queryText) return
    const key = `${language}:${queryText}`
    if (seen.has(key)) return
    seen.add(key)

    const commercialIntent = COMMERCIAL_INTENT[category]
    const askLikelihood = ASK_LIKELIHOOD[category]
    // Local intent is the point of the product: a query naming a place is worth more.
    const localIntent = options.neighborhood ? 1 : options.city ? 0.85 : 0.3
    const specificity = clamp01(options.specificity)

    prompts.push({
      id: newId<'PromptId'>(),
      queryText,
      canonicalIntent: options.canonicalIntent,
      intentCategory: category,
      vertical: vertical.id,
      language,
      locale: LOCALES[language](input.country),
      country: input.country,
      city: options.city,
      neighborhood: options.neighborhood ?? null,
      dimensions: options.dimensions,
      requiredAttributes: options.requiredAttributes,
      commercialIntent,
      localIntent,
      specificity,
      askLikelihood,
      promptScore: scorePrompt({ commercialIntent, localIntent, specificity, askLikelihood }),
      difficulty: estimateDifficulty(category, specificity, options.requiredAttributes.length),
    })
  }

  const qualifiers = input.qualifiers?.length
    ? input.qualifiers
    : [undefined as string | undefined]

  for (const language of input.languages) {
    const service = serviceTerm(vertical, language)
    // The question is asked in one language throughout: city, qualifier and phrasing.
    const city = input.cityNames?.[language] ?? input.city
    const localizedQualifiers = input.qualifierNames?.[language] ?? qualifiers

    for (const [qualifierIndex, qualifier] of localizedQualifiers.entries()) {
      // The canonical intent stays language-independent, so Hebrew and English variants
      // of the same question still pair up.
      const qualifierKey = qualifiers[qualifierIndex] ?? qualifier ?? 'any'

      push('DISCOVERY', language, render('DISCOVERY', language, { service, qualifier, city }), {
        canonicalIntent: `discovery:${vertical.id}:${qualifierKey}:${input.city}`,
        dimensions: { service, city: input.city, ...(qualifier ? { qualifier } : {}) },
        requiredAttributes: [],
        specificity: qualifier ? 0.35 : 0.15,
        city: input.city,
      })

      push(
        'TRANSACTIONAL',
        language,
        render('TRANSACTIONAL', language, { service, qualifier, city }),
        {
          canonicalIntent: `transactional:${vertical.id}:${qualifierKey}:${input.city}`,
          dimensions: { service, city: input.city, action: 'book', ...(qualifier ? { qualifier } : {}) },
          requiredAttributes: [],
          specificity: 0.45,
          city: input.city,
        },
      )

      push(
        'INFORMATIONAL',
        language,
        render('INFORMATIONAL', language, { service, qualifier, city }),
        {
          canonicalIntent: `informational:${vertical.id}:${qualifierKey}:${input.city}:price`,
          dimensions: { service, city: input.city, topic: 'price', ...(qualifier ? { qualifier } : {}) },
          requiredAttributes: [],
          specificity: 0.4,
          city: input.city,
        },
      )

      for (const occasion of vertical.occasions) {
        const occasionText = language === 'he' ? occasion.he : occasion.en
        push(
          'OCCASION',
          language,
          render('OCCASION', language, { service, qualifier, city, occasion: occasionText }),
          {
            canonicalIntent: `occasion:${vertical.id}:${occasion.key}:${input.city}`,
            dimensions: { service, city: input.city, occasion: occasion.key },
            requiredAttributes: [...occasion.attributes],
            specificity: 0.6,
            city: input.city,
          },
        )

        push(
          'COMPARISON',
          language,
          render('COMPARISON', language, { service, qualifier, city, occasion: occasionText }),
          {
            canonicalIntent: `comparison:${vertical.id}:${occasion.key}:${input.city}`,
            dimensions: { service, city: input.city, occasion: occasion.key, mode: 'comparison' },
            requiredAttributes: [...occasion.attributes],
            specificity: 0.7,
            city: input.city,
          },
        )
      }

      for (const audience of vertical.audiences) {
        const audienceText = language === 'he' ? audience.he : audience.en
        push(
          'AUDIENCE',
          language,
          render('AUDIENCE', language, { service, qualifier, city, audience: audienceText }),
          {
            canonicalIntent: `audience:${vertical.id}:${audience.key}:${input.city}`,
            dimensions: { service, city: input.city, audience: audience.key },
            requiredAttributes: [],
            specificity: 0.55,
            city: input.city,
          },
        )
      }

      // Constraint prompts are seeded ONLY from attributes the owner confirmed. Generating
      // "restaurant with outdoor seating" for a business with no outdoor seating measures
      // a question it can never legitimately win.
      for (const attributeKey of vertical.constraints) {
        if (!confirmed.has(attributeKey)) continue
        const label = attributeLabel(attributeKey, language).toLowerCase()
        push(
          'CONSTRAINT',
          language,
          render('CONSTRAINT', language, { service, qualifier, city, attribute: label }),
          {
            canonicalIntent: `constraint:${vertical.id}:${attributeKey}:${input.city}`,
            dimensions: { service, city: input.city, constraint: attributeKey },
            requiredAttributes: [attributeKey],
            specificity: 0.75,
            city: input.city,
          },
        )
      }

      for (const neighborhood of input.neighborhoods ?? []) {
        push(
          'PROXIMITY',
          language,
          render('PROXIMITY', language, { service, qualifier, city, neighborhood }),
          {
            canonicalIntent: `proximity:${vertical.id}:${qualifierKey}:${neighborhood}`,
            dimensions: { service, city: input.city, neighborhood },
            requiredAttributes: [],
            specificity: 0.8,
            city: input.city,
            neighborhood,
          },
        )
      }
    }
  }

  // Keep the best, but keep both languages represented: a business can be invisible in
  // Hebrew and fine in English, and an all-English prompt set would never show it.
  return balanceByLanguage(prompts, input.languages, maxPrompts)
}

const balanceByLanguage = (
  prompts: readonly GeneratedPrompt[],
  languages: readonly LanguageCode[],
  maxPrompts: number,
): GeneratedPrompt[] => {
  if (prompts.length <= maxPrompts) {
    return [...prompts].sort((a, b) => b.promptScore - a.promptScore)
  }
  const perLanguage = Math.floor(maxPrompts / Math.max(1, languages.length))
  const out: GeneratedPrompt[] = []
  for (const language of languages) {
    out.push(
      ...prompts
        .filter((p) => p.language === language)
        .sort((a, b) => b.promptScore - a.promptScore)
        .slice(0, perLanguage),
    )
  }
  // Any remaining budget goes to the globally best prompts not already taken.
  const taken = new Set(out.map((p) => p.id))
  out.push(
    ...prompts
      .filter((p) => !taken.has(p.id))
      .sort((a, b) => b.promptScore - a.promptScore)
      .slice(0, maxPrompts - out.length),
  )
  return out.sort((a, b) => b.promptScore - a.promptScore)
}

/** How many monitored prompts demand each attribute. Feeds the gap analysis directly. */
export const attributeDemand = (
  prompts: readonly GeneratedPrompt[],
): Map<string, number> => {
  const demand = new Map<string, number>()
  for (const prompt of prompts) {
    for (const key of prompt.requiredAttributes) {
      demand.set(key, (demand.get(key) ?? 0) + 1)
    }
  }
  return demand
}
