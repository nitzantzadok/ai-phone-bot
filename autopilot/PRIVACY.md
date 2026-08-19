# PRIVACY

> This document is engineering configuration, not legal advice. The compliance checklist
> below **requires review by Israeli counsel before launch.**

## Principle

Collect as little personal data as possible. This product is about *businesses*, and almost
everything it stores is public business information. The personal data it holds is limited
to what running an account requires.

## Data classification and retention

| Class | Contents | Retention |
|---|---|---|
| `PUBLIC_BUSINESS_DATA` | Crawled pages, business facts, competitor observations | While the account exists |
| `CUSTOMER_ACCOUNT_DATA` | Name, email, organization | While the account exists |
| `AUTHENTICATION_DATA` | Password hash, MFA secret | While the account exists |
| `OAUTH_TOKEN` | Encrypted Google refresh token | Until revoked or disconnected |
| `AI_OUTPUT` | Raw AI responses | 400 days |
| `ANALYTICS` | Product events | 730 days |
| `BILLING_DATA` | Invoices, payments | 2555 days (7 years, statutory) |
| `LOG_DATA` | Application logs | 90 days |

## Never logged

Access tokens, refresh tokens, payment secrets, passwords, session cookies. Enforced by the
logger's redaction — by key pattern **and** by value shape — and covered by tests, because
relying on developers to remember has a 100% historical failure rate.

## Reviews

Review *metadata* is stored for theme analysis: rating, language, themes, whether the owner
replied. **Reviewer identity is deliberately not stored.** We analyse patterns; we do not
build a profile of a business's customers.

## Subject rights

- **Access / export** — account data and business data exportable on request
- **Deletion** — `deletion_requests` makes erasure a tracked job with an audit trail, not an
  ad-hoc SQL session. Statutory records (invoices) survive, and what was retained and why is
  recorded on the request.
- **Token revocation** — disconnecting Google deletes the encrypted refresh token

## Processors

Every AI provider used for measurement is a processor. Before launch: a register of
processors, their locations, and a data-processing agreement with each.

## Israeli Privacy Protection Law (including Amendment 13) — checklist

Requires review by Israeli counsel. Engineering support exists for each item; the legal
judgement does not.

- [ ] Database registration obligations assessed
- [ ] Privacy notice published, in Hebrew, covering purposes and retention
- [ ] Lawful basis documented for each processing purpose
- [ ] Data Protection Officer appointment assessed against Amendment 13 thresholds
- [ ] Processor agreements executed with each AI and infrastructure provider
- [ ] Cross-border transfer position documented (providers are largely outside Israel)
- [ ] Breach notification procedure written and rehearsed
- [ ] Retention schedule above confirmed as lawful and implemented
- [ ] Subject-rights procedure tested end to end
- [ ] Security measures documented for the registration file

## What the product will not do

Fabricate reviews, generate reviews posing as customers, incentivise undisclosed reviews, or
manipulate ratings. It will analyse reviews the business already has, identify recurring
themes, and — only with explicit opt-in — draft a professional reply that passes the checks
in `packages/integrations`.
