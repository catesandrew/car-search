import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { listings, priceHistory } from '../db/schema';
import { computeDealScore } from '../scoring';
import type { NewListing, ScrapeResult, Listing, SearchConfig } from '../types';

type ListingRow = typeof listings.$inferSelect;

/**
 * Convert a DB row to the Listing interface shape expected by computeDealScore.
 */
function rowToListing(row: ListingRow): Listing {
  return {
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
}

/**
 * Fetch the current search config from the DB for deal score computation.
 * Returns a minimal default if not found.
 */
function getConfigForScoring(): SearchConfig {
  try {
    const { searchConfig } = require('../db/schema') as typeof import('../db/schema');
    const row = db.select().from(searchConfig).limit(1).get();
    if (!row) return defaultConfig();
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
  } catch {
    return defaultConfig();
  }
}

function defaultConfig(): SearchConfig {
  return {
    id: 1,
    zip: '92648',
    radiusMiles: 150,
    priceMax: 1500000,
    mileageMax: 200000,
    yearMin: 2005,
    yearMax: 2025,
    makesModels: null,
    cronInterval: 30,
    fbEnabled: false,
    lastViewedAt: null,
  };
}

/**
 * Upsert a batch of listings into the DB, deduplicating by VIN or source+externalId.
 * Tracks price changes and inserts into price_history when price drops/rises.
 * Returns counts of new and updated listings.
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
        // Dedup by VIN
        await db.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(listings)
            .where(eq(listings.vin, listing.vin!))
            .limit(1)
            .then((rows) => rows[0] ?? null);

          if (existing) {
            const priceChanged = listing.price != null && listing.price !== existing.price;
            await tx
              .update(listings)
              .set({
                lastSeenAt: now,
                ...(priceChanged ? { price: listing.price } : {}),
              })
              .where(eq(listings.id, existing.id));

            if (priceChanged) {
              await tx.insert(priceHistory).values({
                listingId: existing.id,
                price: listing.price ?? null,
                observedAt: now,
              });
            }
            updatedCount++;
          } else {
            const listingRow = buildInsertRow(listing, now, config);
            await tx.insert(listings).values(listingRow);
            newCount++;
          }
        });
      } else if (listing.externalId && listing.source) {
        // Dedup by source + externalId
        await db.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(listings)
            .where(
              and(
                eq(listings.source, listing.source),
                eq(listings.externalId, listing.externalId!),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null);

          if (existing) {
            const priceChanged = listing.price != null && listing.price !== existing.price;
            await tx
              .update(listings)
              .set({
                lastSeenAt: now,
                ...(priceChanged ? { price: listing.price } : {}),
              })
              .where(eq(listings.id, existing.id));

            if (priceChanged) {
              await tx.insert(priceHistory).values({
                listingId: existing.id,
                price: listing.price ?? null,
                observedAt: now,
              });
            }
            updatedCount++;
          } else {
            const listingRow = buildInsertRow(listing, now, config);
            await tx.insert(listings).values(listingRow);
            newCount++;
          }
        });
      } else {
        // No dedup key available — just insert
        const listingRow = buildInsertRow(listing, now, config);
        await db.insert(listings).values(listingRow);
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
  // Build a minimal Listing shape to compute deal score
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

  const dealScore = computeDealScore(partial, config);

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
    dealScore,
    viewStatus: 'new',
    isFavorited: false,
    isDismissed: false,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}
