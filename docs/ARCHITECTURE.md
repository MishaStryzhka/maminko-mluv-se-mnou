# Maminko, mluv se mnou — project structure

The repository is moving away from a flat static-file layout so it can grow into a full application with checkout/payment flows, Balíkovna shipping and an admin area.

## Target structure

```text
/
├─ app/                         # future Next.js App Router application
│  ├─ page.tsx                  # public landing page
│  ├─ checkout/
│  │  └─ page.tsx               # checkout UI + Balíkovna pickup-point selection
│  ├─ success/
│  │  └─ page.tsx               # successful payment page
│  ├─ admin/
│  │  ├─ page.tsx               # admin dashboard
│  │  ├─ orders/
│  │  ├─ shipments/             # Balíkovna shipment state, labels, tracking
│  │  └─ products/
│  └─ api/
│     ├─ checkout/route.ts       # create payment session
│     ├─ webhooks/route.ts       # payment provider webhook
│     ├─ shipping/
│     │  ├─ points/route.ts      # Balíkovna pickup points / boxes
│     │  └─ shipments/route.ts   # create/manage Balíkovna shipments
│     └─ admin/                  # authenticated admin endpoints
│
├─ components/                  # reusable UI components
│  ├─ Header.tsx
│  ├─ Hero.tsx
│  ├─ Program.tsx
│  ├─ ProductCard.tsx
│  ├─ BalikovnaPicker.tsx
│  └─ Footer.tsx
│
├─ lib/                         # server/client helpers
│  ├─ auth/
│  ├─ payments/
│  ├─ shipping/
│  │  └─ balikovna/             # Balíkovna API client and mapping helpers
│  ├─ db/
│  └─ i18n/
│
├─ public/
│  └─ assets/
│     ├─ images/
│     │  ├─ hero/
│     │  ├─ gallery/            # individual book preview images
│     │  ├─ author/
│     │  └─ ui/
│     └─ icons/
│
├─ messages/                    # CZ/UA translations
│  ├─ cs.json
│  └─ uk.json
│
├─ docs/
│  └─ ARCHITECTURE.md
│
├─ index.html                   # current site kept during migration
├─ app.js                       # current site kept during migration
├─ style.css                    # current site kept during migration
└─ vercel.json
```

## Checkout and fulfilment flow

1. Customer chooses the product.
2. Customer enters contact details and selects a Balíkovna pickup point / box in checkout.
3. The site creates an order with payment status `pending` and stores the selected Balíkovna point identifier, name and address.
4. The payment gateway creates the payment.
5. Payment confirmation is verified server-to-server via the payment provider webhook/API.
6. Only after payment is confirmed as `paid`, the backend creates the Balíkovna shipment.
7. The shipment identifier, label/tracking data and delivery status are stored on the order.
8. The admin area shows payment and shipping state separately and allows label reprint / shipment handling.

Suggested order states:

```text
payment_status: pending | paid | failed | refunded
shipping_status: not_ready | ready | created | handed_over | delivered | returned
```

## Migration strategy

1. Keep the current landing page working while assets are reorganized.
2. Replace the single embedded `gallery-final.svg` with separate high-quality gallery files under `public/assets/images/gallery/`.
3. Move translations out of the monolithic `app.js` into CZ/UA message files.
4. Migrate the public landing page to Next.js components.
5. Add checkout/payment server routes.
6. Add Balíkovna pickup-point selection and shipment integration.
7. Add authenticated `/admin` pages for orders, products, payment and shipment status.
8. Add a database when checkout/order persistence is introduced.

## Important rules

- Product images and book preview images are stored as real files, not large base64 payloads embedded inside SVG.
- Payment, Balíkovna API secrets, API keys and admin credentials must only live in Vercel environment variables.
- Admin routes must be protected server-side; hiding links in the UI is not sufficient.
- Payment confirmation must come from a provider webhook/API verification, not only from the browser success page.
- Balíkovna shipment creation happens only after confirmed payment, unless cash-on-delivery is intentionally enabled later.
- The selected Balíkovna point must be stored by its stable provider identifier in addition to display name/address.
- Payment status and shipping status are separate fields and must never be inferred from each other.
- Public assets are separated by purpose so the repository remains maintainable as it grows.
