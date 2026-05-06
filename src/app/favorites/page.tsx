'use client';

import { useState } from 'react';
import { useListings } from '@/hooks/use-listings';
import { ListingCard } from '@/components/listing-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type SortOption = 'favorited_at' | 'deal_score' | 'price';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'favorited_at', label: 'Favorited Date' },
  { value: 'deal_score', label: 'Deal Score' },
  { value: 'price', label: 'Price' },
];

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export default function FavoritesPage() {
  const [sortBy, setSortBy] = useState<SortOption>('favorited_at');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Map our sort option to API param
  const apiSortBy =
    sortBy === 'favorited_at' ? 'first_seen_at' : sortBy === 'deal_score' ? 'deal_score' : 'price';

  const { data, isLoading } = useListings({
    isFavorited: 'true',
    sortBy: apiSortBy,
    sortDir: 'desc',
    page: String(page),
    limit: String(limit),
  });

  const listings = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            Favorites
            {!isLoading && total > 0 && (
              <Badge variant="secondary">{total}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Your saved listings</p>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortOption); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <p className="text-muted-foreground text-sm">No favorites yet</p>
          <p className="text-xs text-muted-foreground">
            Heart a listing to save it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
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
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
