'use strict';

const model = require('../models/productModel');
const { ApiError, asyncHandler } = require('../utils/ApiError');

/** DB row (snake_case) -> API shape (camelCase). Prices come back as numbers. */
function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    description: row.description,
    brand: row.brand,
    // NUMERIC arrives from pg as a string to preserve precision; the frontend
    // wants a number for formatting.
    price: Number(row.price),
    currency: row.currency,
    imageUrl: row.image_url,
    stock: row.stock,
    inStock: row.stock > 0,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    isActive: row.is_active,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    categorySlug: row.category_slug ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** URL-safe slug from a product name. */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/**
 * GET /api/products
 * Public. Supports category, search, price range, brand, stock, sort, paging.
 */
const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { items, total } = await model.findAll({
    category: q.category,
    search: q.search,
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    brand: q.brand,
    inStock: q.inStock,
    sort: q.sort,
    limit: q.limit,
    offset: q.offset,
    // Only admins may see deactivated products.
    includeInactive: req.user?.role === 'admin' && q.includeInactive,
  });

  res.json({
    products: items.map(toApi),
    pagination: {
      total,
      limit: q.limit,
      offset: q.offset,
      hasMore: q.offset + items.length < total,
    },
  });
});

/** GET /api/products/:id — accepts a UUID or a slug. */
const getOne = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  const product = isUuid ? await model.findById(id) : await model.findBySlug(id);
  if (!product) throw ApiError.notFound('Product not found');
  if (!product.is_active && req.user?.role !== 'admin') {
    throw ApiError.notFound('Product not found');
  }
  res.json({ product: toApi(product) });
});

/**
 * POST /api/products/batch
 * Service-to-service: resolve many products in one call so cart-service and
 * order-service avoid an N+1 storm of HTTP requests.
 */
const getBatch = asyncHandler(async (req, res) => {
  const products = await model.findByIds(req.body.ids);
  res.json({ products: products.map(toApi) });
});

/** GET /api/products/meta/filters — powers the storefront filter sidebar. */
const filterMeta = asyncHandler(async (_req, res) => {
  const [categories, brands, range] = await Promise.all([
    model.listCategories(),
    model.listBrands(),
    model.priceRange(),
  ]);
  res.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      productCount: c.product_count,
    })),
    brands,
    priceRange: { min: Math.floor(range.min), max: Math.ceil(range.max) },
  });
});

/** GET /api/categories */
const listCategories = asyncHandler(async (_req, res) => {
  const categories = await model.listCategories();
  res.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      productCount: c.product_count,
    })),
  });
});

/** POST /api/categories — admin */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const slug = req.body.slug || slugify(name);
  const category = await model.createCategory({ name, slug, description });
  res.status(201).json({ category });
});

/** POST /api/products — admin */
const create = asyncHandler(async (req, res) => {
  const body = req.body;

  if (body.categoryId !== undefined && !(await model.categoryExists(body.categoryId))) {
    throw ApiError.badRequest('categoryId does not reference an existing category');
  }

  const slug = body.slug || slugify(body.name);
  const sku = body.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;

  const product = await model.create({ ...body, slug, sku });
  res.status(201).json({ product: toApi(product) });
});

/** PATCH /api/products/:id — admin */
const update = asyncHandler(async (req, res) => {
  const existing = await model.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Product not found');

  if (req.body.categoryId !== undefined && !(await model.categoryExists(req.body.categoryId))) {
    throw ApiError.badRequest('categoryId does not reference an existing category');
  }

  const updated = await model.update(req.params.id, req.body);
  res.json({ product: toApi(updated) });
});

/** DELETE /api/products/:id — admin */
const remove = asyncHandler(async (req, res) => {
  const deleted = await model.remove(req.params.id);
  if (!deleted) throw ApiError.notFound('Product not found');
  res.status(204).send();
});

/**
 * POST /api/products/:id/decrement-stock
 * Service-to-service, called by order-service during checkout.
 */
const decrementStock = asyncHandler(async (req, res) => {
  const result = await model.decrementStock(req.params.id, req.body.quantity);
  if (!result) throw ApiError.conflict('Insufficient stock for this product');
  res.json({ id: result.id, stock: result.stock });
});

/**
 * POST /api/products/:id/restock
 * Service-to-service compensating action: order-service calls this to return
 * units when a checkout fails partway through or an order is cancelled.
 */
const restock = asyncHandler(async (req, res) => {
  const result = await model.incrementStock(req.params.id, req.body.quantity);
  if (!result) throw ApiError.notFound('Product not found');
  res.json({ id: result.id, stock: result.stock });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️  DELIBERATELY VULNERABLE ENDPOINTS — WAF TEST TARGETS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/products/search?q=...
 *
 * VULNERABLE ON PURPOSE - for WAF testing
 *
 * Note what is missing compared to every other handler in this file: there is
 * no validateQuery() middleware on the route, and `q` goes straight into the
 * SQL string. Both omissions are intentional.
 *
 * Try:  curl "http://localhost:4002/api/products/search?q=%27%20OR%20%271%27%3D%271"
 */
const searchUnsafe = asyncHandler(async (req, res) => {
  const term = req.query.q ?? '';

  // VULNERABLE ON PURPOSE - for WAF testing: raw, unsanitised concatenation.
  const products = await model.searchRawUnsafe(term);

  res.json({
    products: products.map(toApi),
    count: products.length,
    _warning: 'This endpoint is intentionally vulnerable to SQL injection (WAF test target).',
  });
});

/**
 * GET /api/products/legacy-list?orderBy=...
 *
 * VULNERABLE ON PURPOSE - for WAF testing
 * Unvalidated ORDER BY injection sink.
 */
const legacyListUnsafe = asyncHandler(async (req, res) => {
  const orderBy = req.query.orderBy || 'p.created_at DESC';

  // VULNERABLE ON PURPOSE - for WAF testing: unvalidated ORDER BY clause.
  const products = await model.listWithRawOrderUnsafe(orderBy);

  res.json({
    products: products.map(toApi),
    count: products.length,
    _warning: 'This endpoint is intentionally vulnerable to SQL injection (WAF test target).',
  });
});

module.exports = {
  list,
  getOne,
  getBatch,
  filterMeta,
  listCategories,
  createCategory,
  create,
  update,
  remove,
  decrementStock,
  restock,
  searchUnsafe,
  legacyListUnsafe,
};
