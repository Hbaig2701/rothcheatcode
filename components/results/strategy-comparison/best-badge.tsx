import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Visual badge indicating the recommended strategy
 * Displayed in the comparison table header for the best strategy
 */
export function BestBadge() {
  return (
    <Badge
      variant="default"
      className="gap-1 bg-green-600 hover:bg-green-600 text-white"
    >
      <Star className="h-3 w-3 fill-current" />
      <span>BEST</span>
    </Badge>
  );
}
