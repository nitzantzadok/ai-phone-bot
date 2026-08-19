/**
 * Demo runner.
 *
 * Runs the complete loop against the Rosa fixture and prints what the product would show a
 * customer, plus the operator numbers underneath it. It costs nothing to run, needs no API
 * keys and no database, which is the point: the whole product should be inspectable in one
 * command before anyone spends money on it.
 *
 *   pnpm demo
 */
import { createLogger } from '@autopilot/shared/logger.ts'
import { formatMoney, majorUnits } from '@autopilot/shared/money.ts'
import { IL, resolveVatPeriod } from '@autopilot/shared/country.ts'
import { applyVatToNet } from '@autopilot/shared/money.ts'
import { compareScores, explainScore } from '@autopilot/scoring/airs.ts'
import { buildTerritories } from '@autopilot/prompts/territories.ts'
import { topOpportunities } from '@autopilot/optimization/diagnosis.ts'
import { contributionMargin } from '@autopilot/billing/economics.ts'
import { getPlan } from '@autopilot/billing/plans.ts'
import { runPipeline } from './pipeline.ts'

const bar = (label: string): string => `\n${'='.repeat(78)}\n${label}\n${'='.repeat(78)}`
const pct = (value: number): string => `${(value * 100).toFixed(0)}%`

