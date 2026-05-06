import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scrapeRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const result = db
    .update(scrapeRuns)
    .set({ status: 'failed', completedAt: new Date().toISOString(), error: 'Manually cleared' })
    .where(eq(scrapeRuns.status, 'running'))
    .run();

  return NextResponse.json({ cleared: result.changes });
}
