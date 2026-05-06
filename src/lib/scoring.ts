import type { Listing, SearchConfig } from './types';
import type { DB } from './db';
import { listings } from './db/schema';
import { eq, not, and, gte, lte } from 'drizzle-orm';

interface MarketComps {
  medianPrice: number;
  medianMileage: number;
  count: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Find comparable listings for a given listing.
 * Groups by model keyword (tacoma/4runner/tundra) within a +/- 3 year window.
 */
function findComps(database: DB, listing: Listing): MarketComps | null {
  const year = listing.year;
  if (!year) return null;

  // Normalize model to base name (e.g., "tacoma double cab sr5 pickup" -> "tacoma")
  const modelLower = (listing.model ?? '').toLowerCase();
  let modelKey = '';
  if (modelLower.includes('tacoma')) modelKey = 'tacoma';
  else if (modelLower.includes('4runner')) modelKey = '4runner';
  else if (modelLower.includes('tundra')) modelKey = 'tundra';
  else return null; // can't find comps for unknown model

  const allComps = database
    .select()
    .from(listings)
    .where(
      and(
        not(eq(listings.isDismissed, true)),
        gte(listings.year, year - 3),
        lte(listings.year, year + 3),
        gte(listings.price, 100000),
      )
    )
    .all()
    .filter((row) => (row.model ?? '').toLowerCase().includes(modelKey));

  if (allComps.length < 3) return null; // not enough data for comparison

  const prices = allComps.map((c) => c.price ?? 0).filter((p) => p > 0);
  const mileages = allComps.map((c) => c.mileage ?? 0).filter((m) => m > 0);

  return {
    medianPrice: median(prices),
    medianMileage: median(mileages),
    count: allComps.length,
  };
}

/**
 * Compute a deal score (0-10) for a listing.
 *
 * Two-layer scoring:
 *   Layer 1 (absolute):  Budget ratio, miles/year, history flags, source rating
 *   Layer 2 (relative):  Compare price & mileage against similar listings in DB
 *
 * When comps are available, relative scoring can shift the score up to +/- 2 points.
 * All prices in cents.
 */
export function computeDealScore(listing: Listing, config: SearchConfig, database?: DB): number {
  let score = 5.0;

  const price = listing.price ?? 0;
  const priceMax = config.priceMax ?? 1500000;
  const mileage = listing.mileage ?? 0;
  const year = listing.year ?? new Date().getFullYear();

  // === Layer 1: Absolute scoring ===

  // Price vs budget
  const priceRatio = priceMax > 0 ? price / priceMax : 1;
  if (priceRatio < 0.6) score += 1.5;
  else if (priceRatio < 0.8) score += 0.5;
  else if (priceRatio > 0.95) score -= 0.5;

  // Mileage: lower miles-per-year = better condition
  const age = Math.max(new Date().getFullYear() - year, 1);
  const milesPerYear = mileage / age;
  if (milesPerYear < 10000) score += 0.5;
  else if (milesPerYear < 12000) score += 0.25;
  else if (milesPerYear > 15000) score -= 0.25;
  else if (milesPerYear > 20000) score -= 0.75;

  // History bonuses
  if (listing.oneOwner) score += 0.5;
  if (listing.noAccidents) score += 0.5;
  if (listing.personalUse) score += 0.25;

  // Private party bonus
  if (listing.dealerType === 'private') score += 0.25;

  // Source deal rating
  if (listing.dealRating === 'Great' || listing.dealRating === 'Great Deal') score += 0.5;
  else if (listing.dealRating === 'Good' || listing.dealRating === 'Good Deal') score += 0.25;

  // === Layer 2: Relative scoring (market comparison) ===
  if (database && price > 0) {
    const comps = findComps(database, listing);
    if (comps && comps.count >= 3 && comps.medianPrice > 0) {
      // Price vs market: how much below/above median?
      const priceDelta = (comps.medianPrice - price) / comps.medianPrice;
      // priceDelta > 0 means listing is below median (good deal)
      // priceDelta < 0 means listing is above median (overpriced)
      if (priceDelta > 0.20) score += 2.0;       // >20% below median — great deal
      else if (priceDelta > 0.10) score += 1.5;   // 10-20% below
      else if (priceDelta > 0.05) score += 0.75;  // 5-10% below
      else if (priceDelta > 0) score += 0.25;     // slightly below
      else if (priceDelta < -0.15) score -= 1.5;  // >15% above — overpriced
      else if (priceDelta < -0.10) score -= 1.0;  // 10-15% above
      else if (priceDelta < -0.05) score -= 0.5;  // 5-10% above

      // Mileage vs market: lower mileage than peers = bonus
      if (comps.medianMileage > 0 && mileage > 0) {
        const mileageDelta = (comps.medianMileage - mileage) / comps.medianMileage;
        if (mileageDelta > 0.20) score += 0.75;     // 20%+ fewer miles than peers
        else if (mileageDelta > 0.10) score += 0.5;
        else if (mileageDelta < -0.20) score -= 0.5; // 20%+ more miles than peers
      }
    }
  }

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Recompute deal scores for all non-dismissed listings using market comparison.
 * Called when config changes or after new listings are ingested.
 */
export function recomputeAllScores(database: DB, config: SearchConfig): number {
  const allListings = database
    .select()
    .from(listings)
    .where(not(eq(listings.isDismissed, true)))
    .all();

  let updated = 0;
  for (const row of allListings) {
    const asListing: Listing = {
      id: row.id,
      vin: row.vin ?? null,
      externalId: row.externalId ?? null,
      source: row.source,
      url: row.url ?? null,
      imageUrl: row.imageUrl ?? null,
      year: row.year ?? null,
      make: row.make ?? null,
      model: row.model ?? null,
      trim: row.trim ?? null,
      price: row.price ?? null,
      mileage: row.mileage ?? null,
      location: row.location ?? null,
      dealerName: row.dealerName ?? null,
      dealerType: row.dealerType ?? null,
      oneOwner: row.oneOwner ?? null,
      noAccidents: row.noAccidents ?? null,
      personalUse: row.personalUse ?? null,
      dealRating: row.dealRating ?? null,
      dealScore: row.dealScore ?? null,
      viewStatus: row.viewStatus ?? null,
      isFavorited: row.isFavorited ?? null,
      isDismissed: row.isDismissed ?? null,
      favoritedAt: row.favoritedAt ?? null,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
    };
    const newScore = computeDealScore(asListing, config, database);
    if (newScore !== row.dealScore) {
      database.update(listings).set({ dealScore: newScore }).where(eq(listings.id, row.id)).run();
      updated++;
    }
  }
  return updated;
}
