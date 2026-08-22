import { describe, expect, it } from 'vitest'
import { classifyPage, parseHtml, parseSitemap } from '../src/parse.ts'
import { auditSite, discoverabilityScore } from '../src/audit.ts'

const HE = 'רוזה' // Rosa in Hebrew

const page = (body: string, head = '') =>
  parseHtml(
    `<!doctype html><html lang="en"><head><title>Test</title>${head}</head><body>${body}</body></html>`,
    'https://rosa.example.com/page',
  )

describe('parseHtml', () => {
  it('extracts the core metadata a knowledge graph needs', () => {
    const parsed = parseHtml(
      `<!doctype html><html lang="he"><head>
        <title>Rosa - Italian restaurant in Tel Aviv</title>
        <meta name="description" content="Handmade pasta and a quiet room.">
        <link rel="canonical" href="/">
        <meta property="og:title" content="Rosa">
        <link rel="alternate" hreflang="en" href="/en/">
      </head><body><h1>Rosa</h1><h2>Our menu</h2><p>Handmade pasta since 2011.</p>
      <a href="/menu">Menu</a><a href="https://external.example.com/">External</a>
      <img src="/hero.jpg" alt="dining room"><img src="/x.jpg">
      </body></html>`,
      'https://rosa.example.com/',
    )

    expect(parsed.title).toBe('Rosa - Italian restaurant in Tel Aviv')
    expect(parsed.metaDescription).toBe('Handmade pasta and a quiet room.')
    expect(parsed.canonical).toBe('https://rosa.example.com/')
    expect(parsed.h1).toBe('Rosa')
    expect(parsed.headings).toHaveLength(2)
    expect(parsed.declaredLanguage).toBe('he')
    expect(parsed.openGraph['og:title']).toBe('Rosa')
    expect(parsed.hreflang.en).toBe('https://rosa.example.com/en/')
    expect(parsed.links.filter((l) => l.internal)).toHaveLength(1)
    expect(parsed.links.filter((l) => !l.internal)).toHaveLength(1)
    expect(parsed.images).toHaveLength(2)
    expect(parsed.indexable).toBe(true)
  })

  it('detects Hebrew content and mixed-script names', () => {
    const parsed = page(`<h1>${HE}</h1><p>${HE} ${HE} ${HE} ${HE} ${HE} ${HE} ${HE} ${HE}</p>`)
    expect(parsed.language).toBe('he')
  })

  it('reads JSON-LD, including a @graph wrapper', () => {
    const parsed = page(
      '',
      `<script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"Restaurant","name":"Rosa"},
          {"@type":"WebSite","name":"Rosa site"}]}
      </script>`,
    )
    expect(parsed.structuredData).toHaveLength(2)
    expect(parsed.schemaTypes).toEqual(['Restaurant', 'WebSite'])
  })

  it('survives malformed JSON-LD rather than failing the crawl', () => {
    const parsed = page('<p>hi</p>', '<script type="application/ld+json">{not json}</script>')
    expect(parsed.structuredData).toHaveLength(0)
    expect(parsed.bodyText).toBe('hi')
  })

  it('excludes script and style text from body content', () => {
    const parsed = page('<p>real content</p><script>var secret = 1</script><style>.a{}</style>')
    expect(parsed.bodyText).toBe('real content')
    expect(parsed.bodyText).not.toContain('secret')
  })

  it('marks a noindex page as not indexable', () => {
    const parsed = page('<p>x</p>', '<meta name="robots" content="noindex, follow">')
    expect(parsed.indexable).toBe(false)
  })

  it('hashes normalised content so whitespace churn is not a change', () => {
    const a = page('<p>Hello   world</p>')
    const b = page('<p>Hello world</p>')
    expect(a.contentHash).toBe(b.contentHash)
    expect(page('<p>Different</p>').contentHash).not.toBe(a.contentHash)
  })
})

describe('classifyPage', () => {
  it.each([
    ['https://r.example.com/', 'home'],
    ['https://r.example.com/contact', 'contact'],
    ['https://r.example.com/about-us', 'about'],
    ['https://r.example.com/faq', 'faq'],
    ['https://r.example.com/menu', 'menu'],
    ['https://r.example.com/blog/post-1', 'blog'],
    ['https://r.example.com/services/divorce-law', 'service'],
    ['https://r.example.com/random-page', 'other'],
  ])('classifies %s as %s', (url, expected) => {
    expect(classifyPage(parseHtml('<html><body></body></html>', url))).toBe(expected)
  })

  it('classifies Hebrew slugs', () => {
    // /contact in Hebrew
    const url = `https://r.example.com/${encodeURIComponent('צור-קשר')}`
    expect(classifyPage(parseHtml('<html><body></body></html>', url))).toBe('contact')
  })
})

describe('parseSitemap', () => {
  it('reads a urlset', () => {
    const { urls } = parseSitemap(
      `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://r.example.com/</loc></url>
        <url><loc>https://r.example.com/menu</loc></url>
      </urlset>`,
    )
    expect(urls).toEqual(['https://r.example.com/', 'https://r.example.com/menu'])
  })

  it('reads a sitemap index', () => {
    const { sitemaps } = parseSitemap(
      `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://r.example.com/sitemap-1.xml</loc></sitemap>
      </sitemapindex>`,
    )
    expect(sitemaps).toEqual(['https://r.example.com/sitemap-1.xml'])
  })
})

