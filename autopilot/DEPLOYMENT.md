# DEPLOYMENT

## Shape

A modular monolith plus a worker. Managed Postgres, managed Redis, a container platform.
No Kubernetes: at this stage speed and low operational cost dominate, and the module
boundaries already provide the seam if a component ever needs to become a service.

```
   [ web ]  Next.js — dashboard, API routes, webhooks     (serverless or container)
   [worker]  job processor                                (long-running container)
       |
   [ Postgres ]  managed, PITR enabled
   [  Redis   ]  managed, persistence enabled
```

## Environments

| Environment | Providers | Database | Notes |
|---|---|---|---|
| local | simulated | PGlite or Docker | Zero cost, zero setup |
| ci | simulated | PGlite | No network, no keys |
| staging | real, low budgets | managed | Rehearse migrations here |
| production | real | managed, PITR | Env validator refuses unsafe config |

## Deploy sequence

1. `pnpm test && pnpm typecheck && pnpm lint`
2. `pnpm --filter @autopilot/web run build`
3. `pnpm db:migrate` against the target database — an explicit, observable step, never an
   application startup hook
4. Deploy the worker first, then the web app. The worker tolerates a schema newer than its
   code far better than the reverse.
5. Smoke test: sign-in, a free scan, the dashboard, one webhook

## Configuration

Parsed and validated once at startup. In production the validator **refuses to start**
without `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY` and `SESSION_SECRET`, and refuses
`CRAWLER_ALLOW_PRIVATE_HOSTS=true` or `USE_MOCK_PROVIDERS=true`.

Failing at boot is deliberate. A production deploy missing an encryption key would otherwise
silently store OAuth refresh tokens it cannot protect.

## Scale

Designed for 1,000 businesses without redesign; 10,000 with horizontal worker scaling.

The load is dominated by `prompt_executions`, which is why UUIDv7 keys, per-execution
deduplication and the caching layer exist. The first things to watch as volume grows:
queue depth, provider p95 latency, and cost per successful optimization.

## Backups

Managed Postgres PITR, plus a daily logical dump to separate storage. **A backup nobody has
restored is a hope, not a backup** — see `RUNBOOK.md` for the quarterly restore rehearsal.

## Cost at low volume

Managed Postgres, managed Redis, a container platform and a serverless web tier come to
roughly the price of one customer's subscription. AI and search are the variable cost and
are governed per tenant by the metering layer, which is why the plan spend caps exist.
