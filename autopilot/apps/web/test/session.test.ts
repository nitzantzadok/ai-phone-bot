/**
 * Entering and leaving the app.
 *
 * Three of these tests exist because of bugs that all looked like "the app forgets me",
 * and none of which were visible in the code:
 *
 *  - a `<Link>` to a GET route that signs you out, which Next prefetches, so the page
 *    logged you out simply by rendering;
 *  - a cookie set through the `cookies()` API on a hand-built response, which never
 *    reaches the browser;
 *  - `secure: NODE_ENV === 'production'`, which is true under `next start` over plain
 *    http, so the browser silently refuses to store it.
 */
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import * as start from '../src/app/start/route'
import * as leave from '../src/app/app/leave/route'
import { sessionCookie, SESSION_COOKIE } from '../src/lib/session'

const postTo = (path: string, fields: Record<string, string>, headers: HeadersInit = {}) => {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  return new NextRequest(`http://127.0.0.1:3000${path}`, { method: 'POST', body, headers })
}

describe('choosing a plan', () => {
  it('sets the session on the response itself, not through the cookies() API', async () => {
    const response = await start.POST(
      postTo('/start', { url: 'example.co.il', plan: 'GROWTH', lang: 'he' }),
    )

    const cookie = response.cookies.get(SESSION_COOKIE)
    expect(cookie).toBeDefined()
    expect(JSON.parse(cookie!.value)).toMatchObject({
      url: 'https://example.co.il/',
      plan: 'GROWTH',
    })
  })

  it('redirects to a relative location, so the browser stays on its own origin', async () => {
    const response = await start.POST(postTo('/start', { url: 'example.co.il', plan: 'GROWTH' }))

    expect(response.status).toBe(303)
    // An absolute Location here normalises the host: a browser on 127.0.0.1 lands on
    // localhost, a different origin, where the cookie just set does not apply.
    expect(response.headers.get('location')).toBe('/app?lang=he')
  })

  it('sends you to enter a site when none was given', async () => {
    const response = await start.POST(postTo('/start', { plan: 'GROWTH', lang: 'he' }))

    expect(response.headers.get('location')).toContain('/join')
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })

  it('falls back to a real plan when handed nonsense', async () => {
    const response = await start.POST(
      postTo('/start', { url: 'example.co.il', plan: 'FREE_PONIES' }),
    )
    expect(JSON.parse(response.cookies.get(SESSION_COOKIE)!.value).plan).toBe('GROWTH')
  })

  it('cannot be triggered by a GET, which Next prefetches', () => {
    // A prefetched sign-in is a sign-in nobody clicked.
    expect('GET' in start).toBe(false)
  })
})

describe('leaving', () => {
  it('clears the session', async () => {
    const response = await leave.POST(postTo('/app/leave', { lang: 'he' }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/join?lang=he')
    // Next expresses a deletion as an empty value with an immediate expiry.
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBe('')
  })

  it('cannot be triggered by a GET, which Next prefetches', () => {
    // This one shipped: the link on the dashboard logged you out by being rendered.
    expect('GET' in leave).toBe(false)
  })
})

describe('the cookie itself', () => {
  it('is marked Secure only when the connection is', () => {
    const session = { url: 'https://example.co.il/', plan: 'GROWTH' as const, startedAt: 'now' }

    expect(sessionCookie(session, { secure: true }).options.secure).toBe(true)
    // Under `next start` over http this must be false, or the browser drops it and the
    // app appears to forget you the moment you reload.
    expect(sessionCookie(session, { secure: false }).options.secure).toBe(false)
  })

  it('is not readable by scripts and does not travel cross-site', () => {
    const cookie = sessionCookie(
      { url: 'https://example.co.il/', plan: 'FREE_SCAN', startedAt: 'now' },
      { secure: true },
    )
    expect(cookie.options.httpOnly).toBe(true)
    expect(cookie.options.sameSite).toBe('lax')
    expect(cookie.options.path).toBe('/')
  })

  it('follows the forwarded scheme behind a hosting proxy', async () => {
    // On Vercel the request inside the platform is plain http; the original scheme is in
    // the header. Reading the request's own protocol would leave the cookie unprotected.
    const response = await start.POST(
      postTo('/start', { url: 'example.co.il' }, { 'x-forwarded-proto': 'https' }),
    )
    expect(response.cookies.get(SESSION_COOKIE)?.secure).toBe(true)
  })
})
