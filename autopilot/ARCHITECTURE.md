# ARCHITECTURE — AI Recommendation Autopilot

> Status: living document. Version 0.1 (initial vertical slice).
> Every decision below is intentional; the "Why" lines exist so a future maintainer can
> reverse a decision knowingly rather than accidentally.

---

## 1. What the system is

An autonomous SaaS that continuously increases the probability that a local business is
recommended by AI answer engines (ChatGPT / Gemini / Claude and similar) for real
customer-intent queries.

The product is **not** a dashboard and **not** an AI content generator. It is a closed
control loop:

```
USER INTENT → PROMPT → AI ANSWER → RECOMMENDATION → SOURCE → BUSINESS EVIDENCE
   → COMPETITOR GAP → CONTROLLABLE GAP → OPTIMIZATION → EXPERIMENT → MEASUREMENT
   → LEARNING → NEXT OPTIMIZATION
```

Operationally: **OBSERVE → DIAGNOSE → PRIORITIZE → CHANGE → VALIDATE → MEASURE → LEARN → REPEAT.**

### 1.1 What we promise

"Maximize your probability of being recommended by AI for relevant customer intents."

We never promise placement in any external AI system. `AIRS` (§6) is defined as an
*observed* measurement over a *declared* monitored prompt set and observation window.
Every surface that renders AIRS also renders that qualifier (`packages/scoring` returns
`disclosure` alongside every score so the UI cannot forget).

### 1.2 Control taxonomy — a first-class concept

Every fact, gap and action carries a `controllability` classification:

| Class | Meaning | Examples |
|---|---|---|
| `CONTROLLED` | We can change it directly | site content, metadata, schema, sitemap, canonicals, internal links, connected-profile fields |
| `INFLUENCEABLE` | We can affect the inputs, not the outcome | entity recognition, retrieval behaviour, GBP visibility |
| `NOT_CONTROLLED` | Outside the product entirely | third-party editorial, reviews, competitor activity, an engine's exact output |

The agent may only *act* on `CONTROLLED` items. `INFLUENCEABLE` produces recommendations.
`NOT_CONTROLLED` gaps are surfaced honestly and labelled `EXTERNAL AUTHORITY GAP` — the
product never pretends it can manufacture independent reputation.

---

## 2. Repository layout

The repository already contained an unrelated, working product (an Israeli AI phone-bot
SaaS, CommonJS/Express/Mongoose, at the repo root). It is left untouched. The new product
lives in a self-contained pnpm monorepo under `autopilot/`.

```
autopilot/
  apps/
    web/           Next.js 16 App Router — customer dashboard, admin, API routes
    worker/        Job worker process (BullMQ in prod, in-process in dev/test)
    cli/           Operational CLI + the end-to-end acceptance run
  packages/
    shared/        Typed env, CountryConfig, money/VAT, errors, logger, ids, feature flags
    database/      Drizzle schema (PostgreSQL), migrations, tenant-scoped repositories
    providers/     AIProvider abstraction, ModelRouter, cost ledger, mock + real adapters
    crawler/       SSRF-hardened fetch, robots, sitemap, HTML/JSON-LD parsing, snapshots
    knowledge/     Business Knowledge Graph + Evidence Graph, fact confidence & freshness
    prompts/       Intent taxonomy, vertical configs, prompt universe generation & scoring
    measurement/   Prompt execution, response evaluation, citations, hallucination monitor
    scoring/       Versioned AIRS formula, recommendation shares, competitor benchmark
    optimization/  Diagnosis, evidence-gap analysis, opportunity scoring, quality gates
    website/       WebsiteConnector abstraction, change versioning, rollback
    billing/       PaymentProvider abstraction, plans, VAT, usage metering, budgets
    integrations/  Google Business Profile connector (OAuth) + mock
    agent/         Bounded agent runtime, strict tool schemas, memory, audit trail
    jobs/          Queue abstraction + job definitions
```

