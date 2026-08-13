# Maminko, mluv se mnou — project structure

The repository is moving away from a flat static-file layout so it can grow into a full application with checkout/payment flows and an admin area.

## Target structure

```text
/
├─ app/                         # future Next.js App Router application
│  ├─ page.tsx                  # public landing page
│  ├─ checkout/
│  │  └─ page.tsx               # checkout UI
│  ├─ success/
│  │  └─ page.tsx               # successful payment page
│  ├─ admin/
│  │  ├─ page.tsx               # admin dashboard
│  │  ├─ orders/
│  │  └─ products/
│  └─ api/
│     ├─ checkout/route.ts       # create payment session
│     ├─ webhooks/route.ts       # payment provider webhook
│     └─ admin/                  # authenticated admin endpoints
│
├─ components/                  # reusable UI components
│  ├─ Header.tsx
│  ├─ Hero.tsx
│  ├─ Program.tsx
│  ├─ ProductCard.tsx
│  └─ Footer.tsx
│
├─ lib/                         # server/client helpers
│  ├─ auth/
│  ├─ payments/
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

## Migration strategy

1. Keep the current landing page working while assets are reorganized.
2. Replace the single embedded `gallery-final.svg` with separate high-quality gallery files under `public/assets/images/gallery/`.
3. Move translations out of the monolithic `app.js` into CZ/UA message files.
4. Migrate the public landing page to Next.js components.
5. Add checkout/payment server routes.
6. Add authenticated `/admin` pages for orders, products and payment status.
7. Add a database only when order persistence is needed.

## Important rules

- Product images and book preview images are stored as real files, not large base64 payloads embedded inside SVG.
- Payment secrets, API keys and admin credentials must only live in Vercel environment variables.
- Admin routes must be protected server-side; hiding links in the UI is not sufficient.
- Payment confirmation must come from a provider webhook, not only from the browser success page.
- Public assets are separated by purpose so the repository remains maintainable as it grows.
