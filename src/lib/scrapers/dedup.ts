import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { listings, priceHistory, searchConfig } from '../db/schema';
import { computeDealScore } from '../scoring';
import type { NewListing, ScrapeResult, Listing, SearchConfig } from '../types';

function getConfigForScoring(): SearchConfig {
  const row = db.select().from(searchConfig).limit(1).get();
  if (!row) return {
    id: 1, zip: '92646', radiusMiles: 150, priceMax: 1500000,
    mileageMax: 200000, yearMin: 2005, yearMax: 2025,
    makesModels: null, cronInterval: 30, fbEnabled: false, lastViewedAt: null,
  };
  return row as unknown as SearchConfig;
}

/**
 * Upsert a batch of listings into the DB, deduplicating by VIN or source+externalId.
 * Uses synchronous better-sqlite3 transactions (no async/await inside transaction callbacks).
 */
export async function upsertListings(
  newListings: NewListing[],
  _source: string,
): Promise<ScrapeResult> {
  const config = getConfigForScoring();
  let newCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  for (const listing of newListings) {
    const now = new Date().toISOString();

    try {
      if (listing.vin) {
        // Dedup by VIN — synchronous transaction
        const existing = db
          .select()
          .from(listings)
          .where(eq(listings.vin, listing.vin))
          .limit(1)
          .get();

        if (existing) {
          const priceChanged = listing.price != null && listing.price !== existing.price;
          const needsImage = !existing.imageUrl && listing.imageUrl;
          db.update(listings)
            .set({
              lastSeenAt: now,
              ...(priceChanged ? { price: listing.price } : {}),
              ...(needsImage ? { imageUrl: listing.imageUrl } : {}),
            })
            .where(eq(listings.id, existing.id))
            .run();

          if (priceChanged) {
            db.insert(priceHistory)
              .values({ listingId: existing.id, price: listing.price ?? null, observedAt: now })
              .run();
          }
          updatedCount++;
        } else {
          const listingRow = buildInsertRow(listing, now, config);
          db.insert(listings).values(listingRow).run();
          newCount++;
        }
      } else if (listing.externalId && listing.source) {
        // Dedup by source + externalId
        const existing = db
          .select()
          .from(listings)
          .where(and(eq(listings.source, listing.source), eq(listings.externalId, listing.externalId)))
          .limit(1)
          .get();

        if (existing) {
          const priceChanged = listing.price != null && listing.price !== existing.price;
          const needsImage = !existing.imageUrl && listing.imageUrl;
          db.update(listings)
            .set({
              lastSeenAt: now,
              ...(priceChanged ? { price: listing.price } : {}),
              ...(needsImage ? { imageUrl: listing.imageUrl } : {}),
            })
            .where(eq(listings.id, existing.id))
            .run();

          if (priceChanged) {
            db.insert(priceHistory)
              .values({ listingId: existing.id, price: listing.price ?? null, observedAt: now })
              .run();
          }
          updatedCount++;
        } else {
          const listingRow = buildInsertRow(listing, now, config);
          db.insert(listings).values(listingRow).run();
          newCount++;
        }
      } else {
        // No dedup key — just insert
        const listingRow = buildInsertRow(listing, now, config);
        db.insert(listings).values(listingRow).run();
        newCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[dedup] Error upserting listing:', msg, listing.url ?? listing.vin ?? listing.externalId);
      errors.push(msg);
    }
  }

  return { new: newCount, updated: updatedCount, errors };
}

function buildInsertRow(
  listing: NewListing,
  now: string,
  config: SearchConfig,
): typeof listings.$inferInsert {
  const partial: Listing = {
    id: 0,
    vin: listing.vin ?? null,
    externalId: listing.externalId ?? null,
    source: listing.source,
    url: listing.url ?? null,
    imageUrl: listing.imageUrl ?? null,
    year: listing.year ?? null,
    make: listing.make ?? null,
    model: listing.model ?? null,
    trim: listing.trim ?? null,
    price: listing.price ?? null,
    mileage: listing.mileage ?? null,
    location: listing.location ?? null,
    dealerName: listing.dealerName ?? null,
    dealerType: listing.dealerType ?? null,
    oneOwner: listing.oneOwner ?? null,
    noAccidents: listing.noAccidents ?? null,
    personalUse: listing.personalUse ?? null,
    dealRating: listing.dealRating ?? null,
    dealScore: null,
    viewStatus: 'new',
    isFavorited: false,
    isDismissed: false,
    favoritedAt: null,
    firstSeenAt: now,
    lastSeenAt: now,
  };

  return {
    vin: listing.vin ?? null,
    externalId: listing.externalId ?? null,
    source: listing.source,
    url: listing.url ?? null,
    imageUrl: listing.imageUrl ?? null,
    year: listing.year ?? null,
    make: listing.make ?? null,
    model: listing.model ?? null,
    trim: listing.trim ?? null,
    price: listing.price ?? null,
    mileage: listing.mileage ?? null,
    location: listing.location ?? null,
    dealerName: listing.dealerName ?? null,
    dealerType: listing.dealerType ?? null,
    oneOwner: listing.oneOwner ?? false,
    noAccidents: listing.noAccidents ?? false,
    personalUse: listing.personalUse ?? false,
    dealRating: listing.dealRating ?? null,
    dealScore: computeDealScore(partial, config),
    viewStatus: 'new',
    isFavorited: false,
    isDismissed: false,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}
