/**
 * Unit economics.
 *
 * The brief asks for the economics to be visible inside the architecture rather than
 * living in a spreadsheet, so contribution margin is computed from the same cost records
 * the product already writes for every external call.
 *
 * These figures are ADMIN-ONLY. Nothing here is ever rendered to a customer.
 */
import { round } from '@autopilot/shared/stats.ts'
import type { Money } from '@autopilot/shared/money.ts'
import { money } from '@autopilot/shared/money.ts'

export interface CostInputs {
  /** Net revenue for the period, in minor units. VAT is excluded: it is not revenue. */
  readonly netRevenueMinor: number
  readonly aiCostMinor: number
  readonly searchCostMinor: number
  readonly infrastructureAllocationMinor: number
  readonly paymentProcessingMinor: number
  readonly supportAllocationMinor: number
}

export interface ContributionMargin {
  readonly netRevenue: Money
  readonly totalCost: Money
  readonly contributionMargin: Money
  /** 0..1. Negative when a customer costs more than they pay. */
  readonly marginRatio: number
  /** AI and search cost as a share of net revenue. The number that predicts trouble. */
  readonly apiCostRatio: number
  readonly flagged: boolean
  readonly flagReason: string | null
}

/** Above this share of revenue going to AI and search, a customer needs attention. */
export const API_COST_RATIO_ALERT = 0.35
/** Below this margin, the account is unprofitable at the current plan. */
export const MARGIN_ALERT = 0.4

export const contributionMargin = (inputs: CostInputs): ContributionMargin => {
  const totalCost =
    inputs.aiCostMinor +
    inputs.searchCostMinor +
    inputs.infrastructureAllocationMinor +
    inputs.paymentProcessingMinor +
    inputs.supportAllocationMinor

  const margin = inputs.netRevenueMinor - totalCost
  const marginRatio = inputs.netRevenueMinor === 0 ? 0 : margin / inputs.netRevenueMinor
  const apiCostRatio =
    inputs.netRevenueMinor === 0
      ? 0
      : (inputs.aiCostMinor + inputs.searchCostMinor) / inputs.netRevenueMinor

  const flagReason =
    apiCostRatio > API_COST_RATIO_ALERT
      ? `AI and search cost is ${(apiCostRatio * 100).toFixed(0)}% of net revenue for this customer.`
      : marginRatio < MARGIN_ALERT
        ? `Contribution margin is ${(marginRatio * 100).toFixed(0)}%, below the ${MARGIN_ALERT * 100}% floor.`
        : null

  return {
    netRevenue: money(inputs.netRevenueMinor, 'ILS'),
    totalCost: money(totalCost, 'ILS'),
    contributionMargin: money(margin, 'ILS'),
    marginRatio: round(marginRatio, 4),
    apiCostRatio: round(apiCostRatio, 4),
    flagged: flagReason !== null,
    flagReason,
  }
}

export interface PortfolioEconomics {
  readonly customerCount: number
  readonly mrrMinor: number
  readonly arrMinor: number
  readonly totalCostMinor: number
  readonly blendedMarginRatio: number
  readonly flaggedCustomerCount: number
  /** Customers needed to cover fixed costs at the current blended margin. */
  readonly breakEvenCustomers: number
}

export const portfolioEconomics = (
  customers: readonly CostInputs[],
  fixedMonthlyCostMinor: number,
): PortfolioEconomics => {
  const margins = customers.map(contributionMargin)
  const mrrMinor = customers.reduce((s, c) => s + c.netRevenueMinor, 0)
  const totalCostMinor = margins.reduce((s, m) => s + m.totalCost.amount, 0)
  const blended = mrrMinor === 0 ? 0 : (mrrMinor - totalCostMinor) / mrrMinor
  const averageContribution =
    customers.length === 0 ? 0 : (mrrMinor - totalCostMinor) / customers.length

  return {
    customerCount: customers.length,
    mrrMinor,
    arrMinor: mrrMinor * 12,
    totalCostMinor,
    blendedMarginRatio: round(blended, 4),
    flaggedCustomerCount: margins.filter((m) => m.flagged).length,
    breakEvenCustomers:
      averageContribution <= 0 ? Infinity : Math.ceil(fixedMonthlyCostMinor / averageContribution),
  }
}
