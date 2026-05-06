'use client';

import { useState } from 'react';
import { SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface ListingFilters {
  source?: string;
  priceMin?: string;
  priceMax?: string;
  mileageMin?: string;
  mileageMax?: string;
  yearMin?: string;
  yearMax?: string;
  scoreMin?: string;
  viewStatus?: string;
  showDismissed?: boolean;
  isFavorited?: boolean;
  sortBy?: string;
  sortDir?: string;
  page?: number;
}
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface ListingFiltersProps {
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
}

function FilterFields({
  filters,
  onChange,
}: {
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
}) {
  const update = (key: keyof ListingFilters, value: unknown) =>
    onChange({ ...filters, [key]: value, page: 1 });

  return (
    <div className="flex flex-col gap-4">
      {/* Source */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Source</label>
        <Select
          value={filters.source ?? 'all'}
          onValueChange={(v) => update('source', v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="cars.com">cars.com</SelectItem>
            <SelectItem value="autotrader">AutoTrader</SelectItem>
            <SelectItem value="kbb">KBB</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Price */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Price ($)</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.priceMin ?? ''}
            onChange={(e) => update('priceMin', e.target.value || undefined)}
          />
          <Input
            type="number"
            placeholder="Max"
            value={filters.priceMax ?? ''}
            onChange={(e) => update('priceMax', e.target.value || undefined)}
          />
        </div>
      </div>

      {/* Mileage */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Mileage</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.mileageMin ?? ''}
            onChange={(e) => update('mileageMin', e.target.value || undefined)}
          />
          <Input
            type="number"
            placeholder="Max"
            value={filters.mileageMax ?? ''}
            onChange={(e) => update('mileageMax', e.target.value || undefined)}
          />
        </div>
      </div>

      {/* Year */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Year</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.yearMin ?? ''}
            onChange={(e) => update('yearMin', e.target.value || undefined)}
          />
          <Input
            type="number"
            placeholder="Max"
            value={filters.yearMax ?? ''}
            onChange={(e) => update('yearMax', e.target.value || undefined)}
          />
        </div>
      </div>

      {/* Deal Score Min */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Min Deal Score</label>
        <Input
          type="number"
          placeholder="e.g. 60"
          value={filters.scoreMin ?? ''}
          onChange={(e) => update('scoreMin', e.target.value || undefined)}
        />
      </div>

      {/* View Status */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">View Status</label>
        <div className="flex gap-1">
          {(['all', 'new', 'seen'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={(!filters.viewStatus && s === 'all') || filters.viewStatus === s ? 'default' : 'outline'}
              onClick={() => update('viewStatus', s === 'all' ? undefined : s)}
              className="flex-1 capitalize"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={!!filters.showDismissed}
            onChange={(e) => update('showDismissed', e.target.checked || undefined)}
            className="rounded"
          />
          Show dismissed
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={!!filters.isFavorited}
            onChange={(e) => update('isFavorited', e.target.checked || undefined)}
            className="rounded"
          />
          Favorites only
        </label>
      </div>

      {/* Sort */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Sort By</label>
        <div className="flex gap-2">
          <Select
            value={filters.sortBy ?? 'first_seen_at'}
            onValueChange={(v) => update('sortBy', v)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deal_score">Deal Score</SelectItem>
              <SelectItem value="price">Price</SelectItem>
              <SelectItem value="mileage">Mileage</SelectItem>
              <SelectItem value="first_seen_at">Date Found</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => update('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')}
            title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            <ArrowUpDown />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ListingFiltersBar({ filters, onChange }: ListingFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop: horizontal toolbar */}
      <div className="hidden md:flex flex-wrap gap-3 items-end p-3 bg-card rounded-xl ring-1 ring-foreground/10">
        {/* Source */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Source</label>
          <Select
            value={filters.source ?? 'all'}
            onValueChange={(v) =>
              onChange({ ...filters, source: v === 'all' ? undefined : (v as string), page: 1 })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="cars.com">cars.com</SelectItem>
              <SelectItem value="autotrader">AutoTrader</SelectItem>
              <SelectItem value="kbb">KBB</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Price */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Price ($)</label>
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder="Min"
              className="w-24"
              value={filters.priceMin ?? ''}
              onChange={(e) =>
                onChange({ ...filters, priceMin: e.target.value || undefined, page: 1 })
              }
            />
            <Input
              type="number"
              placeholder="Max"
              className="w-24"
              value={filters.priceMax ?? ''}
              onChange={(e) =>
                onChange({ ...filters, priceMax: e.target.value || undefined, page: 1 })
              }
            />
          </div>
        </div>

        {/* Mileage */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Mileage</label>
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder="Min"
              className="w-24"
              value={filters.mileageMin ?? ''}
              onChange={(e) =>
                onChange({ ...filters, mileageMin: e.target.value || undefined, page: 1 })
              }
            />
            <Input
              type="number"
              placeholder="Max"
              className="w-24"
              value={filters.mileageMax ?? ''}
              onChange={(e) =>
                onChange({ ...filters, mileageMax: e.target.value || undefined, page: 1 })
              }
            />
          </div>
        </div>

        {/* Year */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Year</label>
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder="Min"
              className="w-20"
              value={filters.yearMin ?? ''}
              onChange={(e) =>
                onChange({ ...filters, yearMin: e.target.value || undefined, page: 1 })
              }
            />
            <Input
              type="number"
              placeholder="Max"
              className="w-20"
              value={filters.yearMax ?? ''}
              onChange={(e) =>
                onChange({ ...filters, yearMax: e.target.value || undefined, page: 1 })
              }
            />
          </div>
        </div>

        {/* Score Min */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Min Score</label>
          <Input
            type="number"
            placeholder="0"
            className="w-20"
            value={filters.scoreMin ?? ''}
            onChange={(e) =>
              onChange({ ...filters, scoreMin: e.target.value || undefined, page: 1 })
            }
          />
        </div>

        {/* View Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <div className="flex gap-1">
            {(['all', 'new', 'seen'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={
                  (!filters.viewStatus && s === 'all') || filters.viewStatus === s
                    ? 'default'
                    : 'outline'
                }
                onClick={() =>
                  onChange({ ...filters, viewStatus: s === 'all' ? undefined : s, page: 1 })
                }
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Checkboxes */}
        <div className="flex flex-col gap-1 self-end mb-0.5">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={!!filters.showDismissed}
              onChange={(e) =>
                onChange({ ...filters, showDismissed: e.target.checked || undefined, page: 1 })
              }
            />
            Dismissed
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={!!filters.isFavorited}
              onChange={(e) =>
                onChange({ ...filters, isFavorited: e.target.checked || undefined, page: 1 })
              }
            />
            Favorites
          </label>
        </div>

        {/* Sort */}
        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs font-medium text-muted-foreground">Sort</label>
          <div className="flex gap-1">
            <Select
              value={filters.sortBy ?? 'first_seen_at'}
              onValueChange={(v) => onChange({ ...filters, sortBy: v as string, page: 1 })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deal_score">Deal Score</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="mileage">Mileage</SelectItem>
                <SelectItem value="first_seen_at">Date Found</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                onChange({
                  ...filters,
                  sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc',
                  page: 1,
                })
              }
              title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              <ArrowUpDown />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile: sheet trigger */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger render={<Button variant="outline" className="gap-2" />}>
            <SlidersHorizontal className="size-4" />
            Filters
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">
              <FilterFields filters={filters} onChange={onChange} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
