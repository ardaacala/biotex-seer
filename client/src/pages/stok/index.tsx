import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Warehouse, Plus, Pencil, Trash2, X, AlertTriangle, Search,
  Filter, Package, Calendar, Building2, Tag, ImageIcon, ChevronRight,
  Hash, Settings2, ChevronDown, ChevronUp, FolderTree, Lock, Unlock,
  ClipboardList, Loader2, History, FlaskConical, TrendingDown, Layers,
  ShieldAlert, ShieldCheck, User as UserIcon, Clock, QrCode, ScanLine,
} from 'lucide-react';
import { BarcodeScanner, type BarkodKaynak } from '@/components/barcode-scanner';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import {
  insertStokItemSchema, STOK_BIRIMLER,
  type StokItem, type StokKategori, type StokAltTur,
} from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { z } from 'zod';
import { cn, normalizeForSearch } from '@/lib/utils';

const MANAGER_ROLES = ['admin', 'uretim_sefi', 'ofis_calisan'];

const formSchema = insertStokItemSchema.extend({
  sonKullanmaTarihi: z.string().optional().nullable(),
  altTur: z.string().optional().nullable(),
  miktar: z.preprocess(v => (v === '' || v == null) ? undefined : Number(v), z.number({ required_error: 'Toplam miktar gerekli' }).min(0)),
  rezerveMiktar: z.preprocess(v => (v === '' || v == null) ? 0 : Number(v), z.number().min(0)).default(0),
  kritikStok: z.preprocess(v => (v === '' || v == null) ? 0 : Number(v), z.number().min(0)).default(0),
}).refine(d => (d.rezerveMiktar ?? 0) <= (d.miktar ?? 0), {
  message: 'Rezerve miktar toplam miktarı geçemez',
  path: ['rezerveMiktar'],
});
type FormData = z.infer<typeof formSchema>;

function serbestMiktar(item: StokItem) {
  return item.miktar - (item.rezerveMiktar ?? 0);
}

function isCritical(item: StokItem): boolean {
  return item.kritikStok > 0 && serbestMiktar(item) <= item.kritikStok;
}

function formatDate(d: string | null | undefined) {
  if (!d) return null;
  try { return format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy', { locale: tr }); } catch { return d; }
}

/* ─── Stok/Rezerve Badge çifti ────────────────────────────────────────────── */
function MiktarBadges({ item, size = 'sm' }: { item: StokItem; size?: 'sm' | 'md' }) {
  const serbest = serbestMiktar(item);
  const rezerve = item.rezerveMiktar ?? 0;
  const critical = isCritical(item);
  const birim = item.birim;

  if (size === 'md') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("bg-muted/30 rounded-xl px-4 py-3", critical && "bg-destructive/10")}>
          <div className="flex items-center gap-1.5 mb-1">
            <Unlock className="w-3 h-3 text-green-600 dark:text-green-400" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Serbest Stok</p>
          </div>
          <p className={cn("font-mono font-bold text-2xl", critical ? "text-destructive" : "text-green-700 dark:text-green-400")}>
            {serbest.toLocaleString('tr-TR')}
            <span className="text-sm font-normal ml-1 text-muted-foreground">{birim}</span>
          </p>
          {item.kritikStok > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">min: {item.kritikStok}</p>
          )}
        </div>
        <div className={cn("bg-muted/30 rounded-xl px-4 py-3", rezerve === 0 && "opacity-50")}>
          <div className="flex items-center gap-1.5 mb-1">
            <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Rezerve</p>
          </div>
          <p className="font-mono font-bold text-2xl text-amber-700 dark:text-amber-400">
            {rezerve.toLocaleString('tr-TR')}
            <span className="text-sm font-normal ml-1 text-muted-foreground">{birim}</span>
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
            Toplam: {item.miktar.toLocaleString('tr-TR')} {birim}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        {critical && <AlertTriangle className="w-3 h-3 text-destructive" />}
        <span className={cn("font-mono font-bold text-sm", critical ? "text-destructive" : "text-green-700 dark:text-green-400")}>
          {serbest.toLocaleString('tr-TR')}
          <span className="text-[10px] font-normal ml-0.5 text-muted-foreground">{birim}</span>
        </span>
        <Unlock className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
      </div>
      {rezerve > 0 && (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
            {rezerve.toLocaleString('tr-TR')}
            <span className="text-[10px] font-normal ml-0.5 text-muted-foreground">{birim}</span>
          </span>
          <Lock className="w-2.5 h-2.5 text-amber-500" />
        </div>
      )}
      {item.kritikStok > 0 && (
        <span className="text-[10px] text-muted-foreground/60 font-mono">min: {item.kritikStok}</span>
      )}
    </div>
  );
}

