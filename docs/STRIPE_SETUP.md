# Stripe Checkout integration — staged, not live

This integration is **opt-in**. Merging the code without configuration cannot
accept payments. Keep real payments disabled until Stripe finishes identity
verification, the business/legal pages are reviewed, and a complete end-to-end
test is performed. The project previously had a GoPay API skeleton, but the
public checkout was a preview that did not save real orders.

## Test mode first

1. Ensure the Neon database configured via `DATABASE_URL` is reachable. The
   first order request applies additive schema changes from `api/_lib/db.js`.
2. Set these **server-only Vercel environment variables** for a staging
   deployment (never expose them in public frontend code):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon PostgreSQL connection string |
   | `PUBLIC_SITE_URL` | Exact public HTTPS origin of the staging site, no path |
   | `STRIPE_SECRET_KEY` | Stripe **test** secret key, `sk_test_…` or restricted `rk_test_…` with Checkout Sessions write permission |
   | `STRIPE_CHECKOUT_ENABLED` | `true` only while testing |
   | `STRIPE_WEBHOOK_SECRET` | Test event destination signing secret, `whsec_…` |
   | `STRIPE_ALLOW_LIVE` | Leave unset/`false` |
   | `SHIPPING_PICKUP_CZK` | `89`, unless price changes |
   | `SHIPPING_ADDRESS_CZK` | `119`, unless price changes |
   | `SMTP_USER` | `info@maminko-mluv-se-mnou.cz` |
   | `SMTP_APP_PASSWORD` | Seznam mailbox/application password, saved as a Vercel **Secret** |
   | `ORDER_EMAIL_TEST_ENABLED` | Leave `false` except for the owner-only email smoke test below |

3. In Stripe **test mode**, register a webhook/event destination pointing to
   `https://<staging-origin>/api/stripe-webhook`, for these seven events:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `refund.created`
   - `refund.updated`
   - `refund.failed`

   Existing destinations configured with only the four Checkout events must be
   updated before the refund integration can be verified. Do not assume a code
   deployment changes the Stripe destination's selected events.

   Use the signing secret for **that exact destination**. Vercel's body parser
   is disabled for this endpoint because signature verification needs the raw
   request bytes.

   **Protected Preview deployments:** If Vercel Authentication protects the
   preview domain, Stripe cannot deliver events to it unauthenticated. An
   explicitly approved Vercel Automation Bypass token can be placed in the
   webhook destination URL query string, per Vercel's documented Stripe webhook
   method. That token bypasses protection across the project, not only this
   route; keep it secret and do not disable project-wide protection casually.
   Use a stable branch preview alias so webhook events keep reaching the
   current deployment after a redeploy.

4. Open the staging checkout, choose a product, shipping option, accept the
   published terms, and proceed to Stripe-hosted Checkout. Test with Stripe's
   published test-card scenarios. Confirm that the order is **pending** before
   the signed webhook and **paid** only after the webhook. Check failure and
   cancellation cases as well. Never use real card details in test mode.

5. Review `/api/admin-orders`: test payments are explicitly marked `TEST` and
   **must not** set the order's shipping status to `ready`.

## Order confirmation email — Seznam Email Profi

A reconciled, Stripe-signed paid event sends a Czech or Ukrainian confirmation
from **info@maminko-mluv-se-mnou.cz**. The email contains the stored order number,
product, delivery details and itemized total. It does not contain a card number,
public order token or payment secrets. Replies go to the same shop mailbox.
Digital-access instructions for the full package are still a separate business
process; this email does not issue access automatically.

The transport is fixed to `smtp.seznam.cz`, port **465**, with TLS and certificate
validation enabled. Authentication uses the full mailbox address and
`SMTP_APP_PASSWORD`. If Seznam two-factor authentication is enabled, use its
**Heslo pro aplikace**, not the normal account password.

The owner enters the password directly into Vercel's Secret field; never paste it
into chat, GitHub, source code, public variables or logs. Scope staging values to
**Preview / feat/stripe-checkout-staging** only. Environment changes require a
new deployment. Do not change production variables as part of staging work.

### Safe owner-only smoke test

1. Verify that the custom mailbox exists and the domain's MX, SPF and DKIM
   configuration has passed Seznam's checks.
2. Save `SMTP_USER` and the Secret `SMTP_APP_PASSWORD` for the staging branch.
3. Temporarily set `ORDER_EMAIL_TEST_ENABLED=true` on that same branch and
   redeploy. Keep `STRIPE_ALLOW_LIVE=false` and use a Stripe test key.
