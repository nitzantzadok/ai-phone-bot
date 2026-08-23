/**
 * The inversion this file exists to prevent.
 *
 * A site that allows `*` and disallows `OAI-SearchBot` crawls perfectly for us. Before
 * this check the report read every page, found the business well described, and said the
 * site was healthy — while ChatGPT had been told in writing to stay out. Everything else
 * the product measures is worthless on a site in that state, because it is measuring how
 * well a locked door is decorated.
 */
import { describe, expect, it } from 'vitest'
import { checkAiAccess } from '../src/ai-access.ts'
import { parseRobotsTxt } from '../src/robots.ts'
import { AI_CRAWLERS } from '../src/ai-crawlers.ts'

const SITE = 'https://dental-hadar.co.il'
const check = (robotsTxt: string, found = true) =>
  checkAiAccess(parseRobotsTxt(robotsTxt), SITE, found)

const forAssistant = (robotsTxt: string, assistant: string) =>
  check(robotsTxt).assistants.find((a) => a.assistant === assistant)!

describe('a site that welcomes everyone', () => {
  const report = check('User-agent: *\nAllow: /\n')

  it('reports every assistant allowed', () => {
    expect(report.blocked).toEqual([])
    expect(report.assistants.every((a) => a.verdict === 'ALLOWED')).toBe(true)
  })

  it('covers every assistant, not just the ones we happened to think of', () => {
    const named = new Set(AI_CRAWLERS.map((c) => c.assistant))
    expect(report.assistants).toHaveLength(named.size)
  })
})

describe('no robots.txt at all', () => {
  it('is permission to read, which is what every crawler assumes', () => {
    const report = check('', false)
    expect(report.blocked).toEqual([])
    expect(report.noRobotsFile).toBe(true)
  })
})

describe('the configuration that used to read as healthy', () => {
  /* Allows everyone, then singles out the crawlers that feed ChatGPT. Our own crawl sails
     straight through it. */
  const robots = `User-agent: *
Allow: /

User-agent: OAI-SearchBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /
`

  it('reports ChatGPT as blocked', () => {
    const chatgpt = forAssistant(robots, 'CHATGPT')
    expect(chatgpt.verdict).toBe('BLOCKED')
    expect([...chatgpt.blockedAgents].sort()).toEqual(['ChatGPT-User', 'OAI-SearchBot'])
  })

  it('does not smear the finding across assistants that are fine', () => {
    // "ChatGPT cannot read you, Gemini can" is a sentence somebody acts on.
    for (const assistant of ['CLAUDE', 'GEMINI', 'PERPLEXITY', 'COPILOT']) {
      expect(forAssistant(robots, assistant).verdict).toBe('ALLOWED')
    }
    expect(check(robots).blocked.map((a) => a.assistant)).toEqual(['CHATGPT'])
  })
})

describe('training and retrieval are not the same thing', () => {
  it('does not call a business invisible for opting out of training', () => {
    // Blocking GPTBot keeps a site out of OpenAI's training data and changes nothing about
    // how ChatGPT answers a question about the business today. Plenty of businesses do it
    // deliberately and are right to.
    const chatgpt = forAssistant('User-agent: GPTBot\nDisallow: /\n', 'CHATGPT')
    expect(chatgpt.verdict).toBe('TRAINING_ONLY_BLOCKED')
    expect(chatgpt.blockedAgents).toEqual([])
  })

  it('says the same about Google-Extended, which does not touch Search', () => {
    const gemini = forAssistant('User-agent: Google-Extended\nDisallow: /\n', 'GEMINI')
    expect(gemini.verdict).toBe('TRAINING_ONLY_BLOCKED')
  })

  it('still reports BLOCKED when a retrieval crawler is disallowed alongside training', () => {
    const gemini = forAssistant(
      'User-agent: Google-Extended\nDisallow: /\n\nUser-agent: Googlebot\nDisallow: /\n',
      'GEMINI',
    )
    expect(gemini.verdict).toBe('BLOCKED')
    expect(gemini.blockedAgents).toEqual(['Googlebot'])
  })
})

describe('a site that blocks everything', () => {
  it('reports every assistant blocked', () => {
    const report = check('User-agent: *\nDisallow: /\n')
    expect(report.blocked).toHaveLength(report.assistants.length)
  })

  it('is not fooled by an Allow that does not cover the home page', () => {
    const report = check('User-agent: *\nDisallow: /\nAllow: /blog\n')
    expect(report.blocked.length).toBeGreaterThan(0)
  })
})

describe('what it deliberately does not report', () => {
  it('ignores a rule that excludes only a subdirectory', () => {
    // Excluding /wp-admin or /cart is normal and intentional. Only the home page being
    // excluded is what removes a business from answers.
    const report = check('User-agent: *\nDisallow: /wp-admin/\nDisallow: /cart\n')
    expect(report.blocked).toEqual([])
  })

  it('honours an Allow that re-opens the home page after a broad Disallow', () => {
    // Longest match wins, and Allow beats Disallow at equal length.
    const report = check('User-agent: *\nDisallow: /\nAllow: /$\n')
    expect(report.blocked).toEqual([])
  })
})

describe('robustness', () => {
  it('does not throw on a site URL that will not parse', () => {
    expect(() => checkAiAccess(parseRobotsTxt('User-agent: *\nDisallow: /'), 'not a url', true))
      .not.toThrow()
  })

  it('treats the user-agent token case-insensitively, as the specification requires', () => {
    const chatgpt = forAssistant('User-agent: oai-searchbot\nDisallow: /\n', 'CHATGPT')
    expect(chatgpt.verdict).toBe('BLOCKED')
  })
})

describe('the order they are read in', () => {
  it('groups the blocked ones first', () => {
    // Scattered through a grid, two blocked assistants among three healthy ones make the
    // reader hunt for the bad news. Grouped, it reads as one fact.
    const report = check(`User-agent: *
Allow: /

User-agent: OAI-SearchBot
Disallow: /

User-agent: PerplexityBot
Disallow: /
`)
    const verdicts = report.assistants.map((a) => a.verdict)
    expect(verdicts.slice(0, 2)).toEqual(['BLOCKED', 'BLOCKED'])
    expect(verdicts.slice(2).every((v) => v === 'ALLOWED')).toBe(true)
  })

  it('puts training-only between blocked and allowed', () => {
    const report = check(`User-agent: OAI-SearchBot
Disallow: /

User-agent: Google-Extended
Disallow: /
`)
    const order = report.assistants.map((a) => a.verdict)
    expect(order.indexOf('TRAINING_ONLY_BLOCKED')).toBeGreaterThan(order.indexOf('BLOCKED'))
    expect(order.indexOf('TRAINING_ONLY_BLOCKED')).toBeLessThan(order.indexOf('ALLOWED'))
  })
})
