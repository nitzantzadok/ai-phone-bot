import { describe, expect, it } from 'vitest'
import {
  extractRecommendedEntities,
  findBusinessMention,
  normalizeName,
} from '../src/entity-matching.ts'
import {
  checkAccuracy,
  discoverCompetitors,
  evaluateCompetitor,
  evaluateResponse,
} from '../src/evaluator.ts'

const ROSA = { id: 'b1', name: 'Rosa', aliases: ['רוזה', 'Rosa Tel Aviv'] }

describe('name normalisation', () => {
  it('strips punctuation, diacritics and case', () => {
    expect(normalizeName('  ROSA!  ')).toBe('rosa')
    expect(normalizeName('"Rosa"')).toBe('rosa')
    expect(normalizeName('Rosa   Tel  Aviv')).toBe('rosa tel aviv')
  })

  it('strips Hebrew geresh and gershayim used as abbreviation marks', () => {
    expect(normalizeName('עו״ד')).toBe('עוד')
  })
})

describe('findBusinessMention', () => {
  it('finds a plain mention', () => {
    expect(findBusinessMention('I would go to Rosa tonight.', 'Rosa').matched).toBe(true)
  })

  it('does not fire on a name inside a longer word', () => {
    expect(findBusinessMention('Rosamund Pike was there.', 'Rosa').matched).toBe(false)
    expect(findBusinessMention('The mimosa was good.', 'Rosa').matched).toBe(false)
  })

  it('matches through an alias, including Hebrew script', () => {
    const hebrew = findBusinessMention('הייתי ברוזה אתמול', 'Rosa', ['רוזה'])
    expect(hebrew.matched).toBe(true)
    expect(hebrew.matchedAlias).toBe('רוזה')
  })

  it('prefers the longest matching alias', () => {
    const match = findBusinessMention('Rosa Tel Aviv is excellent', 'Rosa', ['Rosa Tel Aviv'])
    expect(match.matchedAlias).toBe('rosa tel aviv')
  })

  it('counts occurrences', () => {
    expect(findBusinessMention('Rosa is great. Rosa again. Rosa.', 'Rosa').occurrences).toBe(3)
  })

  it('ignores aliases that are too short to be safe', () => {
    expect(findBusinessMention('a b c', 'Rosa', ['a']).matched).toBe(false)
  })
})

describe('extractRecommendedEntities', () => {
  it('parses a numbered list in order', () => {
    const entities = extractRecommendedEntities(
      ['Here are some options:', '1. Vito - romantic and quiet', '2. Rosa - handmade pasta', '3. Bella Napoli, family friendly'].join('\n'),
    )
    expect(entities.map((e) => e.name)).toEqual(['Vito', 'Rosa', 'Bella Napoli'])
    expect(entities[1]!.position).toBe(2)
  })

  it('parses a bulleted list', () => {
    const entities = extractRecommendedEntities('- Vito — great wine\n- Rosa — pasta')
    expect(entities.map((e) => e.name)).toEqual(['Vito', 'Rosa'])
  })

  it('falls back to bolded names in prose', () => {
    const entities = extractRecommendedEntities(
      'For a date I would suggest **Vito**, which is intimate. **Rosa** is also good.',
    )
    expect(entities.map((e) => e.name)).toEqual(['Vito', 'Rosa'])
  })

  it('rejects a sentence masquerading as a name', () => {
    const entities = extractRecommendedEntities(
      '1. It really depends on what kind of atmosphere you are looking for tonight',
    )
    expect(entities).toHaveLength(0)
  })

  it('returns nothing rather than guessing on unstructured prose', () => {
    expect(extractRecommendedEntities('It depends on what you like.')).toHaveLength(0)
  })

  it('keeps the source line as the evidence quote', () => {
    const entities = extractRecommendedEntities('1. Rosa - handmade pasta since 2011')
    expect(entities[0]!.context).toContain('handmade pasta')
  })
})

