/**
 * Model routing.
 *
 * Gross margin is decided here more than anywhere else in the product. The rules:
 *  - a task's tier is a property of the TASK, not of the caller's mood;
 *  - classification and extraction never reach a frontier model;
 *  - a publish check never reaches a cheap one, because the cost of a bad publish is
 *    measured in customer trust rather than agorot;
 *  - when the budget is nearly spent, routing degrades quality rather than failing —
 *    except for PUBLISH_CHECK, which fails closed instead of downgrading.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import type { ProviderId } from '@autopilot/shared/domain.ts'
import type { CostLedger } from './cost.ts'
import { estimateCostMinor, estimateTokens, findModel } from './pricing.ts'
import type { AIProvider, GenerateRequest, ModelTier, TaskType } from './types.ts'

/** The default tier for each task type. The heart of the cost strategy. */
export const TASK_TIER: Record<TaskType, ModelTier> = {
  CLASSIFY: 'CHEAP',
  EXTRACT: 'CHEAP',
  ANALYZE: 'STANDARD',
  STRATEGY: 'STRONG',
  GENERATE_CONTENT: 'STANDARD',
  PUBLISH_CHECK: 'STRONG',
  MEASURE: 'SEARCH',
}

/** Tasks that must never be silently downgraded to save money. */
const NON_DEGRADABLE: readonly TaskType[] = ['PUBLISH_CHECK']

export interface RouteDecision {
  readonly provider: AIProvider
  readonly tier: ModelTier
  readonly model: string
  readonly estimatedCostMinor: number
  readonly degraded: boolean
  readonly reason: string
}

export interface ModelRouterOptions {
  /** Preference order per tier. First healthy, capable, enabled provider wins. */
  readonly preference?: Partial<Record<ModelTier, readonly ProviderId[]>>
  readonly ledger?: CostLedger
  readonly logger?: Logger
  /** Providers disabled by feature flag or missing credentials. */
  readonly disabled?: readonly ProviderId[]
}

const DEFAULT_PREFERENCE: Record<ModelTier, readonly ProviderId[]> = {
  CHEAP: ['gemini', 'openai', 'anthropic'],
  STANDARD: ['anthropic', 'openai', 'gemini'],
  STRONG: ['anthropic', 'openai', 'gemini'],
  SEARCH: ['gemini', 'openai', 'anthropic'],
}

export class ModelRouter {
  private readonly logger: Logger

  constructor(
    private readonly providers: ReadonlyMap<ProviderId, AIProvider>,
    private readonly options: ModelRouterOptions = {},
  ) {
    this.logger = options.logger ?? noopLogger
  }

  available(): readonly ProviderId[] {
    const disabled = new Set(this.options.disabled ?? [])
    return [...this.providers.keys()].filter((id) => !disabled.has(id))
  }

  /** Every enabled provider, for measurement — visibility differs per engine by design. */
  measurementProviders(): readonly AIProvider[] {
    return this.available()
      .map((id) => this.providers.get(id))
      .filter((p): p is AIProvider => p !== undefined && p.capabilities.search)
  }

  route(req: Pick<GenerateRequest, 'task' | 'tier' | 'search' | 'prompt' | 'maxOutputTokens'>): RouteDecision {
    const requestedTier = req.tier ?? TASK_TIER[req.task]
    const budgetRemaining = this.options.ledger?.remaining() ?? Number.POSITIVE_INFINITY

    let tier = requestedTier
    let degraded = false
    let reason = `task ${req.task} maps to ${requestedTier}`

    // Degrade to protect the budget, except where correctness outranks cost.
    if (
      Number.isFinite(budgetRemaining) &&
      !NON_DEGRADABLE.includes(req.task) &&
      (tier === 'STRONG' || tier === 'STANDARD')
    ) {
      const estimate = this.estimate(tier, req)
      if (estimate > budgetRemaining * 0.5) {
        tier = tier === 'STRONG' ? 'STANDARD' : 'CHEAP'
        degraded = true
        reason = `degraded from ${requestedTier} to ${tier}: remaining budget ${budgetRemaining}`
      }
    }

    const provider = this.pickProvider(tier, req.search === true || tier === 'SEARCH')
    const spec = findModel(provider.id, tier)
    if (!spec) {
      throw new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: `No model for ${provider.id} at ${tier}`,
      })
    }

    const decision: RouteDecision = {
      provider,
      tier,
      model: spec.model,
      estimatedCostMinor: this.estimate(tier, req, provider.id),
      degraded,
      reason,
    }
    this.logger.debug('model routed', {
      task: req.task,
      tier,
      provider: provider.id,
      model: spec.model,
      degraded,
    })
    return decision
  }

  private pickProvider(tier: ModelTier, needsSearch: boolean): AIProvider {
    const disabled = new Set(this.options.disabled ?? [])
    const order = this.options.preference?.[tier] ?? DEFAULT_PREFERENCE[tier]

    for (const id of order) {
      if (disabled.has(id)) continue
      const provider = this.providers.get(id)
      if (!provider) continue
      if (needsSearch && !provider.capabilities.search) continue
      return provider
    }

    // Fallback: any enabled provider at all beats failing the job outright.
    for (const [id, provider] of this.providers) {
      if (disabled.has(id)) continue
      if (needsSearch && !provider.capabilities.search) continue
      return provider
    }

    throw new AppError({
      code: 'PROVIDER_UNAVAILABLE',
      message: `No provider available for tier ${tier}${needsSearch ? ' with search' : ''}`,
      retryable: true,
    })
  }

  private estimate(
    tier: ModelTier,
    req: Pick<GenerateRequest, 'prompt' | 'maxOutputTokens' | 'search'>,
    providerId?: ProviderId,
  ): number {
    const id = providerId ?? (this.available()[0] as ProviderId | undefined)
    if (!id) return 0
    const spec = findModel(id, tier)
    if (!spec) return 0
    return estimateCostMinor(spec, {
      promptTokens: estimateTokens(req.prompt),
      completionTokens: req.maxOutputTokens ?? 800,
      searchCount: req.search ? 1 : 0,
    })
  }
}
