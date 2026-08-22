import Link from 'next/link'
import { platformById, type PlatformId } from '@autopilot/insights/platforms.ts'
import { Shell, languageFrom } from '@/components/shell'

/**
 * Onboarding, steps two to four.
 *
 * The order is deliberate: the customer sees progress before being asked for anything else.
 * Confirming facts comes before choosing an automation level, because what we are allowed
 * to say about a business is the gate on everything the agent may later publish.
 */
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const language = languageFrom(params)
  const he = language === 'he'
  const website = typeof params.website === 'string' ? params.website : ''
  const platformId = (typeof params.platform === 'string' ? params.platform : 'custom') as PlatformId
  const guide = platformById(platformId)

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          {he ? 'שלב 2 מתוך 4' : 'Step 2 of 4'}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {he ? 'הסריקה רצה' : 'The scan is running'}
        </h1>
        {website ? (
          <p className="mt-2 text-sm text-muted" dir="ltr">
            {website}
          </p>
        ) : null}

        {/* Staged progress: the customer sees something within seconds, not after five minutes. */}
        <ol className="mt-8 space-y-4">
          {(he
            ? [
                { t: 'קוראים את האתר', s: 'רץ' },
                { t: 'בונים את פרופיל העסק', s: 'ממתין' },
                { t: 'מייצרים את השאלות שלקוחות שואלים', s: 'ממתין' },
                { t: 'שואלים את מנועי ה-AI', s: 'ממתין' },
                { t: 'מחשבים את הציון', s: 'ממתין' },
              ]
            : [
                { t: 'Reading your site', s: 'running' },
                { t: 'Building your business profile', s: 'waiting' },
                { t: 'Generating the questions customers ask', s: 'waiting' },
                { t: 'Asking the AI engines', s: 'waiting' },
                { t: 'Calculating your score', s: 'waiting' },
              ]
          ).map((stage, index) => (
            <li key={stage.t} className="flex items-center gap-3">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  index === 0
                    ? 'bg-accent text-white'
                    : 'bg-line text-muted'
                }`}
              >
                {index + 1}
              </span>
              <span className="text-sm">{stage.t}</span>
              <span className="text-xs text-muted">{stage.s}</span>
            </li>
          ))}
        </ol>

        {/* Step 3: confirming facts. This is the gate on everything we may later publish. */}
        <section className="mt-14 border-t border-line pt-8">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            {he ? 'שלב 3 מתוך 4' : 'Step 3 of 4'}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {he ? 'אישור הפרטים' : 'Confirm your details'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {he
              ? 'זה החלק החשוב ביותר. לעולם לא נכתוב על העסק שלכם משהו שלא אישרתם — גם אם זה נשמע נכון. מה שתסמנו כאן הוא בדיוק מה שמותר לנו לומר עליכם.'
              : 'This is the most important part. We will never write anything about your business that you have not confirmed, however true it sounds. What you tick here is exactly what we are allowed to say about you.'}
          </p>

          <div className="mt-5 rounded-xl border border-line bg-white p-5">
            <p className="text-sm font-medium">
              {he ? 'למה העסק שלכם מתאים?' : 'What is your business good for?'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {he
                ? 'סמנו רק מה שנכון באמת. מה שתסמנו — נוכל לכתוב עליו באתר.'
                : 'Tick only what is genuinely true. What you tick, we may write about on your site.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(he
                ? ['רומנטי / לדייט', 'מתאים למשפחות', 'ארוחות עסקיות', 'ישיבה בחוץ', 'כשר', 'נגיש', 'חניה', 'פתוח עד מאוחר']
                : ['Romantic / date', 'Family friendly', 'Business meals', 'Outdoor seating', 'Kosher', 'Accessible', 'Parking', 'Open late']
              ).map((attribute) => (
                <label
                  key={attribute}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <input type="checkbox" className="accent-accent" />
                  {attribute}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Step 4: how much autonomy. New customers start at RECOMMEND, per the product default. */}
        <section className="mt-12 border-t border-line pt-8">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            {he ? 'שלב 4 מתוך 4' : 'Step 4 of 4'}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {he ? 'כמה חופש לתת לנו?' : 'How much should we do on our own?'}
          </h2>

          <div className="mt-5 space-y-3">
            {(he
              ? [
                  { k: 'MONITOR', t: 'רק מעקב', d: 'נמדוד ונדווח. לא ניגע בכלום.' },
                  { k: 'RECOMMEND', t: 'המלצות בלבד', d: 'נראה לכם בדיוק מה לתקן. אתם מחליטים ומבצעים.', def: true },
                  { k: 'AUTO_SAFE', t: 'תיקונים בטוחים אוטומטית', d: 'תיקונים טכניים קטנים נעשים לבד. כל השאר מגיע לאישורכם.' },
                  { k: 'AUTOPILOT', t: 'אוטופיילוט מלא', d: 'גם שינויי תוכן נעשים לבד, לפי ההגדרות שלכם. שינויים רגישים תמיד מגיעים לאישור.' },
                ]
              : [
                  { k: 'MONITOR', t: 'Monitor only', d: 'We measure and report. We touch nothing.' },
                  { k: 'RECOMMEND', t: 'Recommendations only', d: 'We show you exactly what to fix. You decide and do it.', def: true },
                  { k: 'AUTO_SAFE', t: 'Safe fixes automatically', d: 'Small technical fixes happen on their own. Everything else comes to you.' },
                  { k: 'AUTOPILOT', t: 'Full autopilot', d: 'Content changes happen too, per your settings. Sensitive changes always come to you.' },
                ]
            ).map((mode) => (
              <label
                key={mode.k}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4"
              >
                <input
                  type="radio"
                  name="autonomy"
                  value={mode.k}
                  defaultChecked={mode.def}
                  className="mt-1 accent-accent"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{mode.t}</span>
                    {mode.def ? (
                      <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium">
                        {he ? 'ברירת מחדל' : 'default'}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{mode.d}</p>
                </div>
              </label>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted">
            {he
              ? 'אפשר לשנות מתי שתרצו. שינויים רגישים — מחיקת עמודים, מחירים, הצהרות משפטיות או רפואיות — תמיד דורשים אישור מפורש, בכל מצב.'
              : 'Changeable at any time. Sensitive changes — deleting pages, prices, legal or medical claims — always require explicit approval, in every mode.'}
          </p>
        </section>

        {/* Platform-specific connection, shown only when writing needs setup. */}
        <section className="mt-12 rounded-xl border border-line bg-white p-5">
          <h2 className="text-sm font-semibold">
            {he ? `חיבור ל${guide.hebrewName}` : `Connecting ${guide.name}`}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {he ? guide.summary.he : guide.summary.en}
          </p>
          <Link
            href={`/guides/${guide.id}?lang=${language}`}
            className="mt-3 inline-block text-sm text-accent underline"
          >
            {he ? `המדריך המלא (${guide.timeMinutes} דקות)` : `Full guide (${guide.timeMinutes} min)`}
          </Link>
        </section>

        <Link
          href={`/dashboard?lang=${language}`}
          className="mt-10 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white"
        >
          {he ? 'לדשבורד' : 'Go to the dashboard'}
        </Link>
      </main>
    </Shell>
  )
}
