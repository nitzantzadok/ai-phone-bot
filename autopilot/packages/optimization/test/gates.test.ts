import { describe, expect, it } from 'vitest'
import { evaluateConstraints, prioritizationHints, type BusinessRule } from '../src/constraints.ts'
import {
  PUBLISH_CONFIDENCE_THRESHOLD,
  contentSimilarity,
  runQualityGates,
  validateStructuredData,
  type GroundingFact,
} from '../src/quality-gates.ts'

const facts: GroundingFact[] = [
  { id: 'f1', factKind: 'business_name', value: 'Rosa', confidence: 'HIGH' },
  { id: 'f2', factKind: 'phone', value: '03-1234567', confidence: 'HIGH' },
  { id: 'f3', factKind: 'attribute', value: 'romantic', confidence: 'HIGH', attributeKey: 'romantic' },
  { id: 'f4', factKind: 'cuisine', value: 'Italian', confidence: 'HIGH' },
  { id: 'f5', factKind: 'attribute', value: 'quiet', confidence: 'LOW', attributeKey: 'quiet' },
]

const gate = (overrides: Partial<Parameters<typeof runQualityGates>[0]> = {}) =>
  runQualityGates({
    text: 'Rosa is an Italian restaurant offering a quiet, romantic dining room in Tel Aviv.',
    language: 'en',
    facts,
    vertical: 'restaurant',
    ...overrides,
  })

describe('business constraints', () => {
  const rules: BusinessRule[] = [
    { ruleType: 'DO_NOT_CLAIM', value: 'luxury' },
    { ruleType: 'ALWAYS_MENTION', value: 'kosher' },
    { ruleType: 'DO_NOT_CREATE', value: 'new_pages' },
    { ruleType: 'DO_NOT_MENTION', value: 'delivery' },
  ]

  it('blocks a claim the owner forbade', () => {
    const verdict = evaluateConstraints(
      { actionType: 'ADD_CONTENT_SECTION', text: 'A luxury dining experience.', riskTier: 'MEDIUM' },
      rules,
    )
    expect(verdict.allowed).toBe(false)
    expect(verdict.violations[0]!.reason).toContain('luxury')
  })

  it('blocks a topic the owner asked us to leave alone', () => {
    const verdict = evaluateConstraints(
      { actionType: 'ADD_CONTENT_SECTION', text: 'We now offer delivery.', riskTier: 'MEDIUM' },
      rules,
    )
    expect(verdict.allowed).toBe(false)
  })

  it('blocks page creation when the owner said not to', () => {
    const verdict = evaluateConstraints({ actionType: 'CREATE_PAGE', riskTier: 'MEDIUM' }, rules)
    expect(verdict.allowed).toBe(false)
    expect(verdict.violations[0]!.reason).toContain('not to create new pages')
  })

  it('requires a mandatory mention only on substantial content', () => {
    const long = evaluateConstraints(
      {
        actionType: 'ADD_CONTENT_SECTION',
        text: 'x'.repeat(200),
        riskTier: 'MEDIUM',
      },
      rules,
    )
    expect(long.allowed).toBe(false)

    const short = evaluateConstraints(
      { actionType: 'FIX_METADATA', text: 'Rosa - Italian - Tel Aviv', riskTier: 'LOW' },
      rules,
    )
    expect(short.allowed).toBe(true)
  })

  it('blocks publishing in a language the owner excluded', () => {
    const verdict = evaluateConstraints(
      { actionType: 'ADD_CONTENT_SECTION', text: 'hello', language: 'en', riskTier: 'MEDIUM' },
      [{ ruleType: 'TARGET_LANGUAGE', value: 'he' }],
    )
    expect(verdict.allowed).toBe(false)
  })

  it('escalates to approval without blocking when the owner asked to review everything', () => {
    const verdict = evaluateConstraints(
      { actionType: 'FIX_METADATA', text: 'Rosa - Italian - Tel Aviv', riskTier: 'LOW' },
      [{ ruleType: 'APPROVAL_REQUIRED', value: 'all_changes' }],
    )
    expect(verdict.allowed).toBe(true)
    expect(verdict.requiresApproval).toBe(true)
  })

  it('allows a compliant change', () => {
    const verdict = evaluateConstraints(
      { actionType: 'FIX_METADATA', text: 'Rosa - Italian restaurant', riskTier: 'LOW' },
      [{ ruleType: 'DO_NOT_CLAIM', value: 'luxury' }],
    )
    expect(verdict.allowed).toBe(true)
    expect(verdict.requiresApproval).toBe(false)
  })

  it('treats audience targeting as guidance, never as a block', () => {
    const verdict = evaluateConstraints(
      { actionType: 'ADD_CONTENT_SECTION', text: 'For families.', riskTier: 'MEDIUM' },
      [{ ruleType: 'TARGET_AUDIENCE', value: 'couples' }],
    )
    expect(verdict.allowed).toBe(true)
    expect(prioritizationHints([{ ruleType: 'TARGET_AUDIENCE', value: 'couples' }]).targetAudiences)
      .toEqual(['couples'])
  })
})

