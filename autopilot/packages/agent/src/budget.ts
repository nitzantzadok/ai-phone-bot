/**
 * Agent execution bounds.
 *
 * The single most important safety property of an autonomous system that spends money and
 * edits customer websites: it must be impossible for a run to continue indefinitely, cost
 * indefinitely, or publish indefinitely.
 *
 * Every limit is checked BEFORE a step and re-checked AFTER it. Checking only before lets a
 * single expensive step blow through a ceiling; checking only after lets it happen at all.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'

export interface AgentLimits {
  readonly maxIterations: number
  readonly maxToolCalls: number
  readonly maxSpendMinor: number
  readonly maxTokens: number
  readonly maxWallClockMs: number
  /** Hard ceiling on writes to customer properties in one run. */
  readonly maxPublishOperations: number
}

/**
 * Calibrated so that one ordinary optimization cycle completes rather than tripping a
 * ceiling, while every runaway is still caught.
 *
 * An iteration is one opportunity considered, and considering one is nearly free — planning
 * is deterministic — so the iteration ceiling is generous. The ceilings that actually
 * protect the customer and the margin are spend and publish operations, and those stay
 * tight: a first onboarding cycle legitimately makes a handful of technical fixes, but an
 * agent trying to make thirty changes at once has misunderstood something, and finding that
 * out slowly is cheap.
 */
export const DEFAULT_LIMITS: AgentLimits = {
  maxIterations: 25,
  maxToolCalls: 60,
  maxSpendMinor: 1_500,
  maxTokens: 400_000,
  maxWallClockMs: 10 * 60 * 1000,
  maxPublishOperations: 12,
}

export type StopReason =
  | 'COMPLETED'
  | 'NO_WORK'
  | 'MAX_ITERATIONS'
  | 'MAX_TOOL_CALLS'
  | 'MAX_SPEND'
  | 'MAX_TOKENS'
  | 'MAX_TIME'
  | 'MAX_PUBLISHES'
  | 'CANCELLED'
  | 'ERROR'

export interface BudgetUsage {
  iterations: number
  toolCalls: number
  spendMinor: number
  tokens: number
  publishOperations: number
}

/**
 * Tracks consumption against the limits.
 *
 * `check` returns a stop reason rather than throwing, because hitting a limit is a normal,
 * expected way for a run to end and should be reported as such — not as a failure.
 */
export class AgentBudget {
  readonly usage: BudgetUsage = {
    iterations: 0,
    toolCalls: 0,
    spendMinor: 0,
    tokens: 0,
    publishOperations: 0,
  }
  private readonly startedAt: number

  constructor(
    readonly limits: AgentLimits = DEFAULT_LIMITS,
    private readonly clock: Clock = systemClock,
  ) {
    this.startedAt = clock.timestamp()
  }

  elapsedMs(): number {
    return this.clock.timestamp() - this.startedAt
  }

  /** Returns a stop reason if any ceiling has been reached, otherwise null. */
  check(): StopReason | null {
    if (this.usage.iterations >= this.limits.maxIterations) return 'MAX_ITERATIONS'
    if (this.usage.toolCalls >= this.limits.maxToolCalls) return 'MAX_TOOL_CALLS'
    if (this.usage.spendMinor >= this.limits.maxSpendMinor) return 'MAX_SPEND'
    if (this.usage.tokens >= this.limits.maxTokens) return 'MAX_TOKENS'
    if (this.elapsedMs() >= this.limits.maxWallClockMs) return 'MAX_TIME'
    if (this.usage.publishOperations >= this.limits.maxPublishOperations) return 'MAX_PUBLISHES'
    return null
  }

  /** Pre-flight for one step, given what it is expected to consume. */
  canAfford(estimate: { spendMinor?: number; tokens?: number; publishes?: number }): StopReason | null {
    const existing = this.check()
    if (existing) return existing
    if (this.usage.spendMinor + (estimate.spendMinor ?? 0) > this.limits.maxSpendMinor) {
      return 'MAX_SPEND'
    }
    if (this.usage.tokens + (estimate.tokens ?? 0) > this.limits.maxTokens) return 'MAX_TOKENS'
    if (
      this.usage.publishOperations + (estimate.publishes ?? 0) >
      this.limits.maxPublishOperations
    ) {
      return 'MAX_PUBLISHES'
    }
    return null
  }

  startIteration(): void {
    this.usage.iterations++
  }

  recordToolCall(cost: { spendMinor?: number; tokens?: number; published?: boolean }): void {
    this.usage.toolCalls++
    this.usage.spendMinor += cost.spendMinor ?? 0
    this.usage.tokens += cost.tokens ?? 0
    if (cost.published) this.usage.publishOperations++
  }

  /** For the run summary and the admin cost dashboard. */
  snapshot(): BudgetUsage & { elapsedMs: number } {
    return { ...this.usage, elapsedMs: this.elapsedMs() }
  }
}

export const limitReachedError = (reason: StopReason): AppError =>
  new AppError({
    code: 'AGENT_LIMIT_REACHED',
    message: `Agent run stopped: ${reason}`,
    publicMessage:
      'The optimization run reached its safety limit and stopped. Nothing was left half-applied.',
    details: { reason },
  })
