/**
 * The handoff is the only artefact in the product that leaves the customer's hands and
 * lands in a stranger's inbox. Two things have to hold: it must never contain a fact the
 * scan did not read, and it must never ask the developer to fix something we invented.
 */
import { describe, expect, it } from 'vitest'
import { buildHandoff, buildJsonLd, type HandoffInput } from '../src/handoff.ts'

const full: HandoffInput = {
  siteUrl: 'https://dental-hadar.co.il',
  businessName: 'דנטל סנטר הדר',
  city: 'חיפה',
  phone: '04-8123456',
  address: 'הרצל 12',
  entityType: 'Dentist',
  openingHours: ['Su-Th 08:00-19:00'],
  findings: [
    { findingType: 'NO_STRUCTURED_DATA', urls: ['https://dental-hadar.co.il/'] },
    { findingType: 'TITLE_LENGTH', urls: ['https://dental-hadar.co.il/about'] },
    { findingType: 'CLIENT_RENDERED', urls: ['https://dental-hadar.co.il/'] },
  ],
  language: 'he',
}

describe('the business card', () => {
  it('carries only what was actually read', () => {
    const parsed = JSON.parse(
      buildJsonLd(full)!.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, ''),
    )
    expect(parsed.name).toBe('דנטל סנטר הדר')
    expect(parsed.telephone).toBe('04-8123456')
    expect(parsed.address.addressLocality).toBe('חיפה')
    expect(parsed['@type']).toBe('Dentist')
  })

  it('leaves a field out entirely rather than stubbing it', () => {
    // A developer who pastes "telephone": "TODO" into production has been failed by us,
    // and a block that confidently states the wrong number is worse than a missing line.
    const json = buildJsonLd({ ...full, phone: null, address: null, openingHours: [] })!
    expect(json).not.toContain('telephone')
    expect(json).not.toContain('streetAddress')
    expect(json).not.toContain('openingHours')
    expect(json).not.toMatch(/TODO|xxx|placeholder|your-/i)
  })

  it('produces nothing at all when there is not even a name', () => {
    // A block carrying only @type is noise that looks like work.
    expect(buildJsonLd({ ...full, businessName: null })).toBeNull()
  })

  it('is valid JSON inside a script tag', () => {
    const block = buildJsonLd(full)!
    expect(block.startsWith('<script type="application/ld+json">')).toBe(true)
    expect(block.endsWith('</script>')).toBe(true)
    expect(() =>
      JSON.parse(block.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, '')),
    ).not.toThrow()
  })
})

describe('the note itself', () => {
  const handoff = buildHandoff(full)

  it('orders by what blocks the business, not by what the crawler shouted loudest', () => {
    const blocking = handoff.text.indexOf('JavaScript')
    const minor = handoff.text.indexOf('15–65')
    expect(blocking).toBeGreaterThan(-1)
    expect(minor).toBeGreaterThan(blocking)
  })

  it('names the affected addresses so nobody has to go looking', () => {
    expect(handoff.text).toContain('https://dental-hadar.co.il/about')
  })

  it('includes the ready block when the site has no business card', () => {
    expect(handoff.text).toContain('application/ld+json')
    expect(handoff.jsonLd).not.toBeNull()
  })

  it('does not attach a business card to a site that already has one', () => {
    const without = buildHandoff({
      ...full,
      findings: full.findings.filter((f) => f.findingType !== 'NO_STRUCTURED_DATA'),
    })
    expect(without.text).not.toContain('application/ld+json')
  })

  it('says plainly when there was not enough to build a block from', () => {
    const nameless = buildHandoff({ ...full, businessName: null })
    expect(nameless.jsonLd).toBeNull()
    expect(nameless.text).toContain('חסר שם עסק')
    expect(nameless.text).not.toContain('application/ld+json')
  })

  it('never invents a finding the scan did not produce', () => {
    const single = buildHandoff({
      ...full,
      findings: [{ findingType: 'MISSING_H1', urls: ['https://dental-hadar.co.il/'] }],
    })
    expect(single.text).not.toContain('JavaScript')
    expect(single.text).not.toContain('canonical')
    expect(single.text).toContain('H1')
  })

  it('drops a finding type it has no instruction for rather than printing its code name', () => {
    const unknown = buildHandoff({
      ...full,
      findings: [{ findingType: 'SOMETHING_NEW', urls: ['https://dental-hadar.co.il/'] }],
    })
    expect(unknown.text).not.toContain('SOMETHING_NEW')
  })

  it('counts how much of this genuinely needs a developer', () => {
    // The number the owner needs before deciding whether to forward it at all.
    expect(handoff.developerItems).toBe(2)
  })

  it('is plain text that survives being pasted into WhatsApp', () => {
    // Naming an element to a developer ("put it in the <head>") is prose, not markup.
    // What must not appear is layout: the moment this carries <p> and <div> it stops
    // being pasteable anywhere except an HTML email.
    expect(handoff.text).not.toMatch(/<\/?(p|div|span|br|a|ul|li|table|strong|em)\b/i)
    expect(handoff.text).not.toContain('\t')
    expect(handoff.text).not.toContain('&nbsp;')
  })
})

describe('English', () => {
  it('is written in English throughout, with no Hebrew left in', () => {
    const handoff = buildHandoff({ ...full, language: 'en', businessName: 'Hadar Dental' })
    // The business's own name may be Hebrew; the instructions may not be.
    const instructions = handoff.text.split('\n').filter((l) => !l.includes('ld+json'))
    expect(instructions.join('\n')).not.toMatch(/צריך|להוסיף|לתקן/)
    expect(handoff.text).toContain('SSR or pre-rendering')
  })
})
