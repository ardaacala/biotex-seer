import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@shared/routes';
import { useToast } from './use-toast';
import { z } from 'zod';
import type { User } from '@shared/schema';
import { captureVersion } from '@/lib/queryClient';

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: 'include' });
      captureVersion(res);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: z.infer<typeof api.auth.login.input>) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        credentials: 'include',
      });
      captureVersion(res);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          remaining?: number;
        };
        const err: Error & { remaining?: number } =
          Object.assign(new Error(body.message || 'Giriş başarısız.'), {
            remaining: body.remaining,
          });
        throw err;
      }
      return res.json() as Promise<User>;
    },
    onSuccess: (userData) => {
      queryClient.setQueryData([api.auth.me.path], userData);
      toast({ title: 'Hoş geldiniz!', description: 'Giriş başarılı.' });
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof api.auth.register.input>) => {
      const res = await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      captureVersion(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Registration failed');
      }
      return res.json() as Promise<User>;
    },
    onSuccess: (userData) => {
      queryClient.setQueryData([api.auth.me.path], userData);
      toast({ title: 'Account created!', description: 'Welcome to the system.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Registration Failed', description: error.message, variant: 'destructive' });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: 'include',
      });
      captureVersion(res);
      if (!res.ok) throw new Error('Logout failed');
    },
    onSuccess: () => {
      queryClient.setQueryData([api.auth.me.path], null);
      queryClient.clear();
      toast({ title: 'Logged out', description: 'See you next time.' });
    },
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
