/**
 * The end-to-end optimization pipeline.
 *
 * This is the product's core loop, wired together for real:
 *
 *   crawl - knowledge graph - prompt universe - AI measurement - competitors - AIRS
 *     - diagnosis - agent - safe website changes - re-measure - new AIRS - experiment
 *
 * It is the vertical slice the brief asks for before any secondary UI, and it is what the
 * acceptance test drives. Everything it uses is the real implementation; only the network
 * boundary is simulated, and every observation it produces is labelled SYNTHETIC.
 */
import { systemClock, type Clock } from '@autopilot/shared/clock.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import { newId, type BusinessId } from '@autopilot/shared/ids.ts'
import { crawlSite, type CrawlResult } from '@autopilot/crawler/crawler.ts'
import { createFixtureFetcher } from '@autopilot/crawler/testing/fixture-site.ts'
import { MockAIProvider } from '@autopilot/providers/adapters/mock.ts'
import { CostLedger } from '@autopilot/providers/cost.ts'
import type { AIProvider } from '@autopilot/providers/types.ts'
import { extractFacts, findConflicts, type CandidateFact } from '@autopilot/knowledge/facts.ts'
import { buildEntity, type EntityProfile } from '@autopilot/knowledge/entity.ts'
import {
  analyzeGaps,
  attributeMatchScore,
  computeEvidenceStrength,
  type AttributeEvidence,
  type CompetitorEvidence,
  type EvidenceGap,
} from '@autopilot/knowledge/evidence.ts'
import { ATTRIBUTE_VOCABULARY, findAttributeEvidence } from '@autopilot/knowledge/attributes.ts'
import { attributeDemand, generatePrompts, type GeneratedPrompt } from '@autopilot/prompts/generator.ts'
import { getVertical } from '@autopilot/prompts/verticals.ts'
import { runPrompts, type RunSummary } from '@autopilot/measurement/runner.ts'
import { calculateAirs, calculateShare, type AirsObservation, type AirsResult } from '@autopilot/scoring/airs.ts'
import { diagnose, type Diagnosis, type PromptOutcome } from '@autopilot/optimization/diagnosis.ts'
import { planAction, type PlanningContext } from '@autopilot/optimization/actions.ts'
import type { GroundingFact } from '@autopilot/optimization/quality-gates.ts'
import type { BusinessRule } from '@autopilot/optimization/constraints.ts'
import { runAgent, type AgentRunResult } from '@autopilot/agent/runtime.ts'
import { MemoryConnector } from '@autopilot/website/connectors/memory.ts'
import { InMemoryVersionStore, applyChange } from '@autopilot/website/versioning.ts'
import {
  OWNER_CONFIRMED_ATTRIBUTES,
  ROSA_BUSINESS,
  ROSA_ORIGIN,
  buildWorld,
  initialRosaPages,
  siteFrom,
  type SitePage,
} from './fixtures/rosa.ts'

export interface PipelineOptions {
  readonly clock?: Clock
  readonly logger?: Logger
  readonly autonomyMode?: 'MONITOR' | 'RECOMMEND' | 'AUTO_SAFE' | 'AUTOPILOT'
  readonly businessRules?: readonly BusinessRule[]
  readonly maxPrompts?: number
  /** Spend ceiling for the whole run, in minor units. */
  readonly maxSpendMinor?: number
  /**
   * The language every customer-visible string comes back in.
   *
   * It was pinned to English in three places, and the sample dashboard — the one the join
   * page invites a Hebrew-speaking owner to look at before they start — came back with its
   * findings, its opportunities and its list of changes in English, reflowed under RTL into
   * sentences with the numbers on the wrong side. `diagnose` had taken a language all
   * along; nothing passed one.
   */
  readonly language?: 'he' | 'en'
}

export interface MeasurementPhase {
  readonly summary: RunSummary
  readonly observations: readonly AirsObservation[]
  readonly airs: AirsResult
  readonly share: ReturnType<typeof calculateShare>
}

