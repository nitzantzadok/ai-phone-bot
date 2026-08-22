import { getPlan, type PlanCode } from '@autopilot/billing/plans.ts'

/**
 * What a single request is allowed to spend.
 *
 * The plan limits describe a *month*. Handing a monthly ceiling to one page render is the
 * whole month's budget available on every refresh — ten reloads of the dashboard would
 * spend ten months of allowance, and nothing in the request path notices. A per-request
 * ceiling is a different number from a per-month ceiling, and conflating them is how a
 * SaaS discovers its margin through its provider invoice.
 *
 * Until usage is metered in a database, the safe assumption is that any request may repeat
 * far more often than a month's plan allows, so the per-request ceiling is set from what a
 * single useful measurement costs — not from what the customer is entitled to overall.
 */

/**
 * A measured question costs roughly 12–15 agorot with search grounding. Thirty of them is
 * a meaningful sample and about ₪4, which is a rounding error against a ₪699 plan even if
 * a customer reloads all day.
 */
const PER_REQUEST_CEILING_MINOR = 450

export interface RequestBudget {
  readonly measureAi: boolean
  readonly maxPrompts: number
  readonly maxSpendMinor: number
  readonly maxPages: number
}

/**
 * The budget for a signed-in customer's dashboard.
 *
 * Never more than the plan allows, and never more than one request should cost.
 */
export const dashboardBudget = (planCode: PlanCode): RequestBudget => {
  const plan = getPlan(planCode)

  // Measuring is what a paid plan buys. Deciding this from `prompt_execution > 0` let the
  // free tier measure too — and since choosing a plan currently costs nothing, that made
  // the dashboard exactly as exposed as the public endpoint we just closed.
  const paid = plan.monthlyNet !== null

  // Never more than a tenth of the month in one render, whatever the plan. A `min` against
  // the monthly cap is not enough on a small plan, where the two numbers meet and a single
  // refresh becomes the entire allowance.
  const shareOfMonth = Math.floor(plan.limits.monthlySpendCapMinor / 10)

  return {
    measureAi: paid,
    maxPrompts: Math.min(30, plan.limits.monitored_prompts),
    maxSpendMinor: paid ? Math.min(PER_REQUEST_CEILING_MINOR, shareOfMonth) : 0,
    maxPages: Math.min(20, plan.limits.crawl_page),
  }
}

/**
 * The budget for the public free scan.
 *
 * `measureAi: false`, deliberately and permanently. The site half is genuinely free to
 * run — it costs a crawl — and it is the half that produces the fixes. Asking a real AI
 * engine costs real money per question, and an endpoint that spends it for anyone who
 * types a URL is a stranger's hand on the owner's card: at the rate limit alone that is
 * hundreds of shekels a day per address, and the limit is per instance, in memory.
 *
 * It is also the better product. The measurement is what a subscription buys, so a free
 * scan that shows exactly which questions would be asked — and that they are not being
 * asked yet — is a sharper reason to sign up than one that gives the answer away.
 */
export const freeScanBudget = (): RequestBudget => ({
  measureAi: false,
  maxPrompts: 24,
  maxSpendMinor: 0,
  maxPages: 12,
})