4. Create a new **test** order with customer email exactly
   `info@maminko-mluv-se-mnou.cz`, using synthetic customer/delivery details.
   Complete it with Stripe's published test-card scenario.
5. Verify the signed webhook, paid test order, a clearly labelled **[TEST]** email
   in the owner's inbox, and `confirmationEmail.status='sent'` in admin.
   The email explicitly says it is not a real payment/order/contract and goods
   must not be shipped. The order must remain `shipping_status='not_ready'`.
6. Set `ORDER_EMAIL_TEST_ENABLED=false` again and redeploy after the test.

With the flag off, all test receipts are suppressed. With it on, both the helper,
database claim and SMTP sender restrict test receipts to the shop's own mailbox.
There is no public endpoint for arbitrary mail sending. An SMTP acceptance alone
does not prove inbox delivery; check the actual inbox and authentication headers.

### Retries and operational visibility

- Email status is `pending`, `sending`, `sent` or `failed`, with attempt count
  and timestamp visible in the order detail. `sent` means **accepted by SMTP**,
  not a delivery or read receipt.
- A database claim prevents concurrent webhook handlers from mailing the same
  order. An active claim returns a retryable webhook error, not a successful
  acknowledgement that could strand the email. Claims older than ten minutes
  can be recovered on a later Stripe retry.
- SMTP failures release the claim as `failed` and return HTTP 500 so Stripe can
  retry. If SMTP accepts the message but recording `sent` fails, the claim is
  retained until stale recovery rather than released for an immediate resend.
- This is **at-least-once**, not exactly-once delivery. A crash after SMTP accepts
  but before the database commit can still produce a duplicate on later retry.
  A stable Message-ID is used, but receiving servers need not deduplicate it.
- After Stripe stops automatic retries, investigate `failed`/stale `sending`
  orders and resend the original signed event through Stripe after correcting
  the problem. Do not manually mark a failed email as sent to bypass the gate.
- For live orders only, successful SMTP acceptance unlocks `shipping_status`
  from `not_ready` to `ready`, provided no refund evidence/hold exists.
  Payment status remains `paid` even if email fails;
  delayed email must never trigger another customer charge.

## Passive refund reconciliation

Refunds are **issued by the owner in Stripe**, not by a new site button or public
API. The site consumes signature-verified `refund.created`, `refund.updated`, and
`refund.failed` snapshots. Unlike Checkout Session, the Refund object has no
`livemode` field; mode is checked on the signed event and the bound local order.
`charge.refunded` is intentionally not the reconciliation source: it does not
provide the complete lifecycle of each refund, and its refunds list need not be
expanded. No additional Stripe API permissions or provider reads are required.

- Match the existing PaymentIntent, test/live mode, currency and minor-unit
  amount. Each refund ID is globally bound to one immutable intent/charge/amount
  tuple per mode; it cannot be copied onto another order.
- Store minimal signed evidence before applying the order snapshot. Evidence
  arriving before Checkout linkage returns a retryable webhook error, but is
  already consulted by paid reconciliation and SMTP claim/finalization. It
  therefore prevents readiness from opening while waiting for Stripe's retry.
- Apply each refund to the currently locked order row. Duplicate/older snapshots
  do not add the amount again. Compare `event.created`; within the same second,
  failed/canceled outrank succeeded, which outranks non-final states. This is a
  deterministic, conservative snapshot rule, not a provider re-fetch. Ambiguous
  non-final states remain held for review.
- Track pending/requires-action, succeeded, failed and canceled separately.
  Only succeeded amounts count as returned. Full and partial returned amounts
  are distinct and preserve haléře. Impossible active totals are held for review,
  never rendered as a valid refund or made eligible for fulfillment.
- The stored `payment_status='paid'` remains the original captured-payment fact.
  Both public and admin APIs project effective refund states from current signed
  evidence. Public status exposes amounts/status only, not refund IDs, raw events,
  PaymentIntent identifiers or credentials.
- Any refund event places an order on a durable fulfillment hold. `ready` becomes
  `not_ready`; existing `sent`/`delivered` facts are preserved. Failed, canceled
  and partial refunds **do not automatically release** this hold. Review the
  order in Stripe and resolve fulfillment separately; this release deliberately
  adds no hold-clearing or refund-issuing action.
- A late paid-event replay cannot erase refund evidence, unlock shipping or send
  a new paid receipt. If SMTP was already in flight when the refund arrived, the
  accepted historical receipt is still recorded as `sent`, but shipping stays
  held. An email already accepted by SMTP cannot be recalled.
