/**
 * Runs a real scan against the local demo site and prints the report a customer would see.
 *
 *   pnpm --filter @autopilot/cli run demo:scan            # the site as most of them are
 *   pnpm --filter @autopilot/cli run demo:scan after      # the same site, written down
 *   pnpm --filter @autopilot/cli run demo:scan after json
 *
 * Nothing is stubbed: a real HTTP server, a real socket, the real crawler and the real
 * diagnosis. Only the website is ours.
 */
import { startDemoSite, type DemoVariant } from './testing/demo-site.ts'
import { scanBusiness } from './scan.ts'
import { renderReport } from './report-text.ts'

const variant = (process.argv[2] === 'after' ? 'after' : 'before') as DemoVariant
const asJson = process.argv.includes('json')

const site = await startDemoSite(variant)
try {
  const report = await scanBusiness({
    url: site.origin,
    language: 'he',
    allowPrivateHosts: true,
    measureAi: false,
    maxPages: 12,
  })
  console.log(asJson ? JSON.stringify(report, null, 2) : renderReport(report))
} finally {
  await site.close()
}
