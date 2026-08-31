/**
 * The scan against the websites it will actually meet.
 *
 * Every fixture here serves a business that plainly states its name, city and phone. So
 * every assertion is the same assertion: the scan must describe the site, not its own
 * difficulty reading it. A report that says "no name found" about a site with the name in
 * its title is not a limitation, it is a false statement about a real business — and the
 * customer will act on it.
 *
 * Each case existed as a real failure before the fix that follows it.
 */
import { describe, expect, it } from 'vitest'
import { loadEnv } from '@autopilot/shared/env.ts'
import { startAwkwardSite, type AwkwardVariant } from '../src/testing/awkward-sites.ts'
import { scanBusiness, whyNothingWasRead, type ScanReport } from '../src/scan.ts'
import { renderReport } from '../src/report-text.ts'

const env = loadEnv({ NODE_ENV: 'test', APP_ENV: 'ci' })

const scanOf = async (variant: AwkwardVariant): Promise<ScanReport> => {
  const site = await startAwkwardSite(variant)
  try {
    return await scanBusiness({
      url: site.entryUrl,
      language: 'he',
      allowPrivateHosts: true,
      measureAi: false,
      maxPages: 8,
      env,
    })
  } finally {
    await site.close()
  }
}

describe('a site served as windows-1255', () => {
  // Still common on older Israeli sites. Decoded as UTF-8 the whole page becomes mojibake,
  // so every Hebrew fact silently fails and the report calls a full site empty.
  it('reads Hebrew correctly rather than as mojibake', async () => {
    const report = await scanOf('cp1255')

    expect(report.business.name).toBe('מוסך אבי ובניו')
    expect(report.business.name).not.toMatch(/�/)
    expect(report.business.city).toBe('חיפה')
  })
})

describe('a site with no structured data', () => {
  // The overwhelming majority of small business sites. Reading the city only from JSON-LD
  // meant no city, therefore no local question, therefore the entire measurement half of
  // the product switched itself off silently for most real customers.
  it('finds the city in the words on the page', async () => {
    const report = await scanOf('slow')

    expect(report.business.city).toBe('חיפה')
    expect(report.prompts.length).toBeGreaterThan(0)
    for (const p of report.prompts.filter((x) => x.language === 'he')) {
      expect(p.queryText).toContain('חיפה')
    }
  })

  it('does not mistake a street name for a city', async () => {
    // The fixture's address is "רחוב ההסתדרות 88". Guessing places from capitalised or
    // prominent nouns would put this business in a town that does not exist.
    const report = await scanOf('slow')
    expect(report.business.city).not.toMatch(/הסתדרות/)
  })
})

describe('a site whose content is written by JavaScript', () => {
  it('names that as the finding, instead of reporting its symptoms', async () => {
    const report = await scanOf('spa')
    const types = new Set(report.findings.map((f) => f.findingType))

    expect(types).toContain('CLIENT_RENDERED')
    // These are all true of an empty shell and all beside the point. Listing them buries
    // the one finding that matters and reads as five separate problems.
    expect(types).not.toContain('THIN_CONTENT')
    expect(types).not.toContain('MISSING_H1')
    expect(types).not.toContain('MISSING_META_DESCRIPTION')
  })

  it('explains it in Hebrew, in terms of what it costs the business', async () => {
    const report = await scanOf('spa')
    const finding = report.findings.find((f) => f.findingType === 'CLIENT_RENDERED')!

    expect(finding.severity).toBe('HIGH')
    expect(finding.plainLanguageHe).toMatch(/JavaScript/)
    expect(finding.plainLanguageHe).toMatch(/ריק/)
    // A rendering strategy is an architectural decision, never ours to change silently.
    expect(finding.autoFixable).toBe(false)
  })
})

describe('a site behind bot protection', () => {
  it('says the site refused us, not that the site is broken', async () => {
    const report = await scanOf('bot-blocked')

    expect(report.crawl.pagesFetched).toBe(0)
    expect(whyNothingWasRead(report)).toBe('BOT_PROTECTION')
  })

  it('tells the owner what to allow', async () => {
    const report = await scanOf('bot-blocked')
    const text = renderReport(report)

    expect(text).toMatch(/GPTBot/)
    expect(text).toMatch(/Cloudflare/)
    // And is clear that this is what AI crawlers hit too, which is why it matters at all.
    expect(text).toMatch(/ChatGPT/)
  })
})

describe('a site that redirects the address people type', () => {
  it('follows the redirect and reports on where the content actually is', async () => {
    const report = await scanOf('redirecting')

    expect(report.crawl.pagesFetched).toBeGreaterThan(0)
    expect(report.business.name).toBe('מוסך אבי ובניו')
    expect(report.business.city).toBe('חיפה')
  })
})

describe('across every awkward site', () => {
  it('never invents a business name, city or phone number', async () => {
    // The strongest guarantee the product makes. A scan may fail to find a fact; it may
    // never produce one that is not on the page.
    for (const variant of ['spa', 'cp1255', 'bot-blocked', 'redirecting', 'slow'] as const) {
      const report = await scanOf(variant)
      const { name, city, phone } = report.business

      if (name !== null) expect(name).toBe('מוסך אבי ובניו')
      if (city !== null) expect(city).toBe('חיפה')
      if (phone !== null) expect(phone.replace(/\D/g, '')).toBe('048551234')
    }
  })
})
