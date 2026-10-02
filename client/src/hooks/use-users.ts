import { useQuery } from '@tanstack/react-query';
import { api } from '@shared/routes';

export function useUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
    queryFn: async () => {
      const res = await fetch(api.users.list.path, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Unauthorized');
        throw new Error('Failed to fetch users');
      }
      return api.users.list.responses[200].parse(await res.json());
    },
  });
}