- Net-received admin figures exclude TEST orders and subtract only succeeded
  refunds. They summarize loaded orders, not an accounting ledger or Stripe
  payout reconciliation. Pending refunds do not reduce the displayed received
  amount; they have their own status and amount. A refund under review displays
  unknown amounts rather than a definite zero. If any loaded live paid order
  needs review, the net figure is also marked for review rather than asserted.

### Cancellation and failure semantics

Returning from Stripe with the Cancel link only shows a cancellation notice;
it does not prove the session expired and does not cancel a database payment.
The signed `checkout.session.expired` event transitions an unpaid order to
`cancelled`. A declined card can be retried within the same Checkout session;
do not treat a single card decline as terminal order failure. The supported
terminal failure is `checkout.session.async_payment_failed`. Earlier pending,
failed or expired snapshots cannot overwrite an already captured payment.

### Remaining deployed acceptance checks

The previous owner-only TEST email was received in Seznam; admin now confirms
one SMTP attempt and no fulfillment eligibility. The new refund path still
requires enabling the three refund event types on the existing **Sandbox**
destination and checking partial/full refund, replay and order/admin state.
Local PGlite tests exercise actual SQL and rollback-safe holds, and signed
handler tests use offline Stripe HMAC verification; neither substitutes for
the deployed provider test. Production/live activation remains a separate
owner decision. Preview and Production currently share the database: these
schema changes are additive, but old Production code does not render the new
refund projection until a separately approved production release.

Offline verification on **13 November 2026**: `npm test` completed with **151
tests, 149 passed, 0 failed, 2 optional Chromium checkout tests skipped**. This
includes SQL reconciliation against isolated PGlite databases, real offline
Stripe signature verification, and Czech/Ukrainian refund UI checks. The two
skipped browser checks and the deployed Stripe Sandbox refund flow are not
claimed as verified by this result.

Primary references: [Stripe refund lifecycle](https://docs.stripe.com/refunds),
[Refund fields](https://docs.stripe.com/api/refunds/object),
[Webhook delivery/order semantics](https://docs.stripe.com/webhooks).

## Production launch — separate later decision

- Wait for Stripe account status to show fully active payments and payouts.
- Review Czech consumer terms and privacy information, product/digital-delivery
  obligations, and the published Balíkovna shipping charges.
- Verify the Seznam sender credentials, owner-only test above, actual inbox
  receipt, domain authentication, and ongoing monitoring of failed confirmations.
  Email delivery is still a launch blocker until this deployed flow is verified.
  Live checkout also refuses to start without configured SMTP credentials and
  the exact approved sender; configuration presence is not proof of delivery.
- Confirm the correct production domain and database, then configure a
  **separate live** webhook destination and `whsec_…` secret.
- Switch to `sk_live_…` (or suitably scoped `rk_live_…`), set `STRIPE_CHECKOUT_ENABLED=true` and additionally
  `STRIPE_ALLOW_LIVE=true`. This extra opt-in prevents accidental live payments
  merely by entering a live secret key.
- Run a small **authorized real payment** and verify the signed webhook,
  database status, Stripe transaction, order notification, cancellation/refund
  handling, and fulfillment workflow before advertising the checkout.

## Implementation notes

- Prices are calculated on the server; the browser price is just a display.
- Payment card details are collected only by Stripe Checkout.
- Payment success is never inferred from `success_url` or `session_id` in a
  browser URL. Only a Stripe-signed webhook can set `payment_status='paid'`.
- The signed webhook checks order ID, reference, amount, currency, checkout
  session ID and matching event/session/order test mode. It does not regress
  previously paid orders.
- Test orders remain `shipping_status='not_ready'` even when test-paid.
- Old GoPay notification/return endpoints remain for historical orders, while
  new checkout creates Stripe sessions only when explicitly enabled.
- If Stripe session creation fails, an unpaid pending order may remain in the
  database. Staff should distinguish it from a paid order.

## Local checks

```bash
npm ci
npm test
```

The optional Chromium UI integration suite runs with
`RUN_BROWSER_TESTS=true npm test` on an environment that permits launching
`/usr/bin/chromium`.

The offline suite covers email rendering and escaping, sender/recipient guards,
TLS transport settings, SMTP acceptance/rejection, retry claims and webhook mode
checks. These do not replace the deployed SMTP/database/inbox smoke test.

No API keys, Stripe identity documents, or credentials belong in GitHub.
