import { neon } from '@neondatabase/serverless';

let schemaReady = false;

function getSql() {
    if (!process.env.DATABASE_URL) {
        const error = new Error('DATABASE_URL is not configured');
        error.code = 'DATABASE_NOT_CONFIGURED';
        throw error;
    }
    return neon(process.env.DATABASE_URL);
}

export async function ensureSchema() {
    if (schemaReady) return;
    const sql = getSql();
    await sql`
        CREATE TABLE IF NOT EXISTS orders (
            id uuid PRIMARY KEY,
            order_number text UNIQUE NOT NULL,
            public_token text UNIQUE NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            lang text NOT NULL CHECK (lang IN ('cs','uk')),
            product_code text NOT NULL CHECK (product_code IN ('full','print')),
            product_name text NOT NULL,
            product_price integer NOT NULL CHECK (product_price >= 0),
            currency text NOT NULL DEFAULT 'CZK',
            customer_name text NOT NULL,
            customer_email text NOT NULL,
            customer_phone text NOT NULL,
            shipping_method text NOT NULL CHECK (shipping_method IN ('pickup','address')),
            shipping_price integer NOT NULL CHECK (shipping_price >= 0),
            shipping_status text NOT NULL DEFAULT 'not_ready',
            pickup_point_id text,
            pickup_point_name text,
            pickup_point_zip text,
            pickup_point_address text,
            pickup_point_type text,
            pickup_point_lat double precision,
            pickup_point_lng double precision,
            address_street text,
            address_city text,
            address_zip text,
            address_country text,
            total_amount integer NOT NULL CHECK (total_amount >= 0),
            payment_provider text NOT NULL DEFAULT 'gopay',
            payment_test_mode boolean NOT NULL DEFAULT false,
            payment_status text NOT NULL DEFAULT 'pending',
            gopay_payment_id text UNIQUE,
            gopay_state text,
            gopay_gateway_url text,
            stripe_session_id text UNIQUE,
            stripe_payment_intent_id text,
            stripe_payment_status text,
            stripe_gateway_url text,
            terms_accepted_at timestamptz,
            digital_consent_at timestamptz,
            confirmation_email_status text NOT NULL DEFAULT 'pending',
            confirmation_email_claim_id text,
            confirmation_email_claimed_at timestamptz,
            confirmation_email_attempts integer NOT NULL DEFAULT 0,
            confirmation_email_sent_at timestamptz,
            paid_at timestamptz
        )
    `;
    // Existing GoPay-era databases need additive migrations as well.
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_test_mode boolean NOT NULL DEFAULT false`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_status text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_gateway_url text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_consent_at timestamptz`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_status text NOT NULL DEFAULT 'pending'`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_claim_id text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_claimed_at timestamptz`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_attempts integer NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_idx ON orders (stripe_session_id)`;
    schemaReady = true;
}

export async function insertOrder(order) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        INSERT INTO orders (
            id, order_number, public_token, lang, product_code, product_name,
            product_price, customer_name, customer_email, customer_phone,
            shipping_method, shipping_price, pickup_point_id, pickup_point_name,
            pickup_point_zip, pickup_point_address, pickup_point_type,
            pickup_point_lat, pickup_point_lng, address_street, address_city,
            address_zip, address_country, total_amount, payment_provider, payment_test_mode,
            terms_accepted_at, digital_consent_at
        ) VALUES (
            ${order.id}, ${order.orderNumber}, ${order.publicToken}, ${order.lang},
            ${order.productCode}, ${order.productName}, ${order.productPrice},
            ${order.customerName}, ${order.customerEmail}, ${order.customerPhone},
            ${order.shippingMethod}, ${order.shippingPrice}, ${order.pickupPointId},
            ${order.pickupPointName}, ${order.pickupPointZip}, ${order.pickupPointAddress},
            ${order.pickupPointType}, ${order.pickupPointLat}, ${order.pickupPointLng},
            ${order.addressStreet}, ${order.addressCity}, ${order.addressZip},
            ${order.addressCountry}, ${order.totalAmount}, ${order.paymentProvider || 'gopay'}, ${order.paymentTestMode || false},
            now(), ${order.digitalConsent ? new Date().toISOString() : null}
        )
        RETURNING *
    `;
    return rows[0];
}

