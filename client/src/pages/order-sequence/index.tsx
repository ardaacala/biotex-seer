import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRecords, useUpdateRecord } from '@/hooks/use-records';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import {
  ListOrdered, TrendingUp, AlertTriangle, GripVertical, ChevronUp, ChevronDown,
  Pencil, Check, X, Loader2, Plus, Trash2, CalendarDays, RefreshCw, Target,
  ChevronsRight, ChevronRight, History, ArrowDownToLine, Star, Repeat2, FileSpreadsheet,
  ChevronsUpDown,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ProductionRecord } from '@shared/schema';
import ExcelJS from 'exceljs';

/* ─── helpers ────────────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  pending: 'Beklemede',
  in_progress: 'Devam Ediyor',
  completed: 'Tamamlandı',
  waiting_product: 'Ürün Bekleniyor',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  waiting_product: 'bg-purple-100 text-purple-700 border-purple-200',
};

function applyFifoSort(records: ProductionRecord[]): ProductionRecord[] {
  return [...records].sort((a, b) => {
    const ao = (a as any).fifoOrder ?? null;
    const bo = (b as any).fifoOrder ?? null;
    if (ao !== null && bo !== null) return ao - bo;
    if (ao !== null) return -1;
    if (bo !== null) return 1;
    if (a.priority === 'acil' && b.priority !== 'acil') return -1;
    if (a.priority !== 'acil' && b.priority === 'acil') return 1;
    const da = a.orderDate ? new Date(a.orderDate).getTime() : new Date(a.createdAt || 0).getTime();
    const db2 = b.orderDate ? new Date(b.orderDate).getTime() : new Date(b.createdAt || 0).getTime();
    return da - db2;
  });
}

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string, currentMonday: string): string {
  const nextMonday = addDays(currentMonday, 7);
  const end = addDays(weekStart, 6);
  const fmt = (s: string) => format(new Date(s + 'T00:00:00'), 'dd.MM.yyyy');
  if (weekStart === currentMonday) return `Bu Hafta (${fmt(weekStart)} – ${fmt(end)})`;
  if (weekStart === nextMonday) return `Gelecek Hafta (${fmt(weekStart)} – ${fmt(end)})`;
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

/* ─── Weekly plan types ──────────────────────────────────────────────────── */

interface WeeklyPlanItem {
  id: number;
  recordId: number;
  targetQuantity: number;
  title: string;
  lotNumber: string | null;
  customer: string | null;
  priority?: string | null;
  itemsPerBox?: number | null;
  totalQuantity?: number | null;
  actualQuantity: number;
  koliQuantity?: number;
  carryOver: number;
  isCarried?: boolean;
  createdAt?: string | null;
  phaseTotals?: Record<string, number>;
  phaseExpected?: Record<string, number>;
}

interface WeeklyPlanData {
  plan: { id: number; weekStart: string; createdBy: number; createdAt: string };
  items: WeeklyPlanItem[];
  autoCarried?: number;
}

/* Stable sort: 'acil' priority first, original order preserved within each group. */
function sortPlanItemsAcilFirst<T extends { priority?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aRank = a.priority === 'acil' ? 0 : 1;
    const bRank = b.priority === 'acil' ? 0 : 1;
    return aRank - bRank;
  });
}

/* ─── Weekly plan Excel export ───────────────────────────────────────────── */

