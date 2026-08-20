/**
 * Structured logging with mandatory redaction.
 *
 * The redaction list is not advisory: `sanitize` walks every logged object. Access tokens,
 * refresh tokens, payment secrets, passwords and cookies must never reach a log sink
 * (brief §42), and relying on developers to remember that has a 100% historical failure
 * rate.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

export interface LogContext {
  readonly organizationId?: string
  readonly businessId?: string
  readonly userId?: string
  readonly jobId?: string
  readonly agentRunId?: string
  readonly requestId?: string
  readonly provider?: string
  readonly [key: string]: unknown
}

export interface Logger {
  trace(msg: string, ctx?: LogContext): void
  debug(msg: string, ctx?: LogContext): void
  info(msg: string, ctx?: LogContext): void
  warn(msg: string, ctx?: LogContext): void
  error(msg: string, ctx?: LogContext): void
  fatal(msg: string, ctx?: LogContext): void
  child(ctx: LogContext): Logger
}

const REDACTED = '[REDACTED]'

const SENSITIVE_KEY = new RegExp(
  [
    'password',
    'passwd',
    'secret',
    'token',
    'api[_-]?key',
    'apikey',
    'authorization',
    'cookie',
    'session',
    'refresh[_-]?token',
    'access[_-]?token',
    'client[_-]?secret',
    'private[_-]?key',
    'card',
    'cvv',
    'iban',
    'encryption[_-]?key',
  ].join('|'),
  'i',
)

/** Values that look like credentials even under an innocuous key name. */
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI-style
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, // Anthropic-style
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
  /\bya29\.[0-9A-Za-z_-]{20,}\b/g, // Google OAuth access token
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
]

const scrubString = (s: string): string =>
  SENSITIVE_VALUE_PATTERNS.reduce((acc, re) => acc.replace(re, REDACTED), s)

export const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return '[DEPTH_LIMIT]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message), stack: value.stack }
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitize(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : sanitize(v, depth + 1)
    }
    return out
  }
  return String(value)
}

export interface LogRecord {
  readonly level: LogLevel
  readonly time: string
  readonly msg: string
  readonly [key: string]: unknown
}

export type LogSink = (record: LogRecord) => void

export const jsonSink: LogSink = (record) => {
  const line = JSON.stringify(record)
  if (LEVEL_ORDER[record.level] >= LEVEL_ORDER.error) process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

export const createLogger = (
  options: { level?: LogLevel; base?: LogContext; sink?: LogSink } = {},
): Logger => {
  const level = options.level ?? 'info'
  const base = options.base ?? {}
  const sink = options.sink ?? jsonSink

  const emit = (lvl: LogLevel, msg: string, ctx?: LogContext): void => {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return
    sink({
      level: lvl,
      time: new Date().toISOString(),
      msg: scrubString(msg),
      ...(sanitize({ ...base, ...ctx }) as Record<string, unknown>),
    })
  }

  return {
    trace: (m, c) => emit('trace', m, c),
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, c) => emit('error', m, c),
    fatal: (m, c) => emit('fatal', m, c),
    child: (ctx) => createLogger({ level, base: { ...base, ...ctx }, sink }),
  }
}

/** Collects records in memory. Used by tests to assert that secrets never leak. */
export const createTestLogger = (): { logger: Logger; records: LogRecord[] } => {
  const records: LogRecord[] = []
  const logger = createLogger({ level: 'trace', sink: (r) => records.push(r) })
  return { logger, records }
}

export const noopLogger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
}
