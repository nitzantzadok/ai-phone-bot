/**
 * Deterministic mock providers.
 *
 * These exist so the entire product — onboarding, measurement, scoring, diagnosis,
 * optimization, re-measurement — runs end to end with no API keys and no spend. That is a
 * hard requirement (brief §67): a development loop that costs money is a development loop
 * people avoid running.
 *
 * The mock is a *simulation of a world*, not a canned string. Businesses have attributes
 * with evidence strengths; a query is scored against them; the answer ranks the winners.
 * Because the world is mutable, an optimization that genuinely strengthens the client's
 * evidence changes the simulated answer — which is what makes the acceptance test
 * meaningful rather than theatre.
 *
 * Everything returned here is marked SYNTHETIC and can never be displayed as a real
 * observation from ChatGPT, Gemini or Claude.
 */
import { createHash } from 'node:crypto'
import type { ProviderId } from '@autopilot/shared/domain.ts'
import { AppError } from '@autopilot/shared/errors.ts'
import type {
  AIGenerationResult,
  AIProvider,
  GenerateRequest,
  ProviderCapabilities,
  ProviderCitation,
  ProviderHealth,
  ProviderUsage,
  StructuredRequest,
  StructuredResult,
} from '../types.ts'
import { estimateTokens } from '../pricing.ts'

export interface MockSource {
  readonly url: string
  readonly title: string
  /** 0..1 — how much weight the simulated engine gives this source. */
  readonly authority?: number
}

export interface MockBusinessProfile {
  readonly name: string
  readonly aliases?: readonly string[]
  readonly city: string
  readonly domain: string
  /** attribute key → evidence strength 0..1, as the simulated web "sees" it. */
  attributes: Record<string, number>
  /** Baseline prominence independent of any single attribute. */
  authority: number
  sources: MockSource[]
}

export interface MockWorld {
  readonly businesses: MockBusinessProfile[]
  /** Per-engine idiosyncrasy, so the three engines disagree the way real ones do. */
  readonly providerBias?: Partial<Record<ProviderId, number>>
}

/** Terms that signal an attribute in a query, per language. Mirrors the real lexicon. */
export const MOCK_ATTRIBUTE_TERMS: Record<string, { he: string[]; en: string[] }> = {
  romantic: { he: ['רומנטי', 'רומנטית', 'דייט'], en: ['romantic', 'date night', 'date'] },
  handmade_pasta: { he: ['פסטה', 'פסטה טרייה'], en: ['handmade pasta', 'fresh pasta', 'pasta'] },
  outdoor_seating: { he: ['ישיבה בחוץ', 'חצר'], en: ['outdoor', 'patio', 'terrace'] },
  family_friendly: { he: ['משפחות', 'ילדים'], en: ['family', 'kids', 'children'] },
  business_dinner: { he: ['עסקית', 'פגישה עסקית'], en: ['business dinner', 'business meeting'] },
  vegan_options: { he: ['טבעוני', 'טבעונית'], en: ['vegan', 'plant based'] },
  kosher: { he: ['כשר', 'כשרה'], en: ['kosher'] },
  wheelchair_accessible: { he: ['נגיש', 'נגישות'], en: ['wheelchair', 'accessible'] },
  budget_friendly: { he: ['זול', 'משתלם'], en: ['cheap', 'affordable', 'budget'] },
  upscale: { he: ['יוקרתי', 'שף'], en: ['upscale', 'fine dining', 'high end'] },
  late_night: { he: ['מאוחר', 'לילה'], en: ['late night', 'open late'] },
  quiet: { he: ['שקט', 'שקטה'], en: ['quiet', 'intimate'] },
}

/** Stable pseudo-randomness: the same query always produces the same answer. */
const seededUnit = (...parts: string[]): number => {
  const hash = createHash('sha256').update(parts.join('|')).digest()
  return hash.readUInt32BE(0) / 0xffffffff
}

const containsTerm = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase())

/** Which attributes the query is asking about, and how strongly. */
export const detectRequestedAttributes = (query: string): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [key, terms] of Object.entries(MOCK_ATTRIBUTE_TERMS)) {
    for (const term of [...terms.he, ...terms.en]) {
      if (containsTerm(query, term)) {
        // Longer phrases are more specific, so they weigh more.
        out[key] = Math.max(out[key] ?? 0, term.includes(' ') ? 1 : 0.8)
      }
    }
  }
  return out
}

