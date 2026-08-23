/**
 * The programs that actually read a website on behalf of an AI assistant.
 *
 * This file is the load-bearing one for the product's central claim. Everything else
 * measures whether a site is *readable*; this decides whether the specific software behind
 * ChatGPT, Claude, Gemini, Perplexity and Copilot is *permitted* to read it — and those are
 * different questions with different answers.
 *
 * The gap this closes was an outright inversion. The crawl checked one thing: is *our*
 * crawler allowed. A site that says
 *
 *     User-agent: *
 *     Allow: /
 *
 *     User-agent: GPTBot
 *     Disallow: /
 *
 * crawls perfectly for us and is invisible to ChatGPT. We would have read every page,
 * found the business well described, and reported a healthy site — while the one assistant
 * the customer cares most about had been told, in writing, to stay out. That configuration
 * is not exotic; a great many sites added AI-crawler blocks between 2023 and 2025, often
 * through a plugin toggle or a hosting provider's default, and frequently without the
 * owner knowing it happened.
 *
 * Two properties of these crawlers matter, and both are encoded here:
 *
 *  - **Permission** is per user-agent in robots.txt, so it has to be evaluated per bot.
 *  - **JavaScript** is not executed by any of the AI crawlers below. A page whose text is
 *    drawn by script is blank to them. Googlebot does render, which is why a site can be
 *    fine in Google Search and empty to ChatGPT — the single most confusing result a
 *    customer can get, and one the report has to be able to explain.
 *
 * On accuracy: these names are published by the operators and are stable, but the list
 * does change as products launch and get renamed. It is written to fail safe — an
 * unrecognised crawler is simply not checked, never guessed at — and `NOTE` records what a
 * reader should re-verify against each operator's own documentation before relying on a
 * detail commercially.
 */

/** Which assistant a customer would recognise, rather than which company ships the bot. */
export type Assistant = 'CHATGPT' | 'CLAUDE' | 'GEMINI' | 'PERPLEXITY' | 'COPILOT'

export type CrawlerPurpose =
  /** Builds the index the assistant searches when answering. */
  | 'SEARCH_INDEX'
  /** Fetches a page live, because a user's question needs it right now. */
  | 'LIVE_FETCH'
  /** Collects pages used to train models. Blocking it does not remove you from answers. */
  | 'TRAINING'

export interface AiCrawler {
  /** The token as it appears in a robots.txt User-agent line. */
  readonly userAgent: string
  readonly assistant: Assistant
  readonly purpose: CrawlerPurpose
  /**
   * Whether blocking this one can remove the business from that assistant's answers.
   *
   * False for training crawlers: a site excluded from a training set is still retrieved
   * and cited live. Conflating the two is how a report tells somebody their ChatGPT
   * visibility is destroyed when they have merely opted out of training, which is a
   * legitimate choice many businesses make deliberately.
   */
  readonly affectsAnswers: boolean
}

/**
 * NOTE: verify against each operator's published documentation before relying on this
 * commercially — platforms rename and add crawlers.
 */
export const AI_CRAWLERS: readonly AiCrawler[] = [
  // OpenAI
  { userAgent: 'OAI-SearchBot', assistant: 'CHATGPT', purpose: 'SEARCH_INDEX', affectsAnswers: true },
  { userAgent: 'ChatGPT-User', assistant: 'CHATGPT', purpose: 'LIVE_FETCH', affectsAnswers: true },
  { userAgent: 'GPTBot', assistant: 'CHATGPT', purpose: 'TRAINING', affectsAnswers: false },

  // Anthropic
  { userAgent: 'Claude-SearchBot', assistant: 'CLAUDE', purpose: 'SEARCH_INDEX', affectsAnswers: true },
  { userAgent: 'Claude-User', assistant: 'CLAUDE', purpose: 'LIVE_FETCH', affectsAnswers: true },
  { userAgent: 'ClaudeBot', assistant: 'CLAUDE', purpose: 'TRAINING', affectsAnswers: false },

  // Google. Googlebot builds the index Gemini's grounded answers draw on, so blocking it
  // removes the business from those answers. Google-Extended governs training and
  // Gemini-side use and does not affect Search indexing at all.
  { userAgent: 'Googlebot', assistant: 'GEMINI', purpose: 'SEARCH_INDEX', affectsAnswers: true },
  { userAgent: 'Google-Extended', assistant: 'GEMINI', purpose: 'TRAINING', affectsAnswers: false },

  // Perplexity
  { userAgent: 'PerplexityBot', assistant: 'PERPLEXITY', purpose: 'SEARCH_INDEX', affectsAnswers: true },
  { userAgent: 'Perplexity-User', assistant: 'PERPLEXITY', purpose: 'LIVE_FETCH', affectsAnswers: true },

  // Microsoft Copilot grounds on the Bing index.
  { userAgent: 'bingbot', assistant: 'COPILOT', purpose: 'SEARCH_INDEX', affectsAnswers: true },
]

/** What a customer calls each assistant. */
export const ASSISTANT_NAME: Readonly<Record<Assistant, string>> = {
  CHATGPT: 'ChatGPT',
  CLAUDE: 'Claude',
  GEMINI: 'Gemini',
  PERPLEXITY: 'Perplexity',
  COPILOT: 'Copilot',
}

/**
 * None of these execute JavaScript.
 *
 * Googlebot is the exception and it is deliberately not listed: it renders, which is
 * exactly why a site can rank in Google Search and be completely blank to ChatGPT. A
 * report that cannot explain that difference cannot explain the most confusing result a
 * customer ever gets from it.
 */
export const RENDERS_JAVASCRIPT: Readonly<Record<string, boolean>> = {
  Googlebot: true,
}

export const rendersJavaScript = (userAgent: string): boolean =>
  RENDERS_JAVASCRIPT[userAgent] ?? false
