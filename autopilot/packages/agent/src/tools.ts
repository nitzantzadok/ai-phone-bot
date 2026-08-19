/**
 * Agent tools.
 *
 * Every tool has a strict Zod schema, a declared side-effect class and a required
 * permission. There is no shell tool, no arbitrary HTTP tool, and no tool that deletes
 * customer content — the surface IS the permission model, so a confused or manipulated
 * agent cannot reach for something dangerous, because nothing dangerous is reachable.
 *
 * Tools that write are additionally gated at call time by autonomy mode, risk tier,
 * business rules and quality gates. The schema is the first gate, not the only one.
 */
import { z } from 'zod'

/** What a tool does to the world. Drives gating and audit-log severity. */
export type SideEffect = 'READ' | 'ANALYZE' | 'DRAFT' | 'PUBLISH'

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly sideEffect: SideEffect
  readonly inputSchema: z.ZodType<TInput>
  /** Estimated spend in minor units, for the pre-flight budget check. */
  readonly estimatedCostMinor: number
  readonly handler: (input: TInput, context: ToolContext) => Promise<TOutput>
}

export interface ToolContext {
  readonly organizationId: string
  readonly businessId: string
  readonly agentRunId: string
  readonly autonomyMode: string
  /** Set when the caller has an explicit human approval for this action. */
  readonly approvedActionIds?: ReadonlySet<string>
}

/* ------------------------------------------------------------------ schemas ----- */

export const CrawlWebsiteInput = z.object({
  url: z.url(),
  maxPages: z.number().int().min(1).max(500).default(60),
})

export const InspectPageInput = z.object({ url: z.url() })

export const AnalyzeBusinessInput = z.object({
  crawlId: z.string().min(1),
  vertical: z.string().min(1),
})

export const GeneratePromptsInput = z.object({
  vertical: z.string().min(1),
  city: z.string().min(1),
  languages: z.array(z.enum(['he', 'en', 'ar', 'ru'])).min(1),
  maxPrompts: z.number().int().min(1).max(200).default(60),
})

export const RunAIQueryInput = z.object({
  promptIds: z.array(z.string().min(1)).min(1).max(200),
  providers: z.array(z.enum(['openai', 'gemini', 'anthropic'])).min(1),
})

export const AnalyzeCompetitorInput = z.object({ competitorId: z.string().min(1) })

export const InspectSchemaInput = z.object({ url: z.url() })

export const GenerateSchemaInput = z.object({
  url: z.url(),
  schemaType: z.string().min(1),
})

export const CreateDraftInput = z.object({
  url: z.url(),
  heading: z.string().min(3).max(120),
  body: z.string().min(20).max(4000),
  attributeKey: z.string().optional(),
})

export const ModifyPageInput = z.object({
  url: z.url(),
  title: z.string().min(3).max(120).optional(),
  metaDescription: z.string().min(20).max(320).optional(),
  canonical: z.url().optional(),
  lang: z.enum(['he', 'en', 'ar', 'ru']).optional(),
})

export const PublishPageInput = z.object({
  versionId: z.string().min(1),
  /** Must reference an approval when the change is not auto-applicable. */
  approvalId: z.string().optional(),
})

export const RollbackChangeInput = z.object({
  versionId: z.string().min(1),
  reason: z.string().min(5),
})

export const UpdateBusinessProfileInput = z.object({
  locationId: z.string().min(1),
  phone: z.string().optional(),
  websiteUri: z.url().optional(),
  hours: z.record(z.string(), z.unknown()).optional(),
})

export const CalculateAirsInput = z.object({
  promptSetId: z.string().min(1),
  windowDays: z.number().int().min(1).max(180).default(30),
})

export const CreateExperimentInput = z.object({
  hypothesis: z.string().min(20).max(500),
  interventionType: z.string().min(1),
  affectedAttributes: z.array(z.string()).max(10),
  observationWindowDays: z.number().int().min(3).max(90).default(14),
})

export const EvaluateExperimentInput = z.object({ experimentId: z.string().min(1) })

/**
 * Side-effect classification for every tool the agent may hold.
 *
 * This table is the security boundary. A tool absent from it cannot be registered, and a
 * PUBLISH tool cannot be invoked in a mode that forbids writes.
 */
export const TOOL_SIDE_EFFECTS = {
  crawlWebsite: 'READ',
  inspectPage: 'READ',
  inspectSchema: 'READ',
  analyzeBusiness: 'ANALYZE',
  generatePrompts: 'ANALYZE',
  runAIQuery: 'ANALYZE',
  analyzeAIResponse: 'ANALYZE',
  analyzeCompetitor: 'ANALYZE',
  calculateAIRS: 'ANALYZE',
  evaluateExperiment: 'ANALYZE',
  generateSchema: 'DRAFT',
  createDraft: 'DRAFT',
  modifyPage: 'DRAFT',
  createExperiment: 'DRAFT',
  publishPage: 'PUBLISH',
  rollbackChange: 'PUBLISH',
  updateBusinessProfile: 'PUBLISH',
} as const satisfies Record<string, SideEffect>

export type ToolName = keyof typeof TOOL_SIDE_EFFECTS

export const isWriteTool = (name: string): boolean =>
  TOOL_SIDE_EFFECTS[name as ToolName] === 'PUBLISH'

/**
 * A registry that refuses to hold a tool it does not recognise.
 *
 * The failure mode this prevents: someone adds a capable tool later, forgets to classify
 * its side effects, and the autonomy gating silently treats it as a read.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never, unknown>>()

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    if (!(tool.name in TOOL_SIDE_EFFECTS)) {
      throw new Error(
        `Tool "${tool.name}" is not classified in TOOL_SIDE_EFFECTS. ` +
          'Classify it before registering, so autonomy gating cannot silently treat it as a read.',
      )
    }
    const declared = TOOL_SIDE_EFFECTS[tool.name as ToolName]
    if (tool.sideEffect !== declared) {
      throw new Error(
        `Tool "${tool.name}" declares side effect ${tool.sideEffect} but is classified as ${declared}.`,
      )
    }
    this.tools.set(tool.name, tool as unknown as ToolDefinition<never, unknown>)
  }

  get(name: string): ToolDefinition<never, unknown> | undefined {
    return this.tools.get(name)
  }

  names(): readonly string[] {
    return [...this.tools.keys()]
  }

  /** Tools available under a given autonomy mode. */
  availableFor(autonomyMode: string): readonly string[] {
    const writesAllowed = autonomyMode === 'AUTO_SAFE' || autonomyMode === 'AUTOPILOT'
    return this.names().filter((name) => writesAllowed || !isWriteTool(name))
  }
}
