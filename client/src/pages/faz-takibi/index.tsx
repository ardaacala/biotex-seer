import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { motion } from 'framer-motion';
import {
  Activity, Scissors, Wrench, Layers, Package, Archive, Truck,
  AlertTriangle, Clock, User, ChevronDown, ChevronUp, CalendarOff, Warehouse, Calendar, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type RecordEntry = {
  recordId: number;
  title: string;
  lotNumber: string | null;
  customer: string | null;
  status: string;
  priority: string | null;
  orderType: string | null;
  quantity: number;
  lastActivity: string | null;
  lastUserName: string | null;
};

type PhaseData = {
  key: string;
  label: string;
  unit: string;
  totalQty: number;
  records: RecordEntry[];
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const PHASE_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; headerBg: string }> = {
  pastal:      { icon: Scissors, color: 'text-sky-600',    bg: 'bg-sky-50 dark:bg-sky-950/30',       border: 'border-sky-200 dark:border-sky-800',       headerBg: 'bg-sky-500/10' },
  urun_islem:  { icon: Wrench,   color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', headerBg: 'bg-violet-500/10' },
  katlama:     { icon: Layers,   color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-800',   headerBg: 'bg-amber-500/10' },
  set_toplama: { icon: Package,  color: 'text-teal-600',   bg: 'bg-teal-50 dark:bg-teal-950/30',     border: 'border-teal-200 dark:border-teal-800',     headerBg: 'bg-teal-500/10' },
  kolileme:    { icon: Archive,  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', headerBg: 'bg-orange-500/10' },
  sevkiyat:    { icon: Truck,    color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-950/30',   border: 'border-green-200 dark:border-green-800',   headerBg: 'bg-green-500/10' },
};

const STATUS_ORDER = ['completed', 'in_progress', 'waiting_product', 'pending'];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  completed:       { label: 'Tamamlandı',     cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400' },
  in_progress:     { label: 'Devam Ediyor',   cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400' },
  waiting_product: { label: 'Ürün Bekleniyor', cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400' },
  pending:         { label: 'Beklemede',       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

const PERIOD_LABELS: Record<string, string> = {
  daily: 'Bugün',
  weekly: 'Bu Hafta',
  monthly: 'Bu Ay',
};

/* ─── Status Group ───────────────────────────────────────────────────────── */
function StatusGroup({
  statusKey, recs, phaseKey, phaseMeta, unit, planInIds,
}: {
  statusKey: string;
  recs: RecordEntry[];
  phaseKey: string;
  phaseMeta: typeof PHASE_META[string];
  unit: string;
  planInIds: Set<number>;
}) {
  const sm = STATUS_META[statusKey];
  const [open, setOpen] = useState(true);

  return (
    <div>
      {/* Status sub-header — clickable */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-1.5 flex items-center justify-between gap-2 border-b border-border/30 transition-colors hover:brightness-95 cursor-pointer select-none ${sm.cls} bg-opacity-40`}
        data-testid={`toggle-status-${phaseKey}-${statusKey}`}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0 rounded-full border ${sm.cls}`}>
            {sm.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{recs.length} kayıt</span>
        </div>
        {open
          ? <ChevronUp className="w-3 h-3 text-muted-foreground/70 shrink-0" />
          : <ChevronDown className="w-3 h-3 text-muted-foreground/70 shrink-0" />
        }
      </button>

      {/* Records table — only when open */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] text-muted-foreground uppercase bg-muted/20">
              <tr>
                <th className="px-3 py-1.5">Sipariş</th>
                <th className="px-2 py-1.5">Lot</th>
                <th className="px-2 py-1.5 text-right">Miktar</th>
                <th className="px-2 py-1.5">Son Aktivite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {recs.map(rec => (
                <tr
                  key={rec.recordId}
                  className={`transition-colors hover:bg-muted/10 ${rec.priority === 'acil' ? 'bg-destructive/5' : ''}`}
                  data-testid={`row-faztakibi-${phaseKey}-${rec.recordId}`}
                >
                  <td className="px-3 py-2 min-w-[180px]">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/records/${rec.recordId}`}
                        className="hover:text-primary hover:underline transition-colors text-xs font-medium whitespace-nowrap"
                      >
                        {rec.title}
                      </Link>
                      {rec.customer && (
                        <span className="text-[10px] text-muted-foreground">{rec.customer}</span>
                      )}
                      {rec.priority === 'acil' && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-destructive text-destructive-foreground w-fit">
                          <AlertTriangle className="w-2 h-2" /> ACİL
                        </span>
                      )}
                      {rec.orderType === 'stok' && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-emerald-600 text-white w-fit" data-testid={`badge-stok-faz-${rec.recordId}`}>
                          <Warehouse className="w-2 h-2" /> STOK
                        </span>
                      )}
                      {phaseKey !== 'sevkiyat' && !planInIds.has(rec.recordId) && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-orange-500 text-white w-fit" data-testid={`badge-plan-disi-faz-${rec.recordId}`}>
                          <CalendarOff className="w-2 h-2" /> Plan Harici Üretim
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {rec.lotNumber || '—'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-block font-mono font-semibold px-1.5 py-0 rounded text-[11px] whitespace-nowrap ${phaseMeta.bg} ${phaseMeta.color}`}>
                      {rec.quantity.toLocaleString('tr-TR')}
                      <span className="text-[9px] ml-0.5 opacity-70">{unit}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {rec.lastActivity ? (
                      <div className="flex flex-col gap-0">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          {formatDistanceToNow(new Date(rec.lastActivity), { addSuffix: true, locale: tr })}
                        </span>
                        {rec.lastUserName && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                            <User className="w-2.5 h-2.5 shrink-0" />
                            {rec.lastUserName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Phase Section ─────────────────────────────────────────────────────── */
function PhaseSection({ phase, idx, planInIds }: { phase: PhaseData; idx: number; planInIds: Set<number> }) {
  const meta = PHASE_META[phase.key] ?? PHASE_META['pastal'];
  const Icon = meta.icon;
  const [collapsed, setCollapsed] = useState(false);

  // Group records by status
  const byStatus = STATUS_ORDER.reduce<Record<string, RecordEntry[]>>((acc, s) => {
    acc[s] = phase.records.filter(r => r.status === s);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
    >
      <Card className={`glass-card border shadow-sm overflow-hidden ${meta.border}`}>
        {/* Phase header */}
        <CardHeader
          className={`${meta.headerBg} border-b flex flex-row items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none`}
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${meta.color}`} />
            <CardTitle className={`font-display text-base font-semibold ${meta.color}`}>
              {phase.label}
            </CardTitle>
            <span className="text-xs font-normal text-muted-foreground bg-background/60 px-2 py-0.5 rounded-lg">
              {phase.records.length} sipariş
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-mono font-bold text-sm ${meta.color}`}>
              {phase.totalQty.toLocaleString('tr-TR')}
              <span className="text-xs font-normal ml-1 opacity-70">{phase.unit}</span>
            </span>
            {collapsed
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronUp className="w-4 h-4 text-muted-foreground" />
            }
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="p-0">
            {/* Status groups — each individually collapsible */}
            {STATUS_ORDER.map(statusKey => {
              const recs = byStatus[statusKey] ?? [];
              if (recs.length === 0) return null;
              return (
                <StatusGroup
                  key={statusKey}
                  statusKey={statusKey}
                  recs={recs}
                  phaseKey={phase.key}
                  phaseMeta={meta}
                  unit={phase.unit}
                  planInIds={planInIds}
                />
              );
            })}
          </CardContent>
        )}
      </Card>
    </motion.div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function FazTakibiPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [customMode, setCustomMode] = useState<'day' | 'range' | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const currentMonday = getMondayOfCurrentWeek();

  const today = new Date().toISOString().slice(0, 10);

  // Build query key and URL based on mode
  const isCustom = customMode !== null;
  const queryDateFrom = customMode === 'day' ? customDate : customMode === 'range' ? customFrom : '';
  const queryDateTo = customMode === 'range' ? customTo : '';

  const { data: phases = [], isLoading } = useQuery<PhaseData[]>({
    queryKey: ['/api/faz-takibi', isCustom ? `${queryDateFrom}__${queryDateTo}` : period],
    queryFn: () => {
      const params = isCustom && queryDateFrom
        ? `dateFrom=${queryDateFrom}${queryDateTo ? `&dateTo=${queryDateTo}` : ''}`
        : `period=${period}`;
      return fetch(`/api/faz-takibi?${params}`, { credentials: 'include' }).then(r => {
        if (!r.ok) throw new Error('API error');
        return r.json();
      });
    },
    refetchInterval: isCustom ? false : 45000,
    enabled: isCustom ? !!queryDateFrom : true,
  });

  const clearCustom = () => {
    setCustomMode(null);
    setCustomDate('');
    setCustomFrom('');
    setCustomTo('');
  };

  const { data: weeklyPlanData } = useQuery<{ plan: { id: number }; items: { recordId: number }[] } | null>({
    queryKey: ['/api/weekly-plans/by-week', currentMonday],
    queryFn: () => fetch(`/api/weekly-plans/by-week?weekStart=${currentMonday}`, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 120000,
  });

  const planInIds = new Set<number>((weeklyPlanData?.items ?? []).map(i => i.recordId));

  const totalQty = phases.reduce((s, p) => s + p.totalQty, 0);
  const totalRecords = new Set(phases.flatMap(p => p.records.map(r => r.recordId))).size;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-violet-500" />
            Faz Takibi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Üretim fazlarındaki sipariş hareketleri
          </p>
        </div>

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset buttons */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {(['daily', 'weekly', 'monthly'] as const).map(p => (
              <Button
                key={p}
                variant={!isCustom && period === p ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-lg h-7 text-xs px-3 ${!isCustom && period === p ? '' : 'text-muted-foreground'}`}
                onClick={() => { clearCustom(); setPeriod(p); }}
                data-testid={`button-period-${p}`}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>

          {/* Custom date buttons */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <Button
              variant={customMode === 'day' ? 'default' : 'ghost'}
              size="sm"
              className={`rounded-lg h-7 text-xs px-3 gap-1.5 ${customMode === 'day' ? '' : 'text-muted-foreground'}`}
              onClick={() => { setCustomMode(customMode === 'day' ? null : 'day'); setCustomTo(''); }}
              data-testid="button-period-day"
            >
              <Calendar className="w-3 h-3" />
              Gün Seç
            </Button>
            <Button
              variant={customMode === 'range' ? 'default' : 'ghost'}
              size="sm"
              className={`rounded-lg h-7 text-xs px-3 gap-1.5 ${customMode === 'range' ? '' : 'text-muted-foreground'}`}
              onClick={() => setCustomMode(customMode === 'range' ? null : 'range')}
              data-testid="button-period-range"
            >
              <Calendar className="w-3 h-3" />
              Aralık Seç
            </Button>
          </div>

          {/* Day picker input */}
          {customMode === 'day' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                max={today}
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="h-7 text-xs rounded-xl px-2 w-36"
                data-testid="input-custom-date"
              />
              {customDate && (
                <button type="button" onClick={clearCustom} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-date">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Range picker inputs */}
          {customMode === 'range' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                max={customTo || today}
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="h-7 text-xs rounded-xl px-2 w-36"
                data-testid="input-range-from"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                min={customFrom}
                max={today}
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="h-7 text-xs rounded-xl px-2 w-36"
                data-testid="input-range-to"
              />
              {(customFrom || customTo) && (
                <button type="button" onClick={clearCustom} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-range">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Summary bar */}
      {!isLoading && phases.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap items-center gap-3"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-1.5">
            <span className="font-semibold text-foreground">{phases.length}</span> faz aktif
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-1.5">
            <span className="font-semibold text-foreground">{totalRecords}</span> sipariş
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-1.5">
            <span className="font-semibold text-foreground">{totalQty.toLocaleString('tr-TR')}</span> toplam üretim
          </div>
        </motion.div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && phases.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center bg-card/30 rounded-3xl border border-dashed border-border">
          <div className="bg-muted p-4 rounded-full mb-4">
            <Activity className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold font-display">Veri bulunamadı</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-xs">
            {isCustom
              ? customMode === 'day' && customDate
                ? `${customDate} tarihi`
                : customFrom && customTo
                  ? `${customFrom} – ${customTo} aralığı`
                  : 'Seçili tarih'
              : PERIOD_LABELS[period]
            } için üretim faz kaydı bulunmuyor.
          </p>
        </div>
      )}

      {/* Phase sections */}
      {!isLoading && phases.length > 0 && (
        <div className="space-y-4">
          {phases.map((phase, idx) => (
            <PhaseSection key={phase.key} phase={phase} idx={idx} planInIds={planInIds} />
          ))}
        </div>
      )}
    </div>
  );
}
