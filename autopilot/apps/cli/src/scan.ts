/**
 * The real scan.
 *
 * Everything here happens against a live website over a real socket. There is no fixture,
 * no database and no seeded world: the crawler fetches the customer's actual pages, the
 * facts are the ones written on them, and every finding points at a URL you can open.
 *
 * The one thing this module will not do is guess. Measuring whether an AI assistant names
 * a business requires asking a real assistant, which requires a real API key. Without one
 * the AI half is reported as NOT MEASURED, with the reason — never simulated, never
 * estimated, and never folded into a score that would then look like a measurement.
 * That distinction is the product's credibility, so it is enforced in the types: an
 * unmeasured scan has `aiVisibility: null` and there is no code path that fills it in
 * from anything but real provider responses.
 */
import { systemClock, type Clock } from '@autopilot/shared/clock.ts'
import { noopLogger, type Logger } from '@autopilot/shared/logger.ts'
import { newId, type BusinessId } from '@autopilot/shared/ids.ts'
import { loadEnv, configuredProviders, type Env } from '@autopilot/shared/env.ts'
import { containsHebrew, englishCityName } from '@autopilot/shared/il-cities.ts'
import type { ConfidenceLevel } from '@autopilot/shared/domain.ts'
import { isRecommended } from '@autopilot/shared/domain.ts'
import type { LanguageCode } from '@autopilot/shared/locale.ts'

import { crawlSite, type CrawlResult, type CrawledPage } from '@autopilot/crawler/crawler.ts'
import type { TechnicalFinding } from '@autopilot/crawler/audit.ts'
import { registrableDomain } from '@autopilot/crawler/ssrf.ts'
import type { safeFetch } from '@autopilot/crawler/safe-fetch.ts'

import { extractFacts, findConflicts, type CandidateFact } from '@autopilot/knowledge/facts.ts'
import { buildEntity, type EntityProfile } from '@autopilot/knowledge/entity.ts'
import { findAttributeEvidence, attributeLabel } from '@autopilot/knowledge/attributes.ts'
import {
  analyzeGaps,
  attributeMatchScore,
  computeEvidenceStrength,
  type AttributeEvidence,
  type EvidenceGap,
} from '@autopilot/knowledge/evidence.ts'

import { attributeDemand, generatePrompts, type GeneratedPrompt } from '@autopilot/prompts/generator.ts'
import { inferVertical } from '@autopilot/prompts/verticals.ts'

import { runPrompts, type RunSummary } from '@autopilot/measurement/runner.ts'
import { createProviderRegistry } from '@autopilot/providers/registry.ts'
import { CostLedger } from '@autopilot/providers/cost.ts'

import { calculateAirs, calculateShare, type AirsObservation, type AirsResult } from '@autopilot/scoring/airs.ts'
import { diagnose, type Diagnosis, type PromptOutcome } from '@autopilot/optimization/diagnosis.ts'
import { buildPlaybook, type Playbook } from '@autopilot/insights/playbook.ts'

/** Bumped whenever the readiness formula changes, so two scores are never compared blind. */
export const READINESS_FORMULA_VERSION = 'readiness-v1'

/**
 * What the readiness score is made of.
 *
 * Deliberately only three components, each one measured directly from the site during
 * this scan. It is a measure of whether a business is *findable and describable* by an AI
 * assistant — not a prediction that it will be recommended, which nothing computed from a
 * website alone can honestly claim.
 */
export const READINESS_WEIGHTS = {
  technicalDiscoverability: 0.3,
  informationCompleteness: 0.4,
  attributeCoverage: 0.3,
} as const

export type ReadinessComponent = keyof typeof READINESS_WEIGHTS

export interface ReadinessResult {
  readonly version: string
  /** 0..100, rounded. */
  readonly score: number
  readonly components: Readonly<Record<ReadinessComponent, { value: number; weight: number; contribution: number }>>
  readonly disclosure: string
}

