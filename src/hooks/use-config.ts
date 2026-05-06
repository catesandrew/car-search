'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SearchConfig } from '@/lib/types';

export function useConfig() {
  return useQuery<SearchConfig>({
    queryKey: ['config'],
    queryFn: () => fetch('/api/config').then(r => r.json()),
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SearchConfig>) =>
      fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}
