import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { scrapeRuns, searchConfig } from '../db/schema';
import { searchCarDeals } from './mcp-client';
import { searchFacebook } from './facebook';
import { upsertListings } from './dedup';
import type { ScrapeResult, SearchConfig } from '../types';

const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Read the active search config from the DB.
 * Returns null if no config row exists.
 */
function loadSearchConfig(): SearchConfig | null {
  const row = db.select().from(searchConfig).limit(1).get();
  if (!row) return null;
  return {
    id: row.id,
    zip: row.zip ?? null,
    radiusMiles: row.radiusMiles ?? null,
    priceMax: row.priceMax ?? null,
    mileageMax: row.mileageMax ?? null,
    yearMin: row.yearMin ?? null,
    yearMax: row.yearMax ?? null,
    makesModels: row.makesModels ?? null,
    cronInterval: row.cronInterval ?? null,
    fbEnabled: row.fbEnabled ?? null,
    lastViewedAt: row.lastViewedAt ?? null,
  };
}

function mergeScrapeResults(a: ScrapeResult, b: ScrapeResult): ScrapeResult {
  return {
    new: a.new + b.new,
    updated: a.updated + b.updated,
    errors: [...a.errors, ...b.errors],
  };
}

/**
 * Run a full scrape cycle. Uses a DB-backed mutex to prevent concurrent runs.
 * Returns null if a scrape is already in progress.
 */
export async function runScrape(): Promise<{ runId: number; result: ScrapeResult } | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleThreshold = new Date(now.getTime() - STALE_RUN_THRESHOLD_MS).toISOString();

  // Mutex check: look for any running scrape
  const runningRun = db
    .select()
    .from(scrapeRuns)
    .where(eq(scrapeRuns.status, 'running'))
    .limit(1)
    .get();

  if (runningRun) {
    if (runningRun.startedAt > staleThreshold) {
      // Recent running job — skip
      console.log(`[runner] Scrape already running (id=${runningRun.id}), skipping`);
      return null;
    }
    // Stale job — mark as failed and proceed
    console.warn(`[runner] Found stale running scrape (id=${runningRun.id}), marking as failed`);
    db.update(scrapeRuns)
      .set({ status: 'failed', error: 'Timed out (stale)', completedAt: nowIso })
      .where(eq(scrapeRuns.id, runningRun.id))
      .run();
  }

  // Insert new scrape run
  const inserted = db
    .insert(scrapeRuns)
    .values({
      source: 'all',
      status: 'running',
      startedAt: nowIso,
      newCount: 0,
      updatedCount: 0,
    })
    .returning({ id: scrapeRuns.id })
    .get();

  const runId = inserted.id;
  let completed = false;
  let finalResult: ScrapeResult = { new: 0, updated: 0, errors: [] };

  try {
    const config = loadSearchConfig();
    if (!config) {
      throw new Error('No search config found in DB');
    }

    // Facebook scrape (first — faster, separate browser)
    console.log(`[runner] fbEnabled=${config.fbEnabled}, checking Facebook...`);
    if (config.fbEnabled) {
      console.log(`[runner] Starting Facebook scrape (runId=${runId})`);
      const fbListings = await searchFacebook(config);
      console.log(`[runner] Facebook returned ${fbListings.length} listings`);
      const fbResult = await upsertListings(fbListings, 'facebook');
      finalResult = mergeScrapeResults(finalResult, fbResult);
    }

    // MCP scrape (Cars.com, Autotrader, KBB)
    console.log(`[runner] Starting MCP scrape (runId=${runId})`);
    const mcpListings = await searchCarDeals(config);
    console.log(`[runner] MCP returned ${mcpListings.length} listings`);
    const mcpResult = await upsertListings(mcpListings, 'mcp');
    finalResult = mergeScrapeResults(finalResult, mcpResult);

    // Mark completed
    db.update(scrapeRuns)
      .set({
        status: 'completed',
        newCount: finalResult.new,
        updatedCount: finalResult.updated,
        error: finalResult.errors.length > 0 ? finalResult.errors.slice(0, 5).join('; ') : null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(scrapeRuns.id, runId))
      .run();

    completed = true;
    console.log(`[runner] Scrape completed (runId=${runId}): new=${finalResult.new}, updated=${finalResult.updated}`);

    return { runId, result: finalResult };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[runner] Scrape failed (runId=${runId}):`, msg);
    finalResult.errors.push(msg);
    return { runId, result: finalResult };
  } finally {
    if (!completed) {
      try {
        db.update(scrapeRuns)
          .set({
            status: 'failed',
            error: finalResult.errors.slice(0, 5).join('; ') || 'Unknown error',
            completedAt: new Date().toISOString(),
          })
          .where(and(eq(scrapeRuns.id, runId), eq(scrapeRuns.status, 'running')))
          .run();
      } catch (finalErr) {
        console.error('[runner] Failed to update scrape run status:', finalErr);
      }
    }
  }
}
