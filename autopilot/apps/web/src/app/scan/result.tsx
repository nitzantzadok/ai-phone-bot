import Link from 'next/link'
import { headers } from 'next/headers'
import { scanBusiness, whyNothingWasRead, type ScanReport } from '@autopilot/cli/scan.ts'
import { checkRateLimit, normalizeSiteUrl } from '@/lib/scan-limits'

/**
 * The scan result.
 *
 * A server component that runs the real scan and awaits it. It is rendered inside a
 * Suspense boundary so the page shell and the waiting state reach the browser first —
 * a crawl takes seconds, and a blank tab for that long reads as a broken site.
 *
 * Everything shown here was measured during this request. Where something was not
 * measured, the page says so in the same place it would have shown the number.
 */

const clientKey = async (): Promise<string> => {
  const h = await headers()
  // Hosting platforms put the real client address in x-forwarded-for; the first entry is
  // the client, the rest are proxies. Falling back to a constant means a misconfigured
  // deployment rate-limits everyone together rather than nobody.
  const forwarded = h.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

const Bar = ({ value }: { value: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-line">
    <div
      className="h-full rounded-full bg-accent"
      style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
    />
  </div>
)

const Notice = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-line bg-white p-6">
    <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
    <div className="mt-2 space-y-3 text-sm text-muted">{children}</div>
  </div>
)

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const

export const ScanResult = async ({
  rawUrl,
  language,
}: {
  rawUrl: string
  language: 'he' | 'en'
}) => {
  const he = language === 'he'
  const url = normalizeSiteUrl(rawUrl)

  if (!url) {
    return (
      <Notice title={he ? 'הכתובת לא תקינה' : 'That address is not valid'}>
        <p>
          {he
            ? 'צריך כתובת אתר מלאה, למשל example.co.il. בדקו את מה שהזנתם ונסו שוב.'
            : 'We need a full website address, for example example.co.il. Check what you entered and try again.'}
        </p>
        <Link href={`/join?lang=${language}`} className="inline-block underline">
          {he ? 'חזרה' : 'Back'}
        </Link>
      </Notice>
    )
  }

  const limit = checkRateLimit(await clientKey())
  if (!limit.allowed) {
    return (
      <Notice title={he ? 'רגע אחד' : 'One moment'}>
        <p>
          {he
            ? `הרצתם כמה סריקות ברצף. נסו שוב בעוד כ-${Math.ceil(limit.retryAfterSeconds / 60)} דקות.`
            : `You have run several scans in a row. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`}
        </p>
        <p>
          {he
            ? 'המגבלה קיימת כדי שסריקה שלנו לא תעמיס על אתר של אף אחד.'
            : 'The limit exists so our scanning never becomes a load on anybody’s website.'}
        </p>
      </Notice>
    )
  }

  let report: ScanReport
  try {
    report = await scanBusiness({
      url,
      language,
      // Bounded for a web request: enough pages to read a small business site properly,
      // few enough to finish inside a serverless function's budget.
      maxPages: 12,
      maxPrompts: 24,
      maxSpendMinor: 300,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      <Notice title={he ? 'הסריקה נכשלה' : 'The scan failed'}>
        <p>
          {he
            ? 'לא הצלחנו לסרוק את הכתובת הזו. זה קורה כשהדומיין לא קיים, כשהאתר לא מגיב, או כשהוא חוסם גישה אוטומטית.'
            : 'We could not scan that address. That happens when the domain does not exist, the site does not respond, or it blocks automated access.'}
        </p>
        <p className="font-mono text-xs" dir="ltr">
          {message}
        </p>
        <Link href={`/join?lang=${language}`} className="inline-block underline">
          {he ? 'לנסות כתובת אחרת' : 'Try another address'}
        </Link>
      </Notice>
    )
  }

  /* ------------------------------------------------------ nothing was read ----- */
  if (report.crawl.pagesFetched === 0) {
    const why = whyNothingWasRead(report)

    const titles: Record<typeof why, string> = he
      ? {
          ROBOTS_BLOCKED: 'האתר שלכם חוסם סורקים',
          BOT_PROTECTION: 'ההגנה של האתר חסמה אותנו',
          SITE_ERRORS: 'האתר החזיר שגיאה בכל עמוד',
          UNREACHABLE: 'לא הצלחנו להגיע לאתר',
        }
      : {
          ROBOTS_BLOCKED: 'Your site blocks crawlers',
          BOT_PROTECTION: 'The site’s protection refused us',
          SITE_ERRORS: 'The site returned an error for every page',
          UNREACHABLE: 'We could not reach the site',
        }

    return (
      <Notice title={titles[why]}>
        {why === 'ROBOTS_BLOCKED' ? (
          <>
            <p>
              {he
                ? 'קובץ robots.txt באתר שלכם אומר לסורקים לא להיכנס. הוא חוסם באותה מידה גם את הסורקים של ChatGPT, Gemini ו-Claude.'
                : 'The robots.txt file on your site tells crawlers to stay out. It blocks the crawlers behind ChatGPT, Gemini and Claude just as effectively.'}
            </p>
            <p className="font-medium text-ink">
              {he
                ? 'זו כמעט תמיד הסיבה היחידה שעסק לא מופיע באף תשובה — וזה תיקון של שורה אחת.'
                : 'That is almost always the entire reason a business appears in no answer at all, and it is a one-line fix.'}
            </p>
          </>
        ) : why === 'BOT_PROTECTION' ? (
          <>
            <p>
              {he
                ? 'האתר זיהה אותנו כסורק אוטומטי וחסם את הגישה. זו לא תקלה — זו הגדרת הגנה, בדרך כלל Cloudflare או תוסף אבטחה.'
                : 'The site recognised us as an automated crawler and refused access. That is not a fault, it is a protection setting — usually Cloudflare or a security plugin.'}
            </p>
            <p className="font-medium text-ink">
              {he
                ? 'הסורקים שמזינים את התשובות של ChatGPT ו-Gemini נתקלים באותה חסימה בדיוק, ולכן הם לא רואים אתכם בכלל.'
                : 'The crawlers that feed ChatGPT and Gemini hit exactly the same wall, so they cannot see you at all.'}
            </p>
            <p>
              {he
                ? 'בהגדרות ההגנה אפשרו סורקים מאומתים, או הוסיפו חריגה ל-GPTBot, ClaudeBot, PerplexityBot ו-Google-Extended.'
                : 'In your protection settings allow verified bots, or add an exception for GPTBot, ClaudeBot, PerplexityBot and Google-Extended.'}
            </p>
          </>
        ) : why === 'SITE_ERRORS' ? (
          <p>
            {he
              ? 'האתר החזיר שגיאה בכל עמוד שביקשנו. מה שלא נטען עבורנו לא נטען גם עבור מנוע AI.'
              : 'The site returned an error for every page we requested. What does not load for us does not load for an AI engine either.'}
          </p>
        ) : (
          <p>
            {he
              ? 'לא קיבלנו שום תשובה מהאתר. זו יכולה להיות בעיה באתר, בדומיין, או ברשת. בדקו את הכתובת ונסו שוב.'
              : 'No response came back at all. That can be the site, the domain, or the network. Check the address and try again.'}
          </p>
        )}
        <ul className="font-mono text-xs" dir="ltr">
          {report.crawl.errors.slice(0, 4).map((e) => (
            <li key={`${e.code}-${e.url}`}>
              {e.code} · {e.url}
            </li>
          ))}
        </ul>
      </Notice>
    )
  }

  /* ---------------------------------------------------------- the report ------ */
  const b = report.business
  const componentLabels: Record<string, string> = he
    ? {
        technicalDiscoverability: 'האם אפשר לקרוא את האתר',
        informationCompleteness: 'האם המידע שלם',
        attributeCoverage: 'האם כתוב מה שנשאלים',
      }
    : {
        technicalDiscoverability: 'Can the site be read',
        informationCompleteness: 'Is the information complete',
        attributeCoverage: 'Is what people ask about written',
      }

  const groupedFindings = [
    ...report.findings
      .reduce((map, f) => {
        map.set(f.findingType, [...(map.get(f.findingType) ?? []), f])
        return map
      }, new Map<string, typeof report.findings>())
      .values(),
  ].sort((a, b2) => SEVERITY_ORDER[a[0]!.severity] - SEVERITY_ORDER[b2[0]!.severity])

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ score --- */}
      <section className="rounded-xl border border-line bg-white p-6">
        <p className="text-xs text-muted" dir="ltr">
          {url}
        </p>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-5xl font-semibold tabular-nums">{report.readiness.score}</span>
          <span className="text-lg text-muted">/ 100</span>
        </div>
        <p className="mt-1 text-sm font-medium">{he ? 'ציון מוכנות' : 'Readiness score'}</p>

        <div className="mt-6 space-y-4">
          {Object.entries(report.readiness.components).map(([key, c]) => (
            <div key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{componentLabels[key]}</span>
                <span className="tabular-nums text-muted">
                  {Math.round(c.value * 100)}%
                </span>
              </div>
              <div className="mt-1.5">
                <Bar value={c.value} />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
          {he
            ? 'הציון מודד האם מערכת AI מסוגלת למצוא אתכם, לקרוא אתכם ולתאר אתכם נכון מתוך האתר שלכם. הוא לא מדידה של האם מישהו ממליץ עליכם, והוא לא תחזית שכן ימליץ.'
            : report.readiness.disclosure}
          {' · '}
          {report.readiness.version}
        </p>
      </section>

      {/* --------------------------------------------------------- identity --- */}
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-sm font-semibold">
          {he ? 'מה האתר אומר על העסק' : 'What the site says about the business'}
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {(
            [
              [he ? 'שם' : 'Name', b.name],
              [he ? 'עיר' : 'City', b.city],
              [he ? 'טלפון' : 'Phone', b.phone],
              [he ? 'כתובת' : 'Address', b.address],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 text-sm">
              <dt className="text-muted">{label}</dt>
              <dd className={value ? 'font-medium' : 'text-negative'}>
                {value ?? (he ? 'לא נמצא' : 'not found')}
              </dd>
            </div>
          ))}
        </dl>

        {b.statedAttributes.length > 0 ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs text-muted">
              {he ? 'מה שהאתר כן אומר עליכם' : 'What the site does say about you'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {b.statedAttributes.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-line px-2.5 py-1 text-xs font-medium"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted">
          {he
            ? `נקראו ${report.crawl.pagesFetched} עמודים · תחום שזוהה: ${b.vertical}`
            : `${report.crawl.pagesFetched} pages read · detected field: ${b.vertical}`}
        </p>
      </section>

      {/* ------------------------------------------------------ ai visibility -- */}
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-sm font-semibold">
          {he ? 'נוכחות בתשובות של AI' : 'Presence in AI answers'}
        </h2>

        {report.aiVisibility ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums">
                {report.aiVisibility.airs.score}
              </span>
              <span className="text-sm text-muted">
                AIRS / 100 · {report.aiVisibility.airs.formulaVersion}
              </span>
            </div>
            <p className="text-sm">
              {he
                ? `הופעתם ב-${Math.round(report.aiVisibility.recommendationRate * 100)}% מתוך ${report.aiVisibility.promptsRun} שאלות שנשאלו בפועל מול ${report.aiVisibility.engines.join(', ')}.`
                : `You appeared in ${Math.round(report.aiVisibility.recommendationRate * 100)}% of ${report.aiVisibility.promptsRun} questions actually asked of ${report.aiVisibility.engines.join(', ')}.`}
            </p>
            {report.aiVisibility.competitors.length > 0 ? (
              <p className="text-sm text-muted">
                {he ? 'מי עוד הופיע: ' : 'Who else appeared: '}
                {report.aiVisibility.competitors
                  .slice(0, 5)
                  .map((c) => c.name)
                  .join(', ')}
              </p>
            ) : null}
            <ul className="space-y-2 border-t border-line pt-4">
              {report.aiVisibility.examples.slice(0, 5).map((e) => (
                <li key={`${e.engine}-${e.question}`} className="flex gap-2 text-sm">
                  <span className={e.recommended ? 'text-positive' : 'text-negative'}>
                    {e.recommended ? '✓' : '✗'}
                  </span>
                  <span dir="auto">{e.question}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p className="font-medium text-ink">{he ? 'לא נמדד' : 'Not measured'}</p>
            <p>{he ? report.aiVisibilitySkipped?.detail.he : report.aiVisibilitySkipped?.detail.en}</p>
            <p>
              {he
                ? 'לא הערכנו ולא הדמינו מספר במקום המדידה. החלק הזה של הדוח פשוט לא בוצע.'
                : 'Nothing was estimated or simulated in its place. This half of the report simply did not run.'}
            </p>
            {report.prompts.length > 0 ? (
              <div className="border-t border-line pt-3">
                <p>
                  {he
                    ? `${report.prompts.length} השאלות שהיינו שואלים, לדוגמה:`
                    : `${report.prompts.length} questions we would ask, for example:`}
                </p>
                <ul className="mt-2 space-y-1">
                  {report.prompts.slice(0, 5).map((p) => (
                    <li key={p.id} dir="auto">
                      · {p.queryText}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- findings --- */}
      {groupedFindings.length > 0 ? (
        <section className="rounded-xl border border-line bg-white p-6">
          <h2 className="text-sm font-semibold">
            {he ? 'מה מצאנו באתר' : 'What we found on the site'}
          </h2>
          <ul className="mt-4 space-y-3">
            {groupedFindings.map((group) => {
              const f = group[0]!
              return (
                <li key={f.findingType} className="flex gap-3 text-sm">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      f.severity === 'HIGH'
                        ? 'bg-negative'
                        : f.severity === 'MEDIUM'
                          ? 'bg-caution'
                          : 'bg-line'
                    }`}
                  />
                  <span>
                    {group.length > 1 ? (
                      <span className="me-1 font-medium tabular-nums">×{group.length}</span>
                    ) : null}
                    {he ? f.plainLanguageHe : f.plainLanguage}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* --------------------------------------------------------- playbook --- */}
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-sm font-semibold">{he ? 'מה לעשות' : 'What to do'}</h2>
        <p className="mt-1 text-sm text-muted">{report.playbook.headline}</p>

        <ol className="mt-5 space-y-6">
          {report.playbook.items.slice(0, 8).map((item, index) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {item.title}
                  {item.weDoThisForYou ? (
                    <span className="ms-2 rounded-full bg-line px-2 py-0.5 text-[11px] font-medium text-muted">
                      {he ? 'אנחנו עושים את זה' : 'we do this'}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-muted">{item.why}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {item.steps.slice(0, 4).map((step) => (
                    <li key={step} className="flex gap-2">
                      <span className="text-muted">·</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {report.playbook.outsideOurControl.length > 0 ? (
        <section className="rounded-xl border border-dashed border-line p-6">
          <h2 className="text-sm font-semibold">
            {he ? 'מה לא בשליטתנו' : 'Outside our control'}
          </h2>
          {report.playbook.outsideOurControl.map((item) => (
            <div key={item.title} className="mt-3">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-muted">{item.why}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
