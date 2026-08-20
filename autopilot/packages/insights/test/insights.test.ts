import { describe, expect, it } from 'vitest'
import type { Opportunity } from '@autopilot/optimization/diagnosis.ts'
import { INSIGHTS, insightsFor, prioritizedInsights } from '../src/catalogue.ts'
import { buildPlaybook, starterChecklist } from '../src/playbook.ts'
import {
  GOOGLE_GUIDE,
  PLATFORM_GUIDES,
  platformById,
  platformsForPicker,
} from '../src/platforms.ts'

const opportunity = (o: Partial<Opportunity> = {}): Opportunity => ({
  dedupeKey: 'attribute-gap:romantic',
  title: 'AI does not associate you with Romantic',
  explanation: '8 of the 24 questions we monitor depend on it.',
  category: 'CONTENT',
  controllability: 'CONTROLLED',
  riskTier: 'MEDIUM',
  businessValue: 0.8,
  promptReach: 8,
  recommendationGap: 0.7,
  expectedLift: 0.3,
  confidence: 0.7,
  controllabilityFactor: 1,
  estimatedCost: 1,
  score: 2,
  evidence: { attributeKey: 'romantic' },
  autoFixable: true,
  suggestedActionType: 'ADD_CONTENT_SECTION',
  ...o,
})

describe('the insight catalogue', () => {
  it('gives every insight both languages, steps, and a way to know it worked', () => {
    for (const insight of INSIGHTS) {
      expect(insight.title.he.length, insight.key).toBeGreaterThan(5)
      expect(insight.title.en.length, insight.key).toBeGreaterThan(5)
      expect(insight.why.he).toMatch(/[֐-׿]/)
      expect(insight.steps.length, insight.key).toBeGreaterThan(0)
      expect(insight.howYouWillKnow.he.length, insight.key).toBeGreaterThan(10)
      for (const step of insight.steps) {
        expect(step.he).toMatch(/[֐-׿]/)
        expect(step.en.length).toBeGreaterThan(10)
      }
    }
  })

  it('writes in plain language, with no SEO jargon anywhere', () => {
    const everything = INSIGHTS.map((i) =>
      [i.title.en, i.why.en, ...i.steps.map((s) => s.en)].join(' '),
    ).join(' ')
    expect(everything).not.toMatch(/E-E-A-T|backlink|link juice|keyword density|SERP|crawl budget/i)
  })

  it('never recommends anything manipulative, and says so explicitly', () => {
    const forbidden = INSIGHTS.find((i) => i.key === 'never_do_this')
    expect(forbidden).toBeDefined()
    const text = forbidden!.steps.map((s) => s.en).join(' ').toLowerCase()
    expect(text).toContain('fake reviews')
    expect(text).toContain('hidden text')
  })

  it('labels outside coverage as not ours to control, and refuses to sell it', () => {
    const authority = INSIGHTS.find((i) => i.key === 'external_coverage')!
    expect(authority.controllability).toBe('NOT_CONTROLLED')
    expect(authority.weDoThisForYou).toBe(false)
    expect(authority.why.en).toContain('will not try')
  })

  it('ranks work we can do today above work that depends on other people', () => {
    const ranked = prioritizedInsights('restaurant')
    const firstExternal = ranked.findIndex((i) => i.controllability === 'NOT_CONTROLLED')
    const lastControlled = ranked.map((i) => i.controllability).lastIndexOf('CONTROLLED')
    expect(firstExternal).toBeGreaterThan(0)
    expect(ranked[0]!.controllability).toBe('CONTROLLED')
    expect(lastControlled).toBeGreaterThan(-1)
  })

  it('promotes a category we actually measured as weak', () => {
    const baseline = prioritizedInsights('restaurant')
    const weighted = prioritizedInsights('restaurant', { weakCategories: ['STRUCTURE'] })
    const rankOf = (list: readonly { key: string }[], key: string) =>
      list.findIndex((i) => i.key === key)
    expect(rankOf(weighted, 'structured_data')).toBeLessThan(rankOf(baseline, 'structured_data'))
  })

  it('returns universal insights for every vertical', () => {
    for (const vertical of ['restaurant', 'lawyer', 'gym', 'unknown_vertical']) {
      expect(insightsFor(vertical).length, vertical).toBeGreaterThan(5)
    }
  })
})

