/**
 * The advice has to match the taxonomy the product is built on.
 *
 * Four places told a blocked customer to allow GPTBot, ClaudeBot and Google-Extended. All
 * three are training crawlers — `ai-crawlers.ts` says so, `affectsAnswers: false` — and not
 * one of the crawlers that actually decide whether ChatGPT, Claude, Gemini or Copilot can
 * name a business was mentioned. A customer could follow that instruction to the letter and
 * stay invisible. These tests exist so the advice can never drift from the registry again.
 */
import { describe, expect, it } from 'vitest'
import { AI_CRAWLERS } from '@autopilot/crawler/ai-crawlers.ts'
import {
  answerCrawlerAgents,
  answerCrawlers,
  trainingCrawlerAgents,
  trainingCrawlers,
  unblockAdvice,
} from '../src/unblock.ts'

describe('which crawlers the advice names', () => {
  it('splits the registry cleanly, with nothing lost', () => {
    expect(answerCrawlers().length + trainingCrawlers().length).toBe(AI_CRAWLERS.length)
    expect(answerCrawlers().every((c) => c.affectsAnswers)).toBe(true)
    expect(trainingCrawlers().every((c) => !c.affectsAnswers)).toBe(true)
  })

  it('names every crawler that can remove a business from an answer', () => {
    const named = answerCrawlerAgents()
    for (const crawler of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'Googlebot', 'PerplexityBot', 'bingbot']) {
      expect(named, crawler).toContain(crawler)
    }
  })

  it('does not put a training crawler on the list to allow', () => {
    const named = answerCrawlerAgents()
    for (const crawler of ['GPTBot', 'ClaudeBot', 'Google-Extended']) {
      expect(named, crawler).not.toContain(crawler)
    }
    expect(trainingCrawlerAgents()).toContain('GPTBot')
  })
})

describe('what the customer is told', () => {
  for (const language of ['he', 'en'] as const) {
    it(`gives the fix and the reassurance in ${language}`, () => {
      const advice = unblockAdvice(language)
      // The fix.
      expect(advice.action).toContain('OAI-SearchBot')
      expect(advice.action).toContain('Googlebot')
      // And the part that stops somebody reversing a deliberate, harmless decision.
      expect(advice.training).toContain('GPTBot')
      expect(advice.action.length).toBeGreaterThan(60)
      expect(advice.training.length).toBeGreaterThan(60)
    })
  }

  it('says outright that the famous names are not the ones that matter', () => {
    // Without this the advice reads as a list, and a customer who has already allowed
    // GPTBot concludes they are done.
    expect(unblockAdvice('en').action).toContain('GPTBot')
    expect(unblockAdvice('he').action).toContain('GPTBot')
  })
})
