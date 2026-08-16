# Maminko, mluv se mnou — project structure

The repository is moving away from a flat static-file layout so it can grow into a full application with checkout/payment flows, Balíkovna shipping and an admin area.

## Target structure

```text
/
├─ app/                         # future Next.js App Router application
│  ├─ page.tsx                  # public landing page
│  ├─ checkout/
│  │  └─ page.tsx               # checkout UI + Balíkovna shipping method selection
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
│     │  └─ shipments/route.ts   # create/manage pickup or address shipments
│     └─ admin/                  # authenticated admin endpoints
│
├─ components/
│  ├─ Header.tsx
│  ├─ Hero.tsx
│  ├─ Program.tsx
│  ├─ ProductCard.tsx
│  ├─ ShippingMethodPicker.tsx   # pickup point/box vs home address
│  ├─ BalikovnaPicker.tsx        # pickup point / box selector
│  └─ Footer.tsx
│
├─ lib/
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
│     │  ├─ gallery/
│     │  ├─ author/
│     │  └─ ui/
│     └─ icons/
│
├─ messages/
│  ├─ cs.json
│  └─ uk.json
│
├─ docs/
│  └─ ARCHITECTURE.md
│
├─ index.html
├─ app.js
├─ style.css
└─ vercel.json
```

## Checkout and fulfilment flow

1. Customer chooses the product.
2. Customer enters contact details and chooses one of two Balíkovna delivery methods:
   - `pickup` — delivery to a Balíkovna pickup point / box;
   - `address` — Balíkovna na adresu (home, office or another Czech address).
3. For `pickup`, the customer selects a Balíkovna point/box and the site stores its provider identifier, name and address.
4. For `address`, the customer enters and confirms the delivery address and the site stores the structured address fields.
5. The site creates an order with payment status `pending` and the selected shipping method.
6. The payment gateway creates the payment.
7. Payment confirmation is verified server-to-server via the payment provider webhook/API.
8. Only after payment is confirmed as `paid`, the backend creates the corresponding Balíkovna shipment.
9. The shipment identifier, label/tracking data and delivery status are stored on the order.
10. The admin area shows payment and shipping state separately and allows label reprint / shipment handling.

Suggested fields:

```text
shipping_method: pickup | address
payment_status: pending | paid | failed | refunded
shipping_status: not_ready | ready | created | handed_over | delivered | returned
```

## Migration strategy

1. Keep the current landing page working while assets are reorganized.
2. Keep book preview images as separate high-quality files under `public/assets/images/gallery/`.
3. Move translations out of the monolithic `app.js` into CZ/UA message files.
4. Migrate the public landing page to Next.js components.
5. Add checkout/payment server routes.
6. Add Balíkovna shipping method selection: pickup point/box and Balíkovna na adresu.
7. Add Balíkovna shipment integration, labels and tracking.
8. Add authenticated `/admin` pages for orders, products, payment and shipment status.
9. Add a database when checkout/order persistence is introduced.

## Important rules

- Product images and book preview images are stored as real files, not large base64 payloads embedded inside SVG.
- Payment, Balíkovna API secrets, API keys and admin credentials must only live in Vercel environment variables.
- Admin routes must be protected server-side; hiding links in the UI is not sufficient.
- Payment confirmation must come from a provider webhook/API verification, not only from the browser success page.
- Balíkovna shipment creation happens only after confirmed payment, unless cash-on-delivery is intentionally enabled later.
- Pickup points must be stored by stable provider identifier in addition to display name/address.
- Address delivery must store structured delivery address fields separately from billing/contact data.
- Payment status and shipping status are separate fields and must never be inferred from each other.
- Public assets are separated by purpose so the repository remains maintainable as it grows.
