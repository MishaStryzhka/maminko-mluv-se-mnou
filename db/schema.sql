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
    paid_at timestamptz
);

-- Run these additive migrations on databases originally created for GoPay.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_test_mode boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_gateway_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_consent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_idx ON orders (stripe_session_id);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_shipping_status_idx ON orders (shipping_status);

CREATE TABLE IF NOT EXISTS admin_users (
    id uuid PRIMARY KEY,
    email text UNIQUE NOT NULL,
    display_name text NOT NULL,
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin','sales','accountant')),
    active boolean NOT NULL DEFAULT true,
    failed_login_count integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_invites (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin','sales','accountant')),
    token_hash text UNIQUE NOT NULL,
    invited_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS admin_invites_email_idx ON admin_invites (email);