export type SkipReason =
  | 'NO_PROVIDER_KEY'
  | 'MOCK_PROVIDERS_CONFIGURED'
  | 'NOT_REQUESTED'
  | 'NO_CITY_KNOWN'
  | 'NO_BUSINESS_NAME'

export interface AiVisibility {
  readonly engines: readonly string[]
  readonly promptsRun: number
  readonly promptsFailed: number
  /** Share of executed prompts where the business was recommended. */
  readonly recommendationRate: number
  readonly airs: AirsResult
  readonly share: ReturnType<typeof calculateShare>
  readonly competitors: readonly { name: string; appearances: number }[]
  readonly costMinor: number
  readonly stoppedBecause: RunSummary['stoppedBecause']
  readonly examples: readonly {
    readonly question: string
    readonly language: string
    readonly engine: string
    readonly recommended: boolean
    readonly position: number | null
    readonly competitorsAhead: readonly string[]
  }[]
}

export interface ScanOptions {
  readonly url: string
  readonly language?: 'he' | 'en'
  /** Overrides the vertical inferred from the site. */
  readonly vertical?: string
  /** Overrides the city read from the site. */
  readonly city?: string
  /** Overrides the business name read from the site. */
  readonly businessName?: string
  readonly maxPages?: number
  readonly maxPrompts?: number
  /** Ceiling for the AI half, in agorot. */
  readonly maxSpendMinor?: number
  /** Default: measure only when a real provider key is configured. Never simulates. */
  readonly measureAi?: boolean
  readonly env?: Env
  readonly logger?: Logger
  readonly clock?: Clock
  /** Integration-test seam: a local fixture server on 127.0.0.1. Never in production. */
  readonly allowPrivateHosts?: boolean
  readonly fetcher?: typeof safeFetch
}

export interface SkipDetail {
  readonly he: string
  readonly en: string
}

export interface ScanReport {
  readonly scannedAt: Date
  readonly requestedUrl: string
  readonly businessId: BusinessId
  readonly language: 'he' | 'en'

  readonly crawl: {
    readonly pagesFetched: number
    readonly pageUrls: readonly string[]
    readonly robotsTxtFound: boolean
    readonly sitemapFound: boolean
    readonly discoverability: number
    readonly stoppedBecause: CrawlResult['stoppedBecause']
    readonly errors: CrawlResult['errors']
    readonly durationMs: number
  }

  readonly business: {
    readonly name: string | null
    readonly city: string | null
    readonly phone: string | null
    readonly address: string | null
    readonly entityType: string
    readonly vertical: string
    readonly verticalSource: 'INFERRED' | 'SUPPLIED'
    readonly completeness: number
    readonly missingFields: readonly string[]
    readonly statedAttributes: readonly string[]
  }

  readonly facts: readonly CandidateFact[]
  readonly conflicts: ReturnType<typeof findConflicts>
  readonly findings: readonly TechnicalFinding[]
  readonly gaps: readonly EvidenceGap[]
  readonly prompts: readonly GeneratedPrompt[]

  /** Null whenever the AI half was not genuinely measured. Never a simulation. */
  readonly aiVisibility: AiVisibility | null
  readonly aiVisibilitySkipped: { readonly reason: SkipReason; readonly detail: SkipDetail } | null

  readonly readiness: ReadinessResult
  readonly diagnosis: Diagnosis
  readonly playbook: Playbook
}

/* ------------------------------------------------------------------ helpers --- */

const pageText = (page: CrawledPage): string =>
  [page.title ?? '', page.metaDescription ?? '', page.headings.map((h) => h.text).join(' '), page.bodyText]
    .join(' ')
    .slice(0, 60_000)

/**
 * What the site itself claims about the business, as evidence strengths.
 *
 * Only the customer's own pages feed this, and nothing is marked owner-confirmed: at scan
 * time nobody has confirmed anything, and treating a phrase found on a page as a confirmed
 * fact is how a system ends up publishing a claim its customer never made.
 */
