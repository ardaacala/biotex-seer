import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeftRight, Search, Package, Loader2, Truck,
  Camera, Check, X, Undo2, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, AlertTriangle,
  Warehouse, Share2, TrendingUp, TrendingDown, MessageSquareWarning, ShieldCheck, Trash2,
  PlayCircle, Clock, CalendarDays, FileSpreadsheet, ScanLine, QrCode, Lock, Unlock,
} from 'lucide-react';
import { BarcodeScanner, barkodEslesir, type BarkodKaynak } from '@/components/barcode-scanner';
import { Switch } from '@/components/ui/switch';
import * as XLSX from 'xlsx';
import { Link } from 'wouter';
import { cn, normalizeForSearch } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type DepoHareket = {
  id: number;
  stokId: number;
  urunAdi: string;
  lot: string | null;
  birim: string;
  rezervedMiktar: number;
  kaynak: string;
  kaynakId: number;
  siparisId: number;
  siparisTitle: string;
  siparisLot: string | null;
  tasindi: boolean;
  tasindiMiktar: number | null;
  tasindiAt: string | null;
  tasindiBy: number | null;
  tasindiByUsername: string | null;
  tasindiPhoto: string | null;
  tasindiAciklama: string | null;
  barkodDogrulandi?: boolean;
  barkodKaynak?: string | null;
  createdAt: string | null;
  stokMiktar: number | null;
};

type StokAnomali = {
  id: number;
  depoHareketId: number;
  tur: 'fazla' | 'eksik';
  beklenenMiktar: string;
  gercekMiktar: string;
  fark: string;
  birim: string;
  aciklama: string;
  fotograf: string | null;
  reportedBy: number;
  reportedByUsername: string;
  createdAt: string | null;
  resolved: boolean;
  resolvedBy: number | null;
  resolvedByUsername: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  stokAdi: string;
  lot: string | null;
  siparisId: number;
  siparisTitle: string;
  ekStokDusumler: Array<{ stokItemId: number; lot: string | null; urunAdi: string; miktar: number }>;
  autoDusuldu: boolean;
  bekleyenMiktar?: string | null;
  bekleyenUrunAdi?: string | null;
  bekleyenBirim?: string | null;
};

type AlternateLot = { stokItemId: number; lot: string | null; urunAdi: string; birim: string; miktar: number };

/* ─── Computed helpers ──────────────────────────────────────────────────── */
const kalan = (r: DepoHareket) => r.rezervedMiktar - (r.tasindiMiktar ?? 0);
const tasinmisMiktar = (r: DepoHareket) => r.tasindiMiktar ?? 0;

