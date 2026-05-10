import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { db } from '@/lib/db';
import { searchConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { recomputeAllScores } from '@/lib/scoring';
import type { SearchConfig } from '@/lib/types';

const updateConfigSchema = z.object({
  zip: z.string().optional(),
  fbLocation: z.string().optional(),
  radiusMiles: z.number().min(10).max(500).optional(),
  priceMax: z.number().min(0).optional(),
  mileageMax: z.number().min(0).optional(),
  yearMin: z.number().min(1990).max(2030).optional(),
  yearMax: z.number().min(1990).max(2030).optional(),
  makesModels: z.array(z.string()).optional(),
  cronInterval: z.number().min(5).max(1440).optional(),
  fbEnabled: z.boolean().optional(),
});

export async function GET() {
  const config = db.select().from(searchConfig).where(eq(searchConfig.id, 1)).get();
  if (!config) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 });
  }
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const parsed = updateConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const oldConfig = db.select().from(searchConfig).where(eq(searchConfig.id, 1)).get();
  const priceMaxChanged = parsed.data.priceMax !== undefined && parsed.data.priceMax !== oldConfig?.priceMax;

  const updates: Record<string, unknown> = {};
  if (parsed.data.zip !== undefined) updates.zip = parsed.data.zip;
  if (parsed.data.fbLocation !== undefined) updates.fbLocation = parsed.data.fbLocation;
  if (parsed.data.radiusMiles !== undefined) updates.radiusMiles = parsed.data.radiusMiles;
  if (parsed.data.priceMax !== undefined) updates.priceMax = parsed.data.priceMax;
  if (parsed.data.mileageMax !== undefined) updates.mileageMax = parsed.data.mileageMax;
  if (parsed.data.yearMin !== undefined) updates.yearMin = parsed.data.yearMin;
  if (parsed.data.yearMax !== undefined) updates.yearMax = parsed.data.yearMax;
  if (parsed.data.makesModels !== undefined) updates.makesModels = JSON.stringify(parsed.data.makesModels);
  if (parsed.data.cronInterval !== undefined) updates.cronInterval = parsed.data.cronInterval;
  if (parsed.data.fbEnabled !== undefined) updates.fbEnabled = parsed.data.fbEnabled;

  if (Object.keys(updates).length > 0) {
    db.update(searchConfig).set(updates).where(eq(searchConfig.id, 1)).run();
  }

  const updatedConfig = db.select().from(searchConfig).where(eq(searchConfig.id, 1)).get();

  // Recompute deal scores if priceMax changed
  if (priceMaxChanged && updatedConfig) {
    const recomputed = recomputeAllScores(db, updatedConfig as unknown as SearchConfig);
    console.log(`[config] Recomputed ${recomputed} deal scores after config change`);
  }

  return NextResponse.json(updatedConfig);
}