export async function attachGoPayPayment(orderNumber, payment) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        UPDATE orders
        SET gopay_payment_id = ${String(payment.id)},
            gopay_state = ${payment.state || null},
            gopay_gateway_url = ${payment.gw_url || null},
            updated_at = now()
        WHERE order_number = ${orderNumber}
        RETURNING *
    `;
    return rows[0];
}

export async function attachStripeSession(orderNumber, session) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        UPDATE orders
        SET stripe_session_id = ${session.id},
            stripe_payment_status = COALESCE(stripe_payment_status, ${session.payment_status || 'unpaid'}),
            stripe_gateway_url = ${session.url || null},
            updated_at = now()
        WHERE order_number = ${orderNumber} AND payment_provider = 'stripe'
          AND (stripe_session_id IS NULL OR stripe_session_id = ${session.id})
        RETURNING *
    `;
    if (!rows[0]) throw new Error('Stripe session could not be linked to the order');
    return rows[0];
}

// Only a signature-verified Stripe webhook may call this. Check the amount,
// currency, order UUID, and session ID before changing a payment state.
export async function updateStripePaymentState(session, nextStatus) {
    await ensureSchema();
    const sql = getSql();
    const isPaid = nextStatus === 'paid';
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
    const rows = await sql`
        UPDATE orders
        SET stripe_session_id = ${session.id},
            stripe_payment_intent_id = COALESCE(${intent}, stripe_payment_intent_id),
            stripe_payment_status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE ${session.payment_status || 'unpaid'} END,
            payment_status = CASE
                WHEN payment_status = 'paid' THEN 'paid'
                WHEN ${nextStatus} = 'pending' AND payment_status IN ('failed', 'cancelled') THEN payment_status
                ELSE ${nextStatus}
            END,
            paid_at = CASE WHEN ${isPaid} AND paid_at IS NULL THEN now() ELSE paid_at END,
            updated_at = now()
        WHERE order_number = ${session.client_reference_id}
          AND id = ${session.metadata?.orderId || null}
          AND payment_provider = 'stripe'
          AND payment_test_mode = ${session.livemode === false}
          AND total_amount * 100 = ${session.amount_total}
          AND lower(currency) = ${session.currency || ''}
          AND (stripe_session_id IS NULL OR stripe_session_id = ${session.id})
        RETURNING order_number, payment_test_mode, customer_email
    `;
    return rows[0] || null;
}

// Claim a paid order before SMTP. The claim prevents concurrent webhook
// deliveries from sending the same confirmation twice. A stale claim can be
// recovered when Stripe retries after a function crash.
export async function claimPaidConfirmation(orderNumber, claimId, allowTest = false) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        UPDATE orders
        SET confirmation_email_status = 'sending',
            confirmation_email_claim_id = ${claimId},
            confirmation_email_claimed_at = now(),
            confirmation_email_attempts = confirmation_email_attempts + 1,
            updated_at = now()
        WHERE order_number = ${orderNumber}
          AND payment_provider = 'stripe'
          AND payment_status = 'paid'
          AND (NOT payment_test_mode OR (${allowTest === true}
               AND lower(customer_email) = 'info@maminko-mluv-se-mnou.cz'))
          AND (
            confirmation_email_status IN ('pending', 'failed')
            OR (confirmation_email_status = 'sending'
                AND confirmation_email_claimed_at < now() - interval '10 minutes')
          )
        RETURNING order_number, customer_name, customer_email, lang, payment_test_mode,
                  product_code, product_name, product_price, shipping_method,
                  shipping_price, pickup_point_name, pickup_point_address,
                  pickup_point_zip, address_street, address_city, address_zip,
                  total_amount
    `;
    return rows[0] || null;
}

export async function getConfirmationState(orderNumber) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        SELECT confirmation_email_status FROM orders
        WHERE order_number = ${orderNumber} AND payment_provider = 'stripe'
        LIMIT 1
    `;
    return rows[0] || null;
}

