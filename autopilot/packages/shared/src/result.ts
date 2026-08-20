/**
 * Result type for operations whose failure is an expected outcome rather than an
 * exception — quality gates, constraint checks, provider calls inside a retry loop.
 * Exceptions remain for genuinely exceptional situations.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (r.ok) return r.value
  throw r.error instanceof Error ? r.error : new Error(String(r.error))
}

export const mapResult = <T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r
