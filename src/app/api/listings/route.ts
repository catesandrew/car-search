import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listings } from '@/lib/db/schema';
import { and, eq, gte, lte, desc, asc, count } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const source = params.get('source');
  const priceMin = params.get('priceMin') ? Number(params.get('priceMin')) : null;
  const priceMax = params.get('priceMax') ? Number(params.get('priceMax')) : null;
  const mileageMin = params.get('mileageMin') ? Number(params.get('mileageMin')) : null;
  const mileageMax = params.get('mileageMax') ? Number(params.get('mileageMax')) : null;
  const yearMin = params.get('yearMin') ? Number(params.get('yearMin')) : null;
  const yearMax = params.get('yearMax') ? Number(params.get('yearMax')) : null;
  const scoreMin = params.get('scoreMin') ? Number(params.get('scoreMin')) : null;
  const viewStatus = params.get('viewStatus');
  const isFavorited = params.get('isFavorited');
  const isDismissed = params.get('isDismissed') ?? 'false';
  const sortBy = params.get('sortBy') ?? 'first_seen_at';
  const sortDir = params.get('sortDir') ?? 'desc';
  const page = Math.max(1, Number(params.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? '20')));

  const conditions = [];

  if (source) conditions.push(eq(listings.source, source));
  if (priceMin != null) conditions.push(gte(listings.price, priceMin));
  if (priceMax != null) conditions.push(lte(listings.price, priceMax));
  if (mileageMin != null) conditions.push(gte(listings.mileage, mileageMin));
  if (mileageMax != null) conditions.push(lte(listings.mileage, mileageMax));
  if (yearMin != null) conditions.push(gte(listings.year, yearMin));
  if (yearMax != null) conditions.push(lte(listings.year, yearMax));
  if (scoreMin != null) conditions.push(gte(listings.dealScore, scoreMin));
  if (viewStatus) conditions.push(eq(listings.viewStatus, viewStatus));
  if (isFavorited === 'true') conditions.push(eq(listings.isFavorited, true));
  if (isDismissed !== 'true') conditions.push(eq(listings.isDismissed, false));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = {
    deal_score: listings.dealScore,
    price: listings.price,
    mileage: listings.mileage,
    first_seen_at: listings.firstSeenAt,
  }[sortBy] ?? listings.firstSeenAt;

  const orderFn = sortDir === 'asc' ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db.select().from(listings).where(where).orderBy(orderFn(sortColumn)).limit(limit).offset((page - 1) * limit),
    db.select({ count: count() }).from(listings).where(where),
  ]);

  return NextResponse.json({
    data,
    total: totalResult[0]?.count ?? 0,
    page,
    limit,
  });
}
