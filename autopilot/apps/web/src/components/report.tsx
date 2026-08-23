/**
 * The report, as a business owner reads it.
 *
 * The old version presented the data in the order the pipeline produced it: score first,
 * then what the crawler found, then advice. That order is correct for the machine and
 * backwards for the reader, whose questions are, in order:
 *
 *   1. Am I in trouble?           → the verdict
 *   2. What do I do about it?     → one thing, then the rest
 *   3. Can I do it myself?        → who, and how many minutes
 *   4. What do I send my web guy? → the handoff
 *   5. How do you know?           → the facts and the score, last
 *
 * A number is never shown without the sentence that says what it means, and nothing on
 * this page carries a name from the codebase — no `local_business`, no `readiness-v1`, no
 * bare "AIRS". A customer who sees an underscore in their own report has correctly
 * concluded they are reading somebody's debug output.
 */
import type { ReactNode } from 'react'
import {
  IMPACT_LABEL,
  IMPACT_MEANING,
  OWNER_LABEL,
  type Impact,
  type PlaybookItem,
} from '@autopilot/insights'
import type { Verdict } from '@autopilot/insights/verdict.ts'
import { bandMeaning } from '@autopilot/insights/verdict.ts'
import { CopyBox } from './copy-box'

type Lang = 'he' | 'en'

const t = (he: string, en: string, language: Lang) => (language === 'he' ? he : en)

/* ------------------------------------------------------------------ pieces --- */

export const Section = ({
  title,
  lead,
  children,
}: {
  title: string
  lead?: string
  children: ReactNode
}) => (
  <section className="rounded-xl border border-line bg-white p-6 sm:p-8">
    <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    {lead ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{lead}</p> : null}
    <div className="mt-6">{children}</div>
  </section>
)

const IMPACT_STYLE: Record<Impact, string> = {
  CRITICAL: 'bg-negative/10 text-negative',
  IMPORTANT: 'bg-caution/15 text-caution',
  MINOR: 'bg-line text-muted',
}

const Chip = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
  >
    {children}
  </span>
)

/* ----------------------------------------------------------------- verdict --- */

/**
 * The first screen. Sentences, not a gauge.
 *
 * "4 / 100" tells a reader a number and nothing else: not whether 4 is bad, not what
 * produced it, not what to do. Most readers who bounce off a report of this kind bounce
 * off here, before reaching the part that would have helped them.
 */
