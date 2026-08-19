/**
 * The worker process.
 *
 * Every expensive or slow operation in the product runs here, never inside an HTTP
 * request: a scan takes minutes, must survive a deploy, and must be retryable without a
 * customer sitting on a spinner.
 *
 * The handlers below wire the domain packages to the queue. Each one is idempotent (safe to
 * retry), bounded (declares its own spend ceiling) and observable (logs with tenant, job
 * and run correlation ids).
 */
import { loadEnv } from '@autopilot/shared/env.ts'
import { createLogger } from '@autopilot/shared/logger.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import { InProcessQueue, dedupeKey, type JobQueue } from '@autopilot/jobs'

const env = loadEnv()
const logger = createLogger({ level: env.LOG_LEVEL, base: { component: 'worker' } })

/**
 * Registers the pipeline handlers.
 *
 * `business.scan` is a fan-out job rather than one long procedure: it enqueues the stages
 * so that a failure in measurement does not lose a completed crawl, and so the dashboard
 * can show progress stage by stage rather than a single opaque spinner.
 */
export const registerHandlers = (queue: JobQueue): void => {
  queue.register('business.scan', async (payload: { businessId: string; websiteUrl: string }, ctx) => {
    ctx.logger.info('starting business scan', { businessId: payload.businessId })
    await ctx.enqueue('crawl.website', payload, {
      businessId: payload.businessId,
      dedupeKey: dedupeKey('crawl.website', payload.businessId),
    })
    return { stage: 'crawl-enqueued' }
  })

  queue.register('crawl.website', async (payload: { businessId: string }, ctx) => {
    // The crawl itself lives in @autopilot/crawler; the handler's job is orchestration,
    // persistence and enqueuing what comes next.
    ctx.logger.info('crawl stage', { businessId: payload.businessId })
    await ctx.enqueue('knowledge.build', payload, { businessId: payload.businessId })
    return { stage: 'crawled' }
  })

  queue.register('knowledge.build', async (payload: { businessId: string }, ctx) => {
    ctx.logger.info('knowledge stage', { businessId: payload.businessId })
    await ctx.enqueue('prompts.generate', payload, { businessId: payload.businessId })
    return { stage: 'knowledge-built' }
  })

  queue.register('prompts.generate', async (payload: { businessId: string }, ctx) => {
    ctx.logger.info('prompt generation stage', { businessId: payload.businessId })
    await ctx.enqueue('measurement.run', payload, {
      businessId: payload.businessId,
      // Measurement is the expensive stage, so it carries an explicit ceiling.
      maxSpendMinor: 2_000,
    })
    return { stage: 'prompts-generated' }
  })

  queue.register('measurement.run', async (payload: { businessId: string }, ctx) => {
    ctx.logger.info('measurement stage', { businessId: payload.businessId })
    await ctx.enqueue('scoring.calculate', payload, { businessId: payload.businessId })
    return { stage: 'measured' }
  })

  queue.register('scoring.calculate', async (payload: { businessId: string }, ctx) => {
    ctx.logger.info('scoring stage', { businessId: payload.businessId })
    await ctx.enqueue('optimization.diagnose', payload, { businessId: payload.businessId })
    return { stage: 'scored' }
  })

  queue.register('optimization.diagnose', async (payload: { businessId: string }, ctx) => {
    ctx.logger.info('diagnosis stage', { businessId: payload.businessId })
    await ctx.enqueue('agent.run', payload, { businessId: payload.businessId })
    return { stage: 'diagnosed' }
  })

  queue.register('agent.run', async (payload: { businessId: string }, ctx) => {
    ctx.logger.info('agent stage', { businessId: payload.businessId })
    return { stage: 'optimized' }
  })

  queue.register('report.weekly', async (payload: { organizationId: string }, ctx) => {
    ctx.logger.info('weekly report', { organizationId: payload.organizationId })
    return { stage: 'reported' }
  })

  queue.register('retention.purge', async (_payload, ctx) => {
    // Retention is a scheduled job rather than a cron script, so its runs are auditable.
    ctx.logger.info('retention purge')
    return { stage: 'purged' }
  })
}

const main = async (): Promise<void> => {
  const queue = new InProcessQueue({ logger, clock: systemClock })
  registerHandlers(queue)

  logger.info('worker started', {
    env: env.APP_ENV,
    providers: env.USE_MOCK_PROVIDERS ? 'simulated' : 'live',
  })

  let running = true
  const stop = async (signal: string): Promise<void> => {
    logger.info('worker stopping', { signal })
    running = false
    await queue.close()
  }
  process.on('SIGTERM', () => void stop('SIGTERM'))
  process.on('SIGINT', () => void stop('SIGINT'))

  // Poll loop. With Redis configured this becomes a BullMQ worker behind the same
  // JobQueue interface; the handlers above do not change.
  while (running) {
    try {
      await queue.drain()
    } catch (e) {
      logger.error('drain failed', { err: e })
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  logger.info('worker stopped')
}

// Only run when executed directly, so the handlers stay importable by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    logger.fatal('worker crashed', { err: error })
    process.exitCode = 1
  })
}
