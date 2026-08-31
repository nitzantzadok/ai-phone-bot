/**
 * Turning an opportunity into a concrete, reversible change.
 *
 * An action is not a suggestion. It carries the exact payload a connector will apply, the
 * facts grounding every claim in it, its risk tier and the reason it exists. If any of
 * those is missing, the action is not created — the agent must never reach a connector
 * with something it cannot explain or undo.
 */
import type { ActionCategory, RiskTier } from '@autopilot/shared/domain.ts'
import { attributeLabel } from '@autopilot/knowledge/attributes.ts'
import { getVertical } from '@autopilot/prompts/verticals.ts'
import { ACTION_RISK, type Opportunity } from './diagnosis.ts'
import type { GroundingFact } from './quality-gates.ts'

export interface PlannedAction {
  readonly actionType: string
  readonly category: ActionCategory
  readonly riskTier: RiskTier
  /** One sentence a business owner reads on the approval screen. */
  readonly summary: string
  /** Why this action, referencing the evidence. */
  readonly rationale: string
  readonly expectedImpact: number
  readonly targetUrl: string | null
  readonly payload: Record<string, unknown>
  /** Customer-visible text, if any. Passed to the quality gates verbatim. */
  readonly text?: string
  readonly assertedAttributes?: readonly string[]
  readonly language?: string
  readonly createsPageType?: string
}

export interface PlanningContext {
  readonly vertical: string
  readonly businessName: string
  readonly city: string | null
  readonly language: 'en' | 'he'
  readonly facts: readonly GroundingFact[]
  readonly homeUrl: string
  /** Pages we know about, so a fix can target a real URL. */
  readonly pages: readonly { url: string; pageType: string; title: string | null }[]
}

const factValue = (facts: readonly GroundingFact[], kind: string): string | null =>
  facts.find((f) => f.factKind === kind && f.value)?.value ?? null

/**
 * Plans the change for one opportunity.
 *
 * Returns null when we cannot produce something both grounded and safe. Returning null is
 * a legitimate, common outcome: it means the opportunity is real but needs a human, which
 * is a better answer than a plausible-looking edit nobody can defend.
 */
/**
 * Every customer-visible string the planner produces, in both languages.
 *
 * These were English-only while `PlanningContext` had carried a language all along. On a
 * Hebrew account the dashboard listed its changes as "Publish a sitemap listing your
 * pages" — and worse, the metadata action generated an English title and description for a
 * Hebrew site, which the language gate then correctly refused. So for the entire launch
 * market the one thing a paid plan buys, the fix being made for you, could not complete:
 * every action was held for a person, with an English explanation of why.
 */
const say = (context: PlanningContext, he: string, en: string): string =>
  context.language === 'he' ? he : en