const main = async (): Promise<void> => {
  const verbose = process.argv.includes('--verbose')
  const logger = verbose ? createLogger({ level: 'debug' }) : undefined

  console.log(bar('AI RECOMMENDATION AUTOPILOT - end-to-end demo'))
  console.log(
    'Running the full loop against the Rosa fixture: crawl, knowledge graph, prompt\n' +
      'universe, AI measurement, diagnosis, autonomous changes, and re-measurement.\n\n' +
      'Every AI observation below is SIMULATED. Nothing here is a real answer from\n' +
      'ChatGPT, Gemini or Claude, and the product will not present it as one.',
  )

  const startedAt = Date.now()
  const result = await runPipeline({ logger, maxPrompts: 24 })
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

  /* ------------------------------------------------------------ the scan ----- */
  console.log(bar('1. WHAT WE FOUND ON THE WEBSITE'))
  console.log(`Pages crawled:              ${result.crawl.pages.length}`)
  console.log(`Technical issues:           ${result.crawl.findings.length}`)
  console.log(`Technical discoverability:  ${pct(result.crawl.discoverability)}`)
  console.log(`Business information:       ${pct(result.entity.completeness)} complete`)
  if (result.entity.missingFields.length > 0) {
    console.log(`Missing:                    ${result.entity.missingFields.join(', ')}`)
  }
  console.log(`\nIdentified as:              ${result.entity.canonicalName} (${result.entity.entityType}) in ${result.entity.city}`)

  /* --------------------------------------------------------- the prompts ----- */
  console.log(bar('2. WHAT CUSTOMERS ARE ASKING'))
  console.log(`Monitored questions:        ${result.prompts.length} (Hebrew and English)\n`)
  for (const prompt of result.prompts.slice(0, 6)) {
    console.log(`  [${prompt.language}] ${prompt.queryText}`)
  }
  console.log('\nRecommendation territories:')
  for (const territory of buildTerritories(result.prompts)) {
    console.log(`  ${territory.tier.padEnd(13)} ${String(territory.prompts.length).padStart(3)} questions - ${territory.label}`)
  }

  /* ----------------------------------------------------------- the score ----- */
  console.log(bar('3. WHERE YOU STAND'))
  console.log(`AI Recommendation Score:    ${result.before.airs.score}/100  (confidence: ${result.before.airs.confidence})`)
  console.log(explainScore(result.before.airs))
  const checks = result.before.share.promptsEvaluated
  console.log(`\nAcross ${checks} checks (${result.prompts.length} questions x 3 engines):`)
  console.log(`  Mentioned in:             ${result.before.share.mentionCount}/${checks}`)
  console.log(`  Recommended in:           ${result.before.share.recommendationCount}/${checks}`)
  console.log(`  Top 3 in:                 ${result.before.share.top3Count}/${checks}`)
  console.log(`  First choice in:          ${result.before.share.top1Count}/${checks}`)
  console.log(`\nCompetitors found in AI answers: ${result.competitors.join(', ')}`)

  /* ------------------------------------------------------- the diagnosis ----- */
  console.log(bar('4. WHY'))
  console.log(`${result.diagnosis.summary}\n`)
  for (const [index, opportunity] of topOpportunities(result.diagnosis.opportunities, 5).entries()) {
    console.log(`${index + 1}. ${opportunity.title}`)
    console.log(`   ${opportunity.explanation}`)
    console.log(
      `   Control: ${opportunity.controllability}   Risk: ${opportunity.riskTier}   ` +
        `Auto-fix: ${opportunity.autoFixable ? 'yes' : 'no'}   Score: ${opportunity.score.toFixed(2)}\n`,
    )
  }

  const external = result.gaps.filter((g) => g.controllability === 'NOT_CONTROLLED')
  if (external.length > 0) {
    console.log('What we CANNOT fix for you:')
    for (const gap of external) console.log(`  - ${gap.attributeLabel}: ${gap.reason}`)
  }

  /* ----------------------------------------------------------- the agent ----- */
  console.log(bar('5. WHAT THE AGENT DID'))
  console.log(`${result.agentRun.summary}\n`)
  for (const applied of result.agentRun.appliedActions) {
    console.log(`  APPLIED   [${applied.riskTier}] ${applied.summary}`)
  }
  for (const proposed of result.agentRun.proposedActions) {
    console.log(`  WAITING   [${proposed.riskTier}] ${proposed.summary}`)
    console.log(`            because: ${proposed.heldBecause}`)
  }
  console.log(
    `\nSafety envelope: ${result.agentRun.usage.iterations} iterations, ` +
      `${result.agentRun.usage.publishOperations} publishes, ` +
      `stopped because: ${result.agentRun.stopReason}`,
  )

  /* -------------------------------------------------------- re-measured ----- */
  console.log(bar('6. AFTER RE-MEASURING'))
  const comparison = compareScores(result.before.airs, result.after.airs)
  console.log(`AI Recommendation Score:    ${result.before.airs.score} -> ${result.after.airs.score}  (${comparison.delta >= 0 ? '+' : ''}${comparison.delta})`)
  console.log(`Comparable:                 ${comparison.comparable ? 'yes' : 'no'} - ${comparison.reason}`)
  console.log(`Recommended in:             ${result.before.share.recommendationCount} -> ${result.after.share.recommendationCount} of ${result.after.share.promptsEvaluated} checks`)
  console.log(
    `Attribute evidence:         ${pct(result.before.airs.components.attributeMatch.value)} -> ${pct(result.after.airs.components.attributeMatch.value)}`,
  )
  console.log(`\n${result.after.airs.disclosure}`)

  /* ---------------------------------------------------------- economics ----- */
  console.log(bar('7. OPERATOR VIEW (never shown to a customer)'))
  const plan = getPlan('GROWTH')
  const period = resolveVatPeriod(IL, new Date())
  const invoice = applyVatToNet(plan.monthlyNet!, period.rateBps, period.id)
  console.log(`Plan:                       ${plan.name}`)
  console.log(`Net / VAT / Gross:          ${formatMoney(invoice.net, 'he-IL')} / ${formatMoney(invoice.vat, 'he-IL')} / ${formatMoney(invoice.gross, 'he-IL')}  (${period.id})`)
  console.log(`AI + search cost this run:  ${formatMoney(majorUnits(result.costMinor / 100, 'ILS'), 'he-IL')}  (simulated providers cost nothing)`)

  const margin = contributionMargin({
    netRevenueMinor: plan.monthlyNet!.amount,
    aiCostMinor: 9_000,
    searchCostMinor: 3_500,
    infrastructureAllocationMinor: 4_000,
    paymentProcessingMinor: 2_100,
    supportAllocationMinor: 3_000,
  })
  console.log(`Modelled contribution:      ${formatMoney(margin.contributionMargin, 'he-IL')} (${pct(margin.marginRatio)} margin, API at ${pct(margin.apiCostRatio)} of revenue)`)
  console.log(`Wall clock:                 ${elapsed}s`)

  console.log(bar('DONE'))
}

main().catch((error: unknown) => {
  console.error('Demo failed:', error)
  process.exitCode = 1
})
