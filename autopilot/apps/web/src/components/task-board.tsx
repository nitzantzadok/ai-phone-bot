'use client'

/**
 * The part of the report people come back to.
 *
 * Everything else on the page explains. This is where somebody actually works: nine cards,
 * ordered by what matters, each one tickable, with a progress bar that fills as they go.
 *
 * Two design decisions carry most of the weight here.
 *
 * The first is that a task is not finished when it is understood, it is finished when the
 * reader knows *which thing on their own screen* to change. So every card that can carries
 * a located block — this page, this is the text that is there now, this is what to put
 * instead — and a copy button on the suggestion, because the gap between reading a
 * suggested title and typing it out by hand is where most of them stop.
 *
 * The second is that a ticked task collapses. A list of nine that stays nine forever gives
 * no sense of progress; a list where finished work folds itself away and the bar moves is
 * the same information arranged so that doing the work feels like getting somewhere.
 */
import { useMemo, useState } from 'react'
import type { ReportTask } from '@/lib/report-view'
import { ChecklistProgress, TaskCheckbox, useChecklist } from './checklist'

type Lang = 'he' | 'en'

const t = (he: string, en: string, language: Lang) => (language === 'he' ? he : en)

const IMPACT_STYLE: Record<string, string> = {
  CRITICAL: 'bg-negative/10 text-negative ring-1 ring-inset ring-negative/20',
  IMPORTANT: 'bg-caution/15 text-caution ring-1 ring-inset ring-caution/25',
  MINOR: 'bg-line text-muted',
}

const Chip = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
    {children}
  </span>
)

/* ------------------------------------------------------------------- copying --- */

const CopyLine = ({ text, language }: { text: string; language: Lang }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          /* Refused by the browser. The text is on the page and selectable either way. */
        }
      }}
      className="shrink-0 rounded-md border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
    >
      {copied ? t('הועתק ✓', 'Copied ✓', language) : t('העתקה', 'Copy', language)}
    </button>
  )
}

/* ------------------------------------------------------------------ location --- */

/**
 * Where the problem is, on which page, and what to put there.
 *
 * The single most requested thing missing from a report like this: not "four pages have no
 * description" but "on your About page, this field is empty, write this".
 */
