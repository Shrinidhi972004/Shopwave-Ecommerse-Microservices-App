'use strict';

const { query } = require('../config/db');

/**
 * Data access for product_service.products / .categories.
 *
 * Everything in this file is parameterised EXCEPT the two functions at the
 * bottom, which are intentionally injectable for WAF testing and are clearly
 * marked. Do not copy those two as a pattern.
 */

const PRODUCT_COLUMNS = `
  p.id, p.sku, p.name, p.slug, p.description, p.brand,
  p.price, p.currency, p.image_url, p.stock, p.rating, p.review_count,
  p.is_active, p.category_id, p.created_at, p.updated_at,
  c.name AS category_name, c.slug AS category_slug
`;

const FROM_PRODUCTS = `
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

// Whitelist of sortable columns. The client sends a key; we map it to trusted
// SQL. The client's raw string never reaches the query text.
const SORT_MAP = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  name_asc: 'p.name ASC',
  name_desc: 'p.name DESC',
  rating: 'p.rating DESC, p.review_count DESC',
};

/**
 * Paginated product list with filtering.
 * Builds the WHERE clause dynamically but pushes every *value* into the params
 * array — the SQL text only ever grows by placeholders we control.
 */
async function findAll(filters = {}) {
  const {
    category,
    search,
    minPrice,
    maxPrice,
    brand,
    inStock,
    sort = 'newest',
    limit = 20,
    offset = 0,
    includeInactive = false,
  } = filters;

  const where = [];
  const params = [];

  if (!includeInactive) where.push('p.is_active = TRUE');

  if (category) {
    params.push(category);
    // Accept either the numeric id or the slug.
    where.push(`(c.slug = $${params.length} OR p.category_id::text = $${params.length})`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
  }
  if (brand) {
    params.push(brand);
    where.push(`LOWER(p.brand) = LOWER($${params.length})`);
  }
  if (minPrice !== undefined) {
    params.push(minPrice);
    where.push(`p.price >= $${params.length}`);
  }
  if (maxPrice !== undefined) {
    params.push(maxPrice);
    where.push(`p.price <= $${params.length}`);
  }
  if (inStock) where.push('p.stock > 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORT_MAP[sort] || SORT_MAP.newest;

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(offset);
  const offsetPlaceholder = `$${params.length}`;

  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params
  );

  // Total matching rows, ignoring pagination — the frontend needs it for pager UI.
  const countParams = params.slice(0, params.length - 2);
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total ${FROM_PRODUCTS} ${whereSql}`,
    countParams
  );

  return { items: rows, total: countRows[0].total };
}

async function findById(id) {
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} WHERE p.id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findBySlug(slug) {
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} WHERE p.slug = $1 LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

/** Bulk lookup — used by cart-service and order-service to hydrate line items. */
async function findByIds(ids) {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS} ${FROM_PRODUCTS} WHERE p.id = ANY($1::uuid[])`,
    [ids]
  );
  return rows;
}

async function create(data) {
  const { rows } = await query(
    `INSERT INTO products
       (sku, name, slug, description, brand, price, image_url, stock, category_id, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.sku,
      data.name,
      data.slug,
      data.description ?? '',
      data.brand ?? null,
      data.price,
      data.imageUrl,
      data.stock ?? 0,
      data.categoryId ?? null,
      data.isActive ?? true,
    ]
  );
  return rows[0];
}

/**
 * Partial update. COALESCE means "only overwrite when the caller sent a value",
 * so a PATCH with one field does not blank out the rest.
 */
