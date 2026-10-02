import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, buildUrl } from '@shared/routes';
import { type CreateRecordRequest, type UpdateRecordRequest } from '@shared/schema';
import { useToast } from './use-toast';
import { ToastAction } from '@/components/ui/toast';
import { encodeDataUrisForWaf } from '@/lib/queryClient';

export function useRecords(filters?: { search?: string; status?: string }) {
  return useQuery({
    queryKey: [api.records.list.path, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      if (filters?.status) params.append('status', filters.status);
      
      const url = `${api.records.list.path}${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Kayıtlar getirilemedi');
      return api.records.list.responses[200].parse(await res.json());
    },
  });
}

export function useRecord(id: number) {
  return useQuery({
    queryKey: [api.records.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.records.get.path, { id });
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Kayıt detayı getirilemedi');
      return api.records.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateRecord() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: CreateRecordRequest) => {
      const res = await fetch(api.records.create.path, {
        method: api.records.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: encodeDataUrisForWaf(JSON.stringify(data)),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Kayıt oluşturulamadı');
      }
      return api.records.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.records.list.path] });
      toast({ title: 'Başarılı', description: 'Üretim emri başarıyla oluşturuldu.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Hata', description: error.message, variant: 'destructive' });
    }
  });
}

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export function useUpdateRecord() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, clientUpdatedAt, ...updates }: { id: number; clientUpdatedAt?: string } & UpdateRecordRequest) => {
      const url = buildUrl(api.records.update.path, { id });
      const res = await fetch(url, {
        method: api.records.update.method,
        headers: { 'Content-Type': 'application/json' },
        body: encodeDataUrisForWaf(JSON.stringify({ ...updates, clientUpdatedAt })),
        credentials: 'include',
      });
      if (res.status === 409) {
        const error = await res.json();
        throw new ConflictError(error.message || 'Kayıt çakışması');
      }
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Güncelleme başarısız');
      }
      return api.records.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.records.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.records.get.path, id] });
      toast({ title: 'Başarılı', description: 'Üretim emri güncellendi.' });
    },
    onError: (error: Error, { id }) => {
      if (error.name === 'ConflictError') {
        toast({
          title: 'Kayıt Güncellendi',
          description: error.message,
          variant: 'destructive',
          action: React.createElement(
            ToastAction,
            {
              altText: 'Yenile',
              onClick: () => {
                queryClient.invalidateQueries({ queryKey: [api.records.get.path, id] });
                queryClient.invalidateQueries({ queryKey: [api.records.list.path] });
              },
            },
            'Yenile'
          ),
        });
      } else {
        toast({ title: 'Hata', description: error.message, variant: 'destructive' });
      }
    }
  });
}

export function useDeleteRecord() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.records.delete.path, { id });
      const res = await fetch(url, {
        method: api.records.delete.method,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Kayıt silinemedi');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.records.list.path] });
      toast({ title: 'Silindi', description: 'Üretim emri başarıyla silindi.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Hata', description: error.message, variant: 'destructive' });
    }
  });
}
