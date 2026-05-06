'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { StatsCards } from '@/components/stats-cards';
import { ListingCard } from '@/components/listing-card';
import { ScanButton } from '@/components/scan-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useScrapeStatus } from '@/hooks/use-scrape';
import type { PaginatedResponse, Listing } from '@/lib/types';

function ListingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Skeleton className="aspect-video w-full" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: newListings, isLoading: listingsLoading } =
    useQuery<PaginatedResponse<Listing>>({
      queryKey: ['listings', { viewStatus: 'new', limit: '10' }],
      queryFn: () =>
        fetch('/api/listings?viewStatus=new&limit=10').then(r => r.json()),
    });

  const { data: scrapeStatus } = useScrapeStatus();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your truck search overview
          </p>
        </div>
        <ScanButton />
      </div>

      {/* Stats */}
      <StatsCards />

      {/* New Listings */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Listings</h2>
          <Link
            href="/listings"
            className="text-sm text-primary hover:underline"
          >
            View all listings
          </Link>
        </div>

        {listingsLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        ) : newListings?.data && newListings.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {newListings.data.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No new listings. Run a scan to find trucks.
          </div>
        )}
      </section>

      {/* Last scrape status */}
      {scrapeStatus && (
        <section className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Last Scan</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Source</dt>
              <dd className="font-medium capitalize">{scrapeStatus.source}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">
                {scrapeStatus.status ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">New</dt>
              <dd className="font-medium">{scrapeStatus.newCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Updated</dt>
              <dd className="font-medium">{scrapeStatus.updatedCount ?? 0}</dd>
            </div>
          </dl>
          {scrapeStatus.error && (
            <p className="mt-2 text-xs text-destructive">{scrapeStatus.error}</p>
          )}
        </section>
      )}
    </div>
  );
}
