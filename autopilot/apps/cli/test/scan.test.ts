/**
 * End-to-end scan tests against a real HTTP server.
 *
 * Nothing here is stubbed except the website itself: a real socket, the real crawler, the
 * real fact extraction, the real diagnosis, the real insight catalogue. The two variants
 * of the demo site describe the same business; only what is written down differs, which is
 * the whole thesis of the product and therefore the thing the tests must actually check.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '@autopilot/shared/env.ts'
import { startDemoSite, type DemoSite } from '../src/testing/demo-site.ts'
import { scanBusiness, type ScanReport } from '../src/scan.ts'
import { renderReport } from '../src/report-text.ts'

/** No provider keys: these tests must never reach a real engine or spend anything. */
const env = loadEnv({ NODE_ENV: 'test', APP_ENV: 'ci' })

let before: DemoSite
let after: DemoSite
let beforeReport: ScanReport
let afterReport: ScanReport

const scan = (site: DemoSite, overrides = {}): Promise<ScanReport> =>
  scanBusiness({
    url: site.origin,
    language: 'he',
    allowPrivateHosts: true,
    measureAi: false,
    maxPages: 12,
    env,
    ...overrides,
  })

beforeAll(async () => {
  before = await startDemoSite('before')
  after = await startDemoSite('after')
  beforeReport = await scan(before)
  afterReport = await scan(after)
})

afterAll(async () => {
  await before.close()
  await after.close()
})

describe('scanning a site that says nothing about itself', () => {
  it('reads every page over a real connection', () => {
    expect(beforeReport.crawl.pagesFetched).toBe(4)
    expect(beforeReport.crawl.errors).toEqual([])
    expect(beforeReport.crawl.robotsTxtFound).toBe(true)
  })

  it('reports no business name rather than publishing the page greeting as one', () => {
    // The home page is titled "ברוכים הבאים". A greeting is not a name, and reporting it
    // as one would put it into every question we later generate about this business.
    expect(beforeReport.business.name).toBeNull()
  })

  it('finds no city, phone or address, because none are written down', () => {
    expect(beforeReport.business.city).toBeNull()
    expect(beforeReport.business.phone).toBeNull()
    expect(beforeReport.business.address).toBeNull()
    expect(beforeReport.business.missingFields).toContain('city')
  })

  it('asks no questions it cannot ask honestly', () => {
    // With no city and no name there is no real local question, so none is invented.
    expect(beforeReport.prompts).toHaveLength(0)
  })

  it('names the real technical problems', () => {
    const types = new Set(beforeReport.findings.map((f) => f.findingType))
    expect(types).toContain('NO_STRUCTURED_DATA')
    expect(types).toContain('MISSING_META_DESCRIPTION')
    expect(types).toContain('NO_SITEMAP')
  })

  it('scores low, and every component is a measurement', () => {
    expect(beforeReport.readiness.score).toBeLessThan(20)
    expect(beforeReport.readiness.version).toBe('readiness-v1')
    const sum = Object.values(beforeReport.readiness.components).reduce(
      (total, c) => total + c.contribution,
      0,
    )
    expect(Math.round(sum * 100)).toBe(beforeReport.readiness.score)
  })
})

