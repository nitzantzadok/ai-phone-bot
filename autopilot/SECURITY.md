# SECURITY

## Threat model

Two properties define the exposure. The crawler fetches URLs supplied by anyone who can
sign up, from inside our infrastructure. And the agent holds write credentials to customer
websites and Google profiles. Everything below follows from those two facts.

## SSRF (`packages/crawler/src/ssrf.ts`)

The crawler occupies a network position no outsider has. Without these controls it is a
proxy into our own infrastructure.

1. **Scheme and shape** — `http`/`https` only, port allowlist, no embedded credentials.
2. **Every DNS answer checked** — not just the first. A hostname resolving to one public and
   one private address is a rebinding setup and is refused.
3. **Connection pinning** — the validated IP is pinned via a custom `lookup`, so the OS
   cannot re-resolve to a different address between check and connect.
4. **Per-hop redirect re-validation** — "public host 302s to 127.0.0.1" is the most common
   bypass and dies at every hop.
5. **Resource caps** — streamed byte cap (a 10GB response is aborted, never buffered), total
   time cap, content-type allowlist.

Blocked: loopback, all RFC1918, link-local (covering `169.254.169.254` and every cloud
metadata endpoint), CGNAT (covering Alibaba's `100.100.100.200`), TEST-NETs, multicast,
reserved, IPv6 ULA/link-local/multicast, IPv4-mapped and 6to4 addresses wrapping any of the
above, and internal-only TLDs.

`CRAWLER_ALLOW_PRIVATE_HOSTS` exists for local fixture tests and is **refused in
production** by the env validator.

63 tests cover this file. Treat a change to it as a security change.

## Secrets

- OAuth refresh tokens: AES-256-GCM envelope encryption, key version bound into the AAD so
  a downgraded key cannot be replayed, retained old versions so rotation needs no migration.
- **No access token is ever persisted.** There is no column for one.
- The logger redacts by key pattern *and* by value shape (OpenAI/Anthropic/Google keys,
  Google OAuth tokens, JWTs), because relying on developers to remember has a 100%
  historical failure rate. Tested.
- Provider error text never reaches a customer. `AppError.publicMessage` is the only field
  any surface may render.

## Multi-tenancy

Three enforced layers, described in ARCHITECTURE.md §8. The isolation suite includes a
generic sweep asserting that every tenant-owned table has a non-null, indexed, foreign-keyed
`organization_id`, so a table added later without one fails the build rather than leaking in
production.

## Agent containment

The tool surface *is* the permission model: no shell tool, no arbitrary HTTP tool, no delete
tool. The registry refuses to hold a tool absent from the side-effect classification, which
prevents a capable tool being added later and silently treated as a read.

A model that is confused — or manipulated by content it read on a website it crawled — still
cannot publish anything the gate chain refuses, because the gates are ordinary code the
model never sees.

## Web

CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy` and
`Permissions-Policy` set at the framework level. Parameterised queries only (Drizzle).
Webhook signatures verified in constant time; an unverifiable webhook is treated as an
attack, not as a malformed request.

## Before go-live

- [ ] Rotate every placeholder secret; confirm none reached git history
- [ ] Independent penetration test focused on the crawler and the OAuth flow
- [ ] Confirm `CRAWLER_ALLOW_PRIVATE_HOSTS=false` and `USE_MOCK_PROVIDERS=false`
- [ ] Rate limiting at the edge as well as in the application
- [ ] Admin impersonation audit-logged and alerting
- [ ] Backup restore rehearsed (see RUNBOOK.md) — a backup nobody has restored is a hope