describe('quality gates', () => {
  it('passes grounded, plain content', () => {
    const result = gate({ assertedAttributes: ['romantic'] })
    expect(result.passed).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(PUBLISH_CONFIDENCE_THRESHOLD)
    expect(result.groundedFactIds).toContain('f3')
  })

  it('blocks an attribute claim with no confirmed fact behind it', () => {
    const result = gate({
      text: 'Rosa has beautiful outdoor seating on a garden terrace.',
      assertedAttributes: ['outdoor_seating'],
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.gate === 'factual_grounding')).toBe(true)
  })

  it('blocks an attribute we only hold at LOW confidence', () => {
    const result = gate({ assertedAttributes: ['quiet'] })
    expect(result.passed).toBe(false)
  })

  it('blocks a phone number that contradicts our confirmed one', () => {
    const result = gate({ text: 'Call Rosa today on 03-9999999 to book a table for dinner.' })
    expect(result.passed).toBe(false)
    expect(result.findings[0]!.message).toContain('differs from your confirmed information')
  })

  it('accepts the confirmed phone number in any formatting', () => {
    const result = gate({ text: 'Call Rosa on 031234567 to book a table for the evening.' })
    expect(result.findings.filter((f) => f.gate === 'factual_grounding')).toHaveLength(0)
  })

  it.each([
    'Rosa is the best restaurant in Tel Aviv.',
    'Rosa is the leading Italian kitchen in the city.',
    'Rosa is a world-class dining destination.',
    'Rosa is the number one choice for pasta lovers.',
  ])('blocks the unsupported superlative in: %s', (text) => {
    expect(gate({ text }).passed).toBe(false)
  })

  it('blocks a Hebrew superlative too', () => {
    const result = gate({
      text: 'רוזה היא המסעדה הכי טובה בתל אביב ושווה לבקר בה כל ערב בשבוע',
      language: 'he',
    })
    expect(result.passed).toBe(false)
  })

  it.each([
    'Rosa is an award-winning restaurant in Tel Aviv serving Italian food.',
    'As seen in the national press, Rosa serves excellent Italian food nightly.',
    'Rosa is rated 5 stars by diners across the city every single week.',
  ])('blocks fabricated authority in: %s', (text) => {
    const result = gate({ text })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.gate === 'fabricated_authority' || f.gate === 'unsupported_claim')).toBe(true)
  })

  it('applies stricter rules to regulated verticals', () => {
    const legalText = 'Our lawyers guarantee we will win your case in court.'
    const asRestaurant = runQualityGates({ text: legalText, language: 'en', facts, vertical: 'restaurant' })
    const asLawyer = runQualityGates({ text: legalText, language: 'en', facts, vertical: 'lawyer' })
    expect(asLawyer.findings.some((f) => f.gate === 'regulated_claim')).toBe(true)
    // "guarantee" is caught as an unsupported claim everywhere; the regulated gate adds to it.
    expect(asRestaurant.findings.some((f) => f.gate === 'regulated_claim')).toBe(false)
    expect(asLawyer.passed).toBe(false)
  })

  it('blocks content written in the wrong language', () => {
    const result = gate({
      text: 'רוזה היא מסעדה איטלקית בתל אביב עם חדר אוכל שקט ונעים לזוגות',
      language: 'en',
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => f.gate === 'language')).toBe(true)
  })

  it('blocks near-duplicate content and warns on partial overlap', () => {
    const existing = 'Rosa is an Italian restaurant offering a quiet, romantic dining room in Tel Aviv.'
    const duplicate = gate({ existingContent: [existing], assertedAttributes: ['romantic'] })
    expect(duplicate.passed).toBe(false)
    expect(duplicate.findings.some((f) => f.gate === 'duplicate_content')).toBe(true)
  })

  it('blocks content that is too thin to be useful', () => {
    expect(gate({ text: 'Rosa.' }).passed).toBe(false)
  })

  it('warns rather than blocks on an unverified link', () => {
    const result = gate({
      assertedAttributes: ['romantic'],
      links: ['https://rosa.example.com/unknown'],
      knownGoodLinks: new Set(['https://rosa.example.com/']),
    })
    expect(result.findings.some((f) => f.severity === 'WARN')).toBe(true)
    expect(result.confidence).toBeLessThan(1)
  })

  it('drives confidence to zero on any blocking finding', () => {
    expect(gate({ text: 'Rosa is the best in Tel Aviv.' }).confidence).toBe(0)
  })
})

