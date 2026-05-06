import type { NewListing } from '../types';

/**
 * Parse a price string like "$12,500" or "12500" to cents.
 * Returns null if unparseable.
 */
function parsePriceToCents(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Math.round(raw * 100);
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * Normalize deal rating strings to canonical values.
 * 'Great Deal' -> 'Great', 'Good Deal' -> 'Good', 'Fair Deal' -> 'Fair', 'High Price' -> 'High'
 */
function normalizeDealRating(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes('great')) return 'Great';
  if (lower.includes('good')) return 'Good';
  if (lower.includes('fair')) return 'Fair';
  if (lower.includes('high')) return 'High';
  if (lower.includes('overpriced')) return 'High';
  return raw.trim() || null;
}

/**
 * Extract year, make, model from a title string like "2018 Toyota Tacoma TRD Off Road".
 * Returns null fields if unparseable.
 */
function extractFromTitle(title: string): { year: number | null; make: string | null; model: string | null } {
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  // Known makes (expand as needed)
  const knownMakes = [
    'Toyota', 'Ford', 'Chevrolet', 'Chevy', 'GMC', 'Dodge', 'Ram', 'Jeep',
    'Honda', 'Nissan', 'Subaru', 'Hyundai', 'Kia', 'Mazda', 'Volkswagen',
    'BMW', 'Mercedes', 'Audi', 'Lexus', 'Acura', 'Infiniti', 'Cadillac',
    'Buick', 'Lincoln', 'Chrysler', 'Mitsubishi', 'Volvo', 'Land Rover',
    'Jaguar', 'Porsche', 'Tesla', 'Rivian', 'Lucid', 'Genesis',
  ];

  let make: string | null = null;
  let model: string | null = null;

  // Strip leading year from title for parsing
  const titleWithoutYear = year ? title.replace(String(year), '').trim() : title.trim();

  for (const candidate of knownMakes) {
    const regex = new RegExp(`\\b${candidate}\\b`, 'i');
    if (regex.test(titleWithoutYear)) {
      make = candidate === 'Chevy' ? 'Chevrolet' : candidate;
      // Model is the next word(s) after the make
      const afterMake = titleWithoutYear.replace(regex, '').trim();
      const modelMatch = afterMake.match(/^[\w-]+/);
      model = modelMatch ? modelMatch[0] : null;
      break;
    }
  }

  return { year, make, model };
}

function parseIntOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Math.floor(raw);
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[,\s]/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function parseBool(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase().trim();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  if (typeof raw === 'number') return raw !== 0;
  return false;
}

function parseString(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  return String(raw).trim() || null;
}

/**
 * Normalize a raw MCP response object into a NewListing.
 */
export function normalizeMcpListing(raw: Record<string, unknown>): NewListing {
  const title = parseString(raw.title ?? raw.name ?? raw.listing_title) ?? '';

  // Extract year/make/model from title if not provided separately
  const extracted = title ? extractFromTitle(title) : { year: null, make: null, model: null };

  const year = parseIntOrNull(raw.year ?? raw.model_year) ?? extracted.year;
  const make = parseString(raw.make ?? raw.brand) ?? extracted.make;
  const model = parseString(raw.model ?? raw.model_name) ?? extracted.model;

  const price = parsePriceToCents(raw.price ?? raw.listing_price ?? raw.sale_price);
  const mileage = parseIntOrNull(raw.mileage ?? raw.miles ?? raw.odometer);

  const vin = parseString(raw.vin ?? raw.VIN);
  const externalId = parseString(raw.id ?? raw.listing_id ?? raw.external_id);
  const source = parseString(raw.source ?? raw.platform) ?? 'mcp';
  const url = parseString(raw.url ?? raw.listing_url ?? raw.link);
  const imageUrl = parseString(raw.image_url ?? raw.image ?? raw.photo_url ?? raw.thumbnail);
  const trim = parseString(raw.trim ?? raw.trim_level ?? raw.package);
  const location = parseString(raw.location ?? raw.city ?? raw.dealer_location);
  const dealerName = parseString(raw.dealer_name ?? raw.seller_name ?? raw.dealer ?? raw.seller);
  const dealerType = parseString(raw.dealer_type ?? raw.seller_type);

  const dealRating = normalizeDealRating(raw.deal_rating ?? raw.price_rating ?? raw.deal ?? raw.rating);

  const oneOwner = parseBool(raw.one_owner ?? raw.single_owner ?? raw.one_owner_vehicle);
  const noAccidents = parseBool(raw.no_accidents ?? raw.accident_free ?? raw.clean_history);
  const personalUse = parseBool(raw.personal_use ?? raw.personal_use_only ?? raw.non_commercial);

  return {
    vin,
    externalId,
    source,
    url,
    imageUrl,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    location,
    dealerName,
    dealerType,
    oneOwner,
    noAccidents,
    personalUse,
    dealRating,
  };
}
