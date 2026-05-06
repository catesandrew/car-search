export interface Listing {
  id: number;
  vin: string | null;
  externalId: string | null;
  source: string;
  url: string | null;
  imageUrl: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null; // cents
  mileage: number | null;
  location: string | null;
  dealerName: string | null;
  dealerType: string | null; // 'dealer' | 'private'
  oneOwner: boolean | null;
  noAccidents: boolean | null;
  personalUse: boolean | null;
  dealRating: string | null;
  dealScore: number | null;
  viewStatus: string | null; // 'new' | 'seen'
  isFavorited: boolean | null;
  isDismissed: boolean | null;
  favoritedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ListingDetail extends Listing {
  priceHistory: PriceHistoryEntry[];
  notes: NoteEntry[];
}

export interface PriceHistoryEntry {
  id: number;
  price: number | null;
  observedAt: string;
}

export interface NoteEntry {
  id: number;
  listingId: number | null;
  type: string | null;
  content: string;
  createdAt: string | null;
}

export interface SearchConfig {
  id: number;
  zip: string | null;
  radiusMiles: number | null;
  priceMax: number | null; // cents
  mileageMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
  makesModels: string | null; // JSON array string
  cronInterval: number | null; // minutes
  fbEnabled: boolean | null;
  lastViewedAt: string | null;
}

export interface ScrapeResult {
  new: number;
  updated: number;
  errors: string[];
}

export interface ScrapeRun {
  id: number;
  source: string;
  status: string | null;
  newCount: number | null;
  updatedCount: number | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DashboardStats {
  totalListings: number;
  newCount: number;
  favoritesCount: number;
  avgDealScore: number;
  lastScrapeAt: string | null;
  sourceBreakdown: { source: string; count: number }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface NewListing {
  vin?: string | null;
  externalId?: string | null;
  source: string;
  url?: string | null;
  imageUrl?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null; // cents
  mileage?: number | null;
  location?: string | null;
  dealerName?: string | null;
  dealerType?: string | null;
  oneOwner?: boolean;
  noAccidents?: boolean;
  personalUse?: boolean;
  dealRating?: string | null;
}
