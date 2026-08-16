# Balikovna integration notes

Source basis: official Balikovna implementation package supplied for the project (package dated 2024-06-21), cross-checked against the current Balikovna documentation available in 2026. The 2024 product name `Balikovna plus` is now `Balikovna na adresu`.

## Checkout delivery methods

The checkout should expose two separate delivery methods:

1. `pickup` - Balikovna pickup point / partner point / box
2. `address` - Balikovna na adresu

Do not combine them into one ambiguous shipping option. Store the selected delivery method explicitly on the order.

Suggested order fields:

```text
shipping_method: pickup | address
shipping_status: not_ready | ready | created | handed_over | delivered | returned
```

## Pickup-point / box selection

Balikovna provides an iframe-based location picker. The implementation package describes the picker URL as:

```html
<iframe
  title="Vyber mista pro vyzvednuti zasilky"
  src="https://b2c.cpost.cz/locations/?type=BALIKOVNY"
  allow="geolocation"
></iframe>
```

Important URL parameters from the supplied manual:

```text
type=BALIKOVNY
phone=true|false
skipLocation=true|false
```

Rules:

- Always pass `type=BALIKOVNY`.
- Use `phone=true` only if our checkout does not already require a phone number.
- `skipLocation=false` allows the picker to request the customer's device location when first opened.
- `allow="geolocation"` is required on the iframe for location access.

For this project, the preferred implementation is to collect the phone number in our own checkout, so the picker should normally be opened without `phone=true`.

## Reading the selected pickup point

The picker returns the customer's selection via the browser `message` event.

Example listener pattern from the implementation manual:

```js
function iframeListener(event) {
  if (event.data?.message === 'pickerResult') {
    const point = event.data.point;
    // save selected point
  }
}

window.addEventListener('message', iframeListener);
```

The returned object can contain fields such as:

```text
id
point.id
point.type
point.zip
point.address
point.name
point.coords
point.coor_x_wgs84
point.coor_y_wgs84
point.opening_hours
point.district
point.municipality_name
point.municipality_district_name
point.distanceMeters
point.description
phone
```

### What we should persist on the order

At minimum:

```text
pickup_point_id
pickup_point_name
pickup_point_zip
pickup_point_address
pickup_point_type
pickup_point_lat
pickup_point_lng
```

The provider identifier must be treated as the authoritative reference. Display name/address are stored as a snapshot for order history and customer communication.

## Important address-label rule for pickup deliveries

The supplied Balikovna manual explicitly warns that the physical address shown by the picker is not the address format to use on the shipment label.

For a parcel addressed to a Balikovna pickup point, the destination address is formed from:

```text
Recipient name
BALIKOVNA
ZIP + NAME
```

For example:

```text
Jan Novak
BALIKOVNA
160 00 Praha 6
```

or a partner point:

```text
Jan Novak
BALIKOVNA
100 30 Praha 10 SAZKA Cukrarna
```

Use the `ZIP` value returned by the picker, not a postal code parsed from the human-readable `address` field.

This distinction is important and must be preserved when mapping checkout data to the Balikovna shipment API.

## Contact data

The implementation manual states that an email address must be supplied for Balikovna deliveries. A mobile phone number is recommended.

Our checkout should therefore require:

```text
customer_name
email
phone
```

For `address` delivery it also requires the complete destination address.

## Balikovna na adresu

The supplied 2024 package refers to the home-delivery product as `Balikovna plus`. From 2026 the current product name is `Balikovna na adresu`.

Checkout UI should therefore use the current customer-facing labels:

```text
Balikovna - do boxu nebo vydejniho mista
Balikovna na adresu
```

Suggested descriptions, consistent with Balikovna's own e-shop manual:

```text
Vyberte si box nebo vydejni misto, ktere vam vyhovuje.
Dorucime i na vami vybranou adresu.
```

## Shipment creation flow

The location picker only selects a destination. It does not replace the shipment API.

Our flow should be:

```text
1. Customer selects product.
2. Customer enters contact details.
3. Customer selects shipping_method.
4a. pickup -> open Balikovna picker and save point data.
4b. address -> collect destination address.
5. Create order with payment_status=pending.
6. Create payment session.
7. Verify successful payment server-to-server.
8. Change payment_status to paid.
9. Create Balikovna shipment through the current shipment API.
10. Save shipment identifier / barcode / tracking data.
11. Generate or retrieve label.
12. Admin prepares and hands over parcel.
```

Do not create the shipment merely because the customer reached a browser success page. Payment must first be verified server-side.

## API implementation

The supplied package includes manuals, an old example application, XML/customer-output links, logos and label specifications. It should be treated as implementation reference material, but API authentication and shipment operations must be implemented against the current Balikovna/Česka posta API documentation and credentials issued for GlamGarb Rentals s.r.o.

Secrets must be stored only as Vercel environment variables, never committed to GitHub.

Suggested module structure:

```text
lib/
  shipping/
    balikovna/
      client.ts
      types.ts
      pickup.ts
      shipments.ts
      labels.ts

app/
  api/
    shipping/
      balikovna/
        points/route.ts
        shipments/route.ts
        labels/route.ts
```

## Branding assets

The supplied implementation package contains official Balikovna logos in SVG/PNG/PDF formats, including separate marks for Balikovna and home delivery. Use official SVG assets in checkout where practical rather than recreating the logo manually.

## Before production implementation

We still need the current contractual/API onboarding details for GlamGarb Rentals s.r.o., especially:

```text
Balikovna customer / contract identifier
API credentials
production API endpoint / environment details
shipment service codes for pickup and address delivery
contract shipping price list
pickup / handover arrangement (branch, bulk handover or collection)
label format required by our printer/workflow
```

Until those values are issued, checkout UI and pickup-point selection can be implemented and tested independently, but live shipment creation cannot be completed safely.
