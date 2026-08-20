/**
 * Country configuration.
 *
 * Israel is the launch market but it is NOT hard-coded into business logic — it is one
 * entry in this registry. Adding a market must never require touching the optimization,
 * scoring or billing engines.
 *
 * VAT is versioned by effective date. Rates change (Israel moved 17% → 18% on
 * 2025-01-01); an invoice issued in 2024 must keep reproducing 17% forever, so we resolve
 * the rate for a date rather than reading a constant.
 *
 * VERIFY BEFORE BILLING GOES LIVE: rates below are configuration, not tax advice. Confirm
 * against the Israel Tax Authority publication current at go-live and add a new period
 * rather than editing an existing one.
 */
import type { CurrencyCode } from './money.ts'
import type { LanguageCode } from './locale.ts'

export type CountryCode = 'IL' | 'US' | 'GB' | 'DE'

export interface VatPeriod {
  /** Stable id persisted on every taxed amount, e.g. 'IL-VAT-2025'. */
  readonly id: string
  /** Basis points: 1800 = 18.00%. */
  readonly rateBps: number
  readonly effectiveFrom: string // ISO date, inclusive
  readonly effectiveUntil: string | null // ISO date, exclusive; null = current
  readonly note?: string
}

export type TaxDisplayRule = 'NET_PLUS_VAT' | 'GROSS_INCLUSIVE'

export interface CountryConfig {
  readonly code: CountryCode
  readonly name: string
  readonly defaultLocale: string
  readonly defaultLanguage: LanguageCode
  /** Languages worth measuring AI visibility in for this market, in priority order. */
  readonly measurementLanguages: readonly LanguageCode[]
  readonly currency: CurrencyCode
  readonly timezone: string
  readonly vatPeriods: readonly VatPeriod[]
  readonly taxDisplay: TaxDisplayRule
  /** E.164 country calling code. */
  readonly phoneCallingCode: string
  readonly phonePattern: RegExp
  readonly postalCodePattern: RegExp | null
  readonly addressFormat: readonly string[]
  readonly invoice: {
    readonly requiresTaxId: boolean
    readonly taxIdLabel: string
    readonly numberPrefix: string
  }
  /** Seed cities for local-intent prompt generation. Never a closed list — customers may add any. */
  readonly seedCities: readonly { readonly he?: string; readonly en: string }[]
  readonly legal: {
    readonly privacyRegime: string
    readonly dataResidencyNote: string
  }
}

export const IL: CountryConfig = {
  code: 'IL',
  name: 'Israel',
  defaultLocale: 'he-IL',
  defaultLanguage: 'he',
  measurementLanguages: ['he', 'en'],
  currency: 'ILS',
  timezone: 'Asia/Jerusalem',
  vatPeriods: [
    {
      id: 'IL-VAT-2013',
      rateBps: 1700,
      effectiveFrom: '2013-06-02',
      effectiveUntil: '2025-01-01',
      note: '17% standard rate.',
    },
    {
      id: 'IL-VAT-2025',
      rateBps: 1800,
      effectiveFrom: '2025-01-01',
      effectiveUntil: null,
      note: '18% standard rate. Confirm against Israel Tax Authority before go-live.',
    },
  ],
  taxDisplay: 'NET_PLUS_VAT',
  phoneCallingCode: '+972',
  // Israeli mobile/landline in local (0…) or international (+972…) form.
  phonePattern: /^(?:\+972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}$/,
  postalCodePattern: /^\d{7}$/,
  addressFormat: ['street', 'houseNumber', 'city', 'postalCode', 'country'],
  invoice: { requiresTaxId: true, taxIdLabel: 'ח.פ. / ע.מ.', numberPrefix: 'IL' },
  seedCities: [
    { he: 'תל אביב', en: 'Tel Aviv' },
    { he: 'ירושלים', en: 'Jerusalem' },
    { he: 'חיפה', en: 'Haifa' },
    { he: 'ראשון לציון', en: 'Rishon LeZion' },
    { he: 'פתח תקווה', en: 'Petah Tikva' },
    { he: 'נתניה', en: 'Netanya' },
    { he: 'הרצליה', en: 'Herzliya' },
    { he: 'רמת גן', en: 'Ramat Gan' },
    { he: 'אשדוד', en: 'Ashdod' },
    { he: 'אילת', en: 'Eilat' },
    { he: 'באר שבע', en: "Be'er Sheva" },
  ],
  legal: {
    privacyRegime: 'Israeli Privacy Protection Law (including Amendment 13)',
    dataResidencyNote:
      'No statutory residency requirement assumed; processor locations are documented in PRIVACY.md and require review by Israeli counsel before launch.',
  },
}

export const US: CountryConfig = {
  code: 'US',
  name: 'United States',
  defaultLocale: 'en-US',
  defaultLanguage: 'en',
  measurementLanguages: ['en'],
  currency: 'USD',
  timezone: 'America/New_York',
  // US sales tax is destination/nexus based and is NOT a VAT. Modelled as a 0% period so
  // the money pipeline stays uniform; a real US launch needs a tax provider integration.
  vatPeriods: [
    {
      id: 'US-TAX-NONE',
      rateBps: 0,
      effectiveFrom: '2000-01-01',
      effectiveUntil: null,
      note: 'Placeholder. US sales tax requires a nexus-aware tax provider before launch.',
    },
  ],
  taxDisplay: 'NET_PLUS_VAT',
  phoneCallingCode: '+1',
  phonePattern: /^(?:\+1[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}$/,
  postalCodePattern: /^\d{5}(?:-\d{4})?$/,
  addressFormat: ['houseNumber', 'street', 'city', 'state', 'postalCode', 'country'],
  invoice: { requiresTaxId: false, taxIdLabel: 'Tax ID', numberPrefix: 'US' },
  seedCities: [{ en: 'New York' }, { en: 'Los Angeles' }, { en: 'Chicago' }, { en: 'Miami' }],
  legal: {
    privacyRegime: 'State privacy laws (CCPA/CPRA and equivalents)',
    dataResidencyNote: 'Requires review before a US launch.',
  },
}

const REGISTRY: Record<CountryCode, CountryConfig | undefined> = {
  IL,
  US,
  GB: undefined,
  DE: undefined,
}

export const getCountryConfig = (code: CountryCode): CountryConfig => {
  const cfg = REGISTRY[code]
  if (!cfg) throw new Error(`Country ${code} is not configured yet`)
  return cfg
}

export const supportedCountries = (): readonly CountryCode[] =>
  (Object.keys(REGISTRY) as CountryCode[]).filter((c) => REGISTRY[c] !== undefined)

/** Resolve the VAT period in force on a given date. Never guesses; throws if unmapped. */
export const resolveVatPeriod = (country: CountryConfig, on: Date): VatPeriod => {
  const iso = on.toISOString().slice(0, 10)
  const period = country.vatPeriods.find(
    (p) => iso >= p.effectiveFrom && (p.effectiveUntil === null || iso < p.effectiveUntil),
  )
  if (!period) {
    throw new Error(`No VAT period configured for ${country.code} on ${iso}`)
  }
  return period
}

export const normalizePhone = (raw: string, country: CountryConfig): string | null => {
  const trimmed = raw.trim()
  if (!country.phonePattern.test(trimmed)) return null
  const digits = trimmed.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  return `${country.phoneCallingCode}${digits.replace(/^0/, '')}`
}
