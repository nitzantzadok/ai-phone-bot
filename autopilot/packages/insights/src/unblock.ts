/**
 * Which crawlers a customer must actually let in.
 *
 * This exists because the advice the product was giving did not work.
 *
 * Four separate places told a blocked customer to "allow GPTBot, ClaudeBot and
 * Google-Extended". All three of those are **training** crawlers. `ai-crawlers.ts` — the
 * file this product's central claim rests on — records exactly that: `affectsAnswers:
 * false`. Blocking them keeps a business out of a training set; it does not remove them
 * from a single answer. The crawlers that decide whether ChatGPT, Claude, Gemini and
 * Copilot can name a business are `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`,
 * `Claude-User`, `Googlebot` and `bingbot` — and not one of them was mentioned.
 *
 * So a customer could follow the instruction precisely, change their robots.txt exactly as
 * told, and remain invisible in ChatGPT. There is no worse failure available to a product
 * whose entire promise is that it knows why.
 *
 * The list is therefore derived from the registry rather than written out, so the advice
 * cannot drift from the taxonomy again the next time a crawler is added or renamed.
 */
import { AI_CRAWLERS, type AiCrawler } from '@autopilot/crawler/ai-crawlers.ts'

export type Language = 'he' | 'en'

/** The ones whose exclusion can remove a business from an assistant's answers. */
export const answerCrawlers = (): readonly AiCrawler[] => AI_CRAWLERS.filter((c) => c.affectsAnswers)

/** The ones that only collect pages for training. Blocking these is a legitimate choice. */
export const trainingCrawlers = (): readonly AiCrawler[] =>
  AI_CRAWLERS.filter((c) => !c.affectsAnswers)

const agents = (list: readonly AiCrawler[]): string => list.map((c) => c.userAgent).join(', ')

/** The user-agent tokens to allow, as one comma-separated string for prose. */
export const answerCrawlerAgents = (): string => agents(answerCrawlers())

/** The user-agent tokens that are safe to keep blocked, as one comma-separated string. */
export const trainingCrawlerAgents = (): string => agents(trainingCrawlers())

export interface UnblockAdvice {
  /** What to allow, and why these names and not the famous ones. */
  readonly action: string
  /** That blocking the training crawlers remains a real and defensible choice. */
  readonly training: string
}

/**
 * What to tell somebody whose site is refusing crawlers.
 *
 * Both sentences matter. The first is the fix. The second exists so that a business which
 * deliberately opted out of AI training is not frightened into reversing a decision that
 * costs them nothing — telling them that is as much a part of being right as the fix is.
 */
export const unblockAdvice = (language: Language): UnblockAdvice => {
  const he = language === 'he'
  return {
    action: he
      ? `אפשרו את הסורקים האלה בדיוק: ${answerCrawlerAgents()}. אלה הסורקים שקובעים אם תופיעו בתשובה — לא GPTBot ולא ClaudeBot, שאותם מזכירים בדרך כלל.`
      : `Allow exactly these: ${answerCrawlerAgents()}. These are the crawlers that decide whether you appear in an answer — not GPTBot or ClaudeBot, which are the ones usually named.`,
    training: he
      ? `${trainingCrawlerAgents()} הם סורקי אימון. חסימה שלהם היא בחירה לגיטימית והיא לא מוציאה אתכם משום תשובה, אז אין צורך לשנות אותה אם היא נעשתה בכוונה.`
      : `${trainingCrawlerAgents()} are training crawlers. Blocking them is a legitimate choice that removes you from no answer at all, so there is no need to reverse it if it was deliberate.`,
  }
}
