# BILLING

## Provider strategy

The product does **not** build a payment processor and equally does **not** marry one.
Israeli providers differ substantially from international ones, and the right choice depends
on facts decided at go-live — card mix, invoicing obligations, FX — not at design time.

So billing logic talks to the `PaymentProvider` interface, a fully working mock ships with
the MVP, and integrating a real provider means writing one adapter. Subscription handling,
VAT, dunning and invoicing do not change.

The mock is not a stub: real subscription state, correctly taxed invoices, on-demand payment
failures, signed webhooks. The whole lifecycle is exercisable without a merchant account.

## Money

Integer minor units (agorot) with an explicit currency. Floating point never touches a price,
a VAT amount or a cost record.

Every customer-facing amount is a `(net, vat, gross)` triple. **Revenue reporting uses net.**
VAT is collected on behalf of the tax authority; it is not revenue, and reporting it as such
overstates the business by 18%.

## VAT

Versioned by effective date in `CountryConfig`, never a constant in business logic:

| Period | Rate | From | Until |
|---|---|---|---|
| `IL-VAT-2013` | 17% | 2013-06-02 | 2025-01-01 |
| `IL-VAT-2025` | 18% | 2025-01-01 | current |

Every invoice stores both the rate and the period id, so a 2024 invoice keeps reproducing
17% forever. `resolveVatPeriod` throws rather than guessing for an unmapped date.

**Before go-live:** confirm the current rate against the Israel Tax Authority and add a new
period rather than editing an existing one.

## Plans

Launch tier is **Growth: ₪699/month + VAT** (₪6,990/year + VAT), the price the unit economics
are modelled on. Limits are enforced by the metering layer, not printed on a pricing page:

- monthly allowances per metric
- an hourly burst cap
- an absolute monthly **spend** cap in money

Every paid plan caps AI and search spend below 30% of its own net revenue. The free scan is
capped at ₪3 so it can never run up a real bill.

## Subscription lifecycle

A pure state machine over normalised billing events, so the awkward cases are testable
exhaustively rather than discovered by a customer who lost access they had paid for.

The bias is toward the customer. A failed payment starts a 7-day grace period in which
measurement **continues** but automated writes stop — losing a customer's history because a
card expired on a Friday would be punitive, and editing a website for an account we are not
being paid for would not be right either.

Four failed attempts expires the subscription. A successful payment clears dunning entirely.

## Unit economics

Contribution margin is computed from the same cost records the product already writes for
every external call, so the economics are queryable rather than a spreadsheet exercise.

```
net revenue − (AI + search + infrastructure + payment processing + support)
```

A customer is flagged when AI and search exceed 35% of their net revenue, or when
contribution margin falls below 40%. Portfolio break-even is computed from real contribution,
not from revenue.

**These figures are admin-only and are never rendered to a customer.**

## Before go-live

- [ ] Select the payment provider and implement its adapter
- [ ] Confirm the VAT rate and Israeli tax-invoice requirements with an accountant
- [ ] Verify webhook signatures against the real provider's scheme
- [ ] Rehearse a refund and a chargeback end to end
