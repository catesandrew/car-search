import { execFile } from 'child_process';
import type { SearchConfig, NewListing } from '../types';

const FB_SCRIPT_TIMEOUT_MS = 180_000; // 3 minutes — FB scraper is slow (scrolling)

/**
 * Search Facebook Marketplace for car listings using the Python scraper.
 * Requires FB_EMAIL, FB_PASSWORD env vars.
 * Scraper path defaults to ../Facebook-Marketplace_Scraper/search_for_app.py
 */
export async function searchFacebook(config: SearchConfig): Promise<NewListing[]> {
  if (!config.fbEnabled) {
    return [];
  }

  const fbEmail = process.env.FB_EMAIL;
  const fbPassword = process.env.FB_PASSWORD ?? '';

  if (!fbEmail) {
    console.warn('[facebook] FB_EMAIL not set; skipping Facebook search');
    return [];
  }

  const scriptPath = process.env.FB_SCRIPT_PATH;
  if (!scriptPath) {
    console.warn('[facebook] FB_SCRIPT_PATH not set; skipping Facebook search');
    return [];
  }

  const args: string[] = [
    scriptPath,
    '--email', fbEmail,
    '--password', fbPassword,
    '--location', 'huntingtonbeach',
    '--radius', '80',
  ];

  if (config.priceMax != null) {
    args.push('--price-max', String(Math.floor(config.priceMax / 100)));
  }
  if (config.mileageMax != null) {
    args.push('--mileage-max', String(config.mileageMax));
  }
  if (config.yearMin != null) {
    args.push('--year-min', String(config.yearMin));
  }
  if (config.yearMax != null) {
    args.push('--year-max', String(config.yearMax));
  }
  if (config.makesModels) {
    args.push('--makes-models', config.makesModels);
  }
  args.push('--scroll-count', '5');

  return new Promise((resolve) => {
    console.log('[facebook] Starting FB Marketplace scrape...');
    execFile(
      process.env.PYTHON_PATH ?? '/opt/homebrew/bin/python3.12',
      args,
      {
        timeout: FB_SCRIPT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, NODE_OPTIONS: '' }, // Playwright's Node doesn't support --experimental-strip-types
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[facebook] Python script error:', error.message);
          if (stderr) console.error('[facebook] stderr:', stderr);
          resolve([]);
          return;
        }

        if (stderr) {
          console.warn('[facebook] stderr:', stderr);
        }

        try {
          const parsed = JSON.parse(stdout);
          const rawListings: Record<string, unknown>[] = Array.isArray(parsed)
            ? parsed
            : (parsed.listings ?? parsed.results ?? []);

          const normalized: NewListing[] = rawListings.map((raw) => ({
            vin: null,
            externalId: String(raw.listing_url ?? raw.url ?? ''),
            source: 'facebook',
            url: String(raw.listing_url ?? raw.url ?? ''),
            imageUrl: String(raw.image_url ?? raw.image ?? '') || null,
            year: raw.year ? Number(raw.year) : null,
            make: String(raw.make ?? '') || null,
            model: String(raw.model ?? '') || null,
            trim: null,
            price: parseFbPrice(raw.price),
            mileage: typeof raw.mileage === 'number' ? raw.mileage : null,
            location: String(raw.location ?? '') || null,
            dealerName: null,
            dealerType: 'private',
            oneOwner: false,
            noAccidents: false,
            personalUse: false,
            dealRating: null,
          }));

          // Filter to only configured makes/models — FB returns unrelated results
          const allowedModels = config.makesModels
            ? (JSON.parse(config.makesModels) as string[]).map((m: string) => m.toLowerCase())
            : ['toyota tacoma', 'toyota 4runner'];

          const filtered = normalized.filter((l) => {
            const name = `${l.make ?? ''} ${l.model ?? ''}`.toLowerCase();
            return allowedModels.some((allowed) => {
              const [make, ...modelParts] = allowed.split(' ');
              const model = modelParts.join(' ');
              return name.includes(make) && (model === '' || name.includes(model));
            });
          });

          console.log(`[facebook] Got ${normalized.length} listings, ${filtered.length} match configured vehicles`);
          resolve(filtered);
        } catch (parseErr) {
          console.error('[facebook] Failed to parse output:', parseErr);
          resolve([]);
        }
      },
    );
  });
}

function parseFbPrice(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Math.round(raw * 100);
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.round(num * 100);
  }
  return null;
}