**Why a modular monolith + worker, not microservices:** speed of development and low
operational cost dominate at this stage (§117 of the brief). Module boundaries are enforced
by package boundaries and by the rule that *business logic never imports a provider SDK
directly*. If a module ever needs to become a service, it already has a seam.

**Why no build step for internal packages:** each package's `exports` map points at
TypeScript source. `tsx` (worker/CLI), `vitest` and Next.js `transpilePackages` all consume
TS directly. One less pipeline to break; `tsc --noEmit` still typechecks the whole graph.

---

## 3. Technology decisions

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 7 (strict, `noUncheckedIndexedAccess`) | one language across web/worker/CLI; the type system is load-bearing for the provider and connector abstractions |
| Frontend | Next.js 16 App Router + React 19 | server components keep the dashboard fast while heavy work stays in the queue; native i18n/RTL routing |
| Backend | Node 22, Next route handlers + worker process | no separate API service to operate at MVP scale |
| Database | PostgreSQL | relational integrity for the evidence graph, JSONB where shape is genuinely open, mature managed hosting everywhere |
| ORM | Drizzle | SQL-shaped, no codegen daemon, runs against PGlite in tests |
| Queue | BullMQ + Redis, behind a `JobQueue` interface | in-process implementation makes dev and CI free of infrastructure |
| Validation | Zod 4 | one schema source for env, API input, agent tool arguments, and structured LLM output |
| Tests | Vitest + PGlite (real Postgres in WASM) | database tests with no Docker, no shared fixtures, no port conflicts |
| Styling | Tailwind 4 | logical properties make RTL a configuration, not a rewrite |
| Observability | pino structured logs + OpenTelemetry-shaped span helpers + Sentry hook | cheap now, standard later |

---

## 4. Data flow

### 4.1 Onboarding (target: first value < 10 minutes, first signal < 2 minutes)

```
POST /api/onboarding { websiteUrl }
      │
      ├─ (sync, ~seconds)   safeFetch(root) → basic technical audit → provisional entity
      │                      ⇢ UI shows something immediately
      │
      └─ enqueue business.scan
            crawl.website        → website_crawls, website_pages, website_snapshots
            knowledge.build      → business_entities, business_facts, fact_sources
            prompts.generate     → prompt_sets, prompts        (he + en)
            measurement.run      → prompt_executions, ai_responses, ai_recommendations, citations
            competitors.analyze  → competitors, competitor_facts
            scoring.calculate    → airs_scores  (formula version pinned)
            optimization.diagnose→ opportunities
            agent.plan           → agent_runs, optimization_jobs
```

Each stage writes its own results and emits a progress event, so the dashboard fills in
progressively rather than blocking on the slowest stage.

### 4.2 The optimization loop (steady state)

```
   ┌──────────── measurement.run (scheduled, per plan cadence) ───────────┐
   │                                                                     │
   ▼                                                                     │
scoring.calculate ──▶ optimization.diagnose ──▶ opportunity ranking       │
                                                     │                   │
                                                     ▼                   │
                                          agent.run (bounded)            │
                                                     │                   │
                             ┌───────────────────────┼──────────────┐    │
                             ▼                       ▼              ▼    │
                       LOW risk: apply       MEDIUM: approval   HIGH: approval
                             │                       │              │    │
                             └────────► website.apply (versioned) ◄─┘    │
                                                     │                   │
                                          experiment created             │
                                                     │                   │
                                        observation window elapses       │
                                                     │                   │
                                        measurement.retest ──────────────┘
                                                     │
                                         experiment.evaluate → learning
```

---

## 5. Domain model (summary; full detail in DATABASE.md)

Six clusters:

1. **Tenancy** — `organizations`, `users`, `memberships`, `businesses`, `business_locations`.
   Every tenant-owned row carries `organization_id`. Repositories are constructed from a
   `TenantContext` and physically cannot emit a query without the tenant predicate (§8).
2. **Knowledge** — `business_entities`, `business_facts`, `fact_sources`, `sources`.
   A fact is never a bare value: it is `(value, source, sourceType, confidence,
   discoveredAt, lastVerifiedAt, validFrom, validUntil, status)`.
