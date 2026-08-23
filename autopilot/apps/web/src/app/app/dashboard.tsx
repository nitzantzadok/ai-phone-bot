import Link from 'next/link'
import { scanBusiness, whyNothingWasRead, type ScanReport } from '@autopilot/cli/scan.ts'
import { platformById, GOOGLE_GUIDE, type PlatformGuide } from '@autopilot/insights/platforms.ts'
import type { BusinessSession } from '@/lib/session'
import { dashboardBudget } from '@/lib/spend'
import { buildReportView } from '@/lib/report-view'
import {
  FactsBlock,
  HandoffBlock,
  ScoreBlock,
  Section,
  VerdictBlock,
} from '@/components/report'
import { TaskBoard } from '@/components/task-board'
import { ReportHeader } from '@/components/report-header'
import { AccessPanel } from '@/components/access-panel'

/**
 * The working dashboard.
 *
 * Every number here comes from a scan of the customer's site run during this request.
 * There is no stored history yet, so the one thing this screen must not do is imply there
 * is: no trend arrows, no "up 4 points since last month", no sparkline drawn from a single
 * point. It says this is the first scan, because it is.
 */

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

/** What to call each kind of external presence, in a sentence a person would use. */
const OFFSITE_LABELS_HE: Record<string, string> = {
  MAPS: 'גוגל מפות / פרופיל עסק',
  REVIEWS: 'ביקורות של לקוחות',
  DIRECTORY: 'מדריכים ואינדקסים',
  SOCIAL: 'רשתות חברתיות',
  NAVIGATION: 'Waze',
}

const OFFSITE_LABELS_EN: Record<string, string> = {
  MAPS: 'Google Maps / Business Profile',
  REVIEWS: 'Customer reviews',
  DIRECTORY: 'Directories and indexes',
  SOCIAL: 'Social networks',
  NAVIGATION: 'Waze',
}