describe('structured data validation', () => {
  it('accepts markup backed entirely by confirmed facts', () => {
    const findings = validateStructuredData(
      {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name: 'Rosa',
        telephone: '03-1234567',
        servesCuisine: 'Italian',
      },
      facts,
    )
    expect(findings).toHaveLength(0)
  })

  it('blocks a property we hold no fact for', () => {
    const findings = validateStructuredData(
      { '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Rosa', priceRange: '$$$' },
      facts,
    )
    expect(findings.some((f) => f.gate === 'schema_grounding')).toBe(true)
  })

  it('never allows rating or review markup', () => {
    const findings = validateStructuredData(
      {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name: 'Rosa',
        aggregateRating: { ratingValue: 4.9, reviewCount: 120 },
      },
      facts,
    )
    expect(findings.some((f) => f.message.includes('rating or review markup'))).toBe(true)
  })

  it('requires context, type and name', () => {
    expect(validateStructuredData({}, facts).length).toBeGreaterThan(0)
    expect(validateStructuredData({ '@type': 'Restaurant', name: 'Rosa' }, facts).some((f) => f.message.includes('context'))).toBe(true)
    expect(validateStructuredData({ '@context': 'https://schema.org', '@type': 'Restaurant' }, facts).some((f) => f.message.includes('name'))).toBe(true)
  })
})

describe('contentSimilarity', () => {
  it('is 1 for identical text and low for unrelated text', () => {
    const a = 'Rosa is an Italian restaurant in central Tel Aviv serving handmade pasta daily'
    expect(contentSimilarity(a, a)).toBe(1)
    expect(contentSimilarity(a, 'A plumber in Haifa fixing burst pipes around the clock')).toBeLessThan(0.1)
  })

  it('ignores punctuation and case', () => {
    expect(
      contentSimilarity(
        'Rosa is an Italian restaurant in Tel Aviv serving pasta',
        'ROSA IS AN ITALIAN RESTAURANT IN TEL AVIV SERVING PASTA!!!',
      ),
    ).toBe(1)
  })

  it('returns 0 for text too short to shingle', () => {
    expect(contentSimilarity('Rosa', 'Rosa')).toBe(0)
  })
})