const Locations = ({
  task,
  language,
}: {
  task: ReportTask
  language: Lang
}) => {
  if (!task.locations || task.locations.length === 0) return null

  /* "Where to look" belongs to the kind of problem, not to each page it appears on —
     printing the same sentence under four page names is four times the height for none of
     the information, and it buries the parts that do differ. */
  const where = task.locations[0]?.where ?? null

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line">
      <div className="border-b border-line bg-surface px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          {t('איפה בדיוק', 'Exactly where', language)}
        </p>
        {where ? <p className="mt-1.5 text-sm leading-relaxed">{where}</p> : null}
      </div>

      <ul className="divide-y divide-line">
        {task.locations.map((loc) => (
          <li key={loc.url} className="space-y-2.5 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-semibold">{loc.page}</span>
              <a
                href={loc.url}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="break-all text-xs text-muted underline underline-offset-4 hover:text-accent"
              >
                {loc.url}
              </a>
            </div>

            {loc.current ? (
              <p className="text-sm">
                <span className="text-muted">{t('מה שכתוב שם עכשיו: ', 'What is there now: ', language)}</span>
                <span className="rounded bg-negative/8 px-1.5 py-0.5 font-medium text-negative" dir="auto">
                  {loc.current}
                </span>
              </p>
            ) : null}

            {loc.suggested ? (
              <div className="rounded-lg bg-positive/8 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-positive">
                  {t('מה לכתוב במקום', 'What to write instead', language)}
                </p>
                <div className="mt-2 flex items-start gap-2">
                  <p className="flex-1 text-sm font-medium leading-relaxed" dir="auto">
                    {loc.suggested}
                  </p>
                  <CopyLine text={loc.suggested} language={language} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {t(
                    'כתבנו את זה מהפרטים שקראנו מהאתר שלכם. עברו עליו לפני שאתם מדביקים — אתם מכירים את העסק, אנחנו רק קראנו אותו.',
                    'Written from the details we read off your site. Read it before pasting — you know the business, we only read it.',
                    language,
                  )}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {task.moreLocations && task.moreLocations > 0 ? (
        <p className="border-t border-line bg-surface px-4 py-2 text-xs text-muted">
          {t(`ועוד ${task.moreLocations} עמודים באותו מצב`, `and ${task.moreLocations} more pages in the same state`, language)}
        </p>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------- card --- */

const TaskCard = ({
  task,
  index,
  checked,
  onToggle,
  language,
}: {
  task: ReportTask
  index: number
  checked: boolean
  onToggle: (id: string) => void
  language: Lang
}) => (
  <li
    className={`rounded-xl border transition-all ${
      checked
        ? 'border-positive/30 bg-positive/5'
        : 'border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
    }`}
  >
    <div className="flex items-start gap-3 p-5 sm:p-6">
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
          checked ? 'bg-positive text-white' : 'bg-ink text-white'
        }`}
      >
        {checked ? '✓' : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {task.impactLabel ? (
            <Chip className={IMPACT_STYLE[task.impact ?? 'MINOR']!}>{task.impactLabel}</Chip>
          ) : null}
          {task.alreadyDone ? (
            <Chip className="bg-positive/10 text-positive">
              {t('כבר מקושר — רק לחזק', 'Already linked — just strengthen', language)}
            </Chip>
          ) : null}
          {task.minutes !== undefined && task.minutes > 0 ? (
            <Chip className="bg-line text-muted">
              {t(`${task.minutes} דקות`, `${task.minutes} min`, language)}
            </Chip>
          ) : null}
          {task.whoLabel ? <Chip className="bg-line text-muted">{task.whoLabel}</Chip> : null}
        </div>

        <h3
          className={`mt-2.5 text-lg font-semibold leading-snug ${checked ? 'text-muted line-through decoration-positive/40' : ''}`}
        >
          {task.title}
        </h3>

        {!checked ? (
          <>
            {task.what ? (
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{task.what}</p>
            ) : null}

            <p className="mt-2 text-[15px] leading-relaxed">{task.why}</p>

            {task.impactMeaning ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{task.impactMeaning}</p>
            ) : null}

            {task.reach ? (
              <p className="mt-2 text-sm font-medium text-accent">
                {t(
                  `נוגע ל-${task.reach.questions} מתוך ${task.reach.of} השאלות שלקוחות שואלים בתחום שלכם`,
                  `Touches ${task.reach.questions} of the ${task.reach.of} questions customers ask in your field`,
                  language,
                )}
              </p>
            ) : null}

            <Locations task={task} language={language} />

            <div className="mt-4 rounded-lg bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {t('מה לעשות', 'What to do', language)}
              </p>
              <ol className="mt-2.5 space-y-2 text-[15px] leading-relaxed">
                {task.steps.map((step, i) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="shrink-0 tabular-nums text-muted">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {task.example ? (
              <p className="mt-3 text-sm leading-relaxed">
                <span className="font-semibold">{t('לדוגמה: ', 'For example: ', language)}</span>
                <span className="text-muted">{task.example}</span>
              </p>
            ) : null}
          </>
        ) : null}

        <div className="mt-4 border-t border-line pt-3">
          <TaskCheckbox
            id={task.id}
            checked={checked}
            onToggle={onToggle}
            label={checked ? t('בוצע', 'Done', language) : t('סמנו כשסיימתם', 'Tick when done', language)}
          />
        </div>
      </div>
    </div>
  </li>
)

/* --------------------------------------------------------------------- board --- */

const GROUP_COPY = {
  SITE: {
    title: { he: 'מה לתקן באתר שלכם', en: 'What to fix on your site' },
    lead: {
      he: 'מצאנו את הדברים האלה בסריקה של האתר שלכם. לכל אחד כתוב באיזה עמוד הוא, מה כתוב שם עכשיו ומה לכתוב במקום.',
      en: 'We found these on your own site. Each says which page it is on, what is there now, and what to write instead.',
    },
  },
  OFFSITE: {
    title: { he: 'מה לעשות מחוץ לאתר', en: 'What to do beyond the site' },
    lead: {
      he: 'אתר מושלם הוא מקור אחד. מערכת AI מרכיבה תשובה ממקומות שמסכימים ביניהם — מפות, ביקורות, מדריכים. זה החלק שקובע אם היא בטוחה מספיק כדי להמליץ עליכם בשם.',
      en: 'A perfect site is one source. An assistant assembles an answer from places that agree — maps, reviews, directories. This is the half that decides whether it is confident enough to name you.',
    },
  },
  GENERAL: {
    title: { he: 'מה שעובד בעסקים כמו שלכם', en: 'What works for businesses like yours' },
    lead: {
      he: 'את החלק הזה לא מדדנו אצלכם — הוא בתוכן, לא בקוד. אלה הדברים שחוזרים אצל עסקים שכן מופיעים בתשובות.',
      en: 'We did not measure this on your site — it lives in the content, not the code. These recur among businesses that do appear in answers.',
    },
  },
} as const

export const TaskBoard = ({
  tasks,
  siteKey,
  language,
}: {
  tasks: readonly ReportTask[]
  siteKey: string
  language: Lang
}) => {
  const { done, toggle, ready } = useChecklist(siteKey)

  const groups = useMemo(
    () =>
      (['SITE', 'OFFSITE', 'GENERAL'] as const)
        .map((group) => ({ group, items: tasks.filter((task) => task.group === group) }))
        .filter((g) => g.items.length > 0),
    [tasks],
  )

  // Before the browser's stored ticks have been read, nothing is ticked: the server could
  // not have known what this browser remembers, and rendering a guess makes React throw
  // the tree away and the whole report flash.
  const doneCount = ready ? tasks.filter((task) => done.has(task.id)).length : 0

  return (
    <div className="space-y-6">
      <ChecklistProgress done={doneCount} total={tasks.length} language={language} />

      {groups.map(({ group, items }) => (
        <section key={group} className="rounded-xl border border-line bg-surface/60 p-4 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">
            {t(GROUP_COPY[group].title.he, GROUP_COPY[group].title.en, language)}
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            {t(GROUP_COPY[group].lead.he, GROUP_COPY[group].lead.en, language)}
          </p>

          <ol className="mt-5 space-y-4">
            {items.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                checked={ready && done.has(task.id)}
                onToggle={toggle}
                language={language}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
