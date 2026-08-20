/**
 * Timeouts, bounded retries and circuit breakers.
 *
 * Every external call in this product goes through these. Two invariants matter more than
 * elegance here:
 *  - retries are ALWAYS capped and always jittered (a synchronised retry storm across
 *    workers is how you turn a provider blip into an outage plus a bill);
 *  - a breaker that is open fails fast rather than queueing, so a dead provider costs
 *    latency once, not once per job.
 */
import { AppError } from './errors.ts'
import type { Clock } from './clock.ts'
import { systemClock } from './clock.ts'

export interface RetryPolicy {
  readonly maxAttempts: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
  /** 0..1 — proportion of the delay randomised, to decorrelate concurrent workers. */
  readonly jitter: number
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  jitter: 0.3,
}

export const backoffDelay = (
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY,
  random: () => number = Math.random,
): number => {
  const exp = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs)
  const jitterRange = exp * policy.jitter
  return Math.round(exp - jitterRange / 2 + random() * jitterRange)
}

export interface RetryOptions {
  readonly policy?: RetryPolicy
  readonly isRetryable?: (e: unknown) => boolean
  readonly onRetry?: (e: unknown, attempt: number, delayMs: number) => void
  readonly sleep?: (ms: number) => Promise<void>
}

const defaultRetryable = (e: unknown): boolean =>
  e instanceof AppError ? e.retryable : e instanceof Error

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const withRetry = async <T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const policy = options.policy ?? DEFAULT_RETRY
  const isRetryable = options.isRetryable ?? defaultRetryable
  const sleep = options.sleep ?? defaultSleep
  let lastError: unknown

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (e) {
      lastError = e
      if (attempt === policy.maxAttempts || !isRetryable(e)) break
      const delay = backoffDelay(attempt, policy)
      options.onRetry?.(e, attempt, delay)
      await sleep(delay)
    }
  }
  throw lastError
}

export const withTimeout = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fn(controller.signal)
  } catch (e) {
    if (controller.signal.aborted) {
      throw new AppError({
        code: 'PROVIDER_TIMEOUT',
        message: `${label} timed out after ${ms}ms`,
        retryable: true,
        cause: e,
      })
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  readonly failureThreshold: number
  readonly resetTimeoutMs: number
  /** Consecutive successes in HALF_OPEN before closing again. */
  readonly successThreshold: number
  readonly clock?: Clock
}

export class CircuitBreaker {
  private state: BreakerState = 'CLOSED'
  private failures = 0
  private successes = 0
  private openedAt = 0
  private readonly clock: Clock

  constructor(
    readonly name: string,
    private readonly options: CircuitBreakerOptions = {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      successThreshold: 2,
    },
  ) {
    this.clock = options.clock ?? systemClock
  }

  get currentState(): BreakerState {
    this.maybeHalfOpen()
    return this.state
  }

  private maybeHalfOpen(): void {
    if (
      this.state === 'OPEN' &&
      this.clock.timestamp() - this.openedAt >= this.options.resetTimeoutMs
    ) {
      this.state = 'HALF_OPEN'
      this.successes = 0
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen()
    if (this.state === 'OPEN') {
      throw new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: `Circuit breaker open for ${this.name}`,
        retryable: true,
        details: { breaker: this.name },
      })
    }
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (e) {
      this.onFailure()
      throw e
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes++
      if (this.successes >= this.options.successThreshold) {
        this.state = 'CLOSED'
        this.failures = 0
      }
      return
    }
    this.failures = 0
  }

  private onFailure(): void {
    this.failures++
    if (this.state === 'HALF_OPEN' || this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN'
      this.openedAt = this.clock.timestamp()
    }
  }

  reset(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0
  }
}

/** Simple token bucket, used for per-host crawl politeness and per-tenant API limits. */
export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly clock: Clock = systemClock,
  ) {
    this.tokens = capacity
    this.lastRefill = clock.timestamp()
  }

  tryConsume(count = 1): boolean {
    this.refill()
    if (this.tokens < count) return false
    this.tokens -= count
    return true
  }

  /** Milliseconds until `count` tokens will be available. 0 if available now. */
  waitTimeMs(count = 1): number {
    this.refill()
    if (this.tokens >= count) return 0
    return Math.ceil(((count - this.tokens) / this.refillPerSecond) * 1000)
  }

  private refill(): void {
    const now = this.clock.timestamp()
    const elapsed = (now - this.lastRefill) / 1000
    if (elapsed <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond)
    this.lastRefill = now
  }
}
