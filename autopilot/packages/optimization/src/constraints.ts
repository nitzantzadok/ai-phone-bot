/**
 * Business constraints.
 *
 * The customer's rules are a HARD gate, evaluated before quality gates and before any
 * scoring. "Never say we are luxury" is not a preference to weigh against expected lift;
 * it is a boundary, and an autonomous system that treats it as advisory will eventually
 * publish something the owner has to explain to their customers.
 */
import type { RiskTier } from '@autopilot/shared/domain.ts'

export const RULE_TYPES = [
  'DO_NOT_CLAIM', // value = a claim we must never make, e.g. "luxury"
  'ALWAYS_MENTION', // value = something that must appear, e.g. "kosher"
  'DO_NOT_CREATE', // value = 'new_pages' | 'location_pages' | 'blog_posts'
  'APPROVAL_REQUIRED', // value = 'all_content' | 'all_changes' | action type
  'TARGET_AUDIENCE', // value = audience key, biases prioritisation
  'TARGET_LANGUAGE', // value = language code we may publish in
  'DO_NOT_MENTION', // value = a topic to leave alone, e.g. "delivery"
] as const
export type RuleType = (typeof RULE_TYPES)[number]

export interface BusinessRule {
  readonly ruleType: RuleType
  readonly value: string
  readonly note?: string
}

export interface ProposedChange {
  readonly actionType: string
  /** Customer-visible text this change would publish, if any. */
  readonly text?: string
  /** Page types this change would create. */
  readonly createsPageType?: string
  readonly language?: string
  readonly riskTier: RiskTier
}

export interface ConstraintVerdict {
  readonly allowed: boolean
  /** Set when the change may proceed only with explicit approval. */
  readonly requiresApproval: boolean
  readonly violations: readonly { rule: BusinessRule; reason: string }[]
}

const CREATE_ACTIONS = new Set(['CREATE_PAGE', 'ADD_LOCATION_PAGE', 'ADD_FAQ_PAGE'])

const mentions = (text: string, value: string): boolean =>
  text.toLowerCase().includes(value.toLowerCase())

export const evaluateConstraints = (
  change: ProposedChange,
  rules: readonly BusinessRule[],
): ConstraintVerdict => {
  const violations: { rule: BusinessRule; reason: string }[] = []
  let requiresApproval = false

  for (const rule of rules) {
    switch (rule.ruleType) {
      case 'DO_NOT_CLAIM':
        if (change.text && mentions(change.text, rule.value)) {
          violations.push({
            rule,
            reason: `The change claims "${rule.value}", which you asked us never to say.`,
          })
        }
        break

      case 'DO_NOT_MENTION':
        if (change.text && mentions(change.text, rule.value)) {
          violations.push({
            rule,
            reason: `The change mentions "${rule.value}", which you asked us to leave out.`,
          })
        }
        break

      case 'ALWAYS_MENTION':
        // Only enforceable on content that describes the business.
        if (change.text && change.text.length > 120 && !mentions(change.text, rule.value)) {
          violations.push({
            rule,
            reason: `The change does not mention "${rule.value}", which you asked us to always include.`,
          })
        }
        break

      case 'DO_NOT_CREATE':
        if (
          (rule.value === 'new_pages' && CREATE_ACTIONS.has(change.actionType)) ||
          (change.createsPageType !== undefined && rule.value === `${change.createsPageType}_pages`)
        ) {
          violations.push({ rule, reason: 'You asked us not to create new pages.' })
        }
        break

      case 'TARGET_LANGUAGE':
        if (change.language && change.language !== rule.value) {
          violations.push({
            rule,
            reason: `The change is in ${change.language}, but you limited us to ${rule.value}.`,
          })
        }
        break

      case 'APPROVAL_REQUIRED':
        if (
          rule.value === 'all_changes' ||
          (rule.value === 'all_content' && change.text !== undefined) ||
          rule.value === change.actionType
        ) {
          requiresApproval = true
        }
        break

      case 'TARGET_AUDIENCE':
        // Advisory: influences prioritisation, never blocks a change.
        break
    }
  }

  return { allowed: violations.length === 0, requiresApproval, violations }
}

/** Rules that steer what the agent works on first, without blocking anything. */
export const prioritizationHints = (
  rules: readonly BusinessRule[],
): { targetAudiences: string[]; targetLanguages: string[] } => ({
  targetAudiences: rules.filter((r) => r.ruleType === 'TARGET_AUDIENCE').map((r) => r.value),
  targetLanguages: rules.filter((r) => r.ruleType === 'TARGET_LANGUAGE').map((r) => r.value),
})