export interface PipelineResult {
  readonly businessId: BusinessId
  readonly crawl: CrawlResult
  readonly facts: readonly CandidateFact[]
  readonly entity: EntityProfile
  readonly prompts: readonly GeneratedPrompt[]
  readonly before: MeasurementPhase
  readonly after: MeasurementPhase
  readonly competitors: readonly string[]
  readonly gaps: readonly EvidenceGap[]
  readonly diagnosis: Diagnosis
  readonly agentRun: AgentRunResult
  readonly pagesAfter: readonly SitePage[]
  readonly costMinor: number
}

/**
 * Runs the whole loop once.
 *
 * The sequencing matters and mirrors production: cheap deterministic work (crawl, facts,
 * gaps) happens before anything that costs money, and the agent only ever sees evidence
 * that has already been established.
 */
export const runPipeline = async (options: PipelineOptions = {}): Promise<PipelineResult> => {
  const clock = options.clock ?? systemClock
  const logger = options.logger ?? noopLogger
  const language = options.language ?? 'en'
  const businessId = newId<'BusinessId'>()
  const ledger = new CostLedger({ clock })
  if (options.maxSpendMinor) {
    ledger.addScope({ key: 'run', limitMinor: options.maxSpendMinor })
  }

  /* ---------------------------------------------------------- the website ----- */
  let pages = initialRosaPages()
  const connector = new MemoryConnector(pages)
  const versionStore = new InMemoryVersionStore()

  const crawlCurrent = async (): Promise<CrawlResult> =>
    crawlSite(`${ROSA_ORIGIN}/`, {
      fetcher: createFixtureFetcher(siteFrom(pages)),
      requestsPerSecond: 1000,
      logger,
    })

  const crawl = await crawlCurrent()

  /* ------------------------------------------------------ knowledge graph ----- */
  const facts = extractFacts({ crawl, vertical: ROSA_BUSINESS.vertical })
  // Onboarding confirmation: the owner tells us what is true of their business. These are
  // the ONLY attributes we may ever write about.
  const confirmedFacts: CandidateFact[] = [
    ...OWNER_CONFIRMED_ATTRIBUTES.map(
      (key): CandidateFact => ({
        factKind: 'attribute',
        value: key,
        attributeKey: key,
        confidence: 'HIGH',
        sourceType: 'CUSTOMER_PROVIDED',
        sourceUrl: `${ROSA_ORIGIN}/`,
        excerpt: 'Confirmed by the business owner during onboarding.',
      }),
    ),
    {
      factKind: 'phone',
      value: ROSA_BUSINESS.phone,
      confidence: 'HIGH',
      sourceType: 'CUSTOMER_PROVIDED',
      sourceUrl: `${ROSA_ORIGIN}/`,
    },
    {
      factKind: 'cuisine',
      value: ROSA_BUSINESS.cuisine,
      confidence: 'HIGH',
      sourceType: 'CUSTOMER_PROVIDED',
      sourceUrl: `${ROSA_ORIGIN}/`,
    },
    {
      factKind: 'city',
      value: ROSA_BUSINESS.city,
      confidence: 'HIGH',
      sourceType: 'CUSTOMER_PROVIDED',
      sourceUrl: `${ROSA_ORIGIN}/`,
    },
    {
      factKind: 'address',
      value: ROSA_BUSINESS.address,
      confidence: 'HIGH',
      sourceType: 'CUSTOMER_PROVIDED',
      sourceUrl: `${ROSA_ORIGIN}/`,
    },
  ]
  const allFacts = [...facts, ...confirmedFacts]
  const entity = buildEntity(allFacts, ROSA_BUSINESS.vertical)

  /* -------------------------------------------------------- prompt universe ----- */
  const prompts = generatePrompts({
    businessId,
    vertical: ROSA_BUSINESS.vertical,
    city: ROSA_BUSINESS.city,
    country: 'IL',
    languages: ['he', 'en'],
    cityNames: { he: ROSA_BUSINESS.cityHe, en: ROSA_BUSINESS.city },
    qualifiers: [ROSA_BUSINESS.cuisine],
    qualifierNames: { he: [ROSA_BUSINESS.cuisineHe], en: [ROSA_BUSINESS.cuisine] },
    confirmedAttributes: [...OWNER_CONFIRMED_ATTRIBUTES],
    maxPrompts: options.maxPrompts ?? 24,
  })

  const attributeTerms = Object.fromEntries(
    ATTRIBUTE_VOCABULARY.map((a) => [
      a.key,
      [...(a.evidenceTerms.en ?? []), ...(a.evidenceTerms.he ?? [])],
    ]),
  )

  const subject = { id: businessId, name: ROSA_BUSINESS.name, aliases: [...ROSA_BUSINESS.aliases] }

  const measure = async (label: string): Promise<MeasurementPhase> => {
    const providers = buildProviders(pages)
    const summary = await runPrompts({
      prompts,
      providers,
      subject,
      knownFacts: {
        phone: ROSA_BUSINESS.phone,
        city: ROSA_BUSINESS.city,
        cuisine: ROSA_BUSINESS.cuisine,
      },
      ownDomain: ROSA_BUSINESS.domain,
      attributeTerms,
      clock,
      logger,
      concurrency: 6,
      ...(options.maxSpendMinor ? { maxSpendMinor: options.maxSpendMinor } : {}),
    })

    // Real providers record their own cost inside BaseProvider; the simulator reports zero.
    // Recording here keeps the ledger the single source of run spend either way.
    for (const result of summary.results) {
      if (result.cacheHit) continue
      await ledger.record({
        providerName: result.provider,
        endpoint: 'search',
        model: result.model,
        requestType: 'MEASURE',
        businessId,
        promptTokens: 0,
        completionTokens: 0,
        searchCount: 1,
        estimatedCostMinor: result.costMinor,
        durationMs: result.latencyMs,
        status: 'SUCCEEDED',
      })
    }

    const observations = toObservations(summary)
    const airs = calculateAirs({
      observations,
      promptSetSize: prompts.length,
      attributeMatch: attributeMatchScore(evidenceFor(pages), attributeDemand(prompts)),
      informationCompleteness: entity.completeness,
      technicalDiscoverability: crawl.discoverability,
      windowStart: clock.now(),
      windowEnd: clock.now(),
      promptSetId: `set:${label}`,
      engines: providers.map((p) => p.id),
      locations: [`IL/${ROSA_BUSINESS.city}`],
    })

    return { summary, observations, airs, share: calculateShare(observations) }
  }

  /* ------------------------------------------------------------- measure ----- */
  const before = await measure('rosa-v1')

  const competitors = [
    ...new Set(
      before.summary.results.flatMap((r) => r.discoveredCompetitors.map((c) => c.name)),
    ),
  ]

  /* ----------------------------------------------------------- diagnosis ----- */
  const demand = attributeDemand(prompts)
  const gaps = analyzeGaps({
    ourEvidence: evidenceFor(pages),
    competitorEvidence: competitorEvidence(),
    promptDemand: demand,
    ownerConfirmedAttributes: new Set(OWNER_CONFIRMED_ATTRIBUTES),
    language,
  })

  // Diagnosis reasons about QUESTIONS, not about individual engine calls.
  //
  // Each prompt is measured on every engine, so using raw executions here would report
  // "8 of the 72 questions we monitor" against a 24-question set: a number that is both
  // wrong and impossible for a customer to reconcile with the prompt list they can see.
  // A question counts as won when a majority of the engines we measured recommended us.
  const outcomes: PromptOutcome[] = aggregateByPrompt(before.summary)

  const presentPageTypes = new Set(crawl.pages.map((p) => p.pageType))
  const diagnosis = diagnose({
    prompts,
    outcomes,
    evidenceGaps: gaps,
    technicalFindings: crawl.findings,
    missingPageTypes: getVertical(ROSA_BUSINESS.vertical).expectedPageTypes.filter(
      (t) => !presentPageTypes.has(t),
    ),
    factConflicts: findConflicts(allFacts),
    vertical: ROSA_BUSINESS.vertical,
    language,
  })

  /* --------------------------------------------------------------- agent ----- */
  const groundingFacts: GroundingFact[] = allFacts.map((f, index) => ({
    id: `fact-${index}`,
    factKind: f.factKind,
    value: f.value,
    confidence: f.confidence,
    attributeKey: f.attributeKey,
  }))

  const planningContext: PlanningContext = {
    vertical: ROSA_BUSINESS.vertical,
    businessName: ROSA_BUSINESS.name,
    city: ROSA_BUSINESS.city,
    language,
    facts: groundingFacts,
    homeUrl: `${ROSA_ORIGIN}/`,
    pages: crawl.pages.map((p) => ({ url: p.url, pageType: p.pageType, title: p.title })),
  }

  const agentRun = await runAgent({
    context: {
      organizationId: 'demo-org',
      businessId,
      vertical: ROSA_BUSINESS.vertical,
      autonomyMode: options.autonomyMode ?? 'AUTOPILOT',
      businessRules: options.businessRules ?? [],
      facts: groundingFacts,
      language,
      existingContent: pages.map((p) => p.content),
    },
    opportunities: diagnosis.opportunities,
    planner: (opportunity) => planAction(opportunity, planningContext),
    applier: async (action, autoPublish) => {
      const version = await applyChange(toChangeRequest(action), {
        connector,
        store: versionStore,
        clock,
        autoPublish,
      })
      // Reflect the applied change back into the site the crawler and the simulated
      // engines read, which is what makes the re-measurement meaningful.
      pages = await currentPages(connector)
      return { versionId: version.id, published: version.publishStatus === 'PUBLISHED' }
    },
    clock,
    logger,
  })

  /* ---------------------------------------------------------- re-measure ----- */
  pages = await currentPages(connector)
  const after = await measure('rosa-v1')

  return {
    businessId,
    crawl,
    facts: allFacts,
    entity,
    prompts,
    before,
    after,
    competitors,
    gaps,
    diagnosis,
    agentRun,
    pagesAfter: pages,
    costMinor: ledger.totalSpentMinor(),
  }
}

