import { NextResponse, type NextRequest } from 'next/server'
import { getPlan, type PlanCode } from '@autopilot/billing/plans.ts'
import { loadEnv } from '@autopilot/shared/env.ts'
import { classifySiteUrl } from '@/lib/scan-limits'
import { sessionCookie } from '@/lib/session'

/**
 * Entering the app after choosing a plan.
 *
 * POST only, and that is not pedantry. Next prefetches `<Link>` targets, so a route that
 * changes state on GET runs itself whenever a link to it is rendered — which is how a
 * "leave" link logs you out by existing, and how an "enter" link would sign you into a
 * business you never chose. GET is for reading. Every entry point here is a form.
 *
 * No payment is taken and no details are asked for yet. When billing is connected, the
 * checkout goes here and everything downstream stays as it is.
 */
export const runtime = 'nodejs'

const PLAN_CODES = ['FREE_SCAN', 'STARTER', 'GROWTH', 'PRO', 'AGENCY'] as const
const isPlanCode = (value: string): value is PlanCode =>
  (PLAN_CODES as readonly string[]).includes(value)

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const form = await request.formData()
  const read = (key: string): string => {
    const value = form.get(key)
    return typeof value === 'string' ? value : ''
  }

  const language = read('lang') === 'en' ? 'en' : 'he'
  const rawPlan = read('plan') || 'GROWTH'
  const plan = isPlanCode(rawPlan) ? rawPlan : 'GROWTH'
  const typed = read('url')
  const verdict = classifySiteUrl(typed, {
    allowLocalTargets: loadEnv().CRAWLER_ALLOW_PRIVATE_HOSTS,
  })

  // A relative Location, deliberately: both `nextUrl.origin` and `request.url` normalise
  // the host, so a browser on 127.0.0.1 would be sent to localhost — a different origin,
  // where the cookie set on this very response does not apply.
  const redirect = (path: string): NextResponse =>
    new NextResponse(null, { status: 303, headers: { location: path } })

  /* Without a site there is nothing for the app to be about — but bouncing back to an
     unchanged form is a button that appears to do nothing. The reason travels with the
     redirect so the form can say what was wrong with what they typed. */
  if (!verdict.ok) {
    const query = new URLSearchParams({ lang: language, problem: verdict.problem, url: typed })
    if (verdict.subject) query.set('host', verdict.subject)
    return redirect(`/join?${query.toString()}`)
  }
  const url = verdict.url

  const response = redirect(`/app?lang=${language}`)

  // Set on the response object rather than through `cookies()`: a hand-built NextResponse
  // does not pick up mutations made through that API, and the cookie silently never ships.
  const cookie = sessionCookie(
    { url, plan: getPlan(plan).code, startedAt: new Date().toISOString() },
    {
      // Behind a hosting proxy the original scheme arrives in this header; inside the
      // platform the request itself is plain http.
      secure: (request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol).startsWith(
        'https',
      ),
    },
  )
  response.cookies.set(cookie.name, cookie.value, cookie.options)

  return response
}
