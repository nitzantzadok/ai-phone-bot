/**
 * Quality gates.
 *
 * The last thing standing between an autonomous system and a customer's live website.
 *
 * The governing rule is simple and absolute: every factual claim we publish must trace to
 * a fact in the knowledge graph held at MEDIUM confidence or better. Not "sounds
 * plausible", not "the model said so" — a fact id, with a source. Anything that fails goes
 * to a human; nothing marginal is published on the assumption it is probably fine.
 */
import type { ConfidenceLevel } from '@autopilot/shared/domain.ts'
import { CONFIDENCE_RANK } from '@autopilot/shared/domain.ts'
import { detectLanguage } from '@autopilot/shared/locale.ts'

export interface GroundingFact {
  readonly id: string
  readonly factKind: string
  readonly value: string | null
  readonly confidence: ConfidenceLevel
  readonly attributeKey?: string
}

export interface QualityGateInput {
  /** Text that would become customer-visible. */
  readonly text: string
  readonly language: string
  /** Facts available to ground claims. */
  readonly facts: readonly GroundingFact[]
  /** Attribute keys this content asserts about the business. */
  readonly assertedAttributes?: readonly string[]
  /** Existing page text, for duplicate detection. */
  readonly existingContent?: readonly string[]
  /** Structured data being published alongside, if any. */
  readonly structuredData?: Record<string, unknown>
  /** Verticals with regulatory exposure get stricter treatment. */
  readonly vertical: string
  readonly links?: readonly string[]
  readonly knownGoodLinks?: ReadonlySet<string>
}

export interface GateFinding {
  readonly gate: string
  readonly severity: 'BLOCK' | 'WARN'
  readonly message: string
  readonly evidence?: string
}

export interface QualityGateResult {
  readonly passed: boolean
  /** 0..1. Below the publish threshold the change is routed to approval, never published. */
  readonly confidence: number
  readonly findings: readonly GateFinding[]
  readonly groundedFactIds: readonly string[]
}

/** Below this, we do not publish automatically no matter what the risk tier says. */
export const PUBLISH_CONFIDENCE_THRESHOLD = 0.8

export const HIGH_RISK_VERTICALS = new Set(['lawyer', 'dentist', 'clinic', 'financial'])

/**
 * Unsupported superlatives.
 *
 * "The best restaurant in Tel Aviv" is not a fact we can ground, it is a claim a
 * competitor can dispute and a regulator can object to. We never publish one.
 */
const SUPERLATIVES = [
  /\bthe best\b/i,
  /\bbest in\b/i,
  /\bnumber one\b/i,
  /\b#1\b/,
  /\bleading\b/i,
  /\bworld[- ]class\b/i,
  /\bunmatched\b/i,
  /\bguaranteed\b/i,
  new RegExp('\\u05d4\\u05db\\u05d9 \\u05d8\\u05d5\\u05d1'), // "the best" (m)
  new RegExp('\\u05d4\\u05db\\u05d9 \\u05d8\\u05d5\\u05d1\\u05d4'), // "the best" (f)
  new RegExp('\\u05de\\u05e1\\u05e4\\u05e8 1'), // "number 1"
  new RegExp('\\u05d4\\u05de\\u05d5\\u05d1\\u05d9\\u05dc'), // "the leading"
]

/** Claims that need professional qualification we cannot verify. */
const REGULATED_CLAIMS = [
  /\bcure\b/i,
  /\bguarantee[sd]?\b/i,
  /\bwe will win\b/i,
  /\brisk[- ]free\b/i,
  /\bpainless\b/i,
  /\b100% success\b/i,
  new RegExp('\\u05e0\\u05d1\\u05d8\\u05d9\\u05d7'), // "we promise"
  new RegExp('\\u05d4\\u05e6\\u05dc\\u05d7\\u05d4 \\u05de\\u05d5\\u05d1\\u05d8\\u05d7\\u05ea'), // "guaranteed success"
]

/** Fabricated authority markers. Never generated, and blocked if they appear. */
const FABRICATED_AUTHORITY = [
  /\baward[- ]winning\b/i,
  /\bas seen (in|on)\b/i,
  /\bvoted\b/i,
  /\bcertified by\b/i,
  /\brated \d(\.\d)? stars?\b/i,
]

const normalize = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

