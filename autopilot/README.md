# AI Recommendation Autopilot

An autonomous system that continuously discovers where a local business is losing AI
recommendations, identifies the highest-value **controllable** causes, fixes them, measures
the outcome, and learns from the result.

Israel-first: Hebrew and English throughout, RTL, ILS with versioned VAT, Asia/Jerusalem.

> **What this product promises.** It maximises the probability of being recommended by AI
> for relevant customer intents. It does **not** control OpenAI, Google or Anthropic, and it
> never claims to. Every score is an observed measurement over a declared prompt set,
> engines and window — a qualifier the code carries alongside the number so no surface can
> drop it.

---

## Run it right now

No API keys. No database. No Docker. Zero cost.

### Scan a real website

```bash
cd autopilot
pnpm install
pnpm scan https://example.co.il
```

A live crawl of that site, the facts it actually states, the technical problems it
actually has, a versioned readiness score and a prioritized list of what to do — in Hebrew
by default. With `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` set, the scan
also asks real assistants the generated questions and reports whether the business was
named. Without a key that half says NOT MEASURED and why; it is never simulated. See
`SCANNING.md`.

### Watch the whole loop, against a fixture

```bash
pnpm demo
```

That runs the complete loop against a fixture business — Rosa, an Italian restaurant in Tel
Aviv — and prints what a customer would see:

```
crawl → knowledge graph → prompt universe → AI measurement → competitors → AIRS
      → diagnosis → autonomous changes → re-measurement → new AIRS
```

Every AI observation in that run is **simulated and labelled SYNTHETIC**. The simulation is
not a canned script: businesses have attributes with evidence strengths derived from what
their web presence actually says, so when the agent strengthens Rosa's site, the simulated
engines genuinely see something different and the score moves for a real reason.

```bash
pnpm test        # 657 tests, no infrastructure required
pnpm typecheck
pnpm lint
pnpm web         # dashboard at http://localhost:3000
pnpm worker
```

With Postgres and Redis (optional):

```bash
docker compose up -d
pnpm db:migrate
```

---

## What is here

| Package | Responsibility |
|---|---|
| `shared` | Typed env, versioned `CountryConfig` (Israeli VAT by effective date), integer-minor-unit money, redacting logger, AES-256-GCM envelope encryption, bounded retry / circuit breaker, Wilson intervals |
| `database` | 50-table Drizzle schema, tenant-scoped repositories, PGlite test harness |
| `providers` | `AIProvider` seam, real OpenAI / Gemini / Anthropic adapters using official grounding, deterministic simulator, versioned price table, cost ledger, model router |
| `crawler` | SSRF-hardened fetch, robots.txt, HTML/JSON-LD parsing, technical audit, crawl diffing |
| `knowledge` | Business Knowledge Graph, Evidence Graph, 50-attribute bilingual vocabulary, gap analysis |
| `prompts` | 12 vertical configurations, bilingual prompt generation, prompt scoring, Recommendation Territories |
| `measurement` | Prompt execution, rule-based response evaluation, citation analysis, hallucination monitor |
| `scoring` | Pure, versioned AIRS |
| `optimization` | Constraint engine, quality gates, diagnosis, action planning, experiments |
| `website` | `WebsiteConnector` seam, WordPress REST connector, versioned changes with rollback |
| `billing` | Plans, `PaymentProvider` seam, subscription state machine, quotas, unit economics |
| `integrations` | Google Business Profile (OAuth, read-only by default) |
| `agent` | Bounded runtime, strict tool schemas, gate chain, audit trail |
| `jobs` | Queue abstraction, in-process and BullMQ-ready |

Apps: `web` (Next.js dashboard), `worker` (job processor), `cli` (pipeline + acceptance run).

---

## The design decisions worth knowing

**Honesty is enforced in types, not in policy.** Every observation carries a `sourceType`.
Simulated output is `SYNTHETIC` and cannot be presented as a real engine answer. Every AIRS
result carries its own disclosure string. Comparing two scores across different formula
versions or prompt sets returns `comparable: false` rather than a flattering delta.

**The agent decides what, never whether.** Permission is resolved by code the model cannot
influence — controllability, then business rules, then quality gates, then autonomy mode and
risk tier, in that fixed order, on every action. Six independent budget ceilings are checked
before *and* after each step. High-risk changes are never auto-applied in any mode.

**Nothing ungrounded is ever published.** Every factual claim must trace to a fact held at
MEDIUM confidence or better. Superlatives, invented awards, outcome promises in regulated
fields, wrong-language content, near-duplicates and ungrounded schema properties are all
blocked. Failing a gate routes to a human; it never publishes anyway.

**We say what we cannot do.** A competitor's advantage that rests on independent editorial
coverage is labelled an EXTERNAL AUTHORITY GAP, and the product states plainly that it
cannot manufacture reputation on a customer's behalf.

**Cost is a feature.** Rules and cached evidence run before any model call. Tasks route to
model tiers by type — classification never reaches a frontier model, a publish check never
reaches a cheap one. Budgets are checked before the call, so an over-budget tenant costs
nothing. Every plan caps AI spend below 30% of its own revenue.

**Every write is reversible.** A change records before, after, a readable diff and its
reason *before* the connector is touched, so even a failed apply leaves an accountable
record.

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md); see also `SECURITY.md`, `AGENT.md`,
`DATABASE.md`, `BILLING.md`, `PRIVACY.md`, `AI_PROVIDERS.md`, `DEPLOYMENT.md`, `RUNBOOK.md`.

---

## Status

The end-to-end vertical slice works and is covered by an acceptance suite that asserts the
loop actually closes — that the agent's changes move the measurement, because the simulated
engines read the site the agent edited.

Before production, the items in `RUNBOOK.md` under "Before go-live" need doing: real
provider keys and a live-API smoke test, a payment provider selected and adapted, VAT rates
confirmed against the Israel Tax Authority, and the privacy checklist reviewed by Israeli
counsel.
