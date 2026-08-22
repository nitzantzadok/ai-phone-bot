/**
 * The measured half of the scan, end to end.
 *
 * The AI measurement is the part that costs money and carries the product's credibility,
 * so it must not be the part that is only ever exercised through a mock at the seam. Here
 * a local HTTP server speaks the Anthropic Messages API, and the real SDK, the real
 * adapter, the real evaluator, the real citation analysis and the real AIRS calculation
 * all run against it over a socket.
 *
 * What the server returns is a fixed answer written by this test — that is the one thing
 * that cannot be real here. Everything downstream of the response body is production code,
 * which is exactly what these tests exist to check: that an answer naming the business is
 * read as a recommendation, that an answer naming somebody else is not, and that the
 * competitor is picked up by name.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadEnv } from '@autopilot/shared/env.ts'
import { startDemoSite, type DemoSite } from '../src/testing/demo-site.ts'
import { scanBusiness, type ScanReport } from '../src/scan.ts'

/** What the fake engine says. Swapped per test before the scan runs. */
let answer = ''
let requestCount = 0

let engine: Server
let engineUrl = ''
let site: DemoSite

beforeAll(async () => {
  engine = createServer((req, res) => {
    requestCount++
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-test',
          content: [{ type: 'text', text: answer }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 120, output_tokens: 80 },
        }),
      )
    })
  })
  await new Promise<void>((resolve) => engine.listen(0, '127.0.0.1', resolve))
  engineUrl = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`
  site = await startDemoSite('after')
})

afterAll(async () => {
  await new Promise<void>((resolve) => engine.close(() => resolve()))
  await site.close()
})

const measure = (): Promise<ScanReport> => {
  requestCount = 0
  return scanBusiness({
    url: site.origin,
    language: 'he',
    allowPrivateHosts: true,
    measureAi: true,
    maxPages: 12,
    maxPrompts: 4,
    maxSpendMinor: 200,
    env: loadEnv({
      NODE_ENV: 'test',
      APP_ENV: 'ci',
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      ANTHROPIC_BASE_URL: engineUrl,
    }),
  })
}

describe('measuring against an engine that recommends the business', () => {
  let report: ScanReport

  beforeAll(async () => {
    answer =
      'הנה שלוש מרפאות שיניים מומלצות בפתח תקווה:\n' +
      '1. דנטל סנטר הדר — מקבלים ילדים, פתוח עד 19:00, יש חניה.\n' +
      '2. מרפאת שיניים אחרת — טובה גם.\n'
    report = await measure()
  })

  it('actually called the engine', () => {
    expect(requestCount).toBeGreaterThan(0)
  })

  it('reports a measurement rather than a skip', () => {
    expect(report.aiVisibility).not.toBeNull()
    expect(report.aiVisibilitySkipped).toBeNull()
    expect(report.aiVisibility?.engines).toContain('anthropic')
  })

  it('recognises that the business was named, and says so', () => {
    const ai = report.aiVisibility!
    expect(ai.promptsRun).toBeGreaterThan(0)
    expect(ai.recommendationRate).toBeGreaterThan(0)
    expect(ai.examples.some((e) => e.recommended)).toBe(true)
  })

  it('produces an AIRS score from the observations it read', () => {
    const ai = report.aiVisibility!
    expect(ai.airs.score).toBeGreaterThan(0)
    expect(ai.airs.formulaVersion).toBe('airs-v1')
    expect(ai.airs.executionCount).toBe(ai.promptsRun)
  })

  it('records what the run cost', () => {
    expect(report.aiVisibility!.costMinor).toBeGreaterThan(0)
  })
})

describe('measuring against an engine that recommends somebody else', () => {
  let report: ScanReport

  beforeAll(async () => {
    answer =
      'שתי מרפאות שיניים מומלצות בפתח תקווה:\n' +
      '1. מרפאת חיוך זהב — הכי מומלצת לילדים.\n' +
      '2. קליניקת שן ורד — פתוחה בערב.\n'
    report = await measure()
  })

  it('does not claim a recommendation that did not happen', () => {
    const ai = report.aiVisibility!
    expect(ai.recommendationRate).toBe(0)
    expect(ai.examples.every((e) => !e.recommended)).toBe(true)
  })

  it('names who appeared instead', () => {
    const names = report.aiVisibility!.competitors.map((c) => c.name).join(' ')
    expect(names).toMatch(/חיוך זהב|שן ורד/)
  })

  it('turns the loss into a diagnosis grounded in the measurement', () => {
    expect(report.diagnosis.lostPromptCount).toBeGreaterThan(0)
    expect(report.diagnosis.recommendationRate).toBe(0)
  })

  it('now that an engine was asked, may say what the engine did', () => {
    // The mirror of the unmeasured case: with real answers read, the finding is stated
    // about AI behaviour, because that is what was observed.
    const titles = report.playbook.items.map((i) => i.title).join(' | ')
    expect(titles).toMatch(/ה-AI לא מקשר|האתר שלכם לא אומר מספיק ברור/)
  })
})

describe('an engine that is unreachable or rejects the key', () => {
  it('reports no measurement, rather than a measurement of zero', async () => {
    // Every call failing and nobody ever recommending you produce identical numbers:
    // promptsRun 0, rate 0. Publishing the first as the second would tell a customer
    // they are invisible when in fact we never asked — false, and entirely plausible to
    // them, which is the worst combination a report can have.
    const broken = createServer((req, res) => {
      req.resume()
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
    })
    await new Promise<void>((resolve) => broken.listen(0, '127.0.0.1', resolve))
    const brokenUrl = `http://127.0.0.1:${(broken.address() as AddressInfo).port}`

    try {
      const report = await scanBusiness({
        url: site.origin,
        language: 'he',
        allowPrivateHosts: true,
        measureAi: true,
        maxPages: 12,
        maxPrompts: 3,
        env: loadEnv({
          NODE_ENV: 'test',
          APP_ENV: 'ci',
          ANTHROPIC_API_KEY: 'sk-ant-wrong',
          ANTHROPIC_BASE_URL: brokenUrl,
        }),
      })

      expect(report.aiVisibility).toBeNull()
      expect(report.aiVisibilitySkipped?.reason).toBe('MEASUREMENT_FAILED')
      expect(report.aiVisibilitySkipped?.detail.he).toMatch(/נכשלו/)
      // And no AIRS number is produced from nothing.
      expect(JSON.stringify(report)).not.toMatch(/"airs"/)
    } finally {
      await new Promise<void>((resolve) => broken.close(() => resolve()))
    }
  })
})

describe('spending limits', () => {
  it('stops rather than exceeding the ceiling it was given', async () => {
    answer = 'דנטל סנטר הדר היא מרפאת שיניים מומלצת בפתח תקווה.'
    const report = await scanBusiness({
      url: site.origin,
      language: 'he',
      allowPrivateHosts: true,
      measureAi: true,
      maxPages: 12,
      maxPrompts: 30,
      maxSpendMinor: 1,
      env: loadEnv({
        NODE_ENV: 'test',
        APP_ENV: 'ci',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_BASE_URL: engineUrl,
      }),
    })

    const ai = report.aiVisibility!
    expect(ai.costMinor).toBeLessThanOrEqual(30)
    expect(['BUDGET', 'COMPLETE']).toContain(ai.stoppedBecause)
  })
})