describe('auditSite', () => {
  const good = parseHtml(
    `<!doctype html><html lang="en"><head>
      <title>Rosa - Italian restaurant in Tel Aviv</title>
      <meta name="description" content="Handmade pasta, a quiet dining room and a short wine list in central Tel Aviv.">
      <link rel="canonical" href="https://rosa.example.com/">
      <script type="application/ld+json">{"@type":"Restaurant","name":"Rosa"}</script>
    </head><body><h1>Rosa</h1><p>${'word '.repeat(200)}</p></body></html>`,
    'https://rosa.example.com/',
  )

  it('reports nothing serious for a healthy page on a healthy site', () => {
    const findings = auditSite({
      pages: [good],
      robotsTxtFound: true,
      sitemapFound: true,
      statusByUrl: new Map([['https://rosa.example.com/', 200]]),
    })
    expect(findings.filter((f) => f.severity === 'HIGH')).toHaveLength(0)
    expect(discoverabilityScore(findings, 1)).toBeGreaterThan(0.9)
  })

  it('finds the classic controllable problems', () => {
    const bad = parseHtml(
      '<html><head></head><body><p>short</p></body></html>',
      'https://rosa.example.com/bad',
    )
    const findings = auditSite({
      pages: [bad],
      robotsTxtFound: false,
      sitemapFound: false,
      statusByUrl: new Map([['https://rosa.example.com/bad', 200]]),
    })
    const types = findings.map((f) => f.findingType)
    expect(types).toContain('MISSING_TITLE')
    expect(types).toContain('MISSING_META_DESCRIPTION')
    expect(types).toContain('MISSING_CANONICAL')
    expect(types).toContain('MISSING_H1')
    expect(types).toContain('NO_STRUCTURED_DATA')
    expect(types).toContain('NO_SITEMAP')
    expect(types).toContain('MISSING_LANG_ATTRIBUTE')
    expect(types).toContain('THIN_CONTENT')
  })

  it('never marks a noindex flip as auto-fixable', () => {
    const noindex = parseHtml(
      '<html lang="en"><head><title>Thanks for booking with us</title><meta name="robots" content="noindex"></head><body><h1>Thanks</h1></body></html>',
      'https://rosa.example.com/thanks',
    )
    const findings = auditSite({
      pages: [noindex],
      robotsTxtFound: true,
      sitemapFound: true,
      statusByUrl: new Map(),
    })
    const finding = findings.find((f) => f.findingType === 'NOINDEX')
    expect(finding).toBeDefined()
    expect(finding!.autoFixable).toBe(false)
  })

  it('detects duplicate titles across pages', () => {
    const a = parseHtml('<html lang="en"><head><title>Same title everywhere</title></head><body><h1>a</h1></body></html>', 'https://r.example.com/a')
    const b = parseHtml('<html lang="en"><head><title>Same title everywhere</title></head><body><h1>b</h1></body></html>', 'https://r.example.com/b')
    const findings = auditSite({
      pages: [a, b],
      robotsTxtFound: true,
      sitemapFound: true,
      statusByUrl: new Map(),
    })
    expect(findings.some((f) => f.findingType === 'DUPLICATE_TITLE')).toBe(true)
  })

  it('flags a language mismatch between declaration and content', () => {
    const HEB = 'שלום '
    const mismatched = parseHtml(
      `<html lang="en"><head><title>Rosa restaurant Tel Aviv</title></head><body><h1>x</h1><p>${HEB.repeat(40)}</p></body></html>`,
      'https://r.example.com/he',
    )
    const findings = auditSite({
      pages: [mismatched],
      robotsTxtFound: true,
      sitemapFound: true,
      statusByUrl: new Map(),
    })
    expect(findings.some((f) => f.findingType === 'LANGUAGE_MISMATCH')).toBe(true)
  })

  it('writes every finding in plain language, with no SEO jargon', () => {
    const bad = parseHtml('<html><head></head><body></body></html>', 'https://r.example.com/x')
    const findings = auditSite({
      pages: [bad],
      robotsTxtFound: false,
      sitemapFound: false,
      statusByUrl: new Map(),
    })
    for (const f of findings) {
      expect(f.plainLanguage.length).toBeGreaterThan(20)
      // Israel-first: a finding without a Hebrew sentence becomes an English sentence in
      // a Hebrew report, which is how the whole report stops sounding like it is for you.
      expect(f.plainLanguageHe.length).toBeGreaterThan(15)
      expect(f.plainLanguageHe).toMatch(/[\u0590-\u05ff]/)
      expect(f.plainLanguage).not.toMatch(/canonical tag|meta robots|hreflang|JSON-LD|H1 element/i)
    }
  })
})

describe('discoverabilityScore', () => {
  it('is 0 for a site with no pages', () => {
    expect(discoverabilityScore([], 0)).toBe(0)
  })

  it('falls as weighted findings accumulate and never goes negative', () => {
    const finding = (severity: 'HIGH' | 'MEDIUM' | 'LOW') => ({
      findingType: 'X',
      severity,
      url: 'u',
      detail: 'd',
      plainLanguage: 'p',
      plainLanguageHe: 'פ',
      confidence: 1,
      autoFixable: false,
    })
    expect(discoverabilityScore([finding('LOW')], 1)).toBeGreaterThan(0.8)
    expect(discoverabilityScore([finding('HIGH')], 1)).toBeLessThan(0.3)
    expect(discoverabilityScore(Array(20).fill(finding('HIGH')), 1)).toBe(0)
  })
})
