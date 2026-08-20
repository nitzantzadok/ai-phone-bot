# AI PROVIDERS

## The seam

Business logic imports `@autopilot/providers` and nothing else. No domain package may import
`openai`, `@google/genai` or `@anthropic-ai/sdk` directly. That rule is what lets a provider
be replaced, or a new one added, without touching the optimization engine.

Adding a provider means implementing one interface. It never requires a change anywhere else.

## Measurement legitimacy

Consumer chat interfaces are **never** scraped or automated. Measurement uses official APIs
and official grounding features only:

| Provider | Grounding | Notes |
|---|---|---|
| Anthropic | `web_search` server tool (dated version pinned) | Citations arrive as `web_search_result_location` blocks — the richest provenance for the evidence graph |
| OpenAI | Responses API `web_search` tool | URL citations as `url_citation` annotations |
| Gemini | `googleSearch` grounding | Exposes both the search queries issued and the grounded chunks |

Tool versions are **pinned deliberately**. A silent upgrade would change measurement
behaviour mid-experiment and invalidate before/after comparisons.

## Provenance

Every stored observation carries an explicit `sourceType`: `OBSERVED_API`,
`SEARCH_EVIDENCE`, `INFERRED`, `HISTORICAL`, `OWN_PROPERTY`, `THIRD_PARTY`,
`CUSTOMER_PROVIDED`, `SYNTHETIC`.

The provider *states* it; nothing downstream infers it. `SYNTHETIC` can never be displayed
as a real engine observation.

## Model routing

Gross margin is decided here more than anywhere else in the product.

| Task | Tier | Rationale |
|---|---|---|
| `CLASSIFY`, `EXTRACT` | CHEAP | A frontier model adds nothing to a fixed-label task |
| `ANALYZE`, `GENERATE_CONTENT` | STANDARD | |
| `STRATEGY`, `PUBLISH_CHECK` | STRONG | |
| `MEASURE` | SEARCH | The visibility query itself |

When the budget runs low, routing degrades quality rather than failing — **except**
`PUBLISH_CHECK`, which fails closed. The cost of a bad publish is measured in customer
trust, not agorot.

## Cost control

- Every call records a cost record before the result returns to the caller, including failed
  calls — a failed expensive call is still visible in the margin numbers.
- Budgets are checked **before** the network call, so an over-budget tenant costs nothing.
- Prices live in a versioned table (`PRICING_VERSION`), not in call sites, so historical cost
  records stay reproducible after a provider changes rates.
- **Verify the price table against each provider's current pricing before production.** An
  out-of-date table under-reports gross margin, which is the one number this business cannot
  afford to be wrong about.

## Resilience

Timeout, capped and jittered retry, and a circuit breaker per provider, all in
`BaseProvider` so an adapter is only responsible for translating one vendor's SDK. Retries
are always capped and always jittered: a synchronised retry storm across workers turns a
provider blip into an outage plus a bill.

Vendor errors are normalised into our taxonomy; raw provider messages stay in `details` for
operators and never reach a customer.

## Simulation

`MockAIProvider` makes the entire product runnable with no keys and no spend — a hard
requirement, because a development loop that costs money is one people avoid running.

It simulates a *world*, not a canned string: businesses have attributes with evidence
strengths, a query is scored against them, and the answer ranks the winners. Because the
world is derived from what each business's web presence says, an optimization that genuinely
strengthens the evidence changes the simulated answer. That is what makes the acceptance
test meaningful rather than theatre.

Structured calls require a registered responder keyed by schema name. Without one the mock
**throws** rather than inventing data, and the responder's output is validated through the
caller's own Zod schema — a mock that returns a shape the real provider could not is worse
than no mock at all.
