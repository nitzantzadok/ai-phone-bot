import { starterChecklist } from '@autopilot/insights/playbook.ts'
import { Shell, languageFrom } from '@/components/shell'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const checklist = starterChecklist(language)

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {he
            ? 'כשלקוח שואל את ChatGPT על עסק כמו שלכם — אתם בתשובה?'
            : 'When a customer asks ChatGPT for a business like yours, are you in the answer?'}
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-muted">
          {he
            ? 'היום לקוחות לא מחפשים ברשימה — הם שואלים שאלה ומקבלים שלושה שמות. אנחנו מודדים כמה פעמים אתם אחד מהם, מסבירים בדיוק למה לא, ומתקנים את מה שנמצא באתר שלכם.'
            : 'Customers no longer scan a list of results. They ask a question and get three names. We measure how often you are one of them, explain exactly why not, and fix what lives on your own site.'}
        </p>

        {/* The scan is the product's first promise, so it is the first thing on the page
            you can actually do — not a link to a page with a form on it. */}
        <form action="/scan" method="get" className="mt-8 max-w-xl">
          <input type="hidden" name="lang" value={language} />
          <label htmlFor="url" className="block text-sm font-medium">
            {he ? 'כתובת האתר שלכם' : 'Your website address'}
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="url"
              name="url"
              type="text"
              required
              dir="ltr"
              placeholder="example.co.il"
              className="min-w-0 flex-1 rounded-lg border border-line bg-white px-4 py-3 outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white"
            >
              {he ? 'סרקו אותי' : 'Scan me'}
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            {he
              ? 'בלי הרשמה, בלי כרטיס אשראי · התוצאה מופיעה על המסך'
              : 'No signup, no credit card · the result appears on screen'}
          </p>
        </form>

        {/* The four things that matter most, given away before anyone pays. */}
        <section className="mt-16">
          <h2 className="text-xl font-semibold tracking-tight">
            {he ? 'ארבעה דברים שתוכלו לעשות היום, בחינם' : 'Four things you can do today, free'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {he
              ? 'אלה הדברים עם ההשפעה הגדולה ביותר. הם נכונים בין אם תהיו לקוחות שלנו ובין אם לא.'
              : 'These carry the most weight. They are true whether or not you ever become a customer.'}
          </p>

          <ol className="mt-6 grid gap-6 sm:grid-cols-2">
            {checklist.map((item, index) => (
              <li key={item.title} className="rounded-xl border border-line bg-white p-5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-accent">{index + 1}</span>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.why}</p>
                <ul className="mt-3 space-y-1.5">
                  {item.steps.map((step) => (
                    <li key={step} className="flex gap-2 text-sm text-muted">
                      <span aria-hidden className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-accent" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                {item.weDoThisForYou ? (
                  <p className="mt-3 text-xs font-medium text-positive">
                    {he ? 'את זה אנחנו עושים עבורכם אוטומטית' : 'We do this for you automatically'}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-8 sm:grid-cols-3">
          {(he
            ? [
                { t: 'מודדים', b: 'שאלות אמיתיות שלקוחות שואלים, בעברית ובאנגלית, על פני כמה מנועי AI.' },
                { t: 'מאבחנים', b: 'מה חסר — ובכנות, איזה חלק מזה אנחנו יכולים לשנות ואיזה לא.' },
                { t: 'מתקנים ומודדים שוב', b: 'שינויים בטוחים והפיכים. ואז מודדים מחדש כדי לראות אם זה עבד.' },
              ]
            : [
                { t: 'We measure', b: 'Real customer questions, in Hebrew and English, across several AI engines.' },
                { t: 'We diagnose', b: 'What is missing, and honestly which part of it we can change and which we cannot.' },
                { t: 'We fix and re-measure', b: 'Safe, reversible changes. Then we measure again to see whether it worked.' },
              ]
          ).map((item) => (
            <div key={item.t}>
              <h3 className="text-sm font-semibold">{item.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.b}</p>
            </div>
          ))}
        </section>
      </main>
    </Shell>
  )
}
