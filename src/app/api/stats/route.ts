import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listings, scrapeRuns } from '@/lib/db/schema';
import { eq, count, avg, desc, sql } from 'drizzle-orm';

export async function GET() {
  const [totalResult, newResult, favResult, avgScoreResult, sourceBreakdown, lastScrape] = await Promise.all([
    db.select({ count: count() }).from(listings).where(eq(listings.isDismissed, false)),
    db.select({ count: count() }).from(listings).where(eq(listings.viewStatus, 'new')),
    db.select({ count: count() }).from(listings).where(eq(listings.isFavorited, true)),
    db.select({ avg: avg(listings.dealScore) }).from(listings).where(eq(listings.isDismissed, false)),
    db.select({ source: listings.source, count: count() }).from(listings).where(eq(listings.isDismissed, false)).groupBy(listings.source),
    db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(1),
  ]);

  return NextResponse.json({
    totalListings: totalResult[0]?.count ?? 0,
    newCount: newResult[0]?.count ?? 0,
    favoritesCount: favResult[0]?.count ?? 0,
    avgDealScore: Math.round((Number(avgScoreResult[0]?.avg) || 0) * 10) / 10,
    lastScrapeAt: lastScrape[0]?.startedAt ?? null,
    sourceBreakdown: sourceBreakdown.map(r => ({ source: r.source, count: r.count })),
  });
}
