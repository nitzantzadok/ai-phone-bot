/**
 * The provider seam.
 *
 * Business logic depends on these types and nothing else. No domain package may import
 * `openai`, `@google/genai` or `@anthropic-ai/sdk` — that rule is what lets a provider be
 * replaced, or a new one added, without touching the optimization engine.
 */
import type { ZodType } from 'zod'
import type { ProviderId, SourceType } from '@autopilot/shared/domain.ts'
import type { LanguageCode } from '@autopilot/shared/locale.ts'

/** Cost/capability tier. The router picks one; callers state intent, not a model name. */
export type ModelTier = 'CHEAP' | 'STANDARD' | 'STRONG' | 'SEARCH'

/**
 * What the call is for. Drives routing: classification must never reach a frontier model,
 * a final publish check must never reach a cheap one.
 */
export type TaskType =
  | 'CLASSIFY' // short label from a fixed set
  | 'EXTRACT' // pull structured data out of text
  | 'ANALYZE' // interpret evidence, moderate reasoning
  | 'STRATEGY' // multi-step diagnosis and planning
  | 'GENERATE_CONTENT' // customer-visible copy
  | 'PUBLISH_CHECK' // last gate before a change goes live
  | 'MEASURE' // the visibility query itself, as a customer would ask it

/** Location and language assumptions. Recorded with every observation — they change answers. */
export interface QueryContext {
  readonly country: string
  readonly city?: string
  readonly language: LanguageCode
  readonly locale: string
  readonly timezone: string
  readonly latitude?: string
  readonly longitude?: string
}

/** Attribution for cost accounting and audit. Every call carries it; no anonymous spend. */
export interface CallMetadata {
  readonly organizationId?: string
  readonly businessId?: string
  readonly jobId?: string
  readonly agentRunId?: string
  readonly purpose: string
}

export interface ProviderUsage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly searchCount: number
}

export const emptyUsage = (): ProviderUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  searchCount: 0,
})

export interface ProviderCitation {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly position: number
}

export interface GenerateRequest {
  readonly prompt: string
  readonly system?: string
  readonly task: TaskType
  readonly tier?: ModelTier
  readonly maxOutputTokens?: number
  readonly temperature?: number
  readonly context?: QueryContext
  /** Request official grounding/web search. Ignored by providers that cannot do it. */
  readonly search?: boolean
  readonly metadata: CallMetadata
  readonly timeoutMs?: number
}

export interface StructuredRequest<T> extends GenerateRequest {
  readonly schema: ZodType<T>
  readonly schemaName: string
}

export interface AIGenerationResult {
  readonly text: string
  readonly citations: readonly ProviderCitation[]
  /** Search queries the engine reported issuing, when the API exposes them. */
  readonly searchQueries: readonly string[]
  readonly usage: ProviderUsage
  readonly provider: ProviderId
  readonly model: string
  /**
   * Provenance. OBSERVED_API for a real call, SEARCH_EVIDENCE when grounded,
   * SYNTHETIC for a mock. Never inferred downstream — the provider states it.
   */
  readonly sourceType: SourceType
  readonly latencyMs: number
  /** Estimated cost in minor units of the platform accounting currency. */
  readonly costMinor: number
  readonly finishReason?: string
}

export interface StructuredResult<T> extends AIGenerationResult {
  readonly value: T
}

export interface ProviderHealth {
  readonly provider: ProviderId
  readonly healthy: boolean
  readonly latencyMs?: number
  readonly message?: string
  readonly checkedAt: Date
}

export interface ProviderCapabilities {
  /** Official web search / grounding is available on this provider. */
  readonly search: boolean
  /** Native structured output (JSON schema) rather than prompt-and-parse. */
  readonly structuredOutput: boolean
  readonly maxContextTokens: number
}

/**
 * Every provider implements this and nothing more. Adding a provider is writing this
 * interface once; it never requires a change anywhere else.
 */
export interface AIProvider {
  readonly id: ProviderId
  readonly capabilities: ProviderCapabilities
  /** True for mock adapters. Results are marked SYNTHETIC and excluded from real metrics. */
  readonly simulated: boolean

  generate(req: GenerateRequest): Promise<AIGenerationResult>
  structuredGenerate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
  /** Convenience wrapper over generate for interpretation tasks. */
  analyze(req: GenerateRequest): Promise<AIGenerationResult>
  /** Convenience wrapper for judgement tasks that must return a structured verdict. */
  evaluate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
  /** A grounded query — the measurement path. Throws if the provider cannot search. */
  search(req: GenerateRequest): Promise<AIGenerationResult>
  getUsage(): ProviderUsage
  healthCheck(): Promise<ProviderHealth>
}
