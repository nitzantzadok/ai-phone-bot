import { buildPlaybook } from '@autopilot/insights/playbook.ts'
import { Shell, languageFrom } from '@/components/shell'

/**
 * The insights page: how a business actually gets recommended by AI.
 *
 * Given away in full, deliberately. A business that follows this is measurably easier to
 * recommend whether or not they pay us, and a product that only helps paying customers is
 * one nobody trusts enough to pay for. What we sell is doing it continuously and measuring
 * whether it worked.
 */
export default async function Insights({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const playbook = buildPlaybook({ vertical: 'local_business', language, maxGeneral: 20 })

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          {he ? 'איך עסק נכנס להמלצות של AI' : 'How a business gets into AI recommendations'}
        </h1>
        <p className="mt-4 leading-relaxed text-[--color-muted]">
          {he
            ? 'אין כאן טריקים. מערכות AI ממליצות על עסק כשהן בטוחות מי הוא, יודעות למה הוא מתאים, ומוצאות את המידע הזה בכמה מקומות שמסכימים זה עם זה. כל השאר נובע מזה.'
            : 'There are no tricks here. AI systems recommend a business when they are sure who it is, know what it is good for, and find that information in several places that agree with each other. Everything else follows from that.'}
        </p>

        <div className="mt-10 space-y-8">
          {playbook.items.map((item, index) => (
            <article key={item.title} className="border-t border-[--color-line] pt-6">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-semibold text-[--color-accent]">{index + 1}</span>
                <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                {item.weDoThisForYou ? (
                  <span className="rounded-full bg-[--color-positive]/10 px-2 py-0.5 text-[11px] font-medium text-[--color-positive]">
                    {he ? 'אנחנו עושים את זה' : 'we do this'}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 leading-relaxed text-[--color-muted]">{item.why}</p>

              <ul className="mt-4 space-y-2">
                {item.steps.map((step) => (
                  <li key={step} className="flex gap-2.5 text-sm">
                    <span aria-hidden className="mt-2 inline-block size-1 shrink-0 rounded-full bg-[--color-accent]" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs text-[--color-muted]">
                <span className="font-medium">{he ? 'איך תדעו שזה עבד: ' : 'How you will know it worked: '}</span>
                {item.howYouWillKnow}
              </p>
            </article>
          ))}
        </div>

        {/* Stated separately so it is never mistaken for a task list. */}
        <section className="mt-14 rounded-xl border border-[--color-caution]/30 bg-[--color-caution]/5 p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            {he ? 'ומה שלא בשליטתנו — ולא נעמיד פנים אחרת' : 'And what is not in our control, and we will not pretend otherwise'}
          </h2>
          <div className="mt-4 space-y-6">
            {playbook.outsideOurControl.map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[--color-muted]">{item.why}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {item.steps.map((step) => (
                    <li key={step} className="flex gap-2.5 text-sm text-[--color-muted]">
                      <span aria-hidden className="mt-2 inline-block size-1 shrink-0 rounded-full bg-[--color-caution]" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  )
}
