/**
 * Shared plumbing for real providers.
 *
 * Timeout, capped retry, circuit breaker, pre-flight budget check and cost recording all
 * live here so that an adapter is only ever responsible for one thing: translating between
 * our request/response types and one vendor's SDK. That keeps adapters small enough to
 * review against a changing API, which they will need to be.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import { CircuitBreaker, withRetry, withTimeout, DEFAULT_RETRY } from '@autopilot/shared/resilience.ts'
import type { ProviderId } from '@autopilot/shared/domain.ts'
import type { CostLedger } from '../cost.ts'
import { estimateCostMinor, estimateTokens, findModel, type ModelSpec } from '../pricing.ts'
import type {
  AIGenerationResult,
  AIProvider,
  GenerateRequest,
  ModelTier,
  ProviderCapabilities,
  ProviderHealth,
  ProviderUsage,
  StructuredRequest,
  StructuredResult,
} from '../types.ts'

/** What an adapter returns before cost and provenance are attached. */
export interface RawProviderResult {
  readonly text: string
  readonly citations: AIGenerationResult['citations']
  readonly searchQueries: readonly string[]
  readonly usage: ProviderUsage
  readonly finishReason?: string
}

export interface BaseProviderOptions {
  readonly ledger?: CostLedger
  readonly logger?: Logger
  readonly defaultTimeoutMs?: number
  readonly breaker?: CircuitBreaker
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly id: ProviderId
  abstract readonly capabilities: ProviderCapabilities
  readonly simulated = false

  protected readonly logger: Logger
  private readonly breaker: CircuitBreaker
  private usageTotal: ProviderUsage = { promptTokens: 0, completionTokens: 0, searchCount: 0 }

  constructor(protected readonly options: BaseProviderOptions = {}) {
    this.logger = options.logger ?? noopLogger
    this.breaker = options.breaker ?? new CircuitBreaker(this.constructor.name)
  }

  /** Adapter hook: perform the vendor call. Everything else is handled here. */
  protected abstract callGenerate(
    req: GenerateRequest,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult>

  /** Adapter hook: perform a schema-constrained vendor call. */
  protected abstract callStructured<T>(
    req: StructuredRequest<T>,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult & { value: T }>

  protected resolveModel(req: { tier?: ModelTier; search?: boolean }): ModelSpec {
    const tier: ModelTier = req.tier ?? (req.search ? 'SEARCH' : 'STANDARD')
    const spec = findModel(this.id, tier)
    if (!spec) {
      throw new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: `No model configured for ${this.id} at tier ${tier}`,
      })
    }
    return spec
  }

  async generate(req: GenerateRequest): Promise<AIGenerationResult> {
    return this.execute(req, (spec, signal) => this.callGenerate(req, spec, signal), 'generate')
  }