const evidenceFromSite = (
  pages: readonly CrawledPage[],
  vertical: string,
): Map<string, AttributeEvidence> => {
  const byAttribute = new Map<string, { url: string; confidence: ConfidenceLevel }[]>()

  for (const page of pages) {
    for (const match of findAttributeEvidence(pageText(page), vertical)) {
      const entries = byAttribute.get(match.key) ?? []
      entries.push({ url: page.url, confidence: match.occurrences >= 2 ? 'MEDIUM' : 'LOW' })
      byAttribute.set(match.key, entries)
    }
  }

  const evidence = new Map<string, AttributeEvidence>()
  for (const [key, entries] of byAttribute) {
    const strength = computeEvidenceStrength(
      entries.map((e) => ({
        attributeKey: key,
        confidence: e.confidence,
        sourceUrl: e.url,
        ownWebsite: true,
        ownerConfirmed: false,
      })),
    )
    if (strength) evidence.set(key, strength)
  }
  return evidence
}

/** Page types a vertical's customers expect to exist, and which of them are absent. */
const missingPageTypes = (pages: readonly CrawledPage[]): string[] => {
  const present = new Set(pages.map((p) => p.pageType))
  return ['home', 'contact', 'about', 'services'].filter((t) => !present.has(t))
}

const computeReadiness = (input: {
  technicalDiscoverability: number
  informationCompleteness: number
  attributeCoverage: number
}): ReadinessResult => {
  const components = {} as Record<
    ReadinessComponent,
    { value: number; weight: number; contribution: number }
  >
  let total = 0
  for (const key of Object.keys(READINESS_WEIGHTS) as ReadinessComponent[]) {
    const value = Math.max(0, Math.min(1, input[key]))
    const weight = READINESS_WEIGHTS[key]
    const contribution = value * weight
    components[key] = { value, weight, contribution }
    total += contribution
  }
  return {
    version: READINESS_FORMULA_VERSION,
    score: Math.round(total * 100),
    components,
    disclosure:
      'Site readiness measures whether an AI assistant can find, read and correctly ' +
      'describe this business from its own website. It is not a measurement of whether ' +
      'any assistant recommends it, and it is not a prediction that one will.',
  }
}

const toObservations = (summary: RunSummary): AirsObservation[] =>
  summary.results.map((r) => ({
    promptId: r.promptId,
    provider: r.provider,
    language: r.prompt.language,
    classification: r.evaluation.classification,
    sourceType: r.sourceType,
    citationReferencesBusiness: r.citations.some((c) => c.referencesBusiness),
    accuracy: r.accuracy.accuracy,
    accurate: r.accuracy.accuracy === 'UNKNOWN' ? null : r.accuracy.accuracy === 'CORRECT',
    competitorRecommended: r.evaluation.competitorsAhead.length > 0,
  })) as AirsObservation[]

/* --------------------------------------------------------------------- scan --- */

