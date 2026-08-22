# CHANGELOG

## Unreleased — the scan runs against real websites, from the browser

### Fixed

Three ways the app forgot who you were, none of them visible in the code:

- **A link that logged you out by being rendered.** Next prefetches `<Link>` targets, so a
  GET route that clears the session ran on every dashboard render. Every state-changing
  route is POST-only now, and the tests assert there is no GET export left to prefetch.
- **A cookie set through the `cookies()` API on a hand-built `NextResponse`** never reaches
  the browser: the mutation is dropped and no Set-Cookie header ships.
- **`secure: NODE_ENV === 'production'`**, which is true under `next start` over plain
  http, so the browser silently refused to store the session. It follows the connection
  now, reading the forwarded scheme behind a hosting proxy.

Also: an absolute redirect Location normalises the host, sending a browser on 127.0.0.1 to
localhost — a different origin, where the cookie just set does not apply. Relative now.

Four failures found by scanning the kinds of site a real customer has, rather than the
well-behaved fixture. Each produced a report that was confidently wrong about a business
with a perfectly good website.

- **Hebrew served as windows-1255 came back as mojibake.** Every body was decoded as UTF-8,
  so on the older Israeli sites that still use the legacy codepage the name, the city and
  every Hebrew attribute silently failed to extract, and the report told a full site it
  states nothing. The declared charset is now honoured.
- **The city was read only from structured data**, which most small business sites do not
  have. No city means no local question, so the entire measurement half switched itself off
  for the majority of real customers. Israeli cities are now recognised in the page text
  from a fixed vocabulary — a wrong city is worse than none, so nothing is guessed.
- **A JavaScript-rendered site was reported as nearly empty** — "hardly any text", "no
  heading", "no summary" — about a site full of content. An empty application shell is now
  detected and reported as the single finding it is: crawlers that feed AI answers do not
  run JavaScript, so to them the page is blank.
- **Bot protection was reported as a broken site.** A Cloudflare 403 is a server that saw
  us and said no, and the crawlers behind ChatGPT and Gemini hit the same wall — so it is
  named, with the bots to allow.

- **A failed measurement was published as a measurement of zero.** When every provider call
  failed — a wrong key, an exhausted quota, no network — the report still showed
  "recommended in 0% of questions" and an AIRS score computed from no observations. Those
  two states produce identical numbers and only one is true, so a run with no successful
  execution is now a skip carrying the provider's reason, and no AIRS number is produced.
- **Every colour token in the web app was silently dropped.** `bg-[--color-accent]` is
  parsed by Tailwind 4 as an arbitrary *value*, not a variable, so it is not a valid colour
  and the declaration disappears: score bars rendered transparent, buttons lost their
  accent, muted text and borders fell back to defaults. All 178 occurrences across 11 files
  now use the utilities Tailwind generates from the `@theme` tokens.
- **The advice claimed what an AI did when no AI had been asked.** On an unmeasured scan the
  playbook headlined "AI does not associate you with X" on the same page as the NOT
  MEASURED notice. The finding is real, so it is now stated about the site, which is where
  the evidence came from.
- **The crawler could not fetch any real website.** The pinned DNS lookup answered undici
  with a bare address string, but undici's connector asks with `all: true` and reads
  `addresses[0].address`, so every connection to a hostname died with
  "Invalid IP address: undefined". Nothing caught it because Node skips DNS entirely for
  IP literals and every integration test targeted `127.0.0.1` — so the pin never ran.
  `safe-fetch-pinning.test.ts` now exercises a hostname and fails against the old code.
- **Hebrew questions disagreed with their own nouns.** Templates hard-coded feminine
  agreement, producing "איזו רופא שיניים מתאימה" — a question no Hebrew speaker types, so
  measuring it measured demand that does not exist. Agreement now follows the service term
  (`packages/prompts/src/hebrew.ts`).
- **English questions named Israeli cities in Hebrew** ("Where should I go in פתח תקווה").
  English is now generated only for cities we can name in English.
- **A page greeting was published as the business name.** "ברוכים הבאים" is not a name;
  reporting no name is better, and is itself the finding.
- **Formatting differences were reported as contradictions.** `+972-3-555-0123` and
  `03-555-0123` are one phone number.
- **A robots.txt exclusion was silently dropped**, producing an empty report that told the
  customer nothing about why they were invisible. It is now recorded and explained.
- **English leaked into Hebrew reports** through technical findings and evidence-gap
  reasons; both are now written in both languages at source.
- **"4 of 0 questions"** — the attribute explanation used the number of answers read as its
  denominator, which is zero on an unmeasured scan.

### Added

- **The whole product is walkable in a browser.** Scan straight from the landing page's
  hero, choose a plan on the pricing page, and land in a working dashboard — no payment,
  no details, stated on screen rather than left to be discovered. `/app` runs a real scan
  of the chosen site on every load and shows the score with its components, the identity
  read from the page, the questions monitored, the findings, the playbook, and the
  connection guide for whatever built the site. Payment gets connected later; `/start` is
  where the checkout will go, and nothing downstream of it changes.
- **The `<meta name="generator">` tag is read**, so the connection guide shown is the one
  for the platform the site actually runs on.
