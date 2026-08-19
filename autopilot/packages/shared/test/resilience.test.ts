import { describe, expect, it, vi } from 'vitest'
import { FixedClock } from '../src/clock.ts'
import { AppError } from '../src/errors.ts'
import { CircuitBreaker, TokenBucket, backoffDelay, withRetry, withTimeout } from '../src/resilience.ts'

const noSleep = async () => {}

describe('withRetry', () => {
  it('stops at the attempt cap and never loops forever', async () => {
    const fn = vi.fn(async () => {
      throw new AppError({ code: 'PROVIDER_ERROR', message: 'boom' })
    })
    await expect(
      withRetry(fn, { policy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: 0 }, sleep: noSleep }),
    ).rejects.toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-retryable error', async () => {
    const fn = vi.fn(async () => {
      throw new AppError({ code: 'VALIDATION_FAILED', message: 'bad input' })
    })
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('bad input')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('returns as soon as an attempt succeeds', async () => {
    let n = 0
    const result = await withRetry(
      async () => {
        n++
        if (n < 2) throw new AppError({ code: 'PROVIDER_TIMEOUT', message: 'slow' })
        return 'done'
      },
      { sleep: noSleep },
    )
    expect(result).toBe('done')
    expect(n).toBe(2)
  })

  it('grows the delay exponentially and caps it', () => {
    const p = { maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 1000, jitter: 0 }
    expect(backoffDelay(1, p, () => 0.5)).toBe(100)
    expect(backoffDelay(2, p, () => 0.5)).toBe(200)
    expect(backoffDelay(4, p, () => 0.5)).toBe(800)
    expect(backoffDelay(8, p, () => 0.5)).toBe(1000)
  })

  it('jitters within the configured band', () => {
    const p = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 5000, jitter: 0.4 }
    expect(backoffDelay(1, p, () => 0)).toBe(800)
    expect(backoffDelay(1, p, () => 1)).toBe(1200)
  })
})

describe('withTimeout', () => {
  it('raises a typed timeout error', async () => {
    await expect(
      withTimeout(
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
        10,
        'provider call',
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true })
  })

  it('passes a successful result straight through', async () => {
    await expect(withTimeout(async () => 42, 1000)).resolves.toBe(42)
  })
})

describe('CircuitBreaker', () => {
  const fail = async () => {
    throw new AppError({ code: 'PROVIDER_ERROR', message: 'down' })
  }

  it('opens after the failure threshold and then fails fast', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'))
    const cb = new CircuitBreaker('openai', {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 1,
      clock,
    })
    for (let i = 0; i < 3; i++) await expect(cb.execute(fail)).rejects.toThrow('down')
    expect(cb.currentState).toBe('OPEN')

    const upstream = vi.fn(async () => 'ok')
    await expect(cb.execute(upstream)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('half-opens after the reset window and closes on success', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'))
    const cb = new CircuitBreaker('gemini', {
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      successThreshold: 1,
      clock,
    })
    for (let i = 0; i < 2; i++) await expect(cb.execute(fail)).rejects.toThrow()
    expect(cb.currentState).toBe('OPEN')

    clock.advance(1001)
    expect(cb.currentState).toBe('HALF_OPEN')
    await expect(cb.execute(async () => 'recovered')).resolves.toBe('recovered')
    expect(cb.currentState).toBe('CLOSED')
  })

  it('re-opens immediately if the probe fails', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'))
    const cb = new CircuitBreaker('anthropic', {
      failureThreshold: 1,
      resetTimeoutMs: 500,
      successThreshold: 2,
      clock,
    })
    await expect(cb.execute(fail)).rejects.toThrow()
    clock.advance(600)
    expect(cb.currentState).toBe('HALF_OPEN')
    await expect(cb.execute(fail)).rejects.toThrow()
    expect(cb.currentState).toBe('OPEN')
  })
})

describe('TokenBucket', () => {
  it('limits bursts and refills over time', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'))
    const bucket = new TokenBucket(3, 1, clock)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
    expect(bucket.waitTimeMs()).toBeGreaterThan(0)

    clock.advance(2000)
    expect(bucket.tryConsume(2)).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
  })

  it('never exceeds capacity however long it idles', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'))
    const bucket = new TokenBucket(2, 10, clock)
    clock.advance(1_000_000)
    expect(bucket.tryConsume(2)).toBe(true)
    expect(bucket.tryConsume(1)).toBe(false)
  })
})
