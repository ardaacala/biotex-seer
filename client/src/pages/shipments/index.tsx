import { useState } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Truck, User as UserIcon, Hash, Tag, Package, MapPin, Clock, History, Plus, SearchX, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import ShipmentPlanModal from './plan-modal';
import type { Shipment, ProductionRecord } from '@shared/schema';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MANAGER_ROLES = ['admin', 'uretim_sefi', 'ofis_calisan'];

type ShipmentWithRecord = Shipment & {
  record: ProductionRecord;
  // Sevkiyat fazına işlenmiş ama henüz bir sevkiyat planına yazılmamış koli sayısı.
  readyBoxes: number;
  // Bu siparişin geriye kalan toplam koli hedefi (toplam − planlara yazılmış).
  totalPlannedBoxes: number;
  // Kayıt dışı sevk edildi olarak işaretleyen kullanıcının görünen adı (varsa).
  shippedByName: string | null;
};

export default function ShipmentList() {
  const [search, setSearch] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: shipments = [], isLoading } = useQuery<ShipmentWithRecord[]>({
    queryKey: ['/api/shipments'],
    queryFn: () => fetch('/api/shipments', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 60000,
  });

  const filtered = Array.isArray(shipments) ? shipments.filter(s => {
    if (!search) return true;
    const q = normalizeForSearch(search);
    return (
      normalizeForSearch(s.record.title).includes(q) ||
      normalizeForSearch(s.record.customer).includes(q) ||
      normalizeForSearch(s.record.lotNumber).includes(q) ||
      normalizeForSearch(s.record.referenceId).includes(q) ||
      normalizeForSearch(s.deliveryAddress).includes(q)
    );
  }) : [];

  const pending = filtered.filter(s => s.status === 'pending');
  const loaded = filtered.filter(s => s.status === 'araca_yuklendi');

  const hasSearch = search.trim().length > 0;
  const showSearchEmpty = hasSearch && pending.length === 0 && loaded.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 sm:px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">Sevkiyat</h1>
              <p className="text-xs text-muted-foreground">{pending.length} bekliyor · {loaded.length} yüklendi</p>
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-xl gap-2 shrink-0"
            onClick={() => setPlanOpen(true)}
            data-testid="button-sevkiyat-planla"
          >
            <Plus className="w-4 h-4" />
            Sevkiyat Planla
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Sipariş, müşteri, adres..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
            data-testid="input-search-shipments"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {showSearchEmpty ? (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bekleyen Sevkiyatlar</h2>
                    <Badge variant="secondary" className="rounded-full text-xs">0</Badge>
                  </div>
                  <SearchEmptyCard
                    search={search}
                    onClear={() => setSearch('')}
                    testIdSuffix="pending"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-green-500" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Geçmiş Sevkiyatlar</h2>
                    <Badge className="rounded-full text-xs bg-green-500/15 text-green-600 border-green-500/30">0</Badge>
                  </div>
                  <SearchEmptyCard
                    search={search}
                    onClear={() => setSearch('')}
                    testIdSuffix="loaded"
                  />
                </div>
              </>
            ) : pending.length === 0 && loaded.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground opacity-60">
                <Truck className="w-16 h-16" />
                <p className="text-base">Henüz tamamlanan sipariş yok.</p>
              </div>
            ) : (
              <>
                {pending.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bekleyen Sevkiyatlar</h2>
                      <Badge variant="secondary" className="rounded-full text-xs">{pending.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {pending.map((s, i) => (
                        <ShipmentCard key={s.id} shipment={s} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {loaded.length > 0 && (
                  <div>
                    <button
                      className="flex items-center gap-2 mb-3 w-full group"
                      onClick={() => setHistoryOpen(v => !v)}
                      data-testid="button-toggle-history"
                    >
                      <History className="w-4 h-4 text-green-500" />
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                        Geçmiş Sevkiyatlar
                      </h2>
                      <Badge className="rounded-full text-xs bg-green-500/15 text-green-600 border-green-500/30">{loaded.length}</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">{historyOpen ? '▲' : '▼'}</span>
                    </button>
                    {historyOpen && (
                      <div className="space-y-3">
                        {loaded.map((s, i) => (
                          <ShipmentCard key={s.id} shipment={s} index={i} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ShipmentPlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        pendingShipments={pending}
      />
    </div>
  );
}

function SearchEmptyCard({
  search,
  onClear,
  testIdSuffix,
}: {
  search: string;
  onClear: () => void;
  testIdSuffix: string;
}) {
  return (
    <div
      className="glass-card border border-dashed border-border/50 rounded-2xl p-6 flex flex-col items-center text-center gap-3"
      data-testid={`empty-search-${testIdSuffix}`}
    >
      <div className="bg-muted/50 p-3 rounded-xl">
        <SearchX className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Eşleşen sevkiyat bulunamadı</p>
        <p className="text-xs text-muted-foreground">
          "{search}" için bu bölümde sonuç yok.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={onClear}
        data-testid={`button-clear-search-${testIdSuffix}`}
      >
        Filtreyi temizle
      </Button>
    </div>
  );
}

function ShipmentCard({
  shipment,
  index,
}: {
  shipment: ShipmentWithRecord;
  index: number;
}) {
  const r = shipment.record;
  const totalBoxes = Math.ceil(r.totalQuantity / (r.itemsPerBox || 1));
  const isLoaded = shipment.status === 'araca_yuklendi';
  const readyBoxes = shipment.readyBoxes ?? 0;
  const totalPlanned = shipment.totalPlannedBoxes ?? totalBoxes;

  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const offRecordMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/shipments/${shipment.id}/off-record-ship`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shipments'] });
      toast({
        title: 'Kayıt dışı sevk edildi',
        description: `${r.title} tamamlanan sevkiyatlara taşındı.`,
      });
      setConfirmOpen(false);
    },
    onError: () => {
      toast({
        title: 'İşlem başarısız',
        description: 'Sevkiyat işaretlenemedi. Lütfen tekrar deneyin.',
        variant: 'destructive',
      });
    },
  });

  const shippedByLabel = shipment.shippedByName || null;
  const shippedAtLabel = shipment.shippedAt
    ? new Date(shipment.shippedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link href={`/records/${r.id}`}>
        <div
          className={`glass-card border rounded-2xl p-4 hover:shadow-lg transition-all duration-200 cursor-pointer group ${isLoaded ? 'border-green-500/30 bg-green-500/5' : 'border-border/40 hover:border-primary/30'}`}
          data-testid={`card-shipment-${shipment.id}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {isLoaded ? (
                  shipment.offRecord ? (
                    <Badge className="rounded-full text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
                      <AlertTriangle className="w-3 h-3 mr-1" />Kayıt Dışı Sevk Edildi
                    </Badge>
                  ) : (
                    <Badge className="rounded-full text-xs bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20">
                      <Truck className="w-3 h-3 mr-1" />Araca Yüklendi
                    </Badge>
                  )
                ) : (
                  <Badge variant="secondary" className="rounded-full text-xs">
                    <Clock className="w-3 h-3 mr-1" />Bekliyor
                  </Badge>
                )}
                {r.priority === 'acil' && (
                  <Badge variant="destructive" className="rounded-full text-xs">Acil</Badge>
                )}
              </div>
              <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors line-clamp-1 mb-2">
                {r.title}
              </h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {r.customer && (
                  <span className="flex items-center gap-1">
                    <UserIcon className="w-3 h-3 shrink-0" />{r.customer}
                  </span>
                )}
                {r.lotNumber && (
                  <span className="flex items-center gap-1 font-mono">
                    <Hash className="w-3 h-3 shrink-0" />{r.lotNumber}
                  </span>
                )}
                {r.referenceId && (
                  <span className="flex items-center gap-1 font-mono">
                    <Tag className="w-3 h-3 shrink-0" />{r.referenceId}
                  </span>
                )}
              </div>
              {shipment.deliveryAddress && (
                <div className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-primary/60" />
                  <span className="line-clamp-1">{shipment.deliveryAddress}</span>
                </div>
              )}
              {isLoaded && shipment.offRecord && (shippedByLabel || shippedAtLabel) && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400"
                  data-testid={`text-off-record-info-${shipment.id}`}
                >
                  {shippedByLabel && (
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3 shrink-0" />{shippedByLabel}
                    </span>
                  )}
                  {shippedAtLabel && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />{shippedAtLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-center justify-center bg-primary/10 rounded-xl p-3 min-w-[68px]" data-testid={`badge-shipment-counter-${shipment.id}`}>
              <Package className="w-4 h-4 text-primary mb-1" />
              {isLoaded ? (
                <>
                  <span className="text-lg font-bold text-primary leading-none">{totalBoxes}</span>
                  <span className="text-[10px] text-muted-foreground">koli</span>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-primary leading-none">
                    <span data-testid={`text-ready-boxes-${shipment.id}`}>{readyBoxes}</span>
                    <span className="text-muted-foreground/70 mx-0.5">/</span>
                    <span className="text-muted-foreground" data-testid={`text-total-planned-${shipment.id}`}>{totalPlanned}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">hazır / toplam</span>
                </>
              )}
            </div>
          </div>
          {!isLoaded && isManager && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full rounded-xl gap-2 text-amber-700 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmOpen(true);
                }}
                data-testid={`button-off-record-ship-${shipment.id}`}
              >
                <AlertTriangle className="w-4 h-4" />
                Kayıt Dışı Sevk Et
              </Button>
            </div>
          )}
        </div>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid={`dialog-off-record-confirm-${shipment.id}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Kayıt dışı sevk edildi olarak işaretlensin mi?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <span className="font-medium text-foreground">{r.title}</span> siparişi sevk edilecek
                  siparişler listesinden çıkarılıp doğrudan tamamlanan sevkiyatlara taşınacak.
                </p>
                <p className="text-xs">
                  Bu işlem geri alınamaz. Kim ve ne zaman işaretlediği kayıt altına alınır.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={offRecordMutation.isPending}
              data-testid={`button-off-record-cancel-${shipment.id}`}
            >
              Vazgeç
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={offRecordMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                offRecordMutation.mutate();
              }}
              className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
              data-testid={`button-off-record-confirm-${shipment.id}`}
            >
              {offRecordMutation.isPending ? 'İşaretleniyor...' : 'Evet, işaretle'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
