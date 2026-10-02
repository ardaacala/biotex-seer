import { useState } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrderItems, useCreateOrderItem, useUpdateOrderItem, useDeleteOrderItem } from '@/hooks/use-order-items';
import { useItemLibrary } from '@/hooks/use-item-library';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, Plus, Trash2, Edit2, Check, X, BookOpen, Package,
  Layers, Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderItem, ItemLibraryEntry, StokKategori, StokAltTur } from '@shared/schema';
import { useExchangeRates, convertAll, formatMoney, CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '@/hooks/use-exchange-rates';

const parsePrice = (s: string): number | undefined => {
  const v = (s ?? '').replace(',', '.').trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

type Category = 'Kumaş' | 'Diğer';

interface Props {
  recordId: number;
  totalQuantity: number;
  itemsPerBox?: number;
  readonly?: boolean;
  orderType?: string;
}

function CategoryToggle({ value, onChange }: { value: Category; onChange: (v: Category) => void }) {
  return (
    <div className="flex rounded-xl border border-border overflow-hidden h-9 text-sm">
      <button
        type="button"
        onClick={() => onChange('Kumaş')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-3 font-medium transition-colors',
          value === 'Kumaş' ? 'bg-blue-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
        )}
        data-testid="category-kumas"
      >
        <Layers className="w-3.5 h-3.5" />Kumaş
      </button>
      <button
        type="button"
        onClick={() => onChange('Diğer')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-3 font-medium transition-colors border-l border-border',
          value === 'Diğer' ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
        )}
        data-testid="category-diger"
      >
        <Package className="w-3.5 h-3.5" />Diğer
      </button>
    </div>
  );
}

function CategoryBadge({ category, fabricType }: { category: string; fabricType?: string | null }) {
  const isKumas = category === 'Kumaş';
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
        isKumas ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-muted text-muted-foreground'
      )}>
        {isKumas ? <Layers className="w-2.5 h-2.5" /> : <Package className="w-2.5 h-2.5" />}
        {category}
      </span>
      {isKumas && fabricType && (
        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium pl-1 truncate max-w-[96px]">{fabricType}</span>
      )}
    </div>
  );
}

const ALL_FABRIC_PHASES = ['pastal', 'urun_islem', 'katlama'] as const;
const STOK_FABRIC_PHASES = ['pastal', 'urun_islem'] as const;
const FABRIC_PHASE_LABELS: Record<string, string> = { pastal: 'Pastal', urun_islem: 'Ürün İşlem', katlama: 'Katlama' };

const EMPTY_NEW_ITEM = {
  name: '', unitQuantity: '1', description: '',
  category: 'Diğer' as Category, fabricType: '', fabricPhases: [] as string[],
  stokTurHedef: '', stokAltTurHedef: '', unitPrice: '',
  unitPriceCurrency: 'TRY' as Currency,
};

type EditItemState = {
  name: string; unitQuantity: string; description: string;
  category: Category; fabricType: string; fabricPhases: string[];
  stokTurHedef?: string; stokAltTurHedef?: string;
  unitPrice: string;
  unitPriceCurrency: Currency;
};

