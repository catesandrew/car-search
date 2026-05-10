import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const listings = sqliteTable('listings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vin: text('vin'),
  externalId: text('external_id'),
  source: text('source').notNull(), // 'cars.com' | 'autotrader' | 'kbb' | 'facebook'
  url: text('url'),
  imageUrl: text('image_url'),
  year: integer('year'),
  make: text('make'),
  model: text('model'),
  trim: text('trim'),
  price: integer('price'), // cents
  mileage: integer('mileage'),
  location: text('location'),
  dealerName: text('dealer_name'),
  dealerType: text('dealer_type'), // 'dealer' | 'private'
  oneOwner: integer('one_owner', { mode: 'boolean' }).default(false),
  noAccidents: integer('no_accidents', { mode: 'boolean' }).default(false),
  personalUse: integer('personal_use', { mode: 'boolean' }).default(false),
  dealRating: text('deal_rating'),
  dealScore: real('deal_score'),
  viewStatus: text('view_status').default('new'), // 'new' | 'seen'
  isFavorited: integer('is_favorited', { mode: 'boolean' }).default(false),
  isDismissed: integer('is_dismissed', { mode: 'boolean' }).default(false),
  favoritedAt: text('favorited_at'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
}, (table) => [
  // Partial unique indexes (VIN, source+external_id) created via raw SQL in migrate.ts
  index('idx_listings_view_status').on(table.viewStatus),
  index('idx_listings_is_favorited').on(table.isFavorited),
  index('idx_listings_is_dismissed').on(table.isDismissed),
  index('idx_listings_source').on(table.source),
  index('idx_listings_deal_score').on(table.dealScore),
  index('idx_listings_first_seen').on(table.firstSeenAt),
]);

export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: integer('listing_id').references(() => listings.id),
  price: integer('price'), // cents
  observedAt: text('observed_at').notNull(),
}, (table) => [
  index('idx_price_history_listing').on(table.listingId),
]);

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: integer('listing_id').references(() => listings.id),
  type: text('type').default('note'), // 'note' | 'call' | 'system'
  content: text('content').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => [
  index('idx_notes_listing').on(table.listingId),
]);

export const scrapeRuns = sqliteTable('scrape_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  status: text('status').default('running'), // 'running' | 'completed' | 'failed'
  newCount: integer('new_count').default(0),
  updatedCount: integer('updated_count').default(0),
  error: text('error'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_scrape_runs_started').on(table.startedAt),
]);

export const searchConfig = sqliteTable('search_config', {
  id: integer('id').primaryKey().default(1),
  zip: text('zip'),
  fbLocation: text('fb_location'),
  radiusMiles: integer('radius_miles').default(150),
  priceMax: integer('price_max').default(1500000), // $15,000 in cents
  mileageMax: integer('mileage_max').default(200000),
  yearMin: integer('year_min').default(2005),
  yearMax: integer('year_max').default(2025),
  makesModels: text('makes_models').default('["Toyota Tacoma","Toyota 4Runner"]'),
  cronInterval: integer('cron_interval').default(30), // minutes
  fbEnabled: integer('fb_enabled', { mode: 'boolean' }).default(false),
  lastViewedAt: text('last_viewed_at'),
});
