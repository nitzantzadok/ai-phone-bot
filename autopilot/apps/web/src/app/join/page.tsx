import Link from 'next/link'
import { platformsForPicker } from '@autopilot/insights/platforms.ts'
import { Shell, languageFrom } from '@/components/shell'

/**
 * The join flow, step one.
 *
 * One field. Everything else is asked later, after the customer has seen a result, because
 * a signup form that asks for a company name and a phone number before showing anything is
 * a form most small-business owners abandon.
 */
export default async function Join({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const platforms = platformsForPicker()

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          {he ? 'סריקה חינם' : 'Free scan'}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {he ? 'נתחיל מכתובת האתר שלכם' : 'Start with your website address'}
        </h1>
        <p className="mt-3 text-muted">
          {he
            ? 'זה כל מה שצריך. אין צורך בסיסמה, בהרשאה, באימייל או בכרטיס אשראי — התוצאה תופיע כאן על המסך.'
            : 'That is all we need. No password, no permission, no email, no credit card — the result appears here on screen.'}
        </p>

        <form action="/scan" method="get" className="mt-8 space-y-4">
          <input type="hidden" name="lang" value={language} />
          <div>
            <label htmlFor="url" className="block text-sm font-medium">
              {he ? 'כתובת האתר' : 'Website address'}
            </label>
            <input
              id="url"
              name="url"
              type="url"
              required
              dir="ltr"
              placeholder="https://your-business.co.il"
              className="mt-1.5 w-full rounded-lg border border-line px-4 py-3 outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="platform" className="block text-sm font-medium">
              {he ? 'על מה האתר בנוי?' : 'What is the site built on?'}
            </label>
            <p className="mt-1 text-xs text-muted">
              {he
                ? 'לא בטוחים? בחרו "לא יודע" — נזהה בעצמנו.'
                : 'Not sure? Choose "I don’t know" and we will detect it.'}
            </p>
            <select
              id="platform"
              name="platform"
              className="mt-1.5 w-full rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent"
            >
              <option value="">{he ? 'לא יודע / לא בטוח' : 'I don’t know'}</option>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {he ? platform.hebrewName : platform.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-6 py-3 font-medium text-white"
          >
            {he ? 'סרקו את האתר שלי' : 'Scan my site'}
          </button>
        </form>

        <p className="mt-4 text-xs text-muted">
          {he
            ? 'אנחנו קוראים רק עמודים ציבוריים באתר שלכם, ומכבדים את robots.txt. לא נשנה שום דבר בלי שתאשרו.'
            : 'We read only public pages on your site, and we respect robots.txt. Nothing changes without your approval.'}
        </p>

        <section className="mt-14 border-t border-line pt-8">
          <h2 className="text-sm font-semibold">
            {he ? 'מה קורה אחרי שתלחצו' : 'What happens after you click'}
          </h2>
          <ol className="mt-4 space-y-3">
            {(he
              ? [
                  'הסריקה מתחילה מיד ורצה מול האתר שלכם, לא מול מאגר.',
                  'תוך כמה שניות: מה שהאתר אומר על העסק, ומה חסר בו.',
                  'מיד אחר כך: ציון המוכנות שלכם והבעיות הטכניות שמצאנו.',
                  'ובסוף: רשימת התיקונים לפי סדר החשיבות, ומה מהם אנחנו יכולים לעשות עבורכם.',
                ]
              : [
                  'The scan starts immediately, against your live site rather than a database.',
                  'Within seconds: what your site says about the business, and what is missing.',
                  'Right after: your readiness score and the technical problems we found.',
                  'Finally: the fixes in priority order, and which of them we can do for you.',
                ]
            ).map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-muted">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-line text-[11px] font-medium text-ink">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-sm text-muted">
            {he ? 'רוצים לראות דוגמה לפני שאתם מתחילים? ' : 'Want to see an example first? '}
            <Link href={`/dashboard?lang=${language}`} className="underline">
              {he ? 'הנה דשבורד לדוגמה' : 'Here is a sample dashboard'}
            </Link>
          </p>
        </section>
      </main>
    </Shell>
  )
}