3. **Demand** — `prompt_sets`, `prompts`, intents, verticals.
4. **Observation** — `prompt_executions`, `ai_responses`, `ai_recommendations`,
   `citations`, `competitors`, `competitor_facts`, `hallucinations`.
5. **Action** — `opportunities`, `optimization_jobs`, `optimization_actions`,
   `content_versions`, `experiments`, `agent_runs`, `agent_steps`.
6. **Commerce & ops** — `plans`, `subscriptions`, `invoices`, `usage_records`,
   `api_cost_records`, `budgets`, `audit_logs`, `notifications`, `feature_flags`.

### 5.1 The Evidence Graph

The core proprietary structure. It links:

```
Business ──has──▶ Fact ──supported_by──▶ Source
   │                │
   │                └──evidences──▶ Attribute ◀──requires── Prompt(intent)
   │                                     ▲
Competitor ──has──▶ Fact ──evidences─────┘
```

This is what lets the system say something specific and true:

> "37 monitored prompts carry the *romantic / date-night* intent. You are recommended in
> 4% of them; Competitor A in 31%. Your site never states the attribute your own confirmed
> business data supports. That gap is CONTROLLED."

Physically it is `business_facts` + `fact_sources` + `attributes` + `prompt_attributes`
with real foreign keys — not a JSON blob — so the gap query is a join, not an LLM guess.

---

## 6. AIRS — AI Recommendation Score

`packages/scoring` owns a **versioned, pure** function. Formula `v1` weights:

| Component | Weight | Source of truth |
|---|---|---|
| Recommendation Rate | 0.22 | classified responses |
| Top-3 Rate | 0.14 | classified responses |
| First-Choice Rate | 0.10 | classified responses |
| Mention Rate | 0.08 | classified responses |
| Prompt Coverage | 0.08 | prompt set vs. executed |
| Citation Presence | 0.10 | citations referencing the business |
| Entity Accuracy | 0.10 | hallucination monitor |
| Attribute Match | 0.08 | evidence graph |
| Competitive Share | 0.05 | recommendation share vs. competitor set |
| Information Completeness | 0.03 | knowledge graph completeness |
| Technical Discoverability | 0.02 | crawl audit |

Every calculation persists `formulaVersion`, all `inputs`, `timestamp`, engines, locations,
prompt-set id, result, and `confidence` (which degrades with small samples via a Wilson
lower-bound treatment). **A formula change requires a new version constant** — historical
scores are never recomputed silently. `scoring` has no I/O and no provider imports, so it
is exhaustively unit-testable.

---

## 7. Provider abstraction

```ts
interface AIProvider {
  readonly id: ProviderId
  generate(req): Promise<AIGenerationResult>
  structuredGenerate<T>(req & { schema: ZodType<T> }): Promise<StructuredResult<T>>
  analyze(req): Promise<AnalysisResult>
  evaluate(req): Promise<EvaluationResult>
  search(req): Promise<SearchResult>        // official grounding/web-search only
  getUsage(): ProviderUsage
  healthCheck(): Promise<ProviderHealth>
}
```

Rules enforced by module boundaries:

* Business logic imports `@autopilot/providers`, never `openai` / `@google/genai` /
  `@anthropic-ai/sdk`.
* Every call flows through `ModelRouter`, which selects a tier
  (`CHEAP | STANDARD | STRONG | SEARCH`) from task type, importance, complexity and the
  tenant's remaining budget. Classification must never reach a frontier model; final
  publish checks must never reach a cheap one.
* Every call records a `CostRecord` (provider, model, tenant, job, tokens, estimated and
  actual cost, latency, status) *before* the result is returned to the caller.
* Fallback chains are declared per tier. A provider outage degrades quality, never
  availability.
* Complete mock adapters (`MockOpenAI`, `MockGemini`, `MockAnthropic`) make the entire
  product runnable and deterministically testable with **no API keys and no spend**.

### 7.1 Measurement legitimacy

Consumer chat UIs are never scraped or automated. Measurement uses official APIs and
official grounding/web-search features only. Every stored observation carries an explicit
`sourceType`:

