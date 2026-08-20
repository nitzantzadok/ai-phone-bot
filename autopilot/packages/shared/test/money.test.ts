import { describe, expect, it } from 'vitest'
import {
  addMoney,
  applyVatToNet,
  extractVatFromGross,
  formatMoney,
  majorUnits,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
} from '../src/money.ts'

describe('money', () => {
  it('rejects non-integer minor units so floats can never enter pricing', () => {
    expect(() => money(699.5, 'ILS')).toThrow(/integer minor units/)
  })

  it('refuses to combine different currencies', () => {
    expect(() => addMoney(money(100, 'ILS'), money(100, 'USD'))).toThrow(/different currencies/)
  })

  it('adds, subtracts and sums exactly', () => {
    expect(addMoney(money(69900, 'ILS'), money(100, 'ILS')).amount).toBe(70000)
    expect(subtractMoney(money(69900, 'ILS'), money(900, 'ILS')).amount).toBe(69000)
    expect(sumMoney([money(1, 'ILS'), money(2, 'ILS'), money(3, 'ILS')], 'ILS').amount).toBe(6)
    expect(sumMoney([], 'ILS').amount).toBe(0)
  })

  it('multiplies with rounding, never producing fractional agorot', () => {
    expect(multiplyMoney(money(333, 'ILS'), 1 / 3).amount).toBe(111)
    expect(multiplyMoney(money(101, 'ILS'), 0.5).amount).toBe(51)
    expect(Number.isInteger(multiplyMoney(money(9999, 'ILS'), 0.1734).amount)).toBe(true)
  })
})

describe('VAT', () => {
  it('applies 18% to the ₪699 list price the way the invoice will read', () => {
    const taxed = applyVatToNet(majorUnits(699, 'ILS'), 1800, 'IL-VAT-2025')
    expect(taxed.net.amount).toBe(69900)
    expect(taxed.vat.amount).toBe(12582)
    expect(taxed.gross.amount).toBe(82482)
    expect(taxed.vatPeriodId).toBe('IL-VAT-2025')
  })

  it('keeps net + vat === gross for every rate and amount tried', () => {
    for (const amount of [1, 7, 99, 12345, 69900, 699000]) {
      for (const bps of [0, 1700, 1800, 2100]) {
        const t = applyVatToNet(money(amount, 'ILS'), bps, 'test')
        expect(t.net.amount + t.vat.amount).toBe(t.gross.amount)
      }
    }
  })

  it('extracts VAT out of a gross price and round-trips within one agora', () => {
    const gross = majorUnits(825, 'ILS')
    const t = extractVatFromGross(gross, 1800, 'IL-VAT-2025')
    expect(t.gross.amount).toBe(82500)
    expect(t.net.amount + t.vat.amount).toBe(82500)
    expect(Math.abs(applyVatToNet(t.net, 1800, 'x').gross.amount - 82500)).toBeLessThanOrEqual(1)
  })

  it('rejects a negative or fractional VAT rate', () => {
    expect(() => applyVatToNet(money(100, 'ILS'), -1, 'x')).toThrow()
    expect(() => applyVatToNet(money(100, 'ILS'), 17.5, 'x')).toThrow()
  })
})

describe('formatting', () => {
  it('formats shekels for both Israeli locales', () => {
    const m = majorUnits(699, 'ILS')
    expect(formatMoney(m, 'he-IL')).toContain('699')
    expect(formatMoney(m, 'en-US')).toContain('699')
  })
})
