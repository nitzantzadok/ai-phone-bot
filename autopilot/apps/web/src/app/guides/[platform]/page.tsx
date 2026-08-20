import Link from 'next/link'
import {
  GOOGLE_GUIDE,
  PLATFORM_GUIDES,
  platformById,
  type PlatformId,
} from '@autopilot/insights/platforms.ts'
import { Shell, languageFrom } from '@/components/shell'

export const dynamicParams = false

export function generateStaticParams() {
  return [...PLATFORM_GUIDES.map((p) => ({ platform: p.id })), { platform: 'google' }]
}

/**
 * Per-platform connection guide.
 *
 * Written for someone who has never heard the word API. Where we cannot write to a
 * platform, the page says so at the top rather than at the bottom, because a customer who
 * follows five steps and then discovers their platform is unsupported has been wasted.
 */
export default async function Guide({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { platform } = await params
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const guide = platform === 'google' ? GOOGLE_GUIDE : platformById(platform as PlatformId)

  const supportLabel = {
    AUTOMATIC: he ? 'אנחנו מתקנים עבורכם' : 'We fix it for you',
    GUIDED: he ? 'אנחנו מכינים, אתם מדביקים' : 'We prepare it, you paste it',
    PLANNED: he ? 'סריקה בלבד בשלב זה' : 'Scanning only for now',
  }[guide.writeSupport]

  const supportStyle = {
    AUTOMATIC: 'bg-[--color-positive]/10 text-[--color-positive]',
    GUIDED: 'bg-[--color-caution]/10 text-[--color-caution]',
    PLANNED: 'bg-[--color-muted]/10 text-[--color-muted]',
  }[guide.writeSupport]

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href={`/join?lang=${language}`} className="text-sm text-[--color-muted] underline">
          {he ? 'חזרה' : 'Back'}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {he ? guide.hebrewName : guide.name}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${supportStyle}`}>
            {supportLabel}
          </span>
          <span className="text-xs text-[--color-muted]">
            {he ? `כ-${guide.timeMinutes} דקות` : `about ${guide.timeMinutes} min`}
          </span>
        </div>

        <p className="mt-4 leading-relaxed text-[--color-muted]">
          {he ? guide.summary.he : guide.summary.en}
        </p>

        {guide.limitation ? (
          <div className="mt-5 rounded-lg border border-[--color-caution]/30 bg-[--color-caution]/5 p-4 text-sm">
            <span className="font-medium">{he ? 'שימו לב: ' : 'Note: '}</span>
            {he ? guide.limitation.he : guide.limitation.en}
          </div>
        ) : null}

        <ol className="mt-8 space-y-5">
          {guide.steps.map((step, index) => (
            <li key={step.en} className="flex gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[--color-accent] text-xs font-medium text-white">
                {index + 1}
              </span>
              <div>
                <p className="leading-relaxed">{he ? step.he : step.en}</p>
                {step.where ? (
                  <p className="mt-1 text-xs text-[--color-muted]">
                    {he ? 'איפה: ' : 'Where: '}
                    <span className="font-medium">{he ? step.where.he : step.where.en}</span>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-10 rounded-xl border border-[--color-line] bg-white p-5">
          <h2 className="text-sm font-semibold">{he ? 'מה תקבלו' : 'What you get'}</h2>
          <p className="mt-1.5 text-sm text-[--color-muted]">
            {he ? guide.whatYouGet.he : guide.whatYouGet.en}
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={`/join?lang=${language}`}
            className="rounded-lg bg-[--color-accent] px-5 py-3 text-sm font-medium text-white"
          >
            {he ? 'התחילו סריקה חינם' : 'Start a free scan'}
          </Link>
          <Link
            href={`/guides/google?lang=${language}`}
            className="rounded-lg border border-[--color-line] px-5 py-3 text-sm"
          >
            {he ? 'חיבור פרופיל Google' : 'Connect Google profile'}
          </Link>
        </div>
      </main>
    </Shell>
  )
}
