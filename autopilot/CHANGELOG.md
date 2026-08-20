# CHANGELOG

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