- **`autopilot/.env` is read by `pnpm scan`**, so a provider key need not be typed on the
  command line, where it lands in shell history and the process list.
- **The web form now returns a scan.** `/scan` runs the real thing server-side and streams
  a waiting state while it works, so a business owner types an address and gets their
  score, findings and playbook on screen. `/join` submits straight to it, and the email
  field is gone — the result is shown, not delivered, so asking for an address before
  showing anything only lost people.
- **`DEPLOYMENT_MODE=scan-only`** — a real production mode for a deployment that serves
  only the free scan: no database, no Redis, no session secrets, because it stores nothing
  and signs nothing. `full` stays the default so omitting it never weakens a deployment,
  and the SSRF and no-simulated-answers invariants hold in both. `DEPLOY-SCAN.md` and
  `vercel.json` cover getting it online.
- **A bound on the public scan endpoint** — five scans per address per ten minutes, so an
  open crawler never becomes a load on somebody else's website.
- **`pnpm scan <url>`** — a real scan of a live website with no database and no API key:
  crawl, fact extraction, technical audit, diagnosis, prioritized insights and a versioned
  `readiness-v1` score, printed in Hebrew or English, or as JSON. Documented in
  `SCANNING.md`.
- **Real AI visibility measurement** when a provider key is configured, reporting the
  recommendation rate, competitors named, AIRS and the run's cost. Without a key that half
  is reported as NOT MEASURED with the reason; it is never simulated, and a simulated
  registry is refused outright.
- **Egress proxy support** in the crawler via `HTTPS_PROXY`/`NO_PROXY`, with the pinning
  trade-off documented and logged rather than hidden.
- **Provider endpoint overrides** (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`) for gateways
  and regional endpoints — and so the measurement path can be tested end-to-end against a
  real server rather than mocked at the seam.
- **A demo site** with a "before" and "after" version of the same clinic, plus 47 tests
  covering the scan end to end.


## 0.1.0 — initial vertical slice

The end-to-end loop works: a business goes from a URL to a measured score, a diagnosis,
applied safe changes and a re-measurement, with no manual intervention in between.

### Added

- **Architecture** — `ARCHITECTURE.md`, plus product, database, security, agent, provider,
  billing, privacy, deployment and runbook documentation
- **Foundations** — typed configuration, versioned `CountryConfig` with Israeli VAT by
  effective date, integer-minor-unit money, redacting logger, AES-256-GCM envelope
  encryption, bounded retry / circuit breaker / token bucket, Wilson intervals
- **Database** — 50-table Drizzle schema, tenant-scoped repositories, PGlite test harness
- **Providers** — `AIProvider` seam with real OpenAI, Gemini and Anthropic adapters using
  each vendor's official grounding; deterministic world simulator; versioned price table;
  cost ledger with pre-flight budget enforcement; model router
- **Crawler** — SSRF-hardened fetch (63 tests), robots.txt compliance, HTML and JSON-LD
  parsing, plain-language technical audit, crawl diffing
- **Knowledge** — Business Knowledge Graph, Evidence Graph, 50-attribute bilingual
  vocabulary, controllable-versus-external gap analysis
- **Prompts** — 12 vertical configurations, natively bilingual prompt generation, prompt
  scoring, Recommendation Territories
- **Measurement** — deterministic response evaluation with evidence quotes, Hebrew/English
  entity matching, competitor discovery, hallucination monitor, citation gap analysis
- **Scoring** — pure, versioned AIRS with Wilson-bounded rate components
- **Optimization** — constraint engine, quality gates, diagnosis, action planning,
  experiment engine with control-group adjustment
- **Website** — `WebsiteConnector` seam, WordPress REST connector, versioned changes with
  exact rollback
- **Billing** — plans, `PaymentProvider` seam, subscription state machine, quota
  enforcement, contribution-margin reporting
- **Integrations** — Google Business Profile, encrypted tokens, read-only by default
- **Agent** — bounded runtime, strict tool schemas, four-stage gate chain, full audit trail
- **Jobs** — queue abstraction with dedupe, capped backoff and cancellation
- **Apps** — Next.js dashboard, worker process, CLI pipeline and acceptance run

### Fixed during development

Bugs the tests caught, each of which would have shipped silently:

- Six tables shared a hard-coded `created_at` column name across distinct timestamp fields,
  which made `business_facts` un-insertable
- A missing canonical link resolved to the page's own URL, hiding a real finding
- Own-site detection compared registrable domains, so two customers on the same hosting
  platform would each have classified the other's pages as their own controllable content
- Discarding an HTTP response body raised an unhandled abort that could take down a worker
- Version history ordered by millisecond timestamps, which is arbitrary within one agent run
- `CREATE_PAGE` was wired to a content edit, so creating a page failed with NOT_FOUND
- Hebrew prompts contained untranslated English city and cuisine names
- The diagnosis mixed per-question and per-execution counts, reporting "8 of the 72
  questions" against a 24-question set

### Known limitations

- Real provider adapters typecheck against the current SDKs but have not been exercised
  against live endpoints
- Shopify, Webflow and Wix connectors declare their capabilities but are not implemented;
  they fail explicitly rather than silently
- Authentication is schema-ready but the sign-in flow is not built
- The dashboard reads from the pipeline rather than the database
