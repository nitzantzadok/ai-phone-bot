/**
 * `pnpm scan <url>` — run a real scan against a live website and print the result.
 *
 * This is the product's first honest moment with a customer, so the output follows one
 * rule: every number on screen came from something we actually did during this run, and
 * anything we did not do says so in the same breath. A report that quietly omits the AI
 * measurement reads exactly like a report that performed it.
 */
import { scanBusiness } from './scan.ts'
import { renderReport } from './report-text.ts'

/**
 * Loads `autopilot/.env` when one exists.
 *
 * Without this the only way to supply a provider key is to prefix the command with it,
 * which puts a live secret into shell history and into the process list. A gitignored
 * file is the boring, safe place for it. Node reads it natively, so this costs no
 * dependency, and a missing file is the normal case rather than an error.
 */
const loadDotEnv = (): void => {
  const root = new URL('../../../.env', import.meta.url)
  try {
    process.loadEnvFile(root)
  } catch {
    // No .env, or unreadable. Environment variables already set still apply.
  }
}
loadDotEnv()
import { createLogger } from '@autopilot/shared/logger.ts'

interface Args {
  readonly url: string
  readonly language: 'he' | 'en'
  readonly json: boolean
  readonly verbose: boolean
  readonly maxPages?: number
  readonly maxPrompts?: number
  readonly vertical?: string
  readonly city?: string
  readonly measureAi?: boolean
  readonly allowPrivateHosts?: boolean
}

const USAGE = `
Usage: pnpm scan <url> [options]

  --lang he|en        Report language (default: he)
  --json              Print the full report as JSON instead of prose
  --pages N           Maximum pages to crawl (default: 25)
  --prompts N         Maximum questions to generate (default: 40)
  --vertical ID       Override the detected business type
  --city NAME         Override the city read from the site
  --no-ai             Skip AI visibility measurement even if a key is configured
  --allow-private     Permit 127.0.0.1 targets (local testing only)
  --verbose           Log crawl progress

AI visibility is measured only when ANTHROPIC_API_KEY, OPENAI_API_KEY or
GEMINI_API_KEY is set. Without one, that half of the report is reported as
not measured. It is never simulated.

Keys are read from autopilot/.env (gitignored) or the environment. Prefer the
file: a key on the command line ends up in your shell history.
`.trim()

const parseArgs = (argv: readonly string[]): Args | null => {
  const positional: string[] = []
  const flags = new Map<string, string | true>()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next)
      i++
    } else {
      flags.set(key, true)
    }
  }

  const url = positional[0]
  if (!url) return null

  const num = (key: string): number | undefined => {
    const raw = flags.get(key)
    if (typeof raw !== 'string') return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
  }
  const str = (key: string): string | undefined => {
    const raw = flags.get(key)
    return typeof raw === 'string' ? raw : undefined
  }

  return {
    url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    language: str('lang') === 'en' ? 'en' : 'he',
    json: flags.get('json') === true,
    verbose: flags.get('verbose') === true,
    maxPages: num('pages'),
    maxPrompts: num('prompts'),
    vertical: str('vertical'),
    city: str('city'),
    measureAi: flags.get('no-ai') === true ? false : undefined,
    // undefined, not false, when the flag is absent: the scan falls back to
    // CRAWLER_ALLOW_PRIVATE_HOSTS with `??`, and `false ?? env` never falls through — so
    // passing a boolean here silently disables the environment variable entirely.
    allowPrivateHosts: flags.get('allow-private') === true ? true : undefined,
  }
}

/* -------------------------------------------------------------------- main --- */

const main = async (): Promise<number> => {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.log(USAGE)
    return 1
  }

  try {
    const report = await scanBusiness({
      url: args.url,
      language: args.language,
      vertical: args.vertical,
      city: args.city,
      maxPages: args.maxPages,
      maxPrompts: args.maxPrompts,
      measureAi: args.measureAi,
      allowPrivateHosts: args.allowPrivateHosts,
      // Crawl progress goes to stderr as JSON so `--json` stays pipeable.
      logger: args.verbose ? createLogger({ level: 'debug' }) : undefined,
    })

    console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report))
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const heading = args.language === 'he' ? 'הסריקה נכשלה' : 'Scan failed'
    console.error(`\n${heading}: ${message}\n`)
    if (args.verbose && error instanceof Error && error.stack) console.error(error.stack)
    return 2
  }
}

process.exitCode = await main()
