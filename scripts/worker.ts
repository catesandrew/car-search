import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'car-search.db');

function getDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

function getCronInterval(): number {
  try {
    const db = getDb();
    const config = db.prepare('SELECT cron_interval FROM search_config WHERE id = 1').get() as { cron_interval: number } | undefined;
    db.close();
    return config?.cron_interval ?? 30;
  } catch {
    return 30;
  }
}

async function runScrapeFromWorker() {
  try {
    // Dynamic import to share code with the Next.js app
    const { runScrape } = await import('../src/lib/scrapers/runner.js');
    const result = await runScrape();
    if (result) {
      console.log(`[worker] Scrape complete: ${result.result.new} new, ${result.result.updated} updated`);
    } else {
      console.log('[worker] Scrape skipped (already running)');
    }
  } catch (err) {
    console.error('[worker] Scrape failed:', err);
  }
}

async function tick() {
  console.log(`[worker] Running scrape at ${new Date().toISOString()}`);
  await runScrapeFromWorker();

  // Re-read interval from DB on each tick (no restart needed on config change)
  const intervalMinutes = getCronInterval();
  console.log(`[worker] Next scrape in ${intervalMinutes} minutes`);
  setTimeout(tick, intervalMinutes * 60 * 1000);
}

console.log('[worker] Truck search cron worker started');
console.log(`[worker] DB path: ${DB_PATH}`);

// Wait 10 seconds before first run to let Next.js start
setTimeout(() => {
  tick();
}, 10000);
