import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { SearchConfig, NewListing } from '../types';
import { normalizeMcpListing } from './normalize';

const TOOL_TIMEOUT_MS = 90_000;

function getSearchZips(primaryZip: string | null): string[] {
  if (!primaryZip) return [];
  return [primaryZip];
}

interface MakeModel {
  make: string;
  model: string;
}

function parseMakesModels(makesModels: string | null): MakeModel[] {
  if (!makesModels) return [];
  try {
    const parsed = JSON.parse(makesModels);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry: unknown) => {
      if (typeof entry === 'string') {
        // "Toyota Tacoma" -> { make: 'Toyota', model: 'Tacoma' }
        const parts = entry.trim().split(/\s+/);
        const make = parts[0] ?? '';
        const model = (parts.slice(1).join(' ') || parts[0]) ?? '';
        return { make, model };
      }
      if (typeof entry === 'object' && entry !== null) {
        const obj = entry as Record<string, unknown>;
        return {
          make: String(obj.make ?? ''),
          model: String(obj.model ?? ''),
        };
      }
      return { make: '', model: '' };
    }).filter((mm) => mm.make.length > 0);
  } catch {
    return [];
  }
}

/**
 * Search car deals via the MCP server for a single make/model combination.
 * Returns raw result content array.
 */
async function callSearchTool(
  client: Client,
  make: string,
  model: string,
  config: SearchConfig,
): Promise<Record<string, unknown>[]> {
  const args: Record<string, unknown> = {
    make,
    model,
    zip: config.zip ?? undefined,
  };

  if (config.priceMax != null) {
    args.priceMax = Math.floor(config.priceMax / 100);
  }
  if (config.mileageMax != null) {
    args.mileageMax = config.mileageMax;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  try {
    const result = await client.callTool(
      { name: 'search_car_deals', arguments: args },
      undefined,
      { signal: controller.signal },
    );

    const content = result.content;
    if (!Array.isArray(content)) return [];

    const listings: Record<string, unknown>[] = [];
    for (const item of content) {
      if (typeof item === 'object' && item !== null) {
        const contentItem = item as Record<string, unknown>;
        // MCP tool results may be text (JSON string) or structured objects
        if (contentItem.type === 'text' && typeof contentItem.text === 'string') {
          try {
            const parsed = JSON.parse(contentItem.text);
            if (Array.isArray(parsed)) {
              listings.push(...parsed);
            } else if (typeof parsed === 'object' && parsed !== null) {
              listings.push(parsed as Record<string, unknown>);
            }
          } catch {
            // not JSON, skip
          }
        } else if (contentItem.type === 'resource' || contentItem.listings) {
          const data = contentItem.listings ?? contentItem.data ?? contentItem;
          if (Array.isArray(data)) {
            listings.push(...(data as Record<string, unknown>[]));
          }
        } else {
          // Treat the item itself as a listing
          listings.push(contentItem);
        }
      }
    }

    return listings;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search for car deals across all configured makes/models using the MCP server.
 * Reads server path from CAR_DEALS_MCP_PATH environment variable.
 */
export async function searchCarDeals(config: SearchConfig): Promise<NewListing[]> {
  const mcpPath = process.env.CAR_DEALS_MCP_PATH;
  if (!mcpPath) {
    console.warn('[mcp-client] CAR_DEALS_MCP_PATH is not set; skipping MCP search');
    return [];
  }

  const makesModels = parseMakesModels(config.makesModels);
  if (makesModels.length === 0) {
    console.warn('[mcp-client] No makes/models configured; skipping MCP search');
    return [];
  }

  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpPath],
  });

  const client = new Client(
    { name: 'car-search-scraper', version: '1.0.0' },
    { capabilities: {} },
  );

  const allListings: NewListing[] = [];
  const seenTitles = new Set<string>();

  try {
    await client.connect(transport);

    const zips = getSearchZips(config.zip);

    for (const { make, model } of makesModels) {
      for (const zip of zips) {
        try {
          const zipConfig = { ...config, zip };
          console.log(`[mcp-client] Searching ${make} ${model} in ${zip}...`);
          const rawListings = await callSearchTool(client, make, model, zipConfig);
          const normalized = rawListings.map((raw) => normalizeMcpListing(raw));

          // Dedup by title across zip searches
          let added = 0;
          for (const listing of normalized) {
            const key = `${listing.year}-${listing.make}-${listing.model}-${listing.price}-${listing.mileage}`;
            if (!seenTitles.has(key)) {
              seenTitles.add(key);
              allListings.push(listing);
              added++;
            }
          }
          console.log(`[mcp-client] Got ${normalized.length} results for ${make} ${model} in ${zip} (${added} new)`);
        } catch (err) {
          console.error(`[mcp-client] Error searching ${make} ${model} in ${zip}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[mcp-client] Failed to connect to MCP server:', err);
  } finally {
    try {
      await client.close();
    } catch (err) {
      console.error('[mcp-client] Error closing MCP client:', err);
    }
  }

  return allListings;
}
