import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { OrderItemHammadde } from '@shared/schema';

export function useOrderItemsHammadde(recordId: number) {
  return useQuery<OrderItemHammadde[]>({
    queryKey: [`/api/records/${recordId}/items-hammadde`],
    enabled: !!recordId,
  });
}

export function useAddOrderItemHammadde(recordId: number, orderItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { stokItemId: number; kullanim: string }) =>
      apiRequest('POST', `/api/records/${recordId}/items/${orderItemId}/hammadde`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/records/${recordId}/items-hammadde`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stok'] });
    },
  });
}

export function useDeleteOrderItemHammadde(recordId: number, orderItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hammaddeId: number) =>
      apiRequest('DELETE', `/api/records/${recordId}/items/${orderItemId}/hammadde/${hammaddeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/records/${recordId}/items-hammadde`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stok'] });
    },
  });
}