const CITY_ALIASES: Record<string, string[]> = {
  'Tel Aviv': ['tel aviv', 'תל אביב', 'tlv'],
  Jerusalem: ['jerusalem', 'ירושלים'],
  Haifa: ['haifa', 'חיפה'],
  Herzliya: ['herzliya', 'הרצליה'],
  'Ramat Gan': ['ramat gan', 'רמת גן'],
  Netanya: ['netanya', 'נתניה'],
  Eilat: ['eilat', 'אילת'],
}

/** The city a query is explicitly about, if any. */
const queryCity = (query: string): string | null => {
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((a) => containsTerm(query, a))) return city
  }
  return null
}

/**
 * Locality weight. A query that names a city is a hard geographic constraint — real
 * answer engines essentially never offer a Jerusalem restaurant for "in Tel Aviv" — so
 * the out-of-city penalty is severe rather than cosmetic. With no city in the query there
 * is no geographic signal, and every business competes evenly.
 */
const localityWeight = (query: string, city: string): number => {
  const asked = queryCity(query)
  if (asked === null) return 1
  return asked === city ? 1 : 0.15
}

interface RankedBusiness {
  readonly profile: MockBusinessProfile
  readonly score: number
}

const rankBusinesses = (
  world: MockWorld,
  query: string,
  provider: ProviderId,
): RankedBusiness[] => {
  const requested = detectRequestedAttributes(query)
  const requestedKeys = Object.keys(requested)
  const bias = world.providerBias?.[provider] ?? 0

  return world.businesses
    .map((profile) => {
      // Attribute fit: how much evidence exists for exactly what was asked for.
      const attributeFit =
        requestedKeys.length === 0
          ? 0.5
          : requestedKeys.reduce(
              (sum, key) => sum + (profile.attributes[key] ?? 0) * (requested[key] ?? 0),
              0,
            ) / requestedKeys.reduce((sum, key) => sum + (requested[key] ?? 0), 0)

      // Corroboration: independent sources matter, with diminishing returns.
      const corroboration = Math.min(1, profile.sources.length / 5)
      const locality = localityWeight(query, profile.city)
      const jitter = (seededUnit(query, provider, profile.name) - 0.5) * 0.12

      const score =
        (0.5 * attributeFit + 0.25 * profile.authority + 0.15 * corroboration) * locality +
        jitter +
        bias * (seededUnit(provider, profile.name) - 0.5) * 0.1

      return { profile, score }
    })
    .filter((r) => r.score > 0.18)
    .sort((a, b) => b.score - a.score)
}

const renderAnswer = (ranked: RankedBusiness[], query: string, language: string): string => {
  const hebrew = language === 'he'
  if (ranked.length === 0) {
    return hebrew
      ? 'לא מצאתי המלצה מדויקת לבקשה הזו. כדאי לחפש לפי אזור ספציפי.'
      : "I could not find a confident recommendation for that. Try narrowing it to a specific area."
  }
  const intro = hebrew ? 'הנה כמה המלצות:' : 'Here are a few good options:'
  const lines = ranked.slice(0, 5).map((r, i) => {
    const top = Object.entries(r.profile.attributes)
      .filter(([, v]) => v >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k.replace(/_/g, ' '))
    const reason = hebrew
      ? `${r.profile.city}${top.length ? ` — ${top.join(', ')}` : ''}`
      : `in ${r.profile.city}${top.length ? `, known for ${top.join(' and ')}` : ''}`
    return `${i + 1}. ${r.profile.name} — ${reason}.`
  })
  const outro = hebrew
    ? 'מומלץ לבדוק זמינות מראש.'
    : 'It is worth checking availability in advance.'
  return [intro, ...lines, outro].join('\n')
}

export interface MockProviderOptions {
  readonly world: MockWorld
  /** Registered responders for structured calls, keyed by schemaName. */
  readonly structuredResponders?: Record<string, (req: StructuredRequest<unknown>) => unknown>
  /** Simulated latency, so timeout and concurrency behaviour can be exercised. */
  readonly latencyMs?: number
  /** Force a failure, for retry/circuit-breaker tests. */
  readonly failWith?: AppError
}

