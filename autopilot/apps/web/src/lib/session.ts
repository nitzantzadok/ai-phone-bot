import { cookies } from 'next/headers'
import type { PlanCode } from '@autopilot/billing/plans.ts'

/**
 * Who is using the app right now, without a database.
 *
 * The full product keeps businesses, scans and subscriptions in Postgres. Until that is
 * deployed, the app still has to be walkable end to end — you pick a plan, you land in a
 * dashboard, it shows your real site. One signed-in business is enough for that, and one
 * business fits in a cookie.
 *
 * What this deliberately is not: an account. There is no password, no server-side record,
 * and nothing here is proof of anything. It cannot gate access to another customer's data
 * because there is no other customer's data to reach — every page derives everything from
 * the URL in this cookie by scanning that site live. When accounts arrive, this file is
 * what they replace, and the pages above it barely change.
 */

export const SESSION_COOKIE = 'autopilot.business'
const COOKIE = SESSION_COOKIE
const MAX_AGE_DAYS = 30

export interface BusinessSession {
  /** The site every screen in the app reports on. */
  readonly url: string
  readonly plan: PlanCode
  /** When the plan was chosen, so the app can say "since" honestly. */
  readonly startedAt: string
}

const isPlanCode = (value: unknown): value is PlanCode =>
  value === 'FREE_SCAN' ||
  value === 'STARTER' ||
  value === 'GROWTH' ||
  value === 'PRO' ||
  value === 'AGENCY'

export const readSession = async (): Promise<BusinessSession | null> => {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { url, plan, startedAt } = parsed as Record<string, unknown>
    if (typeof url !== 'string' || url.length === 0) return null
    if (!isPlanCode(plan)) return null

    return {
      url,
      plan,
      startedAt: typeof startedAt === 'string' ? startedAt : new Date().toISOString(),
    }
  } catch {
    // A cookie a person edited by hand, or one written by an older version. Treat it as
    // absent rather than crashing a page on it.
    return null
  }
}

/**
 * The cookie to set, as data rather than as an effect.
 *
 * Route handlers must attach this to the response object they return: a hand-built
 * `NextResponse` does not pick up mutations made through the `cookies()` API, so setting
 * it that way produces a response with no Set-Cookie header and an app that forgets you
 * the moment you reload.
 *
 * `secure` follows the connection, not the build. Keying it off NODE_ENV looks right and
 * breaks the app: `next start` runs in production mode, so an app served locally over http
 * would mark the cookie Secure, the browser would refuse to store it, and every screen
 * would behave as though you had never chosen anything.
 */
export const sessionCookie = (
  session: BusinessSession,
  options: { secure: boolean },
): {
  name: string
  value: string
  options: {
    httpOnly: boolean
    sameSite: 'lax'
    secure: boolean
    path: string
    maxAge: number
  }
} => ({
  name: COOKIE,
  value: JSON.stringify(session),
  options: {
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secure,
    path: '/',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  },
})
