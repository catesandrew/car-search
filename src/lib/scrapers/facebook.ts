import { execFile } from 'child_process';
import type { SearchConfig, NewListing } from '../types';
import { normalizeMcpListing } from './normalize';

const FB_SCRIPT_TIMEOUT_MS = 120_000;

/**
 * Search Facebook Marketplace for car listings using a Python scraper script.
 * Requires FB_EMAIL, FB_PASSWORD env vars and FB_SCRIPT_PATH pointing to the Python script.
 */
export async function searchFacebook(config: SearchConfig): Promise<NewListing[]> {
  if (!config.fbEnabled) {
    return [];
  }

  const fbEmail = process.env.FB_EMAIL;
  const fbPassword = process.env.FB_PASSWORD;

  if (!fbEmail || !fbPassword) {
    console.warn('[facebook] FB_EMAIL or FB_PASSWORD not set; skipping Facebook search');
    return [];
  }

  const scriptPath = process.env.FB_SCRIPT_PATH ?? 'scripts/fb_scraper.py';

  const args: string[] = [
    scriptPath,
    '--zip', config.zip ?? '92648',
    '--email', fbEmail,
    '--password', fbPassword,
  ];

  if (config.priceMax != null) {
    args.push('--price-max', String(Math.floor(config.priceMax / 100)));
  }
  if (config.mileageMax != null) {
    args.push('--mileage-max', String(config.mileageMax));
  }
  if (config.makesModels) {
    args.push('--makes-models', config.makesModels);
  }
  if (config.radiusMiles != null) {
    args.push('--radius', String(config.radiusMiles));
  }

  return new Promise((resolve) => {
    execFile(
      'python3',
      args,
      { timeout: FB_SCRIPT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
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

          const normalized = rawListings.map((raw) => {
            const listing = normalizeMcpListing(raw);
            // Override source to 'facebook'
            listing.source = 'facebook';
            // Use listing URL as externalId if not already set
            if (!listing.externalId && listing.url) {
              listing.externalId = listing.url;
            }
            return listing;
          });

          console.log(`[facebook] Got ${normalized.length} listings`);
          resolve(normalized);
        } catch (parseErr) {
          console.error('[facebook] Failed to parse Python script output:', parseErr);
          console.error('[facebook] stdout was:', stdout.slice(0, 500));
          resolve([]);
        }
      },
    );
  });
}
