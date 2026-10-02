import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { OrderItem } from '@shared/schema';

export function useOrderItems(recordId: number) {
  return useQuery<OrderItem[]>({
    queryKey: ['/api/records', recordId, 'items'],
    queryFn: () => fetch(`/api/records/${recordId}/items`, { credentials: 'include' }).then(r => r.json()),
    enabled: recordId > 0,
  });
}

export function useCreateOrderItem(recordId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: { name: string; unitQuantity: number; category?: string; fabricType?: string | null; fabricPhases?: string[] | null; description?: string; stokTurHedef?: string | null; stokAltTurHedef?: string | null; unitPrice?: number | null; unitPriceCurrency?: 'TRY' | 'USD' | 'EUR' }) =>
      apiRequest('POST', `/api/records/${recordId}/items`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records', recordId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/item-library'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-summary'] });
      toast({ title: 'Kalem eklendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Kalem eklenemedi', variant: 'destructive' });
    }
  });
}

export function useUpdateOrderItem(recordId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number;
      name?: string;
      unitQuantity?: number;
      category?: string;
      fabricType?: string | null;
      fabricPhases?: string[] | null;
      description?: string;
      pastalPhotoUrl?: string | null;
      urunIslemPhotoUrl?: string | null;
      katlamaPhotoUrl?: string | null;
      stokTurHedef?: string | null;
      stokAltTurHedef?: string | null;
      unitPrice?: number | null;
      unitPriceCurrency?: 'TRY' | 'USD' | 'EUR';
    }) =>
      apiRequest('PUT', `/api/records/${recordId}/items/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records', recordId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-summary'] });
      toast({ title: 'Kalem güncellendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Güncelleme başarısız', variant: 'destructive' });
    }
  });
}

export function useDeleteOrderItem(recordId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (itemId: number) => apiRequest('DELETE', `/api/records/${recordId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records', recordId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-summary'] });
      toast({ title: 'Kalem silindi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Silme başarısız', variant: 'destructive' });
    }
  });
}