export const Dashboard = async ({
  session,
  language,
}: {
  session: BusinessSession
  language: 'he' | 'en'
}) => {
  const he = language === 'he'

  let report: ScanReport
  try {
    report = await scanBusiness({
      url: session.url,
      language,
      // A per-request ceiling, not the plan's monthly one: this render can repeat on every
      // refresh, and a month's budget per reload is not a budget.
      ...dashboardBudget(session.plan),
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
  const view = buildReportView(report, language)

  return (
    <div className="space-y-6">
      {report.crawl.aiAccess.blocked.length > 0 ? (
        <AccessPanel access={report.crawl.aiAccess} language={language} />
      ) : null}

      <ReportHeader
        url={report.requestedUrl}
        score={report.readiness.score}
        band={view.verdict.band}
        bandLabel={view.bandLabel}
        taskCount={view.tasks.length}
        linkedCount={view.offsite.linkedCount}
        totalSources={view.offsite.totalCount}
        pagesRead={report.crawl.pagesFetched}
        language={language}
      />

      <VerdictBlock verdict={view.verdict} language={language} />




      <TaskBoard tasks={view.tasks} siteKey={report.requestedUrl} language={language} />

      {/* --------------------------------------------------------- off site --- */}
      <Section
        title={he ? 'איפה עוד מדברים עליכם' : 'Where else you are talked about'}
        lead={view.offsite.summary}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {view.offsite.signals
            .filter((s) => s.kind !== 'NAVIGATION' || b.city !== null)
            .map((signal) => (
              <div
                key={signal.kind}
                className={`flex items-start gap-3 rounded-lg border p-4 ${
                  signal.status === 'LINKED'
                    ? 'border-positive/30 bg-positive/5'
                    : 'border-line bg-surface'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 font-semibold ${
                    signal.status === 'LINKED' ? 'text-positive' : 'text-muted'
                  }`}
                >
                  {signal.status === 'LINKED' ? '✓' : '—'}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {(he ? OFFSITE_LABELS_HE : OFFSITE_LABELS_EN)[signal.kind]}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {signal.status === 'LINKED'
                      ? he
                        ? 'האתר מקשר לשם'
                        : 'Your site links to it'
                      : he
                        ? 'האתר לא מקשר לשם'
                        : 'Your site does not link to it'}
                  </p>
                </div>
              </div>
            ))}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          {he
            ? 'שימו לב: אנחנו רואים רק מה שהאתר שלכם מקשר אליו. אם יש לכם פרופיל שהאתר פשוט לא מקשר אליו — הוא קיים, ואנחנו לא יכולים לראות אותו. בשני המקרים התיקון דומה, והמשימות למטה אומרות איזה מהם.'
            : 'Note: we can only see what your site links to. If you have a profile your site simply never links, it exists and we cannot see it. Either way the fix is similar, and the tasks below say which is which.'}
        </p>
      </Section>

      {/* --------------------------------------------------------- handoff --- */}
      <HandoffBlock
        text={view.handoff.text}
        developerItems={view.handoff.developerItems}
        language={language}
      />

      {/* ------------------------------------------------------------- ai --- */}
      <Section
        title={he ? 'מה קורה בפועל בתשובות של AI' : 'What actually happens in AI answers'}
        lead={
          report.aiVisibility
            ? he
              ? `שאלנו ${report.aiVisibility.promptsRun} שאלות אמיתיות מול ${report.aiVisibility.engines.join(', ')}. אלה התשובות שחזרו.`
              : `We asked ${report.aiVisibility.promptsRun} real questions of ${report.aiVisibility.engines.join(', ')}. These are the answers that came back.`
            : undefined
        }
      >
        {report.aiVisibility ? (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-4xl font-semibold tabular-nums">
                  {Math.round(report.aiVisibility.recommendationRate * 100)}%
                </span>
                <span className="text-[15px] text-muted">
                  {he
                    ? `מהשאלות הזכירו אתכם (${report.aiVisibility.promptsRun} שאלות)`
                    : `of the questions mentioned you (${report.aiVisibility.promptsRun} questions)`}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {he
                  ? 'זה המספר היחיד כאן שנמדד מול המערכות עצמן, לא מהאתר. כל השאר בדוח נקרא מהאתר שלכם.'
                  : 'This is the one number here measured against the systems themselves rather than the site. Everything else in the report was read from your pages.'}
              </p>
            </div>

            {report.aiVisibility.competitors.length > 0 ? (
              <p className="text-[15px] leading-relaxed text-muted">
                {he ? 'מי הופיע במקומכם: ' : 'Who appeared instead: '}
                <span className="font-medium text-ink">
                  {report.aiVisibility.competitors.slice(0, 5).map((c) => c.name).join(', ')}
                </span>
              </p>
            ) : null}

            <ul className="space-y-2.5 border-t border-line pt-5">
              {report.aiVisibility.examples.slice(0, 8).map((e) => (
                <li key={`${e.engine}-${e.question}`} className="flex gap-2.5 text-[15px]">
                  <span
                    className={`shrink-0 font-semibold ${e.recommended ? 'text-positive' : 'text-negative'}`}
                  >
                    {e.recommended ? '✓' : '✗'}
                  </span>
                  <span dir="auto">{e.question}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-medium">{he ? 'לא נמדד בהרצה הזו' : 'Not measured on this run'}</p>
            <p className="text-[15px] leading-relaxed text-muted">{view.aiSkipMessage}</p>
            {report.prompts.length > 0 ? (
              <div className="border-t border-line pt-4">
                <p className="text-[15px]">
                  {he
                    ? `אלה ${report.prompts.length} השאלות שאנחנו עוקבים אחריהן עבורכם:`
                    : `These are the ${report.prompts.length} questions we monitor for you:`}
                </p>
                <ul className="mt-2.5 space-y-2 rounded-lg bg-surface p-4 text-[15px]">
                  {report.prompts.slice(0, 8).map((p) => (
                    <li key={p.id} className="flex gap-2.5" dir="auto">
                      <span className="text-muted">·</span>
                      <span>{p.queryText}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      {report.crawl.aiAccess.blocked.length === 0 ? (
        <AccessPanel access={report.crawl.aiAccess} language={language} />
      ) : null}

      {/* ---------------------------------------------------------- facts --- */}
      <FactsBlock
        facts={view.facts}
        pagesRead={report.crawl.pagesFetched}
        attributes={b.statedAttributes}
        language={language}
      />

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

      {/* ----------------------------------------------------------- score --- */}
      <ScoreBlock
        score={report.readiness.score}
        bandLabel={view.bandLabel}
        components={view.components}
        language={language}
        footnote={view.scoreFootnote}
      />

      {/* ------------------------------------------------------- honesty --- */}
      <Panel title={he ? 'מה לא בשליטתנו' : 'Outside our control'}>
        {report.playbook.outsideOurControl.map((item) => (
          <div key={item.title} className="mb-3 last:mb-0">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-sm text-muted">{item.why}</p>
          </div>
        ))}
        <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
          {he
            ? 'כל מספר במסך הזה נמדד עכשיו, מהאתר שלכם. אין כאן היסטוריה עדיין — זו הסריקה הראשונה.'
            : 'Every number on this screen was measured just now, from your site. There is no history yet — this is the first scan.'}
        </p>
      </Panel>
    </div>
  )
}
