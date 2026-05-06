'use client';

import dynamic from 'next/dynamic';
import type { PriceHistoryEntry } from '@/lib/types';

interface PriceChartProps {
  priceHistory: PriceHistoryEntry[];
}

function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PriceChartInner = dynamic(
  () =>
    import('recharts').then((mod) => {
      const {
        LineChart,
        Line,
        XAxis,
        YAxis,
        CartesianGrid,
        Tooltip,
        ResponsiveContainer,
      } = mod;

      function Chart({ priceHistory }: PriceChartProps) {
        if (priceHistory.length < 2) {
          const single = priceHistory[0];
          return (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground bg-muted/40 rounded-lg">
              {single
                ? `Price: ${formatPrice(single.price ?? 0)} on ${formatDate(single.observedAt)}`
                : 'No price history available'}
            </div>
          );
        }

        const data = [...priceHistory]
          .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())
          .map((entry) => ({
            date: formatDate(entry.observedAt),
            price: entry.price != null ? Math.round(entry.price / 100) : null,
          }));

        return (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={(v) => `$${v.toLocaleString()}`}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                width={70}
              />
              <Tooltip
                formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Price']}
                contentStyle={{
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 3, fill: '#16a34a' }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        );
      }

      return Chart;
    }),
  { ssr: false, loading: () => <div className="h-48 animate-pulse bg-muted rounded-lg" /> }
);

export function PriceChart({ priceHistory }: PriceChartProps) {
  return <PriceChartInner priceHistory={priceHistory} />;
}
