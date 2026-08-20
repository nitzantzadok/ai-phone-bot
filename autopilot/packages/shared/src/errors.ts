/**
 * Typed error hierarchy.
 *
 * Two rules the whole codebase depends on:
 *  1. Errors carry a machine-readable `code` so callers branch on the code, never on
 *     message text.
 *  2. `publicMessage` is the ONLY thing that may be shown to a customer. Provider errors,
 *     stack traces and internal identifiers never cross that boundary (see §99 of the
 *     product brief: never expose raw provider errors).
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'TENANT_MISMATCH'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'UNSAFE_URL'
  | 'FETCH_FAILED'
  | 'NOT_IMPLEMENTED'
  | 'CONSTRAINT_VIOLATION'
  | 'QUALITY_GATE_FAILED'
  | 'APPROVAL_REQUIRED'
  | 'AGENT_LIMIT_REACHED'
  | 'INTERNAL'

export interface AppErrorOptions {
  readonly code: ErrorCode
  readonly message: string
  /** Safe to render to an end customer, in plain language. */
  readonly publicMessage?: string
  readonly details?: Record<string, unknown>
  readonly retryable?: boolean
  readonly cause?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly publicMessage: string
  readonly details: Record<string, unknown>
  readonly retryable: boolean

  constructor(options: AppErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.code = options.code
    this.publicMessage = options.publicMessage ?? DEFAULT_PUBLIC_MESSAGES[options.code]
    this.details = options.details ?? {}
    this.retryable = options.retryable ?? RETRYABLE_BY_DEFAULT.has(options.code)
  }

  /** Shape safe to return over HTTP to a customer. */
  toPublicJSON(): { code: ErrorCode; message: string } {
    return { code: this.code, message: this.publicMessage }
  }
}

const DEFAULT_PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Some of the information provided was not valid.',
  NOT_FOUND: 'We could not find what you were looking for.',
  FORBIDDEN: 'You do not have permission to do that.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  TENANT_MISMATCH: 'You do not have permission to do that.',
  CONFLICT: 'That change conflicts with something that already exists.',
  RATE_LIMITED: 'Too many requests. Please try again shortly.',
  BUDGET_EXCEEDED: 'This account has reached its analysis budget for now.',
  QUOTA_EXCEEDED: 'This plan has reached its usage limit for this period.',
  PROVIDER_ERROR: 'An external service had a problem. We will retry automatically.',
  PROVIDER_UNAVAILABLE: 'An external service is temporarily unavailable.',
  PROVIDER_TIMEOUT: 'An external service took too long to respond.',
  UNSAFE_URL: 'That address cannot be analysed.',
  FETCH_FAILED: 'We could not reach that website.',
  NOT_IMPLEMENTED: 'That capability is not available yet.',
  CONSTRAINT_VIOLATION: 'That change is blocked by your business rules.',
  QUALITY_GATE_FAILED: 'The change did not pass our quality checks, so it was not published.',
  APPROVAL_REQUIRED: 'This change needs your approval before it can be published.',
  AGENT_LIMIT_REACHED: 'The optimization run reached its safety limit and stopped.',
  INTERNAL: 'Something went wrong on our side.',
}

const RETRYABLE_BY_DEFAULT = new Set<ErrorCode>([
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'FETCH_FAILED',
])

export const isAppError = (e: unknown): e is AppError => e instanceof AppError

export const notFound = (what: string, details?: Record<string, unknown>): AppError =>
  new AppError({ code: 'NOT_FOUND', message: `${what} not found`, details })

export const forbidden = (why: string, details?: Record<string, unknown>): AppError =>
  new AppError({ code: 'FORBIDDEN', message: why, details })

export const invalid = (why: string, details?: Record<string, unknown>): AppError =>
  new AppError({ code: 'VALIDATION_FAILED', message: why, details })

export const notImplemented = (what: string): AppError =>
  new AppError({ code: 'NOT_IMPLEMENTED', message: `${what} is not implemented` })
