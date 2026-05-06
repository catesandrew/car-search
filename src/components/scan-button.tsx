'use client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTriggerScrape } from '@/hooks/use-scrape';

export function ScanButton() {
  const { mutate, isPending } = useTriggerScrape();

  function handleScan() {
    mutate(undefined, {
      onSuccess: () => {
        toast.success('Scan started', {
          description: 'New listings will appear shortly.',
        });
      },
      onError: (err: Error) => {
        toast.error('Scan failed', {
          description: err.message,
        });
      },
    });
  }

  return (
    <Button onClick={handleScan} disabled={isPending}>
      {isPending && <Loader2 className="animate-spin" />}
      {isPending ? 'Scanning…' : 'Scan Now'}
    </Button>
  );
}
