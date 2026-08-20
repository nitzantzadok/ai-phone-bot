/**
 * The autonomous agent runtime.
 *
 * This is the OBSERVE - DIAGNOSE - PRIORITIZE - CHANGE - VALIDATE loop, made safe enough to
 * leave running against a paying customer's website.
 *
 * The design principle throughout: the agent decides WHAT to do, but never decides whether
 * it is ALLOWED to. Permission is resolved by code it cannot influence — autonomy mode,
 * risk tier, business rules, quality gates and the budget — evaluated in that order, on
 * every single action. A model that becomes confused, or is manipulated by content it read
 * on a website, still cannot publish something the gates would refuse.
 *
 * Cheap work first, always: diagnosis runs entirely on stored evidence before any model
 * call, because the cheapest analysis is the one that never reaches a provider.
 */
import { AppError, isAppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import type { AutonomyMode, RiskTier } from '@autopilot/shared/domain.ts'
import { canAutoApply } from '@autopilot/shared/domain.ts'
import { newId, type AgentRunId } from '@autopilot/shared/ids.ts'
import {
  evaluateConstraints,
  type BusinessRule,
} from '@autopilot/optimization/constraints.ts'
import {
  PUBLISH_CONFIDENCE_THRESHOLD,
  runQualityGates,
  type GroundingFact,
  type QualityGateResult,
} from '@autopilot/optimization/quality-gates.ts'
import type { Opportunity } from '@autopilot/optimization/diagnosis.ts'
import type { PlannedAction } from '@autopilot/optimization/actions.ts'
import { AgentBudget, DEFAULT_LIMITS, type AgentLimits, type StopReason } from './budget.ts'
import { ShortTermMemory } from './memory.ts'
import { isWriteTool, type ToolRegistry } from './tools.ts'

export type StepType = 'TOOL_CALL' | 'DECISION' | 'OBSERVATION' | 'ERROR' | 'LIMIT' | 'GATE'

export interface AgentStep {
  readonly sequence: number
  readonly stepType: StepType
  readonly toolName?: string
  readonly input?: Record<string, unknown>
  readonly output?: Record<string, unknown>
  /** Why the agent did this. Present on every DECISION and GATE step. */
  readonly reason?: string
  readonly durationMs?: number
  readonly costMinor: number
  readonly error?: string
  readonly at: Date
}

export interface AgentRunResult {
  readonly runId: AgentRunId
  readonly status: 'COMPLETED' | 'STOPPED_LIMIT' | 'STOPPED_BUDGET' | 'FAILED' | 'CANCELED'
  readonly stopReason: StopReason
  readonly steps: readonly AgentStep[]
  readonly usage: ReturnType<AgentBudget['snapshot']>
  /** What the agent did, in plain language, for the customer's activity feed. */
  readonly summary: string
  readonly appliedActions: readonly AppliedAction[]
  readonly proposedActions: readonly ProposedAction[]
  readonly errors: readonly string[]
}

export interface AppliedAction {
  readonly actionType: string
  readonly summary: string
  readonly targetUrl: string | null
  readonly versionId: string
  readonly riskTier: RiskTier
}

export interface ProposedAction {
  readonly actionType: string
  readonly summary: string
  readonly rationale: string
  readonly riskTier: RiskTier
  /** Why it was not applied automatically. Always populated. */
  readonly heldBecause: string
  readonly qualityGate?: QualityGateResult
}

/** What the caller must supply for the agent to act. */
export interface AgentRunContext {
  readonly organizationId: string
  readonly businessId: string
  readonly vertical: string
  readonly autonomyMode: AutonomyMode
  readonly businessRules: readonly BusinessRule[]
  readonly facts: readonly GroundingFact[]
  readonly language: 'en' | 'he'
  readonly existingContent?: readonly string[]
}

/** Applies one action to the world. Supplied by the caller so the agent stays testable. */
export type ActionApplier = (
  action: PlannedAction,
  autoPublish: boolean,
) => Promise<{ versionId: string; published: boolean }>

export interface AgentRunOptions {
  readonly context: AgentRunContext
  /**
   * Diagnosed opportunities, optionally carrying the customer's dismissal. A dismissed
   * opportunity is never re-proposed: telling someone about a problem they have explicitly
   * declined to fix is how an assistant becomes a nuisance.
   */
  readonly opportunities: readonly (Opportunity & { dismissed?: boolean })[]
  /** Turns an opportunity into a concrete change. Returns null when it cannot be grounded. */
  readonly planner: (opportunity: Opportunity) => PlannedAction | null
  readonly applier: ActionApplier
  readonly limits?: AgentLimits
  readonly registry?: ToolRegistry
  readonly clock?: Clock
  readonly logger?: Logger
  readonly signal?: AbortSignal
  readonly onStep?: (step: AgentStep) => void | Promise<void>
}

/**
 * The gate chain.
 *
 * Order matters and is not negotiable:
 *   1. controllability  — we may only act on what we control;
 *   2. business rules   — the customer's boundaries outrank everything;
 *   3. quality gates    — nothing ungrounded reaches a website;
 *   4. autonomy + risk  — even a perfect change needs permission to publish itself.
 *
 * A failure at any stage produces a proposal for a human, never a silent skip.
 */
export interface GateOutcome {
  readonly canApply: boolean
  readonly requiresApproval: boolean
  readonly reason: string
  readonly qualityGate?: QualityGateResult
}

export const evaluateGates = (
  action: PlannedAction,
  opportunity: Opportunity,
  context: AgentRunContext,
): GateOutcome => {
  if (opportunity.controllability !== 'CONTROLLED') {
    return {
      canApply: false,
      requiresApproval: false,
      reason:
        'This gap depends on things outside your website that we cannot change for you, ' +
        'so we are reporting it rather than acting on it.',
    }
  }

  const constraints = evaluateConstraints(
    {
      actionType: action.actionType,
      text: action.text,
      createsPageType: action.createsPageType,
      language: action.language,
      riskTier: action.riskTier,
    },
    context.businessRules,
  )

  if (!constraints.allowed) {
    return {
      canApply: false,
      requiresApproval: false,
      reason: constraints.violations.map((v) => v.reason).join(' '),
    }
  }

  // Only content-bearing changes go through the content quality gates.
  let qualityGate: QualityGateResult | undefined
  if (action.text) {
    qualityGate = runQualityGates({
      text: action.text,
      language: action.language ?? context.language,
      facts: context.facts,
      assertedAttributes: action.assertedAttributes,
      existingContent: context.existingContent,
      structuredData: action.payload.structuredData as Record<string, unknown> | undefined,
      vertical: context.vertical,
    })

    if (!qualityGate.passed) {
      const blocking = qualityGate.findings.filter((f) => f.severity === 'BLOCK')
      return {
        canApply: false,
        requiresApproval: true,
        qualityGate,
        reason:
          blocking.length > 0
            ? blocking.map((f) => f.message).join(' ')
            : `Our checks were not confident enough (${Math.round(qualityGate.confidence * 100)}%, ` +
              `we need ${PUBLISH_CONFIDENCE_THRESHOLD * 100}%), so this is waiting for you.`,
      }
    }
  }

  if (constraints.requiresApproval) {
    return {
      canApply: false,
      requiresApproval: true,
      qualityGate,
      reason: 'You asked to review changes of this kind before they go live.',
    }
  }

  if (!canAutoApply(context.autonomyMode, action.riskTier)) {
    return {
      canApply: false,
      requiresApproval: true,
      qualityGate,
      reason:
        action.riskTier === 'HIGH'
          ? 'Changes like this always need your explicit approval.'
          : `Your automation setting (${context.autonomyMode}) holds ${action.riskTier.toLowerCase()}-risk changes for approval.`,
    }
  }

  return { canApply: true, requiresApproval: false, qualityGate, reason: 'Passed every check.' }
}

/**
 * Runs one bounded optimization cycle.
 *
 * Note that this is not a free-form "think until done" loop. The agent works through a
 * prioritised list, one opportunity per iteration, with every limit checked around each
 * step. Bounded iteration over a ranked list is both cheaper and far easier to audit than
 * open-ended reasoning, and for this problem it produces the same answers.
 */
export const runAgent = async (options: AgentRunOptions): Promise<AgentRunResult> => {
  const clock = options.clock ?? systemClock
  const logger = (options.logger ?? noopLogger).child({ component: 'agent' })
  const budget = new AgentBudget(options.limits ?? DEFAULT_LIMITS, clock)
  const memory = new ShortTermMemory()
  const runId = newId<'AgentRunId'>()

  const steps: AgentStep[] = []
  const appliedActions: AppliedAction[] = []
  const proposedActions: ProposedAction[] = []
  const errors: string[] = []

  const record = async (step: Omit<AgentStep, 'sequence' | 'at'>): Promise<void> => {
    const full: AgentStep = { ...step, sequence: memory.nextStep(), at: clock.now() }
    steps.push(full)
    await options.onStep?.(full)
  }

  let stopReason: StopReason = 'COMPLETED'
  /**
   * Guards against applying the same kind of change to the same page twice in one run.
   * Two different findings (a missing summary and an over-long title) legitimately both
   * suggest FIX_METADATA on the home page; writing to the customer's site twice for that
   * is wasteful and makes the change history harder to read.
   */
  const appliedTargets = new Set<string>()

  await record({
    stepType: 'DECISION',
    reason:
      `Starting an optimization cycle in ${options.context.autonomyMode} mode with ` +
      `${options.opportunities.length} diagnosed opportunities.`,
    costMinor: 0,
  })

  // Controllable work first: acting on what we control is both more likely to help and
  // the only thing we can honestly promise.
  const queue = [...options.opportunities]
    .filter((o) => o.dismissed !== true)
    .sort((a, b) => {
      if (a.autoFixable !== b.autoFixable) return a.autoFixable ? -1 : 1
      return b.score - a.score
    })

  try {
    for (const opportunity of queue) {
      if (options.signal?.aborted) {
        stopReason = 'CANCELLED'
        break
      }

      const limit = budget.check()
      if (limit) {
        stopReason = limit
        await record({
          stepType: 'LIMIT',
          reason: `Stopping: ${limit}. Nothing was left half-applied.`,
          costMinor: 0,
        })
        break
      }

      budget.startIteration()

      const action = options.planner(opportunity)
      if (!action) {
        proposedActions.push({
          actionType: opportunity.suggestedActionType ?? 'MANUAL',
          summary: opportunity.title,
          rationale: opportunity.explanation,
          riskTier: opportunity.riskTier,
          heldBecause:
            'We could not build a change for this that is fully grounded in your confirmed ' +
            'information, so it needs a person.',
        })
        await record({
          stepType: 'DECISION',
          reason: `No grounded change could be built for "${opportunity.title}".`,
          costMinor: 0,
        })
        continue
      }

      const targetKey = `${action.actionType}:${action.targetUrl ?? ''}`
      if (appliedTargets.has(targetKey)) {
        await record({
          stepType: 'DECISION',
          reason: `Already applied ${action.actionType} to this page in this run; skipping the duplicate.`,
          costMinor: 0,
        })
        continue
      }

      const gate = evaluateGates(action, opportunity, options.context)
      await record({
        stepType: 'GATE',
        toolName: action.actionType,
        input: { opportunity: opportunity.dedupeKey, riskTier: action.riskTier },
        output: {
          canApply: gate.canApply,
          requiresApproval: gate.requiresApproval,
          qualityConfidence: gate.qualityGate?.confidence,
        },
        reason: gate.reason,
        costMinor: 0,
      })

      if (!gate.canApply) {
        proposedActions.push({
          actionType: action.actionType,
          summary: action.summary,
          rationale: action.rationale,
          riskTier: action.riskTier,
          heldBecause: gate.reason,
          qualityGate: gate.qualityGate,
        })
        memory.decide(`hold ${action.actionType}`, gate.reason, clock.now())
        continue
      }

      // A publish consumes budget, so check affordability before touching the site.
      const affordability = budget.canAfford({ publishes: 1 })
      if (affordability) {
        stopReason = affordability
        await record({
          stepType: 'LIMIT',
          reason: `Stopping before publishing: ${affordability}.`,
          costMinor: 0,
        })
        break
      }

      const startedAt = clock.timestamp()
      try {
        const result = await options.applier(action, true)
        budget.recordToolCall({ published: result.published })
        appliedTargets.add(targetKey)

        appliedActions.push({
          actionType: action.actionType,
          summary: action.summary,
          targetUrl: action.targetUrl,
          versionId: result.versionId,
          riskTier: action.riskTier,
        })

        await record({
          stepType: 'TOOL_CALL',
          toolName: action.actionType,
          input: { url: action.targetUrl },
          output: { versionId: result.versionId, published: result.published },
          reason: action.rationale,
          durationMs: clock.timestamp() - startedAt,
          costMinor: 0,
        })
        memory.observe(action.actionType, action.summary, clock.now())
      } catch (e) {
        const message = isAppError(e) ? e.publicMessage : 'The change could not be applied.'
        errors.push(message)
        await record({
          stepType: 'ERROR',
          toolName: action.actionType,
          error: message,
          reason: 'The change failed to apply and was recorded as failed, not as done.',
          durationMs: clock.timestamp() - startedAt,
          costMinor: 0,
        })
        logger.warn('action failed', { actionType: action.actionType, err: e })
      }
    }
  } catch (e) {
    stopReason = 'ERROR'
    errors.push(e instanceof Error ? e.message : String(e))
    logger.error('agent run failed', { err: e })
  }

  if (stopReason === 'COMPLETED' && appliedActions.length === 0 && proposedActions.length === 0) {
    stopReason = 'NO_WORK'
  }

  const status: AgentRunResult['status'] =
    stopReason === 'ERROR'
      ? 'FAILED'
      : stopReason === 'CANCELLED'
        ? 'CANCELED'
        : stopReason === 'MAX_SPEND'
          ? 'STOPPED_BUDGET'
          : stopReason === 'COMPLETED' || stopReason === 'NO_WORK'
            ? 'COMPLETED'
            : 'STOPPED_LIMIT'

  return {
    runId,
    status,
    stopReason,
    steps,
    usage: budget.snapshot(),
    summary: buildSummary(appliedActions, proposedActions, stopReason, options.context.language),
    appliedActions,
    proposedActions,
    errors,
  }
}

const buildSummary = (
  applied: readonly AppliedAction[],
  proposed: readonly ProposedAction[],
  stopReason: StopReason,
  language: 'en' | 'he',
): string => {
  if (language === 'he') {
    if (applied.length === 0 && proposed.length === 0) {
      return 'לא נמצאו שינויים שכדאי לבצע כרגע.'
    }
    return (
      `ביצענו ${applied.length} שינויים באתר שלך` +
      (proposed.length > 0 ? `, ו-${proposed.length} ממתינים לאישור שלך.` : '.')
    )
  }

  if (applied.length === 0 && proposed.length === 0) {
    return 'Nothing needed changing this cycle.'
  }

  const parts = [
    applied.length > 0
      ? `Applied ${applied.length} change${applied.length === 1 ? '' : 's'} to your website.`
      : 'No changes were applied automatically.',
  ]
  if (proposed.length > 0) {
    parts.push(
      `${proposed.length} more ${proposed.length === 1 ? 'is' : 'are'} waiting for your approval.`,
    )
  }
  if (stopReason !== 'COMPLETED' && stopReason !== 'NO_WORK') {
    parts.push(`The run stopped early (${stopReason.toLowerCase().replace(/_/g, ' ')}).`)
  }
  return parts.join(' ')
}

/** Guard for tool invocation. Refuses a write tool outside a writing mode. */
export const assertToolAllowed = (toolName: string, autonomyMode: AutonomyMode): void => {
  if (isWriteTool(toolName) && autonomyMode !== 'AUTO_SAFE' && autonomyMode !== 'AUTOPILOT') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Tool ${toolName} writes, and mode ${autonomyMode} does not permit writes`,
      publicMessage: 'Automatic changes are turned off for this business.',
      details: { toolName, autonomyMode },
    })
  }
}
