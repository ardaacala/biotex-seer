import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, CheckCircle2, Package, FlaskConical, ChevronDown, ChevronUp, Link as LinkIcon, PenLine, Check, X, Info, Receipt, RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { ReceteItem } from '@shared/schema';
import { Checkbox } from '@/components/ui/checkbox';
import { useExchangeRates, convertAll, formatMoney, CURRENCIES, type Currency } from '@/hooks/use-exchange-rates';
import { cn } from '@/lib/utils';

type StokKategori = { id: number; ad: string };
type StokAltTur = { id: number; ad: string; kategoriId: number; birim: string | null };

type GelenRecord = {
  id: number;
  title: string;
  lotNumber: string | null;
  customer: string | null;
  totalQuantity: number;
  itemsPerBox: number;
  createdAt: Date | null;
  revisedAt: Date | null;
  items: { id: number; name: string; category: string | null; unitQuantity: number; unitPrice: string | number | null; unitPriceCurrency?: string | null }[];
  recete: ReceteItem[];
};

const APPROVAL_WINDOW_DAYS = 7;
const APPROVAL_WINDOW_MS = APPROVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const BIRIM_OPTIONS = ['adet', 'metre', 'metrekare', 'kg'] as const;
const NEW_VALUE_KEY = '__new__';

