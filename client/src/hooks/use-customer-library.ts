import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { CustomerLibraryEntry } from '@shared/schema';

export function useCustomerLibrary() {
  return useQuery<CustomerLibraryEntry[]>({
    queryKey: ['/api/customer-library'],
    queryFn: () => fetch('/api/customer-library', { credentials: 'include' }).then(r => r.json()),
  });
}

type CustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: CustomerInput) =>
      apiRequest('POST', '/api/customer-library', data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-library'] });
      toast({ title: 'Müşteri kütüphaneye eklendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Eklenemedi', variant: 'destructive' });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: CustomerInput & { id: number }) =>
      apiRequest('PUT', `/api/customer-library/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-library'] });
      toast({ title: 'Müşteri güncellendi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Güncelleme başarısız', variant: 'destructive' });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/customer-library/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-library'] });
      toast({ title: 'Müşteri silindi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Silme başarısız', variant: 'destructive' });
    },
  });
}
