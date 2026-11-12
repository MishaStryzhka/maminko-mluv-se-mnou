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
   | `STRIPE_SECRET_KEY` | Stripe **test** secret key, `sk_test_…` |
   | `STRIPE_CHECKOUT_ENABLED` | `true` only while testing |
   | `STRIPE_WEBHOOK_SECRET` | Test event destination signing secret, `whsec_…` |
   | `STRIPE_ALLOW_LIVE` | Leave unset/`false` |
   | `SHIPPING_PICKUP_CZK` | `89`, unless price changes |
   | `SHIPPING_ADDRESS_CZK` | `119`, unless price changes |

3. In Stripe **test mode**, register a webhook/event destination pointing to
   `https://<staging-origin>/api/stripe-webhook`, for these four events:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

   Use the signing secret for **that exact destination**. Vercel's body parser
   is disabled for this endpoint because signature verification needs the raw
   request bytes.

4. Open the staging checkout, choose a product, shipping option, accept the
   published terms, and proceed to Stripe-hosted Checkout. Test with Stripe's
   published test-card scenarios. Confirm that the order is **pending** before
   the signed webhook and **paid** only after the webhook. Check failure and
   cancellation cases as well. Never use real card details in test mode.

5. Review `/api/admin-orders`: test payments are explicitly marked `TEST` and
   **must not** set the order's shipping status to `ready`.

## Production launch — separate later decision

- Wait for Stripe account status to show fully active payments and payouts.
- Review Czech consumer terms and privacy information, product/digital-delivery
  obligations, and the published Balíkovna shipping charges.
- Set up transactional order/payment confirmation email. **This code does not
  send email**; the existing terms describe email confirmation, so this is a
  launch blocker until the business process is implemented and verified.
- Confirm the correct production domain and database, then configure a
  **separate live** webhook destination and `whsec_…` secret.
- Switch to `sk_live_…`, set `STRIPE_CHECKOUT_ENABLED=true` and additionally
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
- The signed webhook checks order ID, reference, amount, currency, and checkout
  session ID and does not regress previously paid orders.
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

No API keys, Stripe identity documents, or credentials belong in GitHub.
