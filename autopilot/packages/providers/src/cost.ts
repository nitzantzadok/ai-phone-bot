/**
 * Cost ledger and budget enforcement.
 *
 * The rule this module exists to enforce: a single tenant can never accidentally generate
 * unbounded AI spend. Budgets are checked BEFORE the call (with an estimate) and reconciled
 * AFTER it (with real usage). A call that would breach a ceiling is refused, and the job
 * ends `BUDGET_EXCEEDED` rather than quietly costing money.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import type { ProviderId } from '@autopilot/shared/domain.ts'
import type { CallMetadata, ProviderUsage } from './types.ts'

export interface CostRecord {
  readonly providerName: string
  readonly provider?: ProviderId
  readonly endpoint: string
  readonly model?: string
  readonly requestType: string
  readonly organizationId?: string
  readonly businessId?: string
  readonly jobId?: string
  readonly agentRunId?: string
  readonly promptTokens: number
  readonly completionTokens: number
  readonly searchCount: number
  readonly estimatedCostMinor: number
  readonly durationMs: number
  readonly status: 'SUCCEEDED' | 'FAILED'
  readonly errorCode?: string
  readonly at: Date
}

export interface BudgetScope {
  /** Identity of the ceiling, e.g. `org:<id>:daily` or `run:<id>`. */
  readonly key: string
  readonly limitMinor: number
  readonly alertThreshold?: number
}

export type CostSink = (record: CostRecord) => void | Promise<void>

export interface BudgetAlert {
  readonly key: string
  readonly spentMinor: number
  readonly limitMinor: number
  readonly kind: 'THRESHOLD' | 'EXCEEDED'
}

/**
 * In-memory ledger with pluggable persistence.
 *
 * Kept in memory during a run so the pre-flight check is synchronous and free; the sink
 * persists asynchronously for reporting. Budget state is reloaded from the database at
 * scope creation, so a restart does not reset a tenant's daily ceiling.
 */
export class CostLedger {
  private readonly spend = new Map<string, number>()
  private readonly scopes = new Map<string, BudgetScope>()
  private readonly alerted = new Set<string>()
  private totalUsage: ProviderUsage = { promptTokens: 0, completionTokens: 0, searchCount: 0 }
  private records: CostRecord[] = []

  constructor(
    private readonly options: {
      readonly sink?: CostSink
      readonly onAlert?: (alert: BudgetAlert) => void
      readonly clock?: Clock
      /** Keep the last N records in memory for run summaries. */
      readonly retainRecords?: number
    } = {},
  ) {}

  /** Registers a ceiling, optionally pre-loaded with spend already incurred this period. */
  addScope(scope: BudgetScope, alreadySpentMinor = 0): void {
    this.scopes.set(scope.key, scope)
    this.spend.set(scope.key, alreadySpentMinor)
  }

  removeScope(key: string): void {
    this.scopes.delete(key)
    this.spend.delete(key)
    this.alerted.delete(key)
  }

  spentOn(key: string): number {
    return this.spend.get(key) ?? 0
  }

  remainingOn(key: string): number {
    const scope = this.scopes.get(key)
    if (!scope) return Number.POSITIVE_INFINITY
    return Math.max(0, scope.limitMinor - this.spentOn(key))
  }

  /** The tightest remaining headroom across all active scopes. */
  remaining(): number {
    let min = Number.POSITIVE_INFINITY
    for (const key of this.scopes.keys()) min = Math.min(min, this.remainingOn(key))
    return min
  }

  /**
   * Pre-flight check. Throws BUDGET_EXCEEDED rather than returning false, because every
   * caller must treat this as fatal for the current unit of work — a silently skipped
   * call would produce a half-measured result that looks like a real one.
   */
  assertAffordable(estimatedMinor: number, context?: CallMetadata): void {
    for (const [key, scope] of this.scopes) {
      const spent = this.spentOn(key)
      if (spent + estimatedMinor > scope.limitMinor) {
        throw new AppError({
          code: 'BUDGET_EXCEEDED',
          message: `Budget ${key} would be exceeded: ${spent} + ${estimatedMinor} > ${scope.limitMinor}`,
          details: {
            scope: key,
            spentMinor: spent,
            estimatedMinor,
            limitMinor: scope.limitMinor,
            purpose: context?.purpose,
          },
          retryable: false,
        })
      }
    }
  }

  canAfford(estimatedMinor: number): boolean {
    try {
      this.assertAffordable(estimatedMinor)
      return true
    } catch {
      return false
    }
  }

  /** Records actual cost after a call and fires alerts when a scope crosses its threshold. */
  async record(record: Omit<CostRecord, 'at'> & { at?: Date }): Promise<void> {
    const clock = this.options.clock ?? systemClock
    const full: CostRecord = { ...record, at: record.at ?? clock.now() }

    for (const [key, scope] of this.scopes) {
      const next = this.spentOn(key) + full.estimatedCostMinor
      this.spend.set(key, next)
      const threshold = scope.alertThreshold ?? 0.8
      if (next >= scope.limitMinor) {
        this.options.onAlert?.({
          key,
          spentMinor: next,
          limitMinor: scope.limitMinor,
          kind: 'EXCEEDED',
        })
      } else if (next >= scope.limitMinor * threshold && !this.alerted.has(key)) {
        this.alerted.add(key)
        this.options.onAlert?.({
          key,
          spentMinor: next,
          limitMinor: scope.limitMinor,
          kind: 'THRESHOLD',
        })
      }
    }

    this.totalUsage = {
      promptTokens: this.totalUsage.promptTokens + full.promptTokens,
      completionTokens: this.totalUsage.completionTokens + full.completionTokens,
      searchCount: this.totalUsage.searchCount + full.searchCount,
    }

    const retain = this.options.retainRecords ?? 500
    this.records.push(full)
    if (this.records.length > retain) this.records = this.records.slice(-retain)

    await this.options.sink?.(full)
  }

  usage(): ProviderUsage {
    return this.totalUsage
  }

  totalSpentMinor(): number {
    return this.records.reduce((sum, r) => sum + r.estimatedCostMinor, 0)
  }

  recentRecords(): readonly CostRecord[] {
    return this.records
  }

  /** Per-provider breakdown, for the admin cost dashboard and run summaries. */
  breakdown(): Record<string, { calls: number; costMinor: number; tokens: number }> {
    const out: Record<string, { calls: number; costMinor: number; tokens: number }> = {}
    for (const r of this.records) {
      const entry = (out[r.providerName] ??= { calls: 0, costMinor: 0, tokens: 0 })
      entry.calls++
      entry.costMinor += r.estimatedCostMinor
      entry.tokens += r.promptTokens + r.completionTokens
    }
    return out
  }
}
