/**
 * Prompt execution.
 *
 * Where the measurement budget is actually spent, so this is where the cost controls live:
 * a deduplication window that reuses a recent identical execution, a hard per-run spend
 * ceiling enforced before each call, bounded concurrency, and a stop rather than a
 * degraded half-measurement when the budget runs out.
 *
 * Every result records the engine, model, location, language and provenance it was
 * produced under, because an AIRS compared across different assumptions is meaningless.
 */
import { AppError, isAppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import type { SourceType } from '@autopilot/shared/domain.ts'
import type { AIProvider, QueryContext } from '@autopilot/providers/types.ts'
import type { GeneratedPrompt } from '@autopilot/prompts/generator.ts'
import { analyzeCitations, type AnalyzedCitation } from './citations.ts'
import {
  checkAccuracy,
  discoverCompetitors,
  evaluateResponse,
  type EvaluationSubject,
  type ResponseEvaluation,
} from './evaluator.ts'

export interface ExecutionResult {
  readonly promptId: string
  readonly prompt: GeneratedPrompt
  readonly provider: string
  readonly model: string
  readonly sourceType: SourceType
  readonly searchEnabled: boolean
  readonly context: QueryContext
  readonly responseText: string
  readonly searchQueries: readonly string[]
  readonly citations: readonly AnalyzedCitation[]
  readonly evaluation: ResponseEvaluation
  readonly accuracy: ReturnType<typeof checkAccuracy>
  readonly discoveredCompetitors: readonly { name: string; position: number; recommended: boolean }[]
  readonly costMinor: number
  readonly latencyMs: number
  readonly cacheHit: boolean
  readonly executedAt: Date
}

export interface ExecutionFailure {
  readonly promptId: string
  readonly provider: string
  readonly code: string
  readonly message: string
}

export interface RunSummary {
  readonly results: readonly ExecutionResult[]
  readonly failures: readonly ExecutionFailure[]
  readonly totalCostMinor: number
  readonly executed: number
  readonly cacheHits: number
  readonly stoppedBecause: 'COMPLETE' | 'BUDGET' | 'TIME' | 'CANCELLED'
}

/** Reuse of a recent identical execution. The cheapest call is the one we do not make. */
export interface ExecutionCache {
  get(key: string): Promise<ExecutionResult | null>
  set(key: string, result: ExecutionResult): Promise<void>
}

export class InMemoryExecutionCache implements ExecutionCache {
  private readonly entries = new Map<string, { result: ExecutionResult; expiresAt: number }>()

  constructor(
    private readonly ttlMs = 6 * 60 * 60 * 1000,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(key: string): Promise<ExecutionResult | null> {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.clock.timestamp()) {
      this.entries.delete(key)
      return null
    }
    return entry.result
  }

  async set(key: string, result: ExecutionResult): Promise<void> {
    this.entries.set(key, { result, expiresAt: this.clock.timestamp() + this.ttlMs })
  }
}

export const cacheKey = (
  prompt: GeneratedPrompt,
  provider: string,
  model: string,
  context: QueryContext,
): string =>
  [prompt.id, provider, model, context.locale, context.city ?? '', context.country].join('|')

export interface RunOptions {
  readonly prompts: readonly GeneratedPrompt[]
  readonly providers: readonly AIProvider[]
  readonly subject: EvaluationSubject
  readonly knownCompetitors?: readonly EvaluationSubject[]
  readonly knownFacts?: Readonly<Record<string, string>>
  readonly ownDomain?: string | null
  readonly attributeTerms?: Readonly<Record<string, readonly string[]>>
  readonly timezone?: string
  /** Hard ceiling in minor units. Execution stops rather than exceeding it. */
  readonly maxSpendMinor?: number
  readonly maxDurationMs?: number
  readonly concurrency?: number
  readonly cache?: ExecutionCache
  readonly logger?: Logger
  readonly clock?: Clock
  readonly signal?: AbortSignal
  readonly onResult?: (result: ExecutionResult) => void | Promise<void>
}

const SYSTEM_PROMPT =
  'You are helping a person choose a local business. Answer the way you normally would: ' +
  'name specific businesses, in order of how strongly you would recommend them, with a ' +
  'short reason for each.'

export const runPrompts = async (options: RunOptions): Promise<RunSummary> => {
  const logger = options.logger ?? noopLogger
  const clock = options.clock ?? systemClock
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const deadline = clock.timestamp() + (options.maxDurationMs ?? 5 * 60 * 1000)
  const maxSpend = options.maxSpendMinor ?? Number.POSITIVE_INFINITY

  const results: ExecutionResult[] = []
  const failures: ExecutionFailure[] = []
  let totalCostMinor = 0
  let cacheHits = 0
  let stoppedBecause: RunSummary['stoppedBecause'] = 'COMPLETE'

  // One unit of work per (prompt, engine): visibility genuinely differs per engine, so
  // measuring one and extrapolating would be a fabrication.
  const units = options.prompts.flatMap((prompt) =>
    options.providers.map((provider) => ({ prompt, provider })),
  )

  const execute = async (unit: { prompt: GeneratedPrompt; provider: AIProvider }): Promise<void> => {
    const { prompt, provider } = unit
    const context: QueryContext = {
      country: prompt.country,
      city: prompt.city ?? undefined,
      language: prompt.language,
      locale: prompt.locale,
      timezone: options.timezone ?? 'Asia/Jerusalem',
    }

    const key = cacheKey(prompt, provider.id, 'auto', context)
    const cached = await options.cache?.get(key)
    if (cached) {
      cacheHits++
      const hit = { ...cached, cacheHit: true }
      results.push(hit)
      await options.onResult?.(hit)
      return
    }

    try {
      const response = await provider.search({
        prompt: prompt.queryText,
        system: SYSTEM_PROMPT,
        task: 'MEASURE',
        tier: 'SEARCH',
        context,
        search: true,
        metadata: { purpose: 'visibility-measurement' },
      })

      const evaluation = evaluateResponse({
        responseText: response.text,
        subject: options.subject,
        requiredAttributes: prompt.requiredAttributes,
        attributeTerms: options.attributeTerms,
      })

      const result: ExecutionResult = {
        promptId: prompt.id,
        prompt,
        provider: provider.id,
        model: response.model,
        sourceType: response.sourceType,
        searchEnabled: true,
        context,
        responseText: response.text,
        searchQueries: response.searchQueries,
        citations: analyzeCitations({
          citations: response.citations,
          ownDomain: options.ownDomain ?? null,
          businessNames: [options.subject.name, ...(options.subject.aliases ?? [])],
          competitorNames: (options.knownCompetitors ?? []).map((c) => c.name),
        }),
        evaluation,
        accuracy: checkAccuracy({
          responseText: response.text,
          subject: options.subject,
          knownFacts: options.knownFacts ?? {},
        }),
        discoveredCompetitors: discoverCompetitors(
          evaluation,
          options.subject,
          options.knownCompetitors ?? [],
        ),
        costMinor: response.costMinor,
        latencyMs: response.latencyMs,
        cacheHit: false,
        executedAt: clock.now(),
      }

      totalCostMinor += response.costMinor
      results.push(result)
      await options.cache?.set(key, result)
      await options.onResult?.(result)
    } catch (e) {
      const code = isAppError(e) ? e.code : 'PROVIDER_ERROR'
      failures.push({
        promptId: prompt.id,
        provider: provider.id,
        code,
        message: e instanceof Error ? e.message : String(e),
      })
      logger.warn('prompt execution failed', { promptId: prompt.id, provider: provider.id, code })
      // A budget breach ends the whole run: continuing would produce a partial measurement
      // that looks complete.
      if (isAppError(e) && e.code === 'BUDGET_EXCEEDED') throw e
    }
  }

  try {
    for (let i = 0; i < units.length; i += concurrency) {
      if (options.signal?.aborted) {
        stoppedBecause = 'CANCELLED'
        break
      }
      if (clock.timestamp() > deadline) {
        stoppedBecause = 'TIME'
        break
      }
      if (totalCostMinor >= maxSpend) {
        stoppedBecause = 'BUDGET'
        break
      }
      await Promise.all(units.slice(i, i + concurrency).map(execute))
    }
  } catch (e) {
    if (isAppError(e) && e.code === 'BUDGET_EXCEEDED') stoppedBecause = 'BUDGET'
    else throw e
  }

  return {
    results,
    failures,
    totalCostMinor,
    executed: results.filter((r) => !r.cacheHit).length,
    cacheHits,
    stoppedBecause,
  }
}

/** Guard: refuses to treat simulated output as a real measurement. */
export const assertRealObservations = (summary: RunSummary): void => {
  const synthetic = summary.results.filter((r) => r.sourceType === 'SYNTHETIC')
  if (synthetic.length > 0) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: `${synthetic.length} of ${summary.results.length} observations are SYNTHETIC and cannot be reported as real AI behaviour`,
      details: { syntheticCount: synthetic.length },
    })
  }
}
