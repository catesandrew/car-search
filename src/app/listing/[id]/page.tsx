'use client';

import { use } from 'react';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Heart,
  X,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useListingDetail, useUpdateListing } from '@/hooks/use-listings';
import { PriceChart } from '@/components/price-chart';
import { NotesPanel } from '@/components/notes-panel';
import { DealScoreBadge } from '@/components/deal-score-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function formatPrice(cents: number | null): string {
  if (cents == null) return 'N/A';
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function formatMileage(miles: number | null): string {
  if (miles == null) return 'N/A';
  return `${miles.toLocaleString('en-US')} mi`;
}

function HistoryFlag({ label, value }: { label: string; value: boolean | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {value ? (
        <CheckCircle2 className="size-4 text-green-600 shrink-0" />
      ) : (
        <XCircle className="size-4 text-red-500 shrink-0" />
      )}
      <span className={value ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
        {label}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: listing, isLoading, error } = useListingDetail(Number(id));
  const { mutate: updateListing } = useUpdateListing();
  const [imgError, setImgError] = useState(false);

  if (isLoading) return <DetailSkeleton />;

  if (error || !listing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 p-4">
        <p className="text-lg font-medium">Listing not found</p>
        <p className="text-sm text-muted-foreground">
          This listing may have been removed or the URL is incorrect.
        </p>
        <Link
          href="/listings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to listings
        </Link>
      </div>
    );
  }

  const title =
    [listing.year, listing.make, listing.model, listing.trim].filter(Boolean).join(' ') ||
    'Unknown Vehicle';

  const sourceLabel = listing.source.charAt(0).toUpperCase() + listing.source.slice(1);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto pb-20 md:pb-6">
      {/* Back */}
      <div>
        <Link
          href="/listings"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-2"
        >
          <ArrowLeft className="size-4" />
          Listings
        </Link>
      </div>

      {/* Hero image */}
      <div className="relative w-full h-72 rounded-xl overflow-hidden bg-muted">
        {listing.imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No image available
          </div>
        )}

        {/* Overlaid stats */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-3 bg-gradient-to-t from-black/60 to-transparent">
          <div>
            <p className="text-white font-bold text-2xl">{formatPrice(listing.price)}</p>
            <p className="text-white/80 text-sm">{formatMileage(listing.mileage)}</p>
          </div>
          {listing.dealScore != null && (
            <DealScoreBadge score={listing.dealScore} />
          )}
        </div>

        {/* Source badge */}
        <Badge className="absolute top-3 left-3 capitalize" variant="secondary">
          {listing.source}
        </Badge>
      </div>

      {/* Title + actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          {listing.location && (
            <p className="text-muted-foreground text-sm mt-1">{listing.location}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={listing.isFavorited ? 'default' : 'outline'}
            size="sm"
            onClick={() =>
              updateListing({ id: listing.id, data: { isFavorited: !listing.isFavorited } })
            }
            className="gap-1.5"
          >
            <Heart className={listing.isFavorited ? 'fill-current size-4' : 'size-4'} />
            {listing.isFavorited ? 'Favorited' : 'Favorite'}
          </Button>
          <Button
            variant={listing.isDismissed ? 'secondary' : 'outline'}
            size="sm"
            onClick={() =>
              updateListing({ id: listing.id, data: { isDismissed: !listing.isDismissed } })
            }
            className="gap-1.5"
          >
            <X className="size-4" />
            {listing.isDismissed ? 'Dismissed' : 'Dismiss'}
          </Button>
          {listing.url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(listing.url!, '_blank')}
              className="gap-1.5"
            >
              <ExternalLink className="size-4" />
              Open on {sourceLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vehicle info */}
        <div className="flex flex-col gap-4">
          <section className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-col gap-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Vehicle Info
            </h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              {listing.year && (
                <>
                  <span className="text-muted-foreground">Year</span>
                  <span className="font-medium">{listing.year}</span>
                </>
              )}
              {listing.make && (
                <>
                  <span className="text-muted-foreground">Make</span>
                  <span className="font-medium">{listing.make}</span>
                </>
              )}
              {listing.model && (
                <>
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-medium">{listing.model}</span>
                </>
              )}
              {listing.trim && (
                <>
                  <span className="text-muted-foreground">Trim</span>
                  <span className="font-medium">{listing.trim}</span>
                </>
              )}
              {listing.vin && (
                <>
                  <span className="text-muted-foreground">VIN</span>
                  <span className="font-mono text-xs font-medium break-all">{listing.vin}</span>
                </>
              )}
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">{formatPrice(listing.price)}</span>
              <span className="text-muted-foreground">Mileage</span>
              <span className="font-medium">{formatMileage(listing.mileage)}</span>
            </div>
          </section>

          {/* Dealer info */}
          {(listing.dealerName || listing.dealerType) && (
            <section className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-col gap-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Seller
              </h2>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                {listing.dealerName && (
                  <>
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{listing.dealerName}</span>
                  </>
                )}
                {listing.dealerType && (
                  <>
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">{listing.dealerType}</span>
                  </>
                )}
              </div>
            </section>
          )}

          {/* History flags */}
          {(listing.oneOwner != null || listing.noAccidents != null || listing.personalUse != null) && (
            <section className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-col gap-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Vehicle History
              </h2>
              <div className="flex flex-col gap-1.5">
                <HistoryFlag label="One Owner" value={listing.oneOwner} />
                <HistoryFlag label="No Accidents" value={listing.noAccidents} />
                <HistoryFlag label="Personal Use" value={listing.personalUse} />
              </div>
            </section>
          )}
        </div>

        {/* Price history + Notes */}
        <div className="flex flex-col gap-4">
          {listing.priceHistory.length > 0 && (
            <section className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-col gap-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Price History
              </h2>
              <PriceChart priceHistory={listing.priceHistory} />
            </section>
          )}

          <section className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-col gap-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Notes &amp; Calls
            </h2>
            <NotesPanel listingId={listing.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
