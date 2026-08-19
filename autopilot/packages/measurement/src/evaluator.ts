/**
 * Response evaluation.
 *
 * Deliberately rule-based rather than "ask a model whether we were recommended".
 *
 * Three reasons. It is deterministic, so a metric change means the world changed rather
 * than a sampler rolled differently. It is explainable, so every classification ships with
 * the sentence that produced it. And it is free, which matters when the product runs
 * hundreds of evaluations per tenant per week and gross margin is the constraint.
 *
 * A model is used only where rules genuinely cannot reach: nuanced attribute recognition
 * and factual-accuracy judgement, both of which route through the provider seam and are
 * optional.
 */
import type {
  AccuracyClass,
  ConfidenceLevel,
  RecommendationClass,
} from '@autopilot/shared/domain.ts'
import {
  extractRecommendedEntities,
  findBusinessMention,
  normalizeName,
  type ExtractedEntity,
} from './entity-matching.ts'

export const EVALUATOR_VERSION = 'evaluator-v1'

export interface EvaluationSubject {
  readonly id: string
  readonly name: string
  readonly aliases?: readonly string[]
}

export interface EvaluationInput {
  readonly responseText: string
  readonly subject: EvaluationSubject
  /** Attribute keys the prompt demanded, checked against how the answer described us. */
  readonly requiredAttributes?: readonly string[]
  /** Terms that count as evidence for each attribute, per language. */
  readonly attributeTerms?: Readonly<Record<string, readonly string[]>>
}

export interface SubjectEvaluation {
  readonly classification: RecommendationClass
  readonly position: number | null
  /** The sentence that justifies the classification. Shown to the customer verbatim. */
  readonly evidenceQuote: string | null
  readonly recognizedAttributes: readonly string[]
  readonly confidence: ConfidenceLevel
  readonly evaluatorVersion: string
}

export interface ResponseEvaluation extends SubjectEvaluation {
  /** Every business the answer named, in order. Feeds competitor discovery. */
  readonly entities: readonly ExtractedEntity[]
  /** Other businesses recommended ahead of us. */
  readonly competitorsAhead: readonly string[]
}

/** Words that make a mention a recommendation rather than an aside. */
const POSITIVE_MARKERS = [
  'recommend',
  'best',
  'top',
  'great',
  'excellent',
  'favourite',
  'favorite',
  'worth',
  'go to',
  'perfect for',
  'ideal',
  'מומלץ',
  'מומלצת',
  'הכי טוב',
  'הכי טובה',
  'מצוינת',
  'מצוין',
  'שווה',
  'אידיאלי',
  'מושלם',
]

const STRONG_MARKERS = [
  'the best',
  'my top pick',
  'without question',
  'stands out',
  'first choice',
  'הכי טובה',
  'הבחירה הראשונה',
  'בלי ספק',
  'הבולטת',
]

/** Words that make a mention explicitly NOT a recommendation. */
const NEGATIVE_MARKERS = [
  'closed',
  'permanently closed',
  'not recommended',
  'avoid',
  'disappointing',
  'overrated',
  'used to be',
  'סגור',
  'נסגרה',
  'לא מומלץ',
  'מאכזב',
  'היה פעם',
]

const containsAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n.toLowerCase()))

/**
 * The sentence containing the first mention. This is the "show your work" field: a
 * customer disputing a classification is shown exactly what the AI said.
 */
const quoteFor = (text: string, subject: EvaluationSubject): string | null => {
  const lines = text.split('\n')
  for (const line of lines) {
    if (findBusinessMention(line, subject.name, subject.aliases).matched) return line.trim()
  }
  const sentences = text.split(/(?<=[.!?])\s+/)
  for (const sentence of sentences) {
    if (findBusinessMention(sentence, subject.name, subject.aliases).matched) {
      return sentence.trim()
    }
  }
  return null
}

