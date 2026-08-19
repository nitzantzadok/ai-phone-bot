# RUNBOOK

## Before go-live

- [ ] Real provider keys configured; live-API smoke test run against each of the three
      engines (the adapters are written against the current SDKs but have not been exercised
      against live endpoints)
- [ ] Price table verified against each provider's current pricing; `PRICING_VERSION` bumped
- [ ] Payment provider selected, adapter implemented, refund and chargeback rehearsed
- [ ] VAT rate confirmed with an accountant against the Israel Tax Authority
- [ ] Privacy checklist reviewed by Israeli counsel (`PRIVACY.md`)
- [ ] Penetration test focused on the crawler and the OAuth flow
- [ ] Backup restore rehearsed
- [ ] Alerting wired: budget breaches, provider outages, failed jobs, queue depth

## Daily

Check the admin dashboard: queue depth, failed jobs, provider health, tenants flagged for
cost-to-revenue ratio.

## Incidents

### A provider is down

The circuit breaker opens and routing falls back to the other providers. Measurement quality
degrades (fewer engines) but the product keeps working. Action: confirm the breaker is open
rather than the calls hanging, and check whether the fallback tier is holding margin.

### A tenant's cost has spiked

`api_cost_records` grouped by organization shows where. Their monthly spend cap will already
have stopped further work; the flag on their contribution margin explains why. Decide between
a plan upgrade and a conversation.

### The agent made a bad change

Every change is versioned with before, after and an undo handle. Roll back from the change
history — the rollback is itself versioned and audited. Then look at which gate should have
caught it, and add the case to the quality-gate tests.

### Jobs are failing repeatedly

`jobs` table, filter `status = 'FAILED'`. A `BUDGET_EXCEEDED` status is *not* a failure to
retry: it means the ceiling worked. Retryable failures back off automatically and give up
after the attempt cap.

### A customer disputes a score

Every AIRS row stores its formula version, every input, the prompt set, the engines, the
locations and the window. The number is reproducible. If the prompt set or formula changed,
`compareScores` will already have refused to report a delta.

## Restore rehearsal (quarterly)

1. Provision a scratch database
2. Restore the most recent dump into it
3. Run the migration runner — it must report no pending migrations
4. Run the tenant-isolation suite against the restored data
5. Record the wall-clock time; that is the real RTO

Do not skip step 5. An untimed restore is an unknown RTO.

## Retention

`retention.purge` runs on a schedule and enforces `RETENTION_DAYS`. It is a tracked job
rather than a cron script so its runs are auditable, and so a purge that deletes more than
expected is visible after the fact.
