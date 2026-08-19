/**
 * Entity matching in AI answers.
 *
 * Deciding whether an answer mentioned "Rosa" is harder than it sounds: Israeli businesses
 * appear as Rosa, ROSA, Rosa TLV and in Hebrew script, sometimes with quotation marks that
 * Hebrew uses as abbreviation marks. A naive `includes()` both misses real mentions and
 * fires on the word "rosa" inside "rosamund", which would corrupt every metric downstream.
 */

/** Hebrew diacritics, geresh and gershayim, plus the presentation forms of quotes. */
const HEBREW_MARKS = /[֑-ׇ׳״]/g
const PUNCTUATION = /['"`‘’“”.,!?:;()[\]{}]/g

export const normalizeName = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(HEBREW_MARKS, '')
    .replace(PUNCTUATION, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Word-boundary aware for Latin script; substring for Hebrew, which has no case or spacing cues. */
const containsName = (haystack: string, needle: string): boolean => {
  if (needle.length === 0) return false
  const isLatin = /^[\x20-\x7F]+$/.test(needle)
  if (!isLatin) return haystack.includes(needle)
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(haystack)
}

export interface NameMatch {
  readonly matched: boolean
  /** Character offset of the first mention, for position inference and quoting. */
  readonly firstIndex: number
  readonly matchedAlias: string | null
  readonly occurrences: number
}

export const findBusinessMention = (
  text: string,
  name: string,
  aliases: readonly string[] = [],
): NameMatch => {
  const haystack = normalizeName(text)
  const candidates = [name, ...aliases]
    .map(normalizeName)
    .filter((c) => c.length >= 2)
    // Longest first, so "Rosa Tel Aviv" is preferred over "Rosa" when both appear.
    .sort((a, b) => b.length - a.length)

  for (const candidate of candidates) {
    if (!containsName(haystack, candidate)) continue
    let occurrences = 0
    let index = haystack.indexOf(candidate)
    const firstIndex = index
    while (index !== -1) {
      occurrences++
      index = haystack.indexOf(candidate, index + candidate.length)
    }
    return { matched: true, firstIndex, matchedAlias: candidate, occurrences }
  }

  return { matched: false, firstIndex: -1, matchedAlias: null, occurrences: 0 }
}

export interface ExtractedEntity {
  readonly name: string
  /** 1-based rank in the answer. */
  readonly position: number
  /** The line or sentence the name came from, used as the evidence quote. */
  readonly context: string
}

const LIST_MARKERS = [
  /^\s*(\d+)[.)]\s+(.+)$/, // "1. Name" / "1) Name"
  /^\s*[-*•]\s+(.+)$/, // "- Name" / "* Name"
]

/**
 * Pulls the ordered list of businesses an answer recommends.
 *
 * Answer engines overwhelmingly reply with a numbered or bulleted list; when they reply in
 * prose we fall back to bolded names, then to sentence order. Anything we cannot parse
 * confidently yields no position rather than a guessed one — an invented rank would flow
 * straight into Top-3 rate.
 */
export const extractRecommendedEntities = (text: string): ExtractedEntity[] => {
  const entities: ExtractedEntity[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    for (const marker of LIST_MARKERS) {
      const match = marker.exec(line)
      if (!match) continue
      const content = (match[2] ?? match[1] ?? '').trim()
      const name = leadingName(content)
      if (name) {
        entities.push({ name, position: entities.length + 1, context: line.trim() })
      }
      break
    }
  }

  if (entities.length > 0) return entities

  // Prose fallback: markdown-bolded names are the common convention.
  const bold = [...text.matchAll(/\*\*([^*]{2,60})\*\*/g)]
  for (const match of bold) {
    const name = leadingName(match[1]!.trim())
    if (name && !entities.some((e) => normalizeName(e.name) === normalizeName(name))) {
      entities.push({
        name,
        position: entities.length + 1,
        context: sentenceAround(text, match.index ?? 0),
      })
    }
  }

  return entities
}

/** The business name at the start of a list item, before the explanation. */
const leadingName = (content: string): string | null => {
  const cleaned = content.replace(/\*\*/g, '').trim()
  const separator = cleaned.search(/\s+[–—-]\s+|[,:]\s|\s+\(/)
  const name = (separator === -1 ? cleaned : cleaned.slice(0, separator)).trim()
  if (name.length < 2 || name.length > 60) return null
  // A full sentence is a description, not a name.
  if (name.split(' ').length > 6) return null
  return name
}

const sentenceAround = (text: string, index: number): string => {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1)
  const endCandidate = text.indexOf('.', index)
  const end = endCandidate === -1 ? text.length : endCandidate + 1
  return text.slice(start, end).trim()
}