export const planAction = (
  opportunity: Opportunity,
  context: PlanningContext,
): PlannedAction | null => {
  if (opportunity.suggestedActionType === null) return null
  if (opportunity.controllability === 'NOT_CONTROLLED') return null

  const vertical = getVertical(context.vertical)
  const risk = ACTION_RISK[opportunity.suggestedActionType] ?? 'MEDIUM'
  const targetUrl = pickTarget(opportunity, context)

  switch (opportunity.suggestedActionType) {
    case 'FIX_METADATA': {
      const page = context.pages.find((p) => p.url === targetUrl) ?? context.pages[0]
      if (!page) return null
      const name = factValue(context.facts, 'business_name') ?? context.businessName
      const category =
        factValue(context.facts, 'cuisine') ??
        vertical.labels[context.language] ??
        vertical.labels.en ??
        say(context, 'עסק', 'business')
      const city = context.city
      // Built only from confirmed facts: name, category, city. No adjectives, no claims.
      const title = [name, category, city].filter(Boolean).join(' - ').slice(0, 60)
      const description = factValue(context.facts, 'site_description')
        ? factValue(context.facts, 'site_description')!.slice(0, 160)
        : say(
            context,
            `${name} — ${category}${city ? ` ב${city}` : ''}. ` +
              `כאן אפשר למצוא שעות פתיחה, פרטי התקשרות ומה אנחנו מציעים.`,
            `${name} is a ${category.toLowerCase()}${city ? ` in ${city}` : ''}. ` +
              `See opening hours, contact details and what we offer.`,
          )

      return {
        actionType: 'FIX_METADATA',
        category: 'TECHNICAL',
        riskTier: risk,
        summary: say(
          context,
          `כותרת ותיאור ברורים ל-${shortUrl(page.url, context.language)}`,
          `Set a clear title and summary on ${shortUrl(page.url, context.language)}`,
        ),
        rationale: say(
          context,
          'מערכות AI קוראות קודם כול את הכותרת ואת התיאור כדי להחליט על מה העמוד. ' +
            'אצלכם הם חסרים או לא ברורים, ולכן אין להן ממה לעבוד.',
          'AI systems read the title and summary first to decide what a page is about. ' +
            'Yours is missing or unclear, so there is nothing for them to work from.',
        ),
        expectedImpact: opportunity.expectedLift,
        targetUrl: page.url,
        payload: { url: page.url, title, metaDescription: description },
        text: `${title} ${description}`,
        language: context.language,
      }
    }

    case 'FIX_CANONICAL': {
      if (!targetUrl) return null
      return {
        actionType: 'FIX_CANONICAL',
        category: 'TECHNICAL',
        riskTier: risk,
        summary: say(
          context,
          `לציין את הכתובת הרשמית של ${shortUrl(targetUrl, context.language)}`,
          `State the official address of ${shortUrl(targetUrl, context.language)}`,
        ),
        rationale: say(
          context,
          'בלי זה, סורקים עלולים להתייחס לכמה גרסאות של אותו עמוד כאל עמודים שונים, ' +
            'וזה מפצל את המידע על העסק שלכם.',
          'Without this, crawlers can treat several versions of the same page as different ' +
            'pages, which splits the signal about your business.',
        ),
        expectedImpact: opportunity.expectedLift,
        targetUrl,
        payload: { url: targetUrl, canonical: targetUrl },
      }
    }

    case 'FIX_LANG_ATTRIBUTE': {
      if (!targetUrl) return null
      const language = factValue(context.facts, 'content_language') ?? context.language
      return {
        actionType: 'FIX_LANG_ATTRIBUTE',
        category: 'TECHNICAL',
        riskTier: risk,
        summary: say(
          context,
          `להצהיר שהשפה של ${shortUrl(targetUrl, context.language)} היא ${language}`,
          `Declare the language of ${shortUrl(targetUrl, context.language)} as ${language}`,
        ),
        rationale: say(
          context,
          'האתר שלכם פונה לקוראי עברית ואנגלית. הצהרה על שפת כל עמוד עוזרת למערכות AI ' +
            'לענות בשפה הנכונה.',
          'Your site serves Hebrew and English readers. Declaring each page language ' +
            'helps AI systems answer in the right one.',
        ),
        expectedImpact: opportunity.expectedLift,
        targetUrl,
        payload: { url: targetUrl, lang: language },
      }
    }

    case 'ADD_SITEMAP': {
      return {
        actionType: 'ADD_SITEMAP',
        category: 'TECHNICAL',
        riskTier: risk,
        summary: say(context, 'לפרסם מפת אתר שמפרטת את העמודים', 'Publish a sitemap listing your pages'),
        rationale: say(
          context,
          'מפת אתר אומרת לסורקים אילו עמודים קיימים, במקום להשאיר להם לנחש.',
          'A sitemap tells crawlers which pages exist instead of leaving them to guess.',
        ),
        expectedImpact: opportunity.expectedLift,
        targetUrl: `${context.homeUrl.replace(/\/$/, '')}/sitemap.xml`,
        payload: { urls: context.pages.map((p) => p.url) },
      }
    }

    case 'ADD_SCHEMA': {
      const schema = buildSchema(context)
      if (!schema) return null
      return {
        actionType: 'ADD_SCHEMA',
        category: 'SCHEMA',
        riskTier: risk,
        summary: say(
          context,
          'להוסיף לאתר מידע עסקי שמכונה יכולה לקרוא',
          'Add machine-readable business information to your site',
        ),
        rationale: say(
          context,
          'זה חוזר על מידע שכבר קיים בעמוד, בפורמט שמערכות AI קוראות ישירות. ' +
            'לא נטען שום דבר חדש — רק מוסרת אי-בהירות.',
          'This restates information already on your page in a format AI systems read ' +
            'directly. Nothing new is claimed; it only removes ambiguity.',
        ),
        expectedImpact: opportunity.expectedLift,
        targetUrl: targetUrl ?? context.homeUrl,
        payload: { url: targetUrl ?? context.homeUrl, structuredData: schema },
      }
    }

    case 'ADD_CONTENT_SECTION': {
      const attributeKey = opportunity.attributeKey
      if (!attributeKey) return null
      // Only write about an attribute we hold a confirmed fact for.
      const supporting = context.facts.find(
        (f) => f.attributeKey === attributeKey && f.confidence !== 'LOW' && f.confidence !== 'UNKNOWN',
      )
      if (!supporting) return null

      const label = attributeLabel(attributeKey, context.language)
      const text = buildAttributeSection(label, context)

      return {
        actionType: 'ADD_CONTENT_SECTION',
        category: 'CONTENT',
        riskTier: risk,
        summary: say(
          context,
          `לתאר את "${label}" בבירור באתר`,
          `Describe "${label}" clearly on your site`,
        ),
        rationale: say(
          context,
          'לקוחות שואלים מערכות AI בדיוק על זה, והמידע שאישרתם תומך בכך — אבל האתר שלכם ' +
            'לא אומר את זה במפורש בשום מקום.',
          'Customers ask AI systems for exactly this, and your confirmed business ' +
            'information supports it, but your website never states it plainly.',
        ),
        expectedImpact: opportunity.expectedLift,
        targetUrl: targetUrl ?? context.homeUrl,
        payload: {
          url: targetUrl ?? context.homeUrl,
          heading: label,
          body: text,
          attributeKey,
        },
        text,
        assertedAttributes: [attributeKey],
        language: context.language,
      }
    }

    case 'CREATE_PAGE': {
      const pageType = String(opportunity.evidence.pageType ?? '')
      if (!pageType) return null
      return {
        actionType: 'CREATE_PAGE',
        category: 'CONTENT',
        riskTier: risk,
        summary: say(context, `ליצור עמוד ${pageType}`, `Create ${article(pageType)} ${pageType} page`),
        rationale: opportunity.explanation,
        expectedImpact: opportunity.expectedLift,
        targetUrl: `${context.homeUrl.replace(/\/$/, '')}/${pageType}`,
        payload: { pageType, url: `${context.homeUrl.replace(/\/$/, '')}/${pageType}` },
        createsPageType: pageType,
        language: context.language,
      }
    }

    // Deliberately not automated: only the owner knows which conflicting value is correct.
    case 'RESOLVE_INFO_CONFLICT':
      return null

    default:
      return null
  }
}

