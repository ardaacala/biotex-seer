import { useQuery } from '@tanstack/react-query';
import type { ProductionRecord } from '@shared/schema';

export interface ProductionLogEntry {
  id: number;
  quantity: number;
  notes: string | null;
  completedAt: string | null;
  username: string;
}

export interface ItemPhaseData {
  id: number;
  name: string;
  unitQuantity: number;
  target: number;
  category: string;
  completed: number;
  pct: number;
  pastalPhotoUrl: string | null;
  urunIslemPhotoUrl: string | null;
  katlamaPhotoUrl: string | null;
  lastLog: ProductionLogEntry | null;
  allLogs: ProductionLogEntry[];
}

export interface OrderItemBasic {
  id: number;
  name: string;
  unitQuantity: number;
  category: string;
}

export interface PhaseData {
  key: string;
  label: string;
  target: number;
  unit: 'adet' | 'koli';
  completed: number;
  pct: number;
  lastLog: ProductionLogEntry | null;
  allLogs: ProductionLogEntry[];
  items?: ItemPhaseData[];
  allOrderItems?: OrderItemBasic[];
}

export interface ProductionSummaryItem {
  record: ProductionRecord;
  phases: PhaseData[];
  totalPct: number;
  phasesFullyDone: number;
  hasKumas: boolean;
}

export function useProductionSummary() {
  return useQuery<ProductionSummaryItem[]>({
    queryKey: ['/api/production-summary'],
    queryFn: async () => {
      const r = await fetch('/api/production-summary', { credentials: 'include' });
      if (r.status === 401) throw new Error('401');
      if (!r.ok) throw new Error('Özet yüklenemedi');
      return r.json();
    },
    refetchInterval: 30000,
    retry: false,
  });
}