/* --------------------------------------------------------------- helpers ----- */

/**
 * Collapses per-engine executions into one outcome per monitored question.
 *
 * Majority rather than "any engine", because being recommended by one of three engines is
 * not winning a question; it is losing two thirds of it, and the diagnosis should say so.
 */
const aggregateByPrompt = (summary: RunSummary): PromptOutcome[] => {
  const byPrompt = new Map<string, typeof summary.results>()
  for (const result of summary.results) {
    byPrompt.set(result.promptId, [...(byPrompt.get(result.promptId) ?? []), result])
  }

  const RECOMMENDED = new Set([
    'RELEVANT_RECOMMENDATION',
    'TOP_3',
    'TOP_1',
    'STRONGLY_RECOMMENDED',
  ])

  return [...byPrompt.values()].map((results) => {
    const first = results[0]!
    const recommendedCount = results.filter((r) =>
      RECOMMENDED.has(r.evaluation.classification),
    ).length
    return {
      promptId: first.promptId,
      recommended: recommendedCount * 2 > results.length,
      competitorRecommended: results.some((r) => r.evaluation.competitorsAhead.length > 0),
      requiredAttributes: first.prompt.requiredAttributes,
      promptScore: first.prompt.promptScore,
      difficulty: first.prompt.difficulty,
    }
  })
}


