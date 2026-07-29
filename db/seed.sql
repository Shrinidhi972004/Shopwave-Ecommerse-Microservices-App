-- ============================================================================
--  E-COMMERCE PLATFORM — SEED DATA
-- ============================================================================
--  Run AFTER schema.sql:
--    psql "$DATABASE_URL" -f db/seed.sql
--
--  Idempotent: safe to run repeatedly (ON CONFLICT DO NOTHING everywhere).
--
--  DEMO ACCOUNTS
--    admin@shopwave.io / Admin@123   (role: admin)
--    demo@shopwave.io  / Demo@1234   (role: customer)
--  Hashes below are real bcrypt digests, cost 10. Rotate before any real use.
--
--  Product images use picsum.photos deterministic seed URLs — no API key, no
--  rate limit, and the same URL always returns the same image.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
INSERT INTO auth_service.users (email, password_hash, full_name, role) VALUES
  ('admin@shopwave.io', '$2b$10$m/7tYVf.EJoLG4e8N/t3SOBB6wJYPI7DHjEQoOFlk7WD.kic1SuTW', 'Ava Administrator', 'admin'),
  ('demo@shopwave.io',  '$2b$10$lU.iIxbJbefUvpmZi1UVGuVbBY9Mjt3AeNNApWUPGhgNKrHoOfh1i', 'Demo Customer',     'customer')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
INSERT INTO product_service.categories (id, name, slug, description) VALUES
  (1, 'Electronics',   'electronics',   'Audio, wearables, and everyday tech.'),
  (2, 'Apparel',       'apparel',       'Everyday essentials and outerwear.'),
  (3, 'Home & Living', 'home-living',   'Small upgrades for your space.'),
  (4, 'Accessories',   'accessories',   'Bags, wallets, and carry goods.'),
  (5, 'Footwear',      'footwear',      'Sneakers, boots, and trainers.')
ON CONFLICT (id) DO NOTHING;

-- Keep the SERIAL in sync after explicit-id inserts, otherwise the next
-- INSERT without an id collides with id=1.
SELECT setval(
  pg_get_serial_sequence('product_service.categories', 'id'),
  COALESCE((SELECT MAX(id) FROM product_service.categories), 1),
  true
);


-- ---------------------------------------------------------------------------
-- Products — 18 items across 5 categories
-- ---------------------------------------------------------------------------
INSERT INTO product_service.products
  (sku, name, slug, description, brand, price, image_url, stock, rating, review_count, category_id)
