import { useState, Fragment } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useRecords, useUpdateRecord } from '@/hooks/use-records';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Box, CheckCircle2, PlayCircle, TrendingUp, CalendarDays, Target, ArrowRight, ListOrdered, AlertTriangle, Repeat2, Scissors, Wrench, Layers, Package, Archive, Truck, Clock, Activity, ChevronDown, ChevronUp, ChevronsRight, FileSpreadsheet, CalendarOff, Warehouse } from 'lucide-react';
import ExcelJS from 'exceljs';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

/* ─── types ──────────────────────────────────────────────────────────────── */

type ChartPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
};

interface WeeklyPlanItem {
  id: number;
  recordId: number;
  targetQuantity: number;
  title: string;
  lotNumber: string | null;
  customer: string | null;
  totalQuantity?: number | null;
  actualQuantity: number;
  cumulativeActualQuantity?: number;
  carryOver: number;
  carriedActualQuantity?: number;
  isCarried?: boolean;
  phaseTotals?: Record<string, number>;
  phaseExpected?: Record<string, number>;
}

interface WeeklyPlanData {
  plan: { id: number; weekStart: string; createdBy: number; createdAt: string };
  items: WeeklyPlanItem[];
}

/* ─── status helpers ─────────────────────────────────────────────────────── */

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

/* ─── helpers ────────────────────────────────────────────────────────────── */

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function buildBarData(records: any[], period: ChartPeriod) {
  const now = new Date();
  if (period === 'daily') {
    return Array.from({ length: 24 }).map((_, i) => {
      const h = (now.getHours() - 23 + i + 24) % 24;
      const label = `${String(h).padStart(2, '0')}:00`;
      const count = records.filter(r => {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt);
        const diff = (now.getTime() - d.getTime()) / 3600000;
        return diff <= 24 && d.getHours() === h;
      }).length;
      return { date: label, count };
    });
  }
  if (period === 'weekly') {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 6 + i);
      const dateStr = d.toISOString().split('T')[0];
      const count = records.filter(r => r.createdAt && new Date(r.createdAt).toISOString().split('T')[0] === dateStr).length;
      return { date: d.toLocaleDateString('tr-TR', { weekday: 'short' }), count };
    });
  }
  if (period === 'monthly') {
    return Array.from({ length: 30 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 29 + i);
      const dateStr = d.toISOString().split('T')[0];
      const count = records.filter(r => r.createdAt && new Date(r.createdAt).toISOString().split('T')[0] === dateStr).length;
      return { date: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), count };
    });
  }
  const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11 + i);
    const y = d.getFullYear(); const m = d.getMonth();
    const count = records.filter(r => {
      if (!r.createdAt) return false;
      const rd = new Date(r.createdAt);
      return rd.getFullYear() === y && rd.getMonth() === m;
    }).length;
    return { date: MONTHS_TR[m], count };
  });
}

