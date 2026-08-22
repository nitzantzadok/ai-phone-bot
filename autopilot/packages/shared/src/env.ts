/**
 * Strongly typed configuration.
 *
 * Parsed once, at startup, and validated. A missing production secret fails the process
 * immediately rather than at 3am inside a worker. Nothing outside this module reads
 * process.env.
 */
import { z } from 'zod'

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((v) => v === true || v === 'true' || v === '1' || v === 'yes')

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'ci', 'staging', 'production']).default('local'),
  APP_URL: z.url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),

  /** Master key for envelope-encrypting OAuth refresh tokens. base64, >=32 bytes. */
  ENCRYPTION_KEY: z.string().min(32).optional(),
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  SESSION_SECRET: z.string().min(32).optional(),

  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  /**
   * Override a provider's endpoint. Real uses: an enterprise gateway, a regional endpoint,
   * or a compatible host. Also what lets the measurement path be tested end-to-end against
   * a local server rather than mocked at the seam.
   */
  OPENAI_BASE_URL: z.url().optional(),
  ANTHROPIC_BASE_URL: z.url().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.url().optional(),

  PAYMENT_PROVIDER: z.enum(['mock', 'external']).default('mock'),
  PAYMENT_PROVIDER_KEY: z.string().min(1).optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(1).optional(),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  /** Force mock providers regardless of keys present. Guarantees a zero-spend dev loop. */
  USE_MOCK_PROVIDERS: bool.default(false),

  /** Global safety ceiling, in agorot, for a single agent run. */
  AGENT_MAX_SPEND_MINOR: z.coerce.number().int().positive().default(1500),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().positive().max(50).default(12),
  AGENT_MAX_WALLCLOCK_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),

  CRAWLER_USER_AGENT: z
    .string()
    .default('AIRecommendationAutopilotBot/0.1 (+https://example.com/bot)'),
  CRAWLER_MAX_PAGES: z.coerce.number().int().positive().max(2000).default(120),
  CRAWLER_MAX_BYTES: z.coerce.number().int().positive().default(5_000_000),
  CRAWLER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /** Escape hatch for integration tests against a local fixture server. NEVER in production. */
  CRAWLER_ALLOW_PRIVATE_HOSTS: bool.default(false),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  const env = parsed.data
  assertProductionInvariants(env)
  return env
}

export const env = (): Env => (cached ??= loadEnv())

/** Test helper — resets the memoised config. */
export const resetEnvCache = (): void => {
  cached = null
}

/**
 * Things that are merely inconvenient locally but unacceptable in production.
 * Failing here is deliberate: a production deploy without an encryption key would
 * otherwise silently store OAuth refresh tokens it cannot protect.
 */
function assertProductionInvariants(e: Env): void {
  if (e.APP_ENV !== 'production') return
  const missing: string[] = []
  if (!e.DATABASE_URL) missing.push('DATABASE_URL')
  if (!e.REDIS_URL) missing.push('REDIS_URL')
  if (!e.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY')
  if (!e.SESSION_SECRET) missing.push('SESSION_SECRET')
  if (e.CRAWLER_ALLOW_PRIVATE_HOSTS) missing.push('CRAWLER_ALLOW_PRIVATE_HOSTS must be false')
  if (e.USE_MOCK_PROVIDERS) missing.push('USE_MOCK_PROVIDERS must be false')
  if (missing.length) {
    throw new Error(`Production configuration invalid: ${missing.join(', ')}`)
  }
}

/** Which real providers are usable given the configured keys. */
export const configuredProviders = (e: Env): readonly ('openai' | 'gemini' | 'anthropic')[] => {
  if (e.USE_MOCK_PROVIDERS) return []
  const out: ('openai' | 'gemini' | 'anthropic')[] = []
  if (e.OPENAI_API_KEY) out.push('openai')
  if (e.GEMINI_API_KEY) out.push('gemini')
  if (e.ANTHROPIC_API_KEY) out.push('anthropic')
  return out
}