const pickTarget = (opportunity: Opportunity, context: PlanningContext): string | null => {
  const urls = opportunity.evidence.affectedUrls
  if (Array.isArray(urls) && typeof urls[0] === 'string') return urls[0]
  return context.pages.find((p) => p.pageType === 'home')?.url ?? context.homeUrl
}

/** English article agreement, so generated copy does not read as machine output. */
const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/**
 * A page, named the way somebody would say it out loud.
 *
 * The home page produced the literal English words "your home page", which then sat inside
 * an otherwise Hebrew sentence: "לציין את הכתובת הרשמית של your home page".
 */
const shortUrl = (url: string, language: 'he' | 'en' = 'en'): string => {
  try {
    const parsed = new URL(url)
    if (parsed.pathname !== '/') return parsed.pathname
    return language === 'he' ? 'עמוד הבית' : 'your home page'
  } catch {
    return url
  }
}

/**
 * Structured data built ONLY from confirmed facts.
 *
 * Every property is present because we hold a fact for it. There is no branch that emits a
 * property we cannot support, which is the difference between helpful markup and deceptive
 * markup.
 */
export const buildSchema = (context: PlanningContext): Record<string, unknown> | null => {
  const vertical = getVertical(context.vertical)
  const name = factValue(context.facts, 'business_name') ?? context.businessName
  if (!name) return null

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': factValue(context.facts, 'entity_type') ?? vertical.entityType,
    name,
    url: context.homeUrl,
  }

  const phone = factValue(context.facts, 'phone')
  if (phone) schema.telephone = phone

  const address = context.facts.find((f) => f.factKind === 'address')
  if (address?.value) {
    schema.address = {
      '@type': 'PostalAddress',
      streetAddress: address.value,
      ...(context.city ? { addressLocality: context.city } : {}),
    }
  }

  const priceRange = factValue(context.facts, 'price_range')
  if (priceRange) schema.priceRange = priceRange

  const cuisine = factValue(context.facts, 'cuisine')
  if (cuisine) schema.servesCuisine = cuisine

  const description = factValue(context.facts, 'site_description')
  if (description) schema.description = description

  return schema
}

/**
 * Content for an attribute section.
 *
 * Deliberately plain and short. This is not marketing copy; it is a clear factual
 * statement that a retrieval system can read and a human would not find embarrassing.
 * No superlatives, no invented detail, nothing the owner has not confirmed.
 */
const buildAttributeSection = (label: string, context: PlanningContext): string => {
  const name = context.businessName
  const city = context.city
  if (context.language === 'he') {
    return (
      `${name} מציעה ${label.toLowerCase()}${city ? ` ב${city}` : ''}. ` +
      `אם זה מה שאתם מחפשים, אפשר ליצור קשר ולבדוק זמינות מראש.`
    )
  }
  return (
    `${name} offers ${label.toLowerCase()}${city ? ` in ${city}` : ''}. ` +
    `If that is what you are looking for, get in touch to check availability.`
  )
}