/** Jaccard similarity over word trigrams: cheap, language-agnostic, good enough. */
export const contentSimilarity = (a: string, b: string): number => {
  const shingles = (text: string): Set<string> => {
    const words = normalize(text).split(' ').filter(Boolean)
    const out = new Set<string>()
    for (let i = 0; i + 2 < words.length; i++) out.add(words.slice(i, i + 3).join(' '))
    return out
  }
  const setA = shingles(a)
  const setB = shingles(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const s of setA) if (setB.has(s)) intersection++
  return intersection / (setA.size + setB.size - intersection)
}

export const runQualityGates = (input: QualityGateInput): QualityGateResult => {
  const findings: GateFinding[] = []
  const groundedFactIds: string[] = []
  const usableFacts = input.facts.filter(
    (f) => CONFIDENCE_RANK[f.confidence] >= CONFIDENCE_RANK.MEDIUM,
  )

  /* ---------------------------------------------------- factual grounding ----- */
  for (const attributeKey of input.assertedAttributes ?? []) {
    const fact = usableFacts.find((f) => f.attributeKey === attributeKey)
    if (fact) {
      groundedFactIds.push(fact.id)
    } else {
      findings.push({
        gate: 'factual_grounding',
        severity: 'BLOCK',
        message: `The content claims "${attributeKey}" but we hold no confirmed fact supporting it.`,
        evidence: attributeKey,
      })
    }
  }

  // Any concrete business detail in the text must match a fact, not merely be plausible.
  for (const factKind of ['phone', 'address', 'opening_hours', 'price_range']) {
    const stated = extractStated(input.text, factKind)
    if (!stated) continue
    const fact = usableFacts.find((f) => f.factKind === factKind)
    if (!fact) {
      findings.push({
        gate: 'factual_grounding',
        severity: 'BLOCK',
        message: `The content states a ${factKind.replace('_', ' ')} we cannot verify.`,
        evidence: stated,
      })
    } else if (fact.value && !looselyMatches(stated, fact.value)) {
      findings.push({
        gate: 'factual_grounding',
        severity: 'BLOCK',
        message: `The content states a ${factKind.replace('_', ' ')} that differs from your confirmed information.`,
        evidence: `${stated} vs ${fact.value}`,
      })
    } else {
      groundedFactIds.push(fact.id)
    }
  }

  /* ------------------------------------------------------- unsupported claims ----- */
  for (const pattern of SUPERLATIVES) {
    const match = pattern.exec(input.text)
    if (match) {
      findings.push({
        gate: 'unsupported_claim',
        severity: 'BLOCK',
        message: 'The content makes a superlative claim we cannot substantiate.',
        evidence: match[0],
      })
      break
    }
  }

  for (const pattern of FABRICATED_AUTHORITY) {
    const match = pattern.exec(input.text)
    if (match) {
      findings.push({
        gate: 'fabricated_authority',
        severity: 'BLOCK',
        message: 'The content implies recognition or an award we have no evidence for.',
        evidence: match[0],
      })
      break
    }
  }

  /* ------------------------------------------------------------- regulated ----- */
  if (HIGH_RISK_VERTICALS.has(input.vertical)) {
    for (const pattern of REGULATED_CLAIMS) {
      const match = pattern.exec(input.text)
      if (match) {
        findings.push({
          gate: 'regulated_claim',
          severity: 'BLOCK',
          message:
            'This is a regulated field, and the content promises an outcome. That needs a human decision.',
          evidence: match[0],
        })
        break
      }
    }
  }

  /* -------------------------------------------------------------- language ----- */
  const detected = detectLanguage(input.text)
  if (detected && detected !== input.language) {
    findings.push({
      gate: 'language',
      severity: 'BLOCK',
      message: `The content is written in ${detected} but was intended for ${input.language}.`,
    })
  }

  /* ------------------------------------------------------------- duplicate ----- */
  for (const existing of input.existingContent ?? []) {
    const similarity = contentSimilarity(input.text, existing)
    if (similarity > 0.7) {
      findings.push({
        gate: 'duplicate_content',
        severity: 'BLOCK',
        message: 'This content is nearly identical to a page you already have.',
        evidence: `similarity ${similarity.toFixed(2)}`,
      })
      break
    }
    if (similarity > 0.45) {
      findings.push({
        gate: 'duplicate_content',
        severity: 'WARN',
        message: 'This content overlaps substantially with an existing page.',
        evidence: `similarity ${similarity.toFixed(2)}`,
      })
      break
    }
  }

  /* --------------------------------------------------------- structured data ----- */
  if (input.structuredData) {
    findings.push(...validateStructuredData(input.structuredData, usableFacts))
  }

  /* -------------------------------------------------------------------- links ----- */
  for (const link of input.links ?? []) {
    if (input.knownGoodLinks && !input.knownGoodLinks.has(link)) {
      findings.push({
        gate: 'link_validity',
        severity: 'WARN',
        message: 'The content links to a page we have not verified.',
        evidence: link,
      })
    }
  }

  /* ------------------------------------------------------------------ empty ----- */
  if (input.text.trim().length < 20) {
    findings.push({
      gate: 'substance',
      severity: 'BLOCK',
      message: 'The generated content is too short to be useful.',
    })
  }

  const blocks = findings.filter((f) => f.severity === 'BLOCK').length
  const warns = findings.filter((f) => f.severity === 'WARN').length
  const confidence = blocks > 0 ? 0 : Math.max(0, 1 - warns * 0.15)

  return {
    passed: blocks === 0 && confidence >= PUBLISH_CONFIDENCE_THRESHOLD,
    confidence,
    findings,
    groundedFactIds: [...new Set(groundedFactIds)],
  }
}

