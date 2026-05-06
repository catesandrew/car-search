'use client';

import { useRouter } from 'next/navigation';
import { Heart, X, ExternalLink } from 'lucide-react';
import type { Listing } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DealScoreBadge } from '@/components/deal-score-badge';
import { useUpdateListing } from '@/hooks/use-listings';
import { cn } from '@/lib/utils';

function formatPrice(cents: number | null): string {
  if (cents == null) return '—';
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function formatMileage(miles: number | null): string {
  if (miles == null) return '—';
  return `${miles.toLocaleString('en-US')} mi`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHrs < 1) return 'Just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ListingTableProps {
  listings: Listing[];
}

export function ListingTable({ listings }: ListingTableProps) {
  const router = useRouter();
  const { mutate: updateListing } = useUpdateListing();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Image</TableHead>
          <TableHead>Vehicle</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Mileage</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Listed</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {listings.map((listing) => {
          const title = [listing.year, listing.make, listing.model, listing.trim]
            .filter(Boolean)
            .join(' ') || 'Unknown Vehicle';

          return (
            <TableRow
              key={listing.id}
              className="cursor-pointer"
              onClick={() => router.push(`/listing/${listing.id}`)}
            >
              {/* Thumbnail */}
              <TableCell>
                <div className="w-14 h-10 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {listing.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.imageUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">No img</span>
                  )}
                </div>
              </TableCell>

              {/* Vehicle */}
              <TableCell>
                <div className="font-medium text-sm max-w-48 truncate">{title}</div>
                {listing.location && (
                  <div className="text-xs text-muted-foreground truncate max-w-48">
                    {listing.location}
                  </div>
                )}
              </TableCell>

              {/* Price */}
              <TableCell className="font-semibold">{formatPrice(listing.price)}</TableCell>

              {/* Mileage */}
              <TableCell className="text-muted-foreground">{formatMileage(listing.mileage)}</TableCell>

              {/* Score */}
              <TableCell>
                {listing.dealScore != null ? (
                  <DealScoreBadge score={listing.dealScore} />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>

              {/* Source */}
              <TableCell>
                <Badge variant="outline" className="capitalize text-xs">
                  {listing.source}
                </Badge>
              </TableCell>

              {/* Listed date */}
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(listing.firstSeenAt)}
              </TableCell>

              {/* Status */}
              <TableCell>
                {listing.viewStatus === 'new' ? (
                  <Badge className="text-xs">New</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Seen</span>
                )}
              </TableCell>

              {/* Actions */}
              <TableCell>
                <div
                  className="flex items-center justify-end gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      updateListing({ id: listing.id, data: { isFavorited: !listing.isFavorited } })
                    }
                    className={cn(
                      listing.isFavorited ? 'text-red-500 hover:text-red-600' : ''
                    )}
                    title={listing.isFavorited ? 'Unfavorite' : 'Favorite'}
                  >
                    <Heart className={cn('size-3.5', listing.isFavorited && 'fill-current')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      updateListing({ id: listing.id, data: { isDismissed: !listing.isDismissed } })
                    }
                    title={listing.isDismissed ? 'Undismiss' : 'Dismiss'}
                  >
                    <X className="size-3.5" />
                  </Button>
                  {listing.url && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => window.open(listing.url!, '_blank')}
                      title="Open listing"
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
