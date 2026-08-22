import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * Leaves the app: forgets which business it was about.
 *
 * POST only. As a GET this was a link that signed you out simply by being rendered on the
 * page, because Next prefetches link targets.
 */
export const runtime = 'nodejs'

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const form = await request.formData()
  const lang = form.get('lang')
  const language = lang === 'en' ? 'en' : 'he'

  const response = new NextResponse(null, {
    status: 303,
    headers: { location: `/join?lang=${language}` },
  })
  response.cookies.delete(SESSION_COOKIE)
  return response
}
