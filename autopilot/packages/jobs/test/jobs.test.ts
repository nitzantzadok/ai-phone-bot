import { describe, expect, it, vi } from 'vitest'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { AppError } from '@autopilot/shared/errors.ts'
import { InProcessQueue, dedupeKey } from '../src/index.ts'

const clock = () => new FixedClock(new Date('2026-08-19T10:00:00Z'))

describe('InProcessQueue', () => {
  it('runs a registered handler and records its result', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    queue.register('crawl.website', async (payload: { url: string }) => ({ pages: 12, url: payload.url }))

    const job = await queue.enqueue('crawl.website', { url: 'https://rosa.example.com/' })
    await queue.drain()

    const finished = await queue.get(job.id)
    expect(finished!.status).toBe('SUCCEEDED')
    expect(finished!.result).toEqual({ pages: 12, url: 'https://rosa.example.com/' })
  })

  it('fails a job with no handler instead of losing it silently', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const job = await queue.enqueue('report.weekly', {})
    await queue.drain()
    const finished = await queue.get(job.id)
    expect(finished!.status).toBe('FAILED')
    expect(finished!.errorMessage).toContain('No handler registered')
  })

  it('deduplicates identical pending work so onboarding clicks are free', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const handler = vi.fn(async () => ({}))
    queue.register('business.scan', handler)

    const key = dedupeKey('business.scan', 'biz-1')
    const first = await queue.enqueue('business.scan', {}, { dedupeKey: key })
    const second = await queue.enqueue('business.scan', {}, { dedupeKey: key })

    expect(second.id).toBe(first.id)
    await queue.drain()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('allows the same logical work again once the previous run finished', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    queue.register('business.scan', async () => ({}))
    const key = dedupeKey('business.scan', 'biz-1')

    const first = await queue.enqueue('business.scan', {}, { dedupeKey: key })
    await queue.drain()
    const second = await queue.enqueue('business.scan', {}, { dedupeKey: key })

    expect(second.id).not.toBe(first.id)
  })

  it('retries a retryable failure with backoff, then gives up', async () => {
    const time = clock()
    const queue = new InProcessQueue({
      clock: time,
      retryPolicy: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 200, jitter: 0 },
    })
    const handler = vi.fn(async () => {
      throw new AppError({ code: 'PROVIDER_UNAVAILABLE', message: 'down' })
    })
    queue.register('measurement.run', handler)

    const job = await queue.enqueue('measurement.run', {})
    await queue.drain()
    expect((await queue.get(job.id))!.status).toBe('QUEUED')

    time.advance(1000)
    await queue.drain()
    time.advance(1000)
    await queue.drain()

    const finished = await queue.get(job.id)
    expect(finished!.status).toBe('FAILED')
    expect(finished!.attempts).toBe(3)
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-retryable failure', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const handler = vi.fn(async () => {
      throw new AppError({ code: 'VALIDATION_FAILED', message: 'bad input' })
    })
    queue.register('optimization.apply', handler)

    const job = await queue.enqueue('optimization.apply', {})
    await queue.drain()

    expect((await queue.get(job.id))!.status).toBe('FAILED')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('never retries a budget breach, because retrying costs money to fail again', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const handler = vi.fn(async () => {
      throw new AppError({ code: 'BUDGET_EXCEEDED', message: 'over budget' })
    })
    queue.register('measurement.run', handler)

    const job = await queue.enqueue('measurement.run', {})
    await queue.drain()

    const finished = await queue.get(job.id)
    expect(finished!.status).toBe('BUDGET_EXCEEDED')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('respects a scheduling delay', async () => {
    const time = clock()
    const queue = new InProcessQueue({ clock: time })
    const handler = vi.fn(async () => ({}))
    queue.register('report.weekly', handler)

    await queue.enqueue('report.weekly', {}, { delayMs: 60_000 })
    await queue.drain()
    expect(handler).not.toHaveBeenCalled()

    time.advance(60_001)
    await queue.drain()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('cancels a queued job', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const handler = vi.fn(async () => ({}))
    queue.register('agent.run', handler)

    const job = await queue.enqueue('agent.run', {})
    expect(await queue.cancel(job.id)).toBe(true)
    await queue.drain()

    expect(handler).not.toHaveBeenCalled()
    expect((await queue.get(job.id))!.status).toBe('CANCELED')
  })

  it('lets a handler enqueue follow-on work, which then runs', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const scored = vi.fn(async () => ({}))
    queue.register('crawl.website', async (_payload, ctx) => {
      await ctx.enqueue('scoring.calculate', { from: 'crawl' })
      return {}
    })
    queue.register('scoring.calculate', scored)

    await queue.enqueue('crawl.website', {})
    await queue.drain()
    expect(scored).toHaveBeenCalledOnce()
  })

  it('refuses to spin forever on a handler that re-enqueues itself', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    queue.register('agent.run', async (_payload, ctx) => {
      await ctx.enqueue('agent.run', {})
      return {}
    })
    await queue.enqueue('agent.run', {})
    await expect(queue.drain()).rejects.toThrow(/did not drain/)
  })

  it('passes an abort signal a handler can honour', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    let sawSignal = false
    queue.register('agent.run', async (_payload, ctx) => {
      sawSignal = ctx.signal instanceof AbortSignal
      return {}
    })
    await queue.enqueue('agent.run', {})
    await queue.drain()
    expect(sawSignal).toBe(true)
  })

  it('reports queue depth by status for the operations dashboard', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    queue.register('crawl.website', async () => ({}))
    await queue.enqueue('crawl.website', {})
    await queue.enqueue('report.weekly', {})
    await queue.drain()

    const stats = queue.stats()
    expect(stats.SUCCEEDED).toBe(1)
    expect(stats.FAILED).toBe(1)
  })

  it('carries tenant attribution through to the handler logger context', async () => {
    const queue = new InProcessQueue({ clock: clock() })
    const job = await queue.enqueue(
      'measurement.run',
      {},
      { organizationId: 'org-1', businessId: 'biz-1', maxSpendMinor: 500 },
    )
    expect(job.organizationId).toBe('org-1')
    expect(job.maxSpendMinor).toBe(500)
  })
})

describe('dedupeKey', () => {
  it('is stable and discriminating', () => {
    expect(dedupeKey('business.scan', 'b1')).toBe('business.scan:b1')
    expect(dedupeKey('business.scan', 'b1', 'weekly')).toBe('business.scan:b1:weekly')
    expect(dedupeKey('business.scan', 'b1')).not.toBe(dedupeKey('business.scan', 'b2'))
  })
})
