#!/usr/bin/env bash
#
# End-to-end smoke test against RUNNING services and a REAL database.
#
# Prerequisites:
#   1. PostgreSQL reachable, with db/schema.sql and db/seed.sql applied
#   2. All four services running (see README "Running everything")
#
# Usage:
#   ./scripts/smoke-test.sh
#
# Exercises the full customer journey — register, browse, filter, add to cart,
# checkout, order history — plus the authorisation boundaries and the
# deliberately vulnerable endpoints.

set -uo pipefail

AUTH=${AUTH_URL:-http://localhost:4001}
PRODUCT=${PRODUCT_URL:-http://localhost:4002}
CART=${CART_URL:-http://localhost:4003}
ORDER=${ORDER_URL:-http://localhost:4004}

PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
bold()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

# check <name> <actual> <expected>
check() {
  if [ "$2" = "$3" ]; then
    green "  ✓ $1"
    PASS=$((PASS + 1))
  else
    red   "  ✗ $1 (expected $3, got $2)"
    FAIL=$((FAIL + 1))
  fi
}

# status <method> <url> [json-body] [token]
status() {
  local method=$1 url=$2 body=${3:-} token=${4:-}
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$url")
  [ -n "$body" ]  && args+=(-H 'Content-Type: application/json' -d "$body")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}"
}

# body <method> <url> [json-body] [token]
body() {
  local method=$1 url=$2 payload=${3:-} token=${4:-}
  local args=(-s -X "$method" "$url")
  [ -n "$payload" ] && args+=(-H 'Content-Type: application/json' -d "$payload")
  [ -n "$token" ]   && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}"
}

# Extract the FIRST occurrence of a JSON string field, without needing jq.
# Must be first-match, not sed: `sed 's/.*"id":"\(...\)".*/\1/'` is greedy and
# would return the LAST "id" in the document — for an order response that is a
# nested order_item id, not the order's own id.
jget() { grep -o "\"$2\":\"[^\"]*\"" <<< "$1" | head -1 | cut -d'"' -f4; }

bold "1. Health checks"
for pair in "auth $AUTH" "product $PRODUCT" "cart $CART" "order $ORDER"; do
  set -- $pair
  check "$1-service /health" "$(status GET "$2/health")" "200"
done

bold "2. Readiness (verifies the database connection)"
for pair in "auth $AUTH" "product $PRODUCT" "cart $CART" "order $ORDER"; do
  set -- $pair
  check "$1-service /ready" "$(status GET "$2/ready")" "200"
done

bold "3. Authentication"
EMAIL="smoke+$(date +%s)@shopwave.io"
REG=$(body POST "$AUTH/api/auth/register" \
  "{\"email\":\"$EMAIL\",\"password\":\"Smoke@1234\",\"fullName\":\"Smoke Tester\"}")
TOKEN=$(jget "$REG" token)
[ -n "$TOKEN" ] && { green "  ✓ register returned a token"; PASS=$((PASS+1)); } \
                || { red "  ✗ register did not return a token: $REG"; FAIL=$((FAIL+1)); }

check "duplicate registration rejected" \
  "$(status POST "$AUTH/api/auth/register" "{\"email\":\"$EMAIL\",\"password\":\"Smoke@1234\",\"fullName\":\"Dup\"}")" "409"
check "weak password rejected" \
  "$(status POST "$AUTH/api/auth/register" '{"email":"weak@x.io","password":"abc","fullName":"Weak"}')" "422"
check "login with seeded demo account" \
  "$(status POST "$AUTH/api/auth/login" '{"email":"demo@shopwave.io","password":"Demo@1234"}')" "200"
check "login with wrong password" \
  "$(status POST "$AUTH/api/auth/login" '{"email":"demo@shopwave.io","password":"nope12345"}')" "401"
check "/me without a token" "$(status GET "$AUTH/api/auth/me")" "401"
check "/me with a token"    "$(status GET "$AUTH/api/auth/me" "" "$TOKEN")" "200"

ADMIN=$(body POST "$AUTH/api/auth/login" '{"email":"admin@shopwave.io","password":"Admin@123"}')
ADMIN_TOKEN=$(jget "$ADMIN" token)

bold "4. Product catalogue"
check "list products"            "$(status GET "$PRODUCT/api/products")" "200"
check "filter by category"       "$(status GET "$PRODUCT/api/products?category=electronics")" "200"
check "filter by price range"    "$(status GET "$PRODUCT/api/products?minPrice=50&maxPrice=200")" "200"
check "safe search"              "$(status GET "$PRODUCT/api/products?search=headphones")" "200"
check "filter metadata"          "$(status GET "$PRODUCT/api/products/meta/filters")" "200"
check "categories"               "$(status GET "$PRODUCT/api/categories")" "200"
check "invalid sort rejected"    "$(status GET "$PRODUCT/api/products?sort=DROP")" "422"
check "oversized limit rejected" "$(status GET "$PRODUCT/api/products?limit=99999")" "422"
check "unknown product -> 404"   "$(status GET "$PRODUCT/api/products/00000000-0000-4000-8000-000000000000")" "404"

# Resolve a known SEEDED product by slug rather than "newest in stock".
# This script creates products of its own further down, so "newest" would
# drift onto a previous run's leftover widget — which has had its stock
# whittled away by earlier checkouts and then fails to accept quantity 2.
PRODUCTS=$(body GET "$PRODUCT/api/products/aurora-wireless-headphones")
PRODUCT_ID=$(jget "$PRODUCTS" id)
[ -n "$PRODUCT_ID" ] && { green "  ✓ resolved seeded product ($PRODUCT_ID)"; PASS=$((PASS+1)); } \
                     || { red "  ✗ could not resolve the seeded product — is seed.sql applied?"; FAIL=$((FAIL+1)); }

bold "5. Admin authorisation"
check "create product anonymously" \
  "$(status POST "$PRODUCT/api/products" '{"name":"Hack","price":1,"imageUrl":"https://x/i.png"}')" "401"
check "create product as customer" \
  "$(status POST "$PRODUCT/api/products" '{"name":"Hack","price":1,"imageUrl":"https://x/i.png"}' "$TOKEN")" "403"
# Unique name per run: the slug is derived from the name and is UNIQUE, so a
# fixed name would 409 on the second run of this script.
WIDGET="Smoke Test Widget $(date +%s)"
check "create product as admin" \
  "$(status POST "$PRODUCT/api/products" \
     "{\"name\":\"$WIDGET\",\"price\":9.99,\"imageUrl\":\"https://picsum.photos/seed/smoke/800/800\",\"stock\":5}" \
     "$ADMIN_TOKEN")" "201"
check "duplicate product name rejected (unique slug)" \
  "$(status POST "$PRODUCT/api/products" \
     "{\"name\":\"$WIDGET\",\"price\":9.99,\"imageUrl\":\"https://picsum.photos/seed/smoke/800/800\",\"stock\":5}" \
     "$ADMIN_TOKEN")" "409"

# Clean up so repeated runs don't litter the catalogue with test widgets.
WIDGET_SLUG=$(echo "$WIDGET" | tr '[:upper:] ' '[:lower:]-')
WIDGET_ID=$(jget "$(body GET "$PRODUCT/api/products/$WIDGET_SLUG")" id)
if [ -n "$WIDGET_ID" ]; then
  check "delete product as admin" \
    "$(status DELETE "$PRODUCT/api/products/$WIDGET_ID" "" "$ADMIN_TOKEN")" "204"
fi

bold "6. Cart"
check "cart requires auth"  "$(status GET "$CART/api/cart")" "401"
check "empty cart"          "$(status GET "$CART/api/cart" "" "$TOKEN")" "200"
check "add to cart"         "$(status POST "$CART/api/cart/items" "{\"productId\":\"$PRODUCT_ID\",\"quantity\":2}" "$TOKEN")" "201"
check "non-uuid product id" "$(status POST "$CART/api/cart/items" '{"productId":"abc","quantity":1}' "$TOKEN")" "422"
check "zero quantity"       "$(status POST "$CART/api/cart/items" "{\"productId\":\"$PRODUCT_ID\",\"quantity\":0}" "$TOKEN")" "422"
check "update quantity"     "$(status PATCH "$CART/api/cart/items/$PRODUCT_ID" '{"quantity":1}' "$TOKEN")" "200"
check "cart count"          "$(status GET "$CART/api/cart/count" "" "$TOKEN")" "200"

bold "7. Checkout"
ADDRESS='{"shippingAddress":{"fullName":"Smoke Tester","email":"smoke@shopwave.io","address1":"221B Baker Street","city":"London","postalCode":"NW16XE","country":"United Kingdom"},"paymentMethod":"cod"}'
check "checkout requires auth"    "$(status POST "$ORDER/api/orders" "$ADDRESS")" "401"
check "checkout without address"  "$(status POST "$ORDER/api/orders" '{"paymentMethod":"cod"}' "$TOKEN")" "422"

ORDER_RESP=$(body POST "$ORDER/api/orders" "$ADDRESS" "$TOKEN")
ORDER_ID=$(jget "$ORDER_RESP" id)
ORDER_NUMBER=$(jget "$ORDER_RESP" orderNumber)
[ -n "$ORDER_NUMBER" ] && { green "  ✓ order placed ($ORDER_NUMBER)"; PASS=$((PASS+1)); } \
                       || { red "  ✗ order failed: $ORDER_RESP"; FAIL=$((FAIL+1)); }

check "cart emptied after checkout" \
  "$(body GET "$CART/api/cart" "" "$TOKEN" | grep -c '"items":\[\]')" "1"
check "checkout with an empty cart" "$(status POST "$ORDER/api/orders" "$ADDRESS" "$TOKEN")" "400"
check "order history"               "$(status GET "$ORDER/api/orders" "" "$TOKEN")" "200"
check "read own order"              "$(status GET "$ORDER/api/orders/$ORDER_ID" "" "$TOKEN")" "200"
check "admin reads any order"       "$(status GET "$ORDER/api/orders/$ORDER_ID" "" "$ADMIN_TOKEN")" "200"
check "customer cannot set status"  "$(status PATCH "$ORDER/api/orders/$ORDER_ID/status" '{"status":"shipped"}' "$TOKEN")" "403"
check "illegal transition"          "$(status PATCH "$ORDER/api/orders/$ORDER_ID/status" '{"status":"delivered"}' "$ADMIN_TOKEN")" "400"
check "legal transition"            "$(status PATCH "$ORDER/api/orders/$ORDER_ID/status" '{"status":"processing"}' "$ADMIN_TOKEN")" "200"
check "admin stats"                 "$(status GET "$ORDER/api/orders/admin/stats" "" "$ADMIN_TOKEN")" "200"

bold "8. Deliberately vulnerable endpoints (WAF test targets)"
echo "  These MUST return 200 with no WAF in front, and 403 once AWS WAF is attached."
check "GET /api/products/search (benign)" \
  "$(status GET "$PRODUCT/api/products/search?q=headphones")" "200"
check "GET /api/products/search (SQLi payload)" \
  "$(status GET "$PRODUCT/api/products/search?q=%27%20OR%20%271%27%3D%271")" "200"
check "GET /api/products/legacy-list (ORDER BY injection)" \
  "$(status GET "$PRODUCT/api/products/legacy-list?orderBy=p.price%20DESC")" "200"
check "GET /api/orders/admin/report (SQLi payload, admin)" \
  "$(status GET "$ORDER/api/orders/admin/report?status=pending%27%20OR%20%271%27%3D%271" "" "$ADMIN_TOKEN")" "200"

echo
echo "════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "ALL $PASS CHECKS PASSED"
else
  red "$PASS passed, $FAIL FAILED"
fi
echo "════════════════════════════════════════"
exit $((FAIL > 0))