export const VerdictBlock = ({
  verdict,
  language,
}: {
  verdict: Verdict
  language: Lang
}) => {
  const alarming = verdict.band === 'INVISIBLE' || verdict.band === 'PARTIAL'

  return (
    <section
      className={`rounded-xl border p-6 sm:p-8 ${
        alarming ? 'border-negative/30 bg-negative/5' : 'border-positive/30 bg-positive/5'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">
        {t('השורה התחתונה', 'The bottom line', language)}
      </p>

      <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight sm:text-[28px]">
        {verdict.headline}
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed sm:text-base">{verdict.explanation}</p>

      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {bandMeaning(verdict.band, language)}
      </p>

      {verdict.startHere ? (
        <div className="mt-6 rounded-lg border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            {t('מאיפה להתחיל', 'Start here', language)}
          </p>
          <p className="mt-2 font-semibold">{verdict.startHere.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{verdict.startHere.why}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip className="bg-line text-muted">
              {verdict.startHere.minutes > 0
                ? t(
                    `בערך ${verdict.startHere.minutes} דקות`,
                    `about ${verdict.startHere.minutes} minutes`,
                    language,
                  )
                : t('עבודה של מפתח', 'developer work', language)}
            </Chip>
            <Chip className="bg-line text-muted">
              {language === 'he'
                ? OWNER_LABEL[verdict.startHere.who].he
                : OWNER_LABEL[verdict.startHere.who].en}
            </Chip>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------- one item --- */

export const ActionItem = ({
  item,
  index,
  language,
}: {
  item: PlaybookItem
  index: number
  language: Lang
}) => (
  <li className="border-t border-line pt-6 first:border-t-0 first:pt-0">
    <div className="flex gap-4">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold tabular-nums text-white">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {item.impact ? (
            <Chip className={IMPACT_STYLE[item.impact]}>
              {language === 'he' ? IMPACT_LABEL[item.impact].he : IMPACT_LABEL[item.impact].en}
            </Chip>
          ) : null}
          {item.minutes !== undefined && item.minutes > 0 ? (
            <Chip className="bg-line text-muted">
              {t(`${item.minutes} דקות`, `${item.minutes} min`, language)}
            </Chip>
          ) : null}
          {item.who ? (
            <Chip className="bg-line text-muted">
              {language === 'he' ? OWNER_LABEL[item.who].he : OWNER_LABEL[item.who].en}
            </Chip>
          ) : null}
        </div>

        <h3 className="mt-2.5 text-lg font-semibold leading-snug">{item.title}</h3>

        {item.what ? (
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{item.what}</p>
        ) : null}

        <p className="mt-2 text-[15px] leading-relaxed">{item.why}</p>

        {item.impact ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {language === 'he'
              ? IMPACT_MEANING[item.impact].he
              : IMPACT_MEANING[item.impact].en}
          </p>
        ) : null}

        {item.reach ? (
          <p className="mt-2 text-sm font-medium text-accent">
            {t(
              `נוגע ל-${item.reach.questions} מתוך ${item.reach.of} השאלות שלקוחות שואלים בתחום שלכם`,
              `Touches ${item.reach.questions} of the ${item.reach.of} questions customers ask in your field`,
              language,
            )}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            {t('מה לעשות', 'What to do', language)}
          </p>
          <ol className="mt-2.5 space-y-2 text-[15px] leading-relaxed">
            {item.steps.map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="shrink-0 tabular-nums text-muted">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {item.example ? (
          <p className="mt-3 text-sm leading-relaxed">
            <span className="font-semibold">{t('לדוגמה: ', 'For example: ', language)}</span>
            <span className="text-muted">{item.example}</span>
          </p>
        ) : null}

        {item.affectedUrls && item.affectedUrls.length > 0 ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted underline underline-offset-4">
              {t(
                `באילו עמודים (${item.affectedUrls.length})`,
                `Which pages (${item.affectedUrls.length})`,
                language,
              )}
            </summary>
            <ul className="mt-2 space-y-1 break-all font-mono text-xs text-muted" dir="ltr">
              {item.affectedUrls.slice(0, 10).map((url) => (
                <li key={url}>{url}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  </li>
)

/* ----------------------------------------------------------------- handoff --- */

/**
 * The forward.
 *
 * Roughly half of what a scan finds cannot be fixed from inside a site editor by the
 * person who owns the business. Explaining those items kindly, and then leaving the owner
 * to translate them for their developer themselves, is where a clear report still changes
 * nothing.
 */
export const HandoffBlock = ({
  text,
  developerItems,
  language,
}: {
  text: string
  developerItems: number
  language: Lang
}) => (
  <Section
    title={t('לשלוח למי שבנה לכם את האתר', 'Send this to whoever built your site', language)}
    lead={
      developerItems > 0
        ? t(
            `${developerItems} מהדברים למעלה דורשים מישהו שנוגע בקוד של האתר. הכנו את ההודעה במקומכם — היא כתובה בשפה שלהם, עם הכתובות המדויקות, ואפשר להעתיק ולשלוח בוואטסאפ או במייל.`,
            `${developerItems} of the items above need somebody who touches the site’s code. We wrote the message for you — in their vocabulary, with the exact addresses, ready to paste into WhatsApp or email.`,
            language,
          )
        : t(
            'הכל למעלה אתם יכולים לעשות לבד. ההודעה הזו כאן למקרה שתעדיפו להעביר את זה הלאה בכל זאת.',
            'Everything above you can do yourself. This message is here in case you would rather pass it on anyway.',
            language,
          )
    }
  >
    <CopyBox
      text={text}
      label={t('העתקת ההודעה', 'Copy the message', language)}
      copiedLabel={t('הועתק ✓', 'Copied ✓', language)}
    >
      <pre
        dir="ltr"
        className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-4 text-left font-mono text-xs leading-relaxed text-ink"
      >
        {text}
      </pre>
    </CopyBox>
  </Section>
)

/* ------------------------------------------------------------------- facts --- */

export const FactsBlock = ({
  facts,
  pagesRead,
  attributes,
  language,
}: {
  facts: readonly { label: string; value: string | null }[]
  pagesRead: number
  attributes: readonly string[]
  language: Lang
}) => (
  <Section
    title={t('מה האתר שלכם אומר עליכם', 'What your site says about you', language)}
    lead={t(
      `אלה הפרטים שהצלחנו לחלץ מ-${pagesRead} עמודים באתר. מה שכתוב "לא נמצא" — מערכת AI גם לא תמצא, ולכן היא לא תיתן אותו בתשובה.`,
      `These are the details we could extract from ${pagesRead} pages. Anything marked "not found" an AI will not find either, so it will not give it in an answer.`,
      language,
    )}
  >
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {facts.map(({ label, value }) => (
        <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <dt className="text-sm text-muted">{label}</dt>
          <dd
            className={
              value
                ? 'text-end font-medium'
                : 'text-end text-sm font-semibold text-negative'
            }
          >
            {value ?? t('לא נמצא', 'not found', language)}
          </dd>
        </div>
      ))}
    </dl>

    {attributes.length > 0 ? (
      <div className="mt-6">
        <p className="text-sm text-muted">
          {t(
            'מה שהאתר כן אומר עליכם — אלה המילים שמערכת AI יכולה לצטט:',
            'What the site does say about you — the words an AI can quote:',
            language,
          )}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {attributes.map((a) => (
            <Chip key={a} className="bg-line text-ink">
              {a}
            </Chip>
          ))}
        </div>
      </div>
    ) : null}
  </Section>
)

/* ------------------------------------------------------------------- score --- */

/**
 * The score, last and explained.
 *
 * It stays in the report because it is real and because it is how progress gets measured
 * from one month to the next. It is not the headline because on its own it changes
 * nobody's behaviour.
 */
export const ScoreBlock = ({
  score,
  bandLabel,
  components,
  language,
  footnote,
}: {
  score: number
  bandLabel: string
  components: readonly { label: string; value: number; meaning: string }[]
  language: Lang
  footnote: string
}) => (
  <Section
    title={t('הציון, ומאיפה הוא מגיע', 'The score, and where it comes from', language)}
    lead={t(
      'הציון הוא לא תחזית שימליצו עליכם. הוא מודד דבר אחד: כמה מהמידע שמערכת AI צריכה כדי לתאר אתכם נכון באמת קיים באתר. הוא כאן כדי שתוכלו להשוות אותו לעצמו בעוד חודש.',
      'The score is not a prediction that anything will recommend you. It measures one thing: how much of what an AI needs in order to describe you correctly actually exists on the site. It is here so you can compare it against itself next month.',
      language,
    )}
  >
    {/* No second giant number: the dial at the top of the report is the one people
        remember, and repeating it here just pushes the breakdown — which is the only
        thing this section adds — further down the page. */}
    <p className="text-[15px]">
      <span className="font-semibold tabular-nums">{score}</span>
      <span className="text-muted"> / 100 · </span>
      <span className="font-medium">{bandLabel}</span>
    </p>

    <div className="mt-6 space-y-6">
      {components.map((c) => (
        <div key={c.label}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{c.label}</span>
            <span className="tabular-nums text-muted">{Math.round(c.value * 100)}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(Math.max(0, Math.min(1, c.value)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{c.meaning}</p>
        </div>
      ))}
    </div>

    <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
      {footnote}
    </p>
  </Section>
)
