---
status: accepted
date: 2026-09-08
---

# 0030 Money is an integer count of minor units, and a provider notification is verified inside the adapter, never at the edge

## Context

Decision 0004 settled that payments, refunds, subscriptions, cycles and invoices are our domain entities, that the payment port has exactly two verbs, and that idempotency of provider notifications is ours, keyed by the provider event id. It settled none of what building the first slice of that port actually forces a choice about, and each of the following was a fork with a wrong branch that would have been expensive to reverse once a derived project had taken money through it.

**How an amount is represented.** Every other quantity in this repository is a JavaScript `number` and nothing has cared. `sizeBytes` is validated as a positive integer and that is the end of it. Money is the first quantity where the difference between `0.1 + 0.2` and `0.3` is a number a person is charged.

**Who verifies a provider's signature.** The repository already has an unauthenticated-by-contract route, `/api/cron/dispatch`, whose shared secret is checked in `apps/web/src/api/cron-secret.ts`, in the delivery package. A provider webhook has the same shape at the HTTP layer, and copying that placement was the obvious move.

**What the base ships turned on.** Decision 0026 established that an active optional module in production is a commitment to configure its provider. It did not say which side of that line a payments module starts on.

**What an unrecognised provider event means.** Stripe sends over two hundred event types to an endpoint subscribed broadly. Two of them mean something to this slice.

## Decision

### 1. An amount is an integer count of the currency's own minor unit, and a non-integer is refused at construction

`Money` (`packages/domain/src/billing/money.ts`) carries an `amountMinor` counted in the currency's minor unit — cents for EUR, USD and GBP, whole yen for JPY — and `Money.create` refuses anything that is not a safe integer greater than zero and within the provider's own ceiling. There is no constructor that accepts `12.34`, no helper that multiplies by a hundred, no second unvalidated factory, and no rounding rule anywhere in the domain.

The reason is not fastidiousness about IEEE 754. A decimal amount forces a rounding rule to exist, and a rounding rule that exists in more than one place eventually disagrees with itself: the number shown to the payer, the number sent to the provider and the number stored in our own table are computed by three different pieces of code, and the day they differ by one cent is the day a reconciliation stops balancing and nobody can say which of the three is wrong. Refusing the decimal at the boundary of the domain means the question never arises — there is exactly one number, it is exact, and it survives serialisation, `JSON.parse`, a Postgres round trip and a provider response unchanged.

The minor unit is a property of the currency, not a global constant of two. `Currency` is parsed against a closed table declaring each code's exponent explicitly (`EUR` 2, `USD` 2, `GBP` 2, `JPY` 0), because the exponent is not derivable from the three letters and guessing two for a zero-decimal currency charges a payer a hundred times the intended amount. An unknown code is refused rather than defaulted. A derived project that needs another currency adds it to the table, in the domain, with its exponent.

This also removes arithmetic from the Stripe adapter entirely. Stripe's API takes `unit_amount` as an integer in the currency's smallest unit, which is precisely what `amountMinor` already is, so the adapter passes the number through untouched. There is no conversion in which a rounding rule could hide.

Rejected: a decimal string with a scale, which is correct but turns every operation into a parse and grows an arithmetic library nothing else here needs; a `numeric` Postgres column read back as a string, which pushes the same parse into the row mapper, furthest from the test that would catch a wrong conversion.

### 2. Signature verification lives in the provider adapter, not in `apps/web/src/api`

`interpret` promises to turn a provider notification into a normalised event. A notification whose signature has not been checked is not a notification, it is a string somebody posted. So the check belongs inside the implementation of `interpret`, in `packages/infrastructure/src/stripe/signature.ts`, where the port's contract suite asserts it against the memory implementation and the Stripe one alike, rather than in the delivery ring where only one of the callers would ever run it.

Placing it in `apps/web/src/api` alongside `cron-secret.ts`, which is where it visually belongs, would have made the delivery mechanism the thing that decides whether a payment event is authentic. `apps/worker`, a CLI replaying a stored event, or any second entry point added later would call the same port with the same payload and get an interpreted event back with nothing having checked it, and no gate in this repository would have objected, because a port returning a value is not a rule violation. The hole would be invisible in exactly the way that matters: present in the port, absent from the one code path anybody tested.