VALUES
  -- Electronics -------------------------------------------------------------
  ('ELEC-1001', 'Aurora Wireless Headphones',
   'aurora-wireless-headphones',
   'Over-ear active noise cancelling headphones with 40-hour battery life, plush memory-foam earcups, and multipoint Bluetooth 5.3 pairing.',
   'Aurora', 249.99, 'https://picsum.photos/seed/headphones-aurora/800/800', 42, 4.7, 318, 1),

  ('ELEC-1002', 'Pulse Fitness Smartwatch',
   'pulse-fitness-smartwatch',
   'AMOLED always-on display, continuous heart-rate and SpO2 tracking, built-in GPS, and 7-day battery. 5ATM water resistant.',
   'Pulse', 179.00, 'https://picsum.photos/seed/smartwatch-pulse/800/800', 65, 4.4, 512, 1),

  ('ELEC-1003', 'Nimbus Bluetooth Speaker',
   'nimbus-bluetooth-speaker',
   'Pocketable 360-degree speaker with passive bass radiator, IP67 dust and water rating, and 18 hours of playback.',
   'Nimbus', 89.50, 'https://picsum.photos/seed/speaker-nimbus/800/800', 120, 4.5, 227, 1),

  ('ELEC-1004', 'Vertex 4K Webcam',
   'vertex-4k-webcam',
   'Ultra HD webcam with Sony STARVIS sensor, auto low-light correction, dual noise-cancelling mics, and a magnetic privacy shutter.',
   'Vertex', 129.99, 'https://picsum.photos/seed/webcam-vertex/800/800', 33, 4.2, 96, 1),

  ('ELEC-1005', 'Cobalt Mechanical Keyboard',
   'cobalt-mechanical-keyboard',
   '75% hot-swappable mechanical keyboard, gasket-mounted plate, PBT double-shot keycaps, and per-key RGB. USB-C and 2.4GHz wireless.',
   'Cobalt', 149.00, 'https://picsum.photos/seed/keyboard-cobalt/800/800', 58, 4.8, 741, 1),

  ('ELEC-1006', 'Helio 20K Power Bank',
   'helio-20k-power-bank',
   '20,000mAh USB-C PD power bank delivering 65W — enough to fast-charge a laptop. Digital charge display and pass-through charging.',
   'Helio', 59.99, 'https://picsum.photos/seed/powerbank-helio/800/800', 200, 4.3, 189, 1),

  -- Apparel -----------------------------------------------------------------
  ('APRL-2001', 'Everyday Organic Cotton Tee',
   'everyday-organic-cotton-tee',
   'Midweight 180gsm GOTS-certified organic cotton. Pre-shrunk, garment-dyed, and cut for a relaxed regular fit.',
   'Northbound', 32.00, 'https://picsum.photos/seed/tshirt-northbound/800/800', 340, 4.6, 903, 2),

  ('APRL-2002', 'Alpine Merino Wool Sweater',
   'alpine-merino-wool-sweater',
   '100% extra-fine 19.5 micron merino. Naturally temperature-regulating and odour-resistant, with ribbed crew neck and cuffs.',
   'Alpine Co', 128.00, 'https://picsum.photos/seed/sweater-alpine/800/800', 74, 4.7, 214, 2),

  ('APRL-2003', 'Ridgeline Rain Shell',
   'ridgeline-rain-shell',
   'Fully seam-sealed 2.5-layer shell rated 15k/15k. Packs into its own chest pocket, with an adjustable storm hood and pit zips.',
   'Ridgeline', 189.00, 'https://picsum.photos/seed/jacket-ridgeline/800/800', 46, 4.5, 158, 2),

  ('APRL-2004', 'Selvedge Slim Denim',
   'selvedge-slim-denim',
   '13.5oz raw selvedge denim milled in Okayama. Slim straight leg, button fly, and a hidden coin pocket. Sanforized.',
   'Northbound', 148.00, 'https://picsum.photos/seed/denim-northbound/800/800', 88, 4.4, 271, 2),

  -- Home & Living -----------------------------------------------------------
  ('HOME-3001', 'Terra Ceramic Pour-Over Set',
   'terra-ceramic-pour-over-set',
   'Hand-glazed stoneware dripper and 600ml carafe. Includes a stainless reusable filter — no paper required.',
   'Terra', 68.00, 'https://picsum.photos/seed/pourover-terra/800/800', 92, 4.6, 143, 3),

  ('HOME-3002', 'Lumen Adjustable Desk Lamp',
   'lumen-adjustable-desk-lamp',
   'Flicker-free LED with five colour temperatures and stepless dimming. Weighted matte-aluminium base and a USB-C charging port.',
   'Lumen', 94.99, 'https://picsum.photos/seed/lamp-lumen/800/800', 61, 4.5, 187, 3),

  ('HOME-3003', 'Cloudspun Waffle Throw',
   'cloudspun-waffle-throw',
   'Stonewashed 100% Turkish cotton waffle weave, 130 x 170cm. Gets noticeably softer with every wash.',
   'Cloudspun', 78.00, 'https://picsum.photos/seed/throw-cloudspun/800/800', 110, 4.8, 322, 3),

  ('HOME-3004', 'Verdant Self-Watering Planter',
   'verdant-self-watering-planter',
   'Sub-irrigated matte ceramic planter with a two-week reservoir and visible water gauge. Fits 15cm nursery pots.',
   'Verdant', 42.50, 'https://picsum.photos/seed/planter-verdant/800/800', 155, 4.3, 98, 3),

  -- Accessories -------------------------------------------------------------
  ('ACCS-4001', 'Meridian Leather Weekender',
   'meridian-leather-weekender',
   'Full-grain vegetable-tanned leather duffel, 42L, with solid brass hardware, a cotton-twill lining, and a padded laptop sleeve.',
   'Meridian', 329.00, 'https://picsum.photos/seed/duffel-meridian/800/800', 22, 4.9, 76, 4),

  ('ACCS-4002', 'Transit Commuter Backpack',
   'transit-commuter-backpack',
   '22L recycled ballistic nylon with a weatherproof TPU coating. Suspended 16-inch laptop compartment and a luggage pass-through.',
   'Transit', 145.00, 'https://picsum.photos/seed/backpack-transit/800/800', 84, 4.6, 402, 4),

  ('ACCS-4003', 'Slate Minimalist Wallet',
   'slate-minimalist-wallet',
   'RFID-blocking bifold in pebbled full-grain leather. Holds eight cards plus folded notes at just 7mm thick.',
   'Slate', 54.00, 'https://picsum.photos/seed/wallet-slate/800/800', 240, 4.2, 511, 4),

  -- Footwear ----------------------------------------------------------------
  ('FOOT-5001', 'Court Classic Leather Sneaker',
   'court-classic-leather-sneaker',
   'Full-grain leather upper on a vulcanised rubber cupsole, with a cushioned OrthoLite footbed and a padded collar.',
   'Court', 118.00, 'https://picsum.photos/seed/sneaker-court/800/800', 96, 4.5, 289, 5)
ON CONFLICT (sku) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
SELECT 'users'      AS table, COUNT(*) FROM auth_service.users
UNION ALL SELECT 'categories', COUNT(*) FROM product_service.categories
UNION ALL SELECT 'products',   COUNT(*) FROM product_service.products;
