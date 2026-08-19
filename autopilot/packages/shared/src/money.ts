/**
 * Money is ALWAYS integer minor units (agorot for ILS, cents for USD/EUR) plus an explicit
 * currency. Floating point never touches a price, a VAT amount or a cost record.
 *
 * Every customer-facing amount is a triple: net, vat, gross. Revenue reporting uses NET
 * unless a surface explicitly asks for gross — VAT is collected on behalf of the tax
 * authority, it is not revenue.
 */
import { invalid } from './errors.ts'

export type CurrencyCode = 'ILS' | 'USD' | 'EUR' | 'GBP'

export interface Money {
  /** Integer minor units. 69900 = ₪699.00 */
  readonly amount: number
  readonly currency: CurrencyCode
}

export interface TaxedAmount {
  readonly net: Money
  readonly vat: Money
  readonly gross: Money
  /** Basis points, e.g. 1800 = 18.00%. */
  readonly vatRateBps: number
  /** Which CountryConfig VAT period produced this. Auditable, never inferred later. */
  readonly vatPeriodId: string
}

export const money = (amount: number, currency: CurrencyCode): Money => {
  if (!Number.isInteger(amount)) {
    throw invalid('Money amounts must be integer minor units', { amount, currency })
  }
  return { amount, currency }
}

export const zero = (currency: CurrencyCode): Money => money(0, currency)

const assertSameCurrency = (a: Money, b: Money): void => {
  if (a.currency !== b.currency) {
    throw invalid('Cannot combine amounts in different currencies', {
      a: a.currency,
      b: b.currency,
    })
  }
}

export const addMoney = (a: Money, b: Money): Money => {
  assertSameCurrency(a, b)
  return money(a.amount + b.amount, a.currency)
}

export const subtractMoney = (a: Money, b: Money): Money => {
  assertSameCurrency(a, b)
  return money(a.amount - b.amount, a.currency)
}

export const sumMoney = (items: readonly Money[], currency: CurrencyCode): Money =>
  items.reduce((acc, m) => addMoney(acc, m), zero(currency))

export const multiplyMoney = (m: Money, factor: number): Money =>
  money(Math.round(m.amount * factor), m.currency)

export const compareMoney = (a: Money, b: Money): number => {
  assertSameCurrency(a, b)
  return a.amount - b.amount
}

/**
 * VAT applied to a NET (VAT-exclusive) price — the Israeli SaaS list-price convention
 * ("₪699 + VAT"). Rounds half-up on the VAT component so net + vat === gross exactly.
 */
export const applyVatToNet = (
  net: Money,
  vatRateBps: number,
  vatPeriodId: string,
): TaxedAmount => {
  if (!Number.isInteger(vatRateBps) || vatRateBps < 0) {
    throw invalid('VAT rate must be a non-negative integer in basis points', { vatRateBps })
  }
  const vatAmount = Math.round((net.amount * vatRateBps) / 10_000)
  return {
    net,
    vat: money(vatAmount, net.currency),
    gross: money(net.amount + vatAmount, net.currency),
    vatRateBps,
    vatPeriodId,
  }
}

/** VAT extracted from a GROSS (VAT-inclusive) price, for consumer-priced markets. */
export const extractVatFromGross = (
  gross: Money,
  vatRateBps: number,
  vatPeriodId: string,
): TaxedAmount => {
  const netAmount = Math.round((gross.amount * 10_000) / (10_000 + vatRateBps))
  return {
    net: money(netAmount, gross.currency),
    vat: money(gross.amount - netAmount, gross.currency),
    gross,
    vatRateBps,
    vatPeriodId,
  }
}

const MINOR_UNIT_EXPONENT: Record<CurrencyCode, number> = {
  ILS: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
}

export const formatMoney = (m: Money, locale: string): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: MINOR_UNIT_EXPONENT[m.currency],
  }).format(m.amount / 10 ** MINOR_UNIT_EXPONENT[m.currency])

/** Major-unit helper for readable configuration, e.g. majorUnits(699, 'ILS'). */
export const majorUnits = (value: number, currency: CurrencyCode): Money =>
  money(Math.round(value * 10 ** MINOR_UNIT_EXPONENT[currency]), currency)