export const scanBusiness = async (options: ScanOptions): Promise<ScanReport> => {
  const clock = options.clock ?? systemClock
  const logger = options.logger ?? noopLogger
  const language = options.language ?? 'he'
  const env = options.env ?? loadEnv()
  const businessId = newId<'BusinessId'>()
  const started = clock.now()

  /* ------------------------------------------------------------ 1. crawl ----- */
  const allowPrivate = options.allowPrivateHosts ?? env.CRAWLER_ALLOW_PRIVATE_HOSTS
  // A fixture server gets an ephemeral port, which the production port allowlist rightly
  // refuses. Widening it for that one port, and only when private hosts are already
  // permitted, keeps the test seam narrow instead of loosening the policy everywhere.
  const requested = new URL(options.url)
  const requestedPort = Number(requested.port || (requested.protocol === 'https:' ? 443 : 80))
  const allowedPorts = allowPrivate ? [80, 443, 8080, 8443, requestedPort] : [80, 443, 8080, 8443]

  const crawl = await crawlSite(options.url, {
    maxPages: options.maxPages ?? 25,
    respectRobots: true,
    userAgent: env.CRAWLER_USER_AGENT,
    timeoutMs: env.CRAWLER_TIMEOUT_MS,
    maxBytes: env.CRAWLER_MAX_BYTES,
    logger,
    fetcher: options.fetcher,
    policy: {
      allowedSchemes: ['http:', 'https:'],
      allowedPorts,
      allowPrivateHosts: allowPrivate,
      maxRedirects: 5,
      blockedHostnames: allowPrivate
        ? []
        : ['localhost', 'metadata.google.internal', 'metadata.goog', 'instance-data', 'metadata'],
    },
  })

  /* ---------------------------------------------- 2. facts and identity ----- */
  // The vertical decides which questions get asked and which attributes matter, so it is
  // established from the site before anything depends on it.
  const siteText = crawl.pages.map(pageText).join(' ').slice(0, 200_000)
  const provisional = extractFacts({ crawl, vertical: 'other' })
  const provisionalEntity = buildEntity(provisional, 'other')
  const vertical = options.vertical ?? inferVertical(provisionalEntity.entityType, siteText)

  const facts = extractFacts({ crawl, vertical })
  const entity = buildEntity(facts, vertical)
  const conflicts = findConflicts(facts)

  const name = options.businessName ?? entity.canonicalName
  const city = options.city ?? entity.city

  /* --------------------------------------------------- 3. what to ask ------- */
  // No city means no honest local question to ask: "a dentist in ?" is not a question a
  // customer types. That absence is itself one of the strongest findings a scan produces,
  // so it is reported rather than papered over with a guessed location.
  // Which languages we can ask in is decided by which languages we can name the city in.
  // Asking "Where should I go in פתח תקווה for a toothache?" measures a question with no
  // demand behind it, so English is dropped unless we know the city's English name.
  const cityNames: Partial<Record<LanguageCode, string>> = {}
  const languages: LanguageCode[] = []
  if (city) {
    const hebrewCity = containsHebrew(city)
    const english = hebrewCity ? englishCityName(city) : city
    if (hebrewCity) {
      cityNames.he = city
      languages.push('he')
    }
    if (english) {
      cityNames.en = english
      languages.push('en')
    }
  }

  const prompts =
    city && name && languages.length > 0
      ? generatePrompts({
          businessId,
          vertical,
          city,
          country: 'IL',
          languages,
          cityNames,
          maxPrompts: options.maxPrompts ?? 40,
        })
      : []

  const demand = attributeDemand(prompts)
  const ourEvidence = evidenceFromSite(crawl.pages, vertical)
  const gaps = analyzeGaps({
    ourEvidence,
    // Competitor evidence comes from measuring real answers. With no measurement there is
    // none, and inventing a competitor to compare against would be a fabrication.
    competitorEvidence: [],
    promptDemand: demand,
    language,
  })

  /* ------------------------------------------------- 4. AI measurement ------ */
  let aiVisibility: AiVisibility | null = null
  let skipped: { reason: SkipReason; detail: SkipDetail } | null = null
  // Outcomes exist only where a real answer was read. They stay empty on an unmeasured
  // scan, which makes the diagnosis site-only — honest, and still substantial.
  let outcomes: readonly PromptOutcome[] = []

  const realProviders = configuredProviders(env)
  const wantsAi = options.measureAi ?? realProviders.length > 0

  if (!wantsAi) {
    skipped = {
      reason: 'NOT_REQUESTED',
      detail: {
        he: 'מדידת הנוכחות בתשובות AI לא התבקשה בהרצה הזו.',
        en: 'AI visibility measurement was not requested for this run.',
      },
    }
  } else if (env.USE_MOCK_PROVIDERS) {
    skipped = {
      reason: 'MOCK_PROVIDERS_CONFIGURED',
      detail: {
        he:
          'המשתנה USE_MOCK_PROVIDERS מופעל. תשובות מדומות לעולם לא מדווחות כמדידה. ' +
          'כבו אותו וספקו מפתח אמיתי של ספק.',
        en:
          'USE_MOCK_PROVIDERS is set. Simulated answers are never reported as a measurement; ' +
          'unset it and supply a real provider key.',
      },
    }
  } else if (realProviders.length === 0) {
    skipped = {
      reason: 'NO_PROVIDER_KEY',
      detail: {
        he:
          'לא הוגדר ANTHROPIC_API_KEY, OPENAI_API_KEY או GEMINI_API_KEY, ולכן שום עוזר AI ' +
          'לא נשאל בפועל. שום דבר לא הוערך במקום זה.',
        en:
          'No ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY is configured, so no AI ' +
          'assistant was actually asked. Nothing is estimated in its place.',
      },
    }
  } else if (!name) {
    skipped = {
      reason: 'NO_BUSINESS_NAME',
      detail: {
        he:
          'האתר לא מציין את שם העסק בשום מקום שאפשר לקרוא, ולכן לא היינו מזהים תשובה ' +
          'שמזכירה אתכם. זה הדבר הראשון לתקן, והוא מופיע בממצאים למטה.',
        en:
          'The site never states the business name in a readable place, so an answer naming ' +
          'it could not be recognised. Fix that first; it is the top finding below.',
      },
    }
  } else if (!city) {
    skipped = {
      reason: 'NO_CITY_KNOWN',
      detail: {
        he:
          'האתר לא מציין באיזו עיר העסק פועל, ולכן אין שאלה מקומית אמיתית לשאול. ' +
          'זה הדבר הראשון לתקן, והוא מופיע בממצאים למטה.',
        en:
          'The site never states which city the business serves, so there is no local ' +
          'question to ask. Fix that first; it is the top finding below.',
      },
    }
  } else {
    const ledger = new CostLedger()
    const registry = createProviderRegistry({ env, ledger, logger })
    // Belt and braces: the registry decides mock vs real, and a simulated registry must
    // never reach the reporting path regardless of how it was configured.
    if (registry.simulated) {
      skipped = {
        reason: 'MOCK_PROVIDERS_CONFIGURED',
        detail: {
          he: 'מרשם הספקים נפתר למנועים מדומים. התוצאות לא מדווחות.',
          en: 'The provider registry resolved to simulated engines; results withheld.',
        },
      }
    } else {
      const providers = [...registry.providers.values()]
      const summary = await runPrompts({
        prompts,
        providers,
        subject: { id: businessId, name, aliases: Object.values(entity.localizedNames) },
        ownDomain: registrableDomain(new URL(crawl.rootUrl).hostname),
        maxSpendMinor: options.maxSpendMinor ?? 500,
        maxDurationMs: 5 * 60 * 1000,
        logger,
        clock,
      })

      const observations = toObservations(summary)
      const counts = new Map<string, number>()
      for (const r of summary.results) {
        for (const c of r.discoveredCompetitors) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
      }

      aiVisibility = {
        engines: providers.map((p) => p.id),
        promptsRun: summary.results.length,
        promptsFailed: summary.failures.length,
        recommendationRate:
          summary.results.length === 0
            ? 0
            : summary.results.filter((r) => isRecommended(r.evaluation.classification)).length /
              summary.results.length,
        airs: calculateAirs({
          observations,
          promptSetSize: prompts.length,
          attributeMatch: attributeMatchScore(ourEvidence, demand),
          informationCompleteness: entity.completeness,
          technicalDiscoverability: crawl.discoverability,
          windowStart: started,
          windowEnd: clock.now(),
          promptSetId: `scan:${businessId}`,
          engines: providers.map((p) => p.id),
          locations: [`IL/${city}`],
        }),
        share: calculateShare(observations),
        competitors: [...counts.entries()]
          .map(([competitorName, appearances]) => ({ name: competitorName, appearances }))
          .sort((a, b) => b.appearances - a.appearances)
          .slice(0, 10),
        costMinor: summary.totalCostMinor,
        stoppedBecause: summary.stoppedBecause,
        examples: summary.results.slice(0, 8).map((r) => ({
          question: r.prompt.queryText,
          language: r.prompt.language,
          engine: r.provider,
          recommended: isRecommended(r.evaluation.classification),
          position: r.evaluation.position ?? null,
          competitorsAhead: r.evaluation.competitorsAhead,
        })),
      }

      // One outcome per prompt: a prompt lost on one engine and won on another is not
      // half-recommended, and averaging it away would hide exactly the engine-specific
      // failure the customer is paying us to find.
      const byPrompt = new Map<string, { prompt: GeneratedPrompt; recommended: boolean; competitor: boolean }>()
      for (const r of summary.results) {
        const existing = byPrompt.get(r.promptId)
        const recommended = isRecommended(r.evaluation.classification)
        const competitor = r.evaluation.competitorsAhead.length > 0
        byPrompt.set(r.promptId, {
          prompt: r.prompt,
          recommended: (existing?.recommended ?? false) || recommended,
          competitor: (existing?.competitor ?? false) || competitor,
        })
      }
      outcomes = [...byPrompt.entries()].map(([promptId, o]) => ({
        promptId,
        recommended: o.recommended,
        competitorRecommended: o.competitor,
        requiredAttributes: o.prompt.requiredAttributes,
        promptScore: o.prompt.promptScore,
        difficulty: o.prompt.difficulty,
      }))
    }
  }

  /* ---------------------------------------------------- 5. diagnosis -------- */
  const diagnosis = diagnose({
    prompts,
    outcomes,
    evidenceGaps: gaps,
    technicalFindings: crawl.findings,
    missingPageTypes: missingPageTypes(crawl.pages),
    factConflicts: conflicts.map((c) => ({ factKind: c.factKind, values: c.values })),
    vertical,
    language,
  })

  const playbook = buildPlaybook({
    vertical,
    language,
    opportunities: diagnosis.opportunities,
    businessName: name ?? undefined,
  })

  return {
    scannedAt: started,
    requestedUrl: options.url,
    businessId,
    language,
    crawl: {
      pagesFetched: crawl.pages.length,
      pageUrls: crawl.pages.map((p) => p.url),
      robotsTxtFound: crawl.robotsTxtFound,
      sitemapFound: crawl.sitemapFound,
      discoverability: crawl.discoverability,
      stoppedBecause: crawl.stoppedBecause,
      errors: crawl.errors,
      durationMs: crawl.finishedAt.getTime() - crawl.startedAt.getTime(),
    },
    business: {
      name,
      city,
      phone: entity.phone,
      address: entity.address,
      entityType: entity.entityType,
      vertical,
      verticalSource: options.vertical ? 'SUPPLIED' : 'INFERRED',
      completeness: entity.completeness,
      missingFields: entity.missingFields,
      statedAttributes: [...ourEvidence.keys()].map((k) => attributeLabel(k, language)),
    },
    facts,
    conflicts,
    findings: crawl.findings,
    gaps,
    prompts,
    aiVisibility,
    aiVisibilitySkipped: skipped,
    readiness: computeReadiness({
      technicalDiscoverability: crawl.discoverability,
      informationCompleteness: entity.completeness,
      attributeCoverage: attributeMatchScore(ourEvidence, demand),
    }),
    diagnosis,
    playbook,
  }
}

export type { EntityProfile, Playbook, Diagnosis, GeneratedPrompt, EvidenceGap, TechnicalFinding }
