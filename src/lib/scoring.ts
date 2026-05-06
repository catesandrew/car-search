import type { Listing, SearchConfig } from './types';
import type { DB } from './db';
import { listings } from './db/schema';
import { eq, not } from 'drizzle-orm';

/**
 * Compute a deal score (0-10) for a listing based on price, mileage, history, and source rating.
 * All prices in cents. Pure function, no side effects.
 */
export function computeDealScore(listing: Listing, config: SearchConfig): number {
  let score = 5.0;

  const price = listing.price ?? 0;
  const priceMax = config.priceMax ?? 1500000;
  const mileage = listing.mileage ?? 0;
  const year = listing.year ?? new Date().getFullYear();

  // Price vs budget: lower price relative to max = better deal
  const priceRatio = priceMax > 0 ? price / priceMax : 1;
  if (priceRatio < 0.6) score += 2.0;
  else if (priceRatio < 0.8) score += 1.0;
  else if (priceRatio > 0.95) score -= 1.0;

  // Mileage: lower miles-per-year = better condition
  const age = Math.max(new Date().getFullYear() - year, 1);
  const milesPerYear = mileage / age;
  if (milesPerYear < 10000) score += 1.0;
  else if (milesPerYear < 12000) score += 0.5;
  else if (milesPerYear > 15000) score -= 0.5;
  else if (milesPerYear > 20000) score -= 1.5;

  // History bonuses
  if (listing.oneOwner) score += 0.5;
  if (listing.noAccidents) score += 1.0;
  if (listing.personalUse) score += 0.5;

  // Private party bonus (usually cheaper, no dealer fees)
  if (listing.dealerType === 'private') score += 0.5;

  // Source deal rating bonus
  if (listing.dealRating === 'Great' || listing.dealRating === 'Great Deal') score += 1.0;
  else if (listing.dealRating === 'Good' || listing.dealRating === 'Good Deal') score += 0.5;

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Recompute deal scores for all non-dismissed listings.
 * Called when config changes (e.g. priceMax).
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
    const newScore = computeDealScore(asListing, config);
    if (newScore !== row.dealScore) {
      database.update(listings).set({ dealScore: newScore }).where(eq(listings.id, row.id)).run();
      updated++;
    }
  }
  return updated;
}
