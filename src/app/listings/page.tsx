'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { useListings, useUpdateListing } from '@/hooks/use-listings';
import { ListingCard } from '@/components/listing-card';
import { ListingTable } from '@/components/listing-table';
import { ListingFiltersBar, type ListingFilters } from '@/components/listing-filters';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const VIEW_KEY = 'listings-view';

function filtersToParams(filters: ListingFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.source) params.source = filters.source;
  if (filters.priceMin) params.priceMin = String(Number(filters.priceMin) * 100);
  if (filters.priceMax) params.priceMax = String(Number(filters.priceMax) * 100);
  if (filters.mileageMin) params.mileageMin = filters.mileageMin;
  if (filters.mileageMax) params.mileageMax = filters.mileageMax;
  if (filters.yearMin) params.yearMin = filters.yearMin;
  if (filters.yearMax) params.yearMax = filters.yearMax;
  if (filters.scoreMin) params.scoreMin = filters.scoreMin;
  if (filters.viewStatus) params.viewStatus = filters.viewStatus;
  if (filters.isFavorited) params.isFavorited = 'true';
  if (filters.showDismissed) params.isDismissed = 'true';
  params.sortBy = filters.sortBy ?? 'first_seen_at';
  params.sortDir = filters.sortDir ?? 'desc';
  params.page = String(filters.page ?? 1);
  params.limit = '20';
  return params;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function ListingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [filters, setFilters] = useState<ListingFilters>({
    sortBy: 'first_seen_at',
    sortDir: 'desc',
    page: 1,
  });

  // Load view preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'table' || stored === 'grid') setView(stored);
  }, []);

  const handleViewChange = useCallback((v: 'grid' | 'table') => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }, []);

  // Sync filters from URL on mount
  useEffect(() => {
    const f: ListingFilters = {
      source: searchParams.get('source') ?? undefined,
      priceMin: searchParams.get('priceMin') ?? undefined,
      priceMax: searchParams.get('priceMax') ?? undefined,
      mileageMin: searchParams.get('mileageMin') ?? undefined,
      mileageMax: searchParams.get('mileageMax') ?? undefined,
      yearMin: searchParams.get('yearMin') ?? undefined,
      yearMax: searchParams.get('yearMax') ?? undefined,
      scoreMin: searchParams.get('scoreMin') ?? undefined,
      viewStatus: searchParams.get('viewStatus') ?? undefined,
      isFavorited: searchParams.get('isFavorited') === 'true' || undefined,
      showDismissed: searchParams.get('showDismissed') === 'true' || undefined,
      sortBy: searchParams.get('sortBy') ?? 'first_seen_at',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? 'desc',
      page: Number(searchParams.get('page') ?? '1') || 1,
    };
    setFilters(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = filtersToParams(filters);
  const { data, isLoading } = useListings(params);
  const { mutate: updateListing } = useUpdateListing();

  const listings = data?.data ?? [];
  const total = data?.total ?? 0;
  const page = filters.page ?? 1;
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const syncUrl = (f: ListingFilters) => {
    const url = new URLSearchParams();
    if (f.source) url.set('source', f.source);
    if (f.priceMin) url.set('priceMin', f.priceMin);
    if (f.priceMax) url.set('priceMax', f.priceMax);
    if (f.mileageMin) url.set('mileageMin', f.mileageMin);
    if (f.mileageMax) url.set('mileageMax', f.mileageMax);
    if (f.yearMin) url.set('yearMin', f.yearMin);
    if (f.yearMax) url.set('yearMax', f.yearMax);
    if (f.scoreMin) url.set('scoreMin', f.scoreMin);
    if (f.viewStatus) url.set('viewStatus', f.viewStatus);
    if (f.isFavorited) url.set('isFavorited', 'true');
    if (f.showDismissed) url.set('showDismissed', 'true');
    if (f.sortBy && f.sortBy !== 'first_seen_at') url.set('sortBy', f.sortBy);
    if (f.sortDir && f.sortDir !== 'desc') url.set('sortDir', f.sortDir);
    if (f.page && f.page > 1) url.set('page', String(f.page));
    router.replace(`/listings?${url.toString()}`, { scroll: false });
  };

  const handleFiltersChange = (next: ListingFilters) => {
    const reset = { ...next, page: 1 }; // reset to page 1 on filter change
    setFilters(reset);
    syncUrl(reset);
  };

  const handleMarkSeen = () => {
    listings.forEach((l) => {
      if (l.viewStatus === 'new') {
        updateListing({ id: l.id, data: { viewStatus: 'seen' } });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Listings</h1>
          {!isLoading && (
            <p className="text-sm text-muted-foreground">{total.toLocaleString()} results</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleMarkSeen}>
            Mark page as seen
          </Button>
          <div className="flex gap-1">
            <Button
              variant={view === 'grid' ? 'default' : 'outline'}
              size="icon-sm"
              onClick={() => handleViewChange('grid')}
              title="Grid view"
            >
              <LayoutGrid />
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              size="icon-sm"
              onClick={() => handleViewChange('table')}
              title="Table view"
            >
              <List />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <ListingFiltersBar filters={filters} onChange={handleFiltersChange} />

      {/* Content */}
      {isLoading ? (
        view === 'grid' ? <GridSkeleton /> : <TableSkeleton />
      ) : listings.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          No listings found
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <ListingTable listings={listings} />
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const next = { ...filters, page: page - 1 };
              setFilters(next);
              syncUrl(next);
            }}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => {
              const next = { ...filters, page: page + 1 };
              setFilters(next);
              syncUrl(next);
            }}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <ListingsContent />
    </Suspense>
  );
}
