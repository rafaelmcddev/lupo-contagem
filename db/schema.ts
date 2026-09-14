import { boolean, date, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const countingStatus = pgEnum('counting_status', ['active', 'finished']);
export const countingSource = pgEnum('counting_source', ['manual', 'xml']);

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const countings = pgTable('countings', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  name: text('name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  prefixLengthUsed: integer('prefix_length_used').notNull(),
  requireSkuUsed: boolean('require_sku_used').notNull().default(true),
  status: countingStatus('status').notNull().default('active'),
  source: countingSource('source').notNull().default('manual'),
  invoiceNumber: text('invoice_number'),
  supplierName: text('supplier_name'),
});

export const boxes = pgTable(
  'boxes',
  {
    id: serial('id').primaryKey(),
    countingId: integer('counting_id').notNull().references(() => countings.id),
    boxNumber: integer('box_number').notNull(),
    prefix: text('prefix').notNull(),
  },
  (table) => ({
    prefixUnique: uniqueIndex('boxes_counting_id_prefix_unique').on(table.countingId, table.prefix),
    boxNumberUnique: uniqueIndex('boxes_counting_id_box_number_unique').on(table.countingId, table.boxNumber),
  }),
);

export const scans = pgTable('scans', {
  id: serial('id').primaryKey(),
  boxId: integer('box_id').notNull().references(() => boxes.id),
  barcode: text('barcode').notNull(),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const groups = pgTable(
  'groups',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    prefix: text('prefix').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    prefixUnique: uniqueIndex('groups_store_id_prefix_unique').on(table.storeId, table.prefix),
  }),
);

export const skus = pgTable(
  'skus',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    barcode: text('barcode').notNull(),
    // Nullable: whether a SKU is required depends on the "Exigir SKU" setting,
    // enforced in the API routes — not a hard DB constraint, since that
    // setting can be toggled at any time and shouldn't invalidate existing rows.
    sku: text('sku'),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    barcodeUnique: uniqueIndex('skus_store_id_barcode_unique').on(table.storeId, table.barcode),
  }),
);

export const invoiceItems = pgTable('invoice_items', {
  id: serial('id').primaryKey(),
  countingId: integer('counting_id').notNull().references(() => countings.id),
  barcode: text('barcode').notNull(),
  sku: text('sku'),
  name: text('name'),
  expectedQty: integer('expected_qty').notNull(),
});

export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index('customers_store_id_idx').on(table.storeId),
  }),
);

export const sales = pgTable(
  'sales',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull().references(() => stores.id),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    saleDate: date('sale_date', { mode: 'string' }).notNull(),
    valueCents: integer('value_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index('sales_store_id_idx').on(table.storeId),
  }),
);