  async structuredGenerate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let captured: T | undefined
    const result = await this.execute(
      req,
      async (spec, signal) => {
        const raw = await this.callStructured(req, spec, signal)
        captured = raw.value
        return raw
      },
      'structured',
    )
    return { ...result, value: captured as T }
  }

  analyze(req: GenerateRequest): Promise<AIGenerationResult> {
    return this.generate({ ...req, task: 'ANALYZE' })
  }

  evaluate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    return this.structuredGenerate(req)
  }

  search(req: GenerateRequest): Promise<AIGenerationResult> {
    if (!this.capabilities.search) {
      throw new AppError({
        code: 'NOT_IMPLEMENTED',
        message: `${this.id} does not expose an official search capability`,
      })
    }
    return this.generate({ ...req, search: true })
  }

  getUsage(): ProviderUsage {
    return this.usageTotal
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now()
    try {
      await this.generate({
        prompt: 'Reply with the single word: ok',
        task: 'CLASSIFY',
        tier: 'CHEAP',
        maxOutputTokens: 8,
        metadata: { purpose: 'health-check' },
        timeoutMs: 8000,
      })
      return {
        provider: this.id,
        healthy: true,
        latencyMs: Date.now() - started,
        checkedAt: new Date(),
      }
    } catch (e) {
      return {
        provider: this.id,
        healthy: false,
        latencyMs: Date.now() - started,
        // Provider error text never reaches a customer; this is an admin-facing field.
        message: e instanceof Error ? e.message : 'unknown error',
        checkedAt: new Date(),
      }
    }
  }

  /**
   * The one place a real provider call happens.
   *
   * Order matters: budget is checked before the network call (so an over-budget tenant
   * costs nothing), and cost is recorded even when the call fails (so a failed expensive
   * call is still visible in the margin numbers).
   */
  private async execute(
    req: GenerateRequest,
    fn: (spec: ModelSpec, signal: AbortSignal) => Promise<RawProviderResult>,
    endpoint: string,
  ): Promise<AIGenerationResult> {
    const spec = this.resolveModel(req)
    const ledger = this.options.ledger

    const preflight = estimateCostMinor(spec, {
      promptTokens: estimateTokens(req.prompt) + estimateTokens(req.system ?? ''),
      completionTokens: req.maxOutputTokens ?? 800,
      searchCount: req.search ? 1 : 0,
    })
    ledger?.assertAffordable(preflight, req.metadata)

    const started = Date.now()
    try {
      const raw = await this.breaker.execute(() =>
        withRetry(
          () =>
            withTimeout(
              (signal) => fn(spec, signal),
              req.timeoutMs ?? this.options.defaultTimeoutMs ?? 60_000,
              `${this.id}.${endpoint}`,
            ),
          {
            policy: DEFAULT_RETRY,
            onRetry: (e, attempt, delayMs) =>
              this.logger.warn('provider call retrying', {
                provider: this.id,
                endpoint,
                attempt,
                delayMs,
                err: e,
              }),
          },
        ),
      )

      const costMinor = estimateCostMinor(spec, raw.usage)
      this.accumulate(raw.usage)
      await ledger?.record({
        providerName: this.id,
        provider: this.id,
        endpoint,
        model: spec.model,
        requestType: req.task,
        organizationId: req.metadata.organizationId,
        businessId: req.metadata.businessId,
        jobId: req.metadata.jobId,
        agentRunId: req.metadata.agentRunId,
        promptTokens: raw.usage.promptTokens,
        completionTokens: raw.usage.completionTokens,
        searchCount: raw.usage.searchCount,
        estimatedCostMinor: costMinor,
        durationMs: Date.now() - started,
        status: 'SUCCEEDED',
      })

      return {
        text: raw.text,
        citations: raw.citations,
        searchQueries: raw.searchQueries,
        usage: raw.usage,
        provider: this.id,
        model: spec.model,
        sourceType: req.search ? 'SEARCH_EVIDENCE' : 'OBSERVED_API',
        latencyMs: Date.now() - started,
        costMinor,
        finishReason: raw.finishReason,
      }
    } catch (e) {
      await ledger?.record({
        providerName: this.id,
        provider: this.id,
        endpoint,
        model: spec.model,
        requestType: req.task,
        organizationId: req.metadata.organizationId,
        businessId: req.metadata.businessId,
        jobId: req.metadata.jobId,
        agentRunId: req.metadata.agentRunId,
        promptTokens: 0,
        completionTokens: 0,
        searchCount: 0,
        estimatedCostMinor: 0,
        durationMs: Date.now() - started,
        status: 'FAILED',
        errorCode: e instanceof AppError ? e.code : 'PROVIDER_ERROR',
      })
      throw this.normalizeError(e)
    }
  }

  /**
   * Vendor errors are translated into our taxonomy. Raw provider messages are kept in
   * `details` for operators and never surfaced to customers.
   */
  protected normalizeError(e: unknown): AppError {
    if (e instanceof AppError) return e
    const message = e instanceof Error ? e.message : String(e)
    const status = (e as { status?: number })?.status
    if (status === 429) {
      return new AppError({
        code: 'RATE_LIMITED',
        message: `${this.id} rate limited`,
        retryable: true,
        details: { provider: this.id, providerMessage: message },
        cause: e,
      })
    }
    if (status !== undefined && status >= 500) {
      return new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: `${this.id} returned ${status}`,
        retryable: true,
        details: { provider: this.id, providerMessage: message },
        cause: e,
      })
    }
    return new AppError({
      code: 'PROVIDER_ERROR',
      message: `${this.id} call failed`,
      retryable: status === undefined,
      details: { provider: this.id, providerMessage: message, status },
      cause: e,
    })
  }

  private accumulate(usage: ProviderUsage): void {
    this.usageTotal = {
      promptTokens: this.usageTotal.promptTokens + usage.promptTokens,
      completionTokens: this.usageTotal.completionTokens + usage.completionTokens,
      searchCount: this.usageTotal.searchCount + usage.searchCount,
    }
  }
}
