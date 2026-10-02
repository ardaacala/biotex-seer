import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { useRecords } from '@/hooks/use-records';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/status-badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Image as ImageIcon, RefreshCcw, AlertTriangle, ChevronDown, ChevronUp, Trophy, ArrowUpDown, Clock, Loader2, Printer, CalendarCheck, CalendarX, Repeat2, Star, Sparkles, Warehouse, CalendarOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductionRecord } from '@shared/schema';
import ExcelJS from 'exceljs';
import { LazyImage } from '@/components/lazy-image';

type PlanStatus = 'not-in-plan' | 'in-plan' | 'carried';

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  if (status === 'in-plan') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <CalendarCheck className="w-2.5 h-2.5" /> Sipariş sırasında
      </span>
    );
  }
  if (status === 'carried') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
        <Repeat2 className="w-2.5 h-2.5" /> Devreden sipariş
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground">
      <CalendarX className="w-2.5 h-2.5" /> Sipariş sırasına eklenmedi
    </span>
  );
}

function RecordCard({ record, idx, planStatus }: { record: ProductionRecord; idx: number; planStatus?: PlanStatus }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: idx * 0.04 }}
      key={record.id}
    >
      <Link href={`/records/${record.id}`}>
        <Card className={`glass-card border-none hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 h-full cursor-pointer overflow-hidden group ${record.priority === 'acil' ? 'ring-2 ring-destructive' : ''} ${record.status === 'waiting_product' ? 'ring-pulse-purple' : ''}`}>
          <div className="h-40 bg-muted/30 relative overflow-hidden flex items-center justify-center border-b border-border/50">
            <LazyImage
              src={`/api/photo/production_records/${record.id}/photoUrl?thumb=1`}
              alt={record.title}
              hasPhoto={record.hasPhoto ?? !!record.photoUrl}
              containerClassName="w-full h-full relative flex items-center justify-center"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            {/* On-demand: actual image bytes only fetch when card scrolls into view */}
            <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
              <StatusBadge status={record.status} />
              {(record as any).orderType === 'stok' && (
                <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm flex items-center gap-1" data-testid={`badge-stok-${record.id}`}>
                  <Warehouse className="w-3 h-3" /> STOK
                </span>
              )}
              {record.priority === 'acil' && (
                <span className="bg-destructive text-destructive-foreground px-2 py-0.5 rounded text-[10px] font-bold shadow-sm flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> ACİL
                </span>
              )}
              {record.createdAt && (Date.now() - new Date(record.createdAt).getTime()) < 24 * 60 * 60 * 1000 && (
                <span className="bg-yellow-400/90 text-yellow-900 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm flex items-center gap-1" data-testid={`badge-new-record-${record.id}`}>
                  <Star className="w-3 h-3 fill-yellow-900 text-yellow-900" /> Yeni
                </span>
              )}
              {planStatus === 'not-in-plan' && record.status !== 'pending' && (
                <span className="bg-orange-500/90 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm flex items-center gap-1" data-testid={`badge-plan-disi-${record.id}`}>
                  <CalendarOff className="w-3 h-3" /> Plan Harici Üretim
                </span>
              )}
            </div>
          </div>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-2 gap-4">
              <h3 className="font-bold text-lg font-display truncate group-hover:text-primary transition-colors">
                {record.title}
              </h3>
              <span className="text-sm font-semibold bg-secondary text-secondary-foreground px-2 py-1 rounded-md shrink-0">
                Adet: {record.totalQuantity}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs text-muted-foreground">
              <div><span className="font-semibold">Lot:</span> {record.lotNumber || '-'}</div>
              <div><span className="font-semibold">Ref:</span> {record.referenceId || '-'}</div>
              <div className="col-span-2"><span className="font-semibold">Müşteri:</span> {record.customer || '-'}</div>
            </div>
            <p className="text-muted-foreground text-sm line-clamp-2 min-h-[40px] mb-4">
              {record.description || 'Açıklama girilmedi.'}
            </p>
            <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs text-muted-foreground gap-2 flex-wrap">
              <span>EMİR-# {record.id.toString().padStart(4, '0')}</span>
              {planStatus !== undefined && (
                <PlanStatusBadge status={planStatus} />
              )}
              <span>
                {record.orderDate ? format(new Date(record.orderDate), 'dd.MM.yyyy') : 'Tarih bilinmiyor'}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

