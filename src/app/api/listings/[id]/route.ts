import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listings, priceHistory, notes } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listingId = Number(id);

  const listing = await db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const [history, notesList] = await Promise.all([
    db.select().from(priceHistory).where(eq(priceHistory.listingId, listingId)).orderBy(desc(priceHistory.observedAt)),
    db.select().from(notes).where(eq(notes.listingId, listingId)).orderBy(desc(notes.createdAt)),
  ]);

  return NextResponse.json({
    ...listing,
    priceHistory: history,
    notes: notesList,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listingId = Number(id);
  const body = await request.json();

  const listing = await db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.isFavorited !== undefined) {
    updates.isFavorited = body.isFavorited;
    updates.favoritedAt = body.isFavorited ? new Date().toISOString() : null;
  }
  if (body.isDismissed !== undefined) {
    updates.isDismissed = body.isDismissed;
  }
  if (body.viewStatus !== undefined) {
    updates.viewStatus = body.viewStatus;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(listings).set(updates).where(eq(listings.id, listingId));
  }

  const updated = await db.select().from(listings).where(eq(listings.id, listingId)).get();
  return NextResponse.json(updated);
}
