import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ItemLibraryEntry } from '@shared/schema';

export function useItemLibrary() {
  return useQuery<ItemLibraryEntry[]>({
    queryKey: ['/api/item-library'],
    queryFn: () => fetch('/api/item-library', { credentials: 'include' }).then(r => r.json()),
  });
}

export function useCreateItemLibraryEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; defaultUnitQuantity: number; category?: string; fabricType?: string | null }) =>
      apiRequest('POST', '/api/item-library', data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/item-library'] });
      toast({ title: 'Kalem kütüphaneye eklendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Eklenemedi', variant: 'destructive' });
    }
  });
}

export function useUpdateItemLibraryEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; defaultUnitQuantity?: number; category?: string; fabricType?: string | null }) =>
      apiRequest('PUT', `/api/item-library/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/item-library'] });
      toast({ title: 'Kalem güncellendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Güncelleme başarısız', variant: 'destructive' });
    }
  });
}

export function useDeleteItemLibraryEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/item-library/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/item-library'] });
      toast({ title: 'Kalem kütüphaneden silindi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Silme başarısız', variant: 'destructive' });
    }
  });
}