`OBSERVED_API` · `SEARCH_EVIDENCE` · `INFERRED` · `HISTORICAL` · `THIRD_PARTY` · `SYNTHETIC`

`SYNTHETIC` (mock provider output) is structurally prevented from being displayed as a real
engine observation — the UI renders it with a simulation badge and it is excluded from
customer-facing AIRS by default.

---

## 8. Multi-tenancy & authorization

Three enforced layers:

1. **Schema** — every tenant-owned table has `organization_id` with a FK and an index.
2. **Repository** — repositories are only constructible from a `TenantContext`; the tenant
   predicate is applied inside the repository, not by callers. There is no exported
   "unscoped" query helper outside `packages/database/src/admin/`, which is separately
   audited and used only by the admin surface (with audit logging on every read).
3. **Policy** — role checks (`OWNER | ADMIN | EDITOR | VIEWER`) at the route boundary.

`packages/database/test/tenant-isolation.test.ts` asserts that no repository method can
return another tenant's rows, iterating over the repository surface so a newly added method
that forgets the predicate fails the suite.

---

## 9. Crawler & SSRF

`packages/crawler/src/safe-fetch.ts` is the only outbound HTTP path for
customer-supplied URLs. It enforces:

* scheme allowlist (`http`, `https`) — blocks `file:`, `gopher:`, `data:`, etc.
* DNS resolution **before** connect, with every resolved address checked against blocked
  ranges: loopback, private v4/v6, link-local (incl. `169.254.169.254` and the GCP/Azure
  metadata endpoints), CGNAT, multicast, reserved.
* redirect chains re-validated at **every** hop (bounded), closing the
  "public host redirects to 127.0.0.1" hole.
* response size cap, total time cap, content-type allowlist.
* per-host rate limiting and `robots.txt` compliance with a declared user agent.

DNS-rebinding is mitigated by pinning the validated IP for the connection rather than
re-resolving. Tests cover each class of blocked target.

---

## 10. The autonomous agent

`packages/agent` is a bounded tool-using runtime, not a free-form loop.

**Budget envelope** (all hard-enforced, checked before *and* after each step):
max iterations, max spend (₪/$), max tokens, max tool calls, max wall-clock, max publish
operations.

**Tools** are Zod-schema'd, side-effect-classified, and permission-gated:
`crawlWebsite`, `inspectPage`, `analyzeBusiness`, `generatePrompts`, `runAIQuery`,
`analyzeAIResponse`, `analyzeCompetitor`, `inspectSchema`, `generateSchema`, `modifyPage`,
`createDraft`, `publishPage`, `rollbackChange`, `updateBusinessProfile`, `calculateAIRS`,
`createExperiment`, `evaluateExperiment`. There is no shell tool, no arbitrary HTTP tool,
and no tool that deletes customer content without an explicit HIGH-risk approval.

**Autonomy modes:** `MONITOR` (read-only) → `RECOMMEND` → `AUTO_SAFE` (LOW risk auto) →
`AUTOPILOT` (LOW+MEDIUM per settings). New tenants start at `RECOMMEND`.

**Risk tiers:** LOW auto-publishes; MEDIUM needs approval unless the tenant opted in; HIGH
always needs explicit approval and can never be auto-approved by any setting.

**Constraint engine:** tenant `BusinessRules` (`DO_NOT_CLAIM`, `ALWAYS_MENTION`,
`DO_NOT_CREATE`, `APPROVAL_REQUIRED`, `TARGET_AUDIENCE`, `TARGET_LANGUAGE`) are evaluated
as a hard gate on every proposed action, before quality gates.

**Quality gates** before any publish: factual grounding in the knowledge graph (every
claim traced to a fact with ≥ MEDIUM confidence), language/locale check, duplicate-content
check, structured-data validity, link validity, sensitive-claim detection (stricter for
medical/legal/financial verticals), and unsupported-superlative detection. Below threshold
⇒ never publish; route to approval.

