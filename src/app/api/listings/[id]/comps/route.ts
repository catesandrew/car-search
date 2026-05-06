import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listings } from '@/lib/db/schema';
import { eq, and, gte, lte, not } from 'drizzle-orm';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const frac = idx - lower;
  if (lower + 1 >= sorted.length) return sorted[lower];
  return sorted[lower] + frac * (sorted[lower + 1] - sorted[lower]);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listingId = Number(id);

  const listing = db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const year = listing.year;
  const modelLower = (listing.model ?? '').toLowerCase();
  let modelKey = '';
  if (modelLower.includes('tacoma')) modelKey = 'tacoma';
  else if (modelLower.includes('4runner')) modelKey = '4runner';
  else if (modelLower.includes('tundra')) modelKey = 'tundra';

  if (!modelKey || !year) {
    return NextResponse.json({
      hasComps: false,
      message: 'Not enough data to find comparables',
    });
  }

  const allComps = db
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
    .filter((row) => (row.model ?? '').toLowerCase().includes(modelKey))
    .filter((row) => row.id !== listingId); // exclude this listing

  if (allComps.length < 2) {
    return NextResponse.json({
      hasComps: false,
      message: `Only ${allComps.length} comparable listing(s) found`,
    });
  }

  const prices = allComps.map((c) => c.price ?? 0).filter((p) => p > 0);
  const mileages = allComps.map((c) => c.mileage ?? 0).filter((m) => m > 0);

  const medianPrice = median(prices);
  const medianMileage = median(mileages);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const p25Price = percentile(prices, 25);
  const p75Price = percentile(prices, 75);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  const listingPrice = listing.price ?? 0;
  const listingMileage = listing.mileage ?? 0;

  const priceDelta = medianPrice > 0 ? (medianPrice - listingPrice) / medianPrice : 0;
  const mileageDelta = medianMileage > 0 ? (medianMileage - listingMileage) / medianMileage : 0;

  // Price rank: what percentile is this listing in? (lower = better deal)
  const cheaperCount = prices.filter((p) => p < listingPrice).length;
  const pricePercentile = Math.round((cheaperCount / prices.length) * 100);

  // Mileage rank: what percentile? (lower mileage = better)
  const lowerMileageCount = mileages.filter((m) => m < listingMileage).length;
  const mileagePercentile = mileages.length > 0 ? Math.round((lowerMileageCount / mileages.length) * 100) : null;

  let verdict = 'Fair';
  if (priceDelta > 0.15) verdict = 'Great Deal';
  else if (priceDelta > 0.08) verdict = 'Good Deal';
  else if (priceDelta > 0) verdict = 'Fair';
  else if (priceDelta > -0.08) verdict = 'Slightly Above Market';
  else verdict = 'Above Market';

  return NextResponse.json({
    hasComps: true,
    modelKey,
    yearRange: `${year - 3}–${year + 3}`,
    compCount: allComps.length,
    listing: {
      price: listingPrice,
      mileage: listingMileage,
    },
    market: {
      medianPrice,
      avgPrice: Math.round(avgPrice),
      minPrice,
      maxPrice,
      p25Price: Math.round(p25Price),
      p75Price: Math.round(p75Price),
      medianMileage,
    },
    comparison: {
      priceDeltaPercent: Math.round(priceDelta * 100),
      mileageDeltaPercent: Math.round(mileageDelta * 100),
      pricePercentile,
      mileagePercentile,
      verdict,
    },
  });
}
