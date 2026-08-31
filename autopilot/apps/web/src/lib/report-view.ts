/**
 * Turning a scan report into the things a person reads.
 *
 * One place, because the free scan and the signed-in dashboard show the same report and
 * had drifted into showing it differently. It is also the only place allowed to know that
 * `readiness.components` has three keys with those names — the page should not, and when
 * the scoring version changes the page should not have to.
 */
import type { ScanReport, SkipReason } from '@autopilot/scan/scan.ts'
import { buildHandoff, type Handoff } from '@autopilot/insights/handoff.ts'
import {
  IMPACT_LABEL,
  IMPACT_MEANING,
  OWNER_LABEL,
  type Impact,
} from '@autopilot/insights/explain.ts'
import { locateAll, type BusinessFacts, type Located } from '@autopilot/insights/locate.ts'
import { buildOffsite, type OffsiteReport } from '@autopilot/insights/offsite.ts'
import {
  bandLabel,
  buildVerdict,
  verticalLabel,
  type Verdict,
} from '@autopilot/insights/verdict.ts'

type Lang = 'he' | 'en'

/**
 * One task shape for everything the customer has to do.
 *
 * Work on the site and work off it used to be different types rendered by different code,
 * which is how a report ends up telling somebody to fix a page title in one visual
 * language and claim a Google profile in another. To the person holding the list they are
 * the same kind of thing: something to do, that takes a while, that somebody has to do.
 *
 * Flattened to plain data on purpose — the checklist that renders it runs in the browser,
 * so everything here has to survive being serialised across that boundary.
 */
export interface ReportTask {
  /** Stable across scans of the same site, so a tick survives re-running the scan. */
  readonly id: string
  readonly group: 'SITE' | 'OFFSITE' | 'GENERAL'
  readonly title: string
  readonly why: string
  readonly steps: readonly string[]
  readonly impact?: Impact
  readonly impactLabel?: string
  readonly impactMeaning?: string
  readonly minutes?: number
  readonly whoLabel?: string
  readonly what?: string
  readonly example?: string
  readonly reach?: { readonly questions: number; readonly of: number }
  /** Exactly where this is, per page, with what is there now and what to put instead. */
  readonly locations?: readonly Located[]
  readonly moreLocations?: number
  /** Set on off-site work the site already links to: a strengthening step, not a gap. */
  readonly alreadyDone?: boolean
}

export interface ReportView {
  readonly verdict: Verdict
  readonly bandLabel: string
  /** Why the AI half is missing, said to a customer rather than to an operator. */
  readonly aiSkipMessage: string | null
  /** Everything to do, in one shape, ordered by what matters. */
  readonly tasks: readonly ReportTask[]
  readonly offsite: OffsiteReport
  readonly handoff: Handoff
  readonly facts: readonly { label: string; value: string | null }[]
  readonly components: readonly { label: string; value: number; meaning: string }[]
  readonly scoreFootnote: string
}

const t = (he: string, en: string, language: Lang) => (language === 'he' ? he : en)

/**
 * What each half of the score is actually asking.
 *
 * The labels used to be the question ("can the site be read") with no answer to what a
 * low number there means for the business, which leaves a reader looking at "0%" with
 * nothing to do about it.
 */
const COMPONENT_COPY: Record<
  string,
  { label: { he: string; en: string }; meaning: { he: string; en: string } }
> = {
  technicalDiscoverability: {
    label: { he: 'האם אפשר לקרוא את האתר בכלל', en: 'Can the site be read at all' },
    meaning: {
      he: 'האם התוכנות שמזינות את ChatGPT ו-Gemini מצליחות להגיע לעמודים שלכם ולקרוא מהם טקסט. זה התנאי לכל השאר — אם זה נמוך, שום דבר אחר לא משנה.',
      en: 'Whether the programs feeding ChatGPT and Gemini can reach your pages and read text from them. This is the precondition for everything else — if it is low, nothing else matters.',
    },
  },
  informationCompleteness: {
    label: { he: 'האם הפרטים שלכם כתובים באתר', en: 'Are your details written on the site' },
    meaning: {
      he: 'שם, עיר, טלפון, כתובת, שעות. אלה הפרטים שמערכת AI חייבת כדי לענות תשובה שימושית עליכם. פרט שלא כתוב — לא ייאמר.',
      en: 'Name, city, phone, address, hours. These are what an AI needs to give a useful answer about you. A detail that is not written will not be said.',
    },
  },
  attributeCoverage: {
    label: {
      he: 'האם כתוב למה אתם מתאימים',
      en: 'Is it written what you are good for',
    },
    meaning: {
      he: 'לקוחות לא שואלים "מסעדה בתל אביב" אלא "מסעדה שקטה לדייט". אם המילים האלה לא מופיעות באתר, אף מערכת לא תמציא אותן עבורכם — גם אם זה נכון לחלוטין.',
      en: 'Customers do not ask for "a restaurant in Tel Aviv" but "a quiet restaurant for a date". If those words are not on the site, no system will invent them for you, however true they are.',
    },
  },
}

