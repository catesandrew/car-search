import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scrapeRuns } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const lastRun = await db
    .select()
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1)
    .get();

  return NextResponse.json(lastRun ?? null);
}