type SortKey = 'title' | 'lotNumber' | 'lotNumber-asc' | 'lotNumber-desc' | 'customer' | 'fifo' | 'new';

const NEW_RECORD_MS = 24 * 60 * 60 * 1000;

function isNewRecord(r: ProductionRecord): boolean {
  if (!r.createdAt) return false;
  return Date.now() - new Date(r.createdAt).getTime() < NEW_RECORD_MS;
}

function fifoScore(r: ProductionRecord): number {
  const date = r.orderDate ? new Date(r.orderDate).getTime() : new Date(r.createdAt || 0).getTime();
  return (r.priority === 'acil' ? 0 : 1_000_000_000_000_000) + date;
}

function sortRecords(list: ProductionRecord[], key: SortKey) {
  return [...list].sort((a, b) => {
    if (key === 'new') {
      const aNew = isNewRecord(a) ? 0 : 1;
      const bNew = isNewRecord(b) ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    if (key === 'fifo') return fifoScore(a) - fifoScore(b);
    if (key === 'lotNumber-asc') return (a.lotNumber ?? '').localeCompare(b.lotNumber ?? '', 'tr');
    if (key === 'lotNumber-desc') return (b.lotNumber ?? '').localeCompare(a.lotNumber ?? '', 'tr');
    const resolvedKey = key as keyof ProductionRecord;
    const aVal = (String(a[resolvedKey] ?? '')).toLowerCase();
    const bVal = (String(b[resolvedKey] ?? '')).toLowerCase();
    return aVal.localeCompare(bVal, 'tr');
  });
}

interface StatusGroupProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
  records: ProductionRecord[];
  sortBy: SortKey;
  defaultOpen?: boolean;
  testId: string;
  planStatusMap: Record<number, PlanStatus>;
}