const buildProviders = (pages: readonly SitePage[]): MockAIProvider[] => {
  const world = buildWorld(pages)
  return (['openai', 'gemini', 'anthropic'] as const).map(
    (id) => new MockAIProvider(id, { world }),
  )
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
    accurate:
      r.accuracy.accuracy === 'UNKNOWN'
        ? null
        : r.accuracy.accuracy === 'CORRECT',
    competitorRecommended: r.evaluation.competitorsAhead.length > 0,
  })) as AirsObservation[]

/** Our attribute evidence, derived from what the site currently says. */
const evidenceFor = (pages: readonly SitePage[]): Map<string, AttributeEvidence> => {
  const evidence = new Map<string, AttributeEvidence>()
  const byAttribute = new Map<string, { url: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }[]>()

  for (const page of pages) {
    const text = `${page.title ?? ''} ${page.metaDescription ?? ''} ${page.content.replace(/<[^>]*>/g, ' ')}`
    for (const match of findAttributeEvidence(text, 'restaurant')) {
      const entries = byAttribute.get(match.key) ?? []
      entries.push({ url: page.url, confidence: match.occurrences >= 2 ? 'MEDIUM' : 'LOW' })
      byAttribute.set(match.key, entries)
    }
  }

  for (const [key, entries] of byAttribute) {
    const computed = computeEvidenceStrength(
      entries.map((e) => ({
        attributeKey: key,
        confidence: e.confidence,
        sourceUrl: e.url,
        ownWebsite: true,
        ownerConfirmed: (OWNER_CONFIRMED_ATTRIBUTES as readonly string[]).includes(key),
      })),
    )
    if (computed) evidence.set(key, computed)
  }

  return evidence
}