/**
 * Structured data validation.
 *
 * Two rules, both non-negotiable: required properties must be present, and every property
 * must correspond to information we actually hold. Marking up a price range the business
 * never stated is deceptive structured data, whatever the intent.
 */
export const validateStructuredData = (
  payload: Record<string, unknown>,
  facts: readonly GroundingFact[],
): GateFinding[] => {
  const findings: GateFinding[] = []
  const type = payload['@type']

  if (typeof type !== 'string') {
    findings.push({
      gate: 'schema_validity',
      severity: 'BLOCK',
      message: 'Structured data has no @type.',
    })
    return findings
  }

  if (payload['@context'] !== 'https://schema.org') {
    findings.push({
      gate: 'schema_validity',
      severity: 'BLOCK',
      message: 'Structured data has no schema.org context.',
    })
  }

  if (typeof payload.name !== 'string' || payload.name.trim().length === 0) {
    findings.push({
      gate: 'schema_validity',
      severity: 'BLOCK',
      message: 'Structured data has no business name.',
    })
  }

  // Every fact-bearing property must be backed by a fact we hold.
  const PROPERTY_TO_FACT: Record<string, string> = {
    telephone: 'phone',
    priceRange: 'price_range',
    servesCuisine: 'cuisine',
    openingHoursSpecification: 'opening_hours',
    address: 'address',
  }

  for (const [property, factKind] of Object.entries(PROPERTY_TO_FACT)) {
    if (payload[property] === undefined) continue
    if (!facts.some((f) => f.factKind === factKind)) {
      findings.push({
        gate: 'schema_grounding',
        severity: 'BLOCK',
        message: `Structured data declares ${property} but we hold no confirmed ${factKind.replace('_', ' ')}.`,
        evidence: property,
      })
    }
  }

  // aggregateRating is the classic deceptive-markup vector: we never publish one.
  if (payload.aggregateRating !== undefined || payload.review !== undefined) {
    findings.push({
      gate: 'schema_grounding',
      severity: 'BLOCK',
      message: 'We do not publish rating or review markup. Those must come from a real review platform.',
    })
  }

  return findings
}

const IL_PHONE = /(?:\+972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}/
const PRICE_RANGE = /\$\$?\$?\$?|₪₪?₪?/

const extractStated = (text: string, factKind: string): string | null => {
  switch (factKind) {
    case 'phone':
      return IL_PHONE.exec(text)?.[0] ?? null
    case 'price_range':
      return PRICE_RANGE.exec(text)?.[0] ?? null
    case 'opening_hours':
      return /\b\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\b/.exec(text)?.[0] ?? null
    default:
      return null
  }
}

const looselyMatches = (a: string, b: string): boolean => {
  const digitsA = a.replace(/\D/g, '')
  const digitsB = b.replace(/\D/g, '')
  if (digitsA.length >= 6 && digitsB.length >= 6) {
    return digitsA.slice(-9) === digitsB.slice(-9)
  }
  return normalize(a) === normalize(b) || b.includes(a) || a.includes(b)
}
