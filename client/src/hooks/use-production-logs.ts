import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ProductionLog } from '@shared/schema';

export function useProductionLogs(recordId: number, phase?: string) {
  const url = `/api/records/${recordId}/production-logs${phase ? `?phase=${phase}` : ''}`;
  return useQuery<ProductionLog[]>({
    queryKey: ['/api/records', recordId, 'production-logs', phase],
    queryFn: () => fetch(url, { credentials: 'include' }).then(r => r.json()),
    enabled: recordId > 0,
  });
}

export function useAllProductionLogs(phase?: string) {
  const url = `/api/production-logs${phase ? `?phase=${phase}` : ''}`;
  return useQuery<ProductionLog[]>({
    queryKey: ['/api/production-logs', phase],
    queryFn: () => fetch(url, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 30000,
  });
}

export function useCreateProductionLog(recordId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: { phase: string; quantity: number; notes?: string; orderItemId?: number | null }) =>
      apiRequest('POST', `/api/records/${recordId}/production-logs`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records', recordId, 'production-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
      // Sevkiyat-phase logs change readyBoxes for the shipments list.
      queryClient.invalidateQueries({ queryKey: ['/api/shipments'] });
      toast({ title: 'Üretim kaydedildi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Kayıt eklenemedi', variant: 'destructive' });
    }
  });
}

export function useDeleteProductionLog(recordId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (logId: number) => apiRequest('DELETE', `/api/production-logs/${logId}?recordId=${recordId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records', recordId, 'production-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-summary'] });
      // Sevkiyat-phase log deletion changes readyBoxes for the shipments list.
      queryClient.invalidateQueries({ queryKey: ['/api/shipments'] });
      toast({ title: 'Kayıt silindi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Silme başarısız', variant: 'destructive' });
    }
  });
}