Every run persists `agent_runs` + `agent_steps`: inputs, each tool call and result, each
decision with its reason, spend, and final state. Nothing the agent does is unexplainable
after the fact.

---

## 11. Website automation & rollback

`WebsiteConnector` is an interface (`readSite`, `getPage`, `createDraft`, `updatePage`,
`updateMetadata`, `updateSchema`, `publish`, `rollback`, `capabilities`). Implementations:
generic read-only crawl (always available), WordPress REST, and a snapshot-backed mock for
tests; Shopify/Webflow/Wix are declared in the interface's capability matrix and stubbed
with explicit `NotImplemented` rather than silently failing.

Every write produces a `content_versions` row: before blob, after blob, unified diff,
reason, agent run id, hypothesis, publish status. Rollback restores the exact previous
version and is itself a versioned, audited operation.

---

## 12. Billing

`PaymentProvider` interface (`createCustomer`, `createSubscription`, `cancel`, `pause`,
`resume`, `refund`, `handleWebhook`, `getInvoice`). MVP ships a fully functional
`MockPaymentProvider` plus the adapter seam; the production provider is selected at
integration time — deliberately *not* baked into business logic.

Money is integer minor units (agorot) with an explicit currency; never floats. VAT is
**versioned by effective date** in `CountryConfig`, never a constant in business logic.
Every amount is a `(net, vat, gross)` triple, and revenue reporting uses **net** unless a
surface explicitly opts into gross.

---

## 13. Cost control (a feature, not an afterthought)

Layers, in order of cheapness:

1. **Rules and cached data first.** The agent's diagnosis pass runs entirely on stored
   evidence before any model call.
2. **Deterministic dedupe & caching** with TTL + source + version + invalidation rules:
   crawl results, prompt results, search results, competitor profiles.
3. **Model routing** (§7).
4. **Quotas** per tenant / plan / day / hour, with burst protection.
5. **Budget enforcement**: every job declares a spend ceiling; the ledger blocks the call
   that would exceed it and the job ends `BUDGET_EXCEEDED` — never silently overspends.
6. **Circuit breakers + capped exponential backoff** per provider.
7. **Admin alerting** on cost-to-revenue ratio per tenant, with plan-terms throttling.

No autonomous loop exists without max iterations, max spend, max calls, max time and
explicit stopping conditions.

---

## 14. Security

OAuth for third-party accounts (never passwords). Refresh tokens encrypted at rest with
AES-256-GCM via a versioned key from secrets management; tokens never logged, and the
logger carries a redaction list covering tokens, secrets, cookies and payment data.
CSRF tokens on mutating routes, strict security headers, signed/verified webhooks with
replay protection, rate limiting, parameterized queries only, and audit logs for every
privileged action including admin impersonation. Details in SECURITY.md.

---

## 15. Observability

Structured pino logs with tenant/job/run correlation ids; counters and histograms for
queue depth, job duration, provider latency, provider errors, retries, cost per job, cost
per tenant, cost per successful optimization; Sentry for exceptions. The admin dashboard
reads these, so operational health and unit economics are the same screen.

---

## 16. Deployment

Managed platform + managed PostgreSQL + managed Redis. Web on a serverless/container
platform, worker as a long-running container. Local development is `docker compose up`
(Postgres + Redis) or nothing at all (PGlite + in-process queue + mock providers).
No Kubernetes. See DEPLOYMENT.md.

---

## 17. Explicit non-goals

Scraping or automating consumer chat UIs · fake reviews, citations, awards or testimonials ·
prompt-injection or hidden text aimed at answer engines · doorway pages or mass thin
content · guaranteed-ranking claims · a custom payment processor · Kubernetes ·
custom ML on day one (heuristics + experiments first; models when the dataset earns them).

---

## 18. The moat

Not the content generator. The **Recommendation Intelligence Dataset**: prompts, intents,
observed recommendations, entities, attributes, sources, competitor states, interventions
and *experiment outcomes*, all schema'd from day one so that the eventual question —
*"for this category + prompt class + geography + attribute, which interventions actually
move recommendation probability?"* — is a query against data we already own.