describe('scanning the same business, written down', () => {
  it('reads the business identity correctly', () => {
    expect(afterReport.business.name).toBe('דנטל סנטר הדר')
    expect(afterReport.business.city).toBe('פתח תקווה')
    expect(afterReport.business.phone).toBe('+972-3-555-0123')
    expect(afterReport.business.address).toContain('חובבי ציון 14')
  })

  it('identifies the vertical from the site rather than guessing', () => {
    expect(afterReport.business.vertical).toBe('dentist')
    expect(afterReport.business.verticalSource).toBe('INFERRED')
    expect(afterReport.business.entityType).toBe('Dentist')
  })

  it('extracts attributes the site genuinely states, in Hebrew', () => {
    expect(afterReport.business.statedAttributes).toContain('חניה')
    expect(afterReport.business.statedAttributes).toContain('נגיש לכיסא גלגלים')
  })

  it('claims nothing the site does not state', () => {
    // The site never mentions night hours, so no attribute for it may appear.
    expect(afterReport.business.statedAttributes.join(' ')).not.toMatch(/לילה/)
  })

  it('generates real questions in both languages, each naming the city correctly', () => {
    expect(afterReport.prompts.length).toBeGreaterThan(10)

    const hebrew = afterReport.prompts.filter((p) => p.language === 'he')
    const english = afterReport.prompts.filter((p) => p.language === 'en')
    expect(hebrew.length).toBeGreaterThan(0)
    expect(english.length).toBeGreaterThan(0)

    for (const p of hebrew) expect(p.queryText).toContain('פתח תקווה')
    // An English question naming the city in Hebrew is a question nobody types.
    for (const p of english) {
      expect(p.queryText).toContain('Petah Tikva')
      expect(p.queryText).not.toMatch(/[֐-׿]/)
    }
  })

  it('writes grammatical Hebrew: agreement follows the service term', () => {
    const hebrew = afterReport.prompts.filter((p) => p.language === 'he')
    // "רופא שיניים" is masculine, so "איזו ... מתאימה" would be wrong.
    expect(hebrew.some((p) => p.queryText.includes('איזה רופא שיניים'))).toBe(true)
    for (const p of hebrew) {
      expect(p.queryText).not.toContain('איזו רופא')
      expect(p.queryText).not.toContain('רופא שיניים בפתח תקווה מתאימה')
    }
  })

  it('scores substantially higher than the same business unwritten', () => {
    expect(afterReport.readiness.score).toBeGreaterThan(beforeReport.readiness.score + 30)
    expect(afterReport.readiness.components.informationCompleteness.value).toBe(1)
  })
})

describe('honesty about what was not measured', () => {
  it('reports no AI visibility and says why, with no key configured', async () => {
    const report = await scan(after, { measureAi: true })

    expect(report.aiVisibility).toBeNull()
    expect(report.aiVisibilitySkipped?.reason).toBe('NO_PROVIDER_KEY')
    expect(report.aiVisibilitySkipped?.detail.he).toMatch(/לא נשאל/)
  })

  it('refuses to report simulated engines as a measurement', async () => {
    const mockEnv = loadEnv({
      NODE_ENV: 'test',
      APP_ENV: 'ci',
      USE_MOCK_PROVIDERS: 'true',
      ANTHROPIC_API_KEY: 'sk-not-a-real-key',
    })
    const report = await scan(after, { measureAi: true, env: mockEnv })

    expect(report.aiVisibility).toBeNull()
    expect(report.aiVisibilitySkipped?.reason).toBe('MOCK_PROVIDERS_CONFIGURED')
  })

  it('produces no AIRS score at all when nothing was measured', () => {
    // A readiness score is not an AIRS score, and the report must not blur them.
    expect(afterReport.aiVisibility).toBeNull()
    expect(afterReport.readiness.disclosure).toMatch(/not a measurement of whether/i)
  })
})

describe('a site whose robots.txt shuts everyone out', () => {
  it('says so, instead of reporting an empty site', async () => {
    const blocked = await startDemoSite('blocked')
    try {
      const report = await scan(blocked)

      expect(report.crawl.pagesFetched).toBe(0)
      // Silently dropping the URL would produce a report with no pages and no findings —
      // the one outcome that tells a customer nothing about why they are invisible.
      expect(report.crawl.errors.map((e) => e.code)).toContain('ROBOTS_BLOCKED')

      const text = renderReport(report)
      expect(text).toContain('robots.txt')
      expect(text).toMatch(/חוסם/)
    } finally {
      await blocked.close()
    }
  })
})

describe('the advice a customer receives', () => {
  it('is grounded in what was actually found', () => {
    const measured = afterReport.playbook.items.filter((i) => i.kind === 'MEASURED')
    expect(measured.length).toBeGreaterThan(0)
  })

  it('separates what we cannot control from the task list', () => {
    expect(afterReport.playbook.outsideOurControl.length).toBeGreaterThan(0)
    for (const item of afterReport.playbook.outsideOurControl) {
      expect(item.controllability).toBe('NOT_CONTROLLED')
    }
  })

  it('is written entirely in the requested language', () => {
    const latinWords = /\b(page|site|your|this|the|and|crawler|summary)\b/i
    for (const item of afterReport.playbook.items) {
      expect(item.title).not.toMatch(latinWords)
      expect(item.why).not.toMatch(latinWords)
    }
  })

  it('renders a report with no untranslated fragments', () => {
    const text = renderReport(afterReport)
    expect(text).toContain('ציון מוכנות')
    expect(text).toContain('דנטל סנטר הדר')
    expect(text).not.toMatch(/Your site has no/)
  })
})
