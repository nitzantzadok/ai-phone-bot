# AGENT

## What it is

A bounded tool-using runtime, not a free-form reasoning loop. It works through a ranked list
of diagnosed opportunities, one per iteration, with every ceiling checked around each step.

Bounded iteration over a ranked list is cheaper than open-ended reasoning, far easier to
audit, and for this problem produces the same answers — the hard part is the diagnosis and
the gates, not the planning.

## The governing principle

**The agent decides WHAT to do. It never decides whether it is ALLOWED to.**

Permission is resolved by code the model cannot influence, in a fixed order, on every single
action:

1. **Controllability** — only `CONTROLLED` gaps may be acted on. An external authority gap
   is reported, never actioned.
2. **Business rules** — the customer's boundaries outrank every other signal. "Never say we
   are luxury" is not weighed against expected lift.
3. **Quality gates** — every factual claim must trace to a fact held at MEDIUM confidence or
   better. Below the publish threshold, it goes to a human.
4. **Autonomy mode × risk tier** — even a perfect change needs permission to publish itself.

## Budget envelope

Six ceilings, each checked **before and after** every step. Checking only before lets one
expensive step blow through; checking only after lets it happen at all.

| Limit | Default | Why |
|---|---|---|
| iterations | 25 | One per opportunity considered; planning is deterministic and nearly free |
| tool calls | 60 | Catches a loop that iterations alone would not |
| spend | ₪15 | The ceiling that protects gross margin |
| tokens | 400k | Catches a runaway context |
| wall clock | 10 min | Catches a hung provider |
| publish operations | 12 | An agent making thirty changes at once has misunderstood something |

Hitting a limit is a normal outcome reported as `STOPPED_LIMIT` with the specific reason —
not a failure, and never a partially-applied change.

## Autonomy modes

| Mode | Behaviour |
|---|---|
| `MONITOR` | Read-only. Measures and reports. |
| `RECOMMEND` | Diagnoses and proposes. Default for new tenants. |
| `AUTO_SAFE` | Applies LOW-risk changes automatically. |
| `AUTOPILOT` | Applies LOW and MEDIUM risk per settings. |

**HIGH risk is never auto-applied in any mode.** No setting turns that off. Billing state
clamps the mode independently: a failed payment drops effective autonomy to `RECOMMEND`.

## Tools

Strict Zod schemas, declared side effects, permission-gated. There is no shell tool, no
arbitrary HTTP tool and no delete tool. The registry refuses to hold a tool absent from the
side-effect classification.

Exactly three tools write: `publishPage`, `rollbackChange`, `updateBusinessProfile`.

## Memory

Split three ways so the agent cannot promote its own past output into fact:

- **Short-term** — the current run. Discarded at the end.
- **Long-term** — business facts, each with a source and a confidence. Only MEDIUM+ facts are
  ever shown to the model.
- **Experience** — what experiments have actually shown. Says "we do not know yet" until the
  dataset earns an opinion.

## Audit trail

Every run persists its steps: each tool call with input and result, each decision with its
reason, each gate outcome with why it passed or held, spend, and the stop reason. Nothing the
agent does is unexplainable after the fact — which is the difference between an autonomous
system you can run against a paying customer and one you cannot.
