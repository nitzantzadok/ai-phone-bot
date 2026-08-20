/**
 * Agent memory.
 *
 * Split deliberately into three, because conflating them is how an agent starts treating
 * its own past output as fact.
 *
 * SHORT-TERM is the current run: what it has looked at, decided and done. Discarded when
 * the run ends.
 *
 * LONG-TERM is the business: confirmed facts, prior changes, customer preferences,
 * constraints. Everything in it has a source and a confidence.
 *
 * EXPERIENCE is what the platform has learned about which interventions work. It is
 * evidence from experiments, never an assumption.
 *
 * An old AI answer is never promoted into long-term memory as a fact (brief section 75).
 */
import type { ConfidenceLevel } from '@autopilot/shared/domain.ts'

export interface RunObservation {
  readonly step: number
  readonly tool: string
  readonly summary: string
  readonly at: Date
}

export interface RunDecision {
  readonly step: number
  readonly decision: string
  /** Why. Populated for every decision, no exceptions. */
  readonly reason: string
  readonly at: Date
}

/** Discarded at the end of the run. Nothing here is durable knowledge. */
export class ShortTermMemory {
  readonly observations: RunObservation[] = []
  readonly decisions: RunDecision[] = []
  private step = 0

  nextStep(): number {
    return ++this.step
  }

  observe(tool: string, summary: string, at: Date): void {
    this.observations.push({ step: this.step, tool, summary, at })
  }

  decide(decision: string, reason: string, at: Date): void {
    this.decisions.push({ step: this.step, decision, reason, at })
  }

  /** Compact context for a model call. Bounded so it cannot grow without limit. */
  render(maxItems = 20): string {
    const recent = [
      ...this.observations.slice(-maxItems).map((o) => `[${o.step}] observed via ${o.tool}: ${o.summary}`),
      ...this.decisions.slice(-maxItems).map((d) => `[${d.step}] decided: ${d.decision} because ${d.reason}`),
    ]
    return recent.join('\n')
  }
}

export interface BusinessMemoryFact {
  readonly factKind: string
  readonly value: string | null
  readonly confidence: ConfidenceLevel
  readonly source: string
}

export interface PastChange {
  readonly actionType: string
  readonly summary: string
  readonly appliedAt: Date
  readonly outcome: 'PENDING' | 'ASSOCIATED_POSITIVE' | 'ASSOCIATED_NEGATIVE' | 'INCONCLUSIVE'
  readonly rolledBack: boolean
}

export interface BusinessMemory {
  readonly businessName: string
  readonly vertical: string
  readonly city: string | null
  readonly facts: readonly BusinessMemoryFact[]
  readonly confirmedAttributes: readonly string[]
  readonly constraints: readonly { ruleType: string; value: string }[]
  readonly pastChanges: readonly PastChange[]
  readonly automationMode: string
}

/**
 * Renders long-term memory for a model call.
 *
 * Only facts at MEDIUM confidence or better are included: feeding an agent a LOW-confidence
 * guess is how a guess becomes a published claim.
 */
export const renderBusinessMemory = (memory: BusinessMemory): string => {
  const usable = memory.facts.filter((f) => f.confidence === 'HIGH' || f.confidence === 'MEDIUM')
  const lines = [
    `Business: ${memory.businessName} (${memory.vertical}${memory.city ? `, ${memory.city}` : ''})`,
    `Automation mode: ${memory.automationMode}`,
    '',
    'Confirmed information:',
    ...usable.map((f) => `- ${f.factKind}: ${f.value ?? '(structured)'} [${f.confidence}, ${f.source}]`),
  ]

  if (memory.confirmedAttributes.length > 0) {
    lines.push('', `Owner-confirmed attributes: ${memory.confirmedAttributes.join(', ')}`)
  }

  if (memory.constraints.length > 0) {
    lines.push('', 'Business rules that must be respected:')
    lines.push(...memory.constraints.map((c) => `- ${c.ruleType}: ${c.value}`))
  }

  const recent = memory.pastChanges.slice(-8)
  if (recent.length > 0) {
    lines.push('', 'Recent changes:')
    lines.push(
      ...recent.map(
        (c) =>
          `- ${c.actionType}: ${c.summary} (${c.outcome}${c.rolledBack ? ', rolled back' : ''})`,
      ),
    )
  }

  return lines.join('\n')
}

export interface InterventionExperience {
  readonly interventionType: string
  readonly vertical: string
  readonly recommendation: 'PREFER' | 'NEUTRAL' | 'AVOID' | 'INSUFFICIENT_DATA'
  readonly experimentCount: number
}

/**
 * What the platform has learned, stated honestly.
 *
 * Where the dataset is thin the answer is "we do not know yet", not a plausible-sounding
 * heuristic. Inventing confidence here would poison the learning loop the moat depends on.
 */
export const renderExperience = (
  experience: readonly InterventionExperience[],
): string => {
  if (experience.length === 0) {
    return 'No intervention outcome data yet. Prefer low-risk, reversible changes.'
  }
  const known = experience.filter((e) => e.recommendation !== 'INSUFFICIENT_DATA')
  if (known.length === 0) {
    return 'Not enough experiment data yet to prefer one kind of change over another.'
  }
  return [
    'What has worked for similar businesses (from our own experiments):',
    ...known.map(
      (e) => `- ${e.interventionType}: ${e.recommendation} (${e.experimentCount} experiments)`,
    ),
  ].join('\n')
}