/** What the competitors can demonstrate, and whether it rests on sources we cannot create. */
const competitorEvidence = (): CompetitorEvidence[] => {
  const out: CompetitorEvidence[] = []
  for (const competitor of buildWorld(initialRosaPages()).businesses) {
    if (competitor.name === 'Rosa') continue
    const externalSources = competitor.sources.filter(
      (s) => !s.url.includes(competitor.domain),
    ).length
    for (const [attributeKey, strength] of Object.entries(competitor.attributes)) {
      out.push({
        competitorId: competitor.name,
        competitorName: competitor.name,
        attributeKey,
        strength,
        distinctSourceCount: competitor.sources.length,
        externalSources: externalSources >= 2,
      })
    }
  }
  return out
}

const currentPages = async (connector: MemoryConnector): Promise<SitePage[]> => {
  const remote = await connector.listPages()
  return remote.map((p) => ({
    url: p.url,
    title: p.title,
    metaDescription: p.metaDescription,
    lang: p.lang,
    canonical: p.canonical,
    content: p.content,
    structuredData: p.structuredData as Record<string, unknown>[],
  }))
}

const toChangeRequest = (action: {
  actionType: string
  targetUrl: string | null
  summary: string
  rationale: string
  payload: Record<string, unknown>
}) => {
  const url = action.targetUrl ?? `${ROSA_ORIGIN}/`
  const base = { url, reason: action.rationale, hypothesis: action.summary }

  switch (action.actionType) {
    case 'FIX_METADATA':
      return {
        ...base,
        changeTarget: 'METADATA' as const,
        metadata: {
          title: action.payload.title as string | undefined,
          metaDescription: action.payload.metaDescription as string | undefined,
        },
      }
    case 'FIX_CANONICAL':
      return { ...base, changeTarget: 'METADATA' as const, metadata: { canonical: url } }
    case 'FIX_LANG_ATTRIBUTE':
      return {
        ...base,
        changeTarget: 'METADATA' as const,
        metadata: { lang: (action.payload.lang as string | undefined) ?? 'en' },
      }
    case 'ADD_SCHEMA':
      return {
        ...base,
        changeTarget: 'SCHEMA' as const,
        schema: action.payload.structuredData as Record<string, unknown>,
      }
    case 'ADD_SITEMAP':
      return {
        ...base,
        changeTarget: 'TECHNICAL' as const,
        sitemapUrls: action.payload.urls as string[],
      }
    case 'ADD_CONTENT_SECTION':
      return {
        ...base,
        changeTarget: 'CONTENT' as const,
        content: {
          heading: action.payload.heading as string,
          body: action.payload.body as string,
        },
      }
    case 'CREATE_PAGE':
      // Must create rather than edit: the page does not exist yet, and an edit would fail
      // with NOT_FOUND against a URL nothing serves.
      return {
        ...base,
        changeTarget: 'PAGE' as const,
        newPage: {
          title: action.summary,
          content: action.rationale,
          lang: 'en',
        },
      }
    default:
      return { ...base, changeTarget: 'CONTENT' as const, content: { heading: action.summary, body: action.rationale } }
  }
}

export type { AIProvider }