export async function markConfirmationSent(orderNumber, claimId) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        UPDATE orders
        SET confirmation_email_status = 'sent',
            confirmation_email_claim_id = NULL,
            confirmation_email_claimed_at = NULL,
            confirmation_email_sent_at = now(),
            shipping_status = CASE WHEN NOT payment_test_mode AND payment_status = 'paid'
                                   AND shipping_status = 'not_ready' THEN 'ready' ELSE shipping_status END,
            updated_at = now()
        WHERE order_number = ${orderNumber}
          AND confirmation_email_status = 'sending'
          AND confirmation_email_claim_id = ${claimId}
        RETURNING order_number
    `;
    if (!rows[0]) throw new Error('Confirmation email claim was lost');
    return rows[0];
}

export async function releaseConfirmationClaim(orderNumber, claimId) {
    await ensureSchema();
    const sql = getSql();
    await sql`
        UPDATE orders
        SET confirmation_email_status = 'failed',
            confirmation_email_claim_id = NULL,
            confirmation_email_claimed_at = NULL,
            updated_at = now()
        WHERE order_number = ${orderNumber}
          AND confirmation_email_status = 'sending'
          AND confirmation_email_claim_id = ${claimId}
    `;
}

export async function findOrderByPaymentId(paymentId) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT * FROM orders WHERE gopay_payment_id = ${String(paymentId)} LIMIT 1`;
    return rows[0] || null;
}

export async function findOrderByPublicToken(orderNumber, publicToken) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
        SELECT order_number, created_at, lang, product_code, product_name, product_price,
               currency, shipping_method, shipping_price, shipping_status,
               pickup_point_name, pickup_point_zip, pickup_point_address,
               address_street, address_city, address_zip, address_country,
               total_amount, payment_status, payment_test_mode, gopay_state, stripe_payment_status, paid_at
        FROM orders
        WHERE order_number = ${orderNumber} AND public_token = ${publicToken}
        LIMIT 1
    `;
    return rows[0] || null;
}

export async function updatePaymentState(paymentId, gopayState, paymentStatus) {
    await ensureSchema();
    const sql = getSql();
    const paid = paymentStatus === 'paid';
    const rows = await sql`
        UPDATE orders
        SET gopay_state = ${gopayState},
            payment_status = ${paymentStatus},
            shipping_status = CASE WHEN ${paid} THEN 'ready' ELSE shipping_status END,
            paid_at = CASE WHEN ${paid} AND paid_at IS NULL THEN now() ELSE paid_at END,
            updated_at = now()
        WHERE gopay_payment_id = ${String(paymentId)}
        RETURNING *
    `;
    return rows[0] || null;
}

export async function listOrdersForAdmin(limit = 100) {
    await ensureSchema();
    const sql = getSql();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
    return sql`
        SELECT order_number, created_at, updated_at, lang, product_code, product_name,
               product_price, currency, customer_name, customer_email, customer_phone,
               shipping_method, shipping_price, shipping_status,
               pickup_point_id, pickup_point_name, pickup_point_zip, pickup_point_address,
               pickup_point_type, address_street, address_city, address_zip, address_country,
               total_amount, payment_status, payment_provider, payment_test_mode, gopay_payment_id, gopay_state,
               stripe_session_id, stripe_payment_intent_id, stripe_payment_status, paid_at,
               confirmation_email_status, confirmation_email_attempts, confirmation_email_sent_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
    `;
}
