'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardStats } from '@/lib/types';

export function StatsCards() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="mb-2 h-8 w-16" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'New Listings',
      value: data?.newCount ?? 0,
      colorClass: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Total Tracked',
      value: data?.totalListings ?? 0,
      colorClass: 'text-foreground',
    },
    {
      label: 'Favorites',
      value: data?.favoritesCount ?? 0,
      colorClass: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      label: 'Avg Deal Score',
      value: data?.avgDealScore != null ? data.avgDealScore.toFixed(1) : '—',
      colorClass: 'text-green-600 dark:text-green-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(card => (
        <Card key={card.label}>
          <CardContent className="pt-4">
            <p className={`text-3xl font-bold tabular-nums ${card.colorClass}`}>
              {card.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
