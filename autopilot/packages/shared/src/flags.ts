/**
 * Feature flags. Deliberately boring: a default map, overridable per environment and per
 * organization, resolved through one function so a flag can never be read two different
 * ways in two places.
 */
export const FEATURE_FLAGS = [
  'ENABLE_GOOGLE_INTEGRATION',
  'ENABLE_AUTOPILOT',
  'ENABLE_CLAUDE',
  'ENABLE_GEMINI',
  'ENABLE_OPENAI',
  'ENABLE_EXPERIMENTS',
  'ENABLE_AUTO_PUBLISH',
  'ENABLE_REVIEW_REPLY',
  'ENABLE_ANNUAL_BILLING',
  'ENABLE_ADMIN_IMPERSONATION',
  'ENABLE_PUBLIC_SCAN',
] as const

export type FeatureFlag = (typeof FEATURE_FLAGS)[number]

export const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  ENABLE_GOOGLE_INTEGRATION: false,
  ENABLE_AUTOPILOT: false,
  ENABLE_CLAUDE: true,
  ENABLE_GEMINI: true,
  ENABLE_OPENAI: true,
  ENABLE_EXPERIMENTS: true,
  ENABLE_AUTO_PUBLISH: false,
  ENABLE_REVIEW_REPLY: false, // opt-in only, never on by default (brief §23)
  ENABLE_ANNUAL_BILLING: true,
  ENABLE_ADMIN_IMPERSONATION: false,
  ENABLE_PUBLIC_SCAN: true,
}

export interface FlagOverrides {
  readonly global?: Partial<Record<FeatureFlag, boolean>>
  readonly byOrganization?: Record<string, Partial<Record<FeatureFlag, boolean>>>
  /** Percentage rollout 0-100, keyed by flag; evaluated on a stable hash of the org id. */
  readonly rollout?: Partial<Record<FeatureFlag, number>>
}

export class FeatureFlagService {
  constructor(private readonly overrides: FlagOverrides = {}) {}

  isEnabled(flag: FeatureFlag, organizationId?: string): boolean {
    const perOrg = organizationId
      ? this.overrides.byOrganization?.[organizationId]?.[flag]
      : undefined
    if (perOrg !== undefined) return perOrg

    const rollout = this.overrides.rollout?.[flag]
    if (rollout !== undefined && organizationId) {
      return stableBucket(`${flag}:${organizationId}`) < rollout
    }

    const global = this.overrides.global?.[flag]
    if (global !== undefined) return global

    return DEFAULT_FLAGS[flag]
  }

  all(organizationId?: string): Record<FeatureFlag, boolean> {
    return Object.fromEntries(
      FEATURE_FLAGS.map((f) => [f, this.isEnabled(f, organizationId)]),
    ) as Record<FeatureFlag, boolean>
  }
}

/** FNV-1a → 0-99. Stable across processes and deploys, unlike Math.random or hashCode. */
const stableBucket = (key: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 100
}
