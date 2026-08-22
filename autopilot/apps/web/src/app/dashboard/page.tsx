import { compareScores, explainScore } from '@autopilot/scoring/airs.ts'
import { topOpportunities } from '@autopilot/optimization/diagnosis.ts'
import { Card, ControlBadge, Disclosure, Rate, SimulatedBadge, Stat } from '@/components/primitives'
import { Shell, languageFrom } from '@/components/shell'
import { dashboardData } from '@/lib/demo-data'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

/**
 * The customer dashboard.
 *
 * One primary number (AIRS), then the evidence behind it, then what the agent did about
 * it. Every rate carries its denominator, every simulated figure is badged, and every
 * opportunity says whether we can actually fix it.
 */
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const data = await dashboardData()
  const copy = t(language)

  const { before, after, diagnosis, agentRun, prompts, competitors } = data
  const comparison = compareScores(before.airs, after.airs)
  const checks = after.share.promptsEvaluated
  const accuracy = after.airs.components.entityAccuracy.value

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rosa</h1>
          <p className="text-sm text-muted">
            {he ? 'מסעדה איטלקית, תל אביב' : 'Italian restaurant, Tel Aviv'}
          </p>
        </div>
        {after.airs.simulated ? <SimulatedBadge label={copy.simulated} /> : null}
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <Stat
            label={copy.score}
            value={`${after.airs.score}`}
            sub={`${copy.scoreOutOf} · ${comparison.delta >= 0 ? '+' : ''}${comparison.delta} ${copy.thisMonth}`}
          />
          <p className="mt-3 text-sm text-muted">{explainScore(after.airs, language)}</p>
          <Disclosure text={after.airs.disclosure} />
        </Card>

        <Card
          title={copy.recommendationShare}
          hint={he ? `${prompts.length} שאלות על פני 3 מנועים` : `${prompts.length} questions x 3 engines`}
        >
          <div className="space-y-2.5">
            <Rate label={copy.mentioned} count={after.share.mentionCount} total={checks} />
            <Rate label={copy.top3} count={after.share.top3Count} total={checks} />
            <Rate label={copy.top1} count={after.share.top1Count} total={checks} />
          </div>
        </Card>

        <Card title={copy.agentActivity}>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={copy.applied} value={`${agentRun.appliedActions.length}`} />
            <Stat label={copy.waiting} value={`${agentRun.proposedActions.length}`} />
            <Stat label={copy.accuracy} value={`${Math.round(accuracy * 100)}%`} />
            <Stat label={copy.competitors} value={`${competitors.length}`} />
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title={copy.opportunities} hint={diagnosis.summary}>
          <ul className="space-y-4">
            {topOpportunities(diagnosis.opportunities, 5).map((opportunity) => (
              <li key={opportunity.dedupeKey}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{opportunity.title}</span>
                  <ControlBadge
                    controllability={opportunity.controllability}
                    label={
                      opportunity.controllability === 'CONTROLLED'
                        ? copy.controlled
                        : opportunity.controllability === 'INFLUENCEABLE'
                          ? copy.influenceable
                          : copy.notControlled
                    }
                  />
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {opportunity.explanation}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title={he ? 'מה שינינו' : 'What we changed'}
          hint={he ? 'כל שינוי ניתן לביטול.' : 'Every change is reversible.'}
        >
          <ul className="space-y-3">
            {agentRun.appliedActions.map((applied) => (
              <li key={applied.versionId} className="flex items-start gap-3">
                <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-positive" />
                <div>
                  <div className="text-sm">{applied.summary}</div>
                  <div className="text-xs text-muted">
                    {applied.targetUrl ?? ''} ·{' '}
                    {he
                      ? `סיכון ${applied.riskTier.toLowerCase()}`
                      : `${applied.riskTier.toLowerCase()} risk`}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {agentRun.proposedActions.length > 0 ? (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {copy.waiting}
              </h3>
              <ul className="mt-3 space-y-3">
                {agentRun.proposedActions.map((proposed, index) => (
                  <li key={`${proposed.actionType}-${index}`}>
                    <div className="text-sm">{proposed.summary}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {proposed.heldBecause}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="rounded-md bg-accent px-3 py-1 text-xs text-white">
                        {copy.approve}
                      </button>
                      <button className="rounded-md border border-line px-3 py-1 text-xs">
                        {copy.reject}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title={he ? 'השאלות שאנחנו במעקב אחריהן' : 'Questions we monitor'}>
        <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {prompts.slice(0, 8).map((prompt) => (
            <li key={prompt.id} className="text-sm text-muted">
              <span className="me-2 rounded bg-line px-1.5 py-0.5 text-[10px] uppercase">
                {prompt.language}
              </span>
              {prompt.queryText}
            </li>
          ))}
        </ul>
      </Card>
      </main>
    </Shell>
  )
}
