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
            payment_status text NOT NULL DEFAULT 'pending',
            gopay_payment_id text UNIQUE,
            gopay_state text,
            gopay_gateway_url text,
            paid_at timestamptz
        )
    `;
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
            address_zip, address_country, total_amount
        ) VALUES (
            ${order.id}, ${order.orderNumber}, ${order.publicToken}, ${order.lang},
            ${order.productCode}, ${order.productName}, ${order.productPrice},
            ${order.customerName}, ${order.customerEmail}, ${order.customerPhone},
            ${order.shippingMethod}, ${order.shippingPrice}, ${order.pickupPointId},
            ${order.pickupPointName}, ${order.pickupPointZip}, ${order.pickupPointAddress},
            ${order.pickupPointType}, ${order.pickupPointLat}, ${order.pickupPointLng},
            ${order.addressStreet}, ${order.addressCity}, ${order.addressZip},
            ${order.addressCountry}, ${order.totalAmount}
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
               total_amount, payment_status, gopay_state, paid_at
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
               total_amount, payment_status, gopay_payment_id, gopay_state, paid_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
    `;
}
