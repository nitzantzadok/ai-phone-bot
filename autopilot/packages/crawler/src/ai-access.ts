/**
 * Whether each assistant is actually allowed to read this site.
 *
 * The question the whole product exists to answer, asked directly for once, of the file
 * that decides it. Everything upstream measures whether a site *could* be read; this asks
 * whether the specific software behind each assistant has been told it *may*.
 *
 * The result is deliberately per assistant rather than a single verdict, because the
 * answer genuinely differs per assistant and a customer's next action depends on which one
 * is blocked. "ChatGPT cannot read you, Gemini can" is a sentence somebody acts on. "Your
 * robots.txt has an issue" is not.
 *
 * One distinction is carried carefully all the way through: a training crawler and a
 * retrieval crawler are not the same thing. Blocking `GPTBot` keeps a site out of OpenAI's
 * training data and does nothing to how ChatGPT answers a question about the business
 * today. Plenty of businesses block it on purpose and are right to. Reporting that as lost
 * visibility would be alarming, wrong, and the fastest way to teach a customer that this
 * report exaggerates.
 */
import { AI_CRAWLERS, ASSISTANT_NAME, type AiCrawler, type Assistant } from './ai-crawlers.ts'
import { isAllowed, type RobotsTxt } from './robots.ts'

export type AccessVerdict =
  /** Every crawler that feeds this assistant's answers may read the site. */
  | 'ALLOWED'
  /** A crawler that feeds this assistant's answers is disallowed. */
  | 'BLOCKED'
  /** Only a training crawler is disallowed. Answers are unaffected. */
  | 'TRAINING_ONLY_BLOCKED'

export interface CrawlerAccess {
  readonly crawler: AiCrawler
  readonly allowed: boolean
}

export interface AssistantAccess {
  readonly assistant: Assistant
  readonly name: string
  readonly verdict: AccessVerdict
  readonly crawlers: readonly CrawlerAccess[]
  /** The user-agent tokens that are disallowed and do affect answers. */
  readonly blockedAgents: readonly string[]
}

export interface AiAccessReport {
  readonly assistants: readonly AssistantAccess[]
  /** Assistants that cannot read the site at all. */
  readonly blocked: readonly AssistantAccess[]
  /** True when the site has no robots.txt, in which case everything is permitted. */
  readonly noRobotsFile: boolean
}

/**
 * Evaluates the site's robots.txt for every assistant.
 *
 * Checked against the home page rather than the whole site: a rule that excludes one
 * subdirectory is a normal, intentional configuration, while one that excludes the home
 * page is what removes a business from answers. Path-specific exclusions surface through
 * the ordinary crawl instead, where they belong.
 */
export const checkAiAccess = (
  robots: RobotsTxt,
  siteUrl: string,
  robotsTxtFound: boolean,
): AiAccessReport => {
  const home = (() => {
    try {
      return new URL('/', siteUrl).toString()
    } catch {
      return siteUrl
    }
  })()

  const byAssistant = new Map<Assistant, CrawlerAccess[]>()
  for (const crawler of AI_CRAWLERS) {
    const entry = byAssistant.get(crawler.assistant) ?? []
    entry.push({ crawler, allowed: isAllowed(robots, home, crawler.userAgent) })
    byAssistant.set(crawler.assistant, entry)
  }

  const assistants: AssistantAccess[] = [...byAssistant].map(([assistant, crawlers]) => {
    const blockedAgents = crawlers
      .filter((c) => !c.allowed && c.crawler.affectsAnswers)
      .map((c) => c.crawler.userAgent)

    const trainingBlocked = crawlers.some((c) => !c.allowed && !c.crawler.affectsAnswers)

    const verdict: AccessVerdict =
      blockedAgents.length > 0 ? 'BLOCKED' : trainingBlocked ? 'TRAINING_ONLY_BLOCKED' : 'ALLOWED'

    return { assistant, name: ASSISTANT_NAME[assistant], verdict, crawlers, blockedAgents }
  })

  return {
    assistants,
    blocked: assistants.filter((a) => a.verdict === 'BLOCKED'),
    noRobotsFile: !robotsTxtFound,
  }
}