`apps/web/src/api/cron-secret.ts` remains the pattern that is copied, not the place the code goes. Both sides are hashed to a fixed length before `timingSafeEqual`, for the reason decision 0028 already recorded: that function throws on a length mismatch, and the length of an attacker-supplied header must not be able to change the shape of the failure. Stripe signs `${timestamp}.${rawBody}` with the endpoint's signing secret, so the raw body travels from the route to the port unparsed — parsing to JSON and re-serialising produces different bytes and a signature that can never match. `ProviderNotification` therefore carries `rawBody: string`, and the one place that reads the request body reads it as text.

A notification outside the timestamp tolerance and one with a wrong digest return the identical `forbidden("payment.notification.signatureInvalid", ...)`. Telling a caller which half of the check failed is free information for whoever is probing.

We do not call the provider back to confirm an event. A verified signature already proves the payload came from the holder of the signing secret; a confirmation fetch trades that for a network round trip inside a handler that must answer quickly, and adds a provider outage as a new way for a legitimate payment to be dropped. The whole Stripe adapter therefore makes exactly one outbound HTTP call, in `start`, and none in `interpret`.

### 3. An unrecognised provider event is a success, not an error

`interpret` returns `ok` with `kind: "unsupported"` for every provider event outside the payment vocabulary, and the use case acknowledges it without touching an aggregate. Returning a `DomainError` for `customer.created` would make the route answer non-2xx, which Stripe retries for up to three days, which turns every unrelated event on the account into a retry storm against our own endpoint. The failure would look like a load problem and be a modelling problem.

The same reasoning makes the success paths idempotent by construction rather than by luck. The deduplication that decision 0004 mandates is real and is keyed by the provider event id, but it is defence in depth: the primary barrier is that `Payment` is a state machine whose terminal states are terminal, so a redelivered success finds a payment already succeeded and the transition answers `alreadyApplied` instead of recording a second domain event. This matters because decision 0010 left the idempotency store in memory, so it does not survive a restart and is not shared between serverless instances. The aggregate is the guarantee; the store is the optimisation.

### 4. `billing` ships as `core: false, active: false`

Decision 0026 made switching an optional module on in production a commitment to configure its provider. A base repository that charges nobody must not hand every derived project a boot failure until it has registered with Stripe, so `billing` starts off. Turning it on is a deliberate act by a project that has a Stripe account, and `apps/web/src/main/env.ts` then requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in production with the message shape 0026 established: what is missing, what silently happens without it, and that deactivating the module is the alternative.

The webhook route is the one place where "off means never mounted" needs a translation. Next's file-system router mounts the route file whether the module is active or not, so the composition root's only available expression of "not mounted" is a 404 answered by `apps/web/src/main/stripe-webhook.ts` before anything else happens. That check sits in `src/main`, the only ring rule 14 permits it in, and it is the only one: no use case, no adapter and no entity contains an activation test.

The route stays outside the contract system for the reasons decision 0028 gave for `/api/cron/dispatch` — no end-user actor, no request body a zod contract could usefully constrain — plus one specific to it: the body must reach the port as the exact bytes that were signed, and a contract that parses it destroys the thing being verified. It carries its own `billing.webhook` telemetry span, for the reason 0028 gave: the endpoint that moves money must not be the least observed one in the application.

## Consequences

- Every amount in this repository is exact, and the only place a currency's exponent is written down is the domain's currency table. A project adding a three-decimal currency such as BHD or KWD must also handle Stripe's requirement that such amounts round to the nearest ten; the table's closed shape makes that one reviewable change instead of a bug distributed across an adapter.
- Swapping Stripe for Redsys stays a `packages/infrastructure` change, signature verification included, because verification never leaked into `apps/web`. The `PaymentHandoff` union carries both a redirect and a signed form for exactly this reason, though Stripe only ever returns the first.
- The Stripe contract suite proves `start` against the sandbox and proves the whole of `interpret` with locally signed fixtures and no network. It cannot prove provider unavailability, a 429, a timeout or a real customer completing checkout; the first three are covered in `packages/infrastructure/test/stripe.test.ts` with an injected fetch, and the fourth is left unproven and named as such.
- Webhook deduplication inherits decision 0010's in-memory store and its restart and per-instance limits. The aggregate absorbs the consequence; a persistent store later strengthens this path with no change to the use case.
- Left undone deliberately: refunds, subscriptions, billing cycles and invoices. The shapes chosen keep them open — terminal states are additive, a refund will attach to a payment id, and the port's two verbs are unchanged by any of them — but nothing here implements them, and no speculative field, state or port method was added on their behalf.
