import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { OrderTitleLibraryEntry } from '@shared/schema';

export function useOrderTitleLibrary() {
  return useQuery<OrderTitleLibraryEntry[]>({
    queryKey: ['/api/order-title-library'],
    queryFn: () => fetch('/api/order-title-library', { credentials: 'include' }).then(r => r.json()),
    refetchOnMount: 'always',
  });
}

type OrderTitleInput = {
  title: string;
  referenceId?: string | null;
};

export function useCreateOrderTitle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: OrderTitleInput) =>
      apiRequest('POST', '/api/order-title-library', data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-title-library'] });
      toast({ title: 'Sipariş başlığı kütüphaneye eklendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Eklenemedi', variant: 'destructive' });
    },
  });
}

export function useUpdateOrderTitle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: OrderTitleInput & { id: number }) =>
      apiRequest('PUT', `/api/order-title-library/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-title-library'] });
      toast({ title: 'Sipariş başlığı güncellendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Güncelleme başarısız', variant: 'destructive' });
    },
  });
}

export function useDeleteOrderTitle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/order-title-library/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-title-library'] });
      toast({ title: 'Sipariş başlığı silindi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Silme başarısız', variant: 'destructive' });
    },
  });
}