export function OrderItemsSection({ recordId, totalQuantity, itemsPerBox = 1, readonly = false, orderType = 'musteri' }: Props) {
  const { data: items, isLoading } = useOrderItems(recordId);
  const { data: library } = useItemLibrary();
  const { data: kategoriler = [] } = useQuery<StokKategori[]>({ queryKey: ['/api/stok-kategoriler'] });
  const { data: allAltTurler = [] } = useQuery<StokAltTur[]>({ queryKey: ['/api/stok-alt-turler'] });
  const { toast } = useToast();
  const isStokOrder = orderType === 'stok';
  const { user } = useAuth();
  const canSeePrice = user?.role === 'admin' || user?.role === 'ofis_calisan';
  const { data: rates } = useExchangeRates();
  const [kdvOn, setKdvOn] = useState(false);
  const [kdvPct, setKdvPct] = useState('20');
  const [iscilikOn, setIscilikOn] = useState(false);
  const [iscilikMode, setIscilikMode] = useState<'pct' | 'manual'>('pct');
  const [iscilikPct, setIscilikPct] = useState('10');
  const [iscilikManual, setIscilikManual] = useState('');
  const [grandTotalCurrency, setGrandTotalCurrency] = useState<Currency>('TRY');

  const createMutation = useCreateOrderItem(recordId);
  const updateMutation = useUpdateOrderItem(recordId);
  const deleteMutation = useDeleteOrderItem(recordId);

  const defaultPhases: string[] = [];

  const [showForm, setShowForm] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ ...EMPTY_NEW_ITEM, fabricPhases: defaultPhases as string[] });
  const [editItem, setEditItem] = useState<EditItemState>({
    name: '', unitQuantity: '1', description: '',
    category: 'Diğer', fabricType: '', fabricPhases: defaultPhases,
    stokTurHedef: '', stokAltTurHedef: '', unitPrice: '',
    unitPriceCurrency: 'TRY',
  });
  const [librarySearch, setLibrarySearch] = useState('');

  const filteredLibrary = library?.filter(l =>
    normalizeForSearch(l.name).includes(normalizeForSearch(librarySearch))
  ) || [];

  const handleCreate = async () => {
    if (!newItem.name.trim()) return;
    try {
      const created = await createMutation.mutateAsync({
        name: newItem.name.trim(),
        unitQuantity: parseInt(newItem.unitQuantity) || 1,
        category: newItem.category,
        fabricType: newItem.category === 'Kumaş' ? (newItem.fabricType.trim() || undefined) : null,
        fabricPhases: newItem.fabricPhases.length > 0 ? newItem.fabricPhases : null,
        description: newItem.description.trim() || undefined,
        stokTurHedef: isStokOrder && newItem.stokTurHedef ? newItem.stokTurHedef : null,
        stokAltTurHedef: isStokOrder && newItem.stokAltTurHedef ? newItem.stokAltTurHedef : null,
        unitPrice: canSeePrice ? (parsePrice(newItem.unitPrice) ?? null) : undefined,
        unitPriceCurrency: canSeePrice ? newItem.unitPriceCurrency : undefined,
      });
      setNewItem(EMPTY_NEW_ITEM);
      setShowForm(false);
      setShowLibrary(false);
    } catch (err: any) {
      toast({ title: 'Hata', description: err?.message || 'İçerik kaydedilemedi', variant: 'destructive' });
    }
  };

  const handleSelectFromLibrary = (entry: ItemLibraryEntry) => {
    setNewItem(p => ({
      ...p,
      name: entry.name,
      unitQuantity: String(entry.defaultUnitQuantity),
      description: entry.description || '',
      category: (entry.category as Category) || 'Diğer',
      fabricType: entry.fabricType || '',
      fabricPhases: [],
    }));
    setShowLibrary(false);
    setShowForm(true);
  };

  const handleEdit = (item: OrderItem) => {
    setEditingId(item.id);
    setEditItem({
      name: item.name,
      unitQuantity: String(item.unitQuantity),
      description: item.description || '',
      category: (item.category as Category) || 'Diğer',
      fabricType: item.fabricType || '',
      fabricPhases: (item.fabricPhases && item.fabricPhases.length > 0) ? item.fabricPhases : [...ALL_FABRIC_PHASES],
      stokTurHedef: (item as any).stokTurHedef || '',
      stokAltTurHedef: (item as any).stokAltTurHedef || '',
      unitPrice: (item as any).unitPrice != null ? String((item as any).unitPrice) : '',
      unitPriceCurrency: ((item as any).unitPriceCurrency ?? 'TRY') as Currency,
    });
  };

  const handleUpdate = async (id: number) => {
    try {
      await updateMutation.mutateAsync({
        id,
        name: editItem.name,
        unitQuantity: parseInt(editItem.unitQuantity) || 1,
        category: editItem.category,
        fabricType: editItem.category === 'Kumaş' ? (editItem.fabricType.trim() || undefined) : null,
        fabricPhases: editItem.fabricPhases.length > 0 ? editItem.fabricPhases : null,
        description: editItem.description || undefined,
        stokTurHedef: isStokOrder && editItem.stokTurHedef ? editItem.stokTurHedef : null,
        stokAltTurHedef: isStokOrder && editItem.stokAltTurHedef ? editItem.stokAltTurHedef : null,
        unitPrice: canSeePrice ? (parsePrice(editItem.unitPrice) ?? null) : undefined,
        unitPriceCurrency: canSeePrice ? editItem.unitPriceCurrency : undefined,
      });
      setEditingId(null);
    } catch (err: any) {
      toast({ title: 'Hata', description: err?.message || 'İçerik güncellenemedi', variant: 'destructive' });
    }
  };

  const kumasCount = items?.filter(i => i.category === 'Kumaş').length ?? 0;

  return (
    <Card className="glass-card border-none shadow-lg rounded-3xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b px-6 py-4 flex flex-row items-center justify-between">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Sipariş İçerikleri
          {items && items.length > 0 && (
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">{items.length}</span>
          )}
          {kumasCount > 0 && (
            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
              <Layers className="w-3 h-3" />{kumasCount} Kumaş
            </span>
          )}
        </CardTitle>
        {!readonly && (
          <div className="flex gap-2">
            <Button
              variant="ghost" size="sm"
              className="text-muted-foreground hover:text-primary rounded-xl"
              onClick={() => { setShowLibrary(!showLibrary); setShowForm(false); }}
              data-testid="button-open-library"
            >
              <BookOpen className="w-4 h-4 mr-1" />Kütüphane
            </Button>
            <Button
              size="sm" className="rounded-xl"
              onClick={() => {
                const opening = !showForm;
                setShowForm(opening);
                setShowLibrary(false);
                setNewItem({ ...EMPTY_NEW_ITEM });
              }}
              data-testid="button-add-item"
            >
              <Plus className="w-4 h-4 mr-1" />Ekle
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* Library picker */}
        {showLibrary && (
          <div className="p-4 border-b bg-blue-50/50 dark:bg-blue-950/20">
            <p className="text-sm font-semibold mb-3 text-blue-700 dark:text-blue-300">Kütüphaneden Seç</p>
            <Input
              placeholder="İçerik ara..."
              className="h-9 rounded-xl mb-3"
              value={librarySearch}
              onChange={e => setLibrarySearch(e.target.value)}
            />
            {filteredLibrary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Eşleşen içerik bulunamadı</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredLibrary.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => handleSelectFromLibrary(entry)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 flex items-center justify-between transition-colors"
                    data-testid={`library-item-${entry.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.name}</p>
                        {entry.description && <p className="text-xs text-muted-foreground truncate">{entry.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <CategoryBadge category={entry.category || 'Diğer'} fabricType={entry.fabricType} />
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{entry.defaultUnitQuantity} adet/birim</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add new item form */}
        {showForm && (
          <div className="p-4 border-b bg-muted/20">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Yeni İçerik</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5 space-y-1">
                <Label className="text-xs">{isStokOrder ? 'Stoğa Kaydedilecek Ürün Adı *' : 'İçerik Adı *'}</Label>
                <Input
                  placeholder={isStokOrder ? 'Örn: Pamuk Kumaş, Tek Kullanımlık Ürün...' : 'Örn: Pamuk Kumaş, Düğme, Fermuar...'}
                  className="h-9 rounded-xl"
                  value={newItem.name}
                  onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                  data-testid="input-item-name"
                />
              </div>
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-xs">Sınıf (Kategori) *</Label>
                <CategoryToggle
                  value={newItem.category}
                  onChange={v => setNewItem(p => ({
                    ...p,
                    category: v,
                    fabricType: v === 'Diğer' ? '' : p.fabricType,
                  }))}
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">Birim Başına Adet *</Label>
                <Input
                  inputMode="numeric" pattern="[0-9]*"
                  className="h-9 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={newItem.unitQuantity}
                  onChange={e => setNewItem(p => ({ ...p, unitQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                  onBlur={e => { if (!e.target.value || e.target.value === '0') setNewItem(p => ({ ...p, unitQuantity: '1' })); }}
                  data-testid="input-item-quantity"
                />
              </div>
            </div>

            {newItem.category === 'Kumaş' && (
              <div className="mt-3 space-y-1">
                <Label className="text-xs">Kumaş Türü</Label>
                <Input
                  placeholder="Örn: %100 Pamuk, Polyester..."
                  className="h-9 rounded-xl"
                  value={newItem.fabricType}
                  onChange={e => setNewItem(p => ({ ...p, fabricType: e.target.value }))}
                />
              </div>
            )}

            {/* Phase selector — visible for all categories */}
            <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Anlık Üretim'de takip edilecek fazlar</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {(isStokOrder ? STOK_FABRIC_PHASES : ALL_FABRIC_PHASES).map(phase => {
                  const isChecked = newItem.fabricPhases.includes(phase);
                  return (
                    <label key={phase} className="flex items-center gap-1.5 select-none cursor-pointer">
                      <input
                        type="checkbox" className="accent-blue-600 w-3.5 h-3.5"
                        checked={isChecked}
                        onChange={e => {
                          const phases = e.target.checked
                            ? [...newItem.fabricPhases, phase]
                            : newItem.fabricPhases.filter(p => p !== phase);
                          setNewItem(prev => ({ ...prev, fabricPhases: phases }));
                        }}
                        data-testid={`checkbox-new-phase-${phase}`}
                      />
                      <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{FABRIC_PHASE_LABELS[phase]}</span>
                    </label>
                  );
                })}
              </div>
              {newItem.category !== 'Kumaş' && (
                <p className="text-[10px] text-muted-foreground mt-1">İsteğe bağlı — seçilmezse takip edilmez</p>
              )}
            </div>

            {isStokOrder && (
              <div className="mt-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Stok Türü Hedefi</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tür</Label>
                    <Select
                      value={newItem.stokTurHedef || '__none__'}
                      onValueChange={v => setNewItem(p => ({ ...p, stokTurHedef: v === '__none__' ? '' : v, stokAltTurHedef: '' }))}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-new-stok-tur">
                        <SelectValue placeholder="Tür seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Ayrı Kalemler</SelectItem>
                        {kategoriler.map(k => (
                          <SelectItem key={k.id} value={k.ad}>{k.ad}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Alt Tür</Label>
                    <Select
                      value={newItem.stokAltTurHedef || '__none__'}
                      onValueChange={v => setNewItem(p => ({ ...p, stokAltTurHedef: v === '__none__' ? '' : v }))}
                      disabled={!newItem.stokTurHedef}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-new-stok-alt-tur">
                        <SelectValue placeholder="Alt tür seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Yok</SelectItem>
                        {allAltTurler
                          .filter(a => {
                            const kat = kategoriler.find(k => k.ad === newItem.stokTurHedef);
                            return kat && a.kategoriId === kat.id;
                          })
                          .map(a => (
                            <SelectItem key={a.id} value={a.ad}>{a.ad}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {canSeePrice && (
              <div className="mt-3 space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Receipt className="w-3 h-3" /> Birim Fiyat
                </Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-9 rounded-xl flex-1"
                    value={newItem.unitPrice}
                    onChange={e => setNewItem(p => ({ ...p, unitPrice: e.target.value.replace(/[^0-9.,]/g, '') }))}
                    data-testid="input-new-item-price"
                  />
                  <Select value={newItem.unitPriceCurrency} onValueChange={(v) => setNewItem(p => ({ ...p, unitPriceCurrency: v as Currency }))}>
                    <SelectTrigger className="h-9 rounded-xl w-24" data-testid="select-new-item-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="mt-3 space-y-1">
              <Label className="text-xs">Açıklama</Label>
              <Textarea
                placeholder="İsteğe bağlı açıklama..."
                className="rounded-xl min-h-[60px] text-sm"
                value={newItem.description}
                onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
              />
            </div>

            {totalQuantity > 0 && parseInt(newItem.unitQuantity) > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Toplam {totalQuantity} birim için gerekli: <strong className="text-primary">{(parseInt(newItem.unitQuantity) || 0) * totalQuantity} adet</strong>
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm" className="rounded-xl"
                onClick={handleCreate}
                disabled={createMutation.isPending || !newItem.name.trim()}
                data-testid="button-save-item"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span className="ml-1">Kaydet</span>
              </Button>
              <Button
                size="sm" variant="ghost" className="rounded-xl"
                onClick={() => { setShowForm(false); setNewItem(EMPTY_NEW_ITEM); }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Items list */}
        {isLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !items || items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Henüz içerik eklenmemiş.</p>
            {!readonly && <p className="text-xs mt-1">Yukarıdaki "Ekle" butonuyla içerik ekleyin.</p>}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="px-6 py-2 bg-muted/20 hidden sm:grid sm:grid-cols-12 gap-2 text-xs text-muted-foreground uppercase font-semibold">
              <div className="col-span-4">İçerik Adı</div>
              <div className="col-span-2">Sınıf</div>
              <div className="col-span-2 text-center">Birim/Adet</div>
              <div className="col-span-2 text-center">Toplam Gereken</div>
              <div className="col-span-2"></div>
            </div>
            {items.map(item => (
              <div key={item.id} className="px-6 py-4" data-testid={`item-row-${item.id}`}>
                {editingId === item.id ? (
                  /* Edit row */
                  <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      <div className="sm:col-span-3 space-y-1">
                        <Input
                          className="h-8 rounded-xl text-sm"
                          value={editItem.name}
                          onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                        />
                        <Textarea
                          placeholder="Açıklama..."
                          className="rounded-xl min-h-[50px] text-xs"
                          value={editItem.description}
                          onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                      <div className="sm:col-span-4 space-y-1">
                        <Label className="text-xs mb-1 block">Sınıf</Label>
                        <CategoryToggle
                          value={editItem.category}
                          onChange={v => setEditItem(p => ({
                            ...p,
                            category: v,
                            fabricType: v === 'Diğer' ? '' : p.fabricType,
                            fabricPhases: v === 'Kumaş' && p.fabricPhases.length === 0
                              ? defaultPhases
                              : p.fabricPhases,
                          }))}
                        />
                        {editItem.category === 'Kumaş' && (
                          <Input
                            placeholder="Kumaş türü..."
                            className="h-8 rounded-xl text-xs mt-1"
                            value={editItem.fabricType}
                            onChange={e => setEditItem(p => ({ ...p, fabricType: e.target.value }))}
                            data-testid={`input-edit-fabric-type-${item.id}`}
                          />
                        )}
                        {/* Phase selector — visible for all categories */}
                        <div className="mt-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-2.5 py-2">
                          <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1.5">Takip edilecek fazlar</p>
                          <div className="flex flex-col gap-1">
                            {(isStokOrder ? STOK_FABRIC_PHASES : ALL_FABRIC_PHASES).map(phase => {
                              const isChecked = editItem.fabricPhases.includes(phase);
                              return (
                                <label key={phase} className="flex items-center gap-1.5 select-none cursor-pointer">
                                  <input
                                    type="checkbox" className="accent-blue-600 w-3 h-3"
                                    checked={isChecked}
                                    onChange={e => {
                                      const phases = e.target.checked
                                        ? [...editItem.fabricPhases, phase]
                                        : editItem.fabricPhases.filter(p => p !== phase);
                                      setEditItem(prev => ({ ...prev, fabricPhases: phases }));
                                    }}
                                    data-testid={`checkbox-edit-phase-${phase}-${item.id}`}
                                  />
                                  <span className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">{FABRIC_PHASE_LABELS[phase]}</span>
                                </label>
                              );
                            })}
                          </div>
                          {editItem.category !== 'Kumaş' && (
                            <p className="text-[9px] text-muted-foreground mt-1">İsteğe bağlı</p>
                          )}
                        </div>
                      </div>
                      {isStokOrder && (
                        <div className="sm:col-span-12 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2 flex gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px]">Stok Türü</Label>
                            <Select
                              value={editItem.stokTurHedef || '__none__'}
                              onValueChange={v => setEditItem(p => ({ ...p, stokTurHedef: v === '__none__' ? '' : v, stokAltTurHedef: '' }))}
                            >
                              <SelectTrigger className="h-8 rounded-lg text-xs">
                                <SelectValue placeholder="Tür" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Ayrı Kalemler</SelectItem>
                                {kategoriler.map(k => <SelectItem key={k.id} value={k.ad}>{k.ad}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px]">Alt Tür</Label>
                            <Select
                              value={editItem.stokAltTurHedef || '__none__'}
                              onValueChange={v => setEditItem(p => ({ ...p, stokAltTurHedef: v === '__none__' ? '' : v }))}
                              disabled={!editItem.stokTurHedef}
                            >
                              <SelectTrigger className="h-8 rounded-lg text-xs">
                                <SelectValue placeholder="Alt tür" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Yok</SelectItem>
                                {allAltTurler
                                  .filter(a => {
                                    const kat = kategoriler.find(k => k.ad === editItem.stokTurHedef);
                                    return kat && a.kategoriId === kat.id;
                                  })
                                  .map(a => <SelectItem key={a.id} value={a.ad}>{a.ad}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      <div className="sm:col-span-2 sm:text-center">
                        <Input
                          inputMode="numeric" pattern="[0-9]*"
                          className="h-8 rounded-xl text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={editItem.unitQuantity}
                          onChange={e => setEditItem(p => ({ ...p, unitQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                          onBlur={e => { if (!e.target.value || e.target.value === '0') setEditItem(p => ({ ...p, unitQuantity: '1' })); }}
                        />
                      </div>
                      {canSeePrice && (
                        <div className="sm:col-span-12 flex gap-2 items-center">
                          <Label className="text-[10px] flex items-center gap-1 shrink-0">
                            <Receipt className="w-3 h-3" /> Birim Fiyat
                          </Label>
                          <Input
                            inputMode="decimal"
                            placeholder="0,00"
                            className="h-8 rounded-xl text-sm flex-1"
                            value={editItem.unitPrice}
                            onChange={e => setEditItem(p => ({ ...p, unitPrice: e.target.value.replace(/[^0-9.,]/g, '') }))}
                            data-testid={`input-edit-item-price-${item.id}`}
                          />
                          <Select value={editItem.unitPriceCurrency} onValueChange={(v) => setEditItem(p => ({ ...p, unitPriceCurrency: v as Currency }))}>
                            <SelectTrigger className="h-8 rounded-xl w-24 text-xs" data-testid={`select-edit-item-currency-${item.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map(c => (
                                <SelectItem key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="sm:col-span-1 sm:text-center text-sm font-bold text-primary self-center">
                        {totalQuantity > 0 ? `${(parseInt(editItem.unitQuantity) || 0) * totalQuantity}` : '-'}
                      </div>
                      <div className="sm:col-span-2 flex gap-1 justify-end">
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg text-green-600"
                          onClick={() => handleUpdate(item.id)}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* View row */
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7 sm:col-span-4">
                      <p className="font-semibold text-sm">{item.name}</p>
                      {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                      {isStokOrder && ((item as any).stokTurHedef || (item as any).stokAltTurHedef) && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                          → {[(item as any).stokTurHedef, (item as any).stokAltTurHedef].filter(Boolean).join(' / ')}
                        </p>
                      )}
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <CategoryBadge category={item.category || 'Diğer'} fabricType={item.fabricType} />
                    </div>
                    <div className="col-span-4 sm:col-span-2 sm:text-center">
                      <span className="text-sm font-medium">{item.unitQuantity} adet/birim</span>
                      {canSeePrice && (item as any).unitPrice != null && (
                        <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`text-item-unit-price-${item.id}`}>
                          {formatMoney(Number((item as any).unitPrice), ((item as any).unitPriceCurrency ?? 'TRY') as Currency)} / adet
                        </p>
                      )}
                    </div>
                    <div className="col-span-5 sm:col-span-2 sm:text-center">
                      <span className={cn("text-base font-bold", totalQuantity > 0 ? "text-primary" : "text-muted-foreground")}>
                        {totalQuantity > 0 ? `${item.unitQuantity * totalQuantity} adet` : '-'}
                      </span>
                      {totalQuantity > 0 && (
                        <p className="text-xs text-muted-foreground">({totalQuantity} × {item.unitQuantity})</p>
                      )}
                      {canSeePrice && (item as any).unitPrice != null && totalQuantity > 0 && (() => {
                        const cur = (((item as any).unitPriceCurrency) ?? 'TRY') as Currency;
                        const lineAmount = Number((item as any).unitPrice) * item.unitQuantity * totalQuantity;
                        const all = convertAll(lineAmount, cur, rates);
                        return (
                          <div className="mt-0.5 space-y-0.5" data-testid={`text-item-line-total-${item.id}`}>
                            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatMoney(lineAmount, cur)}
                            </p>
                            {all && CURRENCIES.filter(c => c !== cur).map(c => (
                              <p key={c} className="text-[10px] text-muted-foreground">
                                ≈ {formatMoney(all[c], c)}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {!readonly && (
                      <div className="col-span-3 sm:col-span-2 flex gap-1 justify-end">
                        <Button
                          size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => handleEdit(item)}
                          data-testid={`button-edit-item-${item.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-item-${item.id}`}
                        >
                          {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {totalQuantity > 0 && (
              <div className="px-6 py-3 bg-primary/5 flex flex-wrap justify-between items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  {items.length} içerik, {totalQuantity} birim için:
                </span>
                <div className="flex items-center gap-3">
                  {kumasCount > 0 && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                      <Layers className="w-3 h-3" />{kumasCount} Kumaş
                    </span>
                  )}
                  <span className="font-bold text-primary">
                    {items.reduce((s, i) => s + i.unitQuantity * totalQuantity, 0)} adet toplam
                  </span>
                </div>
              </div>
            )}
            {canSeePrice && totalQuantity > 0 && items && items.length > 0 && !items.some(i => (i as any).unitPrice != null) && (
              <div className="border-t bg-muted/10 px-6 py-4 text-center" data-testid="section-order-totals-empty">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  İçeriklere birim fiyat girince Ara Toplam, KDV ve Genel Toplam burada listelenir.
                </p>
              </div>
            )}
            {canSeePrice && totalQuantity > 0 && items && items.some(i => (i as any).unitPrice != null) && (() => {
              const subtotalsByCurrency: Record<Currency, number> = { TRY: 0, USD: 0, EUR: 0 };
              let subtotalTRY = 0;
              for (const it of items) {
                const up = (it as any).unitPrice;
                if (up == null) continue;
                const cur = (((it as any).unitPriceCurrency) ?? 'TRY') as Currency;
                const line = Number(up) * it.unitQuantity * totalQuantity;
                subtotalsByCurrency[cur] += line;
                if (rates) {
                  const all = convertAll(line, cur, rates);
                  if (all) subtotalTRY += all.TRY;
                } else if (cur === 'TRY') {
                  subtotalTRY += line;
                }
              }
              const pct = Math.max(0, Number((kdvPct || '0').replace(',', '.')) || 0);
              const kdvAmountTRY = kdvOn ? subtotalTRY * pct / 100 : 0;
              const iPct = Math.max(0, Number((iscilikPct || '0').replace(',', '.')) || 0);
              const iManual = Math.max(0, Number((iscilikManual || '0').replace(',', '.')) || 0);
              const iscilikAmountTRY = iscilikOn
                ? (iscilikMode === 'pct' ? subtotalTRY * iPct / 100 : iManual)
                : 0;
              const grandTRY = subtotalTRY + kdvAmountTRY + iscilikAmountTRY;
              const grandAll = convertAll(grandTRY, 'TRY', rates);
              const usedCurrencies = CURRENCIES.filter(c => subtotalsByCurrency[c] > 0);
              return (
                <div className="border-t bg-emerald-50/40 dark:bg-emerald-950/20 px-6 py-4 space-y-3" data-testid="section-order-totals">
                  <div className="flex items-start justify-between text-sm gap-3 flex-wrap">
                    <span className="text-muted-foreground">Ara Toplam</span>
                    <div className="text-right" data-testid="text-order-subtotal">
                      {usedCurrencies.length > 1 && (
                        <div className="space-y-0.5 mb-1">
                          {usedCurrencies.map(c => (
                            <p key={c} className="text-xs text-muted-foreground">
                              {formatMoney(subtotalsByCurrency[c], c)}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="font-semibold">{formatMoney(subtotalTRY, 'TRY')}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={kdvOn}
                        onCheckedChange={(v) => setKdvOn(!!v)}
                        data-testid="checkbox-order-kdv"
                      />
                      <span>KDV ekle</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="decimal"
                        disabled={!kdvOn}
                        value={kdvPct}
                        onChange={e => setKdvPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="h-8 w-20 rounded-lg text-sm"
                        data-testid="input-order-kdv-pct"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      {kdvOn && (
                        <span className="text-sm font-medium" data-testid="text-order-kdv-amount">
                          = {formatMoney(kdvAmountTRY, 'TRY')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={iscilikOn}
                        onCheckedChange={(v) => setIscilikOn(!!v)}
                        data-testid="checkbox-order-iscilik"
                      />
                      <span>İşçilik ekle</span>
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex rounded-lg border border-border overflow-hidden h-8 text-xs">
                        <button
                          type="button"
                          disabled={!iscilikOn}
                          onClick={() => setIscilikMode('pct')}
                          className={cn(
                            'px-2 font-medium transition-colors disabled:opacity-50',
                            iscilikMode === 'pct' ? 'bg-emerald-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                          )}
                          data-testid="button-order-iscilik-mode-pct"
                        >%</button>
                        <button
                          type="button"
                          disabled={!iscilikOn}
                          onClick={() => setIscilikMode('manual')}
                          className={cn(
                            'px-2 font-medium transition-colors border-l border-border disabled:opacity-50',
                            iscilikMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                          )}
                          data-testid="button-order-iscilik-mode-manual"
                        >Manuel</button>
                      </div>
                      {iscilikMode === 'pct' ? (
                        <>
                          <Input
                            inputMode="decimal"
                            disabled={!iscilikOn}
                            value={iscilikPct}
                            onChange={e => setIscilikPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                            className="h-8 w-20 rounded-lg text-sm"
                            data-testid="input-order-iscilik-pct"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </>
                      ) : (
                        <>
                          <Input
                            inputMode="decimal"
                            disabled={!iscilikOn}
                            placeholder="0,00"
                            value={iscilikManual}
                            onChange={e => setIscilikManual(e.target.value.replace(/[^0-9.,]/g, ''))}
                            className="h-8 w-28 rounded-lg text-sm"
                            data-testid="input-order-iscilik-manual"
                          />
                          <span className="text-sm text-muted-foreground">₺</span>
                        </>
                      )}
                      {iscilikOn && (
                        <span className="text-sm font-medium" data-testid="text-order-iscilik-amount">
                          = {formatMoney(iscilikAmountTRY, 'TRY')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1.5" data-testid="text-order-grand-total">
                    <div className="flex items-center justify-between text-base">
                      <span className="font-semibold">Genel Toplam</span>
                      {grandAll ? (
                        <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                          {formatMoney(grandAll[grandTotalCurrency], grandTotalCurrency)}
                        </span>
                      ) : (
                        <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                          {formatMoney(grandTRY, 'TRY')}
                        </span>
                      )}
                    </div>
                    {grandAll && (
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {CURRENCIES.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setGrandTotalCurrency(c)}
                            className={cn(
                              'text-[11px] px-2 py-0.5 rounded-md border transition-colors',
                              grandTotalCurrency === c
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-transparent text-muted-foreground hover:bg-muted border-border'
                            )}
                            data-testid={`button-order-currency-${c}`}
                          >
                            {formatMoney(grandAll[c], c)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!rates && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 text-right">
                        Döviz kurları yüklenemedi — yalnız ₺ gösteriliyor.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