export class MockAIProvider implements AIProvider {
  readonly capabilities: ProviderCapabilities = {
    search: true,
    structuredOutput: true,
    maxContextTokens: 200_000,
  }
  readonly simulated = true

  private usageTotal: ProviderUsage = { promptTokens: 0, completionTokens: 0, searchCount: 0 }
  private callCount = 0

  constructor(
    readonly id: ProviderId,
    private readonly options: MockProviderOptions,
  ) {}

  get calls(): number {
    return this.callCount
  }

  private async simulateWork(): Promise<void> {
    this.callCount++
    if (this.options.failWith) throw this.options.failWith
    const latency = this.options.latencyMs ?? 0
    if (latency > 0) await new Promise((r) => setTimeout(r, latency))
  }

  async generate(req: GenerateRequest): Promise<AIGenerationResult> {
    const started = Date.now()
    await this.simulateWork()

    const language = req.context?.language ?? 'en'
    const ranked = rankBusinesses(this.options.world, req.prompt, this.id)
    const text = renderAnswer(ranked, req.prompt, language)

    const citations: ProviderCitation[] = req.search
      ? ranked.slice(0, 3).flatMap((r, bIndex) =>
          r.profile.sources.slice(0, 2).map((s, sIndex) => ({
            url: s.url,
            title: s.title,
            position: bIndex * 2 + sIndex + 1,
          })),
        )
      : []

    const usage: ProviderUsage = {
      promptTokens: estimateTokens(req.prompt) + estimateTokens(req.system ?? ''),
      completionTokens: estimateTokens(text),
      searchCount: req.search ? 1 : 0,
    }
    this.accumulate(usage)

    return {
      text,
      citations,
      searchQueries: req.search ? [req.prompt] : [],
      usage,
      provider: this.id,
      model: `mock-${this.id}`,
      sourceType: 'SYNTHETIC',
      latencyMs: Date.now() - started,
      costMinor: 0,
      finishReason: 'stop',
    }
  }

  async structuredGenerate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const started = Date.now()
    await this.simulateWork()

    const responder = this.options.structuredResponders?.[req.schemaName]
    if (!responder) {
      throw new AppError({
        code: 'NOT_IMPLEMENTED',
        message:
          `MockAIProvider has no structured responder for schema "${req.schemaName}". ` +
          'Register one in MockProviderOptions.structuredResponders so the mock stays ' +
          'deterministic instead of inventing data.',
        details: { schemaName: req.schemaName },
      })
    }

    // Validate through the caller's own schema: a mock that returns a shape the real
    // provider could not is worse than no mock at all.
    const value = req.schema.parse(responder(req as StructuredRequest<unknown>))
    const text = JSON.stringify(value)
    const usage: ProviderUsage = {
      promptTokens: estimateTokens(req.prompt),
      completionTokens: estimateTokens(text),
      searchCount: 0,
    }
    this.accumulate(usage)

    return {
      value,
      text,
      citations: [],
      searchQueries: [],
      usage,
      provider: this.id,
      model: `mock-${this.id}`,
      sourceType: 'SYNTHETIC',
      latencyMs: Date.now() - started,
      costMinor: 0,
    }
  }

  analyze(req: GenerateRequest): Promise<AIGenerationResult> {
    return this.generate(req)
  }

  evaluate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    return this.structuredGenerate(req)
  }

  search(req: GenerateRequest): Promise<AIGenerationResult> {
    return this.generate({ ...req, search: true })
  }

  getUsage(): ProviderUsage {
    return this.usageTotal
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.id,
      healthy: !this.options.failWith,
      latencyMs: this.options.latencyMs ?? 0,
      message: 'mock provider',
      checkedAt: new Date(),
    }
  }

  private accumulate(usage: ProviderUsage): void {
    this.usageTotal = {
      promptTokens: this.usageTotal.promptTokens + usage.promptTokens,
      completionTokens: this.usageTotal.completionTokens + usage.completionTokens,
      searchCount: this.usageTotal.searchCount + usage.searchCount,
    }
  }
}

export const createMockProviders = (
  options: MockProviderOptions,
): Record<ProviderId, MockAIProvider> => ({
  openai: new MockAIProvider('openai', options),
  gemini: new MockAIProvider('gemini', options),
  anthropic: new MockAIProvider('anthropic', options),
})
