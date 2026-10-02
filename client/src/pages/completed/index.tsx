import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import type { ProductionSummaryItem, PhaseData } from '@/hooks/use-production-summary';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Trophy, AlertTriangle, RefreshCw, PackageCheck,
  ExternalLink, ChevronDown, ChevronUp, CheckCircle2, Trash2, Search, X
} from 'lucide-react';
import { cn, normalizeForSearch } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

function useCompletedSummary() {
  return useQuery<ProductionSummaryItem[]>({
    queryKey: ['/api/completed-summary'],
    queryFn: async () => {
      const r = await fetch('/api/completed-summary', { credentials: 'include' });
      if (r.status === 401) throw new Error('401');
      if (!r.ok) throw new Error('Özet yüklenemedi');
      return r.json();
    },
    refetchInterval: 60000,
    retry: false,
  });
}

function pctColor(pct: number) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 60)  return 'bg-primary';
  if (pct >= 30)  return 'bg-amber-400';
  return 'bg-rose-400';
}

function MiniProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className={cn("h-full rounded-full", pctColor(pct))}
      />
    </div>
  );
}

function CompletedOrderCard({ item, index, isAdmin, onDelete }: {
  item: ProductionSummaryItem;
  index: number;
  isAdmin: boolean;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { record, phases, totalPct, phasesFullyDone } = item;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="glass-card border-none shadow-lg rounded-2xl overflow-hidden ring-2 ring-green-500/30">
        <CardHeader className="px-5 pt-5 pb-3 bg-green-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Tamamlandı
                </span>
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">#{index + 1}</span>
              </div>
              <h3 className="font-display font-bold text-base leading-snug truncate">{record.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {record.lotNumber && <span className="font-mono">Lot: {record.lotNumber}</span>}
                {record.customer && <span>Müşteri: {record.customer}</span>}
                {record.orderDate && <span>{format(new Date(record.orderDate), 'dd.MM.yyyy')}</span>}
                <span className="font-medium">{record.totalQuantity} adet</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/records/${record.id}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </Link>
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      data-testid={`button-delete-completed-${record.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Siparişi Sil</AlertDialogTitle>
                      <AlertDialogDescription>
                        <strong>"{record.title}"</strong> adlı tamamlanan sipariş kalıcı olarak silinecek. Bu işlem geri alınamaz.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>İptal</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => onDelete(record.id)}
                        data-testid={`button-confirm-delete-completed-${record.id}`}
                      >
                        Evet, Sil
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-5 pb-4 space-y-3">
          <button
            className="w-full rounded-xl border-2 border-green-500/40 bg-green-500/5 hover:bg-green-500/10 px-4 py-3 space-y-2 text-left transition-colors"
            onClick={() => setExpanded(v => !v)}
            data-testid={`button-expand-completed-${record.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Tüm fazlar tamamlandı — {phasesFullyDone}/6
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-green-600">%{Math.round(totalPct)}</span>
                {expanded
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            <MiniProgressBar pct={Math.min(totalPct, 100)} />
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="phases"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-2">
                  {phases.map((phase) => (
                    <div key={phase.key} className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{phase.label}</span>
                        <span className="text-xs font-bold text-green-600">
                          {phase.completed.toLocaleString('tr-TR')} / {phase.target.toLocaleString('tr-TR')} {phase.unit} — %{Math.round(phase.pct)}
                        </span>
                      </div>
                      <MiniProgressBar pct={Math.min(phase.pct, 100)} />
                      {phase.lastLog && (
                        <p className="text-[11px] text-muted-foreground">
                          Son giriş: <span className="font-medium">{phase.lastLog.username}</span>
                          {phase.lastLog.completedAt && (
                            <> · {format(new Date(phase.lastLog.completedAt), 'dd.MM.yyyy HH:mm')}</>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function CompletedOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState('');

  const { data: completedOrders, isLoading, isError, error, refetch, isFetching } = useCompletedSummary();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/completed-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
      toast({ title: 'Sipariş silindi' });
    },
    onError: (err: any) => {
      toast({ title: 'Hata', description: err.message || 'Sipariş silinemedi', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <span className="bg-green-500/10 text-green-600 p-2 rounded-xl">
              <Trophy className="w-7 h-7" />
            </span>
            Tamamlanan Siparişler
          </h1>
          <p className="text-muted-foreground mt-1">Tüm 6 üretim fazı tamamlanmış siparişler. Salt okunur.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-completed"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
          Yenile
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card border-none rounded-2xl h-40 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : isError ? (
        <Card className="glass-card border-none rounded-2xl p-12 text-center text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-60" />
          <p className="font-medium text-destructive">Veriler yüklenemedi</p>
          <p className="text-sm mt-1 mb-4">{(error as Error)?.message === '401' ? 'Oturum süresi dolmuş olabilir.' : 'Bir hata oluştu.'}</p>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Tekrar Dene
          </Button>
        </Card>
      ) : !completedOrders || completedOrders.length === 0 ? (
        <Card className="glass-card border-none rounded-2xl p-12 text-center text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Henüz tamamlanan sipariş yok.</p>
          <p className="text-sm mt-1">Tüm 6 fazı biten siparişler burada görünür.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 rounded-xl px-4 py-3 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {completedOrders.length} sipariş tüm aşamaları tamamlamış — salt okunur görünüm.
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Sipariş adı, lot numarası veya müşteri ara..."
              className="pl-10 pr-10 h-12 rounded-xl bg-card border-border/50 focus:bg-background shadow-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-completed"
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {(() => {
            const q = normalizeForSearch(search.trim());
            const filtered = q
              ? completedOrders.filter(s =>
                  normalizeForSearch(s.record.title).includes(q) ||
                  normalizeForSearch(s.record.lotNumber).includes(q) ||
                  normalizeForSearch(s.record.customer).includes(q)
                )
              : completedOrders;

            if (filtered.length === 0) {
              return (
                <Card className="glass-card border-none rounded-2xl p-10 text-center text-muted-foreground">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Sonuç bulunamadı.</p>
                  <p className="text-sm mt-1">"{search}" için eşleşen sipariş yok.</p>
                </Card>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-4">
                {filtered.map((item, idx) => (
                  <CompletedOrderCard
                    key={item.record.id}
                    item={item}
                    index={idx}
                    isAdmin={isAdmin}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