describe('evaluateResponse', () => {
  const listAnswer = [
    'Here are the best Italian restaurants in Tel Aviv for a date:',
    '1. Vito - intimate and romantic',
    '2. Rosa - handmade pasta, quiet room',
    '3. Trattoria Yafo - lovely terrace',
  ].join('\n')

  it('classifies a second-place listing as TOP_3 with the right position', () => {
    const result = evaluateResponse({ responseText: listAnswer, subject: ROSA })
    expect(result.classification).toBe('TOP_3')
    expect(result.position).toBe(2)
    expect(result.evidenceQuote).toContain('handmade pasta')
    expect(result.competitorsAhead).toEqual(['Vito'])
  })

  it('classifies a first-place listing as TOP_1', () => {
    const result = evaluateResponse({
      responseText: '1. Rosa - handmade pasta\n2. Vito - romantic',
      subject: ROSA,
    })
    expect(result.classification).toBe('TOP_1')
    expect(result.competitorsAhead).toHaveLength(0)
  })

  it('upgrades to STRONGLY_RECOMMENDED when the answer says so', () => {
    const result = evaluateResponse({
      responseText: 'Rosa is without question the best choice.\n1. Rosa - the best in the city',
      subject: ROSA,
    })
    expect(result.classification).toBe('STRONGLY_RECOMMENDED')
  })

  it('reports NOT_PRESENT with high confidence when the business is absent', () => {
    const result = evaluateResponse({
      responseText: '1. Vito\n2. Bella Napoli',
      subject: ROSA,
    })
    expect(result.classification).toBe('NOT_PRESENT')
    expect(result.confidence).toBe('HIGH')
    expect(result.position).toBeNull()
    expect(result.competitorsAhead).toEqual(['Vito', 'Bella Napoli'])
  })

  it('does not count a negative mention as a recommendation', () => {
    const result = evaluateResponse({
      responseText: 'Rosa is permanently closed, so try Vito instead.',
      subject: ROSA,
    })
    expect(result.classification).toBe('MENTIONED')
  })

  it('treats prose praise without a rank as a recommendation, at lower confidence', () => {
    const result = evaluateResponse({
      responseText: 'For a quiet dinner I would recommend Rosa, which does excellent pasta.',
      subject: ROSA,
    })
    expect(result.classification).toBe('RELEVANT_RECOMMENDATION')
    expect(result.confidence).toBe('MEDIUM')
  })

  it('does not invent a position from a passing mention in the introduction', () => {
    const result = evaluateResponse({
      responseText: 'People often ask about Rosa. Here are my picks:\n1. Vito\n2. Bella Napoli',
      subject: ROSA,
    })
    expect(result.position).toBeNull()
    expect(result.classification).toBe('MENTIONED')
  })

  it('records which demanded attributes the answer actually credited to us', () => {
    const result = evaluateResponse({
      responseText: '1. Rosa - a romantic room with handmade pasta',
      subject: ROSA,
      requiredAttributes: ['romantic', 'outdoor_seating'],
      attributeTerms: { romantic: ['romantic'], outdoor_seating: ['terrace', 'outdoor'] },
    })
    expect(result.recognizedAttributes).toEqual(['romantic'])
  })

  it('works on a Hebrew answer', () => {
    const result = evaluateResponse({
      responseText: 'הנה כמה המלצות:\n1. ויטו - רומנטית\n2. רוזה - פסטה בעבודת יד',
      subject: ROSA,
    })
    expect(result.classification).toBe('TOP_3')
    expect(result.position).toBe(2)
  })
})

describe('evaluateCompetitor', () => {
  it('scores a competitor in the same answer', () => {
    const result = evaluateCompetitor('1. Vito - romantic\n2. Rosa', { id: 'c1', name: 'Vito' })
    expect(result.classification).toBe('TOP_1')
    expect(result.position).toBe(1)
  })
})

describe('discoverCompetitors', () => {
  it('finds businesses we do not already track', () => {
    const answer = '1. Vito\n2. Rosa\n3. Bella Napoli'
    const evaluation = evaluateResponse({ responseText: answer, subject: ROSA })
    const discovered = discoverCompetitors(evaluation, ROSA, [{ id: 'c1', name: 'Vito' }])
    expect(discovered.map((d) => d.name)).toEqual(['Bella Napoli'])
  })

  it('never reports the business itself as its own competitor', () => {
    const answer = '1. Rosa Tel Aviv\n2. Vito'
    const evaluation = evaluateResponse({ responseText: answer, subject: ROSA })
    const discovered = discoverCompetitors(evaluation, ROSA, [])
    expect(discovered.map((d) => d.name)).not.toContain('Rosa Tel Aviv')
  })
})

describe('checkAccuracy', () => {
  const facts = { phone: '03-1234567', city: 'Tel Aviv', cuisine: 'Italian' }

  it('reports CORRECT when nothing contradicts what we know', () => {
    const result = checkAccuracy({
      responseText: 'Rosa is an Italian restaurant in Tel Aviv. Call 03-1234567.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(result.accuracy).toBe('CORRECT')
    expect(result.issues).toHaveLength(0)
  })

  it('catches a wrong phone number', () => {
    const result = checkAccuracy({
      responseText: 'You can reach Rosa on 03-9999999.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(result.accuracy).toBe('INCORRECT')
    expect(result.issues[0]!.factKind).toBe('phone')
  })

  it('catches a wrong city but tolerates one simply not stated', () => {
    const wrong = checkAccuracy({
      responseText: 'Rosa is a restaurant in Jerusalem.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(wrong.issues.some((i) => i.factKind === 'city')).toBe(true)

    const silent = checkAccuracy({
      responseText: 'Rosa serves Italian food.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(silent.issues.some((i) => i.factKind === 'city')).toBe(false)
  })

  it('catches an open business reported as closed', () => {
    const result = checkAccuracy({
      responseText: 'Rosa has closed and is no longer operating.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(result.issues[0]!.issueType).toBe('CLOSED_REPORTED_OPEN')
    expect(result.accuracy).toBe('INCORRECT')
  })

  it('catches a wrong cuisine as a lesser issue', () => {
    const result = checkAccuracy({
      responseText: 'Rosa is a Japanese restaurant.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(result.accuracy).toBe('PARTIALLY_CORRECT')
  })

  it('reports UNKNOWN rather than guessing when we are not mentioned', () => {
    const result = checkAccuracy({
      responseText: 'Vito is excellent.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(result.accuracy).toBe('UNKNOWN')
  })

  it('only judges sentences that are actually about us', () => {
    const result = checkAccuracy({
      responseText: 'Vito is in Jerusalem. Rosa is in Tel Aviv.',
      subject: ROSA,
      knownFacts: facts,
    })
    expect(result.issues).toHaveLength(0)
  })
})
