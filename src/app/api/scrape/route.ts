import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scrapeRuns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function POST() {
  // Check for running scrape (mutex)
  const running = await db
    .select()
    .from(scrapeRuns)
    .where(eq(scrapeRuns.status, 'running'))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1)
    .get();

  if (running) {
    const startedAt = new Date(running.startedAt).getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    if (startedAt > tenMinutesAgo) {
      // Still running and not stale
      return NextResponse.json({ error: 'Scan already in progress' }, { status: 409 });
    }

    // Stale - mark as failed
    await db
      .update(scrapeRuns)
      .set({ status: 'failed', completedAt: new Date().toISOString(), error: 'Timed out (stale)' })
      .where(eq(scrapeRuns.id, running.id));
  }

  // Start a new scrape run asynchronously
  try {
    const { runScrape } = await import('@/lib/scrapers/runner');
    // Fire and forget - don't await
    const resultPromise = runScrape();

    // Wait briefly to get the run ID
    const result = await Promise.race([
      resultPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    if (result) {
      return NextResponse.json({ runId: result.runId }, { status: 202 });
    }

    // If the scrape is still starting, return the latest run ID
    const latest = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.status, 'running'))
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(1)
      .get();

    return NextResponse.json({ runId: latest?.id ?? null }, { status: 202 });
  } catch (err) {
    console.error('Failed to start scrape:', err);
    return NextResponse.json({ error: 'Failed to start scan' }, { status: 500 });
  }
}