const recognizeAttributes = (
  quote: string,
  required: readonly string[],
  terms: Readonly<Record<string, readonly string[]>>,
): string[] => {
  const haystack = quote.toLowerCase()
  return required.filter((key) => (terms[key] ?? []).some((t) => haystack.includes(t.toLowerCase())))
}

export const evaluateResponse = (input: EvaluationInput): ResponseEvaluation => {
  const { responseText, subject } = input
  const entities = extractRecommendedEntities(responseText)
  const mention = findBusinessMention(responseText, subject.name, subject.aliases)

  if (!mention.matched) {
    return {
      classification: 'NOT_PRESENT',
      position: null,
      evidenceQuote: null,
      recognizedAttributes: [],
      // Absence is the one thing text matching establishes with certainty.
      confidence: 'HIGH',
      evaluatorVersion: EVALUATOR_VERSION,
      entities,
      competitorsAhead: entities.map((e) => e.name),
    }
  }

  const quote = quoteFor(responseText, subject) ?? responseText.slice(0, 200)
  const lowerQuote = quote.toLowerCase()

  // Position comes from the parsed list, never from character offset alone: a name in an
  // introductory sentence is not rank 1.
  const listed = entities.find((e) =>
    findBusinessMention(e.name, subject.name, subject.aliases).matched,
  )
  const position = listed?.position ?? null

  const recognizedAttributes = recognizeAttributes(
    quote,
    input.requiredAttributes ?? [],
    input.attributeTerms ?? {},
  )

  let classification: RecommendationClass
  let confidence: ConfidenceLevel = 'HIGH'

  if (containsAny(lowerQuote, NEGATIVE_MARKERS)) {
    // Named, but in a way that sends the customer elsewhere.
    classification = 'MENTIONED'
  } else if (position === 1) {
    classification = containsAny(responseText.toLowerCase(), STRONG_MARKERS)
      ? 'STRONGLY_RECOMMENDED'
      : 'TOP_1'
  } else if (position !== null && position <= 3) {
    classification = 'TOP_3'
  } else if (position !== null) {
    classification = 'RELEVANT_RECOMMENDATION'
  } else if (containsAny(lowerQuote, POSITIVE_MARKERS)) {
    // Recommended in prose without a parseable rank.
    classification = 'RELEVANT_RECOMMENDATION'
    confidence = 'MEDIUM'
  } else {
    classification = 'MENTIONED'
    confidence = 'MEDIUM'
  }

  const competitorsAhead = entities
    .filter((e) => (position === null || e.position < position))
    .filter((e) => !findBusinessMention(e.name, subject.name, subject.aliases).matched)
    .map((e) => e.name)

  return {
    classification,
    position,
    evidenceQuote: quote,
    recognizedAttributes,
    confidence,
    evaluatorVersion: EVALUATOR_VERSION,
    entities,
    competitorsAhead,
  }
}

/** Evaluates a known competitor's outcome in the same answer, for share-of-voice. */
export const evaluateCompetitor = (
  responseText: string,
  competitor: EvaluationSubject,
): SubjectEvaluation => {
  const evaluation = evaluateResponse({ responseText, subject: competitor })
  return {
    classification: evaluation.classification,
    position: evaluation.position,
    evidenceQuote: evaluation.evidenceQuote,
    recognizedAttributes: evaluation.recognizedAttributes,
    confidence: evaluation.confidence,
    evaluatorVersion: evaluation.evaluatorVersion,
  }
}

/**
 * Businesses in the answer we do not yet track. This is how the competitor set is
 * discovered from real AI behaviour rather than from a category directory.
 */
export const discoverCompetitors = (
  evaluation: ResponseEvaluation,
  subject: EvaluationSubject,
  known: readonly EvaluationSubject[],
): { name: string; position: number; recommended: boolean }[] => {
  const knownNames = new Set([
    normalizeName(subject.name),
    ...(subject.aliases ?? []).map(normalizeName),
    ...known.flatMap((k) => [normalizeName(k.name), ...(k.aliases ?? []).map(normalizeName)]),
  ])

  return evaluation.entities
    .filter((e) => !knownNames.has(normalizeName(e.name)))
    .map((e) => ({ name: e.name, position: e.position, recommended: e.position <= 5 }))
}