function StatusGroup({ title, count, icon, colorClass, records, sortBy, defaultOpen = true, testId, planStatusMap }: StatusGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sorted = sortRecords(records, sortBy);

  return (
    <div className="space-y-4">
      <button
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${colorClass} rounded-2xl hover:opacity-90 transition-opacity`}
        onClick={() => setOpen(v => !v)}
        data-testid={testId}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold">{title}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
            {count}
          </span>
        </div>
        {open
          ? <ChevronUp className="w-5 h-5 opacity-70" />
          : <ChevronDown className="w-5 h-5 opacity-70" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
              <AnimatePresence>
                {sorted.map((record, idx) => (
                  <RecordCard key={record.id} record={record} idx={idx} planStatus={planStatusMap[record.id] ?? 'not-in-plan'} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

async function handleExport(): Promise<boolean> {
  const res = await fetch('/api/records/export', { credentials: 'include' });
  if (!res.ok) return false;
  const rows: Record<string, unknown>[] = await res.json();
  if (!rows.length) return false;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Siparişler');

  const headers = Object.keys(rows[0]);
  ws.columns = headers.map(h => ({ header: h, key: h, width: Math.max(h.length + 2, 14) }));

  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  rows.forEach(row => ws.addRow(row));

  ws.columns.forEach(col => {
    let maxLen = col.header ? String(col.header).length : 10;
    (col as any).eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
      const v = cell.value != null ? String(cell.value) : '';
      if (v.length > maxLen) maxLen = v.length;
    });
    col.width = Math.min(maxLen + 4, 50);
  });

  const date = format(new Date(), 'yyyy-MM-dd');
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `siparisler_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export default function RecordList() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('fifo');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const currentMonday = getMondayOfCurrentWeek();

  const { data: records, isLoading, refetch, isFetching } = useRecords({
    search: search.length > 2 ? search : undefined,
  });

  const { data: weeklyPlanData } = useQuery<{ plan: { id: number }; items: { recordId: number; isCarried: boolean }[] } | null>({
    queryKey: ['/api/weekly-plans/by-week', currentMonday],
    queryFn: () => fetch(`/api/weekly-plans/by-week?weekStart=${currentMonday}`, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 120000,
  });

  const planStatusMap: Record<number, PlanStatus> = {};
  if (weeklyPlanData?.items) {
    for (const item of weeklyPlanData.items) {
      planStatusMap[item.recordId] = item.isCarried ? 'carried' : 'in-plan';
    }
  }

  function getPlanStatus(recordId: number): PlanStatus {
    return planStatusMap[recordId] ?? 'not-in-plan';
  }

  const isSearching = search.trim().length > 0;
  const isLotSort = sortBy === 'lotNumber-asc' || sortBy === 'lotNumber-desc';

  const pendingRecords = records?.filter(r => r.status === 'pending') ?? [];
  const inProgressRecords = records?.filter(r => r.status === 'in_progress') ?? [];
  const completedRecords = records?.filter(r => r.status === 'completed') ?? [];
  const waitingProductRecords = records?.filter(r => r.status === 'waiting_product') ?? [];
  const activeRecords = records?.filter(r => r.status !== 'completed' && r.status !== 'gelen') ?? [];
  const allRecords = (records ?? []).filter(r => r.status !== 'gelen');

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Aktif Siparişler</h1>
          <p className="text-muted-foreground mt-1">Devam eden sipariş süreçlerini yönetin.</p>
        </div>
        <Link href="/records/new" className="hidden md:inline-flex">
          <Button className="rounded-xl gap-2 font-semibold shadow-lg hover:-translate-y-0.5 transition-transform">
            <Plus className="w-5 h-5" />
            Yeni Sipariş
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Lot no, başlık veya müşteri ile ara..."
            className="pl-10 h-12 rounded-xl bg-card border-border/50 focus:bg-background shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-records"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger
            className="h-12 w-full sm:w-[190px] rounded-xl bg-card border-border/50 shadow-sm shrink-0"
            data-testid="select-sort-records"
          >
            <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">
              <span className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> Yeni Siparişler
              </span>
            </SelectItem>
            <SelectItem value="fifo">FIFO Üretim Sırasına Göre</SelectItem>
            <SelectItem value="title">Sipariş Adına Göre</SelectItem>
            <SelectItem value="lotNumber">Lot Sırasına Göre</SelectItem>
            <SelectItem value="lotNumber-asc">Lot A → Z (Baştan Sona)</SelectItem>
            <SelectItem value="lotNumber-desc">Lot Z → A (Sondan Başa)</SelectItem>
            <SelectItem value="customer">Müşteriye Göre</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-12 w-12 rounded-xl shadow-sm hidden sm:flex shrink-0 border-border/50"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-records"
        >
          <RefreshCcw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          variant="outline"
          className="h-12 rounded-xl shadow-sm hidden sm:flex shrink-0 border-border/50 gap-2 px-4"
          onClick={async () => {
            setIsExporting(true);
            try {
              const ok = await handleExport();
              if (!ok) toast({ title: 'İndirme başarısız', description: 'Lütfen tekrar deneyin.', variant: 'destructive' });
            } finally {
              setIsExporting(false);
            }
          }}
          disabled={isExporting}
          data-testid="button-export-records"
          title="Excel olarak indir"
        >
          {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
          <span>Yazdır</span>
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[280px] rounded-2xl" />
          ))}
        </div>
      )}

      {/* Search mode: flat list of all non-completed matching records */}
      {!isLoading && isSearching && !isLotSort && (
        <div className="space-y-4">
          {activeRecords.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center bg-card/30 rounded-3xl border border-dashed border-border">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold font-display">Sipariş bulunamadı</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                Arama kriterlerinize uygun sipariş yok.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {sortRecords(activeRecords, sortBy).map((record, idx) => (
                  <RecordCard key={record.id} record={record} idx={idx} planStatus={planStatusMap[record.id] ?? 'not-in-plan'} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Lot sort mode: flat list of ALL records sorted by lot number */}
      {!isLoading && isLotSort && (
        <div className="space-y-4">
          {allRecords.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center bg-card/30 rounded-3xl border border-dashed border-border">
              <div className="bg-muted p-4 rounded-full mb-4">
                <ArrowUpDown className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold font-display">Sipariş bulunamadı</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                Gösterilecek sipariş yok.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {sortRecords(allRecords, sortBy).map((record, idx) => (
                  <RecordCard key={record.id} record={record} idx={idx} planStatus={planStatusMap[record.id] ?? 'not-in-plan'} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Normal mode: grouped by status */}
      {!isLoading && !isSearching && !isLotSort && (
        <div className="space-y-8">
          {/* Devam Eden Siparişler */}
          {inProgressRecords.length > 0 && (
            <StatusGroup
              title="Devam Eden Siparişler"
              count={inProgressRecords.length}
              icon={<Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              colorClass="bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400"
              records={inProgressRecords}
              sortBy={sortBy}
              defaultOpen={true}
              testId="button-toggle-in-progress-records"
              planStatusMap={planStatusMap}
            />
          )}

          {/* Ürün Bekleniyor */}
          {waitingProductRecords.length > 0 && (
            <StatusGroup
              title="Ürün Bekleniyor"
              count={waitingProductRecords.length}
              icon={<span className="w-5 h-5 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-purple-500 animate-pulse inline-block" /></span>}
              colorClass="bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400"
              records={waitingProductRecords}
              sortBy={sortBy}
              defaultOpen={true}
              testId="button-toggle-waiting-product-records"
              planStatusMap={planStatusMap}
            />
          )}

          {/* Beklemede */}
          {pendingRecords.length > 0 && (
            <StatusGroup
              title="Beklemede"
              count={pendingRecords.length}
              icon={<Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
              colorClass="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400"
              records={pendingRecords}
              sortBy={sortBy}
              defaultOpen={true}
              testId="button-toggle-pending-records"
              planStatusMap={planStatusMap}
            />
          )}

          {/* Empty state */}
          {pendingRecords.length === 0 && inProgressRecords.length === 0 && waitingProductRecords.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center bg-card/30 rounded-3xl border border-dashed border-border">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold font-display">Aktif sipariş bulunamadı</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                Henüz aktif sipariş oluşturulmamış.
              </p>
              <Link href="/records/new" className="mt-6">
                <Button variant="outline" className="rounded-xl">Yeni Sipariş Oluştur</Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Completed orders — collapsible section (always shown at bottom) */}
      {!isLoading && completedRecords.length > 0 && (
        <div className="space-y-4">
          <button
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-2xl hover:bg-green-500/15 transition-colors"
            onClick={() => setShowCompleted(v => !v)}
            data-testid="button-toggle-completed-records"
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-700 dark:text-green-400">
                Tamamlanan Siparişler
              </span>
              <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-bold px-2 py-0.5 rounded-full">
                {completedRecords.length}
              </span>
            </div>
            {showCompleted
              ? <ChevronUp className="w-5 h-5 text-green-600" />
              : <ChevronDown className="w-5 h-5 text-green-600" />}
          </button>

          <AnimatePresence>
            {showCompleted && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                  <AnimatePresence>
                    {sortRecords(completedRecords, sortBy).map((record, idx) => (
                      <RecordCard key={record.id} record={record} idx={idx} planStatus={planStatusMap[record.id] ?? 'not-in-plan'} />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <Link href="/records/new" className="md:hidden fixed bottom-24 right-6 z-50">
        <Button size="icon" className="w-14 h-14 rounded-full shadow-2xl bg-primary hover:bg-primary/90 text-white" data-testid="button-new-record-mobile">
          <Plus className="w-6 h-6" />
        </Button>
      </Link>
    </div>
  );
}
