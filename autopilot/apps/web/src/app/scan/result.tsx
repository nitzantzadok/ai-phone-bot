import Link from 'next/link'
import { headers } from 'next/headers'
import { scanBusiness, whyNothingWasRead, type ScanReport } from '@autopilot/cli/scan.ts'
import { checkRateLimit, normalizeSiteUrl } from '@/lib/scan-limits'
import { freeScanBudget } from '@/lib/spend'
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

const Notice = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-line bg-white p-6">
    <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
    <div className="mt-2 space-y-3 text-sm text-muted">{children}</div>
  </div>
)

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
      // The free scan never asks a real AI engine: see lib/spend.ts. The site half is what
      // produces the fixes and costs only a crawl; the measurement is what a plan buys.
      ...freeScanBudget(),
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
  const view = buildReportView(report, language)
  const b = report.business


  return (
    <div className="space-y-6">
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

      {/* ---------------------------------------------------------- handoff ---- */}
      <HandoffBlock
        text={view.handoff.text}
        developerItems={view.handoff.developerItems}
        language={language}
      />

      {/* ------------------------------------------------------------ facts ---- */}
      <FactsBlock
        facts={view.facts}
        pagesRead={report.crawl.pagesFetched}
        attributes={b.statedAttributes}
        language={language}
      />

      {/* ------------------------------------------------------- ai visibility -- */}
      <Section
        title={he ? 'מה קורה בפועל בתשובות של AI' : 'What actually happens in AI answers'}
        lead={
          report.aiVisibility
            ? undefined
            : he
              ? 'הסריקה החינמית קוראת את האתר שלכם. את החלק הזה — לשאול את המערכות בפועל ולראות מה הן עונות — מודדים במנוי.'
              : 'The free scan reads your site. This half — actually asking the systems and seeing what they answer — is what a plan measures.'
        }
      >
        {report.aiVisibility ? (
          <div className="space-y-5">
            <p className="text-[15px] leading-relaxed">
              {he
                ? `שאלנו ${report.aiVisibility.promptsRun} שאלות אמיתיות מול ${report.aiVisibility.engines.join(', ')}. הופעתם בתשובה ב-${Math.round(report.aiVisibility.recommendationRate * 100)}% מהן.`
                : `We asked ${report.aiVisibility.promptsRun} real questions of ${report.aiVisibility.engines.join(', ')}. You appeared in ${Math.round(report.aiVisibility.recommendationRate * 100)}% of the answers.`}
            </p>

            {report.aiVisibility.competitors.length > 0 ? (
              <p className="text-[15px] leading-relaxed text-muted">
                {he ? 'מי כן הופיע במקומכם: ' : 'Who appeared instead: '}
                <span className="font-medium text-ink">
                  {report.aiVisibility.competitors
                    .slice(0, 5)
                    .map((c) => c.name)
                    .join(', ')}
                </span>
              </p>
            ) : null}

            <ul className="space-y-2.5 border-t border-line pt-5">
              {report.aiVisibility.examples.slice(0, 6).map((e) => (
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
            {report.prompts.length > 0 ? (
              <>
                <p className="text-[15px] leading-relaxed">
                  {he
                    ? `אלה ${report.prompts.length} השאלות שנוצרו מהאתר שלכם. הן לא רשימה כללית — הן נגזרו מהתחום, מהעיר ומהשירותים שכתובים אצלכם, והן מה שלקוח באמת מקליד:`
                    : `These are the ${report.prompts.length} questions generated from your site. Not a generic list — they come from your field, your city and the services written on your pages, and they are what a customer actually types:`}
                </p>
                <ul className="space-y-2 rounded-lg bg-surface p-4 text-[15px]">
                  {report.prompts.slice(0, 8).map((p) => (
                    <li key={p.id} className="flex gap-2.5" dir="auto">
                      <span className="text-muted">·</span>
                      <span>{p.queryText}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {report.prompts.length === 0 ? (
              /* No questions is itself the finding, and a strong one: the question set is
                 built from the field, the city and the services the site states, so an
                 empty set means the site did not state enough to ask about. Leaving the
                 section blank hides the most persuasive sentence on the page. */
              <p className="text-[15px] leading-relaxed">
                {he
                  ? 'לא הצלחנו אפילו לייצר את השאלות. השאלות נבנות מהתחום, מהעיר ומהשירותים שכתובים אצלכם באתר — וכרגע אין באתר מספיק כדי לבנות מהן שאלה אחת. זה בדיוק המצב שבו נמצאת גם מערכת AI כשמישהו שואל אותה עליכם.'
                  : 'We could not even generate the questions. They are built from the field, the city and the services stated on your site — and right now there is not enough there to build a single one. That is exactly the position an AI is in when somebody asks it about you.'}
              </p>
            ) : null}
            <p className="text-sm leading-relaxed text-muted">
              {he
                ? 'שום מספר בדוח הזה לא הוערך ולא הודמה. מה שלא נמדד — כתוב במפורש שלא נמדד.'
                : 'No number in this report was estimated or simulated. What was not measured says so explicitly.'}
            </p>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------ score ---- */}
      <ScoreBlock
        score={report.readiness.score}
        bandLabel={view.bandLabel}
        components={view.components}
        language={language}
        footnote={view.scoreFootnote}
      />

      {/* -------------------------------------------------- outside our control -- */}
      {report.playbook.outsideOurControl.length > 0 ? (
        <section className="rounded-xl border border-dashed border-line p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight">
            {he ? 'מה שאף אחד לא יכול לעשות בשבילכם' : 'What nobody can do for you'}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {he
              ? 'זה כתוב כאן בנפרד ובכוונה, כדי שלא ייראה כמו משימה שאפשר לקנות. מי שמוכר לכם את זה בתשלום מוכר לכם בעיה עתידית.'
              : 'Set apart deliberately, so it never looks like a task you can buy. Anyone selling you this is selling you a future problem.'}
          </p>
          {report.playbook.outsideOurControl.map((item) => (
            <div key={item.title} className="mt-5">
              <p className="font-medium">{item.title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{item.why}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