/**
 * Why the AI half is missing, in a form a customer can read.
 *
 * The scan's own `detail` is written for whoever runs it, and two of its cases say so out
 * loud: "no ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY is configured" and
 * "USE_MOCK_PROVIDERS is set". Both were rendering into a paying customer's dashboard,
 * which tells them two things at once — that something is misconfigured, and that nobody
 * checked what this page says before shipping it.
 *
 * The operator text is still the right text for the CLI and the logs, so it stays where it
 * is. This decides only what a customer sees, and it is deliberately not an apology: the
 * reasons that are about *their site* are the useful ones, and those are passed through
 * unchanged because they are already the best sentence available.
 */
const customerSkipMessage = (
  reason: SkipReason,
  operatorDetail: string,
  language: Lang,
): string => {
  switch (reason) {
    case 'NO_PROVIDER_KEY':
    case 'MOCK_PROVIDERS_CONFIGURED':
    case 'MEASUREMENT_FAILED':
      // Our configuration, our outage, our problem. Naming an environment variable at a
      // dentist is worse than saying nothing, and estimating a number in its place would
      // be worse than both.
      return t(
        'בהרצה הזו לא שאלנו את המערכות בפועל, אז אין כאן מספר. לא הערכנו אחד במקומו ולא נעריך — מספר משוער בעמוד הזה היה הופך את כל השאר לחסר ערך. השאלות למטה הן אלה שיישאלו בהרצה הבאה.',
        'We did not actually ask the systems on this run, so there is no number here. We did not estimate one and will not — an estimated number on this page would make every other number on it worthless. The questions below are the ones the next run asks.',
        language,
      )
    case 'NOT_REQUESTED':
      return t(
        'הסריקה הזו קראה את האתר בלבד. לשאול את המערכות בפועל ולראות מה הן עונות — זה מה שמנוי מודד.',
        'This scan read the site only. Actually asking the systems and seeing what they answer is what a plan measures.',
        language,
      )
    case 'NO_BUSINESS_NAME':
    case 'NO_CITY_KNOWN':
      // These are about the customer's own site, and the scan already says them well.
      return operatorDetail
  }
}

