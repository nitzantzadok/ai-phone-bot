/**
 * Injectable clock. Every module that timestamps or measures freshness takes a Clock so
 * tests are deterministic and time-travel assertions (freshness, TTL, observation
 * windows) are possible without sleeping.
 */
export interface Clock {
  now(): Date
  timestamp(): number
}

export const systemClock: Clock = {
  now: () => new Date(),
  timestamp: () => Date.now(),
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current)
  }
  timestamp(): number {
    return this.current.getTime()
  }
  set(d: Date): void {
    this.current = d
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
  advanceDays(days: number): void {
    this.advance(days * 24 * 60 * 60 * 1000)
  }
}
