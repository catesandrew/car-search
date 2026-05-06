import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { db } from '@/lib/db';
import { listings, notes } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

const createNoteSchema = z.object({
  type: z.enum(['note', 'call', 'system']),
  content: z.string().min(1, 'Content is required'),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listingId = Number(id);

  const notesList = await db
    .select()
    .from(notes)
    .where(eq(notes.listingId, listingId))
    .orderBy(desc(notes.createdAt));

  return NextResponse.json(notesList);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listingId = Number(id);

  const listing = await db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const result = await db.insert(notes).values({
    listingId,
    type: parsed.data.type,
    content: parsed.data.content,
    createdAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(result[0], { status: 201 });
}
