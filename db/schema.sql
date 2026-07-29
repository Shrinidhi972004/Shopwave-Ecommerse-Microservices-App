-- ============================================================================
--  E-COMMERCE PLATFORM — DATABASE SCHEMA (Data Tier)
-- ============================================================================
--  Target: PostgreSQL 14+  (compatible with AWS RDS for PostgreSQL / Aurora)
--
--  DESIGN NOTE — microservice data ownership:
--  Each service owns its own PostgreSQL SCHEMA. A service may only read/write
--  tables inside its own schema. There are deliberately NO cross-schema
--  FOREIGN KEYS: e.g. cart_service.cart_items.user_id references a user that
--  lives in auth_service.users, but it is NOT declared as an FK. Referential
--  integrity across service boundaries is enforced at the application layer
--  via service-to-service API calls. This keeps the schemas independently
--  migratable and lets you split them into 4 separate RDS instances later
--  without changing a single line of DDL.
--
--  RUN MANUALLY (no ORM auto-sync):
--    psql "$DATABASE_URL" -f db/schema.sql
--    psql "$DATABASE_URL" -f db/seed.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pgcrypto gives us gen_random_uuid(). On RDS this is available by default.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Schemas — one per microservice
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS product_service;
CREATE SCHEMA IF NOT EXISTS cart_service;
CREATE SCHEMA IF NOT EXISTS order_service;

-- ---------------------------------------------------------------------------
-- Shared helper: auto-maintain updated_at
-- Lives in public so every schema can reference it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ===========================================================================
--  AUTH SERVICE  (port 4001)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS auth_service.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,       -- bcrypt, cost factor 10
  full_name     VARCHAR(120) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'customer',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT users_role_check  CHECK (role IN ('customer', 'admin')),
  CONSTRAINT users_email_check CHECK (POSITION('@' IN email) > 1)
);

-- Case-insensitive uniqueness: Alice@x.com and alice@x.com are the same account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq
  ON auth_service.users (LOWER(email));

DROP TRIGGER IF EXISTS users_set_updated_at ON auth_service.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON auth_service.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ===========================================================================
--  PRODUCT SERVICE  (port 4002)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS product_service.categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_service.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         VARCHAR(40)  NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(220) NOT NULL UNIQUE,
  description TEXT         NOT NULL DEFAULT '',
  brand       VARCHAR(80),
  -- NUMERIC, never FLOAT, for money.
  price       NUMERIC(10,2) NOT NULL,
  currency    CHAR(3)      NOT NULL DEFAULT 'USD',
  image_url   TEXT         NOT NULL,
  stock       INTEGER      NOT NULL DEFAULT 0,
  rating      NUMERIC(2,1) NOT NULL DEFAULT 0,
  review_count INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  category_id INTEGER      REFERENCES product_service.categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT products_price_check  CHECK (price >= 0),
  CONSTRAINT products_stock_check  CHECK (stock >= 0),
  CONSTRAINT products_rating_check CHECK (rating >= 0 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS products_category_idx ON product_service.products (category_id);
CREATE INDEX IF NOT EXISTS products_price_idx    ON product_service.products (price);
CREATE INDEX IF NOT EXISTS products_active_idx   ON product_service.products (is_active);

-- Trigram index makes ILIKE '%term%' searches usable at scale.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON product_service.products USING GIN (name gin_trgm_ops);

DROP TRIGGER IF EXISTS products_set_updated_at ON product_service.products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON product_service.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ===========================================================================
--  CART SERVICE  (port 4003)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS cart_service.cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No FK: owned by auth_service.
  user_id    UUID        NOT NULL,
  -- No FK: owned by product_service.
  product_id UUID        NOT NULL,
  quantity   INTEGER     NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cart_items_qty_check CHECK (quantity > 0)
);

-- One row per (user, product) — adding an existing product bumps quantity.
-- This constraint is what makes the ON CONFLICT upsert in the cart model work.
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_product_uniq
  ON cart_service.cart_items (user_id, product_id);

CREATE INDEX IF NOT EXISTS cart_items_user_idx ON cart_service.cart_items (user_id);

DROP TRIGGER IF EXISTS cart_items_set_updated_at ON cart_service.cart_items;
CREATE TRIGGER cart_items_set_updated_at
  BEFORE UPDATE ON cart_service.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ===========================================================================
--  ORDER SERVICE  (port 4004)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS order_service.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    VARCHAR(24)  NOT NULL UNIQUE,
  -- No FK: owned by auth_service.
  user_id         UUID         NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',

  subtotal        NUMERIC(10,2) NOT NULL,
  shipping_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(10,2) NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'USD',

  -- Shipping address is denormalised on purpose: an order is a historical
  -- record and must not change if the user later edits their profile.
  ship_full_name  VARCHAR(120) NOT NULL,
  ship_email      VARCHAR(255) NOT NULL,
  ship_phone      VARCHAR(40),
  ship_address1   VARCHAR(200) NOT NULL,
  ship_address2   VARCHAR(200),
  ship_city       VARCHAR(100) NOT NULL,
  ship_state      VARCHAR(100),
  ship_postal_code VARCHAR(20) NOT NULL,
  ship_country    VARCHAR(80)  NOT NULL,

  payment_method  VARCHAR(30)  NOT NULL DEFAULT 'cod',
  notes           TEXT,
  placed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT orders_status_check CHECK (
    status IN ('pending','paid','processing','shipped','delivered','cancelled')
  ),
  CONSTRAINT orders_total_check CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS orders_user_idx    ON order_service.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON order_service.orders (status);
CREATE INDEX IF NOT EXISTS orders_placed_idx  ON order_service.orders (placed_at DESC);

CREATE TABLE IF NOT EXISTS order_service.order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK is allowed here: both tables belong to order_service.
  order_id     UUID NOT NULL REFERENCES order_service.orders(id) ON DELETE CASCADE,
  -- No FK: owned by product_service.
  product_id   UUID NOT NULL,

  -- Product name/image/price are snapshotted at purchase time so order history
  -- stays accurate even if the product is renamed, repriced, or deleted.
  product_name  VARCHAR(200)  NOT NULL,
  product_image TEXT,
  unit_price    NUMERIC(10,2) NOT NULL,
  quantity      INTEGER       NOT NULL,
  line_total    NUMERIC(10,2) NOT NULL,

  CONSTRAINT order_items_qty_check   CHECK (quantity > 0),
  CONSTRAINT order_items_price_check CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_service.order_items (order_id);

DROP TRIGGER IF EXISTS orders_set_updated_at ON order_service.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON order_service.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ============================================================================
--  OPTIONAL — per-service DB roles (recommended before going to RDS).
--  Enforces the "a service can only touch its own schema" rule at the DB
--  level instead of by convention. Set real passwords via Secrets Manager.
-- ============================================================================
-- CREATE ROLE auth_svc    LOGIN PASSWORD 'change-me';
-- CREATE ROLE product_svc LOGIN PASSWORD 'change-me';
-- CREATE ROLE cart_svc    LOGIN PASSWORD 'change-me';
-- CREATE ROLE order_svc   LOGIN PASSWORD 'change-me';
--
-- GRANT USAGE ON SCHEMA auth_service    TO auth_svc;
-- GRANT USAGE ON SCHEMA product_service TO product_svc;
-- GRANT USAGE ON SCHEMA cart_service    TO cart_svc;
-- GRANT USAGE ON SCHEMA order_service   TO order_svc;
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth_service    TO auth_svc;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA product_service TO product_svc;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cart_service    TO cart_svc;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA order_service   TO order_svc;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA product_service TO product_svc;
