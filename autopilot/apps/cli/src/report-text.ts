/**
 * Renders a scan report as plain text for a terminal.
 *
 * Split from the CLI so the demo, the acceptance test and the CLI all print the exact
 * report a customer sees — a report format that only one caller exercises is a report
 * format nobody has read.
 */
import type { ScanReport } from './scan.ts'
import { whyNothingWasRead } from './scan.ts'

/* ------------------------------------------------------------------ output --- */

const L = (language: 'he' | 'en', he: string, en: string): string => (language === 'he' ? he : en)

const bar = (value: number, width = 24): string => {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width)
  return '█'.repeat(filled) + '·'.repeat(width - filled)
}

const rule = (title: string): string => `\n${title}\n${'─'.repeat(Math.max(12, title.length))}`

const pct = (value: number): string => `${Math.round(value * 100)}%`

export const renderReport = (report: ScanReport): string => {
  const lang = report.language
  const out: string[] = []
  const say = (line = '') => out.push(line)

  say()
  say(L(lang, '  סריקת נוכחות ב-AI', '  AI presence scan'))
  say(`  ${report.requestedUrl}`)
  say(`  ${report.scannedAt.toISOString()}`)

  /* ------------------------------------------------------------- crawl ----- */
  say(rule(L(lang, 'מה נקרא באתר', 'What was read')))
  say(
    L(lang, `נסרקו ${report.crawl.pagesFetched} עמודים`, `${report.crawl.pagesFetched} pages crawled`) +
      ` · ${report.crawl.durationMs}ms` +
      ` · robots.txt: ${report.crawl.robotsTxtFound ? '✓' : '✗'}` +
      ` · sitemap: ${report.crawl.sitemapFound ? '✓' : '✗'}`,
  )
  if (report.crawl.errors.length > 0) {
    say(
      L(lang, `${report.crawl.errors.length} עמודים נכשלו: `, `${report.crawl.errors.length} pages failed: `) +
        report.crawl.errors.slice(0, 3).map((e) => `${e.url} (${e.code})`).join(', '),
    )
  }
  if (report.crawl.pagesFetched === 0) {
    say()
    // Why nothing was read decides whose problem it is. Telling a business their site is
    // unreadable when our own network failed is an accusation, not a finding.
    const why = whyNothingWasRead(report)

    if (why === 'BOT_PROTECTION') {
      say(
        L(
          lang,
          'האתר זיהה אותנו כסורק אוטומטי וחסם את הגישה. זה לא כשל באתר — זו הגדרת הגנה, ' +
            'בדרך כלל של Cloudflare או תוסף אבטחה. הבעיה: הסורקים שמזינים את התשובות של ' +
            'ChatGPT ו-Gemini נתקלים באותה חסימה בדיוק, ולכן הם לא רואים אתכם בכלל.',
          'The site recognised us as an automated crawler and refused access. That is not a ' +
            'fault, it is a protection setting, usually Cloudflare or a security plugin. The ' +
            'problem: the crawlers that feed ChatGPT and Gemini hit exactly the same wall, so ' +
            'they cannot see you at all.',
        ),
      )
      say()
      say(
        L(
          lang,
          'מה לעשות: בהגדרות ההגנה אפשרו סורקים מאומתים, או הוסיפו חריגה ל-GPTBot, ' +
            'ClaudeBot, PerplexityBot ו-Google-Extended.',
          'What to do: in your protection settings allow verified bots, or add an exception ' +
            'for GPTBot, ClaudeBot, PerplexityBot and Google-Extended.',
        ),
      )
    } else if (why === 'ROBOTS_BLOCKED') {
      say(
        L(
          lang,
          'קובץ robots.txt של האתר חוסם אותנו. הוא חוסם באותה מידה גם את הסורקים של מנועי ה-AI — ' +
            'זו כמעט תמיד הסיבה היחידה שעסק לא מופיע בשום תשובה. זה תיקון של שורה אחת.',
          'The site’s robots.txt excludes us. It excludes the AI engines’ crawlers just as ' +
            'effectively, and that is almost always the entire reason a business appears in no ' +
            'answer at all. It is a one-line fix.',
        ),
      )
    } else if (why === 'SITE_ERRORS') {
      say(
        L(
          lang,
          'האתר החזיר שגיאה בכל עמוד שביקשנו. מה שלא נטען עבורנו לא נטען גם עבור מנוע AI.',
          'The site returned an error for every page we requested. What does not load for us does not load for an AI engine either.',
        ),
      )
    } else {
      say(
        L(
          lang,
          'לא הצלחנו להגיע לאתר בכלל — לא קיבלנו ממנו תשובה. זו יכולה להיות בעיה באתר, ' +
            'בדומיין, או ברשת שממנה הרצנו את הסריקה. בדקו את הכתובת ונסו שוב לפני שתסיקו מסקנות.',
          'We could not reach the site at all — no response came back. That can be the site, the ' +
            'domain, or the network this scan ran from. Check the address and try again before ' +
            'concluding anything.',
        ),
      )
    }

    if (report.crawl.errors.length > 0) {
      say()
      for (const e of report.crawl.errors.slice(0, 4)) say(`    ${e.code}  ${e.url}`)
    }
    return out.join('\n')
  }

  /* ------------------------------------------------------------ entity ----- */
  const b = report.business
  say(rule(L(lang, 'מה האתר אומר על העסק', 'What the site says about the business')))
  const field = (label: string, value: string | null) =>
    say(`  ${label.padEnd(lang === 'he' ? 14 : 14)} ${value ?? L(lang, '— לא נמצא', '— not found')}`)
  field(L(lang, 'שם', 'Name'), b.name)
  field(L(lang, 'עיר', 'City'), b.city)
  field(L(lang, 'טלפון', 'Phone'), b.phone)
  field(L(lang, 'כתובת', 'Address'), b.address)
  field(
    L(lang, 'תחום', 'Field'),
    `${b.vertical} (${b.verticalSource === 'INFERRED' ? L(lang, 'זוהה מהאתר', 'detected') : L(lang, 'הוזן', 'supplied')})`,
  )
  if (b.missingFields.length > 0) {
    say(
      `  ${L(lang, 'חסר', 'Missing')}: ${b.missingFields.join(', ')}`,
    )
  }
  if (b.statedAttributes.length > 0) {
    say(`  ${L(lang, 'מה כתוב', 'Stated')}: ${b.statedAttributes.slice(0, 12).join(', ')}`)
  }

  /* --------------------------------------------------------- readiness ----- */
  const r = report.readiness
  say(rule(L(lang, 'ציון מוכנות', 'Readiness score')))
  say(`  ${r.score}/100   ${bar(r.score / 100)}`)
  for (const [key, c] of Object.entries(r.components)) {
    const label = {
      technicalDiscoverability: L(lang, 'האם אפשר לקרוא את האתר', 'Can the site be read'),
      informationCompleteness: L(lang, 'האם המידע שלם', 'Is the information complete'),
      attributeCoverage: L(lang, 'האם כתוב מה שנשאלים', 'Is what people ask about written'),
    }[key as keyof typeof r.components]
    say(`    ${bar(c.value, 16)}  ${pct(c.value).padStart(4)}  ${label}`)
  }
  say(`  ${L(lang, 'נוסחה', 'Formula')}: ${r.version}`)

  /* ------------------------------------------------------- ai visibility --- */
  say(rule(L(lang, 'נוכחות בתשובות של AI', 'Presence in AI answers')))
  if (report.aiVisibility) {
    const ai = report.aiVisibility
    say(
      `  ${L(lang, 'נמדד מול', 'Measured against')}: ${ai.engines.join(', ')} · ` +
        L(lang, `${ai.promptsRun} הרצות`, `${ai.promptsRun} executions`) +
        ` · ₪${(ai.costMinor / 100).toFixed(2)}`,
    )
    say(`  AIRS ${ai.airs.score}/100  (${ai.airs.formulaVersion})`)
    say(
      `  ${L(lang, 'שיעור המלצה', 'Recommendation rate')}: ${pct(ai.recommendationRate)}`,
    )
    if (ai.competitors.length > 0) {
      say(
        // Not "instead of you": the list is every business the answers named, which on a
        // question you won includes the ones ranked below you.
        `  ${L(lang, 'מי עוד הופיע בתשובות', 'Who else appeared')}: ` +
          ai.competitors.slice(0, 5).map((c) => `${c.name} (${c.appearances})`).join(', '),
      )
    }
    say()
    for (const e of ai.examples.slice(0, 5)) {
      const mark = e.recommended ? '✓' : '✗'
      say(`  ${mark} [${e.engine}] ${e.question}`)
      if (!e.recommended && e.competitorsAhead.length > 0) {
        say(`      ${L(lang, 'הופיעו במקום', 'appeared instead')}: ${e.competitorsAhead.slice(0, 3).join(', ')}`)
      }
    }
  } else {
    const s = report.aiVisibilitySkipped
    say(`  ${L(lang, 'לא נמדד', 'NOT MEASURED')} — ${s?.reason ?? 'UNKNOWN'}`)
    if (s) say(`  ${lang === 'he' ? s.detail.he : s.detail.en}`)
    say()
    say(
      L(
        lang,
        '  לא הערכנו ולא הדמינו מספר במקום המדידה. החלק הזה של הדוח פשוט לא בוצע.',
        '  Nothing was estimated or simulated in its place. This half of the report simply did not run.',
      ),
    )
    if (report.prompts.length > 0) {
      say()
      say(
        L(
          lang,
          `  ${report.prompts.length} השאלות שהיינו שואלים, לדוגמה:`,
          `  ${report.prompts.length} questions we would ask, for example:`,
        ),
      )
      for (const p of report.prompts.slice(0, 5)) say(`    · ${p.queryText}`)
    }
  }

  /* ---------------------------------------------------------- findings ----- */
  if (report.findings.length > 0) {
    say(rule(L(lang, 'מה מצאנו באתר', 'What we found on the site')))
    // One line per problem, not per page. "No summary" repeated across every page of a
    // four-page site reads as twelve problems when it is one problem in four places.
    const grouped = new Map<string, typeof report.findings[number][]>()
    for (const f of report.findings) {
      grouped.set(f.findingType, [...(grouped.get(f.findingType) ?? []), f])
    }
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
    const rows = [...grouped.values()].sort((a, b2) => order[a[0]!.severity] - order[b2[0]!.severity])

    for (const group of rows) {
      const f = group[0]!
      // The sentence stays singular and generic; the count rides in front of it, so it
      // reads correctly in Hebrew whether it applies to one page or to forty.
      const count = group.length > 1 ? `×${group.length} ` : ''
      say(`  [${f.severity}] ${count}${lang === 'he' ? f.plainLanguageHe : f.plainLanguage}`)
      say(
        group.length === 1
          ? `      ${f.url}`
          : `      ${f.url}` +
              L(lang, `  ועוד ${group.length - 1}`, `  and ${group.length - 1} more`),
      )
    }
  }

  if (report.conflicts.length > 0) {
    say(rule(L(lang, 'סתירות בתוך האתר', 'Contradictions within the site')))
    for (const c of report.conflicts.slice(0, 5)) {
      say(`  ${c.factKind}: ${c.values.map((v) => v.value).join('  ≠  ')}`)
    }
  }

  /* ---------------------------------------------------------- playbook ----- */
  say(rule(L(lang, 'מה לעשות', 'What to do')))
  say(`  ${report.playbook.headline}`)
  say()
  report.playbook.items.forEach((item, i) => {
    const tag = item.kind === 'MEASURED' ? L(lang, 'נמדד', 'measured') : L(lang, 'כללי', 'general')
    say(`  ${i + 1}. ${item.title}  (${tag})`)
    if (item.reach) {
      say(
        L(
          lang,
          `     נוגע ל-${item.reach.questions} מתוך ${item.reach.of} השאלות שאנחנו עוקבים אחריהן`,
          `     Touches ${item.reach.questions} of the ${item.reach.of} questions we monitor`,
        ),
      )
    }
    say(`     ${item.why}`)
    for (const step of item.steps.slice(0, 4)) say(`       · ${step}`)
    say(
      `     ${L(lang, 'איך תדעו', 'How you will know')}: ${item.howYouWillKnow}` +
        (item.weDoThisForYou ? L(lang, '   [אנחנו עושים את זה]', '   [we do this for you]') : ''),
    )
    say()
  })

  if (report.playbook.outsideOurControl.length > 0) {
    say(rule(L(lang, 'מה לא בשליטתנו', 'Outside our control')))
    for (const item of report.playbook.outsideOurControl) {
      say(`  · ${item.title}`)
      say(`    ${item.why}`)
    }
  }

  say()
  return out.join('\n')
}