/* ─── Anomali Bildirim Dialog ────────────────────────────────────────────── */
function AnomalyReportDialog({
  lot, open, onOpenChange,
}: {
  lot: DepoHareket | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tur, setTur] = useState<'fazla' | 'eksik'>('fazla');
  const [gercekMiktar, setGercekMiktar] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [fotograf, setFotograf] = useState<string | null>(null);
  const [extraLots, setExtraLots] = useState<Array<{ stokItemId: number; miktar: string }>>([]);
  const [needsExtraSelection, setNeedsExtraSelection] = useState(false);

  const beklenen = lot?.tasindiMiktar ?? 0;

  // Aynı ürün/birim için aday lotları çek (fazla için)
  const { data: lotInfo } = useQuery<{ sameLot: AlternateLot | null; alternatives: AlternateLot[] }>({
    queryKey: ['/api/stok-anomalileri/alternate-lots', lot?.id],
    queryFn: () => fetch(`/api/stok-anomalileri/alternate-lots/${lot!.id}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!lot && open,
  });

  const reset = () => {
    setTur('fazla');
    setGercekMiktar('');
    setAciklama('');
    setFotograf(null);
    setExtraLots([]);
    setNeedsExtraSelection(false);
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('POST', '/api/stok-anomalileri', payload),
    onSuccess: async (res: any) => {
      const json = await res.json().catch(() => ({}));
      qc.invalidateQueries({ queryKey: ['/api/stok-anomalileri'] });
      qc.invalidateQueries({ queryKey: ['/api/depo-hareketleri'] });
      qc.invalidateQueries({ queryKey: ['/api/stok-items'] });
      if (json?.criticalWarning) {
        toast({
          title: 'KRİTİK: Stok Yetersiz',
          description: `${json.bekleyenMiktar} ${lot?.birim} için stok girişi bekleniyor.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Bildirim oluşturuldu', description: 'Yöneticiler bilgilendirildi' });
      }
      reset();
      onOpenChange(false);
    },
    onError: (err: any) => {
      // apiRequest hata mesajı: "400: {json}" formatında
      let parsed: any = null;
      const m = String(err?.message || '').match(/^\d+:\s*(\{.*\})\s*$/);
      if (m) { try { parsed = JSON.parse(m[1]); } catch {} }
      if (parsed?.requireExtraSelection) {
        setNeedsExtraSelection(true);
        if (parsed.sameLot && parsed.sameLot.miktar > 0) {
          setExtraLots([{ stokItemId: parsed.sameLot.stokItemId, miktar: String(parsed.sameLot.miktar) }]);
        } else {
          setExtraLots([{ stokItemId: 0, miktar: '' }]);
        }
        toast({ title: 'Aynı lot yetersiz', description: 'Lütfen ek lot seçimi yapın', variant: 'destructive' });
        return;
      }
      toast({ title: parsed?.message || err?.message || 'Hata', variant: 'destructive' });
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFotograf(reader.result as string);
    reader.readAsDataURL(file);
  };

  const fark = gercekMiktar ? Math.abs(Number(gercekMiktar) - beklenen) : 0;
  const allLots: AlternateLot[] = useMemo(() => {
    const arr: AlternateLot[] = [];
    if (lotInfo?.sameLot) arr.push(lotInfo.sameLot);
    if (lotInfo?.alternatives) arr.push(...lotInfo.alternatives);
    return arr;
  }, [lotInfo]);
  const totalAvailable = allLots.reduce((s, l) => s + l.miktar, 0);
  const sameLotRemaining = lotInfo?.sameLot?.miktar ?? 0;
  const noStockAvailable = tur === 'fazla' && fark > 0 && totalAvailable + 0.0001 < fark;
  const sameLotInsufficient = tur === 'fazla' && fark > 0 && sameLotRemaining + 0.0001 < fark && totalAvailable + 0.0001 >= fark;
  const extraSum = extraLots.reduce((s, e) => s + (Number(e.miktar) || 0), 0);

  const handleSubmit = () => {
    if (!lot) return;
    const gercek = Number(gercekMiktar);
    if (!gercekMiktar || isNaN(gercek) || gercek < 0) {
      toast({ title: 'Geçerli bir gerçek miktar girin', variant: 'destructive' });
      return;
    }
    if (!aciklama.trim()) {
      toast({ title: 'Açıklama zorunludur', variant: 'destructive' });
      return;
    }
    if (tur === 'fazla' && gercek <= beklenen) {
      toast({ title: 'Fazla kullanım için gerçek miktar beklenenden büyük olmalı', variant: 'destructive' });
      return;
    }
    if (tur === 'eksik' && gercek >= beklenen) {
      toast({ title: 'Az kullanım için gerçek miktar beklenenden küçük olmalı', variant: 'destructive' });
      return;
    }
    const payload: any = {
      depoHareketId: lot.id,
      tur,
      beklenenMiktar: beklenen,
      gercekMiktar: gercek,
      birim: lot.birim,
      aciklama: aciklama.trim(),
      fotograf,
    };
    if (needsExtraSelection && tur === 'fazla') {
      const cleaned = extraLots
        .filter(e => e.stokItemId > 0 && Number(e.miktar) > 0)
        .map(e => ({ stokItemId: e.stokItemId, miktar: Number(e.miktar) }));
      if (cleaned.length === 0) {
        toast({ title: 'En az bir lot ve miktar seçin', variant: 'destructive' });
        return;
      }
      const sum = cleaned.reduce((s, e) => s + e.miktar, 0);
      if (Math.abs(sum - fark) > 0.0001) {
        toast({ title: `Toplam (${sum}) farka (${fark}) eşit olmalı`, variant: 'destructive' });
        return;
      }
      payload.ekStokDusumler = cleaned;
    }
    createMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); } onOpenChange(v); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <MessageSquareWarning className="w-5 h-5 text-amber-500" />
            Tutarsızlık Bildir
          </DialogTitle>
        </DialogHeader>
        {lot && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{lot.urunAdi}{lot.lot ? ` · LOT ${lot.lot}` : ''}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{lot.siparisTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Beklenen kullanım: <span className="font-mono font-semibold text-foreground">{beklenen.toLocaleString('tr-TR')} {lot.birim}</span>
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Tutarsızlık Türü</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTur('fazla')}
                  className={cn(
                    'rounded-xl border-2 p-3 text-sm font-medium transition-all flex items-center justify-center gap-2',
                    tur === 'fazla'
                      ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-border/50 text-muted-foreground hover:border-rose-300'
                  )}
                  data-testid="button-tur-fazla"
                >
                  <TrendingUp className="w-4 h-4" />
                  Fazla Harcandı
                </button>
                <button
                  type="button"
                  onClick={() => setTur('eksik')}
                  className={cn(
                    'rounded-xl border-2 p-3 text-sm font-medium transition-all flex items-center justify-center gap-2',
                    tur === 'eksik'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-border/50 text-muted-foreground hover:border-emerald-300'
                  )}
                  data-testid="button-tur-eksik"
                >
                  <TrendingDown className="w-4 h-4" />
                  Az Harcandı
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Gerçek Kullanılan Miktar ({lot.birim})
              </p>
              <Input
                type="number"
                step="0.001"
                min="0"
                placeholder="Örn: 12.5"
                value={gercekMiktar}
                onChange={(e) => setGercekMiktar(e.target.value)}
                className="rounded-xl"
                data-testid="input-gercek-miktar"
              />
              {gercekMiktar && fark > 0 && (
                <p className={cn(
                  'text-xs mt-1.5 font-medium',
                  tur === 'fazla' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                )}>
                  Fark: {tur === 'fazla' ? '+' : '−'}{fark.toLocaleString('tr-TR')} {lot.birim}
                </p>
              )}
            </div>

            {tur === 'fazla' && fark > 0 && !needsExtraSelection && !noStockAvailable && !sameLotInsufficient && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Aynı lottan ({lotInfo?.sameLot?.miktar?.toLocaleString('tr-TR') ?? 0} {lot.birim} kalan) otomatik düşülecek
                  </p>
                  <p className="text-emerald-600/80 mt-0.5">{fark.toLocaleString('tr-TR')} {lot.birim} stok hesabınızdan eksilecek.</p>
                </div>
              </div>
            )}

            {tur === 'fazla' && fark > 0 && noStockAvailable && (
              <div className="rounded-xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-rose-700 dark:text-rose-300">KRİTİK: Aynı türde stok yok</p>
                    <p className="text-rose-600/90 mt-0.5">
                      {lot.urunAdi} ({lot.birim}) için sistemde sadece {totalAvailable.toLocaleString('tr-TR')} {lot.birim} mevcut.
                      Mevcut tüm stok düşülecek; <span className="font-bold">{(fark - totalAvailable).toLocaleString('tr-TR')} {lot.birim}</span> için stok girişi beklenecek ve panelde kritik uyarı gösterilecek.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tur === 'fazla' && needsExtraSelection && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-amber-800 dark:text-amber-300">Aynı lot yetersiz — ek lot seçin</p>
                    <p className="text-amber-700/80">Toplam {fark.toLocaleString('tr-TR')} {lot.birim} düşülmeli. Şimdiki toplam: {extraSum.toLocaleString('tr-TR')} {lot.birim}</p>
                  </div>
                </div>
                {extraLots.map((row, idx) => {
                  const selected = allLots.find(l => l.stokItemId === row.stokItemId);
                  return (
                    <div key={idx} className="flex items-center gap-1.5">
                      <select
                        value={row.stokItemId}
                        onChange={(e) => {
                          const next = [...extraLots];
                          next[idx] = { ...next[idx], stokItemId: Number(e.target.value) };
                          setExtraLots(next);
                        }}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                        data-testid={`select-extra-lot-${idx}`}
                      >
                        <option value={0}>— Lot seçin —</option>
                        {allLots.map(l => (
                          <option key={l.stokItemId} value={l.stokItemId} disabled={extraLots.some((e, i) => i !== idx && e.stokItemId === l.stokItemId)}>
                            LOT {l.lot ?? '-'} ({l.miktar.toLocaleString('tr-TR')} {l.birim})
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number" step="0.001" min="0"
                        max={selected?.miktar}
                        value={row.miktar}
                        onChange={(e) => {
                          const next = [...extraLots];
                          next[idx] = { ...next[idx], miktar: e.target.value };
                          setExtraLots(next);
                        }}
                        placeholder="Miktar"
                        className="w-24 rounded-lg text-xs h-8"
                        data-testid={`input-extra-miktar-${idx}`}
                      />
                      <button
                        type="button"
                        onClick={() => setExtraLots(extraLots.filter((_, i) => i !== idx))}
                        className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40"
                      >
                        <X className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    </div>
                  );
                })}
                {extraLots.length < allLots.length && (
                  <button
                    type="button"
                    onClick={() => setExtraLots([...extraLots, { stokItemId: 0, miktar: '' }])}
                    className="text-xs text-amber-700 dark:text-amber-300 font-medium hover:underline"
                    data-testid="button-add-extra-lot"
                  >
                    + Başka lot ekle
                  </button>
                )}
                <p className={cn('text-xs font-semibold', Math.abs(extraSum - fark) < 0.0001 ? 'text-emerald-600' : 'text-rose-600')}>
                  Toplam: {extraSum.toLocaleString('tr-TR')} / {fark.toLocaleString('tr-TR')} {lot.birim}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Açıklama / Sebep
              </p>
              <Textarea
                placeholder="Ne oldu? Neden farklı? Detayları yazın..."
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                className="rounded-xl min-h-[90px]"
                data-testid="textarea-anomali-aciklama"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Fotoğraf (İsteğe bağlı)
              </p>
              {fotograf ? (
                <div className="relative inline-block">
                  <img src={fotograf} alt="Fotoğraf" loading="lazy" decoding="async" className="rounded-xl border border-border max-h-40 object-cover" />
                  <button
                    onClick={() => setFotograf(null)}
                    className="absolute top-1.5 right-1.5 bg-background/90 rounded-full p-1 shadow hover:bg-background"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground"
                  data-testid="button-anomali-foto"
                >
                  <Camera className="w-4 h-4" /> Fotoğraf Ekle
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button
            className="rounded-xl"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-anomali-gonder"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
            Bildir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Üretimdeki Lot Card ────────────────────────────────────────────────── */
function UretimdeLotCard({
  lot, onGeriAl, anomaliler, canReportAnomaly, onReportAnomaly,
}: {
  lot: DepoHareket;
  onGeriAl: (id: number) => void;
  anomaliler: StokAnomali[];
  canReportAnomaly: boolean;
  onReportAnomaly: (lot: DepoHareket) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [aciklama, setAciklama] = useState(lot.tasindiAciklama ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(lot.tasindiPhoto ?? null);
  const [editAciklama, setEditAciklama] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fotoMutation = useMutation({
    mutationFn: ({ tasindiPhoto, tasindiAciklama }: { tasindiPhoto?: string | null; tasindiAciklama?: string | null }) =>
      apiRequest('PATCH', `/api/depo-hareketleri/${lot.id}/foto`, { tasindiPhoto, tasindiAciklama }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/depo-hareketleri'] });
      toast({ title: 'Kaydedildi' });
      setEditAciklama(false);
    },
    onError: () => toast({ title: 'Hata', variant: 'destructive' }),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPreviewUrl(b64);
      fotoMutation.mutate({ tasindiPhoto: b64, tasindiAciklama: aciklama || lot.tasindiAciklama });
    };
    reader.readAsDataURL(file);
  };

  const saveAciklama = () => {
    fotoMutation.mutate({ tasindiPhoto: previewUrl, tasindiAciklama: aciklama });
  };

  const tasinmis = tasinmisMiktar(lot);
  const kalanMiktar = kalan(lot);
  const acikAnomaliler = anomaliler.filter(a => !a.resolved);
  const cozulmusAnomaliler = anomaliler.filter(a => a.resolved);

  return (
    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-border/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{lot.urunAdi}</p>
            {lot.lot && <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">LOT: {lot.lot}</span>}
            <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground">{lot.kaynak === 'rr' ? 'Reçete' : 'HM'}</span>
            {kalanMiktar > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                Kısmi taşıma
              </span>
            )}
            {acikAnomaliler.length > 0 && (
              <span
                className="text-xs bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium"
                data-testid={`badge-anomali-${lot.id}`}
              >
                <MessageSquareWarning className="w-3 h-3" />
                {acikAnomaliler.length} tutarsızlık
              </span>
            )}
            {lot.barkodDogrulandi ? (
              <span
                className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium"
                data-testid={`badge-barkod-dogrulandi-${lot.id}`}
              >
                <ScanLine className="w-3 h-3" />
                Barkodla doğrulandı{lot.barkodKaynak ? ` (${lot.barkodKaynak})` : ''}
              </span>
            ) : (
              <span
                className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                data-testid={`badge-manuel-tasindi-${lot.id}`}
              >
                Manuel taşındı
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
            <Link href={`/records/${lot.siparisId}`}>
              <span className="hover:underline text-primary flex items-center gap-1 cursor-pointer">
                {lot.siparisTitle} <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
            {lot.tasindiAt && (
              <span>{new Date(lot.tasindiAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {lot.tasindiByUsername && <span>— {lot.tasindiByUsername}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {tasinmis.toLocaleString('tr-TR')} {lot.birim}
          </p>
          {kalanMiktar > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {kalanMiktar.toLocaleString('tr-TR')} {lot.birim} depoda kaldı
            </p>
          )}
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Kapat' : 'Detay'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Fotoğraf</p>
            {previewUrl ? (
              <div className="relative inline-block">
                <img src={previewUrl} alt="Lot fotoğrafı" className="rounded-xl border border-border max-h-48 object-cover" />
                <button
                  className="absolute top-1.5 right-1.5 bg-background/80 rounded-full p-1 shadow hover:bg-background transition-colors"
                  onClick={() => fileRef.current?.click()}
                  title="Fotoğrafı değiştir"
                >
                  <Camera className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-sm text-muted-foreground"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="w-4 h-4" />
                Fotoğraf Ekle
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} data-testid={`input-foto-${lot.id}`} />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Açıklama</p>
            {editAciklama ? (
              <div className="space-y-2">
                <Textarea
                  className="rounded-xl min-h-[72px] text-sm"
                  placeholder="Not veya açıklama ekleyin..."
                  value={aciklama}
                  onChange={e => setAciklama(e.target.value)}
                  data-testid={`textarea-aciklama-${lot.id}`}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-xl h-8" onClick={saveAciklama} disabled={fotoMutation.isPending}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Kaydet
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-xl h-8" onClick={() => { setEditAciklama(false); setAciklama(lot.tasindiAciklama ?? ''); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm text-muted-foreground cursor-pointer hover:text-foreground rounded-xl px-3 py-2 bg-muted/30 min-h-[40px] flex items-center"
                onClick={() => setEditAciklama(true)}
                data-testid={`text-aciklama-${lot.id}`}
              >
                {aciklama || <span className="italic opacity-60">Açıklama eklemek için tıklayın...</span>}
              </div>
            )}
          </div>

          {/* Anomali listesi */}
          {anomaliler.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquareWarning className="w-3.5 h-3.5 text-amber-500" />
                Bildirilen Tutarsızlıklar ({anomaliler.length})
              </p>
              <div className="space-y-2">
                {[...acikAnomaliler, ...cozulmusAnomaliler].map(a => (
                  <div
                    key={a.id}
                    className={cn(
                      'rounded-xl border p-2.5 text-xs space-y-1',
                      a.resolved
                        ? 'border-border/40 bg-muted/30 opacity-70'
                        : a.tur === 'fazla'
                          ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20'
                          : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    )}
                    data-testid={`anomali-item-${a.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'inline-flex items-center gap-1 font-semibold',
                        a.tur === 'fazla' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
                      )}>
                        {a.tur === 'fazla' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {a.tur === 'fazla' ? '+' : '−'}{Number(a.fark).toLocaleString('tr-TR')} {a.birim}
                        {a.resolved && <ShieldCheck className="w-3 h-3 ml-1 text-emerald-500" />}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {a.reportedByUsername}
                        {a.createdAt && ` · ${new Date(a.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      Beklenen: <span className="font-mono">{Number(a.beklenenMiktar).toLocaleString('tr-TR')}</span> · Gerçek: <span className="font-mono">{Number(a.gercekMiktar).toLocaleString('tr-TR')}</span>
                    </p>
                    <p className="text-foreground/80">{a.aciklama}</p>
                    {a.resolved && a.resolutionNotes && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 italic">
                        Çözüm: {a.resolutionNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-1 gap-2 flex-wrap">
            {canReportAnomaly && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs rounded-xl h-7 border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                onClick={() => onReportAnomaly(lot)}
                data-testid={`button-anomali-bildir-${lot.id}`}
              >
                <MessageSquareWarning className="w-3.5 h-3.5 mr-1" /> Tutarsızlık Bildir
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground hover:text-destructive rounded-xl h-7 ml-auto"
              onClick={() => onGeriAl(lot.id)}
              data-testid={`button-geri-al-${lot.id}`}
            >
              <Undo2 className="w-3.5 h-3.5 mr-1" /> Geri Al
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function DepoHareketleriPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tasiModalOpen, setTasiModalOpen] = useState(false);

  /* Modal state — step 1: seçili lot id seti, step 2: miktar map */
  const [step, setStep] = useState<1 | 2>(1);
  const [secilenIds, setSecilenIds] = useState<Set<number>>(new Set());
  const [miktarlar, setMiktarlar] = useState<Record<number, string>>({});
  const [modalSearch, setModalSearch] = useState('');

  /* Barkod doğrulama state */
  const [scannerLotId, setScannerLotId] = useState<number | null>(null);
  const [dogrulananLotlar, setDogrulananLotlar] = useState<Map<number, BarkodKaynak>>(new Map());

  /* Siparişe Ata modal state */
  const [ataModalLot, setAtaModalLot] = useState<DepoHareket | null>(null);
  const [ataSearch, setAtaSearch] = useState('');
  const [ataHedefId, setAtaHedefId] = useState<number | null>(null);
  const [ataMiktar, setAtaMiktar] = useState('');

  /* ── Auth & permissions ── */
  const { user } = useAuth();
  const canReportAnomaly = !!user && (user.role === 'admin' || user.role === 'uretim_sefi' || user.role === 'ofis_calisan' || (user as any).stokYetkisi === true);
  const isManager = !!user && (user.role === 'admin' || user.role === 'uretim_sefi' || user.role === 'ofis_calisan');

  /* ── Anomaly dialog state ── */
  const [anomalyDialogLot, setAnomalyDialogLot] = useState<DepoHareket | null>(null);

  /* ── Queries ── */
  const { data: hareketler = [], isLoading } = useQuery<DepoHareket[]>({
    queryKey: ['/api/depo-hareketleri'],
    queryFn: () => fetch('/api/depo-hareketleri', { credentials: 'include' }).then(r => r.json()),
  });

  const { data: siparisler = [] } = useQuery<{ id: number; title: string; lotNumber: string | null; status: string }[]>({
    queryKey: ['/api/records'],
    queryFn: () => fetch('/api/records', { credentials: 'include' }).then(r => r.json()),
  });

  const { data: weeklyPlan } = useQuery<{ plan: any; items: { recordId: number }[] }>({
    queryKey: ['/api/weekly-plans/current'],
    queryFn: () => fetch('/api/weekly-plans/current', { credentials: 'include' }).then(r => r.ok ? r.json() : { plan: null, items: [] }),
  });

  const haftalikSet = useMemo(() => new Set((weeklyPlan?.items ?? []).map(i => i.recordId)), [weeklyPlan]);

  /* ── Barkod doğrulama modu (esnek/sıkı) — admin ayarı ── */
  const { data: barkodModuData } = useQuery<{ key: string; value: string | null }>({
    queryKey: ['/api/settings', 'barkod_dogrulama_modu'],
    queryFn: () => fetch('/api/settings/barkod_dogrulama_modu', { credentials: 'include' }).then(r => r.json()),
  });
  const barkodModu: 'esnek' | 'siki' = (barkodModuData?.value === 'siki') ? 'siki' : 'esnek';

  const setBarkodModuMutation = useMutation({
    mutationFn: (value: 'esnek' | 'siki') =>
      apiRequest('PUT', '/api/settings/barkod_dogrulama_modu', { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/settings', 'barkod_dogrulama_modu'] }),
    onError: () => toast({ title: 'Mod değiştirilemedi', variant: 'destructive' }),
  });

  const { data: anomaliler = [] } = useQuery<StokAnomali[]>({
    queryKey: ['/api/stok-anomalileri'],
    queryFn: () => fetch('/api/stok-anomalileri', { credentials: 'include' }).then(r => r.json()),
  });

  /* ── Group anomalies by depo hareket ── */
  const anomaliByHareket = useMemo(() => {
    const m = new Map<number, StokAnomali[]>();
    anomaliler.forEach(a => {
      const arr = m.get(a.depoHareketId) ?? [];
      arr.push(a);
      m.set(a.depoHareketId, arr);
    });
    return m;
  }, [anomaliler]);

  /* ── Sipariş status lookup (for üretim badges) ── */
  const siparisStatusMap = useMemo(() => {
    const m = new Map<number, string>();
    siparisler.forEach(s => m.set(s.id, s.status));
    return m;
  }, [siparisler]);

  const acikAnomaliler = useMemo(() => anomaliler.filter(a => !a.resolved), [anomaliler]);
  const kritikAnomaliler = useMemo(
    () => anomaliler.filter(a => !a.resolved && Number(a.bekleyenMiktar ?? 0) > 0),
    [anomaliler]
  );

  /* ── Split by tasindi ── */
  const rezerveler = useMemo(
    () => hareketler.filter(r => !r.tasindi),
    [hareketler]
  );
  const uretimde = useMemo(
    () => hareketler.filter(r => (r.tasindiMiktar ?? 0) > 0),
    [hareketler]
  );
  const fazlalik = useMemo(
    () => hareketler.filter(r => (r.tasindiMiktar ?? 0) > r.rezervedMiktar),
    [hareketler]
  );

  /* ── Mutations ── */
  const tasiMutation = useMutation({
    mutationFn: ({ id, miktar, barkodDogrulandi, barkodKaynak }: { id: number; miktar: number; barkodDogrulandi?: boolean; barkodKaynak?: BarkodKaynak | null }) =>
      apiRequest('PATCH', `/api/depo-hareketleri/${id}/tasindi`, {
        tasindiMiktar: miktar,
        ...(barkodDogrulandi !== undefined ? { barkodDogrulandi, barkodKaynak: barkodKaynak ?? null } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/depo-hareketleri'] });
      qc.invalidateQueries({ queryKey: ['/api/stok-items'] });
      qc.invalidateQueries({ queryKey: ['/api/stok-anomalileri'] });
    },
    onError: () => toast({ title: 'Hata', description: 'Taşıma işlemi başarısız', variant: 'destructive' }),
  });

  const geriAlMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/depo-hareketleri/${id}/geri-al`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/depo-hareketleri'] });
      toast({ title: 'Lot depoya geri alındı' });
    },
    onError: () => toast({ title: 'Hata', variant: 'destructive' }),
  });

  const depoyaDonMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/depo-hareketleri/${id}/depoya-don`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/depo-hareketleri'] });
      toast({ title: 'Fazlalık stok depoya iade edildi' });
    },
    onError: () => toast({ title: 'Hata', variant: 'destructive' }),
  });

  const resolveAnomaliMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      apiRequest('PATCH', `/api/stok-anomalileri/${id}/resolve`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/stok-anomalileri'] });
      toast({ title: 'Tutarsızlık çözümlendi' });
    },
    onError: (err: any) => toast({ title: err?.message || 'Hata', variant: 'destructive' }),
  });

  const deleteAnomaliMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/stok-anomalileri/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/stok-anomalileri'] });
      toast({ title: 'Bildirim silindi' });
    },
    onError: (err: any) => toast({ title: err?.message || 'Hata', variant: 'destructive' }),
  });

  const handleResolve = (id: number) => {
    const notes = window.prompt('Çözüm notu (isteğe bağlı):', '') ?? '';
    resolveAnomaliMutation.mutate({ id, notes });
  };

  const siparisAtaMutation = useMutation({
    mutationFn: ({ id, hedefSiparisId, miktar }: { id: number; hedefSiparisId: number; miktar: number }) =>
      apiRequest('POST', `/api/depo-hareketleri/${id}/siparis-ata`, { hedefSiparisId, miktar }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/depo-hareketleri'] });
      toast({ title: 'Fazlalık stok siparişe atandı' });
      setAtaModalLot(null);
      setAtaHedefId(null);
      setAtaMiktar('');
      setAtaSearch('');
    },
    onError: (err: any) => toast({ title: err?.message || 'Hata', variant: 'destructive' }),
  });

  /* ── Sipariş ata modal helpers ── */
  const filteredSiparisler = useMemo(() => {
    if (!ataModalLot) return [];
    const q = normalizeForSearch(ataSearch);
    return siparisler.filter(s =>
      s.id !== ataModalLot.siparisId &&
      ['pending', 'active', 'in_progress'].includes(s.status) &&
      (q ? normalizeForSearch(s.title).includes(q) || normalizeForSearch(s.lotNumber).includes(q) : true)
    );
  }, [siparisler, ataSearch, ataModalLot]);

  const openAtaModal = (lot: DepoHareket) => {
    setAtaModalLot(lot);
    const fazlalik = (lot.tasindiMiktar ?? 0) - lot.rezervedMiktar;
    setAtaMiktar(String(fazlalik.toFixed(3)).replace(/\.?0+$/, ''));
    setAtaHedefId(null);
    setAtaSearch('');
  };

  const handleSiparisAta = () => {
    if (!ataModalLot || !ataHedefId || !ataMiktar) return;
    siparisAtaMutation.mutate({ id: ataModalLot.id, hedefSiparisId: ataHedefId, miktar: Number(ataMiktar) });
  };

  /* ── Filtered reserve list (main page) ── */
  const filteredRez = useMemo(() => {
    const q = normalizeForSearch(search);
    if (!q) return rezerveler;
    return rezerveler.filter(r =>
      normalizeForSearch(r.urunAdi).includes(q) || normalizeForSearch(r.lot).includes(q) ||
      normalizeForSearch(r.siparisTitle).includes(q)
    );
  }, [rezerveler, search]);

  /* ── Priority helper: haftalık plan / üretimde / ürün bekliyor önce ── */
  const lotPriority = (lot: DepoHareket): number => {
    const st = siparisStatusMap.get(lot.siparisId);
    const inPlan = haftalikSet.has(lot.siparisId);
    if (inPlan && st === 'in_progress') return 0;
    if (st === 'in_progress') return 1;
    if (inPlan && st === 'waiting_product') return 2;
    if (inPlan) return 3;
    if (st === 'waiting_product') return 4;
    return 5;
  };

  /* ── Filtered list inside modal (priority-sorted) ── */
  const filteredModal = useMemo(() => {
    const q = normalizeForSearch(modalSearch);
    const base = q
      ? rezerveler.filter(r =>
          normalizeForSearch(r.urunAdi).includes(q) || normalizeForSearch(r.lot).includes(q) ||
          normalizeForSearch(r.siparisTitle).includes(q)
        )
      : rezerveler;
    return [...base].sort((a, b) => {
      const pa = lotPriority(a), pb = lotPriority(b);
      if (pa !== pb) return pa - pb;
      return a.urunAdi.localeCompare(b.urunAdi, 'tr');
    });
  }, [rezerveler, modalSearch, siparisStatusMap, haftalikSet]);

  /* ── Toggle checkbox ── */
  const toggleSecim = (id: number) => {
    setSecilenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /* ── Excel Export: HAFTALIK PLAN / ÜRETİMDE / ÜRÜN BEKLİYOR rezerveleri ── */
  const handleExportExcel = async () => {
    try {
      const stokRes = await fetch('/api/stok', { credentials: 'include' });
      const stokItems: any[] = stokRes.ok ? await stokRes.json() : [];
      const stokById = new Map<number, any>();
      stokItems.forEach(s => stokById.set(s.id, s));

      // Toplam tasindi (tüm hareketler dahil) ve anomali ek düşüm hesapları
      const tasindiByStokId = new Map<number, number>();
      hareketler.forEach(h => {
        if ((h.tasindiMiktar ?? 0) > 0) {
          tasindiByStokId.set(h.stokId, (tasindiByStokId.get(h.stokId) ?? 0) + (h.tasindiMiktar ?? 0));
        }
      });
      const anomaliEkByStokId = new Map<number, number>();
      anomaliler.forEach(a => {
        (a.ekStokDusumler ?? []).forEach(d => {
          anomaliEkByStokId.set(d.stokItemId, (anomaliEkByStokId.get(d.stokItemId) ?? 0) + Number(d.miktar || 0));
        });
      });

      const filtered = rezerveler.filter(l => {
        const st = siparisStatusMap.get(l.siparisId);
        return haftalikSet.has(l.siparisId) || st === 'in_progress' || st === 'waiting_product';
      });

      if (filtered.length === 0) {
        toast({ title: 'Export edilecek kayıt yok', description: 'Haftalık plan / üretimde / ürün bekliyor durumda lot bulunamadı.', variant: 'destructive' });
        return;
      }

      const sorted = [...filtered].sort((a, b) => {
        const pa = lotPriority(a), pb = lotPriority(b);
        if (pa !== pb) return pa - pb;
        return a.siparisTitle.localeCompare(b.siparisTitle, 'tr');
      });

      const statusLabel: Record<string, string> = {
        in_progress: 'Devam Ediyor',
        waiting_product: 'Ürün Bekliyor',
        pending: 'Beklemede',
        completed: 'Tamamlandı',
      };

      const rows = sorted.map(l => {
        const stok = stokById.get(l.stokId) ?? {};
        const st = siparisStatusMap.get(l.siparisId) ?? '';
        const inPlan = haftalikSet.has(l.siparisId);
        const rezerve = Number(l.rezervedMiktar || 0);
        const tasindi = Number(l.tasindiMiktar ?? 0);
        const lotKalan = stok.miktar != null ? Number(stok.miktar) : null;
        const lotToplam = l.stokMiktar != null ? Number(l.stokMiktar) : null;
        const ekDusum = anomaliEkByStokId.get(l.stokId) ?? 0;
        const tasindiToplamLot = tasindiByStokId.get(l.stokId) ?? 0;
        return {
          'Sipariş': l.siparisTitle,
          'Sipariş Lot': l.siparisLot ?? '',
          'Sipariş Durumu': statusLabel[st] ?? st ?? '',
          'Haftalık Plan': inPlan ? 'EVET' : '',
          'Ürün Adı': l.urunAdi,
          'Tür': stok.tur ?? '',
          'Alt Tür': stok.altTur ?? '',
          'Üretici Firma': stok.ureticiFirma ?? '',
          'LOT': l.lot ?? '',
          'Birim': l.birim,
          'Rezerve Miktar': rezerve,
          'Üretime Taşınan': tasindi,
          'Anomali Ek Düşüm': ekDusum,
          'Bu Lottan Toplam Kullanılan': tasindiToplamLot + ekDusum,
          'Lot Toplam Stok': lotToplam ?? '',
          'Lot Depoda Kalan': lotKalan ?? '',
          'Kaynak': l.kaynak === 'rr' ? 'Reçete' : 'Hammadde',
          'Giriş Tarihi': stok.girisTarihi ? new Date(stok.girisTarihi).toLocaleDateString('tr-TR') : '',
          'SKT': stok.sonKullanmaTarihi ? new Date(stok.sonKullanmaTarihi).toLocaleDateString('tr-TR') : '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      // Kolon genişlikleri
      const cols = Object.keys(rows[0]);
      ws['!cols'] = cols.map(k => ({
        wch: Math.min(40, Math.max(k.length + 2, ...rows.map(r => String((r as any)[k] ?? '').length + 2)))
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Üretim Rezerveleri');

      // Özet sayfası
      const ozet = [
        { 'Bölüm': 'Tarih', 'Değer': new Date().toLocaleString('tr-TR') },
        { 'Bölüm': 'Toplam Lot', 'Değer': sorted.length },
        { 'Bölüm': 'Haftalık Plan + Üretimde', 'Değer': sorted.filter(l => haftalikSet.has(l.siparisId) && siparisStatusMap.get(l.siparisId) === 'in_progress').length },
        { 'Bölüm': 'Sadece Üretimde', 'Değer': sorted.filter(l => !haftalikSet.has(l.siparisId) && siparisStatusMap.get(l.siparisId) === 'in_progress').length },
        { 'Bölüm': 'Sadece Ürün Bekliyor', 'Değer': sorted.filter(l => siparisStatusMap.get(l.siparisId) === 'waiting_product').length },
        { 'Bölüm': 'Sadece Haftalık Plan', 'Değer': sorted.filter(l => haftalikSet.has(l.siparisId) && siparisStatusMap.get(l.siparisId) !== 'in_progress' && siparisStatusMap.get(l.siparisId) !== 'waiting_product').length },
      ];
      const wsOzet = XLSX.utils.json_to_sheet(ozet);
      wsOzet['!cols'] = [{ wch: 32 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, wsOzet, 'Özet');

      const fileName = `depo-hareketleri-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast({ title: 'Excel oluşturuldu', description: `${sorted.length} kayıt indirildi.` });
    } catch (err: any) {
      toast({ title: 'Excel hatası', description: err?.message ?? 'Bilinmeyen hata', variant: 'destructive' });
    }
  };

  /* ── Open modal ── */
  const openModal = () => {
    setStep(1);
    setSecilenIds(new Set());
    setMiktarlar({});
    setModalSearch('');
    setTasiModalOpen(true);
  };

  /* ── Step 1 → Step 2: miktar state'ini seçilen lotlar için init et ── */
  const goToStep2 = () => {
    if (secilenIds.size === 0) {
      toast({ title: 'En az 1 lot seçin', variant: 'destructive' });
      return;
    }
    const init: Record<number, string> = {};
    rezerveler.forEach(r => {
      if (secilenIds.has(r.id)) {
        const kalanMiktar = r.rezervedMiktar - (r.tasindiMiktar ?? 0);
        init[r.id] = String(kalanMiktar);
      }
    });
    setMiktarlar(init);
    setStep(2);
  };

  /* Seçili lotlardan kaç tanesi doğrulanmamış (UI guard için) */
  const eksikDogrulamaSayisi = useMemo(() => {
    return Object.entries(miktarlar)
      .filter(([_, v]) => v !== '' && Number(v) > 0)
      .filter(([id]) => !dogrulananLotlar.has(Number(id))).length;
  }, [miktarlar, dogrulananLotlar]);

  const sikiModEngelliyor = barkodModu === 'siki' && eksikDogrulamaSayisi > 0;

  /* ── Submit ── */
  const handleTasi = async () => {
    const selected = Object.entries(miktarlar).filter(([_, v]) => v !== '' && Number(v) > 0);
    if (selected.length === 0) {
      toast({ title: 'En az 1 lot için miktar girin', variant: 'destructive' });
      return;
    }
    // Sıkı modda: buton zaten devre dışı ama yine de güvenlik için kontrol et
    if (sikiModEngelliyor) {
      toast({
        title: 'Barkod doğrulaması zorunlu',
        description: `${eksikDogrulamaSayisi} lot için barkod taraması yapılmadı (sıkı mod açık).`,
        variant: 'destructive',
      });
      return;
    }
    // Esnek modda: doğrulanmamış lot varsa kullanıcıdan onay iste
    if (barkodModu === 'esnek' && eksikDogrulamaSayisi > 0) {
      const onay = window.confirm(
        `${eksikDogrulamaSayisi} lot barkodla doğrulanmadı. Yine de taşımak istediğinize emin misiniz?`
      );
      if (!onay) return;
    }
    for (const [id, miktar] of selected) {
      const kaynak = dogrulananLotlar.get(Number(id)) ?? null;
      await tasiMutation.mutateAsync({
        id: Number(id),
        miktar: Number(miktar),
        barkodDogrulandi: !!kaynak,
        barkodKaynak: kaynak,
      });
    }
    setTasiModalOpen(false);
    setDogrulananLotlar(new Map());
    toast({ title: `${selected.length} lot üretim alanına taşındı` });
  };

  /* Barkod tarama sonucunu işle — useCallback ile referans stabil */
  const handleScan = useCallback((code: string, kaynak: BarkodKaynak): boolean => {
    if (scannerLotId == null) return false;
    const lot = rezerveler.find(r => r.id === scannerLotId);
    if (!lot) {
      setScannerLotId(null);
      return false;
    }
    const ok = barkodEslesir(code, lot.lot, lot.id);
    if (ok) {
      setDogrulananLotlar(prev => {
        const m = new Map(prev);
        m.set(lot.id, kaynak);
        return m;
      });
      toast({ title: 'Barkod doğrulandı', description: `${lot.urunAdi}${lot.lot ? ` · LOT ${lot.lot}` : ''}` });
      setScannerLotId(null);
      return true;
    } else {
      const desc = `Beklenen: ${lot.lot ? `LOT ${lot.lot} veya ` : ''}BTX-DH-${lot.id} · Okunan: ${code}`;
      if (barkodModu === 'siki') {
        toast({ title: 'Yanlış barkod', description: desc, variant: 'destructive' });
      } else {
        toast({ title: 'Barkod eşleşmedi', description: `${desc}. Esnek mod açık — devam edebilirsiniz.`, variant: 'destructive' });
      }
      return false;
    }
  }, [scannerLotId, rezerveler, barkodModu, toast]);

  /* ── Seçilen lotlar (step 2'de gösterim için) ── */
  const secilenLotlar = useMemo(
    () => rezerveler.filter(r => secilenIds.has(r.id)),
    [rezerveler, secilenIds]
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl shrink-0">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Depo Hareketleri</h1>
            <p className="text-sm text-muted-foreground">Rezerve ve üretimde olan stok lotları</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="rounded-xl gap-2"
            onClick={handleExportExcel}
            disabled={rezerveler.length === 0}
            data-testid="button-yazdir-excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Yazdır (Excel)
          </Button>
          <Button
            className="rounded-xl gap-2"
            onClick={openModal}
            disabled={rezerveler.length === 0}
            data-testid="button-uretim-tasi"
          >
            <Truck className="w-4 h-4" />
            Üretime Taşı
          </Button>
          {user?.role === 'admin' && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-muted/30"
              title="Sıkı: Üretime taşımadan önce barkod doğrulaması zorunlu. Esnek: yanlış/eksik tarama uyarı verir ama engellemez."
              data-testid="container-barkod-modu"
            >
              {barkodModu === 'siki' ? (
                <Lock className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium hidden sm:inline">
                Barkod: {barkodModu === 'siki' ? 'Sıkı' : 'Esnek'}
              </span>
              <Switch
                checked={barkodModu === 'siki'}
                onCheckedChange={v => setBarkodModuMutation.mutate(v ? 'siki' : 'esnek')}
                disabled={setBarkodModuMutation.isPending}
                data-testid="switch-barkod-modu"
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border-none shadow-sm bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Depoda Rezerve</p>
            <p className="text-3xl font-bold text-blue-700 dark:text-blue-300 mt-1">{isLoading ? '–' : rezerveler.length}</p>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">lot bekliyor</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wide">Üretimde</p>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{isLoading ? '–' : uretimde.length}</p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">lot aktif</p>
          </CardContent>
        </Card>
      </div>

      {/* ── KRİTİK: Bekleyen Stok Uyarıları ── */}
      {kritikAnomaliler.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/30 shadow-lg overflow-hidden animate-pulse-slow">
          <div className="px-4 py-3 bg-rose-600 text-white flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <h2 className="text-base font-bold">KRİTİK STOK UYARISI</h2>
            <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">
              {kritikAnomaliler.length} bekleyen
            </span>
            <p className="text-xs text-white/90 ml-auto">
              Bu hammaddelerin stok girişi yapılana kadar uyarı kalıcı olacak
            </p>
          </div>
          <div className="p-3 space-y-2">
            {kritikAnomaliler.map(a => (
              <div
                key={`kritik-${a.id}`}
                className="rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-rose-950/40 px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap"
                data-testid={`kritik-anomali-${a.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-rose-700 dark:text-rose-300 text-sm">
                    {a.bekleyenUrunAdi ?? a.stokAdi} ({a.bekleyenBirim ?? a.birim})
                  </p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                    Bekleyen: {Number(a.bekleyenMiktar).toLocaleString('tr-TR')} {a.bekleyenBirim ?? a.birim}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.siparisTitle} · {a.reportedByUsername}
                    {a.createdAt && ` · ${new Date(a.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                <Link href="/stok">
                  <Button
                    size="sm"
                    className="rounded-xl h-8 text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
                    data-testid={`button-stok-girisi-${a.id}`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    Stok Girişi Yap
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Açık Tutarsızlıklar (Anomaliler) ── */}
      {acikAnomaliler.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <MessageSquareWarning className="w-4 h-4 text-rose-500" />
              Açık Tutarsızlık Bildirimleri
              <span className="text-xs font-normal text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                {acikAnomaliler.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Üretimden gelen hammadde / yarı mamül tutarsızlık bildirimleri
            </p>
          </div>
          <div className="space-y-2">
            {acikAnomaliler.map(a => (
              <Card
                key={a.id}
                className={cn(
                  'rounded-2xl border shadow-sm overflow-hidden',
                  a.tur === 'fazla'
                    ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/10'
                    : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10'
                )}
                data-testid={`card-anomali-${a.id}`}
              >
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-sm font-bold',
                          a.tur === 'fazla' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
                        )}>
                          {a.tur === 'fazla' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {a.tur === 'fazla' ? 'Fazla' : 'Az'} kullanım: {a.tur === 'fazla' ? '+' : '−'}{Number(a.fark).toLocaleString('tr-TR')} {a.birim}
                        </span>
                      </div>
                      <p className="text-sm font-semibold mt-0.5">
                        {a.stokAdi}{a.lot ? ` · LOT ${a.lot}` : ''}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <Link href={`/records/${a.siparisId}`}>
                          <span className="hover:underline text-primary cursor-pointer flex items-center gap-1">
                            {a.siparisTitle} <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        </Link>
                        <span>·</span>
                        <span>Beklenen: <span className="font-mono text-foreground">{Number(a.beklenenMiktar).toLocaleString('tr-TR')}</span></span>
                        <span>·</span>
                        <span>Gerçek: <span className="font-mono text-foreground">{Number(a.gercekMiktar).toLocaleString('tr-TR')}</span></span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p className="font-medium text-foreground">{a.reportedByUsername}</p>
                      {a.createdAt && (
                        <p className="mt-0.5">{new Date(a.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/90 bg-background/60 rounded-lg px-3 py-2">
                    {a.aciklama}
                  </p>
                  {a.fotograf && (
                    <img src={a.fotograf} alt="Fotoğraf" loading="lazy" decoding="async" className="rounded-lg border border-border max-h-40 object-cover" />
                  )}
                  {isManager && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="rounded-xl h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleResolve(a.id)}
                        disabled={resolveAnomaliMutation.isPending}
                        data-testid={`button-resolve-${a.id}`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Çözümle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl h-8 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (window.confirm('Bu bildirimi silmek istediğinizden emin misiniz?')) {
                            deleteAnomaliMutation.mutate(a.id);
                          }
                        }}
                        disabled={deleteAnomaliMutation.isPending}
                        data-testid={`button-delete-anomali-${a.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Üretimdeki Lotlar (üstte) ── */}
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
          <Truck className="w-4 h-4 text-emerald-500" />
          Üretimdeki Stok Lotları
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : uretimde.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Henüz üretim alanına taşınan lot yok</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {uretimde.map(lot => (
              <UretimdeLotCard
                key={lot.id}
                lot={lot}
                onGeriAl={id => geriAlMutation.mutate(id)}
                anomaliler={anomaliByHareket.get(lot.id) ?? []}
                canReportAnomaly={canReportAnomaly}
                onReportAnomaly={(l) => setAnomalyDialogLot(l)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Rezerve Lotlar ── */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-500" />
            Depoda Rezerve Lotlar
          </h2>
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Ara..."
              className="pl-8 h-8 text-sm rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-depo-search"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : filteredRez.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">{search ? 'Eşleşen lot bulunamadı' : 'Depoda bekleyen rezerve lot yok'}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredRez.map(lot => {
              const kalanMiktar = kalan(lot);
              const tasinmis = tasinmisMiktar(lot);
              return (
                <Card key={lot.id} className="rounded-2xl border border-border/60 shadow-sm" data-testid={`card-rezerve-${lot.id}`}>
                  <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{lot.urunAdi}</p>
                        {lot.lot && <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">LOT: {lot.lot}</span>}
                        <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground">{lot.kaynak === 'rr' ? 'Reçete' : 'HM'}</span>
                        {(() => {
                          const st = siparisStatusMap.get(lot.siparisId);
                          if (st === 'in_progress') return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 animate-pulse">
                              <PlayCircle className="w-2.5 h-2.5" /> ÜRETİMDE
                            </span>
                          );
                          if (st === 'waiting_product') return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700">
                              <Clock className="w-2.5 h-2.5" /> ÜRÜN BEKLİYOR
                            </span>
                          );
                          return null;
                        })()}
                        {haftalikSet.has(lot.siparisId) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                            <CalendarDays className="w-2.5 h-2.5" /> HAFTALIK PLAN
                          </span>
                        )}
                        {tasinmis > 0 && (
                          <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                            {tasinmis.toLocaleString('tr-TR')} {lot.birim} taşındı
                          </span>
                        )}
                        <Link href={`/etiket/depo-hareket/${lot.id}`}>
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground hover:text-primary hover:underline cursor-pointer"
                            data-testid={`link-etiket-rezerve-${lot.id}`}
                          >
                            <QrCode className="w-2.5 h-2.5" /> Etiket
                          </span>
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted-foreground">
                        <Link href={`/records/${lot.siparisId}`}>
                          <span className="hover:underline text-primary cursor-pointer flex items-center gap-1">
                            {lot.siparisTitle} <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        </Link>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-blue-600 dark:text-blue-400">
                        {kalanMiktar.toLocaleString('tr-TR')} {lot.birim}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tasinmis > 0
                          ? `/ ${lot.rezervedMiktar.toLocaleString('tr-TR')} rezerve`
                          : 'rezerve'}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Üretimdeki Fazlalık Stok ── */}
      {fazlalik.length > 0 && (
        <div>
          <div className="flex items-start justify-between gap-2 mb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              Üretimdeki Fazlalık Stok
              <span className="text-xs font-normal text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                {fazlalik.length} lot
              </span>
            </h2>
            <p className="text-xs text-muted-foreground text-right hidden sm:block shrink-0 max-w-[180px]">
              Yeni sipariş onayında aynı malzeme otomatik atanır
            </p>
          </div>
          <div className="space-y-2.5">
            {fazlalik.map(lot => {
              const fazlalikMiktar = (lot.tasindiMiktar ?? 0) - lot.rezervedMiktar;
              return (
                <Card
                  key={lot.id}
                  className="rounded-2xl border border-amber-300 dark:border-amber-700 shadow-sm bg-amber-50/40 dark:bg-amber-900/10"
                  data-testid={`card-fazlalik-${lot.id}`}
                >
                  <div className="px-5 pt-3.5 pb-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{lot.urunAdi}</p>
                          {lot.lot && <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">LOT: {lot.lot}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted-foreground">
                          <Link href={`/records/${lot.siparisId}`}>
                            <span className="hover:underline text-primary cursor-pointer flex items-center gap-1">
                              {lot.siparisTitle} <ExternalLink className="w-2.5 h-2.5" />
                            </span>
                          </Link>
                          <span>·</span>
                          <span>Rezerve: {lot.rezervedMiktar.toLocaleString('tr-TR')} {lot.birim}</span>
                          <span>·</span>
                          <span>Taşınan: {(lot.tasindiMiktar ?? 0).toLocaleString('tr-TR')} {lot.birim}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-amber-600 dark:text-amber-400">
                          +{fazlalikMiktar.toLocaleString('tr-TR')} {lot.birim}
                        </p>
                        <p className="text-xs text-muted-foreground">fazlalık</p>
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-2 pt-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-xl h-8 text-xs gap-1.5 border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        onClick={() => openAtaModal(lot)}
                        data-testid={`button-siparis-ata-${lot.id}`}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Siparişe Ata
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-xl h-8 text-xs gap-1.5 border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        disabled={depoyaDonMutation.isPending}
                        onClick={() => depoyaDonMutation.mutate(lot.id)}
                        data-testid={`button-depoya-don-${lot.id}`}
                      >
                        {depoyaDonMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Warehouse className="w-3.5 h-3.5" />}
                        Depoya İade Et
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Üretime Taşı Modal ── */}
      <Dialog open={tasiModalOpen} onOpenChange={v => { if (!v) { setTasiModalOpen(false); setDogrulananLotlar(new Map()); } }}>
        <DialogContent className="max-w-lg rounded-2xl p-0 flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header with steps */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Truck className="w-5 h-5 text-emerald-500" />
              Üretime Taşı
            </DialogTitle>
            <div className="flex gap-1.5 mt-3">
              <div className={cn('h-1.5 flex-1 rounded-full transition-colors', step >= 1 ? 'bg-primary' : 'bg-muted')} />
              <div className={cn('h-1.5 flex-1 rounded-full transition-colors', step >= 2 ? 'bg-primary' : 'bg-muted')} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {step === 1 ? `Lot Seçimi — ${secilenIds.size} lot seçildi` : `Miktar Girişi — ${secilenLotlar.length} lot`}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* ── STEP 1: Lot Seçimi ── */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Ürün adı, lot veya sipariş ara..."
                    value={modalSearch}
                    onChange={e => setModalSearch(e.target.value)}
                    className="pl-9 rounded-xl"
                    data-testid="input-modal-search"
                  />
                </div>

                {filteredModal.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground opacity-60">
                    <Package className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">{modalSearch ? 'Eşleşen lot bulunamadı' : 'Depoda bekleyen rezerve lot yok'}</p>
                  </div>
                ) : (
                  filteredModal.map(lot => {
                    const selected = secilenIds.has(lot.id);
                    const kalanMiktar = kalan(lot);
                    return (
                      <button
                        key={lot.id}
                        className={cn(
                          'w-full text-left rounded-2xl border-2 p-3.5 transition-all',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border/40 hover:border-primary/40 hover:bg-muted/30'
                        )}
                        onClick={() => toggleSecim(lot.id)}
                        data-testid={`button-lot-sec-${lot.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            selected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40'
                          )}>
                            {selected && <CheckCircle2 className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{lot.urunAdi}</p>
                              <span className="text-xs bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">
                                {lot.kaynak === 'rr' ? 'Reçete' : 'HM'}
                              </span>
                              {(() => {
                                const st = siparisStatusMap.get(lot.siparisId);
                                if (st === 'in_progress') {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 animate-pulse" data-testid={`badge-uretimde-${lot.id}`}>
                                      <PlayCircle className="w-2.5 h-2.5" /> ÜRETİMDE
                                    </span>
                                  );
                                }
                                if (st === 'waiting_product') {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700" data-testid={`badge-bekliyor-${lot.id}`}>
                                      <Clock className="w-2.5 h-2.5" /> ÜRÜN BEKLİYOR
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {haftalikSet.has(lot.siparisId) && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700" data-testid={`badge-haftalik-${lot.id}`}>
                                  <CalendarDays className="w-2.5 h-2.5" /> HAFTALIK PLAN
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {lot.lot ? `LOT: ${lot.lot} · ` : ''}{lot.siparisTitle}
                            </p>
                            {(lot.tasindiMiktar ?? 0) > 0 && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                {(lot.tasindiMiktar ?? 0).toLocaleString('tr-TR')} {lot.birim} zaten taşındı
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm text-blue-600 dark:text-blue-400">
                              {kalanMiktar.toLocaleString('tr-TR')}
                            </p>
                            <p className="text-xs text-muted-foreground">{lot.birim}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* ── STEP 2: Miktar Girişi ── */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Taşımak istediğiniz miktarı girin. Kısmi taşıma ve fazla taşıma yapılabilir.
                  {barkodModu === 'siki' && (
                    <span className="block mt-1 text-amber-700 dark:text-amber-300 font-medium inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Sıkı mod açık — taşımadan önce her lotu barkodla doğrulayın.
                    </span>
                  )}
                </p>
                {secilenLotlar.map(lot => {
                  const kalanMiktar = kalan(lot);
                  const inputVal = parseFloat(miktarlar[lot.id] ?? '0') || 0;
                  const isFazla = inputVal > kalanMiktar && kalanMiktar > 0;
                  const dogrulandi = dogrulananLotlar.has(lot.id);
                  const dogrulamaKaynak = dogrulananLotlar.get(lot.id);
                  return (
                    <div
                      key={lot.id}
                      className={cn(
                        'p-3.5 rounded-2xl border space-y-2',
                        dogrulandi
                          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-border/60 bg-muted/10'
                      )}
                      data-testid={`modal-miktar-${lot.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold truncate">{lot.urunAdi}</p>
                            {(() => {
                              const st = siparisStatusMap.get(lot.siparisId);
                              if (st === 'in_progress') return (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 animate-pulse">
                                  <PlayCircle className="w-2.5 h-2.5" /> ÜRETİMDE
                                </span>
                              );
                              if (st === 'waiting_product') return (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700">
                                  <Clock className="w-2.5 h-2.5" /> ÜRÜN BEKLİYOR
                                </span>
                              );
                              return null;
                            })()}
                            {haftalikSet.has(lot.siparisId) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                                <CalendarDays className="w-2.5 h-2.5" /> HAFTALIK PLAN
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lot.lot ? `LOT: ${lot.lot} · ` : ''}{lot.siparisTitle}
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                            Rezerve: {lot.rezervedMiktar.toLocaleString('tr-TR')} {lot.birim}
                            {lot.stokMiktar != null && (
                              <span className="text-muted-foreground ml-1.5">/ Lot toplamı: {lot.stokMiktar.toLocaleString('tr-TR')}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            className={cn(
                              'w-24 h-9 text-sm rounded-xl text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                              isFazla && 'border-amber-400 focus-visible:ring-amber-400'
                            )}
                            value={miktarlar[lot.id] ?? ''}
                            onChange={e => setMiktarlar(prev => ({ ...prev, [lot.id]: e.target.value }))}
                            data-testid={`input-miktar-${lot.id}`}
                          />
                          <span className="text-xs text-muted-foreground w-10">{lot.birim}</span>
                        </div>
                      </div>
                      {isFazla && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>+{(inputVal - kalanMiktar).toLocaleString('tr-TR', { maximumFractionDigits: 3 })} {lot.birim} fazlalık üretime gidecek</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1.5 border-t border-border/40">
                        {dogrulandi ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300" data-testid={`badge-dogrulandi-${lot.id}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Barkodla doğrulandı
                            <span className="text-[10px] font-normal text-muted-foreground ml-1">
                              ({dogrulamaKaynak === 'kamera' ? 'kamera' : dogrulamaKaynak === 'fiziksel' ? 'tarayıcı' : 'manuel'})
                            </span>
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-lg gap-1.5 h-8 text-xs"
                            onClick={() => setScannerLotId(lot.id)}
                            data-testid={`button-barkod-tara-${lot.id}`}
                          >
                            <ScanLine className="w-3.5 h-3.5" /> Barkod tara
                          </Button>
                        )}
                        <Link href={`/etiket/depo-hareket/${lot.id}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-lg gap-1.5 h-8 text-xs"
                            data-testid={`link-etiket-${lot.id}`}
                          >
                            <QrCode className="w-3.5 h-3.5" /> Etiket
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-4 border-t flex gap-2 shrink-0">
            {step === 1 ? (
              <>
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setTasiModalOpen(false); setDogrulananLotlar(new Map()); }}>
                  İptal
                </Button>
                <Button
                  className="flex-1 rounded-xl gap-1"
                  disabled={secilenIds.size === 0}
                  onClick={goToStep2}
                  data-testid="button-modal-ileri"
                >
                  İleri ({secilenIds.size})
                  <span className="ml-0.5">→</span>
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1 rounded-xl gap-1" onClick={() => setStep(1)}>
                  ← Geri
                </Button>
                <Button
                  className="flex-1 rounded-xl gap-2"
                  onClick={handleTasi}
                  disabled={tasiMutation.isPending || sikiModEngelliyor}
                  title={sikiModEngelliyor
                    ? `${eksikDogrulamaSayisi} lot barkodla doğrulanmadı (sıkı mod açık)`
                    : undefined}
                  data-testid="button-confirm-tasi"
                >
                  {tasiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  {sikiModEngelliyor ? `Taşı (${eksikDogrulamaSayisi} eksik)` : 'Taşı'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Barkod Tarayıcı ── */}
      <BarcodeScanner
        open={scannerLotId != null}
        onClose={() => setScannerLotId(null)}
        onScan={handleScan}
        title="Lot Barkodunu Doğrula"
        subtitle={(() => {
          const l = scannerLotId != null ? rezerveler.find(r => r.id === scannerLotId) : null;
          return l ? `${l.urunAdi}${l.lot ? ` · LOT ${l.lot}` : ''} (BTX-DH-${l.id})` : undefined;
        })()}
      />

      {/* ── Siparişe Ata Modal ── */}
      <Dialog open={!!ataModalLot} onOpenChange={v => { if (!v) setAtaModalLot(null); }}>
        <DialogContent className="max-w-md rounded-2xl p-0 flex flex-col max-h-[90vh] overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Share2 className="w-5 h-5 text-amber-500" />
              Siparişe Ata
            </DialogTitle>
            {ataModalLot && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{ataModalLot.urunAdi}</span>
                {ataModalLot.lot ? ` · LOT: ${ataModalLot.lot}` : ''}
                {' · '}
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  +{((ataModalLot.tasindiMiktar ?? 0) - ataModalLot.rezervedMiktar).toLocaleString('tr-TR')} {ataModalLot.birim} fazlalık
                </span>
              </p>
            )}
          </DialogHeader>

          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {/* Miktar input */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Atanacak Miktar ({ataModalLot?.birim})</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  max={ataModalLot ? (ataModalLot.tasindiMiktar ?? 0) - ataModalLot.rezervedMiktar : undefined}
                  className="rounded-xl"
                  value={ataMiktar}
                  onChange={e => setAtaMiktar(e.target.value)}
                  data-testid="input-ata-miktar"
                />
                <span className="text-sm text-muted-foreground shrink-0">
                  maks: {ataModalLot ? ((ataModalLot.tasindiMiktar ?? 0) - ataModalLot.rezervedMiktar).toLocaleString('tr-TR') : 0} {ataModalLot?.birim}
                </span>
              </div>
            </div>

            {/* Sipariş seçimi */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hedef Sipariş</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Sipariş ara..."
                  className="pl-8 rounded-xl"
                  value={ataSearch}
                  onChange={e => setAtaSearch(e.target.value)}
                  data-testid="input-ata-search"
                />
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto mt-1">
                {filteredSiparisler.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-4">Uygun aktif sipariş bulunamadı</p>
                ) : (
                  filteredSiparisler.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setAtaHedefId(s.id)}
                      className={cn(
                        'w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors',
                        ataHedefId === s.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border/60 bg-muted/10 hover:bg-muted/30'
                      )}
                      data-testid={`option-siparis-${s.id}`}
                    >
                      <span className="font-medium">{s.title}</span>
                      {s.lotNumber && <span className="text-muted-foreground ml-2 text-xs">LOT: {s.lotNumber}</span>}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-4 border-t flex gap-2 shrink-0">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setAtaModalLot(null)}>
              İptal
            </Button>
            <Button
              className="flex-1 rounded-xl gap-2"
              disabled={!ataHedefId || !ataMiktar || Number(ataMiktar) <= 0 || siparisAtaMutation.isPending}
              onClick={handleSiparisAta}
              data-testid="button-confirm-ata"
            >
              {siparisAtaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Ata
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Anomali bildirim dialogu */}
      <AnomalyReportDialog
        lot={anomalyDialogLot}
        open={!!anomalyDialogLot}
        onOpenChange={(v) => { if (!v) setAnomalyDialogLot(null); }}
      />
    </div>
  );
}