async function exportWeeklyPlanExcel(items: WeeklyPlanItem[], weekLabel: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Haftalık Plan');

  const cols = [
    { header: 'Sipariş Adı', key: 'title', width: 36 },
    { header: 'Lot No', key: 'lot', width: 14 },
    { header: 'Müşteri', key: 'customer', width: 22 },
    { header: 'Hedef Adet', key: 'target', width: 14 },
    { header: 'Üretilen Adet', key: 'actual', width: 14 },
    { header: 'Üretilen Koli', key: 'koli', width: 14 },
    { header: 'Fark (Adet)', key: 'diff', width: 14 },
    { header: 'Durum', key: 'status', width: 18 },
    { header: 'Devredildi', key: 'carried', width: 12 },
  ];
  ws.columns = cols;

  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E9FF' } };
  });
  headerRow.height = 22;

  items.forEach(item => {
    const capped = Math.min(item.actualQuantity, item.targetQuantity);
    const pct = item.targetQuantity > 0 ? Math.round((capped / item.targetQuantity) * 100) : 0;
    const koli = item.koliQuantity ?? (
      item.itemsPerBox && item.itemsPerBox > 0
        ? Math.floor(item.actualQuantity / item.itemsPerBox)
        : 0
    );
    const diff = capped - item.targetQuantity;
    const status = pct >= 100 ? 'Tamamlandı' : pct >= 50 ? 'Devam Ediyor' : pct > 0 ? 'Başlandı' : 'Başlanmadı';
    const row = ws.addRow({
      title: item.title,
      lot: item.lotNumber ?? '',
      customer: item.customer ?? '',
      target: item.targetQuantity,
      actual: item.actualQuantity,
      koli,
      diff,
      status,
      carried: item.isCarried ? 'Evet' : 'Hayır',
    });
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: false };
    });
  });

  ws.columns.forEach(col => {
    let maxLen = col.header ? String(col.header).length : 10;
    (col as any).eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
      const v = cell.value != null ? String(cell.value) : '';
      if (v.length > maxLen) maxLen = v.length;
    });
    col.width = Math.min(maxLen + 4, 50);
  });

  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `haftalik_plan_${weekLabel}_${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── OrderSequencePage ──────────────────────────────────────────────────── */

export default function OrderSequencePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: records, isLoading: recordsLoading } = useRecords();
  const updateRecord = useUpdateRecord();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';
  const canChangeStatus = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';

  /* ── FIFO state ─────────────────────────────────────────────────────────── */
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [localOrder, setLocalOrder] = useState<ProductionRecord[] | null>(null);
  const [fifoSaving, setFifoSaving] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [editingTargetValue, setEditingTargetValue] = useState('');

  /* ── Waiting product note dialog state ─────────────────────────────────── */
  const [waitingNoteDialogId, setWaitingNoteDialogId] = useState<number | null>(null);
  const [waitingNoteInput, setWaitingNoteInput] = useState('');

  const { data: recordTotals = [] } = useQuery<{ recordId: number; total: number }[]>({
    queryKey: ['/api/dashboard/record-totals'],
    queryFn: () => fetch('/api/dashboard/record-totals', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 30000,
  });
  const totalsMap = Object.fromEntries(recordTotals.map(t => [t.recordId, t.total]));

  const productionTargetMutation = useMutation({
    mutationFn: ({ id, productionTarget }: { id: number; productionTarget: number | null }) =>
      apiRequest('PATCH', `/api/records/${id}/production-target`, { productionTarget }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
      setEditingTargetId(null);
    },
  });

  const activeRecords = records?.filter(r => r.priority !== 'pasif' && r.status !== 'completed') || [];
  const fifoRows = localOrder ?? applyFifoSort(activeRecords).slice(0, 20);

  const commitFifoOrder = useCallback(async (withOrder: ProductionRecord[]) => {
    setLocalOrder(withOrder);
    setFifoSaving(true);
    try {
      await Promise.all(
        withOrder.map(r => apiRequest('PATCH', `/api/records/${r.id}/fifo-order`, { fifoOrder: (r as any).fifoOrder }))
      );
    } finally {
      setFifoSaving(false);
      setLocalOrder(null);
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
    }
  }, [queryClient]);

  const handleDragStart = (idx: number) => { dragIdxRef.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd = () => { setDragOverIdx(null); dragIdxRef.current = null; };

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIdxRef.current;
    if (fromIdx === null || fromIdx === toIdx) { setDragOverIdx(null); return; }
    const next = [...fifoRows];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const withOrder = next.map((r, i) => ({ ...r, fifoOrder: i + 1 }));
    setDragOverIdx(null);
    commitFifoOrder(withOrder);
  }, [fifoRows, commitFifoOrder]);

  const moveRow = useCallback((idx: number, dir: -1 | 1) => {
    const toIdx = idx + dir;
    if (toIdx < 0 || toIdx >= fifoRows.length) return;
    const next = [...fifoRows];
    const [moved] = next.splice(idx, 1);
    next.splice(toIdx, 0, moved);
    const withOrder = next.map((r, i) => ({ ...r, fifoOrder: i + 1 }));
    commitFifoOrder(withOrder);
  }, [fifoRows, commitFifoOrder]);

  const resetFifoOrder = useCallback(async () => {
    setFifoSaving(true);
    try {
      await Promise.all(fifoRows.map(r => apiRequest('PATCH', `/api/records/${r.id}/fifo-order`, { fifoOrder: null })));
    } finally {
      setFifoSaving(false);
      setLocalOrder(null);
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
    }
  }, [fifoRows, queryClient]);

  /* ── Weekly plan state ──────────────────────────────────────────────────── */
  const currentMonday = getMondayOfCurrentWeek();
  const nextMonday = addDays(currentMonday, 7);

  const [selectedWeek, setSelectedWeek] = useState<string>(currentMonday);
  const [addRecordId, setAddRecordId] = useState<string>('');
  const [addTarget, setAddTarget] = useState<string>('');
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemTarget, setEditingItemTarget] = useState<string>('');
  const [expandedPastWeek, setExpandedPastWeek] = useState<string | null>(null);
  const [expandedPlanItem, setExpandedPlanItem] = useState<number | null>(null);

  const { data: allPlans = [] } = useQuery<{ id: number; weekStart: string; createdAt: string; itemCount: number }[]>({
    queryKey: ['/api/weekly-plans'],
    refetchInterval: 120000,
  });

  const { data: weeklyPlan, isLoading: planLoading, refetch: refetchPlan } = useQuery<WeeklyPlanData | null>({
    queryKey: ['/api/weekly-plans/by-week', selectedWeek],
    queryFn: () => fetch(`/api/weekly-plans/by-week?weekStart=${selectedWeek}`, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 60000,
  });

  const { data: expandedPastPlanData, isLoading: expandedLoading } = useQuery<WeeklyPlanData | null>({
    queryKey: ['/api/weekly-plans/by-week', expandedPastWeek],
    queryFn: () => fetch(`/api/weekly-plans/by-week?weekStart=${expandedPastWeek}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!expandedPastWeek,
  });

  const planQueryKey = ['/api/weekly-plans/by-week', selectedWeek];

  type WeeklyTargetSummary = { totalQuantity: number; plannedSum: number; remaining: number };

  const addRecordIdNum = addRecordId ? Number(addRecordId) : null;
  const addSummaryQuery = useQuery<WeeklyTargetSummary>({
    queryKey: ['/api/records', addRecordIdNum, 'weekly-target-summary'],
    queryFn: () => fetch(`/api/records/${addRecordIdNum}/weekly-target-summary`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!addRecordIdNum,
  });
  const addRemaining = addSummaryQuery.data?.remaining ?? null;
  const addTargetNum = addTarget === '' ? null : Number(addTarget);
  const addExceeds = addRemaining !== null && addTargetNum !== null && Number.isFinite(addTargetNum) && addTargetNum > addRemaining;

  const editingRecordId = (() => {
    if (editingItemId == null) return null;
    const found = (weeklyPlan?.items ?? []).find(i => i.id === editingItemId);
    return found ? found.recordId : null;
  })();
  const editSummaryQuery = useQuery<WeeklyTargetSummary>({
    queryKey: ['/api/records', editingRecordId, 'weekly-target-summary', editingItemId],
    queryFn: () => fetch(`/api/records/${editingRecordId}/weekly-target-summary?excludeItemId=${editingItemId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: editingItemId != null && editingRecordId != null,
  });
  const editRemaining = editSummaryQuery.data?.remaining ?? null;
  const editTargetNum = editingItemTarget === '' ? null : Number(editingItemTarget);
  const editExceeds = editRemaining !== null && editTargetNum !== null && Number.isFinite(editTargetNum) && editTargetNum > editRemaining;

  const parseApiError = (err: unknown): { code?: string; message?: string; remaining?: number; totalQuantity?: number } => {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    const m = raw.match(/^\d+:\s*(\{.*\})$/s);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* ignore */ }
    }
    return { message: raw };
  };

  const showTargetError = (err: unknown, fallbackTitle: string) => {
    const parsed = parseApiError(err);
    if (parsed.code === 'WEEKLY_TARGET_EXCEEDS_TOTAL') {
      toast({
        title: 'Hedef sipariş adetini aşıyor',
        description: `Bu siparişin toplam adedi ${parsed.totalQuantity?.toLocaleString('tr-TR')}. Kalan kapasite: ${parsed.remaining?.toLocaleString('tr-TR')} adet.`,
        variant: 'destructive',
      });
    } else {
      toast({ title: fallbackTitle, description: parsed.message ?? 'Bilinmeyen hata.', variant: 'destructive' });
    }
  };

  const addItemMutation = useMutation({
    mutationFn: ({ planId, recordId, targetQuantity }: { planId: number; recordId: number; targetQuantity: number }) =>
      apiRequest('POST', `/api/weekly-plans/${planId}/items`, { recordId, targetQuantity }).then(r => r.json()),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: planQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-plans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/records', vars.recordId, 'weekly-target-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/records/weekly-target-summaries'] });
      setAddRecordId('');
      setAddTarget('');
    },
    onError: (err) => showTargetError(err, 'Hedef eklenemedi'),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, targetQuantity }: { itemId: number; targetQuantity: number }) =>
      apiRequest('PATCH', `/api/weekly-plans/items/${itemId}`, { targetQuantity }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
      setEditingItemId(null);
    },
    onError: (err) => showTargetError(err, 'Hedef güncellenemedi'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest('DELETE', `/api/weekly-plans/items/${itemId}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-plans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
    },
  });

  const carryForwardMutation = useMutation({
    mutationFn: ({ toPlanId, fromPlanId }: { toPlanId: number; fromPlanId: number }) =>
      apiRequest('POST', `/api/weekly-plans/${toPlanId}/carry-forward`, { fromPlanId }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: planQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-plans'] });
      if (data.carried > 0) {
        toast({ title: `${data.carried} sipariş devredildi`, description: 'Bir önceki haftadan eksik siparişler bu haftaya eklendi.' });
      } else {
        toast({ title: 'Devredilecek sipariş yok', description: 'Bir önceki haftanın tüm siparişleri tamamlanmış veya zaten eklenmiş.' });
      }
    },
  });

  useEffect(() => {
    if (weeklyPlan?.autoCarried && weeklyPlan.autoCarried > 0) {
      toast({ title: `${weeklyPlan.autoCarried} sipariş otomatik devredildi`, description: 'Bir önceki haftadan tamamlanmamış siparişler bu haftaya eklendi.' });
    }
  }, [weeklyPlan?.autoCarried]);

  /* ── Weekly plan helpers ────────────────────────────────────────────────── */
  const isPastWeek = selectedWeek < currentMonday;
  const isFutureWeek = selectedWeek > currentMonday;
  const canEditPlan = isManager && !isPastWeek;

  const weekEnd = addDays(selectedWeek, 6);
  const planItems = sortPlanItemsAcilFirst(weeklyPlan?.items ?? []);
  const planId = weeklyPlan?.plan.id;
  const hasCarryOver = planItems.some(i => (i.carryOver ?? 0) > 0);
  const hasExcess = planItems.some(i => i.actualQuantity > i.targetQuantity);

  const availableRecords = (records ?? []).filter(r =>
    r.status !== 'completed' &&
    !planItems.some(item => item.recordId === r.id)
  );

  const availableRecordIds = availableRecords.map(r => r.id);
  const availableIdsKey = availableRecordIds.join(',');
  const availableSummariesQuery = useQuery<Record<string, WeeklyTargetSummary>>({
    queryKey: ['/api/records/weekly-target-summaries', availableIdsKey],
    queryFn: () =>
      availableIdsKey
        ? fetch(`/api/records/weekly-target-summaries?ids=${availableIdsKey}`, { credentials: 'include' }).then(r => r.json())
        : Promise.resolve({} as Record<string, WeeklyTargetSummary>),
    enabled: canEditPlan && availableRecordIds.length > 0,
  });
  const availableSummaries = availableSummariesQuery.data ?? {};

  const handleAddItem = () => {
    if (!planId || !addRecordId || !addTarget) return;
    addItemMutation.mutate({ planId, recordId: Number(addRecordId), targetQuantity: Number(addTarget) });
  };

  /* Build week options for dropdown — only current and next, no past */
  const weekOptions = [nextMonday, currentMonday];

  /* Past plans for the manager-only history section */
  const pastPlans = allPlans
    .filter(p => p.weekStart < currentMonday)
    .sort((a, b) => (a.weekStart > b.weekStart ? -1 : 1));

  /* Previous week for carry-forward button */
  const prevWeekStart = addDays(selectedWeek, -7);
  const prevPlanEntry = allPlans.find(p => p.weekStart === prevWeekStart);

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (recordsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <Skeleton className="h-[400px] rounded-3xl" />
        <Skeleton className="h-[300px] rounded-3xl" />
      </div>
    );
  }

  return (
    <>
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <span className="bg-primary/10 text-primary p-2 rounded-xl">
            <ListOrdered className="w-7 h-7" />
          </span>
          Sipariş Sırası
        </h1>
        <p className="text-muted-foreground mt-1">FIFO üretim sırası yönetimi ve haftalık üretim planı.</p>
      </div>

      {/* ── FIFO Table ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass-card border-none shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="font-display text-xl flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Önerilen Sipariş Üretim Sırası (FIFO)
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && fifoRows.some(r => (r as any).fifoOrder !== null) && (
                <Button variant="outline" size="sm" className="rounded-full text-xs h-7" onClick={resetFifoOrder} disabled={fifoSaving} data-testid="button-reset-fifo">
                  {fifoSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Sırayı Sıfırla
                </Button>
              )}
              <div className="flex items-center gap-2 text-xs font-medium bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" />
                Acil siparişler önceliklidir
              </div>
              {isAdmin && (
                <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-full">Sıra düzenle: sürükle veya ↑↓</span>
              )}
            </div>
          </CardHeader>

          {fifoRows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <ListOrdered className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Aktif sipariş bulunmuyor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                  <tr>
                    <th className="px-4 py-4 text-center w-10">#</th>
                    {isAdmin && <th className="px-2 py-4 w-8"></th>}
                    <th className="px-6 py-4">Lot</th>
                    <th className="px-6 py-4">Referans ID</th>
                    <th className="px-6 py-4">Sipariş Başlığı</th>
                    <th className="px-6 py-4">Müşteri</th>
                    <th className="px-6 py-4">Tarih</th>
                    <th className="px-6 py-4">Üretim</th>
                    <th className="px-6 py-4">Durum</th>
                    {isAdmin && <th className="px-4 py-4 text-center w-20">Sıra</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {fifoRows.map((r, idx) => (
                    <tr
                      key={r.id}
                      draggable={isAdmin}
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={e => handleDrop(e, idx)}
                      className={`transition-colors ${r.priority === 'acil' ? 'bg-destructive/5' : ''} ${r.status === 'waiting_product' ? 'row-pulse-purple' : ''} ${dragOverIdx === idx ? 'bg-primary/10 border-primary' : r.status !== 'waiting_product' ? 'hover:bg-muted/10' : ''} ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      data-testid={`row-fifo-${r.id}`}
                    >
                      <td className="px-4 py-4 text-center font-mono text-xs text-muted-foreground font-semibold">{idx + 1}</td>
                      {isAdmin && (
                        <td className="px-2 py-4">
                          <GripVertical className="w-4 h-4 text-muted-foreground/40" />
                        </td>
                      )}
                      <td className="px-6 py-4 font-mono text-muted-foreground">
                        {r.lotNumber || '-'}
                        {r.priority === 'acil' && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-destructive text-destructive-foreground">ACİL</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium">{r.referenceId || '-'}</td>
                      <td className="px-6 py-4 font-medium truncate max-w-[200px]">
                        <Link href={`/records/${r.id}`} className="hover:text-primary hover:underline transition-colors">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-6 py-4">{r.customer || '-'}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {r.orderDate ? format(new Date(r.orderDate), 'dd.MM.yyyy') : format(new Date(r.createdAt || Date.now()), 'dd.MM.yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        {editingTargetId === r.id ? (
                          <form
                            className="flex items-center gap-1"
                            onSubmit={e => {
                              e.preventDefault();
                              productionTargetMutation.mutate({ id: r.id, productionTarget: editingTargetValue === '' ? null : Number(editingTargetValue) });
                            }}
                          >
                            <Input
                              type="number"
                              min="0"
                              className="h-7 w-24 text-xs"
                              value={editingTargetValue}
                              onChange={e => setEditingTargetValue(e.target.value)}
                              autoFocus
                              data-testid={`input-target-${r.id}`}
                            />
                            <Button type="submit" size="icon" variant="ghost" className="h-6 w-6" disabled={productionTargetMutation.isPending}>
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingTargetId(null)}>
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="font-mono text-sm font-semibold">{totalsMap[r.id] ?? 0}</span>
                            <span className="text-muted-foreground text-xs">/</span>
                            <span className={`font-mono text-sm ${(r as any).productionTarget ? 'text-primary font-semibold' : 'text-muted-foreground/40'}`}>
                              {(r as any).productionTarget ?? '—'}
                            </span>
                            {isAdmin && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                onClick={() => { setEditingTargetId(r.id); setEditingTargetValue(String((r as any).productionTarget ?? '')); }}
                                title="Hedef güncelle"
                                data-testid={`btn-edit-target-${r.id}`}
                              >
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {canChangeStatus ? (
                          <Select
                            value={r.status}
                            disabled={updateRecord.isPending}
                            onValueChange={(newStatus) => {
                              if (newStatus === 'waiting_product') {
                                setWaitingNoteDialogId(r.id);
                                setWaitingNoteInput((r as any).waitingNote ?? '');
                              } else {
                                updateRecord.mutate({
                                  id: r.id,
                                  status: newStatus,
                                  waitingNote: null,
                                  clientUpdatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
                                } as any);
                              }
                            }}
                          >
                            <SelectTrigger
                              data-testid={`select-status-${r.id}`}
                              className={`h-8 w-[155px] rounded-full border text-xs font-semibold px-3 ${STATUS_BADGE_CLASSES[r.status] ?? ''}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Beklemede</SelectItem>
                              <SelectItem value="in_progress">Devam Ediyor</SelectItem>
                              <SelectItem value="completed">Tamamlandı</SelectItem>
                              <SelectItem value="waiting_product">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                                  Ürün Bekleniyor
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            data-testid={`badge-status-${r.id}`}
                            className={`rounded-full border text-xs font-semibold ${STATUS_BADGE_CLASSES[r.status] ?? ''}`}
                            variant="outline"
                          >
                            {STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5 items-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded"
                              disabled={idx === 0}
                              onClick={() => moveRow(idx, -1)}
                              data-testid={`btn-fifo-up-${r.id}`}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded"
                              disabled={idx === fifoRows.length - 1}
                              onClick={() => moveRow(idx, 1)}
                              data-testid={`btn-fifo-down-${r.id}`}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      {/* ── Weekly Production Plan ──────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass-card border-none shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle className="font-display text-xl flex items-center gap-2 flex-wrap">
              <CalendarDays className="w-5 h-5 text-primary" />
              Haftalık Üretim Planı
              {isPastWeek && (
                <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Geçmiş Hafta</span>
              )}
              {isFutureWeek && (
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Gelecek Hafta</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Week selector */}
              <Select value={selectedWeek} onValueChange={(w) => { setSelectedWeek(w); setAddRecordId(''); setAddTarget(''); setEditingItemId(null); setAddRecordOpen(false); }} data-testid="select-week">
                <SelectTrigger className="h-9 w-[280px] rounded-xl text-sm bg-card" data-testid="select-week-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(w => (
                    <SelectItem key={w} value={w}>
                      {weekLabel(w, currentMonday)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isManager && !isPastWeek && prevPlanEntry && planId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-purple-700 border-purple-200 hover:bg-purple-50 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-950/40"
                  onClick={() => carryForwardMutation.mutate({ toPlanId: planId, fromPlanId: prevPlanEntry.id })}
                  disabled={carryForwardMutation.isPending}
                  data-testid="button-carry-forward"
                >
                  {carryForwardMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    : <ArrowDownToLine className="w-4 h-4 mr-1" />}
                  Önceki Haftadan Devret
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950/30"
                onClick={() => exportWeeklyPlanExcel(planItems, selectedWeek)}
                disabled={planItems.length === 0}
                data-testid="button-export-weekly-plan"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Yazdır
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetchPlan()} data-testid="button-refresh-plan">
                <RefreshCw className="w-4 h-4 mr-1" />
                Yenile
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Add item form — managers only, not for past weeks */}
            {canEditPlan && (
              <div className="p-4 border-b border-border/40 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  {isFutureWeek ? 'Gelecek Haftaya Sipariş Ekle' : 'Bu Haftaya Sipariş Ekle'}
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Popover open={addRecordOpen} onOpenChange={setAddRecordOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={addRecordOpen}
                          className="h-9 w-full rounded-xl text-sm justify-between font-normal"
                          data-testid="select-plan-record"
                        >
                          <span className="truncate text-left">
                            {addRecordId
                              ? (() => {
                                  const r = availableRecords.find(r => String(r.id) === addRecordId);
                                  return r ? `${r.lotNumber ? `[${r.lotNumber}] ` : ''}${r.title}` : 'Sipariş seç...';
                                })()
                              : 'Sipariş seç...'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Sipariş ara (lot, başlık, müşteri)..." data-testid="input-plan-record-search" />
                          <CommandList className="max-h-[260px]">
                            <CommandEmpty>Sipariş bulunamadı.</CommandEmpty>
                            <CommandGroup>
                              {availableRecords.map(r => {
                                const summary = availableSummaries[String(r.id)];
                                const remaining = summary?.remaining;
                                const isFull = remaining === 0;
                                return (
                                  <CommandItem
                                    key={r.id}
                                    value={`${r.lotNumber || ''} ${r.title} ${r.customer || ''}`}
                                    disabled={isFull}
                                    onSelect={() => {
                                      if (isFull) return;
                                      setAddRecordId(String(r.id));
                                      setAddRecordOpen(false);
                                    }}
                                    className={`${r.priority === 'acil' ? 'text-destructive' : ''} ${isFull ? 'opacity-50' : ''}`}
                                    data-testid={`cmd-record-${r.id}`}
                                  >
                                    <div className="flex items-center gap-2 w-full min-w-0">
                                      {r.priority === 'acil' && (
                                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                      )}
                                      <span className="font-medium truncate flex-1">
                                        {r.lotNumber ? `[${r.lotNumber}] ` : ''}{r.title}
                                      </span>
                                      <span className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground pl-2">
                                        {r.customer && <span className="truncate max-w-[80px]">{r.customer}</span>}
                                        <span className="font-mono whitespace-nowrap">{r.totalQuantity.toLocaleString('tr-TR')}</span>
                                        {isFull ? (
                                          <Badge
                                            variant="outline"
                                            className="font-mono text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border-muted-foreground/20"
                                            data-testid={`badge-remaining-${r.id}`}
                                          >
                                            Dolu
                                          </Badge>
                                        ) : remaining != null ? (
                                          <Badge
                                            variant="outline"
                                            className="font-mono text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                                            data-testid={`badge-remaining-${r.id}`}
                                          >
                                            Kalan: {remaining.toLocaleString('tr-TR')} adet
                                          </Badge>
                                        ) : null}
                                      </span>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Hedef adet"
                      className={`h-9 rounded-xl text-sm ${addExceeds ? 'border-destructive focus-visible:ring-destructive text-destructive' : ''}`}
                      value={addTarget}
                      onChange={e => setAddTarget(e.target.value)}
                      data-testid="input-plan-target"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={handleAddItem}
                    disabled={!addRecordId || !addTarget || addItemMutation.isPending || !planId || addExceeds}
                    data-testid="button-add-plan-item"
                  >
                    {addItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                    Ekle
                  </Button>
                </div>
                {addRecordIdNum && addSummaryQuery.data && (
                  <p
                    className={`text-xs mt-2 font-medium ${addExceeds ? 'text-destructive' : 'text-muted-foreground'}`}
                    data-testid="text-add-remaining-capacity"
                  >
                    {addExceeds
                      ? `Kapasite aşıldı! Kalan: ${addSummaryQuery.data.remaining.toLocaleString('tr-TR')} adet (toplam ${addSummaryQuery.data.totalQuantity.toLocaleString('tr-TR')} adet, planlanan ${addSummaryQuery.data.plannedSum.toLocaleString('tr-TR')} adet).`
                      : `Kalan kapasite: ${addSummaryQuery.data.remaining.toLocaleString('tr-TR')} adet (toplam ${addSummaryQuery.data.totalQuantity.toLocaleString('tr-TR')} adet, planlanan ${addSummaryQuery.data.plannedSum.toLocaleString('tr-TR')} adet).`}
                  </p>
                )}
              </div>
            )}

            {planLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : weeklyPlan === null && isPastWeek ? (
              <div className="py-16 text-center text-muted-foreground">
                <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Bu hafta için üretim planı oluşturulmamış.</p>
                <p className="text-xs mt-1 opacity-60">{format(new Date(selectedWeek + 'T00:00:00'), 'dd.MM.yyyy')} – {format(new Date(weekEnd + 'T00:00:00'), 'dd.MM.yyyy')}</p>
              </div>
            ) : planItems.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">{isFutureWeek ? 'Gelecek hafta için henüz plan oluşturulmamış.' : 'Bu hafta için plan oluşturulmamış.'}</p>
                {canEditPlan && <p className="text-xs mt-1">Yukarıdan sipariş ekleyerek başlayın.</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                    <tr>
                      <th className="px-4 py-3">Sipariş</th>
                      <th className="px-4 py-3">Lot</th>
                      <th className="px-4 py-3">Müşteri</th>
                      <th className="px-4 py-3 text-center">Hedef</th>
                      {hasCarryOver && <th className="px-4 py-3 text-center">Devir</th>}
                      <th className="px-4 py-3 text-center">Gerçekleşen</th>
                      {hasExcess && <th className="px-4 py-3 text-center">Fazla Üretilen</th>}
                      <th className="px-4 py-3 text-center">Fark</th>
                      <th className="px-4 py-3">Diğer Fazlar</th>
                      <th className="px-4 py-3 text-right w-28"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {planItems.map(item => {
                      const carryOver = item.carryOver ?? 0;
                      const orderTotal = item.totalQuantity ?? 0;
                      const setToplamaDone = item.phaseTotals?.set_toplama ?? 0;
                      const phaseComplete = orderTotal > 0 && setToplamaDone >= orderTotal;
                      const rawCapped = Math.min(item.actualQuantity, item.targetQuantity);
                      const cappedActual = phaseComplete ? item.targetQuantity : rawCapped;
                      const excess = Math.max(0, item.actualQuantity - item.targetQuantity);
                      const pct = phaseComplete
                        ? 100
                        : item.targetQuantity > 0
                          ? Math.min(Math.round((rawCapped / item.targetQuantity) * 100), 100)
                          : 0;
                      const diff = phaseComplete ? 0 : rawCapped - item.targetQuantity;
                      const phaseCompleteTitle = phaseComplete
                        ? 'Set toplama fazı tamamlandı — yalnızca sevkiyat bekleniyor'
                        : undefined;
                      const isNew = item.createdAt ? (Date.now() - new Date(item.createdAt).getTime()) < 24 * 60 * 60 * 1000 : false;
                      const isAcil = item.priority === 'acil';
                      const isExpanded = expandedPlanItem === item.id;
                      const phaseBase = item.totalQuantity ?? item.targetQuantity;
                      const phases = item.phaseTotals ?? {};
                      const phaseExp = item.phaseExpected ?? {};
                      const OTHER_PHASES = [
                        { key: 'pastal', label: 'Pastal', bar: 'bg-sky-500' },
                        { key: 'urun_islem', label: 'Ürün İşl.', bar: 'bg-violet-500' },
                        { key: 'katlama', label: 'Katlama', bar: 'bg-amber-500' },
                        { key: 'kolileme', label: 'Kolileme', bar: 'bg-emerald-500' },
                      ];
                      const ALL_PHASES = [
                        { key: 'pastal', label: 'Pastal', bar: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50 dark:bg-sky-950/30' },
                        { key: 'urun_islem', label: 'Ürün İşlem', bar: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50 dark:bg-violet-950/30' },
                        { key: 'katlama', label: 'Katlama', bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50 dark:bg-amber-950/30' },
                        { key: 'set_toplama', label: 'Set Toplama', bar: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-950/30' },
                        { key: 'kolileme', label: 'Kolileme', bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                        { key: 'sevkiyat', label: 'Sevkiyat', bar: 'bg-green-600', text: 'text-green-700', bg: 'bg-green-50 dark:bg-green-950/30' },
                      ];
                      const totalCols = 9 + (hasCarryOver ? 1 : 0) + (hasExcess ? 1 : 0);
                      return (
                        <Fragment key={item.id}>
                        <tr className={`transition-colors ${isExpanded ? 'bg-primary/5' : 'hover:bg-muted/10'}`} data-testid={`row-plan-${item.id}`}>
                          <td className="px-4 py-3 font-medium max-w-[200px]">
                            <div className="flex flex-col gap-1 min-w-0">
                              <Link href={`/records/${item.recordId}`} className="hover:text-primary hover:underline transition-colors truncate block">
                                {item.title}
                              </Link>
                              {isAcil && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive">
                                    <AlertTriangle className="w-2.5 h-2.5" /> ACİL
                                  </span>
                                  {item.isCarried && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" data-testid={`badge-carried-${item.id}`}>
                                      <Repeat2 className="w-2.5 h-2.5" /> Devir
                                    </span>
                                  )}
                                </div>
                              )}
                              {!isAcil && item.isCarried && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 w-fit" data-testid={`badge-carried-${item.id}`}>
                                  <Repeat2 className="w-2.5 h-2.5" /> Devir
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{item.lotNumber || '-'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{item.customer || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            {canEditPlan && editingItemId === item.id ? (
                              <form
                                className="flex flex-col items-center gap-1"
                                onSubmit={e => {
                                  e.preventDefault();
                                  if (editExceeds) return;
                                  updateItemMutation.mutate({ itemId: item.id, targetQuantity: Number(editingItemTarget) });
                                }}
                              >
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    min="1"
                                    className={`h-7 w-20 text-xs text-center ${editExceeds ? 'border-destructive focus-visible:ring-destructive text-destructive' : ''}`}
                                    value={editingItemTarget}
                                    onChange={e => setEditingItemTarget(e.target.value)}
                                    autoFocus
                                    data-testid={`input-plan-target-${item.id}`}
                                  />
                                  <Button type="submit" size="icon" variant="ghost" className="h-6 w-6" disabled={updateItemMutation.isPending || editExceeds}>
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                  </Button>
                                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingItemId(null)}>
                                    <X className="w-3.5 h-3.5 text-destructive" />
                                  </Button>
                                </div>
                                {editSummaryQuery.data && (
                                  <span
                                    className={`text-[10px] font-medium whitespace-nowrap ${editExceeds ? 'text-destructive' : 'text-muted-foreground'}`}
                                    data-testid={`text-edit-remaining-${item.id}`}
                                  >
                                    {editExceeds
                                      ? `Aşıldı! Kalan: ${editSummaryQuery.data.remaining.toLocaleString('tr-TR')}`
                                      : `Kalan: ${editSummaryQuery.data.remaining.toLocaleString('tr-TR')} adet`}
                                  </span>
                                )}
                              </form>
                            ) : (
                              <div className="flex items-center gap-1 justify-center group">
                                <span className="font-mono font-semibold">{item.targetQuantity.toLocaleString('tr-TR')}</span>
                                {canEditPlan && (
                                  <button
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => { setEditingItemId(item.id); setEditingItemTarget(String(item.targetQuantity)); }}
                                    data-testid={`btn-edit-plan-${item.id}`}
                                  >
                                    <Pencil className="w-3 h-3 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          {hasCarryOver && (
                            <td className="px-4 py-3 text-center">
                              {carryOver > 0 ? (
                                <span className="inline-block font-mono font-semibold px-2 py-0.5 rounded-lg text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  +{carryOver.toLocaleString('tr-TR')}
                                </span>
                              ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block font-mono font-semibold px-2 py-0.5 rounded-lg text-xs ${
                                pct >= 100 ? 'bg-green-100 text-green-700' :
                                pct >= 50  ? 'bg-blue-100 text-blue-700' :
                                pct > 0    ? 'bg-amber-100 text-amber-700' :
                                'bg-muted text-muted-foreground'
                              }`}
                              title={phaseCompleteTitle}
                              data-testid={`text-plan-actual-${item.id}`}
                            >
                              {cappedActual.toLocaleString('tr-TR')}
                              <span className="font-normal ml-1 opacity-70">(%{pct})</span>
                            </span>
                          </td>
                          {hasExcess && (
                            <td className="px-4 py-3 text-center">
                              {excess > 0 ? (
                                <span className="inline-block font-mono font-semibold px-2 py-0.5 rounded-lg text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                  +{excess.toLocaleString('tr-TR')}
                                </span>
                              ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <span className={`font-mono text-sm font-semibold ${diff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                              {diff >= 0 ? '+' : ''}{diff.toLocaleString('tr-TR')}
                            </span>
                          </td>
                          {/* Diğer Fazlar — 4 mini bars */}
                          <td className="px-3 py-3">
                            <div className="flex gap-2.5 items-center min-w-[220px]">
                              {OTHER_PHASES.map(({ key, label, bar }) => {
                                const done = phases[key] ?? 0;
                                const base = phaseExp[key] ?? phaseBase;
                                const p = base > 0 ? Math.min(100, Math.round((done / base) * 100)) : 100;
                                return (
                                  <div key={key} className="flex flex-col gap-0.5 flex-1 min-w-0">
                                    <span className="text-[9px] font-medium text-muted-foreground truncate">{label}</span>
                                    <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${p}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono text-muted-foreground">{p}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          {/* Actions + expand */}
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isNew && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" data-testid={`badge-new-${item.id}`}>
                                  <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" /> Yeni
                                </span>
                              )}
                              {canEditPlan && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                  disabled={deleteItemMutation.isPending}
                                  data-testid={`btn-delete-plan-${item.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 rounded-lg transition-colors ${isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setExpandedPlanItem(isExpanded ? null : item.id)}
                                data-testid={`btn-expand-plan-${item.id}`}
                              >
                                {isExpanded
                                  ? <ChevronUp className="w-3.5 h-3.5" />
                                  : <ChevronDown className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr className="bg-primary/3">
                            <td colSpan={totalCols} className="px-6 py-4">
                              <div className="flex flex-col gap-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                  <ChevronsRight className="w-3.5 h-3.5" />
                                  Tüm Fazlar — {item.title}
                                  {item.totalQuantity ? (
                                    <span className="ml-2 font-mono font-normal normal-case">Toplam: {item.totalQuantity.toLocaleString('tr-TR')} adet</span>
                                  ) : null}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                  {ALL_PHASES.map(({ key, label, bar, text, bg }) => {
                                    const done = phases[key] ?? 0;
                                    const base = phaseExp[key] ?? phaseBase;
                                    const p = base > 0 ? Math.min(100, Math.round((done / base) * 100)) : 100;
                                    return (
                                      <div key={key} className={`rounded-xl px-3 py-2.5 ${bg} flex flex-col gap-1.5`}>
                                        <div className="flex items-center justify-between">
                                          <span className={`text-xs font-semibold ${text}`}>{label}</span>
                                          <span className={`text-xs font-mono font-bold ${text}`}>{p}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-white/60 dark:bg-black/20 overflow-hidden">
                                          <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${p}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground">
                                          {done.toLocaleString('tr-TR')} {base > 0 ? `/ ${base.toLocaleString('tr-TR')}` : ''} adet
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Geçmiş Haftalık Planlar — manager only ───────────────────────── */}
      {isManager && pastPlans.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="glass-card border-none shadow-lg overflow-hidden">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center gap-2">
              <History className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="font-display text-xl text-muted-foreground">Geçmiş Haftalık Planlar</CardTitle>
              <span className="ml-auto text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-mono">{pastPlans.length} hafta</span>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {pastPlans.map(plan => {
                const isExpanded = expandedPastWeek === plan.weekStart;
                const end = addDays(plan.weekStart, 6);
                const fmt = (s: string) => format(new Date(s + 'T00:00:00'), 'dd.MM.yyyy');
                const expandedItems = isExpanded ? sortPlanItemsAcilFirst(expandedPastPlanData?.items ?? []) : [];
                const hasCarryOverPast = expandedItems.some(i => (i.carryOver ?? 0) > 0);
                const hasExcessPast = expandedItems.some(i => i.actualQuantity > i.targetQuantity);

                return (
                  <div key={plan.weekStart} data-testid={`past-plan-${plan.weekStart}`}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <button
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => setExpandedPastWeek(isExpanded ? null : plan.weekStart)}
                        data-testid={`btn-expand-past-${plan.weekStart}`}
                      >
                        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <span className="font-semibold text-sm">{fmt(plan.weekStart)} – {fmt(end)}</span>
                        <span className="text-xs text-muted-foreground ml-1">({plan.itemCount} sipariş)</span>
                      </button>
                      {isManager && planId && !isPastWeek && (
                        <button
                          className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 font-medium px-2 py-1 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors shrink-0"
                          onClick={() => carryForwardMutation.mutate({ toPlanId: planId!, fromPlanId: plan.id })}
                          disabled={carryForwardMutation.isPending}
                          data-testid={`btn-carry-from-past-${plan.weekStart}`}
                        >
                          <ChevronsRight className="w-3.5 h-3.5" />
                          Bu haftaya devret
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="bg-muted/10 border-t border-border/30">
                        {expandedLoading ? (
                          <div className="p-4 space-y-2">
                            {[1, 2].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
                          </div>
                        ) : expandedItems.length === 0 ? (
                          <div className="py-8 text-center text-muted-foreground text-sm">
                            <Target className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            Bu haftaya ait plan kaydı bulunamadı.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                                <tr>
                                  <th className="px-4 py-2.5">Sipariş</th>
                                  <th className="px-4 py-2.5">Lot</th>
                                  <th className="px-4 py-2.5">Müşteri</th>
                                  <th className="px-4 py-2.5 text-center">Hedef</th>
                                  {hasCarryOverPast && <th className="px-4 py-2.5 text-center">Devir</th>}
                                  <th className="px-4 py-2.5 text-center">Gerçekleşen</th>
                                  {hasExcessPast && <th className="px-4 py-2.5 text-center">Fazla</th>}
                                  <th className="px-4 py-2.5 text-center">Fark</th>
                                  <th className="px-4 py-2.5 text-center">Durum</th>
                                  {isManager && planId && !isPastWeek && <th className="px-4 py-2.5 text-center">Ekle</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/30">
                                {expandedItems.map(item => {
                                  const carryOver = item.carryOver ?? 0;
                                  const cappedActual = Math.min(item.actualQuantity, item.targetQuantity);
                                  const excess = Math.max(0, item.actualQuantity - item.targetQuantity);
                                  const pct = item.targetQuantity > 0 ? Math.min(Math.round((cappedActual / item.targetQuantity) * 100), 100) : 0;
                                  const diff = cappedActual - item.targetQuantity;
                                  const isComplete = pct >= 100;
                                  const remaining = Math.max(0, item.targetQuantity - item.actualQuantity);
                                  const isAlreadyInPlan = planItems.some(p => p.recordId === item.recordId);
                                  return (
                                    <tr key={item.id} className={`hover:bg-muted/10 transition-colors ${isComplete ? '' : 'bg-amber-50/30 dark:bg-amber-950/10'}`}>
                                      <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">
                                        <Link href={`/records/${item.recordId}`} className="hover:text-primary hover:underline transition-colors">
                                          {item.title}
                                        </Link>
                                      </td>
                                      <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs">{item.lotNumber || '-'}</td>
                                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{item.customer || '-'}</td>
                                      <td className="px-4 py-2.5 text-center font-mono font-semibold text-sm">{item.targetQuantity.toLocaleString('tr-TR')}</td>
                                      {hasCarryOverPast && (
                                        <td className="px-4 py-2.5 text-center">
                                          {carryOver > 0 ? (
                                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">+{carryOver.toLocaleString('tr-TR')}</span>
                                          ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                                        </td>
                                      )}
                                      <td className="px-4 py-2.5 text-center">
                                        <span className={`inline-block font-mono font-semibold px-2 py-0.5 rounded-lg text-xs ${
                                          pct >= 100 ? 'bg-green-100 text-green-700' :
                                          pct >= 50  ? 'bg-blue-100 text-blue-700' :
                                          pct > 0    ? 'bg-amber-100 text-amber-700' :
                                          'bg-muted text-muted-foreground'
                                        }`}>
                                          {cappedActual.toLocaleString('tr-TR')} <span className="font-normal opacity-70">(%{pct})</span>
                                        </span>
                                      </td>
                                      {hasExcessPast && (
                                        <td className="px-4 py-2.5 text-center">
                                          {excess > 0 ? (
                                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">+{excess.toLocaleString('tr-TR')}</span>
                                          ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                                        </td>
                                      )}
                                      <td className="px-4 py-2.5 text-center">
                                        <span className={`font-mono text-sm font-semibold ${diff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                          {diff >= 0 ? '+' : ''}{diff.toLocaleString('tr-TR')}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        {isComplete ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded-full">
                                            <Check className="w-3 h-3" /> Tamamlandı
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                            <X className="w-3 h-3" /> Eksik
                                          </span>
                                        )}
                                      </td>
                                      {isManager && planId && !isPastWeek && (
                                        <td className="px-4 py-2.5 text-center">
                                          {isAlreadyInPlan ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded-full" data-testid={`badge-already-added-${item.id}`}>
                                              <Check className="w-3 h-3" /> Eklendi
                                            </span>
                                          ) : (
                                            <button
                                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                                              disabled={addItemMutation.isPending || remaining <= 0}
                                              onClick={() => planId && addItemMutation.mutate({ planId, recordId: item.recordId, targetQuantity: remaining || item.targetQuantity })}
                                              data-testid={`btn-add-past-item-${item.id}`}
                                            >
                                              <Plus className="w-3 h-3" /> {remaining > 0 ? `${remaining.toLocaleString('tr-TR')} ekle` : 'Tamamlandı'}
                                            </button>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>

    {/* Waiting Product Note Dialog */}
    <Dialog open={waitingNoteDialogId !== null} onOpenChange={(open) => { if (!open) setWaitingNoteDialogId(null); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700">
            <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />
            Ürün Bekleniyor — Not Ekle
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Bu siparişi <strong className="text-purple-700">"Ürün Bekleniyor"</strong> olarak işaretlemek için lütfen beklenen ürün veya eksikliği açıklayın.
          </p>
          <Textarea
            autoFocus
            placeholder="Hangi ürün bekleniyor? Eksik olan nedir? Açıklayın..."
            className="min-h-[110px] rounded-xl border-purple-300 focus-visible:ring-purple-400 bg-purple-50/50 dark:bg-purple-900/10"
            value={waitingNoteInput}
            onChange={e => setWaitingNoteInput(e.target.value)}
            data-testid="textarea-waiting-note-dialog"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setWaitingNoteDialogId(null)}>
            İptal
          </Button>
          <Button
            disabled={!waitingNoteInput.trim() || updateRecord.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => {
              if (!waitingNoteDialogId || !waitingNoteInput.trim()) return;
              const rec = displayRecords.find(r => r.id === waitingNoteDialogId);
              updateRecord.mutate({
                id: waitingNoteDialogId,
                status: 'waiting_product',
                waitingNote: waitingNoteInput.trim(),
                clientUpdatedAt: rec?.updatedAt ? new Date(rec.updatedAt).toISOString() : undefined,
              } as any);
              setWaitingNoteDialogId(null);
              setWaitingNoteInput('');
            }}
            data-testid="button-confirm-waiting-note"
          >
            {updateRecord.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
