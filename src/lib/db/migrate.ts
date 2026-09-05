import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'car-search.db');

/**
 * Run raw SQL migrations that Drizzle ORM can't handle
 * (partial unique indexes with WHERE clauses).
 * Called after drizzle-kit push.
 */
export function runCustomMigrations() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');

  // Partial unique index on VIN (only for non-null VINs)
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_vin_unique
    ON listings(vin) WHERE vin IS NOT NULL;
  `);

  // Composite unique index for source + external_id (FB dedup)
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_source_extid
    ON listings(source, external_id) WHERE external_id IS NOT NULL;
  `);

  // Add fb_location column if it doesn't exist (added after initial schema)
  const columns = sqlite.prepare("PRAGMA table_info(search_config)").all() as { name: string }[];
  if (!columns.some(c => c.name === 'fb_location')) {
    sqlite.exec(`ALTER TABLE search_config ADD COLUMN fb_location TEXT;`);
  }

  // Seed default search_config if empty
  const configCount = sqlite.prepare('SELECT COUNT(*) as count FROM search_config').get() as { count: number };
  if (configCount.count === 0) {
    sqlite.prepare(`
      INSERT INTO search_config (id, zip, fb_location, radius_miles, price_max, mileage_max, year_min, year_max, makes_models, cron_interval, fb_enabled)
      VALUES (1, NULL, NULL, 150, 1500000, 200000, 2005, 2025, '[]', 30, 0)
    `).run();
  }

  sqlite.close();
}

// Run if called directly
if (require.main === module) {
  runCustomMigrations();
  console.log('Custom migrations complete.');
}
