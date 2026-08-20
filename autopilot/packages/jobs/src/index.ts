/**
 * Job queue abstraction.
 *
 * Long AI work never runs inside an HTTP request: a customer's onboarding scan takes
 * minutes and must survive a deploy, a browser refresh and a provider timeout.
 *
 * The interface is deliberately small so that the in-process implementation (which makes
 * development and CI free of infrastructure) and a BullMQ implementation are genuinely
 * interchangeable. Every job is idempotent, retryable, observable, cancellable and
 * bounded — the five properties without which an autonomous system eventually does
 * something expensive twice.
 */
import { AppError, isAppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import { backoffDelay, DEFAULT_RETRY, type RetryPolicy } from '@autopilot/shared/resilience.ts'
import { newId, type JobId } from '@autopilot/shared/ids.ts'

export const JOB_TYPES = [
  'business.scan',
  'crawl.website',
  'knowledge.build',
  'prompts.generate',
  'measurement.run',
  'measurement.retest',
  'competitors.analyze',
  'scoring.calculate',
  'optimization.diagnose',
  'optimization.apply',
  'optimization.validate',
  'experiment.evaluate',
  'agent.run',
  'report.weekly',
  'billing.reconcile',
  'retention.purge',
] as const
export type JobType = (typeof JOB_TYPES)[number]

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'BUDGET_EXCEEDED'

export interface Job<TPayload = Record<string, unknown>> {
  readonly id: JobId
  readonly type: JobType
  readonly payload: TPayload
  readonly organizationId?: string
  readonly businessId?: string
  /** Idempotency key. Enqueuing the same logical work twice is a no-op, not a double spend. */
  readonly dedupeKey?: string
  /** Per-job spend ceiling in minor units. */
  readonly maxSpendMinor?: number
  status: JobStatus
  attempts: number
  readonly maxAttempts: number
  /** Mutable: a retry reschedules the job with backoff. */
  scheduledFor: Date
  startedAt: Date | null
  finishedAt: Date | null
  result?: Record<string, unknown>
  errorMessage?: string
  readonly createdAt: Date
}

export interface EnqueueOptions {
  readonly organizationId?: string
  readonly businessId?: string
  readonly dedupeKey?: string
  readonly maxAttempts?: number
  readonly maxSpendMinor?: number
  readonly delayMs?: number
}

export interface JobContext {
  readonly job: Job
  readonly logger: Logger
  readonly signal: AbortSignal
  /** Enqueue follow-on work from inside a handler. */
  readonly enqueue: JobQueue['enqueue']
}

export type JobHandler<TPayload = Record<string, unknown>> = (
  payload: TPayload,
  context: JobContext,
) => Promise<Record<string, unknown> | void>

export interface JobQueue {
  enqueue<TPayload extends Record<string, unknown>>(
    type: JobType,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<Job<TPayload>>
  register<TPayload extends Record<string, unknown>>(type: JobType, handler: JobHandler<TPayload>): void
  cancel(jobId: JobId): Promise<boolean>
  get(jobId: JobId): Promise<Job | null>
  /** Drains the queue. In production the worker loop calls this continuously. */
  drain(): Promise<void>
  close(): Promise<void>
}

/**
 * In-process queue.
 *
 * Real enough to build and test the whole pipeline against: it retries with backoff,
 * deduplicates, respects scheduling delays, supports cancellation and records failures.
 * Production swaps in BullMQ behind the same interface.
 */
export class InProcessQueue implements JobQueue {
  private readonly jobs = new Map<string, Job>()
  private readonly byDedupeKey = new Map<string, JobId>()
  private readonly handlers = new Map<JobType, JobHandler<never>>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly logger: Logger
  private readonly clock: Clock
  private readonly retryPolicy: RetryPolicy

  constructor(
    options: { logger?: Logger; clock?: Clock; retryPolicy?: RetryPolicy } = {},
  ) {
    this.logger = options.logger ?? noopLogger
    this.clock = options.clock ?? systemClock
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY
  }

  async enqueue<TPayload extends Record<string, unknown>>(
    type: JobType,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<Job<TPayload>> {
    if (options.dedupeKey) {
      const existingId = this.byDedupeKey.get(options.dedupeKey)
      const existing = existingId ? this.jobs.get(existingId) : undefined
      // Reuse only while the work is still pending or in flight; a finished job may
      // legitimately be run again later.
      if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) {
        return existing as Job<TPayload>
      }
    }

    const now = this.clock.now()
    const job: Job<TPayload> = {
      id: newId<'JobId'>(),
      type,
      payload,
      organizationId: options.organizationId,
      businessId: options.businessId,
      dedupeKey: options.dedupeKey,
      maxSpendMinor: options.maxSpendMinor,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.retryPolicy.maxAttempts,
      scheduledFor: new Date(now.getTime() + (options.delayMs ?? 0)),
      startedAt: null,
      finishedAt: null,
      createdAt: now,
    }

    this.jobs.set(job.id, job as Job)
    if (options.dedupeKey) this.byDedupeKey.set(options.dedupeKey, job.id)
    return job
  }

  register<TPayload extends Record<string, unknown>>(
    type: JobType,
    handler: JobHandler<TPayload>,
  ): void {
    this.handlers.set(type, handler as JobHandler<never>)
  }

  async cancel(jobId: JobId): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job) return false
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') return false
    this.controllers.get(jobId)?.abort()
    job.status = 'CANCELED'
    job.finishedAt = this.clock.now()
    return true
  }

  async get(jobId: JobId): Promise<Job | null> {
    return this.jobs.get(jobId) ?? null
  }

  /** Jobs ready to run now, oldest first. */
  private ready(): Job[] {
    const now = this.clock.timestamp()
    return [...this.jobs.values()]
      .filter((j) => j.status === 'QUEUED' && j.scheduledFor.getTime() <= now)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async drain(): Promise<void> {
    // Bounded: a handler that enqueues its own successor cannot spin forever.
    for (let pass = 0; pass < 1000; pass++) {
      const batch = this.ready()
      if (batch.length === 0) return
      for (const job of batch) await this.execute(job)
    }
    throw new AppError({
      code: 'INTERNAL',
      message: 'Job queue did not drain after 1000 passes; a handler is likely re-enqueuing itself',
    })
  }

  private async execute(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type)
    if (!handler) {
      job.status = 'FAILED'
      job.errorMessage = `No handler registered for ${job.type}`
      job.finishedAt = this.clock.now()
      return
    }

    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    job.status = 'RUNNING'
    job.attempts++
    job.startedAt = this.clock.now()

    const logger = this.logger.child({
      jobId: job.id,
      jobType: job.type,
      organizationId: job.organizationId,
      businessId: job.businessId,
      attempt: job.attempts,
    })

    try {
      const result = await (handler as JobHandler)(job.payload, {
        job,
        logger,
        signal: controller.signal,
        enqueue: this.enqueue.bind(this),
      })
      job.status = 'SUCCEEDED'
      job.result = result ?? undefined
      job.finishedAt = this.clock.now()
      logger.info('job succeeded')
    } catch (e) {
      const budgetExceeded = isAppError(e) && e.code === 'BUDGET_EXCEEDED'
      const retryable = isAppError(e) ? e.retryable : true
      job.errorMessage = e instanceof Error ? e.message : String(e)

      if (budgetExceeded) {
        // Never retried: a budget breach will breach again, and each attempt costs.
        job.status = 'BUDGET_EXCEEDED'
        job.finishedAt = this.clock.now()
        logger.warn('job stopped on budget', { err: e })
      } else if (retryable && job.attempts < job.maxAttempts) {
        job.status = 'QUEUED'
        job.scheduledFor = new Date(
          this.clock.timestamp() + backoffDelay(job.attempts, this.retryPolicy),
        )
        logger.warn('job will retry', { err: e, nextAttempt: job.attempts + 1 })
      } else {
        job.status = 'FAILED'
        job.finishedAt = this.clock.now()
        logger.error('job failed', { err: e })
      }
    } finally {
      this.controllers.delete(job.id)
    }
  }

  async close(): Promise<void> {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  /** Queue depth by status, for the admin operations dashboard. */
  stats(): Record<JobStatus, number> {
    const stats: Record<JobStatus, number> = {
      QUEUED: 0,
      RUNNING: 0,
      SUCCEEDED: 0,
      FAILED: 0,
      CANCELED: 0,
      BUDGET_EXCEEDED: 0,
    }
    for (const job of this.jobs.values()) stats[job.status]++
    return stats
  }
}

/**
 * Deterministic dedupe keys.
 *
 * Onboarding enqueues the same scan several times as the customer clicks around; this is
 * what makes that free instead of expensive.
 */
export const dedupeKey = (type: JobType, businessId: string, discriminator = ''): string =>
  [type, businessId, discriminator].filter(Boolean).join(':')
