/**
 * What the report is allowed to say to a customer.
 *
 * Two categories of text end up on this page: sentences written for a business owner, and
 * sentences written for whoever operates the system. The second kind is correct, useful,
 * and must never render — a dentist reading "no ANTHROPIC_API_KEY is configured" in their
 * own dashboard learns that something is broken and that nobody read the page before
 * shipping it. That exact string was live.
 */
import { describe, expect, it } from 'vitest'
import type { ScanReport } from '@autopilot/cli/scan.ts'
import { buildReportView } from '../src/lib/report-view'

const report = (over: Partial<ScanReport> = {}): ScanReport =>
  ({
    scannedAt: new Date('2026-01-01T00:00:00Z'),
    requestedUrl: 'https://dental-hadar.co.il',
    businessId: 'biz_1' as ScanReport['businessId'],
    language: 'he',
    crawl: {
      pagesFetched: 4,
      pageUrls: [],
      robotsTxtFound: true,
      sitemapFound: false,
      discoverability: 0.5,
      stoppedBecause: 'COMPLETE',
      errors: [],
      durationMs: 1200,
    },
    business: {
      name: 'דנטל סנטר הדר',
      city: 'חיפה',
      phone: '04-8123456',
      address: 'הרצל 12',
      entityType: 'Dentist',
      vertical: 'dentist',
      verticalSource: 'INFERRED',
      completeness: 0.8,
      missingFields: [],
      statedAttributes: ['חניה'],
    },
    facts: [],
    conflicts: [],
    findings: [
      { findingType: 'NO_STRUCTURED_DATA', url: 'https://dental-hadar.co.il/', severity: 'MEDIUM' },
      { findingType: 'NO_STRUCTURED_DATA', url: 'https://dental-hadar.co.il/about', severity: 'MEDIUM' },
    ] as unknown as ScanReport['findings'],
    gaps: [],
    prompts: [],
    aiVisibility: null,
    aiVisibilitySkipped: null,
    readiness: {
      version: 'readiness-v1',
      score: 62,
      components: {
        technicalDiscoverability: { value: 0.8, weight: 0.3, contribution: 0.24 },
        informationCompleteness: { value: 0.6, weight: 0.4, contribution: 0.24 },
        attributeCoverage: { value: 0.4, weight: 0.3, contribution: 0.12 },
      },
      disclosure: 'Site readiness measures…',
    },
    diagnosis: {} as ScanReport['diagnosis'],
    playbook: { headline: '', items: [], outsideOurControl: [] },
    ...over,
  }) as ScanReport

const skip = (reason: string, he: string) =>
  report({
    aiVisibilitySkipped: {
      reason: reason as never,
      detail: { he, en: he },
    },
  })

describe('operator text never reaches a customer', () => {
  it('replaces a missing provider key with something about them, not about us', () => {
    const view = buildReportView(
      skip(
        'NO_PROVIDER_KEY',
        'לא הוגדר ANTHROPIC_API_KEY, OPENAI_API_KEY או GEMINI_API_KEY, ולכן שום עוזר AI לא נשאל בפועל.',
      ),
      'he',
    )
    expect(view.aiSkipMessage).not.toMatch(/API_KEY|USE_MOCK|env|ANTHROPIC|OPENAI|GEMINI/i)
    expect(view.aiSkipMessage!.length).toBeGreaterThan(40)
  })

  it('does the same for a misconfigured mock provider and a failed measurement', () => {
    for (const reason of ['MOCK_PROVIDERS_CONFIGURED', 'MEASUREMENT_FAILED']) {
      const view = buildReportView(skip(reason, 'USE_MOCK_PROVIDERS is set. Reported reason: 401'), 'he')
      expect(view.aiSkipMessage).not.toMatch(/USE_MOCK|API_KEY|401|Reported reason/i)
    }
  })

  it('still promises no estimate in place of the missing number', () => {
    // The reason this must not become a soft apology: the whole report's value rests on
    // every number being measured. Saying "no number" is the product working.
    const view = buildReportView(skip('NO_PROVIDER_KEY', 'no key'), 'he')
    expect(view.aiSkipMessage).toContain('לא הערכנו')
  })

  it('passes through the reasons that are genuinely about the customer’s site', () => {
    const detail = 'האתר לא מציין את שם העסק בשום מקום שאפשר לקרוא.'
    expect(buildReportView(skip('NO_BUSINESS_NAME', detail), 'he').aiSkipMessage).toBe(detail)
    expect(buildReportView(skip('NO_CITY_KNOWN', detail), 'he').aiSkipMessage).toBe(detail)
  })

  it('says nothing at all when the measurement actually ran', () => {
    expect(buildReportView(report(), 'he').aiSkipMessage).toBeNull()
  })
})

describe('nothing in the view carries a name from the codebase', () => {
  const view = buildReportView(report(), 'he')

  it('names the field in words, not as an identifier', () => {
    const everything = [
      view.verdict.headline,
      view.verdict.explanation,
      view.bandLabel,
      view.scoreFootnote,
      ...view.components.map((c) => `${c.label} ${c.meaning}`),
      ...view.facts.map((f) => f.label),
    ].join(' ')

    expect(everything).not.toMatch(/local_business|readiness-v1|airs-v1|[a-z]+_[a-z]+/)
  })

  it('labels every score component, never falling through to the key', () => {
    for (const c of view.components) {
      expect(c.label).not.toMatch(/^[a-z]/)
      expect(c.meaning.length).toBeGreaterThan(30)
    }
  })
})

describe('the handoff built from a real report', () => {
  it('collapses one finding per page into one instruction', () => {
    // The crawler emits a finding per page, so a four-page site with no business card
    // produces four findings. Repeating the same instruction four times in an email reads
    // as though nobody looked at it before sending.
    const view = buildReportView(report(), 'he')
    const occurrences = view.handoff.text.split('JSON-LD מסוג LocalBusiness').length - 1
    expect(occurrences).toBe(1)
    expect(view.handoff.text).toContain('https://dental-hadar.co.il/about')
  })

  it('carries the business card built from the details that were read', () => {
    const view = buildReportView(report(), 'he')
    expect(view.handoff.jsonLd).toContain('דנטל סנטר הדר')
    expect(view.handoff.jsonLd).toContain('04-8123456')
  })
})