export const buildReportView = (report: ScanReport, language: Lang): ReportView => {
  const b = report.business

  const verdict = buildVerdict({
    score: report.readiness.score,
    businessName: b.name,
    city: b.city,
    phone: b.phone,
    address: b.address,
    vertical: verticalLabel(b.vertical, language),
    pagesRead: report.crawl.pagesFetched,
    findingTypes: report.findings.map((f) => f.findingType),
    language,
  })

  /* One entry per finding type, carrying every page it was seen on. The crawler emits one
     finding per page, so a four-page site with no summaries produces four findings — and a
     handoff that lists the same instruction four times reads as though nobody checked it
     before sending. */
  const byType = new Map<string, string[]>()
  for (const f of report.findings) {
    byType.set(f.findingType, [...(byType.get(f.findingType) ?? []), f.url])
  }

  const handoff = buildHandoff({
    siteUrl: report.requestedUrl,
    businessName: b.name,
    city: b.city,
    phone: b.phone,
    address: b.address,
    entityType: b.entityType,
    findings: [...byType].map(([findingType, urls]) => ({ findingType, urls })),
    language,
  })

  const facts = [
    { label: t('שם העסק', 'Business name', language), value: b.name },
    { label: t('עיר', 'City', language), value: b.city },
    { label: t('טלפון', 'Phone', language), value: b.phone },
    { label: t('כתובת', 'Address', language), value: b.address },
  ]

  const components = Object.entries(report.readiness.components).map(([key, c]) => {
    const copy = COMPONENT_COPY[key]
    return {
      label: copy ? (language === 'he' ? copy.label.he : copy.label.en) : key,
      value: c.value,
      meaning: copy ? (language === 'he' ? copy.meaning.he : copy.meaning.en) : '',
    }
  })

  /* ------------------------------------------------------------------ tasks --- */

  const businessFacts: BusinessFacts = {
    name: b.name,
    city: b.city,
    phone: b.phone,
    address: b.address,
    // Null when the scan could not tell what field this is. `verticalLabel` returns a
    // readable stand-in for that case, which is right in a sentence we write and wrong in
    // one the customer pastes onto their own site.
    verticalLabel: b.vertical === 'local_business' ? null : verticalLabel(b.vertical, language),
    attributes: b.statedAttributes,
  }

  /* Findings grouped by type, so one instruction carries every page it applies to rather
     than repeating itself once per page. */
  const findingsByType = new Map<string, typeof report.findings[number][]>()
  for (const f of report.findings) {
    findingsByType.set(f.findingType, [...(findingsByType.get(f.findingType) ?? []), f])
  }

  const labelFor = (value: { he: string; en: string }) =>
    language === 'he' ? value.he : value.en

  const siteTasks: ReportTask[] = report.playbook.items
    .filter((item) => item.kind === 'MEASURED')
    .map((item, index) => {
      const findingType =
        typeof item.evidence?.findingType === 'string' ? item.evidence.findingType : null
      const group = findingType ? (findingsByType.get(findingType) ?? []) : []
      const { located, more } = locateAll(group, businessFacts, language)

      return {
        // Keyed on the finding type where there is one, so ticking survives a re-scan
        // that reorders the list. Position is the fallback and a poor one; a task whose
        // id moves loses its tick, which reads as the product forgetting.
        id: findingType ? `site:${findingType}` : `site:idx:${index}`,
        group: 'SITE' as const,
        title: item.title,
        why: item.why,
        steps: [...item.steps],
        ...(item.impact ? { impact: item.impact, impactLabel: labelFor(IMPACT_LABEL[item.impact]), impactMeaning: labelFor(IMPACT_MEANING[item.impact]) } : {}),
        ...(item.minutes === undefined ? {} : { minutes: item.minutes }),
        ...(item.who ? { whoLabel: labelFor(OWNER_LABEL[item.who]) } : {}),
        ...(item.what ? { what: item.what } : {}),
        ...(item.example ? { example: item.example } : {}),
        ...(item.reach ? { reach: item.reach } : {}),
        ...(located.length > 0 ? { locations: located, moreLocations: more } : {}),
      }
    })

  const offsite = buildOffsite({
    links: report.crawl.outboundLinks,
    siteUrl: report.requestedUrl,
    language,
    // The readable stand-in is correct here: these are sentences we write and the customer
    // reads, not sentences they paste onto their own site.
    verticalLabel: verticalLabel(b.vertical, language),
    city: b.city,
  })

  const offsiteTasks: ReportTask[] = offsite.tasks.map((task) => ({
    id: task.id,
    group: 'OFFSITE' as const,
    title: task.title,
    why: task.why,
    steps: [...task.steps],
    minutes: task.minutes,
    whoLabel: labelFor(OWNER_LABEL.YOU),
    alreadyDone: task.alreadyLinked,
  }))

  const generalTasks: ReportTask[] = report.playbook.items
    .filter((item) => item.kind === 'GENERAL')
    .slice(0, 4)
    .map((item, index) => ({
      id: `general:${index}`,
      group: 'GENERAL' as const,
      title: item.title,
      why: item.why,
      steps: [...item.steps],
      ...(item.minutes === undefined ? {} : { minutes: item.minutes }),
      ...(item.who ? { whoLabel: labelFor(OWNER_LABEL[item.who]) } : {}),
    }))

  const skipped = report.aiVisibilitySkipped

  return {
    tasks: [...siteTasks, ...offsiteTasks, ...generalTasks],
    offsite,
    verdict,
    bandLabel: bandLabel(verdict.band, language),
    aiSkipMessage: skipped
      ? customerSkipMessage(
          skipped.reason,
          language === 'he' ? skipped.detail.he : skipped.detail.en,
          language,
        )
      : null,
    handoff,
    facts,
    components,
    scoreFootnote: t(
      'הציון מודד האם מערכת AI מסוגלת למצוא אתכם, לקרוא אתכם ולתאר אתכם נכון מתוך האתר שלכם. הוא לא מדידה של האם מישהו ממליץ עליכם, והוא לא תחזית שכן ימליץ. כל מספר בדוח הזה נמדד בסריקה הזו — שום דבר כאן לא הוערך.',
      report.readiness.disclosure,
      language,
    ),
  }
}