export interface AccuracyCheckInput {
  readonly responseText: string
  readonly subject: EvaluationSubject
  /** Facts we hold at MEDIUM confidence or better, keyed by kind. */
  readonly knownFacts: Readonly<Record<string, string>>
}

export interface AccuracyIssue {
  readonly factKind: string
  readonly statedValue: string
  readonly actualValue: string
  readonly issueType: 'WRONG' | 'OUTDATED' | 'FABRICATED' | 'CLOSED_REPORTED_OPEN'
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH'
}

/**
 * Detects statements about the business that contradict what we know.
 *
 * Conservative on purpose: we only claim a hallucination where our own fact is solid and
 * the contradiction is unambiguous. Telling a customer "the AI is wrong about you" and
 * being wrong ourselves is worse than staying quiet.
 */
export const checkAccuracy = (
  input: AccuracyCheckInput,
): { accuracy: AccuracyClass; issues: AccuracyIssue[] } => {
  const issues: AccuracyIssue[] = []
  const text = input.responseText
  const mention = findBusinessMention(text, input.subject.name, input.subject.aliases)
  if (!mention.matched) return { accuracy: 'UNKNOWN', issues: [] }

  const sentences = text
    .split(/(?<=[.!?\n])/)
    .filter((s) => findBusinessMention(s, input.subject.name, input.subject.aliases).matched)
  const about = sentences.join(' ')
  if (about.length === 0) return { accuracy: 'UNKNOWN', issues: [] }

  const knownPhone = input.knownFacts.phone
  if (knownPhone) {
    const digitsKnown = knownPhone.replace(/\D/g, '').slice(-9)
    for (const candidate of about.match(/(?:\+972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}/g) ?? []) {
      if (candidate.replace(/\D/g, '').slice(-9) !== digitsKnown) {
        issues.push({
          factKind: 'phone',
          statedValue: candidate,
          actualValue: knownPhone,
          issueType: 'WRONG',
          severity: 'HIGH',
        })
      }
    }
  }

  const knownCity = input.knownFacts.city
  if (knownCity && !about.toLowerCase().includes(knownCity.toLowerCase())) {
    // Only a problem when the answer asserts a DIFFERENT city, not when it omits one.
    const otherCities = ['Tel Aviv', 'Jerusalem', 'Haifa', 'Eilat', 'Netanya', 'Herzliya']
    const stated = otherCities.find(
      (c) => c.toLowerCase() !== knownCity.toLowerCase() && about.includes(c),
    )
    if (stated) {
      issues.push({
        factKind: 'city',
        statedValue: stated,
        actualValue: knownCity,
        issueType: 'WRONG',
        severity: 'HIGH',
      })
    }
  }

  if (/permanently closed|has closed|no longer operating|נסגרה|סגורה לצמיתות/i.test(about)) {
    issues.push({
      factKind: 'operational_status',
      statedValue: 'closed',
      actualValue: 'open',
      issueType: 'CLOSED_REPORTED_OPEN',
      severity: 'HIGH',
    })
  }

  const knownCuisine = input.knownFacts.cuisine
  if (knownCuisine) {
    const cuisines = ['Italian', 'Japanese', 'Israeli', 'French', 'Greek', 'Indian', 'Thai']
    const stated = cuisines.find(
      (c) => c.toLowerCase() !== knownCuisine.toLowerCase() && about.includes(c),
    )
    if (stated) {
      issues.push({
        factKind: 'cuisine',
        statedValue: stated,
        actualValue: knownCuisine,
        issueType: 'WRONG',
        severity: 'MEDIUM',
      })
    }
  }

  const accuracy: AccuracyClass =
    issues.length === 0
      ? 'CORRECT'
      : issues.some((i) => i.severity === 'HIGH')
        ? 'INCORRECT'
        : 'PARTIALLY_CORRECT'

  return { accuracy, issues }
}