async function update(id, data) {
  const { rows } = await query(
    `UPDATE products SET
       name        = COALESCE($2,  name),
       description = COALESCE($3,  description),
       brand       = COALESCE($4,  brand),
       price       = COALESCE($5,  price),
       image_url   = COALESCE($6,  image_url),
       stock       = COALESCE($7,  stock),
       category_id = COALESCE($8,  category_id),
       is_active   = COALESCE($9,  is_active),
       slug        = COALESCE($10, slug)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.name ?? null,
      data.description ?? null,
      data.brand ?? null,
      data.price ?? null,
      data.imageUrl ?? null,
      data.stock ?? null,
      data.categoryId ?? null,
      data.isActive ?? null,
      data.slug ?? null,
    ]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rowCount } = await query('DELETE FROM products WHERE id = $1', [id]);
  return rowCount > 0;
}

/**
 * Atomically decrement stock, refusing to go negative.
 * The `stock >= $2` predicate in the UPDATE is what makes this safe under
 * concurrency: two simultaneous checkouts for the last unit cannot both win,
 * because the second one matches zero rows.
 */
async function decrementStock(id, quantity) {
  const { rows } = await query(
    `UPDATE products
        SET stock = stock - $2
      WHERE id = $1 AND stock >= $2
      RETURNING id, stock`,
    [id, quantity]
  );
  return rows[0] || null;
}

/**
 * Return units to the catalogue — the compensating action for decrementStock.
 * Used when a checkout fails partway through, or when an order is cancelled.
 */
async function incrementStock(id, quantity) {
  const { rows } = await query(
    `UPDATE products
        SET stock = stock + $2
      WHERE id = $1
      RETURNING id, stock`,
    [id, quantity]
  );
  return rows[0] || null;
}

async function listBrands() {
  const { rows } = await query(
    `SELECT DISTINCT brand FROM products
      WHERE brand IS NOT NULL AND is_active
      ORDER BY brand ASC`
  );
  return rows.map((r) => r.brand);
}

async function priceRange() {
  const { rows } = await query(
    `SELECT COALESCE(MIN(price), 0)::float AS min,
            COALESCE(MAX(price), 0)::float AS max
       FROM products WHERE is_active`
  );
  return rows[0];
}

// ─── Categories ─────────────────────────────────────────────────────────────

async function listCategories() {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.description,
            COUNT(p.id)::int AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active
      GROUP BY c.id
      ORDER BY c.name ASC`
  );
  return rows;
}

async function createCategory({ name, slug, description }) {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, slug, description ?? null]
  );
  return rows[0];
}

async function categoryExists(id) {
  const { rows } = await query('SELECT 1 FROM categories WHERE id = $1', [id]);
  return rows.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️  DELIBERATELY VULNERABLE — DO NOT COPY, DO NOT SHIP TO PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * VULNERABLE ON PURPOSE - for WAF testing
 *
 * Raw string interpolation of `term` straight into the SQL text. This is a
 * textbook SQL injection sink, left here so AWS WAF's SQLi managed rule group
 * can be exercised end-to-end against a target that genuinely responds.
 *
 * Payloads that work against this:
 *   ' OR '1'='1
 *   ' UNION SELECT NULL,NULL,NULL,NULL,NULL,NULL,NULL--
 *   '; DROP TABLE products--        (blocked: pg rejects multi-statement here)
 *
 * The safe equivalent is findAll({ search }) above, which parameterises the
 * same lookup. Delete this function once WAF testing is finished.
 */
async function searchRawUnsafe(term) {
  const sql = `
    SELECT ${PRODUCT_COLUMNS}
    ${FROM_PRODUCTS}
    WHERE p.is_active = TRUE
      AND (p.name ILIKE '%${term}%' OR p.description ILIKE '%${term}%')
    ORDER BY p.created_at DESC
    LIMIT 50
  `;
  const { rows } = await query(sql);
  return rows;
}

/**
 * VULNERABLE ON PURPOSE - for WAF testing
 *
 * Second-order sink: the ORDER BY clause is built from an unvalidated string.
 * ORDER BY cannot be parameterised in Postgres, so the *correct* fix is the
 * SORT_MAP whitelist used by findAll(). This version omits it on purpose.
 *
 * Payload: ?orderBy=(CASE WHEN (SELECT 1)=1 THEN name ELSE price END)
 */
async function listWithRawOrderUnsafe(orderBy) {
  const sql = `
    SELECT ${PRODUCT_COLUMNS}
    ${FROM_PRODUCTS}
    WHERE p.is_active = TRUE
    ORDER BY ${orderBy}
    LIMIT 50
  `;
  const { rows } = await query(sql);
  return rows;
}

module.exports = {
  findAll,
  findById,
  findBySlug,
  findByIds,
  create,
  update,
  remove,
  decrementStock,
  incrementStock,
  listBrands,
  priceRange,
  listCategories,
  createCategory,
  categoryExists,
  // Vulnerable-on-purpose exports, isolated at the end of the list:
  searchRawUnsafe,
  listWithRawOrderUnsafe,
};
