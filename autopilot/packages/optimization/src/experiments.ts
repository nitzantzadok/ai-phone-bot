/**
 * The experimentation engine.
 *
 * This module exists to stop the product lying about causation.
 *
 * AI answers move on their own: engines update, competitors publish, indexes refresh. A
 * before/after difference is therefore evidence of nothing until it is compared against a
 * control set of prompts the change could not have affected, and until the difference is
 * larger than chance would produce. Where the evidence does not support a causal claim,
 * this module says so — in the customer-facing wording, not just in a footnote.
 */
import { round, twoProportionPValue, wilsonInterval } from '@autopilot/shared/stats.ts'

export type ExperimentConclusion =
  | 'NO_EVIDENCE'
  | 'ASSOCIATED_POSITIVE'
  | 'ASSOCIATED_NEGATIVE'
  | 'INCONCLUSIVE'

export interface ExperimentCounts {
  readonly trials: number
  readonly successes: number
}

export interface ExperimentInput {
  readonly hypothesis: string
  readonly interventionType: string
  readonly vertical: string
  readonly preTreatment: ExperimentCounts
  readonly postTreatment: ExperimentCounts
  /** Prompts the change could not have affected. Without these, nothing is concludable. */
  readonly preControl: ExperimentCounts
  readonly postControl: ExperimentCounts
  readonly observationWindowDays: number
  /** Anything else that changed during the window. */
  readonly knownConfounders?: readonly string[]
}

export interface ExperimentResult {
  readonly conclusion: ExperimentConclusion
  /** Wording the customer sees. Never says "caused" without support. */
  readonly conclusionText: string
  readonly treatmentDelta: number
  readonly controlDelta: number
  /** Treatment movement net of control movement. The only number worth acting on. */
  readonly adjustedDelta: number
  readonly pValue: number
  readonly confounders: readonly string[]
  readonly sufficientData: boolean
}

/** Below this, no conclusion is offered at all. */
export const MIN_TRIALS_PER_ARM = 8
const SIGNIFICANCE = 0.05

const rate = (counts: ExperimentCounts): number =>
  counts.trials === 0 ? 0 : counts.successes / counts.trials

export const evaluateExperiment = (input: ExperimentInput): ExperimentResult => {
  const treatmentDelta = rate(input.postTreatment) - rate(input.preTreatment)
  const controlDelta = rate(input.postControl) - rate(input.preControl)
  const adjustedDelta = treatmentDelta - controlDelta

  const confounders = [...(input.knownConfounders ?? [])]
  if (Math.abs(controlDelta) > 0.1) {
    // The control moved too: something outside our change is affecting everything.
    confounders.push(
      `Control prompts moved by ${(controlDelta * 100).toFixed(0)} points over the same window, ` +
        'so part of any movement is not attributable to this change.',
    )
  }

  const sufficientData =
    input.preTreatment.trials >= MIN_TRIALS_PER_ARM &&
    input.postTreatment.trials >= MIN_TRIALS_PER_ARM &&
    input.preControl.trials >= MIN_TRIALS_PER_ARM &&
    input.postControl.trials >= MIN_TRIALS_PER_ARM

  const pValue = twoProportionPValue(
    input.preTreatment.successes,
    input.preTreatment.trials,
    input.postTreatment.successes,
    input.postTreatment.trials,
  )

  if (!sufficientData) {
    return {
      conclusion: 'NO_EVIDENCE',
      conclusionText:
        'There is not enough data yet to say whether this change made a difference. ' +
        'We will keep measuring.',
      treatmentDelta: round(treatmentDelta, 4),
      controlDelta: round(controlDelta, 4),
      adjustedDelta: round(adjustedDelta, 4),
      pValue: round(pValue, 4),
      confounders,
      sufficientData: false,
    }
  }

  if (pValue > SIGNIFICANCE) {
    return {
      conclusion: 'INCONCLUSIVE',
      conclusionText:
        `Visibility moved by ${formatPoints(adjustedDelta)} after this change, but the ` +
        'movement is within what normal variation produces. We cannot say the change was responsible.',
      treatmentDelta: round(treatmentDelta, 4),
      controlDelta: round(controlDelta, 4),
      adjustedDelta: round(adjustedDelta, 4),
      pValue: round(pValue, 4),
      confounders,
      sufficientData: true,
    }
  }

  const positive = adjustedDelta > 0
  const hedged = confounders.length > 0

  return {
    conclusion: positive ? 'ASSOCIATED_POSITIVE' : 'ASSOCIATED_NEGATIVE',
    conclusionText:
      `This change is associated with a ${formatPoints(adjustedDelta)} ` +
      `${positive ? 'increase' : 'decrease'} in how often you are recommended for the ` +
      'affected questions, after accounting for prompts the change could not have influenced.' +
      (hedged
        ? ' Other things changed during the same period, so this is an association rather than a proven cause.'
        : ' We measured a control group, but this remains an observed association rather than a controlled trial.'),
    treatmentDelta: round(treatmentDelta, 4),
    controlDelta: round(controlDelta, 4),
    adjustedDelta: round(adjustedDelta, 4),
    pValue: round(pValue, 4),
    confounders,
    sufficientData: true,
  }
}

