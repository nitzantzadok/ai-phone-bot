import Link from 'next/link'
import { IL, resolveVatPeriod } from '@autopilot/shared/country.ts'
import { applyVatToNet, formatMoney } from '@autopilot/shared/money.ts'
import { purchasablePlans } from '@autopilot/billing/plans.ts'
import { Shell, languageFrom } from '@/components/shell'

/**
 * Pricing.
 *
 * Prices come from the same plan catalogue the metering layer enforces, and VAT from the
 * same versioned country config the invoice will use. A pricing page that drifts from what
 * the customer is actually charged is the fastest route to a chargeback.
 */
export default async function Pricing({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const locale = he ? 'he-IL' : 'en-IL'
  const plans = purchasablePlans()
  const vat = resolveVatPeriod(IL, new Date())

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          {he ? 'מחירים' : 'Pricing'}
        </h1>
        <p className="mt-3 text-muted">
          {he
            ? `כל המחירים לפני מע"מ (${vat.rateBps / 100}%). הסריקה הראשונה חינם, בלי כרטיס אשראי.`
            : `All prices before VAT (${vat.rateBps / 100}%). The first scan is free, with no credit card.`}
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const taxed = applyVatToNet(plan.monthlyNet!, vat.rateBps, vat.id)
            const featured = plan.code === 'GROWTH'
            return (
              <section
                key={plan.code}
                className={`rounded-xl border bg-white p-6 ${
                  featured ? 'border-accent shadow-sm' : 'border-line'
                }`}
              >
                {featured ? (
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                    {he ? 'הנפוץ ביותר' : 'Most popular'}
                  </span>
                ) : null}

                <h2 className="mt-3 text-lg font-semibold">
                  {plan.labels[language] ?? plan.name}
                </h2>

                <div className="mt-3">
                  <span className="text-3xl font-semibold tabular-nums">
                    {formatMoney(plan.monthlyNet!, locale)}
                  </span>
                  <span className="ms-1 text-sm text-muted">
                    {he ? '/ חודש + מע"מ' : '/ month + VAT'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {he
                    ? `כולל מע"מ: ${formatMoney(taxed.gross, locale)}`
                    : `Including VAT: ${formatMoney(taxed.gross, locale)}`}
                </p>

                {plan.trialDays > 0 ? (
                  <p className="mt-2 text-xs font-medium text-positive">
                    {he ? `${plan.trialDays} ימי ניסיון` : `${plan.trialDays}-day trial`}
                  </p>
                ) : null}

                <ul className="mt-5 space-y-2 text-sm">
                  {[
                    he
                      ? `${plan.limits.monitored_prompts} שאלות במעקב`
                      : `${plan.limits.monitored_prompts} monitored questions`,
                    he
                      ? `${plan.limits.prompt_execution.toLocaleString('he-IL')} בדיקות בחודש`
                      : `${plan.limits.prompt_execution.toLocaleString('en-US')} checks per month`,
                    he
                      ? `עד ${plan.limits.businesses} עסקים`
                      : `Up to ${plan.limits.businesses} business${plan.limits.businesses === 1 ? '' : 'es'}`,
                    he
                      ? `רמת אוטומציה מרבית: ${plan.maxAutonomy}`
                      : `Maximum automation: ${plan.maxAutonomy}`,
                  ].map((line) => (
                    <li key={line} className="flex gap-2 text-muted">
                      <span aria-hidden className="mt-2 inline-block size-1 shrink-0 rounded-full bg-accent" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/join?lang=${language}`}
                  className={`mt-6 block rounded-lg px-5 py-3 text-center text-sm font-medium ${
                    featured
                      ? 'bg-accent text-white'
                      : 'border border-line text-ink'
                  }`}
                >
                  {he ? 'התחילו בסריקה חינם' : 'Start with a free scan'}
                </Link>
              </section>
            )
          })}
        </div>

        <section className="mt-14 max-w-2xl space-y-6 text-sm">
          <div>
            <h3 className="font-semibold">{he ? 'מה קורה אם אבטל?' : 'What if I cancel?'}</h3>
            <p className="mt-1 text-muted">
              {he
                ? 'הכל נשאר כפי שהוא. כל שינוי שביצענו באתר שלכם נשאר שלכם, ואפשר לבטל כל שינוי בלחיצה גם אחרי הביטול.'
                : 'Everything stays as it is. Every change we made to your site remains yours, and any change can still be undone in one click after you cancel.'}
            </p>
          </div>
          <div>
            <h3 className="font-semibold">
              {he ? 'ואם התשלום נכשל?' : 'And if a payment fails?'}
            </h3>
            <p className="mt-1 text-muted">
              {he
                ? 'נמשיך למדוד עוד שבוע ולא נשנה כלום באתר עד שהתשלום יעבור. לא נחסום לכם את הנתונים בגלל כרטיס שפג תוקפו.'
                : 'We keep measuring for another week and change nothing on your site until payment goes through. We will not lock you out of your own data over an expired card.'}
            </p>
          </div>
          <div>
            <h3 className="font-semibold">
              {he ? 'אתם מבטיחים מקום ראשון?' : 'Do you guarantee first place?'}
            </h3>
            <p className="mt-1 text-muted">
              {he
                ? 'לא, ואף אחד לא יכול. אנחנו לא שולטים ב-ChatGPT, ב-Gemini או ב-Claude. אנחנו מודדים כמה פעמים אתם מופיעים, ומשפרים את מה שבשליטתכם — וזה מה שאנחנו מוכרים.'
                : 'No, and nobody can. We do not control ChatGPT, Gemini or Claude. We measure how often you appear and improve what is within your control, and that is what we sell.'}
            </p>
          </div>
        </section>
      </main>
    </Shell>
  )
}
