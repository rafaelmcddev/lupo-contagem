import { integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const countingStatus = pgEnum('counting_status', ['active', 'finished']);

export const countings = pgTable('countings', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  prefixLengthUsed: integer('prefix_length_used').notNull(),
  status: countingStatus('status').notNull().default('active'),
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

export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  prefix: text('prefix').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skus = pgTable('skus', {
  barcode: text('barcode').primaryKey(),
  sku: text('sku').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
