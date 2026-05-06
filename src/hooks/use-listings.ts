'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing, PaginatedResponse, ListingDetail } from '@/lib/types';

export function useListings(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return useQuery<PaginatedResponse<Listing>>({
    queryKey: ['listings', params],
    queryFn: () => fetch(`/api/listings?${searchParams}`).then(r => r.json()),
  });
}

export function useListingDetail(id: number) {
  return useQuery<ListingDetail>({
    queryKey: ['listing', id],
    queryFn: () => fetch(`/api/listings/${id}`).then(r => r.json()),
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