function InlineNewInput({
  placeholder,
  onConfirm,
  onCancel,
  isPending,
}: {
  placeholder: string;
  onConfirm: (val: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [val, setVal] = useState('');
  return (
    <div className="flex items-center gap-1 mt-1">
      <Input
        autoFocus
        className="h-7 text-xs rounded-lg flex-1"
        placeholder={placeholder}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onConfirm(val.trim()); if (e.key === 'Escape') onCancel(); }}
        data-testid="input-new-tur-inline"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-emerald-600"
        disabled={!val.trim() || isPending}
        onClick={() => onConfirm(val.trim())}
        data-testid="button-confirm-new-tur"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={onCancel} data-testid="button-cancel-new-tur">
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

function ReceteSection({ record }: { record: GelenRecord }) {
  const { user } = useAuth();
  const isManager = user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedKategoriId, setSelectedKategoriId] = useState<number | null>(null);
  const [stokTur, setStokTur] = useState('');
  const [stokAltTur, setStokAltTur] = useState('');
  const [miktar, setMiktar] = useState('');
  const [birim, setBirim] = useState<string>('adet');

  const [addingNewTur, setAddingNewTur] = useState(false);
  const [addingNewAltTur, setAddingNewAltTur] = useState(false);

  const { data: kategoriler = [] } = useQuery<StokKategori[]>({
    queryKey: ['/api/stok-kategoriler'],
    queryFn: () => fetch('/api/stok-kategoriler', { credentials: 'include' }).then(r => r.json()),
  });

  const { data: altTurler = [] } = useQuery<StokAltTur[]>({
    queryKey: ['/api/stok-alt-turler', selectedKategoriId],
    queryFn: () => fetch(`/api/stok-alt-turler?kategoriId=${selectedKategoriId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: selectedKategoriId !== null,
  });

  type AltTurStokInfo = { altTur: string; lots: any[]; totalMiktar: number; totalRezeve: number; birim: string };
  const { data: altTurStokInfo } = useQuery<AltTurStokInfo>({
    queryKey: ['/api/stok/alt-tur', stokAltTur],
    queryFn: () => fetch(`/api/stok/alt-tur/${encodeURIComponent(stokAltTur)}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!stokAltTur,
  });

  const miktarNum = Number(miktar);
  const totalMiktar = miktarNum > 0 ? miktarNum * record.totalQuantity : 0;

  const hasLots = altTurStokInfo && altTurStokInfo.lots.length > 0;
  const freeStock = altTurStokInfo ? altTurStokInfo.totalMiktar - altTurStokInfo.totalRezeve : null;
  const stockSufficient = freeStock !== null && totalMiktar > 0 ? freeStock >= totalMiktar : null;

  const birimOptions: { value: string; label: string; note?: string; ok?: boolean }[] = hasLots
    ? [{ value: altTurStokInfo!.birim, label: altTurStokInfo!.birim, note: `${freeStock!.toFixed(1)} serbest`, ok: (freeStock ?? 0) > 0 }]
    : BIRIM_OPTIONS.map(b => ({ value: b, label: b, note: stokAltTur ? 'bu türde lot yok' : undefined }));

  useEffect(() => {
    if (hasLots && altTurStokInfo?.birim) {
      setBirim(altTurStokInfo.birim);
    }
  }, [altTurStokInfo, hasLots]);

  const createKategoriMutation = useMutation({
    mutationFn: (ad: string) => apiRequest('POST', '/api/stok-kategoriler', { ad }).then(r => r.json()),
    onSuccess: (created: StokKategori) => {
      queryClient.invalidateQueries({ queryKey: ['/api/stok-kategoriler'] });
      setStokTur(created.ad);
      setSelectedKategoriId(created.id);
      setStokAltTur('');
      setAddingNewTur(false);
      toast({ title: `"${created.ad}" türü eklendi` });
    },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  const createAltTurMutation = useMutation({
    mutationFn: (ad: string) => apiRequest('POST', '/api/stok-alt-turler', { ad, kategoriId: selectedKategoriId, birim }).then(r => r.json()),
    onSuccess: (created: StokAltTur) => {
      queryClient.invalidateQueries({ queryKey: ['/api/stok-alt-turler', selectedKategoriId] });
      setStokAltTur(created.ad);
      setAddingNewAltTur(false);
      toast({ title: `"${created.ad}" alt türü eklendi` });
    },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/recete/${record.id}`, { stokTur, stokAltTur, miktar: totalMiktar, birim }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gelen'] });
      setSelectedKategoriId(null); setStokTur(''); setStokAltTur(''); setMiktar(''); setBirim('adet');
      toast({ title: 'Reçete kalemi eklendi' });
    },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest('DELETE', `/api/recete/${record.id}/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gelen'] });
      toast({ title: 'Reçete kalemi silindi' });
    },
    onError: (e: any) => toast({ title: 'Hata', description: e.message, variant: 'destructive' }),
  });

  const canAdd = stokTur.trim() && stokAltTur.trim() && miktarNum > 0;

  return (
    <div className="mt-4 border-t border-border/50 pt-4">
      <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
        <FlaskConical className="w-3.5 h-3.5" /> Reçete (BOM)
      </p>

      {record.recete.length === 0 ? (
        <p className="text-xs text-muted-foreground italic mb-3">Henüz reçete kalemi eklenmedi.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {record.recete.map(item => {
            const perUnit = record.totalQuantity > 0 ? Number(item.miktar) / record.totalQuantity : Number(item.miktar);
            return (
              <div key={item.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2" data-testid={`recete-item-${item.id}`}>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{item.stokTur}</span>
                  {item.stokAltTur && <span className="text-xs text-muted-foreground ml-1.5">/ {item.stokAltTur}</span>}
                  <span className="ml-2 text-sm font-semibold text-primary">{Number(item.miktar)} {item.birim}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">(1 adet: {Number(perUnit % 1 === 0 ? perUnit : perUnit.toFixed(3))} {item.birim})</span>
                </div>
                {isManager && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-recete-${item.id}`}
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isManager && (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-2 mb-1">
            <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-tight">
              Miktar, <strong>1 adet</strong> için gereken miktarı girin. Sipariş toplam <strong>{record.totalQuantity} adet</strong> olduğundan toplam gereksinim otomatik hesaplanır.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Stok Türü *</Label>
              {addingNewTur ? (
                <InlineNewInput
                  placeholder="Yeni tür adı..."
                  onConfirm={val => createKategoriMutation.mutate(val)}
                  onCancel={() => setAddingNewTur(false)}
                  isPending={createKategoriMutation.isPending}
                />
              ) : (
                <Select
                  value={selectedKategoriId ? String(selectedKategoriId) : ''}
                  onValueChange={v => {
                    if (v === NEW_VALUE_KEY) { setAddingNewTur(true); return; }
                    const kat = kategoriler.find(k => k.id === Number(v));
                    if (kat) { setSelectedKategoriId(kat.id); setStokTur(kat.ad); setStokAltTur(''); }
                  }}
                >
                  <SelectTrigger className="h-8 rounded-lg text-sm" data-testid="select-recete-stok-tur">
                    <SelectValue placeholder="Tür seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {kategoriler.map(k => (
                      <SelectItem key={k.id} value={String(k.id)}>{k.ad}</SelectItem>
                    ))}
                    <SelectItem value={NEW_VALUE_KEY}>
                      <span className="flex items-center gap-1.5 text-primary font-medium">
                        <PenLine className="w-3 h-3" /> Yeni tür ekle...
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Alt Tür *</Label>
              {addingNewAltTur ? (
                <InlineNewInput
                  placeholder="Yeni alt tür adı..."
                  onConfirm={val => createAltTurMutation.mutate(val)}
                  onCancel={() => setAddingNewAltTur(false)}
                  isPending={createAltTurMutation.isPending}
                />
              ) : (
                <Select
                  value={stokAltTur}
                  onValueChange={v => {
                    if (v === NEW_VALUE_KEY) { setAddingNewAltTur(true); return; }
                    setStokAltTur(v);
                    setBirim('adet');
                  }}
                  disabled={!selectedKategoriId}
                >
                  <SelectTrigger className="h-8 rounded-lg text-sm" data-testid="select-recete-alt-tur">
                    <SelectValue placeholder={selectedKategoriId ? 'Alt tür seçin...' : 'Önce tür seçin'} />
                  </SelectTrigger>
                  <SelectContent>
                    {altTurler.map(a => (
                      <SelectItem key={a.id} value={a.ad}>{a.ad}</SelectItem>
                    ))}
                    <SelectItem value={NEW_VALUE_KEY}>
                      <span className="flex items-center gap-1.5 text-primary font-medium">
                        <PenLine className="w-3 h-3" /> Yeni alt tür ekle...
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 items-end">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">1 Adet İçin Miktar *</Label>
              <Input
                className="h-8 rounded-lg text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                inputMode="decimal"
                placeholder="0"
                value={miktar}
                onChange={e => setMiktar(e.target.value.replace(/[^0-9.]/g, ''))}
                data-testid="input-recete-miktar"
              />
              {miktarNum > 0 && (
                <p className={`text-[10px] font-medium leading-tight ${stockSufficient === false ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  Toplam: {miktarNum} × {record.totalQuantity} = <strong>{totalMiktar} {birim}</strong>
                  {stockSufficient === false && ' ⚠ yetersiz stok'}
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Birim</Label>
              <Select value={birim} onValueChange={setBirim}>
                <SelectTrigger className="h-8 rounded-lg text-sm" data-testid="select-recete-birim">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {birimOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <span>{opt.label}</span>
                        {opt.note && (
                          <span className={`text-[10px] font-normal ${opt.ok === false ? 'text-destructive' : opt.ok === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                            {opt.note}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="h-8 rounded-lg text-sm col-span-1"
              onClick={() => addMutation.mutate()}
              disabled={!canAdd || addMutation.isPending}
              data-testid="button-add-recete"
            >
              {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemPriceEditor({ recordId, item, canEdit }: {
  recordId: number;
  item: GelenRecord['items'][number];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(item.unitPrice != null ? String(item.unitPrice) : '');
  const [currency, setCurrency] = useState<Currency>((item.unitPriceCurrency ?? 'TRY') as Currency);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setPrice(item.unitPrice != null ? String(item.unitPrice) : '');
    setCurrency((item.unitPriceCurrency ?? 'TRY') as Currency);
  }, [item.unitPrice, item.unitPriceCurrency]);

  const mutation = useMutation({
    mutationFn: (body: { unitPrice: string | null; unitPriceCurrency: Currency }) =>
      apiRequest('PUT', `/api/records/${recordId}/items/${item.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gelen'] });
      toast({ title: 'Fiyat güncellendi' });
      setEditing(false);
    },
    onError: (e: any) => toast({ title: 'Hata', description: e?.message ?? String(e), variant: 'destructive' }),
  });

  const priceNum = item.unitPrice != null ? Number(item.unitPrice) : null;
  const cur = (item.unitPriceCurrency ?? 'TRY') as Currency;

  if (!canEdit) {
    if (priceNum == null) return <span className="text-[11px] text-muted-foreground italic">fiyat yok</span>;
    return (
      <span className="text-[11px] text-muted-foreground" data-testid={`text-gelen-item-price-${item.id}`}>
        {formatMoney(priceNum, cur)} × {item.unitQuantity}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          inputMode="decimal"
          value={price}
          onChange={e => setPrice(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
          placeholder="0.00"
          className="h-7 w-20 rounded text-[11px] px-1.5"
          data-testid={`input-gelen-item-price-${item.id}`}
        />
        <Select value={currency} onValueChange={v => setCurrency(v as Currency)}>
          <SelectTrigger className="h-7 w-[60px] rounded text-[11px]" data-testid={`select-gelen-item-currency-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({
            unitPrice: price.trim() ? price.trim() : null,
            unitPriceCurrency: currency,
          })}
          data-testid={`button-save-gelen-item-price-${item.id}`}
        >
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
          onClick={() => setEditing(false)}
          data-testid={`button-cancel-gelen-item-price-${item.id}`}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 text-[11px] hover:bg-muted/50 rounded px-1.5 py-0.5 transition-colors group"
      data-testid={`button-edit-gelen-item-price-${item.id}`}
    >
      {priceNum != null ? (
        <span className="text-muted-foreground" data-testid={`text-gelen-item-price-${item.id}`}>
          {formatMoney(priceNum, cur)} × {item.unitQuantity} ={' '}
          <strong className="text-emerald-700 dark:text-emerald-400">
            {formatMoney(priceNum * item.unitQuantity, cur)}
          </strong> /adet
        </span>
      ) : (
        <span className="text-muted-foreground italic">fiyat ekle</span>
      )}
      <PenLine className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function GelenCard({ record }: { record: GelenRecord }) {
  const { user } = useAuth();
  const isManager = user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);
  const canSeePrice = user?.role === 'admin' || user?.role === 'ofis_calisan';
  const canEditPrice = user?.role === 'admin' || user?.role === 'ofis_calisan';
  const [kdvOn, setKdvOn] = useState(false);
  const [kdvPct, setKdvPct] = useState('20');
  const [iscilikOn, setIscilikOn] = useState(false);
  const [iscilikMode, setIscilikMode] = useState<'pct' | 'manual'>('pct');
  const [iscilikPct, setIscilikPct] = useState('10');
  const [iscilikManual, setIscilikManual] = useState('');
  const [grandCurrency, setGrandCurrency] = useState<Currency>('TRY');
  const { data: rates } = useExchangeRates();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const baseTime = record.revisedAt ?? record.createdAt;
  const deadline = baseTime ? new Date(baseTime).getTime() + APPROVAL_WINDOW_MS : null;
  const now = Date.now();
  const isExpired = deadline != null && now > deadline;
  const daysLeft = deadline != null ? Math.max(0, Math.ceil((deadline - now) / (24 * 60 * 60 * 1000))) : null;

  const reviseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/gelen/${record.id}/revize`);
      const data = await res.json();
      if (!res.ok) throw data;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gelen'] });
      toast({ title: 'Sipariş revize edildi', description: `Onay süresi ${APPROVAL_WINDOW_DAYS} gün uzatıldı.` });
    },
    onError: (e: any) => {
      toast({ title: 'Hata', description: e?.message ?? String(e), variant: 'destructive' });
    },
  });

  const onaylaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/gelen/${record.id}/onayla`);
      const data = await res.json();
      if (!res.ok) throw data;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gelen'] });
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
      toast({ title: 'Sipariş onaylandı', description: `${record.title} aktif siparişlere taşındı.` });
    },
    onError: (e: any) => {
      if (e?.expired) {
        toast({ title: 'Onay süresi doldu', description: e.message, variant: 'destructive' });
        queryClient.invalidateQueries({ queryKey: ['/api/gelen'] });
        return;
      }
      if (e?.shortfalls?.length) {
        const lines = e.shortfalls.map((s: any) =>
          `• "${s.altTur}": gereken ${s.needed} ${s.birim}, serbest ${s.free.toFixed(1)} ${s.birim}`
        ).join('\n');
        toast({
          title: 'Yetersiz serbest stok',
          description: lines,
          variant: 'destructive',
          duration: 8000,
        });
      } else {
        toast({ title: 'Hata', description: e?.message ?? String(e), variant: 'destructive' });
      }
    },
  });

  return (
    <Card className="rounded-2xl border-border/50 shadow-sm" data-testid={`gelen-card-${record.id}`}>
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{record.title}</h3>
              {record.lotNumber && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {record.lotNumber}
                </Badge>
              )}
              <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0 shrink-0">
                Gelen
              </Badge>
            </div>
            {record.customer && (
              <p className="text-sm text-muted-foreground mt-0.5">{record.customer}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {record.totalQuantity} adet • {record.itemsPerBox} adet/koli
              {record.createdAt && (
                <span> • {format(new Date(record.createdAt), 'd MMM yyyy', { locale: tr })}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/records/${record.id}`}>
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs gap-1" data-testid={`button-detail-${record.id}`}>
                <LinkIcon className="w-3.5 h-3.5" />
                Detay
              </Button>
            </Link>
            {isManager && (
              isExpired ? (
                <Button
                  size="sm"
                  className="h-8 rounded-xl text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => reviseMutation.mutate()}
                  disabled={reviseMutation.isPending}
                  title={`Onay süresi doldu. Revize edildiğinde ${APPROVAL_WINDOW_DAYS} gün uzatılır.`}
                  data-testid={`button-revize-${record.id}`}
                >
                  {reviseMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RotateCcw className="w-3.5 h-3.5" />}
                  Revize Et
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 rounded-xl text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onaylaMutation.mutate()}
                  disabled={onaylaMutation.isPending}
                  title={daysLeft != null ? `Onay için kalan: ${daysLeft} gün` : undefined}
                  data-testid={`button-onayla-${record.id}`}
                >
                  {onaylaMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Onayla{daysLeft != null && daysLeft <= 3 ? ` (${daysLeft}g)` : ''}
                </Button>
              )
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {record.items.length > 0 && (
          <div className="mb-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground font-semibold mb-2">
              <Package className="w-3.5 h-3.5" />
              İçerikler ({record.items.length})
            </p>
            <div className="space-y-1">
              {record.items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 text-sm bg-muted/20 rounded-lg px-3 py-1.5 flex-wrap"
                  data-testid={`gelen-item-row-${item.id}`}
                >
                  <span className="flex-1 text-sm font-medium min-w-[120px]">{item.name}</span>
                  {item.category && <Badge variant="outline" className="text-[10px]">{item.category}</Badge>}
                  <span className="text-[11px] text-muted-foreground">{item.unitQuantity} adet/set</span>
                  {canSeePrice && (
                    <ItemPriceEditor recordId={record.id} item={item} canEdit={!!canEditPrice} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {canSeePrice && (() => {
          const subsByCur: Record<Currency, number> = { TRY: 0, USD: 0, EUR: 0 };
          let subTRY = 0;
          for (const it of record.items) {
            if (it.unitPrice == null) continue;
            const cur = (it.unitPriceCurrency ?? 'TRY') as Currency;
            const line = Number(it.unitPrice) * it.unitQuantity * record.totalQuantity;
            subsByCur[cur] += line;
            if (rates) {
              const all = convertAll(line, cur, rates);
              if (all) subTRY += all.TRY;
            } else if (cur === 'TRY') subTRY += line;
          }
          const pct = Math.max(0, Number((kdvPct || '0').replace(',', '.')) || 0);
          const kdvTRY = kdvOn ? subTRY * pct / 100 : 0;
          const iPct = Math.max(0, Number((iscilikPct || '0').replace(',', '.')) || 0);
          const iManual = Math.max(0, Number((iscilikManual || '0').replace(',', '.')) || 0);
          const iscilikTRY = iscilikOn
            ? (iscilikMode === 'pct' ? subTRY * iPct / 100 : iManual)
            : 0;
          const grandTRY = subTRY + kdvTRY + iscilikTRY;
          const grandAll = convertAll(grandTRY, 'TRY', rates);
          const usedCurrencies = CURRENCIES.filter(c => subsByCur[c] > 0);
          const hasAnyPrice = record.items.some(i => i.unitPrice != null);
          if (!hasAnyPrice && record.items.length === 0) {
            return (
              <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/10 px-3 py-2.5 text-center" data-testid={`section-gelen-totals-empty-${record.id}`}>
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <Receipt className="w-3 h-3" />
                  Fiyat özeti için önce içerik eklenmelidir.
                </p>
              </div>
            );
          }
          if (!hasAnyPrice) {
            return (
              <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/10 px-3 py-2.5 text-center" data-testid={`section-gelen-totals-empty-${record.id}`}>
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <Receipt className="w-3 h-3" />
                  İçeriklerin fiyatlarını girince ara toplam, KDV ve genel toplam burada görünecek.
                </p>
              </div>
            );
          }
          return (
            <div className="mb-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5 space-y-2" data-testid={`section-gelen-totals-${record.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Receipt className="w-3 h-3" /> Ara Toplam
                </span>
                <div className="text-right">
                  {usedCurrencies.length > 1 && (
                    <div className="space-y-0.5">
                      {usedCurrencies.map(c => (
                        <p key={c} className="text-[10px] text-muted-foreground">{formatMoney(subsByCur[c], c)}</p>
                      ))}
                    </div>
                  )}
                  <p className="font-semibold">{formatMoney(subTRY, 'TRY')}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={kdvOn}
                    onCheckedChange={(v) => setKdvOn(!!v)}
                    data-testid={`checkbox-gelen-kdv-${record.id}`}
                    className="h-3.5 w-3.5"
                  />
                  <span>KDV {kdvOn ? 'dahil' : 'hariç'}</span>
                </label>
                <div className="flex items-center gap-1">
                  <Input
                    inputMode="decimal"
                    disabled={!kdvOn}
                    value={kdvPct}
                    onChange={e => setKdvPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="h-6 w-14 rounded text-[11px] px-1.5"
                    data-testid={`input-gelen-kdv-pct-${record.id}`}
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                  {kdvOn && (
                    <span className="text-[11px] font-medium ml-1" data-testid={`text-gelen-kdv-amount-${record.id}`}>
                      = {formatMoney(kdvTRY, 'TRY')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={iscilikOn}
                    onCheckedChange={(v) => setIscilikOn(!!v)}
                    data-testid={`checkbox-gelen-iscilik-${record.id}`}
                    className="h-3.5 w-3.5"
                  />
                  <span>İşçilik {iscilikOn ? 'dahil' : 'hariç'}</span>
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  <div className="flex rounded border border-border overflow-hidden h-6 text-[10px]">
                    <button
                      type="button"
                      disabled={!iscilikOn}
                      onClick={() => setIscilikMode('pct')}
                      className={cn(
                        'px-1.5 font-medium transition-colors disabled:opacity-50',
                        iscilikMode === 'pct' ? 'bg-emerald-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                      )}
                      data-testid={`button-gelen-iscilik-mode-pct-${record.id}`}
                    >%</button>
                    <button
                      type="button"
                      disabled={!iscilikOn}
                      onClick={() => setIscilikMode('manual')}
                      className={cn(
                        'px-1.5 font-medium transition-colors border-l border-border disabled:opacity-50',
                        iscilikMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                      )}
                      data-testid={`button-gelen-iscilik-mode-manual-${record.id}`}
                    >Manuel</button>
                  </div>
                  {iscilikMode === 'pct' ? (
                    <>
                      <Input
                        inputMode="decimal"
                        disabled={!iscilikOn}
                        value={iscilikPct}
                        onChange={e => setIscilikPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="h-6 w-14 rounded text-[11px] px-1.5"
                        data-testid={`input-gelen-iscilik-pct-${record.id}`}
                      />
                      <span className="text-[11px] text-muted-foreground">%</span>
                    </>
                  ) : (
                    <>
                      <Input
                        inputMode="decimal"
                        disabled={!iscilikOn}
                        placeholder="0,00"
                        value={iscilikManual}
                        onChange={e => setIscilikManual(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="h-6 w-20 rounded text-[11px] px-1.5"
                        data-testid={`input-gelen-iscilik-manual-${record.id}`}
                      />
                      <span className="text-[11px] text-muted-foreground">₺</span>
                    </>
                  )}
                  {iscilikOn && (
                    <span className="text-[11px] font-medium ml-1" data-testid={`text-gelen-iscilik-amount-${record.id}`}>
                      = {formatMoney(iscilikTRY, 'TRY')}
                    </span>
                  )}
                </div>
              </div>
              <div className="border-t border-emerald-200/70 dark:border-emerald-900/50 pt-2 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Genel Toplam</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400" data-testid={`text-gelen-grand-total-${record.id}`}>
                    {grandAll ? formatMoney(grandAll[grandCurrency], grandCurrency) : formatMoney(grandTRY, 'TRY')}
                  </span>
                </div>
                {grandAll && (
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    {CURRENCIES.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setGrandCurrency(c)}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          grandCurrency === c
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-transparent text-muted-foreground hover:bg-muted border-border'
                        )}
                        data-testid={`button-gelen-currency-${record.id}-${c}`}
                      >
                        {formatMoney(grandAll[c], c)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <ReceteSection record={record} />
      </CardContent>
    </Card>
  );
}

function YeniGelenButton() {
  const [, setLocation] = useLocation();
  return (
    <Button
      className="rounded-xl gap-2 font-semibold shadow-lg hover:-translate-y-0.5 transition-transform"
      onClick={() => setLocation('/gelen/new')}
      data-testid="button-new-gelen"
    >
      <Plus className="w-5 h-5" />
      Yeni Gelen Sipariş
    </Button>
  );
}

export default function GelenSiparislerPage() {
  const { user } = useAuth();
  const isManager = user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);

  const { data, isLoading } = useQuery<GelenRecord[]>({
    queryKey: ['/api/gelen'],
    queryFn: () => fetch('/api/gelen', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Gelen Siparişler</h1>
          <p className="text-muted-foreground mt-1">Onay bekleyen gelen siparişleri yönetin.</p>
        </div>
        {isManager && <YeniGelenButton />}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div className="py-20 flex flex-col items-center justify-center text-center bg-card/30 rounded-3xl border border-dashed border-border">
          <div className="bg-muted p-4 rounded-full mb-4">
            <Package className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold font-display">Gelen sipariş yok</h3>
          <p className="text-muted-foreground max-w-sm mt-2">
            Onay bekleyen gelen sipariş bulunmuyor.
          </p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="space-y-4">
          {data.map(record => (
            <GelenCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}
