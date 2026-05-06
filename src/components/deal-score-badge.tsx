import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DealScoreBadgeProps {
  score: number;
}

export function DealScoreBadge({ score }: DealScoreBadgeProps) {
  const variant =
    score >= 7 ? 'default' : score >= 4 ? 'secondary' : 'destructive';

  const colorClass =
    score >= 7
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : score >= 4
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';

  return (
    <Badge variant={variant} className={cn(colorClass)}>
      {score.toFixed(1)}
    </Badge>
  );
}
