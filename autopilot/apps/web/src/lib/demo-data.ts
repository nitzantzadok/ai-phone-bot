/**
 * Dashboard data source.
 *
 * The web app reads from the same domain packages as everything else. Until a database is
 * provisioned it renders the pipeline's own output, which means the dashboard is showing
 * real computed values from real code paths rather than hand-written placeholder numbers
 * that would drift from the engine the moment either changed.
 *
 * Cached per language, not globally. The run was shared across both, so whichever language
 * asked first decided what the other one saw — and since the pipeline pinned English
 * internally, a Hebrew visitor got a dashboard of English findings reflowed under RTL. The
 * join page sends people here to see what they are buying.
 */
import { runPipeline, type PipelineResult } from '@autopilot/cli/pipeline.ts'

const cached = new Map<'he' | 'en', Promise<PipelineResult>>()

/** Memoised per language: one pipeline run serves every page in a request cycle. */
export const dashboardData = (language: 'he' | 'en'): Promise<PipelineResult> => {
  const existing = cached.get(language)
  if (existing) return existing
  const run = runPipeline({ maxPrompts: 24, language })
  cached.set(language, run)
  return run
}
