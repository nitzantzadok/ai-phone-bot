/**
 * Dashboard data source.
 *
 * The web app reads from the same domain packages as everything else. Until a database is
 * provisioned it renders the pipeline's own output, which means the dashboard is showing
 * real computed values from real code paths rather than hand-written placeholder numbers
 * that would drift from the engine the moment either changed.
 */
import { runPipeline, type PipelineResult } from '@autopilot/cli/pipeline.ts'

let cached: Promise<PipelineResult> | null = null

/** Memoised: one pipeline run serves every page in a request cycle. */
export const dashboardData = (): Promise<PipelineResult> => {
  cached ??= runPipeline({ maxPrompts: 24 })
  return cached
}