function periodStart(period: ChartPeriod): Date {
  const d = new Date();
  if (period === 'daily') d.setHours(d.getHours() - 24);
  else if (period === 'weekly') d.setDate(d.getDate() - 7);
  else if (period === 'monthly') d.setDate(d.getDate() - 30);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

/* ─── WeeklyActiveCard ───────────────────────────────────────────────────── */

type WeeklyActiveRow = {
  recordId: number;
  title: string;
  lotNumber: string | null;
  customer: string | null;
  status: string;
  priority: string | null;
  orderType: string | null;
  itemsPerBox: number | null;
  updatedAt: string | null;
  phaseTotals: Record<string, number>;
};

const ACTIVE_PHASES = [
  { key: 'pastal',      label: 'Pastal',    color: 'text-sky-600',    bg: 'bg-sky-100 dark:bg-sky-900/30',    unit: 'adet' },
  { key: 'urun_islem',  label: 'Ürün İşl.', color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30', unit: 'adet' },
  { key: 'katlama',     label: 'Katlama',   color: 'text-amber-600',  bg: 'bg-amber-100 dark:bg-amber-900/30',  unit: 'adet' },
  { key: 'set_toplama', label: 'Set Top.',  color: 'text-teal-600',   bg: 'bg-teal-100 dark:bg-teal-900/30',    unit: 'adet' },
  { key: 'kolileme',    label: 'Kolileme',  color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30', unit: 'koli' },
  { key: 'sevkiyat',    label: 'Sevkiyat',  color: 'text-green-600',  bg: 'bg-green-100 dark:bg-green-900/30',   unit: 'koli' },
] as const;

async function exportWeeklyActiveExcel(
  rows: WeeklyActiveRow[],
  visiblePhases: typeof ACTIVE_PHASES[number][],
  weekStart: string,
  weekEnd: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bu Haftaki Üretim Hareketleri');

  const statusLabel: Record<string, string> = {
    pending: 'Beklemede',
    in_progress: 'Devam Ediyor',
    completed: 'Tamamlandı',
    waiting_product: 'Ürün Bekleniyor',
  };

  const baseCols: ExcelJS.Column[] = [
    { header: 'Sipariş Adı', key: 'title', width: 36 } as ExcelJS.Column,
    { header: 'Lot No', key: 'lot', width: 14 } as ExcelJS.Column,
    { header: 'Müşteri', key: 'customer', width: 22 } as ExcelJS.Column,
  ];
  const phaseCols: ExcelJS.Column[] = visiblePhases.map(p => ({
    header: `${p.label} (${p.unit})`,
    key: p.key,
    width: 14,
  } as ExcelJS.Column));
  const statusCol: ExcelJS.Column[] = [{ header: 'Durum', key: 'status', width: 18 } as ExcelJS.Column];

  ws.columns = [...baseCols, ...phaseCols, ...statusCol];

  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E9FF' } };
  });
  headerRow.height = 22;

  rows.forEach(row => {
    const rowData: Record<string, string | number> = {
      title: row.title,
      lot: row.lotNumber ?? '',
      customer: row.customer ?? '',
      status: statusLabel[row.status ?? 'pending'] ?? row.status ?? '',
    };
    visiblePhases.forEach(p => {
      rowData[p.key] = row.phaseTotals[p.key] ?? 0;
    });
    const exRow = ws.addRow(rowData);
    exRow.eachCell(cell => {
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
  a.download = `uretim_hareketleri_${weekStart}_${weekEnd}_${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function WeeklyActiveCard() {
  const { user } = useAuth();
  const { data: allRecords = [] } = useRecords();
  const updateRecord = useUpdateRecord();
  const canChangeStatus = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';
  const [isExporting, setIsExporting] = useState(false);
  const recordMetaMap = Object.fromEntries(allRecords.map(r => [r.id, { status: r.status, updatedAt: r.updatedAt, priority: r.priority }]));

  const weekStart = getMondayOfCurrentWeek();
  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rows = [], isLoading } = useQuery<WeeklyActiveRow[]>({
    queryKey: ['/api/dashboard/weekly-active'],
    refetchInterval: 30000,
  });

  const { data: weeklyPlanForBadge } = useQuery<WeeklyPlanData>({
    queryKey: ['/api/weekly-plans/by-week', weekStart],
    queryFn: () => fetch(`/api/weekly-plans/by-week?weekStart=${weekStart}`).then(r => r.json()),
  });
  const planInIds = new Set((weeklyPlanForBadge?.items ?? []).map((it: WeeklyPlanItem) => it.recordId));

  // Only show phases that have at least one record with data
  const visiblePhases = ACTIVE_PHASES.filter(p =>
    rows.some(r => (r.phaseTotals[p.key] ?? 0) > 0)
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <Card className="glass-card border-none shadow-lg overflow-hidden">
        <CardHeader className="bg-violet-500/5 border-b flex flex-row items-center justify-between flex-wrap gap-2 px-4 py-3">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-500" />
            Bu Haftaki Üretim Hareketleri
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">
              {format(new Date(weekStart + 'T00:00:00'), 'dd.MM.yyyy')} – {format(new Date(weekEnd + 'T00:00:00'), 'dd.MM.yyyy')}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {rows.length} sipariş aktif
              </span>
            )}
            {rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 h-7 text-xs"
                disabled={isExporting}
                data-testid="button-export-weekly-active"
                onClick={async () => {
                  setIsExporting(true);
                  try { await exportWeeklyActiveExcel(rows, visiblePhases, weekStart, weekEnd); }
                  finally { setIsExporting(false); }
                }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Yazdır
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Bu hafta henüz üretim kaydı girilmemiş.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-muted-foreground uppercase bg-muted/30">
                  <tr>
                    <th className="px-3 py-2">Sipariş</th>
                    <th className="px-2 py-2">Lot</th>
                    {visiblePhases.map(p => (
                      <th key={p.key} className="px-2 py-2 text-right">{p.label}</th>
                    ))}
                    <th className="px-2 py-2">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map(row => {
                    const meta = recordMetaMap[row.recordId];
                    const currentStatus = meta?.status ?? row.status ?? 'pending';
                    const isAcil = (meta?.priority ?? row.priority) === 'acil';
                    const updAt = meta?.updatedAt ?? row.updatedAt;
                    return (
                      <tr key={row.recordId}
                        className={`transition-colors ${isAcil ? 'bg-destructive/5 hover:bg-destructive/10' : currentStatus === 'waiting_product' ? 'row-pulse-purple' : 'hover:bg-muted/10'}`}
                        data-testid={`row-wactive-${row.recordId}`}
                      >
                        <td className="px-3 py-2 min-w-[160px]">
                          <div className="flex flex-col gap-0.5">
                            <Link href={`/records/${row.recordId}`} className="hover:text-primary hover:underline transition-colors text-xs font-medium whitespace-nowrap">
                              {row.title}
                            </Link>
                            {row.customer && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{row.customer}</span>
                            )}
                            {isAcil && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-destructive text-destructive-foreground w-fit">
                                <AlertTriangle className="w-2 h-2" /> Yüksek Öncelikli
                              </span>
                            )}
                            {row.orderType === 'stok' && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-emerald-600 text-white w-fit" data-testid={`badge-stok-weekly-${row.recordId}`}>
                                <Warehouse className="w-2 h-2" /> STOK
                              </span>
                            )}
                            {!planInIds.has(row.recordId) && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-orange-500 text-white w-fit" data-testid={`badge-plan-disi-weekly-${row.recordId}`}>
                                <CalendarOff className="w-2 h-2" /> Plan Harici Üretim
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{row.lotNumber || '—'}</td>
                        {visiblePhases.map(p => {
                          const qty = row.phaseTotals[p.key] ?? 0;
                          return (
                            <td key={p.key} className="px-2 py-2 text-right">
                              {qty > 0 ? (
                                <span className={`inline-block font-mono font-semibold px-1.5 py-0 rounded text-[11px] whitespace-nowrap ${p.bg} ${p.color}`}>
                                  {qty.toLocaleString('tr-TR')}
                                  <span className="text-[9px] ml-0.5 opacity-70">{p.unit}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground/30 font-mono text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2">
                          {canChangeStatus ? (
                            <Select
                              value={currentStatus}
                              disabled={updateRecord.isPending}
                              onValueChange={(newStatus) => {
                                updateRecord.mutate({
                                  id: row.recordId,
                                  status: newStatus,
                                  clientUpdatedAt: updAt ? new Date(updAt).toISOString() : undefined,
                                });
                              }}
                            >
                              <SelectTrigger
                                data-testid={`select-wactive-status-${row.recordId}`}
                                className={`h-6 w-[118px] rounded-full border text-[11px] font-semibold px-2 ${STATUS_BADGE_CLASSES[currentStatus] ?? ''}`}
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
                              data-testid={`badge-wactive-status-${row.recordId}`}
                              className={`rounded-full border text-[11px] font-semibold px-2 py-0 ${STATUS_BADGE_CLASSES[currentStatus] ?? ''}`}
                              variant="outline"
                            >
                              {STATUS_LABELS[currentStatus] ?? currentStatus}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── WeeklyPlanCard ─────────────────────────────────────────────────────── */

function WeeklyPlanCard() {
  const { user } = useAuth();
  const { data: allRecords = [] } = useRecords();
  const updateRecord = useUpdateRecord();
  const canChangeStatus = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const recordMetaMap = Object.fromEntries(allRecords.map(r => [r.id, { status: r.status, updatedAt: r.updatedAt, priority: r.priority }]));

  const { data: weeklyPlan, isLoading } = useQuery<WeeklyPlanData>({
    queryKey: ['/api/weekly-plans/current'],
    refetchInterval: 60000,
  });

  const weekStart = getMondayOfCurrentWeek();
  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();

  const items = weeklyPlan?.items ?? [];
  const isPhaseComplete = (i: WeeklyPlanItem): boolean => {
    const orderTotal = i.totalQuantity ?? 0;
    const setToplamaDone = i.phaseTotals?.set_toplama ?? 0;
    return orderTotal > 0 && setToplamaDone >= orderTotal;
  };
  const totalTarget = items.reduce((s, i) => s + i.targetQuantity, 0);
  const totalActual = items.reduce(
    (s, i) =>
      s + (isPhaseComplete(i)
        ? i.targetQuantity
        : Math.min(i.actualQuantity ?? 0, i.targetQuantity)),
    0,
  );
  const overallPct = totalTarget > 0 ? Math.min(Math.round((totalActual / totalTarget) * 100), 100) : 0;
  const completedOrdersCount = items.filter(i =>
    isPhaseComplete(i) || (i.targetQuantity > 0 && (i.actualQuantity ?? 0) >= i.targetQuantity)
  ).length;
  const totalOrdersCount = items.length;
  const producedThisWeek = items.reduce(
    (s, i) => s + Math.max(0, (i.actualQuantity ?? 0) - (i.carriedActualQuantity ?? 0)),
    0,
  );
  const hasCarryOver = true;
  const hasCarriedActual = items.some(i => (i.carriedActualQuantity ?? 0) > 0);
  const hasExcess = items.some(i => i.actualQuantity > i.targetQuantity);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <Card className="glass-card border-none shadow-lg overflow-hidden">
        <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between flex-wrap gap-2 px-4 py-3">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            Haftalık Üretim Planı
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">
              {format(new Date(weekStart + 'T00:00:00'), 'dd.MM.yyyy')} – {format(new Date(weekEnd + 'T00:00:00'), 'dd.MM.yyyy')}
            </span>
          </CardTitle>
          <Link href="/siparis-sirasi">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-7 text-xs" data-testid="link-siparis-sirasi">
              <ListOrdered className="w-3.5 h-3.5" />
              Sıra Yönetimi
              <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Bu hafta için henüz plan oluşturulmamış.</p>
              <Link href="/siparis-sirasi">
                <Button variant="outline" size="sm" className="mt-4 rounded-xl">Sipariş Sırası sayfasından ekle</Button>
              </Link>
            </div>
          ) : (
            <>
              {/* Overall progress */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-1.5 text-xs gap-3">
                  <span className="font-semibold text-muted-foreground">Bu hafta toplam ilerleme</span>
                  <span className={`font-bold text-sm ${overallPct >= 100 ? 'text-green-600' : overallPct >= 50 ? 'text-primary' : 'text-amber-500'}`} data-testid="text-overall-progress">
                    {totalActual.toLocaleString('tr-TR')} / {totalTarget.toLocaleString('tr-TR')} adet — %{overallPct}
                  </span>
                </div>
                <div className="flex justify-end -mt-1 mb-1.5">
                  <span
                    className="text-[10px] text-muted-foreground/80"
                    data-testid="text-weekly-summary"
                  >
                    {completedOrdersCount} / {totalOrdersCount} sipariş tamamlandı · bu hafta {producedThisWeek.toLocaleString('tr-TR')} adet üretildi
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${overallPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full ${overallPct >= 100 ? 'bg-green-500' : overallPct >= 50 ? 'bg-primary' : 'bg-amber-400'}`}
                    data-testid="bar-overall-weekly"
                  />
                </div>
              </div>

              {/* Items table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] text-muted-foreground uppercase bg-muted/30">
                    <tr>
                      <th className="px-3 py-2">Sipariş</th>
                      <th className="px-2 py-2">Lot</th>
                      <th className="px-2 py-2">Müşteri</th>
                      <th className="px-2 py-2 text-right">Hedef</th>
                      {hasCarriedActual && <th className="px-2 py-2 text-right" title="Geçmiş haftalarda tamamlanmış set toplama miktarı">Devir Ger.</th>}
                      {hasCarryOver && <th className="px-2 py-2 text-right">Devir</th>}
                      <th className="px-2 py-2 text-right">Gerçek.</th>
                      {hasExcess && <th className="px-2 py-2 text-right">Fazla</th>}
                      <th className="px-2 py-2 w-28">İlerleme</th>
                      <th className="px-2 py-2 text-right">Fark</th>
                      <th className="px-2 py-2">Diğer Fazlar</th>
                      <th className="px-2 py-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {items.map(item => {
                      const carryOver = item.carryOver ?? 0;
                      const carriedActual = item.carriedActualQuantity ?? 0;
                      const phaseComplete = isPhaseComplete(item);
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
                      const rec = recordMetaMap[item.recordId];
                      const currentStatus = rec?.status ?? 'pending';
                      const isAcil = rec?.priority === 'acil';
                      const isExpanded = expandedItemId === item.id;
                      const phaseBase = item.totalQuantity ?? item.targetQuantity;
                      const phases = item.phaseTotals ?? {};
                      const phaseExp = item.phaseExpected ?? {};
                      const totalCols = 11 + (hasCarryOver ? 1 : 0) + (hasCarriedActual ? 1 : 0) + (hasExcess ? 1 : 0);
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
                      return (
                        <Fragment key={item.id}>
                        <tr className={`transition-colors ${isExpanded ? 'bg-primary/5' : ''} ${isAcil ? 'bg-destructive/5 hover:bg-destructive/10' : !isExpanded ? (currentStatus === 'waiting_product' ? 'row-pulse-purple' : 'hover:bg-muted/10') : ''}`} data-testid={`row-weekly-${item.id}`}>
                          <td className="px-3 py-2 font-medium max-w-[160px]">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <Link href={`/records/${item.recordId}`} className="hover:text-primary hover:underline transition-colors truncate text-xs">
                                {item.title}
                              </Link>
                              {(isAcil || item.isCarried) && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {isAcil && (
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-destructive text-destructive-foreground shrink-0">
                                      <AlertTriangle className="w-2 h-2" /> Yüksek Öncelikli
                                    </span>
                                  )}
                                  {item.isCarried && (
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" data-testid={`badge-carried-dash-${item.id}`}>
                                      <Repeat2 className="w-2 h-2" /> Devir
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.lotNumber || '—'}</td>
                          <td className="px-2 py-2 text-xs text-muted-foreground max-w-[80px] truncate">{item.customer || '—'}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap">{item.targetQuantity.toLocaleString('tr-TR')}</td>
                          {hasCarriedActual && (
                            <td className="px-2 py-2 text-right" data-testid={`text-carried-actual-${item.id}`}>
                              {carriedActual > 0 ? (
                                <span
                                  className="inline-flex items-center gap-0.5 font-mono font-semibold px-1.5 py-0 rounded text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 whitespace-nowrap"
                                  title="Geçmiş haftalarda tamamlanmış set toplama miktarı"
                                >
                                  <Repeat2 className="w-2.5 h-2.5" />
                                  {carriedActual.toLocaleString('tr-TR')}
                                </span>
                              ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                            </td>
                          )}
                          {hasCarryOver && (
                            <td className="px-2 py-2 text-right">
                              {carryOver > 0 ? (
                                <span className="inline-block font-mono font-semibold px-1.5 py-0 rounded text-[11px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 whitespace-nowrap" title="Geçmiş haftaların hedefini aşan fazla üretim">
                                  +{carryOver.toLocaleString('tr-TR')}
                                </span>
                              ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                            </td>
                          )}
                          <td className="px-2 py-2 text-right">
                            <span
                              className={`inline-block font-mono font-semibold px-1.5 py-0 rounded text-[11px] whitespace-nowrap ${
                                pct >= 100 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                pct >= 50  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                pct > 0    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                'bg-muted text-muted-foreground'
                              }`}
                              title={phaseCompleteTitle}
                              data-testid={`text-weekly-actual-${item.id}`}
                            >
                              {cappedActual.toLocaleString('tr-TR')}
                            </span>
                          </td>
                          {hasExcess && (
                            <td className="px-2 py-2 text-right">
                              {excess > 0 ? (
                                <span className="inline-block font-mono font-semibold px-1.5 py-0 rounded text-[11px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 whitespace-nowrap">
                                  +{excess.toLocaleString('tr-TR')}
                                </span>
                              ) : <span className="text-muted-foreground/40 font-mono text-xs">—</span>}
                            </td>
                          )}
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5 min-w-[80px]">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                  className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-primary' : pct > 0 ? 'bg-amber-400' : 'bg-muted-foreground/20'}`}
                                />
                              </div>
                              <span className="text-[11px] font-semibold w-7 text-right text-muted-foreground shrink-0">%{pct}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className={`font-mono text-xs font-semibold whitespace-nowrap ${diff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                              {diff >= 0 ? '+' : ''}{diff.toLocaleString('tr-TR')}
                            </span>
                          </td>
                          {/* Diğer Fazlar — 4 mini bars */}
                          <td className="px-2 py-2">
                            <div className="flex gap-1.5 items-center min-w-[160px]">
                              {OTHER_PHASES.map(({ key, label, bar }) => {
                                const done = phases[key] ?? 0;
                                const base = phaseExp[key] ?? phaseBase;
                                const p = base > 0 ? Math.min(100, Math.round((done / base) * 100)) : 100;
                                return (
                                  <div key={key} className="flex flex-col gap-0.5 flex-1 min-w-0">
                                    <span className="text-[9px] font-medium text-muted-foreground truncate">{label}</span>
                                    <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${p}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono text-muted-foreground">{p}%</span>
                                  </div>
                                );
                              })}
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-5 w-5 shrink-0 rounded-lg transition-colors ${isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                data-testid={`btn-expand-dash-${item.id}`}
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            {canChangeStatus ? (
                              <Select
                                value={currentStatus}
                                disabled={updateRecord.isPending}
                                onValueChange={(newStatus) => {
                                  updateRecord.mutate({
                                    id: item.recordId,
                                    status: newStatus,
                                    clientUpdatedAt: rec?.updatedAt ? new Date(rec.updatedAt).toISOString() : undefined,
                                  });
                                }}
                              >
                                <SelectTrigger
                                  data-testid={`select-weekly-status-${item.recordId}`}
                                  className={`h-6 w-[118px] rounded-full border text-[11px] font-semibold px-2 ${STATUS_BADGE_CLASSES[currentStatus] ?? ''}`}
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
                                data-testid={`badge-weekly-status-${item.recordId}`}
                                className={`rounded-full border text-[11px] font-semibold px-2 py-0 ${STATUS_BADGE_CLASSES[currentStatus] ?? ''}`}
                                variant="outline"
                              >
                                {STATUS_LABELS[currentStatus] ?? currentStatus}
                              </Badge>
                            )}
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
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Recent Phase Activity ───────────────────────────────────────────────── */

type PhaseLog = {
  id: number;
  recordId: number;
  title: string;
  lotNumber: string | null;
  quantity: number;
  userName: string;
  completedAt: string;
  notes: string | null;
  hasPhoto: boolean;
  photoTable: string | null;
  photoId: number | null;
  photoField: string | null;
  itemName: string | null;
};

const PHASE_CONFIG: { key: string; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: 'pastal',      label: 'Pastal',      icon: Scissors, color: 'text-sky-600 dark:text-sky-400',    bg: 'bg-sky-100 dark:bg-sky-900/30' },
  { key: 'urun_islem',  label: 'Ürün İşlem',  icon: Wrench,   color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
  { key: 'katlama',     label: 'Katlama',     icon: Layers,   color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-100 dark:bg-amber-900/30' },
  { key: 'set_toplama', label: 'Set Toplama', icon: Package,  color: 'text-teal-600 dark:text-teal-400',   bg: 'bg-teal-100 dark:bg-teal-900/30' },
  { key: 'kolileme',    label: 'Kolileme',    icon: Archive,  color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  { key: 'sevkiyat',    label: 'Sevkiyat',    icon: Truck,    color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-100 dark:bg-green-900/30' },
];

function RecentPhaseActivity() {
  const { data, isLoading } = useQuery<Record<string, PhaseLog[]>>({
    queryKey: ['/api/dashboard/recent-phase-activity'],
    refetchInterval: 45000,
  });
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightbox(null)}
          onKeyDown={e => e.key === 'Escape' && setLightbox(null)}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <img
            src={lightbox}
            alt="Faz fotoğrafı"
            className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full w-9 h-9 flex items-center justify-center transition-colors text-lg font-bold"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
      )}
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-display font-semibold text-muted-foreground">Son Faz İşlemleri</h2>
        <span className="text-xs text-muted-foreground/60 ml-1">— her faz için son 5 kayıt</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {PHASE_CONFIG.map(phase => {
          const logs: PhaseLog[] = data?.[phase.key] ?? [];
          const Icon = phase.icon;
          return (
            <Card key={phase.key} className="glass-card border-none shadow-md overflow-hidden" data-testid={`card-phase-${phase.key}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${phase.bg}`}>
                    <Icon className={`w-4 h-4 ${phase.color}`} />
                  </span>
                  {phase.label}
                  {!isLoading && (
                    <span className="ml-auto text-[11px] font-normal text-muted-foreground">{logs.length} işlem</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
                  </div>
                ) : logs.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground/60">
                    <Clock className="w-5 h-5 mx-auto mb-1.5 opacity-30" />
                    Henüz kayıt yok
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {logs.map(log => (
                      <li key={log.id} className="flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border/30" data-testid={`log-phase-${log.id}`}>
                        {log.hasPhoto && log.photoTable && log.photoId != null && log.photoField && (
                          <button
                            type="button"
                            onClick={() => setLightbox(`/api/photo/${log.photoTable}/${log.photoId}/${log.photoField}`)}
                            className="shrink-0 cursor-zoom-in"
                            aria-label="Fotoğrafı büyüt"
                          >
                            <img
                              src={`/api/photo/${log.photoTable}/${log.photoId}/${log.photoField}`}
                              alt={`${phase.label} fotoğrafı`}
                              loading="lazy"
                              decoding="async"
                              className="w-12 h-12 object-cover rounded-lg border border-border/50 hover:opacity-80 transition-opacity"
                            />
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <Link href={`/records/${log.recordId}`} className="text-xs font-medium hover:text-primary hover:underline truncate block leading-tight">
                              {log.title}
                            </Link>
                            <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-1" title={format(new Date(log.completedAt), 'dd.MM.yyyy HH:mm')}>
                              {formatDistanceToNow(new Date(log.completedAt), { addSuffix: true, locale: tr })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {log.itemName && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" title="Kumaş içeriği">
                                ✦ {log.itemName}
                              </span>
                            )}
                            {log.lotNumber && (
                              <span className="text-[10px] font-mono text-muted-foreground">{log.lotNumber}</span>
                            )}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${phase.bg} ${phase.color}`}>
                              +{log.quantity.toLocaleString('tr-TR')} adet
                            </span>
                            <span className="text-[10px] text-muted-foreground/70 truncate">{log.userName}</span>
                          </div>
                          {log.notes && (
                            <p className="text-[10px] text-muted-foreground/80 mt-1 italic truncate" title={log.notes}>
                              "{log.notes}"
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
    </>
  );
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { user } = useAuth();
  const { data: records, isLoading } = useRecords();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('weekly');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-3xl" />
      </div>
    );
  }

  const stats = {
    pending: records?.filter(r => r.status === 'pending').length || 0,
    waitingProduct: records?.filter(r => r.status === 'waiting_product').length || 0,
    completed: records?.filter(r => r.status === 'completed').length || 0,
    inProgress: records?.filter(r => r.status === 'in_progress').length || 0,
  };

  const allRecords = records ?? [];
  const pStart = periodStart(chartPeriod);
  const periodRecords = allRecords.filter(r => r.createdAt && new Date(r.createdAt) >= pStart);

  const pieData = [
    { name: 'Tamamlanan', value: periodRecords.filter(r => r.status === 'completed').length, color: '#22c55e' },
    { name: 'Devam Eden', value: periodRecords.filter(r => r.status === 'in_progress').length, color: '#3b82f6' },
    { name: 'Bekleyen', value: periodRecords.filter(r => r.status === 'pending').length, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  const barData = buildBarData(allRecords, chartPeriod);

  const statCards = [
    { title: 'Bekleyen', value: stats.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { title: 'Devam Eden', value: stats.inProgress, icon: PlayCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Tamamlanan', value: stats.completed, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
    { title: 'Ürün Bekleniyor', value: stats.waitingProduct, icon: Package, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-4xl font-display font-bold text-foreground">
          Merhaba, {user?.displayName || user?.username} <span className="text-primary">👋</span>
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">Bugün siparişlerde neler olup bittiğine bir göz atın.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
            <Card className="glass-card border-none hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                  <p className="text-3xl font-display font-bold">{stat.value}</p>
                </div>
                <div className={`p-4 rounded-2xl ${stat.bg}`}>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Weekly Plan */}
      <WeeklyPlanCard />

      {/* Recent Phase Activity */}
      <RecentPhaseActivity />

      {/* Weekly Active Productions */}
      <WeeklyActiveCard />

      {/* Charts */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold text-muted-foreground flex items-center gap-2">
          <CalendarDays className="w-5 h-5" />
          Sipariş Analizi
        </h2>
        <Select value={chartPeriod} onValueChange={(v) => setChartPeriod(v as ChartPeriod)}>
          <SelectTrigger className="h-9 w-[140px] rounded-xl bg-card border-border/50 shadow-sm" data-testid="select-chart-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Günlük</SelectItem>
            <SelectItem value="weekly">Haftalık</SelectItem>
            <SelectItem value="monthly">Aylık</SelectItem>
            <SelectItem value="yearly">Yıllık</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className="lg:col-span-2">
          <Card className="glass-card border-none h-full shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-xl">
                <TrendingUp className="w-5 h-5 text-primary" />
                Sipariş Aktivitesi
                <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-lg">{PERIOD_LABELS[chartPeriod]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }}>
          <Card className="glass-card border-none h-full shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-xl">Durum Dağılımı</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              {pieData.length > 0 ? (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground flex-col gap-4">
                  <Box className="w-12 h-12 opacity-20" />
                  <p>Görüntülenecek sipariş bulunmuyor.</p>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-4 mt-4 w-full">
                {pieData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm font-medium">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name} ({entry.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