/* ─── Kategori Yönetim Modal ─────────────────────────────────────────────── */
function KategoriYonetimModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newKategori, setNewKategori] = useState('');
  const [expandedKat, setExpandedKat] = useState<number | null>(null);
  const [newAltTur, setNewAltTur] = useState<Record<number, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'kategori' | 'alttur'; id: number; name: string } | null>(null);

  const { data: kategoriler = [] } = useQuery<StokKategori[]>({ queryKey: ['/api/stok-kategoriler'] });
  const { data: altTurler = [] } = useQuery<StokAltTur[]>({ queryKey: ['/api/stok-alt-turler'] });

  const addKategori = useMutation({
    mutationFn: (ad: string) => apiRequest('POST', '/api/stok-kategoriler', { ad }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/stok-kategoriler'] }); setNewKategori(''); toast({ title: 'Kategori eklendi' }); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });
  const deleteKategori = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/stok-kategoriler/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/stok-kategoriler'] }); queryClient.invalidateQueries({ queryKey: ['/api/stok-alt-turler'] }); toast({ title: 'Kategori silindi' }); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });
  const addAltTur = useMutation({
    mutationFn: ({ kategoriId, ad }: { kategoriId: number; ad: string }) =>
      apiRequest('POST', '/api/stok-alt-turler', { kategoriId, ad }).then(r => r.json()),
    onSuccess: (_, v) => { queryClient.invalidateQueries({ queryKey: ['/api/stok-alt-turler'] }); setNewAltTur(p => ({ ...p, [v.kategoriId]: '' })); toast({ title: 'Alt tür eklendi' }); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });
  const updateAltTurBirim = useMutation({
    mutationFn: ({ id, birim }: { id: number; birim: string }) =>
      apiRequest('PATCH', `/api/stok-alt-turler/${id}`, { birim }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/stok-alt-turler'] }); toast({ title: 'Birim güncellendi' }); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });
  const deleteAltTur = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/stok-alt-turler/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/stok-alt-turler'] }); toast({ title: 'Alt tür silindi' }); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <FolderTree className="w-5 h-5 text-primary" />
              Tür ve Alt Tür Yönetimi
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input placeholder="Yeni tür adı..." value={newKategori} onChange={e => setNewKategori(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newKategori.trim() && addKategori.mutate(newKategori.trim())}
              className="h-9 rounded-xl" data-testid="input-new-kategori" />
            <Button size="sm" className="h-9 rounded-xl shrink-0" disabled={!newKategori.trim() || addKategori.isPending}
              onClick={() => addKategori.mutate(newKategori.trim())} data-testid="button-add-kategori">
              <Plus className="w-4 h-4 mr-1" /> Tür Ekle
            </Button>
          </div>
          <Separator />
          <div className="space-y-2">
            {kategoriler.map(kat => {
              const alts = altTurler.filter(a => a.kategoriId === kat.id);
              const isExpanded = expandedKat === kat.id;
              return (
                <div key={kat.id} className="border border-border/50 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedKat(isExpanded ? null : kat.id)}>
                    <span className="flex-1 text-sm font-semibold">{kat.ad}</span>
                    <Badge variant="outline" className="text-[10px] h-5 px-2">{alts.length} alt tür</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'kategori', id: kat.id, name: kat.ad }); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-3 py-2 space-y-2 border-t border-border/30 bg-background">
                          {alts.length === 0 && <p className="text-xs text-muted-foreground py-1">Henüz alt tür eklenmedi.</p>}
                          {alts.map(alt => (
                            <div key={alt.id} className="flex items-center gap-2 group">
                              <span className="flex-1 text-sm pl-1">↳ {alt.ad}</span>
                              <Select
                                value={alt.birim ?? 'adet'}
                                onValueChange={birim => updateAltTurBirim.mutate({ id: alt.id, birim })}
                              >
                                <SelectTrigger className="h-6 w-28 text-xs rounded-lg px-2" data-testid={`select-alt-tur-birim-${alt.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STOK_BIRIMLER.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10"
                                onClick={() => setConfirmDelete({ type: 'alttur', id: alt.id, name: alt.ad })}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <Input placeholder="Yeni alt tür..." value={newAltTur[kat.id] ?? ''} className="h-8 text-sm rounded-lg"
                              onChange={e => setNewAltTur(p => ({ ...p, [kat.id]: e.target.value }))}
                              onKeyDown={e => { const v = newAltTur[kat.id]?.trim(); if (e.key === 'Enter' && v) addAltTur.mutate({ kategoriId: kat.id, ad: v }); }} />
                            <Button size="sm" variant="outline" className="h-8 rounded-lg shrink-0"
                              disabled={!newAltTur[kat.id]?.trim()}
                              onClick={() => { const v = newAltTur[kat.id]?.trim(); if (v) addAltTur.mutate({ kategoriId: kat.id, ad: v }); }}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDelete?.type === 'kategori' ? 'Tür silinsin mi?' : 'Alt tür silinsin mi?'}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDelete?.name}</strong>{' '}
              {confirmDelete?.type === 'kategori' ? 'türü ve tüm alt türleri kalıcı olarak silinecek.' : 'alt türü kalıcı olarak silinecek.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (!confirmDelete) return; if (confirmDelete.type === 'kategori') deleteKategori.mutate(confirmDelete.id); else deleteAltTur.mutate(confirmDelete.id); setConfirmDelete(null); }}>
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ReservationEntry = {
  recordId: number; recordTitle: string; recordStatus: string;
  orderItemId: number; orderItemName: string;
  kullanim: string; totalQuantity: number; totalReserved: number;
  source: 'multi' | 'legacy' | 'recete';
};

type TuketimEntry = {
  logId: number; completedAt: string;
  unitsProcessed: number; kullanim: string; consumed: number;
  orderItemId: number; orderItemName: string;
  recordId: number; recordTitle: string; recordStatus: string;
};

const RECORD_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor', in_progress: 'Üretimde', completed: 'Tamamlandı', cancelled: 'İptal',
};

function RecordStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        : status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
        : status === 'cancelled' ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'
    )}>
      {RECORD_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ─── Lot Kullanım Özeti — proportional bar ────────────────────────────── */
function LotKullanimOzeti({ item, reservations, gecmis, totalTuketim }: {
  item: StokItem;
  reservations: ReservationEntry[] | undefined;
  gecmis: TuketimEntry[] | undefined;
  totalTuketim: number;
}) {
  const rezerve = item.rezerveMiktar ?? 0;
  const serbest = item.miktar - rezerve;
  const activeOrders = Array.isArray(reservations) ? reservations.length : 0;
  if (totalTuketim === 0 && activeOrders === 0) return null;

  const totalAll = item.miktar + totalTuketim;
  const pctConsumed = totalAll > 0 ? (totalTuketim / totalAll) * 100 : 0;
  const pctRezerve = totalAll > 0 ? (rezerve / totalAll) * 100 : 0;
  const pctSerbest = totalAll > 0 ? (serbest / totalAll) * 100 : 0;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
        <TrendingDown className="w-3 h-3" />Lot Kullanım Özeti
        {activeOrders > 0 && (
          <span className="ml-auto text-amber-600 font-semibold">{activeOrders} aktif sipariş</span>
        )}
      </p>
      {/* Proportional bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-border/30">
        {pctConsumed > 0 && (
          <div className="bg-slate-400 dark:bg-slate-500 shrink-0" style={{ width: `${pctConsumed}%` }} />
        )}
        {pctRezerve > 0 && (
          <div className="bg-amber-400 dark:bg-amber-500 shrink-0" style={{ width: `${pctRezerve}%` }} />
        )}
        {pctSerbest > 0 && (
          <div className="bg-green-400 dark:bg-green-500 shrink-0" style={{ width: `${pctSerbest}%` }} />
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {totalTuketim > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 dark:bg-slate-500 shrink-0" />
            <span className="text-muted-foreground">Tüketildi:</span>
            <span className="font-mono font-semibold">{totalTuketim.toLocaleString('tr-TR')} {item.birim}</span>
            <span className="text-muted-foreground/60">({gecmis?.length ?? 0} üretim)</span>
          </span>
        )}
        {rezerve > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 dark:bg-amber-500 shrink-0" />
            <span className="text-muted-foreground">Rezerve:</span>
            <span className="font-mono font-semibold">{rezerve.toLocaleString('tr-TR')} {item.birim}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-400 dark:bg-green-500 shrink-0" />
          <span className="text-muted-foreground">Serbest:</span>
          <span className="font-mono font-semibold">{serbest.toLocaleString('tr-TR')} {item.birim}</span>
        </span>
        {totalTuketim > 0 && (
          <span className="text-muted-foreground/60 ml-auto font-mono">
            Başlangıç: {totalAll.toLocaleString('tr-TR')} {item.birim}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Detail Sheet ───────────────────────────────────────────────────────── */
function StokDetailSheet({ item, open, onClose, isManager, onEdit, onDelete }: {
  item: StokItem | null; open: boolean; onClose: () => void;
  isManager: boolean; onEdit: (i: StokItem) => void; onDelete: (i: StokItem) => void;
}) {
  const [historyTab, setHistoryTab] = useState<'rezervasyonlar' | 'gecmis'>('rezervasyonlar');

  const { data: reservations, isLoading: reservationsLoading } = useQuery<ReservationEntry[]>({
    queryKey: [`/api/stok/${item?.id}/reservations`],
    enabled: open && !!item,
  });

  const { data: gecmis, isLoading: gecmisLoading } = useQuery<TuketimEntry[]>({
    queryKey: [`/api/stok/${item?.id}/gecmis`],
    enabled: open && !!item,
  });

  const { data: nameList = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['/api/users/name-list'],
    enabled: open,
  });
  const userNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of nameList) m.set(u.id, u.name);
    return m;
  }, [nameList]);

  const totalTuketim = useMemo(() =>
    (gecmis ?? []).reduce((s, e) => s + e.consumed, 0), [gecmis]);

  if (!item) return null;
  const critical = isCritical(item);
  const sktExpired = item.sonKullanmaTarihi && new Date(item.sonKullanmaTarihi) < new Date();
  const rezerve = item.rezerveMiktar ?? 0;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="font-display text-lg leading-tight flex items-center gap-2">
                {critical && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                {item.urunAdi}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground">{item.tur}</span>
                {item.altTur && <span className="text-xs text-primary font-medium">↳ {item.altTur}</span>}
                {item.lot && <span className="text-xs font-mono text-muted-foreground">{item.lot}</span>}
              </div>
            </div>
            {isManager && (
              <div className="flex items-center gap-1 shrink-0">
                <Link href={`/etiket/stok-item/${item.id}`}>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5"
                    onClick={() => onClose()} data-testid="button-detail-etiket">
                    <QrCode className="w-3.5 h-3.5" /> Etiket
                  </Button>
                </Link>
                <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5"
                  onClick={() => { onClose(); onEdit(item); }} data-testid="button-detail-edit">
                  <Pencil className="w-3.5 h-3.5" /> Düzenle
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                  onClick={() => { onClose(); onDelete(item); }} data-testid="button-detail-delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="px-5 py-5 space-y-5">
          {item.fotoUrl ? (
            <div className="rounded-xl overflow-hidden border border-border/50 bg-muted/30">
              <img src={item.fotoUrl} alt={item.urunAdi} className="w-full object-contain max-h-72" data-testid="img-stok-detail" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground/40">
              <ImageIcon className="w-8 h-8" /><span className="text-xs">Fotoğraf yok</span>
            </div>
          )}

          {critical && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-xs font-semibold text-destructive">
                Serbest stok kritik! ({serbestMiktar(item)} {item.birim} kaldı, min: {item.kritikStok})
              </span>
            </div>
          )}

          {/* Stok / Rezerve miktarları */}
          <MiktarBadges item={item} size="md" />

          {/* ── Kullanım Özeti — çok üretimde kısmen tüketim görünümü ─── */}
          <LotKullanimOzeti item={item} reservations={reservations} gecmis={gecmis} totalTuketim={totalTuketim} />

          {/* ── Stok Geçmişi & Rezervasyonlar ─────────────────────────── */}
          <Separator />
          <div>
            {/* Tab başlıkları */}
            <div className="flex rounded-xl border border-border overflow-hidden mb-3">
              <button
                type="button"
                onClick={() => setHistoryTab('rezervasyonlar')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors',
                  historyTab === 'rezervasyonlar'
                    ? 'bg-amber-500 text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                )}
                data-testid="tab-rezervasyonlar"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Rezerve Edilmiş Stok
                {rezerve > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                    historyTab === 'rezervasyonlar' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                  )}>
                    {Array.isArray(reservations) ? reservations.length : '…'}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('gecmis')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-l border-border',
                  historyTab === 'gecmis'
                    ? 'bg-violet-600 text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                )}
                data-testid="tab-gecmis"
              >
                <History className="w-3.5 h-3.5" />
                Tüketim Geçmişi
                {Array.isArray(gecmis) && gecmis.length > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                    historyTab === 'gecmis' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
                  )}>
                    {gecmis.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab içerik — Rezervasyonlar */}
            {historyTab === 'rezervasyonlar' && (
              <>
                {reservationsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <Loader2 className="w-3 h-3 animate-spin" /> Yükleniyor...
                  </div>
                ) : !Array.isArray(reservations) || reservations.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">Aktif rezervasyon yok</p>
                    <p className="text-[10px] mt-0.5 opacity-60">Bu stok kalemi henüz hiçbir siparişe rezerve edilmemiş</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reservations.map((r, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5"
                        data-testid={`reservation-row-${r.orderItemId}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                to={`/records/${r.recordId}`}
                                onClick={onClose}
                                className="text-sm font-semibold text-amber-800 dark:text-amber-200 hover:underline truncate"
                                data-testid={`link-reservation-record-${r.recordId}`}
                              >
                                {r.recordTitle}
                              </Link>
                              {r.source === 'recete' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold shrink-0">
                                  Gelen Siparişi
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                              <FlaskConical className="w-3 h-3 shrink-0" />{r.orderItemName}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className="text-sm font-mono font-bold text-amber-700 dark:text-amber-300">
                              {r.totalReserved.toLocaleString('tr-TR')} {item.birim}
                            </span>
                            {r.source !== 'recete' && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {r.totalQuantity} × {Number(r.kullanim).toLocaleString('tr-TR')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <RecordStatusBadge status={r.recordStatus} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground text-right font-mono pt-1">
                      Toplam rezerve: <strong>{reservations.reduce((s, r) => s + r.totalReserved, 0).toLocaleString('tr-TR')} {item.birim}</strong>
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Tab içerik — Tüketim Geçmişi */}
            {historyTab === 'gecmis' && (
              <>
                {gecmisLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <Loader2 className="w-3 h-3 animate-spin" /> Yükleniyor...
                  </div>
                ) : !Array.isArray(gecmis) || gecmis.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">Tüketim kaydı bulunamadı</p>
                    <p className="text-[10px] mt-0.5 opacity-60">Katlama fazı tamamlandığında buraya kaydedilir</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gecmis.map((e, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 px-3 py-2.5"
                        data-testid={`tuketim-row-${e.logId}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/records/${e.recordId}`}
                              onClick={onClose}
                              className="text-sm font-semibold text-violet-800 dark:text-violet-200 hover:underline truncate block"
                              data-testid={`link-tuketim-record-${e.recordId}`}
                            >
                              {e.recordTitle}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                              <FlaskConical className="w-3 h-3 shrink-0" />{e.orderItemName}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {e.completedAt ? format(new Date(e.completedAt), 'dd.MM.yyyy HH:mm', { locale: tr }) : '—'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className="text-sm font-mono font-bold text-violet-700 dark:text-violet-300 flex items-center gap-0.5">
                              <TrendingDown className="w-3.5 h-3.5" />
                              {e.consumed.toLocaleString('tr-TR')} {item.birim}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {e.unitsProcessed} adet × {Number(e.kullanim).toLocaleString('tr-TR')}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <RecordStatusBadge status={e.recordStatus} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground text-right font-mono pt-1">
                      Toplam tüketim: <strong>{totalTuketim.toLocaleString('tr-TR')} {item.birim}</strong>
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <Separator />

          <div className="space-y-3 text-sm">
            <DetailRow icon={<Tag className="w-3.5 h-3.5" />} label="Tür" value={item.tur} />
            {item.altTur && <DetailRow icon={<FolderTree className="w-3.5 h-3.5" />} label="Alt Tür" value={item.altTur} />}
            {item.ureticiFirma && <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label="Üretici Firma" value={item.ureticiFirma} />}
            <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Giriş Tarihi" value={formatDate(item.girisTarihi) ?? '—'} />
            {item.sonKullanmaTarihi && (
              <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Son Kullanma"
                value={formatDate(item.sonKullanmaTarihi) ?? '—'}
                valueClass={sktExpired ? 'text-destructive font-semibold' : ''}
                suffix={sktExpired ? ' — Süresi doldu!' : ''} />
            )}
            {item.lot && <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Lot" value={item.lot} mono />}
            <Separator className="my-1" />
            <DetailRow
              icon={<UserIcon className="w-3.5 h-3.5" />}
              label="Ekleyen"
              value={item.createdBy ? (userNameMap.get(item.createdBy) ?? `#${item.createdBy}`) : '—'}
            />
            {item.createdAt && (
              <DetailRow
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Kayıt Tarihi"
                value={format(new Date(item.createdAt), 'dd MMM yyyy HH:mm', { locale: tr })}
              />
            )}
          </div>

          {item.aciklama && (
            <>
              <Separator />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Açıklama</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{item.aciklama}</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ icon, label, value, mono, valueClass, suffix }: {
  icon: React.ReactNode; label: string; value: string;
  mono?: boolean; valueClass?: string; suffix?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted-foreground shrink-0 min-w-[120px]">{icon}<span className="text-xs">{label}</span></span>
      <span className={cn("text-right text-sm", mono ? "font-mono" : "", valueClass)}>{value}{suffix}</span>
    </div>
  );
}

/* ─── Searchable Tür Combobox ─────────────────────────────────────────── */
function TurCombobox({ value, onChange, kategoriler }: { value: string; onChange: (v: string) => void; kategoriler: StokKategori[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? kategoriler.filter(k => normalizeForSearch(k.ad).includes(normalizeForSearch(search)))
    : kategoriler;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn('w-full justify-between font-normal rounded-md h-9 px-3', !value && 'text-muted-foreground')}
          data-testid="select-tur"
        >
          {value || 'Tür seçin'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Tür ara..."
            value={search}
            onValueChange={setSearch}
            data-testid="input-tur-search"
          />
          <CommandList>
            <CommandEmpty>Sonuç bulunamadı</CommandEmpty>
            <CommandGroup>
              {filtered.map(k => (
                <CommandItem
                  key={k.id}
                  value={k.ad}
                  onSelect={() => { onChange(k.ad); setOpen(false); setSearch(''); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === k.ad ? 'opacity-100' : 'opacity-0')} />
                  {k.ad}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Item Form Modal ────────────────────────────────────────────────────── */
type LotEntry = { lot: string; miktar: string; rezerveMiktar: string };
type LotError = { miktar?: string; rezerveMiktar?: string };

function LotRow({
  entry, index, onChange, onRemove, canRemove, error, birim, onScan,
}: {
  entry: LotEntry; index: number;
  onChange: (idx: number, field: keyof LotEntry, value: string) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean; error?: LotError; birim: string;
  onScan?: (idx: number) => void;
}) {
  const m = Number(entry.miktar) || 0;
  const r = Number(entry.rezerveMiktar) || 0;
  const serbest = m - r;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-start flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1">Lot adı</p>
          <div className="relative">
            <Input
              placeholder={`Lot ${index + 1}`}
              value={entry.lot}
              onChange={e => onChange(index, 'lot', e.target.value)}
              className="rounded-xl text-sm pr-9"
              data-testid={`input-lot-${index}`}
            />
            {onScan && (
              <button
                type="button"
                onClick={() => onScan(index)}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="QR / Barkod tara"
                data-testid={`button-scan-lot-${index}`}
              >
                <ScanLine className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="w-28 shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1">Toplam *</p>
          <Input
            type="text" inputMode="numeric" pattern="[0-9]*"
            placeholder="0"
            value={entry.miktar}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); onChange(index, 'miktar', v); }}
            className={cn('rounded-xl text-sm', error?.miktar && 'border-destructive focus-visible:ring-destructive')}
            data-testid={`input-miktar-lot-${index}`}
          />
          {error?.miktar && <p className="text-[11px] text-destructive mt-0.5">{error.miktar}</p>}
        </div>
        <div className="w-28 shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5 text-amber-500" />Rezerve
          </p>
          <Input
            type="text" inputMode="numeric" pattern="[0-9]*"
            placeholder="0"
            value={entry.rezerveMiktar}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); onChange(index, 'rezerveMiktar', v); }}
            className={cn('rounded-xl text-sm border-amber-300 dark:border-amber-700', error?.rezerveMiktar && 'border-destructive focus-visible:ring-destructive')}
            data-testid={`input-rezerve-lot-${index}`}
          />
          {error?.rezerveMiktar && <p className="text-[11px] text-destructive mt-0.5">{error.rezerveMiktar}</p>}
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="mt-5 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            data-testid={`button-remove-lot-${index}`}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-7 shrink-0" />
        )}
      </div>
      <div className="flex items-center gap-2 text-xs pl-1">
        <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
          <Unlock className="w-3 h-3" />
          <span className="font-mono font-semibold">{serbest < 0 ? 0 : serbest}</span>
          <span className="text-muted-foreground">{birim} serbest</span>
        </span>
        <span className="text-muted-foreground/40">+</span>
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Lock className="w-3 h-3" />
          <span className="font-mono font-semibold">{r}</span>
          <span className="text-muted-foreground">{birim} rezerve</span>
        </span>
        <span className="text-muted-foreground/40">=</span>
        <span className="font-mono font-semibold text-foreground">{m} {birim}</span>
      </div>
    </div>
  );
}

function ItemFormModal({ open, onClose, editItem }: { open: boolean; onClose: () => void; editItem?: StokItem | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!editItem;

  const { data: kategoriler = [] } = useQuery<StokKategori[]>({ queryKey: ['/api/stok-kategoriler'] });
  const { data: allAltTurler = [] } = useQuery<StokAltTur[]>({ queryKey: ['/api/stok-alt-turler'] });

  // Multi-lot state (create mode only)
  const [lots, setLots] = useState<LotEntry[]>([{ lot: '', miktar: '', rezerveMiktar: '' }]);
  const [lotErrors, setLotErrors] = useState<LotError[]>([{}]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanLotIdx, setScanLotIdx] = useState<number | null>(null);

  const makeDefaults = (item?: StokItem | null) => item ? {
    urunAdi: item.urunAdi, lot: item.lot ?? '', aciklama: item.aciklama ?? '',
    fotoUrl: item.fotoUrl ?? '', girisTarihi: item.girisTarihi ?? format(new Date(), 'yyyy-MM-dd'),
    sonKullanmaTarihi: item.sonKullanmaTarihi ?? '', tur: item.tur, altTur: item.altTur ?? '',
    ureticiFirma: item.ureticiFirma ?? '', birim: (item.birim as any) ?? 'adet',
    miktar: item.miktar, rezerveMiktar: item.rezerveMiktar ?? 0,
    kritikStok: item.kritikStok, stokDurumu: (item.stokDurumu as any) ?? 'stok',
  } : {
    urunAdi: '', lot: '', aciklama: '', fotoUrl: '', girisTarihi: format(new Date(), 'yyyy-MM-dd'),
    sonKullanmaTarihi: '', tur: '', altTur: '', ureticiFirma: '',
    birim: 'adet', miktar: undefined as any, rezerveMiktar: undefined as any, kritikStok: undefined as any, stokDurumu: 'stok',
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: makeDefaults(editItem),
  });

  useEffect(() => {
    if (open) {
      form.reset(makeDefaults(editItem));
      if (!isEdit) {
        setLots([{ lot: '', miktar: '', rezerveMiktar: '' }]);
        setLotErrors([{}]);
      }
    }
  }, [open, editItem?.id]);

  const selectedTur = form.watch('tur');
  const selectedAltTurName = form.watch('altTur');
  const birim = form.watch('birim') || '';
  const selectedKat = kategoriler.find(k => k.ad === selectedTur);
  const availableAltTurler = selectedKat ? allAltTurler.filter(a => a.kategoriId === selectedKat.id) : [];
  const selectedAltTurDef = availableAltTurler.find(a => a.ad === selectedAltTurName);

  // Edit mode mutation (unchanged)
  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        sonKullanmaTarihi: data.sonKullanmaTarihi || null,
        lot: data.lot || null, aciklama: data.aciklama || null,
        fotoUrl: data.fotoUrl || null, ureticiFirma: data.ureticiFirma || null,
        altTur: data.altTur && data.altTur !== '_none' ? data.altTur : null,
      };
      return apiRequest('PATCH', `/api/stok/${editItem!.id}`, payload).then(r => r.json());
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/stok'] }); toast({ title: 'Güncellendi' }); onClose(); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message || 'İşlem başarısız', variant: 'destructive' }),
  });

  // Lot helpers
  const updateLot = (idx: number, field: keyof LotEntry, value: string) => {
    setLots(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });
    if (field === 'miktar' || field === 'rezerveMiktar') {
      setLotErrors(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: undefined }; return n; });
    }
  };
  const removeLot = (idx: number) => {
    setLots(prev => prev.filter((_, i) => i !== idx));
    setLotErrors(prev => prev.filter((_, i) => i !== idx));
  };
  const addLot = () => {
    setLots(prev => [...prev, { lot: '', miktar: '', rezerveMiktar: '' }]);
    setLotErrors(prev => [...prev, {}]);
  };

  // Create mode submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isFormValid = await form.trigger(['urunAdi', 'tur', 'girisTarihi', 'birim']);
    if (!isFormValid) return;

    // Tamamen boş satırları atla (lot ve miktar ikisi de boşsa)
    const activeLots = lots.filter(l => l.lot.trim() !== '' || l.miktar !== '');
    const lotsToSubmit = activeLots.length > 0 ? activeLots : lots;

    const newErrors: LotError[] = lotsToSubmit.map(lot => {
      const err: LotError = {};
      const m = lot.miktar === '' ? NaN : Number(lot.miktar);
      if (isNaN(m) || m < 0) err.miktar = 'Miktar gerekli';
      const r = Number(lot.rezerveMiktar) || 0;
      if (!isNaN(m) && r > m) err.rezerveMiktar = 'Toplam miktarı geçemez';
      return err;
    });

    if (newErrors.some(e => e.miktar || e.rezerveMiktar)) {
      setLotErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    const fd = form.getValues();
    const base = {
      urunAdi: fd.urunAdi, tur: fd.tur,
      altTur: fd.altTur && fd.altTur !== '_none' ? fd.altTur : null,
      ureticiFirma: fd.ureticiFirma || null,
      girisTarihi: fd.girisTarihi,
      sonKullanmaTarihi: fd.sonKullanmaTarihi || null,
      birim: fd.birim, kritikStok: Number(fd.kritikStok) || 0,
      aciklama: fd.aciklama || null, fotoUrl: fd.fotoUrl || null,
      stokDurumu: fd.stokDurumu || 'stok',
    };

    let ok = 0; let fail = 0;
    for (const lot of lotsToSubmit) {
      try {
        await apiRequest('POST', '/api/stok', {
          ...base, lot: lot.lot || null,
          miktar: Number(lot.miktar), rezerveMiktar: Number(lot.rezerveMiktar) || 0,
        }).then(r => r.json());
        ok++;
      } catch { fail++; }
    }

    queryClient.invalidateQueries({ queryKey: ['/api/stok'] });
    toast({
      title: fail === 0 ? (lotsToSubmit.length > 1 ? `${ok} lot başarıyla eklendi` : 'Eklendi') : `${ok} lot eklendi, ${fail} hata`,
      variant: fail > 0 ? 'destructive' : 'default',
    });
    setIsSubmitting(false);
    // Sadece tam başarıda kapat; kısmi hata varsa modal açık kalır
    if (fail === 0) onClose();
  };

  const isPending = isEdit ? mutation.isPending : isSubmitting;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {isEdit ? 'Stok Kalemini Düzenle' : 'Yeni Stok Kalemi Ekle'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={isEdit ? form.handleSubmit(d => mutation.mutate(d)) : handleCreateSubmit} className="space-y-4">
            {/* Ürün adı — full width in create, half grid in edit */}
            {isEdit ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="urunAdi" render={({ field }) => (
                  <FormItem><FormLabel>Ürün Adı *</FormLabel><FormControl><Input {...field} placeholder="Ürün adı" data-testid="input-urun-adi" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="lot" render={({ field }) => (
                  <FormItem><FormLabel>Ürün Lotu</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Lot numarası" data-testid="input-lot" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            ) : (
              <FormField control={form.control} name="urunAdi" render={({ field }) => (
                <FormItem><FormLabel>Ürün Adı *</FormLabel><FormControl><Input {...field} placeholder="Ürün adı" data-testid="input-urun-adi" /></FormControl><FormMessage /></FormItem>
              )} />
            )}

            {/* Tür + Alt Tür */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="tur" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tür *</FormLabel>
                  <FormControl>
                    <TurCombobox
                      value={field.value}
                      onChange={v => { field.onChange(v); form.setValue('altTur', ''); }}
                      kategoriler={kategoriler}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="altTur" render={({ field }) => (
                <FormItem>
                  <FormLabel>Alt Tür</FormLabel>
                  <Select
                    onValueChange={v => {
                      field.onChange(v);
                      const def = availableAltTurler.find(a => a.ad === v);
                      if (def?.birim) form.setValue('birim', def.birim as any);
                    }}
                    value={field.value ?? ''}
                    disabled={availableAltTurler.length === 0}
                  >
                    <FormControl><SelectTrigger data-testid="select-alt-tur"><SelectValue placeholder={availableAltTurler.length === 0 ? 'Önce tür seçin' : 'Alt tür (isteğe bağlı)'} /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="_none">— Alt tür yok —</SelectItem>
                      {availableAltTurler.map(a => (
                        <SelectItem key={a.id} value={a.ad}>
                          {a.ad} <span className="text-muted-foreground ml-1">({a.birim ?? 'adet'})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Firma + Giriş + SKT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="ureticiFirma" render={({ field }) => (
                <FormItem><FormLabel>Üretici Firma</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Firma" data-testid="input-uretici-firma" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="girisTarihi" render={({ field }) => (
                <FormItem><FormLabel>Giriş Tarihi *</FormLabel><FormControl><Input type="date" {...field} data-testid="input-giris-tarihi" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="sonKullanmaTarihi" render={({ field }) => (
                <FormItem><FormLabel>Son Kullanma</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} data-testid="input-skt" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            {/* CREATE MODE: Multi-lot section */}
            {!isEdit && (
              <div className="rounded-xl border border-border/50 p-4 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Hash className="w-3 h-3" /> Lotlar &amp; Miktar
                  </p>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="h-7 text-xs gap-1.5 rounded-lg"
                    onClick={addLot}
                    data-testid="button-add-lot"
                  >
                    <Plus className="w-3 h-3" /> Lot Ekle
                  </Button>
                </div>
                <div className="space-y-4">
                  {lots.map((entry, idx) => (
                    <div key={idx}>
                      {idx > 0 && <Separator className="mb-3" />}
                      <LotRow
                        entry={entry} index={idx}
                        onChange={updateLot} onRemove={removeLot}
                        canRemove={lots.length > 1}
                        error={lotErrors[idx]}
                        birim={birim}
                        onScan={(i) => setScanLotIdx(i)}
                      />
                    </div>
                  ))}
                </div>
                {/* Shared Birim + Kritik */}
                <Separator />
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <FormField control={form.control} name="birim" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        Birim *
                        {selectedAltTurDef && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!!selectedAltTurDef}>
                        <FormControl><SelectTrigger data-testid="select-birim"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{STOK_BIRIMLER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      {selectedAltTurDef && <p className="text-[10px] text-muted-foreground">Alt türden alındı</p>}
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="kritikStok" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kritik Min.</FormLabel>
                      <FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*"
                        value={field.value == null || field.value === (undefined as any) ? '' : field.value}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); field.onChange(v === '' ? undefined as any : Number(v)); }}
                        data-testid="input-kritik-stok" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            )}

            {/* EDIT MODE: Original Miktar section */}
            {isEdit && (
              <div className="rounded-xl border border-border/50 p-4 space-y-3 bg-muted/10">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Miktar</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <FormField control={form.control} name="birim" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        Birim *
                        {selectedAltTurDef && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!!selectedAltTurDef}>
                        <FormControl><SelectTrigger data-testid="select-birim"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{STOK_BIRIMLER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      {selectedAltTurDef && <p className="text-[10px] text-muted-foreground">Alt türden alındı</p>}
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="miktar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Toplam *</FormLabel>
                      <FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*"
                        value={field.value == null || field.value === (undefined as any) ? '' : field.value}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); field.onChange(v === '' ? undefined as any : Number(v)); }}
                        data-testid="input-miktar" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="rezerveMiktar" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-amber-500" /><span>Rezerve</span></FormLabel>
                      <FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*"
                        value={field.value == null || field.value === (undefined as any) ? '' : field.value}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); field.onChange(v === '' ? undefined as any : Number(v)); }}
                        data-testid="input-rezerve-miktar" className="border-amber-300 dark:border-amber-700" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="kritikStok" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kritik Min.</FormLabel>
                      <FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*"
                        value={field.value == null || field.value === (undefined as any) ? '' : field.value}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); field.onChange(v === '' ? undefined as any : Number(v)); }}
                        data-testid="input-kritik-stok" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {(() => {
                  const total = form.watch('miktar') || 0;
                  const rezerve = form.watch('rezerveMiktar') || 0;
                  const serbest = total - rezerve;
                  return (
                    <div className="flex items-center gap-3 text-sm pt-1">
                      <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                        <Unlock className="w-3.5 h-3.5" />
                        <span className="font-mono font-bold">{serbest < 0 ? 0 : serbest}</span>
                        <span className="text-muted-foreground text-xs">{birim} serbest</span>
                      </span>
                      <span className="text-muted-foreground/40">+</span>
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="font-mono font-bold">{rezerve}</span>
                        <span className="text-muted-foreground text-xs">{birim} rezerve</span>
                      </span>
                      <span className="text-muted-foreground/40">=</span>
                      <span className="font-mono font-bold text-foreground">{total} {birim} toplam</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Açıklama + Foto */}
            <FormField control={form.control} name="aciklama" render={({ field }) => (
              <FormItem><FormLabel>Açıklama</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} rows={2} data-testid="input-aciklama" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="fotoUrl" render={({ field }) => (
              <FormItem><FormLabel>Fotoğraf URL</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="https://..." data-testid="input-foto-url" /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-stok">İptal</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-stok">
                {isPending ? 'Kaydediliyor...' : isEdit ? 'Güncelle' : (lots.length > 1 ? `${lots.length} Lot Ekle` : 'Ekle')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
      <BarcodeScanner
        open={scanLotIdx !== null}
        onClose={() => setScanLotIdx(null)}
        onScan={(code: string, _kaynak: BarkodKaynak) => {
          if (scanLotIdx !== null) {
            updateLot(scanLotIdx, 'lot', code.trim());
          }
          setScanLotIdx(null);
          return true;
        }}
        title="Lot QR / Barkod Tara"
        subtitle="Lot etiketini kameraya gösterin veya elle girin."
      />
    </Dialog>
  );
}

/* ─── Alt Tür Grup Kritik Stok Düzenleme Dialogu ─────────────────────────── */
function AltTurGrupDuzenleDialog({ altTur, open, onClose }: {
  altTur: StokAltTur | null; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [kritikStok, setKritikStok] = useState('');
  const [birim, setBirim] = useState<string>('adet');

  useEffect(() => {
    if (altTur) {
      setKritikStok(String(altTur.kritikStok ?? 0));
      setBirim(altTur.birim ?? 'adet');
    }
  }, [altTur]);

  const mutation = useMutation({
    mutationFn: ({ kritikStok, birim }: { kritikStok: number; birim: string }) =>
      apiRequest('PATCH', `/api/stok-alt-turler/${altTur!.id}`, { kritikStok, birim }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stok-alt-turler'] });
      toast({ title: 'Alt tür güncellendi' });
      onClose();
    },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  if (!altTur) return null;
  const val = Number(kritikStok) || 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Alt Tür Ayarları — {altTur.ad}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Birim</label>
            <Select value={birim} onValueChange={setBirim}>
              <SelectTrigger className="rounded-xl" data-testid="select-alt-tur-birim-dialog">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOK_BIRIMLER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Bu alt türe ait tüm stok kalemleri bu birimi kullanır.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kritik Stok Eşiği ({birim})</label>
            <Input
              type="number" min="0"
              value={kritikStok}
              onChange={e => setKritikStok(e.target.value)}
              placeholder="Örn: 500"
              className="rounded-xl"
              data-testid="input-kritik-stok-esigi"
            />
            <p className="text-xs text-muted-foreground">
              Serbest stoğu belirlenen eşiğin altına düştüğünde tedarik uyarısı gösterilir. <strong>0</strong> bırakırsanız uyarı kapatılır.
            </p>
          </div>
          {val > 0 && (
            <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>Serbest stok <strong>{val.toLocaleString('tr-TR')} {birim}</strong>'ın altına düştüğünde uyarı gösterilecek. %30 yaklaşımında ise "Azalıyor" uyarısı belirir.</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>İptal</Button>
          <Button onClick={() => mutation.mutate({ kritikStok: val, birim })} disabled={mutation.isPending} data-testid="button-save-kritik-stok">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Alt Tür Grup Satırı ─────────────────────────────────────────────────── */
function StokAltTurGroupRow({
  altTur, lots, isManager, expanded, altTurDef, onToggle, onSelect, onEdit, onDelete, onEditGroup,
}: {
  altTur: string; lots: StokItem[]; isManager: boolean; expanded: boolean;
  altTurDef?: StokAltTur;
  onToggle: () => void;
  onSelect: (i: StokItem) => void; onEdit: (i: StokItem) => void; onDelete: (i: StokItem) => void;
  onEditGroup?: () => void;
}) {
  const totalMiktar = lots.reduce((s, l) => s + l.miktar, 0);
  const totalRezeve = lots.reduce((s, l) => s + (l.rezerveMiktar ?? 0), 0);
  const totalSerbest = totalMiktar - totalRezeve;
  const birim = altTurDef?.birim ?? lots[0]?.birim ?? 'adet';
  const hasCritical = lots.some(isCritical);
  const oldestDate = lots.reduce<string | null>((oldest, l) => {
    if (!l.girisTarihi) return oldest;
    if (!oldest) return l.girisTarihi;
    return l.girisTarihi < oldest ? l.girisTarihi : oldest;
  }, null);

  const grupKritik = altTurDef && altTurDef.kritikStok > 0;
  const grupKritikAlti = grupKritik && totalSerbest <= altTurDef!.kritikStok;
  const grupKritikYaklasiyor = grupKritik && !grupKritikAlti && totalSerbest <= altTurDef!.kritikStok * 1.3;

  return (
    <>
      <tr
        className={cn(
          "border-b border-primary/20 bg-primary/5 dark:bg-primary/10 cursor-pointer hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors",
          grupKritikAlti ? "bg-destructive/8 dark:bg-destructive/15 border-destructive/20"
            : grupKritikYaklasiyor ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/30"
            : hasCritical ? "bg-destructive/5"
            : "",
        )}
        onClick={onToggle}
        data-testid={`row-alt-tur-group-${altTur}`}
      >
        <td className="px-3 py-2.5" colSpan={1}>
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-semibold text-sm text-primary">{altTur}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 rounded-full ml-1">
              {lots.length} lot
            </Badge>
            {grupKritikAlti && (
              <Badge className="text-[10px] h-4 px-1.5 rounded-full ml-0.5 bg-destructive text-destructive-foreground gap-0.5">
                <ShieldAlert className="w-2.5 h-2.5" /> Kritik!
              </Badge>
            )}
            {grupKritikYaklasiyor && (
              <Badge className="text-[10px] h-4 px-1.5 rounded-full ml-0.5 bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> Azalıyor
              </Badge>
            )}
            {!grupKritikAlti && !grupKritikYaklasiyor && hasCritical && (
              <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1"><FolderTree className="w-3 h-3 shrink-0" />Alt Tür Grubu</span>
            {grupKritik && (
              <span className="flex items-center gap-1 text-[10px]">
                <ShieldAlert className={cn("w-2.5 h-2.5", grupKritikAlti ? "text-destructive" : "text-amber-500")} />
                <span className={cn(grupKritikAlti ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
                  Kritik Stok: {altTurDef!.kritikStok.toLocaleString('tr-TR')} {birim}
                </span>
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
          {oldestDate && (
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />FIFO: {formatDate(oldestDate)}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex flex-col items-end gap-0.5">
            <span className={cn(
              "text-sm font-bold",
              grupKritikAlti ? 'text-destructive'
                : grupKritikYaklasiyor ? 'text-amber-600 dark:text-amber-400'
                : totalSerbest <= 0 ? 'text-destructive'
                : 'text-green-700 dark:text-green-400'
            )}>
              {totalSerbest.toLocaleString('tr-TR')} <span className="text-xs font-normal text-muted-foreground">{birim}</span>
            </span>
            {totalRezeve > 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                <Lock className="w-2.5 h-2.5 inline mr-0.5" />{totalRezeve.toLocaleString('tr-TR')} rezerve
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          {grupKritikAlti ? (
            <Badge className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 whitespace-nowrap gap-1">
              <ShieldAlert className="w-2.5 h-2.5" /> Tedarik Gerekli
            </Badge>
          ) : grupKritikYaklasiyor ? (
            <Badge className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> Stok Azalıyor
            </Badge>
          ) : totalRezeve > 0 ? (
            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
              <Lock className="w-2.5 h-2.5 mr-1" /> Kısmen Rezerveli
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">
              <Unlock className="w-2.5 h-2.5 mr-1" /> Serbest
            </Badge>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex justify-end items-center gap-1">
            {isManager && (
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={e => { e.stopPropagation(); onEditGroup?.(); }}
                title="Kritik stok eşiği düzenle"
                data-testid={`button-edit-group-${altTur}`}
              >
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-primary">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </td>
      </tr>
      {expanded && lots.map(lot => (
        <StokRow
          key={lot.id}
          item={lot}
          isManager={isManager}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          indented
        />
      ))}
    </>
  );
}

function StokRow({ item, isManager, onSelect, onEdit, onDelete, indented = false }: {
  item: StokItem; isManager: boolean; indented?: boolean;
  onSelect: (i: StokItem) => void; onEdit: (i: StokItem) => void; onDelete: (i: StokItem) => void;
}) {
  const critical = isCritical(item);
  const rezerve = item.rezerveMiktar ?? 0;

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cn("border-b border-border/40 group transition-colors hover:bg-muted/10 cursor-pointer",
        critical && "bg-destructive/5",
        indented && "bg-muted/5 dark:bg-muted/5"
      )}
      onClick={() => onSelect(item)} data-testid={`row-stok-${item.id}`}
    >
      {/* Ürün adı */}
      <td className="py-3 min-w-[180px]" style={{ paddingLeft: indented ? '2rem' : '0.75rem', paddingRight: '0.75rem' }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {indented && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            {critical && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
            <span className="font-medium text-sm leading-tight">{item.urunAdi}</span>
          </div>
          {item.lot && <span className="text-[10px] font-mono text-muted-foreground" style={{ paddingLeft: indented ? '1rem' : '0' }}>{item.lot}</span>}
          {item.ureticiFirma && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Building2 className="w-2.5 h-2.5 shrink-0" />{item.ureticiFirma}
            </span>
          )}
        </div>
      </td>

      {/* Tür + Alt Tür */}
      <td className="px-3 py-3 text-xs text-muted-foreground">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1"><Tag className="w-3 h-3 shrink-0" />{item.tur}</span>
          {item.altTur && <span className="text-[10px] text-primary pl-4">↳ {item.altTur}</span>}
        </div>
      </td>

      {/* Tarihler */}
      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(item.girisTarihi) ?? '—'}</span>
          {item.sonKullanmaTarihi && (
            <span className={cn("text-[10px]", new Date(item.sonKullanmaTarihi) < new Date() ? "text-destructive font-semibold" : "text-muted-foreground")}>
              SKT: {formatDate(item.sonKullanmaTarihi)}
            </span>
          )}
        </div>
      </td>

      {/* Miktar split */}
      <td className="px-3 py-3 text-right">
        <MiktarBadges item={item} size="sm" />
      </td>

      {/* Rezerve badge */}
      <td className="px-3 py-3">
        {rezerve > 0 ? (
          <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
            <Lock className="w-2.5 h-2.5 mr-1" /> Rezerveli
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">
            <Unlock className="w-2.5 h-2.5 mr-1" /> Serbest
          </Badge>
        )}
      </td>

      {/* Aksiyonlar */}
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          {isManager && (
            <>
              <Link href={`/etiket/stok-item/${item.id}`}>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()} data-testid={`button-etiket-stok-${item.id}`} title="QR etiket yazdır">
                  <QrCode className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); onEdit(item); }} data-testid={`button-edit-stok-${item.id}`}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); onDelete(item); }} data-testid={`button-delete-stok-${item.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
        </div>
      </td>
    </motion.tr>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function StokPage() {
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes(user?.role ?? '');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterTur, setFilterTur] = useState<string>('');
  const [filterRezeve, setFilterRezeve] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<StokItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<StokItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<StokItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [kategoriMgmtOpen, setKategoriMgmtOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [ayriKalemlerExpanded, setAyriKalemlerExpanded] = useState(true);
  const [editAltTurGroup, setEditAltTurGroup] = useState<StokAltTur | null>(null);
  const [altTurGroupDialogOpen, setAltTurGroupDialogOpen] = useState(false);

  const { data: kategoriler = [] } = useQuery<StokKategori[]>({ queryKey: ['/api/stok-kategoriler'] });
  const { data: altTurler = [] } = useQuery<StokAltTur[]>({ queryKey: ['/api/stok-alt-turler'] });
  const altTurDefMap = useMemo(() => {
    const map: Record<string, StokAltTur> = {};
    for (const at of altTurler) map[at.ad] = at;
    return map;
  }, [altTurler]);

  const { data: items = [], isLoading } = useQuery<StokItem[]>({
    queryKey: ['/api/stok', filterTur],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterTur) params.set('tur', filterTur);
      return fetch(`/api/stok?${params}`, { credentials: 'include' }).then(r => r.json());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/stok/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/stok'] }); toast({ title: 'Stok kalemi silindi' }); setDeleteItem(null); },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  const filtered = items.filter(item => {
    const q = normalizeForSearch(search);
    if (q && !(
      normalizeForSearch(item.urunAdi).includes(q) ||
      normalizeForSearch(item.lot).includes(q) ||
      normalizeForSearch(item.ureticiFirma).includes(q) ||
      normalizeForSearch(item.tur).includes(q) ||
      normalizeForSearch(item.altTur).includes(q)
    )) return false;
    if (filterRezeve === 'rezerveli' && (item.rezerveMiktar ?? 0) === 0) return false;
    if (filterRezeve === 'serbest' && (item.rezerveMiktar ?? 0) > 0) return false;
    return true;
  });

  const criticalCount = filtered.filter(isCritical).length;

  // Alt tür gruplandırma
  const { altTurGroups, ungroupedItems } = useMemo(() => {
    const groups: Record<string, StokItem[]> = {};
    const ungrouped: StokItem[] = [];

    // Seçili bir tür varsa, o türün tüm alt türlerini boş olsa bile ekle
    if (filterTur) {
      const selectedKat = kategoriler.find(k => k.ad === filterTur);
      if (selectedKat) {
        const turAltTurler = altTurler.filter(at => at.kategoriId === selectedKat.id);
        for (const at of turAltTurler) {
          groups[at.ad] = [];
        }
      }
    }

    for (const item of filtered) {
      if (item.altTur) {
        if (!groups[item.altTur]) groups[item.altTur] = [];
        groups[item.altTur].push(item);
      } else {
        ungrouped.push(item);
      }
    }
    return { altTurGroups: groups, ungroupedItems: ungrouped };
  }, [filtered, filterTur, kategoriler, altTurler]);

  const criticalGroupCount = useMemo(() => {
    return Object.entries(altTurGroups).filter(([at, lots]) => {
      const def = altTurDefMap[at];
      if (!def || def.kritikStok === 0) return false;
      const serbest = lots.reduce((s, l) => s + l.miktar - (l.rezerveMiktar ?? 0), 0);
      return serbest <= def.kritikStok;
    }).length;
  }, [altTurGroups, altTurDefMap]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-primary" /> Stok
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Hammadde ve malzeme envanteri</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5"
              onClick={() => setKategoriMgmtOpen(true)} data-testid="button-manage-kategoriler">
              <Settings2 className="w-4 h-4" /> Türleri Yönet
            </Button>
          )}
          {isManager && (
            <Button onClick={() => { setEditItem(null); setModalOpen(true); }} data-testid="button-add-stok">
              <Plus className="w-4 h-4 mr-2" /> Yeni Ekle
            </Button>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {criticalGroupCount > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3" data-testid="banner-critical-group">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">{criticalGroupCount} alt tür grubunda serbest stok kritik eşiğin altında!</p>
              <p className="text-xs text-destructive/80 mt-0.5">Ürün tedariki için ilgili grupları inceleyin.</p>
            </div>
          </motion.div>
        )}
        {criticalGroupCount === 0 && criticalCount > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3" data-testid="banner-critical-stok">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <span className="text-sm font-medium text-destructive">{criticalCount} kalemde serbest stok kritik seviyede!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9 rounded-xl" placeholder="Ürün, lot, alt tür ara..."
            value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-stok" />
        </div>

        <Select value={filterTur || 'all'} onValueChange={v => setFilterTur(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 rounded-xl w-[200px]" data-testid="select-filter-tur">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Tüm Türler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Türler</SelectItem>
            {kategoriler.map(k => <SelectItem key={k.id} value={k.ad}>{k.ad}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterRezeve || 'all'} onValueChange={v => setFilterRezeve(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 rounded-xl w-[150px]" data-testid="select-filter-rezerve">
            <SelectValue placeholder="Tüm Kalemler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Kalemler</SelectItem>
            <SelectItem value="rezerveli">Rezerveli</SelectItem>
            <SelectItem value="serbest">Tam Serbest</SelectItem>
          </SelectContent>
        </Select>

        {(filterTur || filterRezeve || search) && (
          <Button variant="ghost" size="sm" className="h-9 rounded-xl text-muted-foreground"
            onClick={() => { setFilterTur(''); setFilterRezeve(''); setSearch(''); }} data-testid="button-clear-filters">
            <X className="w-3.5 h-3.5 mr-1" /> Temizle
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {Object.keys(altTurGroups).length > 0
            ? `${Object.keys(altTurGroups).length} grup · ${ungroupedItems.length} ayrı kalem`
            : `${filtered.length} kalem`}
        </span>
      </div>

      {/* Table */}
      <Card className="glass-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[11px] text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-3 py-2.5">Ürün / Lot</th>
                <th className="px-3 py-2.5">Tür / Alt Tür</th>
                <th className="px-3 py-2.5 hidden md:table-cell">Tarih</th>
                <th className="px-3 py-2.5 text-right">Miktar</th>
                <th className="px-3 py-2.5">Durum</th>
                <th className="px-3 py-2.5 w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground text-sm">Yükleniyor...</td></tr>}
              {!isLoading && filtered.length === 0 && Object.keys(altTurGroups).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Warehouse className="w-10 h-10 opacity-30" />
                      <span className="text-sm">{search || filterTur || filterRezeve ? 'Filtrelerle eşleşen kalem bulunamadı.' : 'Henüz stok kalemi eklenmedi.'}</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && Object.entries(altTurGroups).map(([altTur, lots]) => (
                <StokAltTurGroupRow
                  key={`group-${altTur}`}
                  altTur={altTur}
                  lots={lots}
                  isManager={isManager}
                  expanded={search.trim().length > 0 ? lots.length > 0 : expandedGroups.has(altTur)}
                  altTurDef={altTurDefMap[altTur]}
                  onToggle={() => setExpandedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(altTur)) next.delete(altTur); else next.add(altTur);
                    return next;
                  })}
                  onSelect={i => { setSelectedItem(i); setDetailOpen(true); }}
                  onEdit={i => { setEditItem(i); setModalOpen(true); }}
                  onDelete={setDeleteItem}
                  onEditGroup={() => {
                    const def = altTurDefMap[altTur];
                    if (def) {
                      setEditAltTurGroup(def);
                      setAltTurGroupDialogOpen(true);
                    }
                  }}
                />
              ))}
              {!isLoading && ungroupedItems.length > 0 && (
                <>
                  <tr
                    className="border-b border-border/30 bg-muted/20 dark:bg-muted/10 cursor-pointer hover:bg-muted/30 dark:hover:bg-muted/20 transition-colors"
                    onClick={() => setAyriKalemlerExpanded(p => !p)}
                    data-testid="row-ayri-kalemler-group"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm text-muted-foreground">Ayrı Kalemler</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 rounded-full ml-1 text-muted-foreground">
                          {ungroupedItems.length} kalem
                        </Badge>
                        {ungroupedItems.some(isCritical) && (
                          <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3 shrink-0" />Gruplandırılmamış
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell" />
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-xs text-muted-foreground">
                        {ungroupedItems.reduce((s, l) => s + l.miktar - (l.rezerveMiktar ?? 0), 0).toLocaleString('tr-TR')} serbest
                      </span>
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground">
                          {ayriKalemlerExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {ayriKalemlerExpanded && ungroupedItems.map(item => (
                    <StokRow key={item.id} item={item} isManager={isManager}
                      onSelect={i => { setSelectedItem(i); setDetailOpen(true); }}
                      onEdit={i => { setEditItem(i); setModalOpen(true); }}
                      onDelete={setDeleteItem}
                      indented
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <StokDetailSheet item={selectedItem} open={detailOpen} onClose={() => setDetailOpen(false)}
        isManager={isManager} onEdit={i => { setEditItem(i); setModalOpen(true); }} onDelete={setDeleteItem} />
      <ItemFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} editItem={editItem} />
      <KategoriYonetimModal open={kategoriMgmtOpen} onClose={() => setKategoriMgmtOpen(false)} />
      <AltTurGrupDuzenleDialog
        altTur={editAltTurGroup}
        open={altTurGroupDialogOpen}
        onClose={() => { setAltTurGroupDialogOpen(false); setEditAltTurGroup(null); }}
      />

      <AlertDialog open={!!deleteItem} onOpenChange={v => !v && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stok kalemi silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteItem?.urunAdi}</strong> kalıcı olarak silinecek.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">İptal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} data-testid="button-confirm-delete">Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
