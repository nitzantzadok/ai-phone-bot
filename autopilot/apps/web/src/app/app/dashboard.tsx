import Link from 'next/link'
import { scanBusiness, whyNothingWasRead, type ScanReport } from '@autopilot/cli/scan.ts'
import { getPlan } from '@autopilot/billing/plans.ts'
import { platformById, GOOGLE_GUIDE, type PlatformGuide } from '@autopilot/insights/platforms.ts'
import type { BusinessSession } from '@/lib/session'

/**
 * The working dashboard.
 *
 * Every number here comes from a scan of the customer's site run during this request.
 * There is no stored history yet, so the one thing this screen must not do is imply there
 * is: no trend arrows, no "up 4 points since last month", no sparkline drawn from a single
 * point. It says this is the first scan, because it is.
 */

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const

const Panel = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) => (
  <section className="rounded-xl border border-line bg-white p-6">
    <div className="mb-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
    {children}
  </section>
)

const Bar = ({ value }: { value: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-line">
    <div
      className="h-full rounded-full bg-accent"
      style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
    />
  </div>
)

/** Which platform guide to show, from what the scan saw rather than from a question. */
const guideFor = (report: ScanReport): PlatformGuide => {
  const haystack = [report.requestedUrl, ...report.crawl.pageUrls].join(' ').toLowerCase()
  if (haystack.includes('wixsite') || haystack.includes('wix.com')) return platformById('wix')
  if (haystack.includes('myshopify')) return platformById('shopify')
  if (haystack.includes('webflow.io')) return platformById('webflow')
  if (haystack.includes('squarespace')) return platformById('squarespace')

  const generators = report.facts
    .filter((f) => f.factKind === 'generator')
    .map((f) => (f.value ?? '').toLowerCase())
    .join(' ')
  if (generators.includes('wordpress')) return platformById('wordpress')
  if (generators.includes('wix')) return platformById('wix')

  return platformById('custom')
}

export const Dashboard = async ({
  session,
  language,
}: {
  session: BusinessSession
  language: 'he' | 'en'
}) => {
  const he = language === 'he'
  const plan = getPlan(session.plan)

  let report: ScanReport
  try {
    report = await scanBusiness({
      url: session.url,
      language,
      maxPages: Math.min(20, plan.limits.crawl_page),
      maxPrompts: Math.min(30, plan.limits.monitored_prompts),
      maxSpendMinor: plan.limits.monthlySpendCapMinor,
    })
  } catch (error) {
    return (
      <Panel title={he ? 'הסריקה נכשלה' : 'The scan failed'}>
        <p className="text-sm text-muted">
          {he
            ? 'לא הצלחנו לסרוק את האתר הזה כרגע.'
            : 'We could not scan that site right now.'}
        </p>
        <p className="mt-2 font-mono text-xs text-muted" dir="ltr">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Link href={`/join?lang=${language}`} className="mt-4 inline-block text-sm underline">
          {he ? 'להחליף אתר' : 'Change site'}
        </Link>
      </Panel>
    )
  }

  /* ------------------------------------------------------- nothing was read ----- */
  if (report.crawl.pagesFetched === 0) {
    const why = whyNothingWasRead(report)
    const messages: Record<typeof why, string> = he
      ? {
          ROBOTS_BLOCKED:
            'קובץ robots.txt באתר שלכם חוסם סורקים — וחוסם באותה מידה את הסורקים של ChatGPT ו-Gemini. זה תיקון של שורה אחת, והוא כמעט תמיד הסיבה היחידה שעסק לא מופיע באף תשובה.',
          BOT_PROTECTION:
            'ההגנה של האתר (בדרך כלל Cloudflare) זיהתה אותנו כסורק וחסמה. הסורקים של מנועי ה-AI נחסמים בדיוק אותו דבר. בהגדרות ההגנה אפשרו סורקים מאומתים, או הוסיפו חריגה ל-GPTBot, ClaudeBot ו-Google-Extended.',
          SITE_ERRORS: 'האתר החזיר שגיאה בכל עמוד שביקשנו. מה שלא נטען עבורנו לא נטען גם עבור מנוע AI.',
          UNREACHABLE: 'לא קיבלנו שום תשובה מהאתר. בדקו את הכתובת ונסו שוב.',
        }
      : {
          ROBOTS_BLOCKED:
            'Your robots.txt blocks crawlers — and blocks the crawlers behind ChatGPT and Gemini just as effectively. It is a one-line fix, and almost always the entire reason a business appears in no answer at all.',
          BOT_PROTECTION:
            'The site’s protection (usually Cloudflare) recognised us as a crawler and refused. The AI engines’ crawlers are refused identically. Allow verified bots, or add an exception for GPTBot, ClaudeBot and Google-Extended.',
          SITE_ERRORS: 'The site returned an error for every page. What does not load for us does not load for an AI engine either.',
          UNREACHABLE: 'No response came back from the site. Check the address and try again.',
        }

    return (
      <div className="space-y-6">
        <Panel title={he ? 'לא הצלחנו לקרוא את האתר' : 'We could not read the site'}>
          <p className="text-sm">{messages[why]}</p>
          <ul className="mt-4 font-mono text-xs text-muted" dir="ltr">
            {report.crawl.errors.slice(0, 4).map((e) => (
              <li key={`${e.code}-${e.url}`}>
                {e.code} · {e.url}
              </li>
            ))}
          </ul>
          <Link href={`/join?lang=${language}`} className="mt-4 inline-block text-sm underline">
            {he ? 'לסרוק אתר אחר' : 'Scan a different site'}
          </Link>
        </Panel>
      </div>
    )
  }

  /* --------------------------------------------------------------- the app ----- */
  const b = report.business
  const guide = guideFor(report)
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

  const grouped = [
    ...report.findings
      .reduce((map, f) => {
        map.set(f.findingType, [...(map.get(f.findingType) ?? []), f])
        return map
      }, new Map<string, typeof report.findings>())
      .values(),
  ].sort((a, c) => SEVERITY_ORDER[a[0]!.severity] - SEVERITY_ORDER[c[0]!.severity])

  const autoFixable = grouped.filter((g) => g[0]!.autoFixable).length

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline --- */}
      <div className="grid gap-6 sm:grid-cols-3">
        <section className="rounded-xl border border-accent bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:col-span-1">
          <p className="text-xs text-muted">{he ? 'ציון מוכנות' : 'Readiness'}</p>
          <p className="mt-2 text-5xl font-semibold tabular-nums">{report.readiness.score}</p>
          <p className="mt-1 text-xs text-muted">
            {he ? 'מתוך 100 · הסריקה הראשונה' : 'out of 100 · first scan'}
          </p>
        </section>

        <section className="rounded-xl border border-line bg-white p-6 sm:col-span-2">
          <div className="space-y-3.5">
            {Object.entries(report.readiness.components).map(([key, c]) => (
              <div key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{componentLabels[key]}</span>
                  <span className="tabular-nums text-muted">{Math.round(c.value * 100)}%</span>
                </div>
                <div className="mt-1.5">
                  <Bar value={c.value} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* -------------------------------------------------------- identity --- */}
      <Panel
        title={he ? 'מה האתר אומר על העסק' : 'What the site says about the business'}
        hint={
          he
            ? `נקראו ${report.crawl.pagesFetched} עמודים · תחום שזוהה: ${b.vertical}`
            : `${report.crawl.pagesFetched} pages read · detected field: ${b.vertical}`
        }
      >
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
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
                <span key={a} className="rounded-full bg-line px-2.5 py-1 text-xs font-medium">
                  {a}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      {/* ------------------------------------------------------------- ai --- */}
      <Panel title={he ? 'נוכחות בתשובות של AI' : 'Presence in AI answers'}>
        {report.aiVisibility ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums">
                {report.aiVisibility.airs.score}
              </span>
              <span className="text-sm text-muted">
                AIRS · {report.aiVisibility.engines.join(', ')} ·{' '}
                {report.aiVisibility.promptsRun} {he ? 'הרצות' : 'runs'}
              </span>
            </div>
            <p className="text-sm">
              {he
                ? `הופעתם ב-${Math.round(report.aiVisibility.recommendationRate * 100)}% מהשאלות שנשאלו בפועל.`
                : `You appeared in ${Math.round(report.aiVisibility.recommendationRate * 100)}% of the questions actually asked.`}
            </p>
            {report.aiVisibility.competitors.length > 0 ? (
              <p className="text-sm text-muted">
                {he ? 'מי עוד הופיע: ' : 'Who else appeared: '}
                {report.aiVisibility.competitors.slice(0, 5).map((c) => c.name).join(', ')}
              </p>
            ) : null}
            <ul className="space-y-2 border-t border-line pt-4">
              {report.aiVisibility.examples.slice(0, 6).map((e) => (
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
          <div className="space-y-3 text-sm text-muted">
            <p className="font-medium text-ink">{he ? 'לא נמדד' : 'Not measured'}</p>
            <p>{he ? report.aiVisibilitySkipped?.detail.he : report.aiVisibilitySkipped?.detail.en}</p>
            {report.prompts.length > 0 ? (
              <div className="border-t border-line pt-3">
                <p>
                  {he
                    ? `אלה ${report.prompts.length} השאלות שאנחנו עוקבים אחריהן עבורכם:`
                    : `These are the ${report.prompts.length} questions we monitor for you:`}
                </p>
                <ul className="mt-2 space-y-1">
                  {report.prompts.slice(0, 8).map((p) => (
                    <li key={p.id} dir="auto">
                      · {p.queryText}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      {/* -------------------------------------------------------- findings --- */}
      {grouped.length > 0 ? (
        <Panel
          title={he ? 'מה מצאנו באתר' : 'What we found on the site'}
          hint={
            he
              ? `${grouped.length} סוגי בעיות · ${autoFixable} מהן אנחנו יכולים לתקן בעצמנו`
              : `${grouped.length} kinds of problem · ${autoFixable} we can fix ourselves`
          }
        >
          <ul className="space-y-3">
            {grouped.map((group) => {
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
                  <span className="min-w-0">
                    {group.length > 1 ? (
                      <span className="me-1 font-medium tabular-nums">×{group.length}</span>
                    ) : null}
                    {he ? f.plainLanguageHe : f.plainLanguage}
                    {f.autoFixable ? (
                      <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                        {he ? 'ניתן לתיקון אוטומטי' : 'auto-fixable'}
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      ) : null}

      {/* -------------------------------------------------------- playbook --- */}
      <Panel title={he ? 'מה לעשות, לפי סדר' : 'What to do, in order'} hint={report.playbook.headline}>
        <ol className="space-y-6">
          {report.playbook.items.map((item, index) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold tabular-nums text-white">
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
                  {item.steps.map((step) => (
                    <li key={step} className="flex gap-2">
                      <span className="text-muted">·</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  {he ? 'איך תדעו: ' : 'How you will know: '}
                  {item.howYouWillKnow}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      {/* ------------------------------------------------------- connect --- */}
      <Panel
        title={he ? 'לחבר את האתר, כדי שנתקן בעצמנו' : 'Connect the site so we can fix it ourselves'}
        hint={
          he
            ? `זיהינו: ${guide.hebrewName} · ${guide.timeMinutes} דקות`
            : `Detected: ${guide.name} · ${guide.timeMinutes} minutes`
        }
      >
        <p className="text-sm text-muted">{he ? guide.summary.he : guide.summary.en}</p>
        <ol className="mt-4 space-y-2.5">
          {guide.steps.map((step, index) => (
            <li key={step.en} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-line text-[11px] font-medium tabular-nums">
                {index + 1}
              </span>
              <span>
                {he ? step.he : step.en}
                {step.where ? (
                  <span className="ms-2 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] text-accent">
                    {he ? step.where.he : step.where.en}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        {guide.limitation ? (
          <p className="mt-4 border-s-2 border-caution ps-3 text-sm text-muted">
            {he ? guide.limitation.he : guide.limitation.en}
          </p>
        ) : null}

        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs font-semibold">
            {he ? 'וגם: פרופיל Google' : 'And: your Google profile'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {he ? GOOGLE_GUIDE.summary.he : GOOGLE_GUIDE.summary.en}
          </p>
        </div>
      </Panel>

      {/* ------------------------------------------------------- honesty --- */}
      <Panel title={he ? 'מה לא בשליטתנו' : 'Outside our control'}>
        {report.playbook.outsideOurControl.map((item) => (
          <div key={item.title} className="mb-3 last:mb-0">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-sm text-muted">{item.why}</p>
          </div>
        ))}
        <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
          {report.readiness.version} ·{' '}
          {he
            ? 'כל מספר במסך הזה נמדד עכשיו, מהאתר שלכם. אין כאן היסטוריה עדיין — זו הסריקה הראשונה.'
            : 'Every number on this screen was measured just now, from your site. There is no history yet — this is the first scan.'}
        </p>
      </Panel>
    </div>
  )
}
