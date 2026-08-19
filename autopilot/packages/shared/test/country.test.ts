import { describe, expect, it } from 'vitest'
import {
  IL,
  getCountryConfig,
  normalizePhone,
  resolveVatPeriod,
  supportedCountries,
} from '../src/country.ts'

describe('CountryConfig', () => {
  it('exposes Israel with the launch defaults', () => {
    expect(IL.currency).toBe('ILS')
    expect(IL.timezone).toBe('Asia/Jerusalem')
    expect(IL.defaultLanguage).toBe('he')
    expect(IL.measurementLanguages).toEqual(['he', 'en'])
    expect(IL.taxDisplay).toBe('NET_PLUS_VAT')
  })

  it('does not silently invent unconfigured countries', () => {
    expect(() => getCountryConfig('DE')).toThrow(/not configured/)
    expect(supportedCountries()).toContain('IL')
    expect(supportedCountries()).not.toContain('DE')
  })
})

describe('VAT periods', () => {
  it('resolves the rate in force on a given date, not a global constant', () => {
    expect(resolveVatPeriod(IL, new Date('2024-06-01')).rateBps).toBe(1700)
    expect(resolveVatPeriod(IL, new Date('2025-01-01')).rateBps).toBe(1800)
    expect(resolveVatPeriod(IL, new Date('2026-08-19')).rateBps).toBe(1800)
  })

  it('gives each period a stable id that can be persisted on an invoice', () => {
    expect(resolveVatPeriod(IL, new Date('2024-06-01')).id).toBe('IL-VAT-2013')
    expect(resolveVatPeriod(IL, new Date('2026-01-01')).id).toBe('IL-VAT-2025')
  })

  it('has no gaps or overlaps between periods', () => {
    const sorted = [...IL.vatPeriods].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]!.effectiveUntil).toBe(sorted[i + 1]!.effectiveFrom)
    }
    expect(sorted.at(-1)!.effectiveUntil).toBeNull()
  })

  it('throws rather than guessing for a date before any configured period', () => {
    expect(() => resolveVatPeriod(IL, new Date('1990-01-01'))).toThrow(/No VAT period/)
  })
})

describe('Israeli phone normalisation', () => {
  it.each([
    ['052-1234567', '+972521234567'],
    ['0521234567', '+972521234567'],
    ['03-1234567', '+97231234567'],
    ['+972 52 123 4567', '+972521234567'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input, IL)).toBe(expected)
  })

  it('rejects things that are not Israeli phone numbers', () => {
    expect(normalizePhone('12345', IL)).toBeNull()
    expect(normalizePhone('+1 415 555 0100', IL)).toBeNull()
    expect(normalizePhone('not a phone', IL)).toBeNull()
  })
})
