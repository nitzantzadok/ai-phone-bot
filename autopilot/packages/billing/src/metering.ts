/**
 * Usage metering and quota enforcement.
 *
 * The margin guardrail. Every metered operation checks here first, and the answer is
 * binding: over quota means the operation does not run. Soft limits that only produce a
 * warning are how a SaaS discovers, at the end of the month, that one customer consumed
 * the profit from thirty others.
 *
 * Three ceilings, all enforced: the plan's monthly allowance, an hourly burst cap, and an
 * absolute monthly spend cap in money rather than units.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import { getPlan, type PlanCode, type UsageMetric } from './plans.ts'

export interface UsageWindow {
  readonly monthStart: Date
  readonly hourStart: Date
}

export interface UsageSnapshot {
  /** Consumption this billing month, per metric. */
  readonly monthly: Readonly<Partial<Record<UsageMetric, number>>>
  /** Executions in the current hour, for burst protection. */
  readonly hourlyExecutions: number
  /** AI and search spend this month, in minor units. */
  readonly monthlySpendMinor: number
}

export interface QuotaDecision {
  readonly allowed: boolean
  readonly remaining: number
  readonly limit: number
  readonly reason: string
  /** Which ceiling bound the decision. Useful for the admin cost dashboard. */
  readonly boundBy: 'MONTHLY_UNITS' | 'HOURLY_BURST' | 'MONTHLY_SPEND' | 'NONE'
}

export const checkQuota = (
  planCode: PlanCode,
  metric: UsageMetric,
  requested: number,
  usage: UsageSnapshot,
): QuotaDecision => {
  const limits = getPlan(planCode).limits
  const limit = limits[metric]
  const used = usage.monthly[metric] ?? 0
  const remaining = Math.max(0, limit - used)

  if (usage.monthlySpendMinor >= limits.monthlySpendCapMinor) {
    return {
      allowed: false,
      remaining,
      limit,
      boundBy: 'MONTHLY_SPEND',
      reason:
        'This account has reached its analysis budget for the month. ' +
        'Measurement resumes at the start of the next billing period.',
    }
  }

  if (metric === 'prompt_execution' && usage.hourlyExecutions + requested > limits.hourlyExecutionCap) {
    return {
      allowed: false,
      remaining: Math.max(0, limits.hourlyExecutionCap - usage.hourlyExecutions),
      limit: limits.hourlyExecutionCap,
      boundBy: 'HOURLY_BURST',
      reason: 'Too many measurements in a short window. This will resume shortly.',
    }
  }

  if (used + requested > limit) {
    return {
      allowed: false,
      remaining,
      limit,
      boundBy: 'MONTHLY_UNITS',
      reason: `This plan includes ${limit} ${metric.replace('_', ' ')} per month, and ${used} have been used.`,
    }
  }

  return { allowed: true, remaining: remaining - requested, limit, boundBy: 'NONE', reason: 'Within plan limits.' }
}

export const assertQuota = (
  planCode: PlanCode,
  metric: UsageMetric,
  requested: number,
  usage: UsageSnapshot,
): void => {
  const decision = checkQuota(planCode, metric, requested, usage)
  if (!decision.allowed) {
    throw new AppError({
      code: decision.boundBy === 'HOURLY_BURST' ? 'RATE_LIMITED' : 'QUOTA_EXCEEDED',
      message: `Quota exceeded for ${metric}: ${decision.reason}`,
      publicMessage: decision.reason,
      retryable: decision.boundBy === 'HOURLY_BURST',
      details: { metric, limit: decision.limit, boundBy: decision.boundBy },
    })
  }
}

/** In-memory meter. A database-backed implementation exposes the same surface. */
export class UsageMeter {
  private readonly monthly = new Map<string, number>()
  private readonly hourly = new Map<string, number>()
  private spendMinor = new Map<string, number>()

  constructor(private readonly clock: Clock = systemClock) {}

  private monthKey(organizationId: string, metric?: string): string {
    const now = this.clock.now()
    return `${organizationId}:${now.getUTCFullYear()}-${now.getUTCMonth()}${metric ? `:${metric}` : ''}`
  }

  private hourKey(organizationId: string): string {
    const now = this.clock.now()
    return `${organizationId}:${now.toISOString().slice(0, 13)}`
  }

  record(organizationId: string, metric: UsageMetric, quantity = 1): void {
    const mKey = this.monthKey(organizationId, metric)
    this.monthly.set(mKey, (this.monthly.get(mKey) ?? 0) + quantity)
    if (metric === 'prompt_execution') {
      const hKey = this.hourKey(organizationId)
      this.hourly.set(hKey, (this.hourly.get(hKey) ?? 0) + quantity)
    }
  }

  recordSpend(organizationId: string, minor: number): void {
    const key = this.monthKey(organizationId)
    this.spendMinor.set(key, (this.spendMinor.get(key) ?? 0) + minor)
  }

  snapshot(organizationId: string): UsageSnapshot {
    const monthly: Partial<Record<UsageMetric, number>> = {}
    const prefix = `${this.monthKey(organizationId)}:`
    for (const [key, value] of this.monthly) {
      if (key.startsWith(prefix)) monthly[key.slice(prefix.length) as UsageMetric] = value
    }
    return {
      monthly,
      hourlyExecutions: this.hourly.get(this.hourKey(organizationId)) ?? 0,
      monthlySpendMinor: this.spendMinor.get(this.monthKey(organizationId)) ?? 0,
    }
  }
}