describe('buildPlaybook', () => {
  it('leads with what we measured, not with general advice', () => {
    const playbook = buildPlaybook({
      vertical: 'restaurant',
      language: 'en',
      businessName: 'Rosa',
      opportunities: [opportunity()],
    })
    expect(playbook.items[0]!.kind).toBe('MEASURED')
    expect(playbook.items[0]!.evidence).toBeDefined()
    expect(playbook.headline).toContain('Rosa')
    expect(playbook.headline).toContain('measurement')
  })

  it('suppresses generic advice on a category we already have a finding for', () => {
    const playbook = buildPlaybook({
      vertical: 'restaurant',
      language: 'en',
      // A CONTENT opportunity evidences the ATTRIBUTES insight category.
      opportunities: [opportunity({ category: 'CONTENT' })],
    })
    const general = playbook.items.filter((i) => i.kind === 'GENERAL')
    expect(general.some((i) => i.title.includes('what you are good for'))).toBe(false)
  })

  it('keeps uncontrollable items out of the task list entirely', () => {
    const playbook = buildPlaybook({
      vertical: 'restaurant',
      language: 'en',
      opportunities: [opportunity({ controllability: 'NOT_CONTROLLED', autoFixable: false })],
    })
    expect(playbook.items.every((i) => i.controllability !== 'NOT_CONTROLLED')).toBe(true)
    expect(playbook.outsideOurControl.length).toBeGreaterThan(0)
  })

  it('says plainly when nothing has been measured yet', () => {
    const playbook = buildPlaybook({ vertical: 'restaurant', language: 'en' })
    expect(playbook.headline).toContain('have not measured')
    expect(playbook.items.every((i) => i.kind === 'GENERAL')).toBe(true)
  })

  it('produces a fully Hebrew playbook, findings included', () => {
    // Opportunities arrive already localized by the diagnosis engine, which takes the
    // customer's language. A Hebrew customer must never see Hebrew advice interleaved
    // with English findings.
    const playbook = buildPlaybook({
      vertical: 'restaurant',
      language: 'he',
      opportunities: [
        opportunity({
          title: 'ה-AI לא מקשר ביניכם לבין רומנטי',
          explanation: '8 מתוך 24 השאלות שאנחנו עוקבים אחריהן תלויות ברומנטיות.',
        }),
      ],
    })
    expect(playbook.headline).toMatch(/[֐-׿]/)
    for (const item of playbook.items) {
      expect(item.why).toMatch(/[֐-׿]/)
      for (const step of item.steps) expect(step).toMatch(/[֐-׿]/)
    }
  })

  it('caps general advice so a real diagnosis is never buried', () => {
    const playbook = buildPlaybook({
      vertical: 'restaurant',
      language: 'en',
      opportunities: [opportunity()],
      maxGeneral: 2,
    })
    expect(playbook.items.filter((i) => i.kind === 'GENERAL')).toHaveLength(2)
  })

  it('marks which items we do for the customer and which need them', () => {
    const playbook = buildPlaybook({
      vertical: 'restaurant',
      language: 'en',
      opportunities: [opportunity({ autoFixable: false, suggestedActionType: null })],
    })
    const manual = playbook.items.find((i) => i.kind === 'MEASURED')!
    expect(manual.weDoThisForYou).toBe(false)
    expect(manual.steps[0]).toContain('needs a decision from you')
  })
})

describe('starterChecklist', () => {
  it('is short, free, controllable and immediately actionable', () => {
    const checklist = starterChecklist('he')
    expect(checklist).toHaveLength(4)
    for (const item of checklist) {
      expect(item.controllability).toBe('CONTROLLED')
      expect(item.steps.length).toBeGreaterThan(0)
      expect(item.title).toMatch(/[֐-׿]/)
    }
  })
})


describe('platform guides', () => {
  it('covers the platforms Israeli small businesses actually use', () => {
    const ids = PLATFORM_GUIDES.map((p) => p.id)
    for (const id of ['wordpress', 'wix', 'shopify', 'webflow', 'squarespace', 'custom', 'none']) {
      expect(ids, id).toContain(id)
    }
  })

  it('writes every step in both languages, followable by a non-technical owner', () => {
    for (const guide of [...PLATFORM_GUIDES, GOOGLE_GUIDE]) {
      expect(guide.steps.length, guide.id).toBeGreaterThan(0)
      for (const step of guide.steps) {
        expect(step.he, guide.id).toMatch(/[֐-׿]/)
        expect(step.en.length, guide.id).toBeGreaterThan(15)
      }
      expect(guide.summary.he).toMatch(/[֐-׿]/)
      expect(guide.whatYouGet.he).toMatch(/[֐-׿]/)
    }
  })

  it('uses no developer jargon in the guides a business owner reads', () => {
    const consumerFacing = PLATFORM_GUIDES.filter((p) => p.id !== 'custom')
    const text = consumerFacing
      .flatMap((g) => g.steps.map((s) => s.en))
      .join(' ')
    expect(text).not.toMatch(/\bAPI\b|OAuth|endpoint|webhook|JSON/i)
  })

  it('states the limitation plainly wherever we cannot write automatically', () => {
    for (const guide of PLATFORM_GUIDES) {
      if (guide.writeSupport === 'AUTOMATIC') continue
      expect(guide.limitation ?? guide.summary, guide.id).toBeDefined()
    }
    const wix = platformById('wix')
    expect(wix.writeSupport).toBe('GUIDED')
    expect(wix.limitation!.en).toContain('no interface that lets us change the site')
  })

  it('never claims a platform is supported when it is not', () => {
    for (const id of ['shopify', 'webflow'] as const) {
      const guide = platformById(id)
      expect(guide.writeSupport).toBe('PLANNED')
      expect(guide.limitation!.en).toMatch(/not supported yet/)
    }
  })

  it('orders the picker by how common the platform is', () => {
    const ordered = platformsForPicker()
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.popularity).toBeLessThanOrEqual(ordered[i - 1]!.popularity)
    }
  })

  it('falls back rather than throwing on an unknown platform', () => {
    expect(platformById('nonsense' as never).id).toBeTruthy()
  })

  it('promises Google connection without ever asking for a password', () => {
    expect(GOOGLE_GUIDE.summary.en).toContain('never ask for your password')
    expect(GOOGLE_GUIDE.summary.en).toContain('read-only')
    expect(GOOGLE_GUIDE.limitation!.en).toContain('off by default')
  })

  it('keeps every guide short enough that someone will actually finish it', () => {
    for (const guide of PLATFORM_GUIDES) {
      expect(guide.steps.length, guide.id).toBeLessThanOrEqual(6)
      expect(guide.timeMinutes, guide.id).toBeLessThanOrEqual(5)
    }
  })
})