const formatPoints = (delta: number): string =>
  `${Math.abs(delta * 100).toFixed(0)} percentage point${Math.abs(delta * 100) === 1 ? '' : 's'}`

/**
 * Splitting prompts into treatment and control.
 *
 * Treatment = prompts demanding the attribute the change addresses. Control = prompts that
 * demand none of them. Prompts touching both are excluded rather than assigned, because a
 * contaminated control is worse than a smaller one.
 */
export const splitPrompts = <T extends { id: string; requiredAttributes: readonly string[] }>(
  prompts: readonly T[],
  affectedAttributes: readonly string[],
): { treatment: T[]; control: T[]; excluded: T[] } => {
  const affected = new Set(affectedAttributes)
  const treatment: T[] = []
  const control: T[] = []
  const excluded: T[] = []

  for (const prompt of prompts) {
    const touches = prompt.requiredAttributes.filter((a) => affected.has(a)).length
    if (touches > 0 && touches === prompt.requiredAttributes.length) treatment.push(prompt)
    else if (touches === 0) control.push(prompt)
    else excluded.push(prompt)
  }

  return { treatment, control, excluded }
}

export interface InterventionEvidence {
  readonly interventionType: string
  readonly vertical: string
  readonly experimentCount: number
  readonly positiveCount: number
  readonly averageAdjustedDelta: number
  /** Wilson lower bound on the success rate. The number worth acting on. */
  readonly successRateLower: number
  readonly recommendation: 'PREFER' | 'NEUTRAL' | 'AVOID' | 'INSUFFICIENT_DATA'
}

/**
 * What the platform has learned about an intervention type.
 *
 * Starts as "we do not know" and stays there until enough experiments exist. Hard-coding a
 * belief here — "schema always helps" — would defeat the purpose of running experiments at
 * all (brief section 32).
 */
export const summarizeIntervention = (
  results: readonly { conclusion: ExperimentConclusion; adjustedDelta: number }[],
  interventionType: string,
  vertical: string,
): InterventionEvidence => {
  const conclusive = results.filter(
    (r) => r.conclusion === 'ASSOCIATED_POSITIVE' || r.conclusion === 'ASSOCIATED_NEGATIVE',
  )
  const positives = results.filter((r) => r.conclusion === 'ASSOCIATED_POSITIVE').length
  const averageAdjustedDelta =
    results.length === 0 ? 0 : results.reduce((s, r) => s + r.adjustedDelta, 0) / results.length
  const lower = conclusive.length === 0 ? 0 : wilsonInterval(positives, conclusive.length).lower

  const recommendation: InterventionEvidence['recommendation'] =
    conclusive.length < 5
      ? 'INSUFFICIENT_DATA'
      : lower > 0.6
        ? 'PREFER'
        : lower < 0.2
          ? 'AVOID'
          : 'NEUTRAL'

  return {
    interventionType,
    vertical,
    experimentCount: results.length,
    positiveCount: positives,
    averageAdjustedDelta: round(averageAdjustedDelta, 4),
    successRateLower: round(lower, 4),
    recommendation,
  }
}
