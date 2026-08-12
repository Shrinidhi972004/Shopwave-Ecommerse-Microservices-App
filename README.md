# ShopWave — 3-Tier E-Commerce Microservices

A complete three-tier e-commerce application: a React storefront, four independent
Node.js microservices, and a PostgreSQL data tier with hand-written migrations.

No containerisation yet — every service runs standalone with `npm start`, and the
frontend produces a static build. Kubernetes/Docker come later.

---

## Table of contents

- [Quick start — execution steps](#quick-start--execution-steps)
- [Architecture](#architecture)
- [Ports at a glance](#ports-at-a-glance)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup — database](#setup--database)
- [Setup — services](#setup--services)
- [Setup — frontend](#setup--frontend)
- [Running everything](#running-everything)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Deliberately vulnerable endpoints (WAF testing)](#deliberately-vulnerable-endpoints-waf-testing)
- [Verification](#verification)
- [Design decisions](#design-decisions)
- [Path to AWS](#path-to-aws)

---

## Quick start — execution steps

Full run-through from a clean checkout to a working storefront. Every command is
run from the `ecommerce-app/` directory unless stated otherwise.

**Total: about 5 minutes**, most of it `npm install`.

### Step 0 — check your toolchain

```bash
node --version     # must be 20.19+  (Vite 8 requires it)
psql --version     # PostgreSQL client
```

### Step 1 — get a PostgreSQL database

Pick **one** of these two.

<details open>
<summary><b>Option A — your local PostgreSQL</b> (no Docker)</summary>

Create a dedicated role and database. `SUPERUSER` is needed because
`schema.sql` installs the `pgcrypto` and `pg_trgm` extensions — drop the flag if
you create those extensions yourself as the `postgres` role first.

```bash
sudo -u postgres psql \
  -c "CREATE ROLE shopwave LOGIN PASSWORD 'shopwave_dev_pw' SUPERUSER;" \
  -c "CREATE DATABASE ecommerce OWNER shopwave;"
```

Your connection string is:

```
postgres://shopwave:shopwave_dev_pw@localhost:5432/ecommerce
```

</details>

<details>
<summary><b>Option B — throwaway PostgreSQL in Docker</b> (nothing to configure)</summary>

Useful when you don't have credentials for the local server, or don't want to
touch it. This runs on **5433** so it can't collide with a local PostgreSQL on
5432. It is a dev database only — no Dockerfile or compose file is part of this
project.

```bash
docker run -d --name shopwave-pg \
  -e POSTGRES_USER=shopwave \
  -e POSTGRES_PASSWORD=shopwave_dev_pw \
  -e POSTGRES_DB=ecommerce \
  -p 5433:5432 \
  postgres:18-alpine

# wait until it accepts connections (a second or two)
until docker exec shopwave-pg pg_isready -U shopwave -d ecommerce; do sleep 1; done
```

Your connection string is:

```
postgres://shopwave:shopwave_dev_pw@localhost:5433/ecommerce
```

Tear down later with `docker rm -f shopwave-pg` — the data goes with it.

</details>

### Step 2 — apply the schema and seed data

Not an ORM sync. You run the SQL yourself, so the same files replay against RDS
later. `ON_ERROR_STOP=1` makes psql fail loudly instead of limping past an error.

```bash
export DATABASE_URL="postgres://shopwave:shopwave_dev_pw@localhost:5433/ecommerce"   # 5432 for Option A

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
```

`seed.sql` finishes by printing a count. You want to see exactly this:

```
   table    | count
------------+-------
 users      |     2
 categories |     5
 products   |    18
```

Both files are idempotent — re-running them is safe.

> `NOTICE: trigger "..." does not exist, skipping` during `schema.sql` is
> expected on a first run. `DROP TRIGGER IF EXISTS` says so before creating it.

### Step 3 — install dependencies

Five separate installs — the services share nothing at runtime, which is what
lets you build four independent images later.

```bash
for svc in auth-service product-service cart-service order-service; do
  (cd "services/$svc" && npm install)
done
(cd frontend && npm install)
```

### Step 4 — create the `.env` files

The critical detail: **`JWT_SECRET` must be byte-identical in all four
services.** auth-service signs tokens; the other three verify them locally with
no callback. One stale secret and every protected route returns 401.

```bash
SECRET=$(openssl rand -hex 48)
DB_URL="postgres://shopwave:shopwave_dev_pw@localhost:5433/ecommerce"   # 5432 for Option A

for svc in auth-service product-service cart-service order-service; do
  sed -e "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" \
      "services/$svc/.env.example" > "services/$svc/.env"
done

cp frontend/.env.example frontend/.env
```

Confirm all four secrets match — this must print `1`:

```bash
grep -h '^JWT_SECRET=' services/*/.env | sort -u | wc -l
```

The frontend defaults already point at ports 4001–4004, so it needs no edits.

### Step 5 — start the four services

One terminal each. `npm run dev` uses `node --watch`; `npm start` runs without
reloading.

```bash
cd services/auth-service    && npm run dev    # :4001
cd services/product-service && npm run dev    # :4002
cd services/cart-service    && npm run dev    # :4003
cd services/order-service   && npm run dev    # :4004
```

Each should log:

```
[auth-service] Database connection OK
[auth-service] Listening on http://localhost:4001 (development)
```

A service **exits immediately** if it can't reach the database or if
`DATABASE_URL` / `JWT_SECRET` is missing — that is deliberate, so a broken
config fails at boot rather than on the first request.

Prefer one command? This backgrounds all four and tails their logs:

```bash
mkdir -p /tmp/shopwave-logs
for svc in auth-service product-service cart-service order-service; do
  (cd "services/$svc" && nohup node server.js > "/tmp/shopwave-logs/$svc.log" 2>&1 &)
done
sleep 5 && tail -n 3 /tmp/shopwave-logs/*.log
```

### Step 6 — start the frontend

```bash
cd frontend && npm run dev        # :5173
```

### Step 7 — verify

```bash
for p in 4001 4002 4003 4004; do curl -s "http://localhost:$p/ready"; echo; done
```

All four must report `"status":"ready"` and `"database":"connected"`.

Then the full end-to-end suite — 53 checks covering the whole customer journey
plus the authorisation boundaries:

```bash
./scripts/smoke-test.sh
```

Expected tail:

```
════════════════════════════════════════
ALL 53 CHECKS PASSED
════════════════════════════════════════
```

### Step 8 — open the app

**http://localhost:5173**

| Role | Email | Password |
|---|---|---|
| Customer | `demo@shopwave.io` | `Demo@1234` |
| Admin | `admin@shopwave.io` | `Admin@123` |

Both are one-click buttons on the login page. The admin account unlocks the
**Admin** tab — product CRUD and order fulfilment.

Worth walking through: browse and filter the catalogue → open a product → add to
bag → checkout → watch the order appear under **Orders** → sign in as admin and
advance its status.

### Shutting down

```bash
pkill -f "node server.js"     # the four services
pkill -f "node.*vite"         # the frontend
docker rm -f shopwave-pg      # only if you used Option B
```

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Service exits with `Cannot reach the database` | Wrong `DATABASE_URL`, or the port is 5432 vs 5433 | Check the port matches the option you chose in Step 1 |
| Every protected route returns 401 | `JWT_SECRET` differs between services | Re-run the Step 4 check; it must print `1` |
| Login returns **429** | Rate limiter — 20 auth requests/min/IP | Wait ~60s. Working as designed; only affects `/api/auth/*` |
| `EADDRINUSE` on boot | Port already taken | `lsof -i :4001` then kill, or set a different `PORT` in that service's `.env` |
| Storefront loads but no products | `seed.sql` not applied | Re-run Step 2 and check the count output |
| Products load but cart is empty | Not signed in | Guest carts live in localStorage; sign in to persist server-side |
| Browser console shows CORS errors | Frontend origin not allowlisted | Add it to `CORS_ORIGINS` in each service's `.env` |
| `role "shopwave" does not exist` | Step 1 didn't run | Re-run it. Note PostgreSQL 16+ reports a *nonexistent role* and a *wrong password* with the same message over TCP, to prevent user enumeration |
| Everything worked yesterday, all dead today | Reboot. The services are foreground processes and the Docker container does not auto-start | `docker start shopwave-pg`, then redo Steps 5–6. Container data survives — it is only lost on `docker rm` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION TIER                                               │
│  React 19 + Vite + Tailwind v4  ·  static build → S3/CloudFront  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ REST over HTTPS (axios), JWT bearer
        ┌──────────────┬───────┴───────┬──────────────┐
        ▼              ▼               ▼              ▼
┌───────────────┐┌──────────────┐┌─────────────┐┌──────────────┐
│ auth-service  ││product-service││cart-service ││order-service │
│    :4001      ││    :4002      ││   :4003     ││    :4004     │
│ register      ││ CRUD          ││ add/remove  ││ checkout     │
│ login, JWT    ││ search/filter ││ update qty  ││ history      │
│ bcrypt        ││ categories    ││ merge guest ││ status flow  │
└───────┬───────┘└───────┬───────┘└──────┬──────┘└──────┬───────┘
        │                │  ▲            │  ▲           │
        │                │  └────────────┘  └───────────┤
        │                │   cart → product    order → cart
        │                │                     order → product
        ▼                ▼                ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│  DATA TIER — PostgreSQL                                          │
│  auth_service.*  product_service.*  cart_service.*  order_service.* │
│  one schema per service · no cross-schema foreign keys           │
└──────────────────────────────────────────────────────────────────┘
```

**Service-to-service calls** use Node's built-in `fetch` with an `AbortSignal`
timeout — no axios on the backend:

| Caller | Callee | Why |
|---|---|---|
| cart-service | product-service | Resolve name/price/stock for cart lines |
| order-service | cart-service | Read the authoritative cart at checkout |
| order-service | product-service | Reserve stock, and release it on cancel |

---

## Ports at a glance

| Component | Port | Health check |
|---|---|---|
| Frontend (Vite dev) | `5173` | — |
| auth-service | `4001` | `GET /health`, `GET /ready` |
| product-service | `4002` | `GET /health`, `GET /ready` |
| cart-service | `4003` | `GET /health`, `GET /ready` |
| order-service | `4004` | `GET /health`, `GET /ready` |
| PostgreSQL | `5432` | — |

`/health` is a **liveness** probe (process is up, no DB dependency).
`/ready` is a **readiness** probe (can actually serve — checks the DB).
Wire them to `livenessProbe` / `readinessProbe` when you write the K8s manifests.

---

## Project structure

```
ecommerce-app/
├── frontend/                    React + Vite storefront
│   ├── src/
│   │   ├── api/                 axios clients, one per service
│   │   ├── components/          Navbar, ProductCard, FilterSidebar, ui primitives
│   │   ├── context/             Auth, Cart, Toast (Context API)
│   │   ├── pages/               Home, ProductDetail, Cart, Checkout, Login,
│   │   │                        Register, Orders, OrderDetail, Admin, 404
│   │   └── utils/               formatting helpers
│   ├── .env.example
│   └── vite.config.js
├── services/
│   ├── auth-service/            :4001
│   ├── product-service/         :4002
│   ├── cart-service/            :4003
│   └── order-service/           :4004
│       └── src/
│           ├── config/          env validation, pg pool
│           ├── controllers/     request handling
│           ├── models/          raw SQL data access
│           ├── routes/          routing + validation schemas
│           ├── middleware/      JWT auth, error handler, rate limit
│           └── utils/           validator, ApiError, JWT, service client
├── db/
│   ├── schema.sql               run this first
│   └── seed.sql                 then this — 18 products, 2 users
├── scripts/
│   └── smoke-test.sh            end-to-end API test against running services
└── README.md
```

Each service is **fully self-contained**: its own `package.json`, its own
`node_modules`, its own `.env`. Nothing is shared at runtime — that is what lets
you build four separate images later without untangling a shared library.

---

## Prerequisites

- **Node.js 20.19+** (Vite 8 requires it; the services need 18+)
- **PostgreSQL 14+** running locally, or an RDS endpoint you can reach
- `psql` on your `PATH`

---

## Setup — database

> The sections below expand on [Quick start](#quick-start--execution-steps).
> If you have already followed that, skip to
> [API reference](#api-reference) — these are reference detail, not a second
> set of instructions.

The schema is **not** auto-synced by an ORM. Run the SQL yourself, so the exact
same files can be replayed against RDS later.

```bash
# 1. Create the database
createdb ecommerce
#    ...or, if your postgres user needs a password:
#    psql -h localhost -U postgres -c "CREATE DATABASE ecommerce;"

# 2. Apply the schema (schemas, tables, indexes, triggers)
psql "postgres://postgres:postgres@localhost:5432/ecommerce" -f db/schema.sql

# 3. Seed 18 products, 5 categories, 2 demo users
psql "postgres://postgres:postgres@localhost:5432/ecommerce" -f db/seed.sql
```

`seed.sql` prints a row count at the end so you can confirm it worked. Both files
are idempotent — re-running them is safe.

### Seeded accounts

| Role | Email | Password |
|---|---|---|
| Customer | `demo@shopwave.io` | `Demo@1234` |
| Admin | `admin@shopwave.io` | `Admin@123` |

The login page has one-click buttons for both. **Rotate these before any
deployment that is reachable from the internet.**

### Tables

| Schema | Tables |
|---|---|
| `auth_service` | `users` |
| `product_service` | `categories`, `products` |
| `cart_service` | `cart_items` |
| `order_service` | `orders`, `order_items` |

There are deliberately **no foreign keys across schemas**. `cart_items.user_id`
points at a user in `auth_service`, but the constraint is enforced in the
application, not the database. That is what lets you split these into four
separate RDS instances later without touching the DDL.

---

## Setup — services

Do this **once per service** (four times):

```bash
cd services/auth-service      # then product-service, cart-service, order-service
npm install
cp .env.example .env
```

Then edit each `.env`:

- Set `DATABASE_URL` to your PostgreSQL connection string.
- Set `JWT_SECRET` to the **same value in all four services** — auth-service
  signs the token and the other three verify it locally. Generate one with:

  ```bash
  openssl rand -hex 48
  ```

A service refuses to start if `DATABASE_URL` or `JWT_SECRET` is missing, and
refuses to start in `NODE_ENV=production` if `JWT_SECRET` is still the example
value.

---

## Setup — frontend

```bash
cd frontend
npm install
cp .env.example .env
```

The defaults already point at `localhost:4001`–`4004`, so no edits are needed
for local development.

---

## Running everything

Five terminals (or use `tmux`):

```bash
# Terminal 1
cd services/auth-service    && npm run dev    # :4001

# Terminal 2
cd services/product-service && npm run dev    # :4002

# Terminal 3
cd services/cart-service    && npm run dev    # :4003

# Terminal 4
cd services/order-service   && npm run dev    # :4004

# Terminal 5
cd frontend && npm run dev                    # :5173
```

Open **http://localhost:5173**.

`npm run dev` uses `node --watch` for the services (no nodemon dependency) and
Vite HMR for the frontend. `npm start` runs the services without watching.

### Production build of the frontend

```bash
cd frontend
npm run build        # → dist/  (static, ready for S3)
npm run preview      # serve dist/ locally to check it
```

---

## Environment variables

### All four services

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | per service | 4001 / 4002 / 4003 / 4004 |
| `NODE_ENV` | no | `development` | |
| `DATABASE_URL` | **yes** | — | `postgres://user:pass@host:5432/db` |
| `PGSSL` | no | `false` | Set `true` for RDS |
| `JWT_SECRET` | **yes** | — | **Must be identical across all services** |
| `JWT_ISSUER` | no | `shopwave-auth` | Must match across all services |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated |

### auth-service only

| Variable | Default | Notes |
|---|---|---|
| `JWT_EXPIRES_IN` | `2h` | Token lifetime |
| `BCRYPT_ROUNDS` | `10` | Raise for production |

### cart-service / order-service only

| Variable | Default | Notes |
|---|---|---|
| `PRODUCT_SERVICE_URL` | `http://localhost:4002` | K8s: `http://product-service` (Service port 80) |
| `CART_SERVICE_URL` | `http://localhost:4003` | order-service only |
| `HTTP_TIMEOUT_MS` | `5000` | Service-to-service call timeout |

### frontend

| Variable | Default |
|---|---|
| `VITE_AUTH_API_URL` | `http://localhost:4001` |
| `VITE_PRODUCT_API_URL` | `http://localhost:4002` |
| `VITE_CART_API_URL` | `http://localhost:4003` |
| `VITE_ORDER_API_URL` | `http://localhost:4004` |
| `VITE_API_GATEWAY_URL` | *(unset)* — if set, overrides all four above with a single origin (the ALB / CloudFront domain); the Ingress routes on the `/api/*` prefixes |

> Vite inlines `VITE_*` variables into the bundle **at build time**. They are
> public. Never put a secret in the frontend `.env`.

---

## API reference

All responses are JSON. Errors use a consistent envelope:

```json
{ "error": { "status": 422, "message": "Validation failed",
             "details": [{ "field": "email", "message": "email must be a valid email address" }] } }
```

Protected routes need `Authorization: Bearer <jwt>`.

### auth-service — `:4001`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account, returns JWT |
| POST | `/api/auth/login` | — | Returns JWT |
| POST | `/api/auth/verify` | — | Service-to-service token check |
| GET | `/api/auth/me` | user | Current user (re-read from DB) |
| PATCH | `/api/auth/me` | user | Update display name |
| POST | `/api/auth/change-password` | user | Requires current password |
| GET | `/api/auth/users` | **admin** | List users |

Rate limited to 20 requests/minute/IP across `/api/auth/*`.

### product-service — `:4002`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | — | List + filter + sort + paginate |
| GET | `/api/products/:idOrSlug` | — | Single product (UUID or slug) |
| GET | `/api/products/meta/filters` | — | Categories, brands, price range |
| POST | `/api/products/batch` | — | Bulk resolve by id (service-to-service) |
| GET | `/api/categories` | — | List categories |
| POST | `/api/products` | **admin** | Create |
| PATCH | `/api/products/:id` | **admin** | Partial update |
| DELETE | `/api/products/:id` | **admin** | Delete |
| POST | `/api/categories` | **admin** | Create category |
| POST | `/api/products/:id/decrement-stock` | user | Reserve stock (order-service) |
| POST | `/api/products/:id/restock` | user | Release stock (order-service) |
| GET | `/api/products/search` | — | ⚠️ **Vulnerable on purpose** |
| GET | `/api/products/legacy-list` | — | ⚠️ **Vulnerable on purpose** |

`GET /api/products` query parameters: `category`, `search`, `brand`, `minPrice`,
`maxPrice`, `inStock`, `sort`, `limit` (max 100), `offset`.

`sort` accepts only: `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`,
`name_desc`, `rating`. Anything else is a 422.

### cart-service — `:4003`

Every route requires authentication.

| Method | Path | Description |
|---|---|---|
| GET | `/api/cart` | Cart with live prices and computed totals |
| GET | `/api/cart/count` | Badge count only (no product-service call) |
| POST | `/api/cart/items` | Add (upsert — bumps quantity if present) |
| PATCH | `/api/cart/items/:productId` | Set absolute quantity |
| DELETE | `/api/cart/items/:productId` | Remove one line |
| DELETE | `/api/cart` | Empty the cart |
| POST | `/api/cart/merge` | Merge a guest cart in after login |
| GET | `/api/cart/internal/:userId` | Service-to-service read |
| DELETE | `/api/cart/internal/:userId` | Service-to-service clear |

Cart rows store only `(user_id, product_id, quantity)` — never a price. Prices
are resolved live from product-service on every read, so a repriced product is
reflected immediately.

### order-service — `:4004`

Every route requires authentication.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/orders` | user | Place order (checkout) |
| GET | `/api/orders` | user | Own order history |
| GET | `/api/orders/:id` | user | Own order (admin: any) |
| GET | `/api/orders/number/:orderNumber` | user | Look up by order number |
| POST | `/api/orders/:id/cancel` | user | Cancel + release stock |
| GET | `/api/orders/admin/all` | **admin** | All orders |
| GET | `/api/orders/admin/stats` | **admin** | Counts and revenue |
| PATCH | `/api/orders/:id/status` | **admin** | Advance status |
| GET | `/api/orders/admin/report` | **admin** | ⚠️ **Vulnerable on purpose** |

The checkout body carries **only** an address and a payment method:

```json
{
  "shippingAddress": {
    "fullName": "Ada Lovelace", "email": "ada@example.com",
    "address1": "221B Baker Street", "city": "London",
    "postalCode": "NW16XE", "country": "United Kingdom"
  },
  "paymentMethod": "cod"
}
```

Line items and every monetary figure are read server-side from cart-service. A
client that POSTs `{"total": 0.01}` simply has that field discarded — the
validator whitelists fields rather than blocklisting them.

Status transitions are enforced:

```
pending → paid → processing → shipped → delivered
   └────────┴─────────┘ → cancelled
```

---

## Deliberately vulnerable endpoints (WAF testing)

Three endpoints build SQL by raw string concatenation **on purpose**, so you can
verify AWS WAF's SQLi managed rule group end to end against a target that
genuinely responds. Every one is marked in the source with:

```js
// VULNERABLE ON PURPOSE - for WAF testing
```

| Endpoint | Sink | Auth |
|---|---|---|
| `GET /api/products/search?q=` | `WHERE ... ILIKE '%<q>%'` | public |
| `GET /api/products/legacy-list?orderBy=` | `ORDER BY <orderBy>` | public |
| `GET /api/orders/admin/report?status=` | `WHERE status = '<status>'` | admin |

Source locations:

- `services/product-service/src/models/productModel.js` → `searchRawUnsafe`, `listWithRawOrderUnsafe`
- `services/product-service/src/controllers/productController.js` → `searchUnsafe`, `legacyListUnsafe`
- `services/order-service/src/models/orderModel.js` → `findByStatusRawUnsafe`
- `services/order-service/src/controllers/orderController.js` → `adminReportUnsafe`

Try them:

```bash
# Baseline — should return products
curl "http://localhost:4002/api/products/search?q=headphones"

# Classic tautology — returns everything
curl -G "http://localhost:4002/api/products/search" --data-urlencode "q=' OR '1'='1"

# UNION-based column probing
curl -G "http://localhost:4002/api/products/search" \
     --data-urlencode "q=' UNION SELECT NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL--"

# ORDER BY injection
curl -G "http://localhost:4002/api/products/legacy-list" \
     --data-urlencode "orderBy=(CASE WHEN (SELECT 1)=1 THEN p.name ELSE p.price END)"
```

Each returns `200` with a `_warning` field today. Once AWS WAF is attached, the
injection payloads should come back **403** while the benign query still returns
`200` — that difference is the test.

**Everything else is parameterised.** The safe equivalent of the search endpoint
is `GET /api/products?search=...`, which uses `$1` placeholders. Compare the two
in `productModel.js` — they sit a few lines apart on purpose.

Two notes:

- **Multi-statement payloads (`'; DROP TABLE products--`) will not execute.**
  `node-postgres` uses the extended query protocol, which permits one statement
  per call. Injection here means data exfiltration and auth-logic bypass, not
  arbitrary DDL. Good news for your test database; irrelevant to WAF rule
  matching, which fires on the request, not the outcome.
- **Auth endpoints were left safe deliberately.** WAF rules match on the request
  payload, so a read-only sink exercises them exactly as well as a login bypass
  would — without leaving a real authentication bypass in the codebase. If you
  specifically need an auth-bypass target, add it to `userModel.findByEmail` and
  mark it the same way.

**Remove these three endpoints before this goes anywhere real.**

---

## Verification

### What I ran

- **70/70 backend checks pass.** Every service was booted with a stubbed
  `pg` layer and driven through its real Express stack — routing, validation,
  JWT verification, role gating, and the error handler. This covered
  registration and login, privilege-escalation attempts via `role` in the
  request body, tampered tokens, SQLi through the `sort` parameter (422 —
  whitelist holds), cart total arithmetic, IDOR on order reads (403), illegal
  status transitions (400), and confirmation that the three vulnerable
  endpoints really do interpolate raw payloads into the SQL text.
- **Frontend builds clean** — `npm run build` succeeds, and all 9 routes render
  without errors through a server-side render pass.
- **Price tampering is blocked**: a checkout POST carrying `{"total": 0.01}`
  still produces an order at the cart-derived total.

### Against a real database

The full stack has since been run end to end against **PostgreSQL 18.4**:

- `schema.sql` and `seed.sql` both executed clean on first run — 4 schemas,
  6 tables, 18 products, 5 categories, 17 brands, 2 users.
- All four services connected and reported `"database":"connected"` on `/ready`.
- **53/53 checks in `./scripts/smoke-test.sh` pass**, twice in succession, and
  the suite cleans up the products it creates so the catalogue returns to the
  seeded 18.
- The storefront serves the React app on 5173 and renders live catalogue data.

Three bugs surfaced during that run — all in the test script, none in the
application:

1. `jget` used a greedy `sed` that captured the **last** `"id"` in a response
   (a nested order-item id) rather than the order's own. Now first-match.
2. The script resolved "newest in-stock product" *before* creating products of
   its own, so later runs landed on a previous run's near-exhausted widget.
   Now resolves a known seeded product by slug, and deletes what it creates.
3. Running the suite repeatedly tripped the auth rate limiter (20/min/IP → 429).
   That is the limiter behaving correctly; leave ~60s between runs.

### Running the end-to-end test yourself

With all four services running against a seeded database:

```bash
./scripts/smoke-test.sh
```

It walks the full journey — register, browse, filter, add to cart, checkout,
order history — and asserts the authorisation boundaries and the vulnerable
endpoints. Override the base URLs with `AUTH_URL`, `PRODUCT_URL`, `CART_URL`,
`ORDER_URL` if you are not on localhost.

### Still unverified

- **No browser-level UI testing.** Pages were verified by build, by a
  server-side render pass over all 9 routes, and by the APIs behind them —
  but no click-through in a real browser, so visual regressions and
  interaction bugs would not have been caught.
- **Never run against RDS**, only local PostgreSQL 18. The `PGSSL` flag and the
  RDS connection path are untested.
- **No load or concurrency testing.** The `stock >= $2` guard against
  double-selling the last unit is correct by construction but has not been
  proven under parallel checkouts.

---

## Design decisions

**Why a schema per service, not a database per service?**
One RDS instance is much cheaper than four, and schemas give the same logical
isolation. Each service pins its `search_path` to its own schema, so a stray
query physically cannot reach another service's tables. `schema.sql` ends with a
commented-out block of per-service DB roles that enforces this at the database
level rather than by convention — turn it on before production.

**Why no ORM?**
You asked for hand-written migrations, and raw SQL makes the parameterised-vs-
concatenated contrast legible, which matters given the WAF exercise. `pg` alone
keeps the dependency list to six packages per service.

**Why `bcryptjs` rather than `bcrypt`?**
Same algorithm, same hash format, pure JavaScript. `bcrypt` is a native addon
that needs a compiler at install time and rebuilds per platform — painful the
moment you build an Alpine image for Kubernetes. Swapping back is a one-line
change if you'd rather have the C implementation; the hashes are interchangeable.

**Why is validation hand-rolled?**
About 180 lines in `utils/validate.js` versus a dependency. It whitelists
declared fields, which is what stops `role: "admin"` in a registration body from
reaching the database, and it produces per-field errors the checkout form maps
straight onto its inputs.

**Why does the cart not store prices?**
A cart line is a *reference*, so a repriced product is reflected immediately. An
order line is a *snapshot* — `order_items` copies name, image, and unit price at
purchase time, so history stays truthful even if the product is later renamed or
deleted. That is why `order_items` has no FK to `products`.

**Concurrency on stock.** `decrementStock` uses
`UPDATE ... WHERE id = $1 AND stock >= $2`. Two simultaneous checkouts for the
last unit cannot both win: the second matches zero rows and gets a 409.

**Known gap — checkout is not atomic across services.** Reserving stock, writing
the order, and clearing the cart span three services. A partial failure releases
the already-reserved units, but a hard crash between reserving and writing would
leak stock. The correct fix is a saga with a compensating "release stock" event
on SQS/SNS. The seam is marked in `orderController.placeOrder`.

**Rate limiting is per-process.** The limiter on `/api/auth/*` is in-memory, so
it does not coordinate across replicas. Once this runs as multiple pods, move
the counter to ElastiCache or let a WAF rate-based rule handle it.

---

## Path to AWS

Nothing here is Docker- or K8s-specific yet, but the shape is deliberate:

| Concern | Already in place | Still to do |
|---|---|---|
| Config | Everything via env vars, `.env.example` per service | Wire to Secrets Manager / SSM |
| Health | `/health` (liveness) + `/ready` (readiness) | Map to K8s probes / ALB target groups |
| Shutdown | SIGTERM handled, connections drained, pool closed | — |
| Service discovery | Upstream URLs are env vars | Point at cluster DNS names |
| Database | Hand-written SQL, `PGSSL` flag, no ORM sync | Run `schema.sql` against RDS |
| Frontend | Static `dist/`, no SSR, chunk splitting | S3 + CloudFront; rewrite 403/404 → `/index.html` |
| CORS | Explicit origin allowlist per service | Add the CloudFront domain |
| Proxy awareness | `trust proxy` enabled, so `req.ip` is the client behind an ALB | — |

Two things to remember when you deploy:

1. **CloudFront must rewrite 403 and 404 to `/index.html` with a 200.** This is a
   client-routed SPA; without that rule, a hard refresh on `/orders/abc` returns
   an S3 404.
2. **`JWT_SECRET` must be identical across all four services.** Each verifies
   tokens locally with no callback to auth-service — that is what makes them
   independently deployable, and it is also the first thing to break if one
   service gets a stale secret during a rolling update.
