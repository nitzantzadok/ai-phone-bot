# Scanning a real business

```bash
pnpm scan https://example.co.il
```

That is the whole setup. No database, no Redis, no account, no API key. The command
fetches the site over the network, reads what is written on it, and prints a report in
Hebrew (`--lang en` for English).

## What is real, and what is not

A scan has two halves, and they have very different requirements.

**The site half runs with nothing configured.** The crawler fetches the pages, the parser
reads the HTML and JSON-LD, the knowledge graph extracts facts, the audit finds technical
problems, and the insight engine turns all of it into a prioritized list. Every number in
that half came from the site during that run, and every finding points at a URL you can
open.

**The AI half requires a provider key.** Measuring whether an assistant names a business
means asking a real assistant. Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or
`GEMINI_API_KEY` and the scan asks the generated questions for real, reads the answers,
and reports the recommendation rate, the competitors named, the AIRS score and what it
cost.

A failed run is not a measurement either. If every call fails — a bad key, an exhausted
quota, a network fault — the report says **NOT MEASURED** with the provider's reason,
rather than publishing "recommended in 0% of questions" and an AIRS score computed from no
observations. Those two states produce identical numbers, and only one of them is true.

Without a key, that half of the report says **NOT MEASURED** and gives the reason. It is
never simulated, never estimated, and never folded into a score that would then look like
a measurement. The invariant is enforced in the type: an unmeasured scan has
`aiVisibility: null`, and there is no code path that fills it from anything but real
provider responses. `USE_MOCK_PROVIDERS` is refused for the same reason — the simulator
exists for development, not for reports.

## The two scores, and why they are separate

| | Site readiness | AIRS |
|---|---|---|
| Version | `readiness-v1` | `airs-v1` |
| Needs a key | no | yes |
| Measures | whether an AI can find, read and correctly describe you | whether AI assistants actually recommend you |
| Built from | technical discoverability, information completeness, attribute coverage | real answers to real questions |

Readiness is not a prediction that you will be recommended. Nothing computed from a
website alone can honestly claim that, so the report says so wherever the number appears.

## Options

```
pnpm scan <url> [options]

  --lang he|en        Report language (default: he)
  --json              Full report as JSON
  --pages N           Maximum pages to crawl (default: 25)
  --prompts N         Maximum questions to generate (default: 40)
  --vertical ID       Override the detected business type
  --city NAME         Override the city read from the site
  --no-ai             Skip the AI half even if a key is configured
  --allow-private     Permit 127.0.0.1 targets (local testing only)
  --verbose           Log crawl progress to stderr as JSON
```

Keys are read from `autopilot/.env` (gitignored) or from the environment. Prefer the file:
a key passed on the command line ends up in your shell history and in the process list.

Relevant environment variables:

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Enables the AI half |
| `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` | Point a provider at a gateway or regional endpoint |
| `HTTPS_PROXY` / `NO_PROXY` | Egress proxy for the crawler (see below) |
| `CRAWLER_MAX_PAGES`, `CRAWLER_TIMEOUT_MS`, `CRAWLER_USER_AGENT` | Crawl bounds |
| `USE_MOCK_PROVIDERS` | Development simulator. Refused by the scan. |

## Try it without a website

```bash
pnpm --filter @autopilot/cli run demo:scan          # a site as most of them are
pnpm --filter @autopilot/cli run demo:scan after    # the same business, written down
```

Two versions of one dental clinic in Petah Tikva, served over a real HTTP server on
localhost. The business is identical; only what is written down differs. The first scores
4/100 and yields no name, no city and no answerable questions. The second scores 61/100,
yields the full identity and 22 real questions. That difference is the product's entire
thesis, and it is the thing the integration tests assert.

## Networks that require a proxy

The crawler pins each connection to the IP address it validated, which is what closes the
DNS-rebinding window between the SSRF check and the socket connect. When `HTTPS_PROXY` is
set, the proxy opens the socket instead and that pin is necessarily given up — the URL is
still fully validated first, and an operator who put an egress proxy in the path has
substituted their own policy boundary for ours. The proxy in use is logged on every hop so
the trade is visible rather than silent.

## What a scan will not do

- It will not fetch anything `robots.txt` excludes. A site that excludes us is reported as
  excluding us, which is usually the single most valuable finding a scan can produce.
- It will not invent a city, a name, or an attribute the site does not state. Where a fact
  is missing, the report says it is missing — that absence is the finding.
- It will not generate a question it cannot ask honestly. No city means no local question,
  and an English question naming the city in Hebrew is a question nobody types, so it is
  not generated either.
- It will not report a contradiction that is only a formatting difference. `+972-3-555-0123`
  and `03-555-0123` are one phone number.
