import { useQuery } from '@tanstack/react-query';
import type { StokItem } from '@shared/schema';

export function useStokItems() {
  return useQuery<StokItem[]>({
    queryKey: ['/api/stok'],
  });
}
