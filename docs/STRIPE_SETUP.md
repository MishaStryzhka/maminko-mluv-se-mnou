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
   `https://<staging-origin>/api/stripe-webhook`, for these four events:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

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
  from `not_ready` to `ready`. Payment status remains `paid` even if email fails;
  delayed email must never trigger another customer charge.

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
