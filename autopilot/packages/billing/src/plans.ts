/**
 * Plan catalogue.
 *
 * Prices are NET, following the Israeli SaaS convention of quoting "+ VAT". The limits are
 * not marketing copy: the metering layer enforces them, which is what stops a single
 * customer from consuming more AI spend than their subscription covers.
 */
import { majorUnits, type Money } from '@autopilot/shared/money.ts'

export type PlanCode = 'FREE_SCAN' | 'STARTER' | 'GROWTH' | 'PRO' | 'AGENCY'

export type UsageMetric =
  | 'prompt_execution'
  | 'crawl_page'
  | 'ai_tokens'
  | 'optimization'
  | 'monitored_prompts'
  | 'businesses'

export interface PlanLimits extends Record<UsageMetric, number> {
  /** Ceiling on AI/search spend per month, in minor units. The margin guardrail. */
  monthlySpendCapMinor: number
  /** Burst protection: executions allowed in a single hour. */
  hourlyExecutionCap: number
}

export interface Plan {
  readonly code: PlanCode
  readonly name: string
  readonly labels: Readonly<Record<string, string>>
  readonly monthlyNet: Money | null
  readonly annualNet: Money | null
  readonly trialDays: number
  readonly limits: PlanLimits
  readonly features: readonly string[]
  /** Highest autonomy this plan may select. */
  readonly maxAutonomy: 'MONITOR' | 'RECOMMEND' | 'AUTO_SAFE' | 'AUTOPILOT'
  readonly sortOrder: number
}

/**
 * The launch plan is a single paid tier at the price the business case is built on.
 * The others exist so the schema and the limit machinery are exercised from day one,
 * but the MVP sells GROWTH.
 */
export const PLANS: Readonly<Record<PlanCode, Plan>> = {
  FREE_SCAN: {
    code: 'FREE_SCAN',
    name: 'Free scan',
    labels: { en: 'Free scan', he: 'סריקה חינם' },
    monthlyNet: null,
    annualNet: null,
    trialDays: 0,
    limits: {
      prompt_execution: 30,
      crawl_page: 25,
      ai_tokens: 200_000,
      optimization: 0,
      monitored_prompts: 15,
      businesses: 1,
      // A free scan must never be able to cost real money at scale.
      monthlySpendCapMinor: 300,
      hourlyExecutionCap: 30,
    },
    features: ['one_off_scan', 'top_opportunities'],
    maxAutonomy: 'MONITOR',
    sortOrder: 0,
  },
  STARTER: {
    code: 'STARTER',
    name: 'Starter',
    labels: { en: 'Starter', he: 'התחלה' },
    monthlyNet: majorUnits(349, 'ILS'),
    annualNet: majorUnits(3490, 'ILS'),
    trialDays: 14,
    limits: {
      prompt_execution: 600,
      crawl_page: 300,
      ai_tokens: 4_000_000,
      optimization: 10,
      monitored_prompts: 40,
      businesses: 1,
      monthlySpendCapMinor: 6_000,
      hourlyExecutionCap: 120,
    },
    features: ['monitoring', 'diagnosis', 'recommendations', 'weekly_report'],
    maxAutonomy: 'RECOMMEND',
    sortOrder: 1,
  },
  GROWTH: {
    code: 'GROWTH',
    name: 'Growth',
    labels: { en: 'Growth', he: 'צמיחה' },
    // The launch price the unit economics are modelled on: 699 ILS + VAT.
    monthlyNet: majorUnits(699, 'ILS'),
    annualNet: majorUnits(6990, 'ILS'),
    trialDays: 14,
    limits: {
      prompt_execution: 2_000,
      crawl_page: 1_000,
      ai_tokens: 15_000_000,
      optimization: 40,
      monitored_prompts: 80,
      businesses: 1,
      // Caps AI+search cost at roughly a quarter of net revenue, protecting the margin
      // even for the heaviest customer on the plan.
      monthlySpendCapMinor: 17_000,
      hourlyExecutionCap: 300,
    },
    features: [
      'monitoring',
      'diagnosis',
      'recommendations',
      'auto_safe_fixes',
      'experiments',
      'google_integration',
      'weekly_report',
      'competitor_benchmark',
    ],
    maxAutonomy: 'AUTOPILOT',
    sortOrder: 2,
  },
  PRO: {
    code: 'PRO',
    name: 'Pro',
    labels: { en: 'Pro', he: 'מקצועי' },
    monthlyNet: majorUnits(1490, 'ILS'),
    annualNet: majorUnits(14900, 'ILS'),
    trialDays: 14,
    limits: {
      prompt_execution: 6_000,
      crawl_page: 3_000,
      ai_tokens: 50_000_000,
      optimization: 150,
      monitored_prompts: 200,
      businesses: 3,
      monthlySpendCapMinor: 37_000,
      hourlyExecutionCap: 600,
    },
    features: ['all_growth', 'multi_location', 'priority_support', 'api_access'],
    maxAutonomy: 'AUTOPILOT',
    sortOrder: 3,
  },
  AGENCY: {
    code: 'AGENCY',
    name: 'Agency',
    labels: { en: 'Agency', he: 'סוכנות' },
    monthlyNet: majorUnits(3900, 'ILS'),
    annualNet: majorUnits(39000, 'ILS'),
    trialDays: 0,
    limits: {
      prompt_execution: 20_000,
      crawl_page: 10_000,
      ai_tokens: 150_000_000,
      optimization: 500,
      monitored_prompts: 600,
      businesses: 25,
      monthlySpendCapMinor: 100_000,
      hourlyExecutionCap: 1_500,
    },
    features: ['all_pro', 'multi_business', 'white_label_reports'],
    maxAutonomy: 'AUTOPILOT',
    sortOrder: 4,
  },
}

export const getPlan = (code: PlanCode): Plan => PLANS[code]

export const purchasablePlans = (): readonly Plan[] =>
  Object.values(PLANS)
    .filter((p) => p.monthlyNet !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

/** Annual saving in minor units. Shown as a saving, never as a discount off a fake price. */
export const annualSavingMinor = (plan: Plan): number => {
  if (!plan.monthlyNet || !plan.annualNet) return 0
  return plan.monthlyNet.amount * 12 - plan.annualNet.amount
}
