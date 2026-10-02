import { useState } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useItemLibrary } from '@/hooks/use-item-library';
import { useAuth } from '@/hooks/use-auth';
import { useExchangeRates, convertAll, formatMoney, CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '@/hooks/use-exchange-rates';
import { Plus, Trash2, Check, X, BookOpen, Package, Layers, Pencil, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItemLibraryEntry, StokKategori, StokAltTur } from '@shared/schema';
import { Checkbox } from '@/components/ui/checkbox';

export type PendingItem = {
  tempId: string;
  name: string;
  unitQuantity: number;
  category: 'Kumaş' | 'Diğer';
  fabricType?: string;
  fabricPhases: string[];
  description?: string;
  stokTurHedef?: string;
  stokAltTurHedef?: string;
  unitPrice?: number;
  unitPriceCurrency?: Currency;
};

interface Props {
  items: PendingItem[];
  onChange: (items: PendingItem[]) => void;
  totalQuantity: number;
  orderType?: string;
}

const ALL_FABRIC_PHASES = ['pastal', 'urun_islem', 'katlama'] as const;
const STOK_FABRIC_PHASES = ['pastal', 'urun_islem'] as const;
const FABRIC_PHASE_LABELS: Record<string, string> = {
  pastal: 'Pastal',
  urun_islem: 'Ürün İşlem',
  katlama: 'Katlama',
};
const EMPTY_FORM = {
  name: '',
  unitQuantity: '1',
  category: 'Diğer' as 'Kumaş' | 'Diğer',
  fabricType: '',
  fabricPhases: [] as string[],
  description: '',
  stokTurHedef: '',
  stokAltTurHedef: '',
  unitPrice: '',
  unitPriceCurrency: 'TRY' as Currency,
};

function CategoryToggle({ value, onChange }: { value: 'Kumaş' | 'Diğer'; onChange: (v: 'Kumaş' | 'Diğer') => void }) {
  return (
    <div className="flex rounded-xl border border-border overflow-hidden h-9 text-sm">
      <button
        type="button"
        onClick={() => onChange('Kumaş')}
        className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 font-medium transition-colors', value === 'Kumaş' ? 'bg-blue-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60')}
      >
        <Layers className="w-3.5 h-3.5" />Kumaş
      </button>
      <button
        type="button"
        onClick={() => onChange('Diğer')}
        className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 font-medium transition-colors border-l border-border', value === 'Diğer' ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted/60')}
      >
        <Package className="w-3.5 h-3.5" />Diğer
      </button>
    </div>
  );
}

/* Phase selector — used for all categories */
function PhaseSelector({
  phases,
  onChange,
  availablePhases,
}: {
  phases: string[];
  onChange: (phases: string[]) => void;
  availablePhases: readonly string[];
}) {
  return (
    <div className="mt-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Anlık Üretim'de takip edilecek fazlar</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {availablePhases.map(phase => {
          const isChecked = phases.includes(phase);
          return (
            <label key={phase} className="flex items-center gap-1.5 select-none cursor-pointer">
              <input
                type="checkbox"
                className="accent-blue-600 w-3.5 h-3.5"
                checked={isChecked}
                onChange={e => {
                  const next = e.target.checked
                    ? [...phases, phase]
                    : phases.filter(p => p !== phase);
                  onChange(next);
                }}
              />
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{FABRIC_PHASE_LABELS[phase]}</span>
            </label>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">İsteğe bağlı — seçilmezse takip edilmez</p>
    </div>
  );
}

export function PendingItemsSection({ items, onChange, totalQuantity, orderType = 'musteri' }: Props) {
  const isStokOrder = orderType === 'stok';
  const availablePhases = isStokOrder ? STOK_FABRIC_PHASES : ALL_FABRIC_PHASES;
  const { user } = useAuth();
  const canSeePrice = user?.role === 'admin' || user?.role === 'ofis_calisan';
  const { data: rates } = useExchangeRates();
  const [grandTotalCurrency, setGrandTotalCurrency] = useState<Currency>('TRY');

  const [showForm, setShowForm] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM }));
  const [librarySearch, setLibrarySearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kdvOn, setKdvOn] = useState(false);
  const [kdvPct, setKdvPct] = useState('20');
  const [iscilikOn, setIscilikOn] = useState(false);
  const [iscilikMode, setIscilikMode] = useState<'pct' | 'manual'>('pct');
  const [iscilikPct, setIscilikPct] = useState('10');
  const [iscilikManual, setIscilikManual] = useState('');
  const { data: library } = useItemLibrary();
  const { data: kategoriler = [] } = useQuery<StokKategori[]>({ queryKey: ['/api/stok-kategoriler'] });
  const { data: allAltTurler = [] } = useQuery<StokAltTur[]>({ queryKey: ['/api/stok-alt-turler'] });

  const filteredLibrary = library?.filter(l =>
    normalizeForSearch(l.name).includes(normalizeForSearch(librarySearch))
  ) ?? [];

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const parsedUnitPrice = (() => {
    const v = (form.unitPrice ?? '').replace(',', '.').trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  })();

  const handleAdd = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      onChange(items.map(i => i.tempId === editingId ? {
        ...i,
        name: form.name.trim(),
        unitQuantity: parseInt(form.unitQuantity) || 1,
        category: form.category,
        fabricType: form.category === 'Kumaş' ? form.fabricType.trim() : undefined,
        fabricPhases: form.fabricPhases,
        description: form.description.trim() || undefined,
        stokTurHedef: isStokOrder && form.stokTurHedef ? form.stokTurHedef : undefined,
        stokAltTurHedef: isStokOrder && form.stokAltTurHedef ? form.stokAltTurHedef : undefined,
        unitPrice: canSeePrice ? parsedUnitPrice : i.unitPrice,
        unitPriceCurrency: canSeePrice ? form.unitPriceCurrency : i.unitPriceCurrency,
      } : i));
    } else {
      const item: PendingItem = {
        tempId: `${Date.now()}-${Math.random()}`,
        name: form.name.trim(),
        unitQuantity: parseInt(form.unitQuantity) || 1,
        category: form.category,
        fabricType: form.category === 'Kumaş' ? form.fabricType.trim() : undefined,
        fabricPhases: form.fabricPhases,
        description: form.description.trim() || undefined,
        stokTurHedef: isStokOrder && form.stokTurHedef ? form.stokTurHedef : undefined,
        stokAltTurHedef: isStokOrder && form.stokAltTurHedef ? form.stokAltTurHedef : undefined,
        unitPrice: canSeePrice ? parsedUnitPrice : undefined,
        unitPriceCurrency: canSeePrice ? form.unitPriceCurrency : undefined,
      };
      onChange([...items, item]);
    }
    closeForm();
    setShowLibrary(false);
  };

  const handleEdit = (item: PendingItem) => {
    setForm({
      name: item.name,
      unitQuantity: String(item.unitQuantity),
      category: item.category,
      fabricType: item.fabricType || '',
      fabricPhases: item.fabricPhases,
      description: item.description || '',
      stokTurHedef: item.stokTurHedef || '',
      stokAltTurHedef: item.stokAltTurHedef || '',
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
      unitPriceCurrency: (item.unitPriceCurrency ?? 'TRY') as Currency,
    });
    setEditingId(item.tempId);
    setShowForm(true);
    setShowLibrary(false);
  };

  const handleDelete = (tempId: string) => onChange(items.filter(i => i.tempId !== tempId));

  const handleSelectFromLibrary = (entry: ItemLibraryEntry) => {
    setForm({
      name: entry.name,
      unitQuantity: String(entry.defaultUnitQuantity),
      description: entry.description || '',
      category: (entry.category as 'Kumaş' | 'Diğer') || 'Diğer',
      fabricType: entry.fabricType || '',
      fabricPhases: [],
      stokTurHedef: '',
      stokAltTurHedef: '',
      unitPrice: '',
      unitPriceCurrency: 'TRY' as Currency,
    });
    setShowLibrary(false);
    setShowForm(true);
  };

  return (
    <Card className="glass-card border-none shadow-lg rounded-3xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b px-6 py-4 flex flex-row items-center justify-between">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Sipariş İçerikleri
          {items.length > 0 && (
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">{items.length}</span>
          )}
          <span className="text-xs font-normal text-muted-foreground">(sipariş kaydedilince eklenir)</span>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-primary rounded-xl"
            onClick={() => { setShowLibrary(!showLibrary); setShowForm(false); }}
            data-testid="button-open-library-pending"
          >
            <BookOpen className="w-4 h-4 mr-1" />
            Kütüphane
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            onClick={() => { if (showForm) { closeForm(); } else { setShowForm(true); setShowLibrary(false); setForm({ ...EMPTY_FORM }); } }}
            data-testid="button-add-pending-item"
          >
            <Plus className="w-4 h-4 mr-1" />
            Ekle
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
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
                    type="button"
                    key={entry.id}
                    onClick={() => handleSelectFromLibrary(entry)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 flex items-center justify-between transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      {entry.description && <p className="text-xs text-muted-foreground truncate">{entry.description}</p>}
                    </div>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0 ml-2">{entry.defaultUnitQuantity} adet/birim</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showForm && (
          <div className="p-4 border-b bg-muted/20">
            <p className="text-sm font-semibold mb-3">{editingId ? 'İçeriği Düzenle' : 'Yeni İçerik'}</p>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5 space-y-1">
                <Label className="text-xs">{isStokOrder ? 'Stoğa Kaydedilecek Ürün Adı *' : 'İçerik Adı *'}</Label>
                <Input
                  placeholder={isStokOrder ? 'Örn: Pamuk Kumaş, Tek Kullanımlık Ürün...' : 'Örn: Pamuk Kumaş, Düğme, Fermuar...'}
                  className="h-9 rounded-xl"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  data-testid="input-pending-item-name"
                />
              </div>
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-xs">Sınıf (Kategori) *</Label>
                <CategoryToggle
                  value={form.category}
                  onChange={v => setForm(p => ({
                    ...p,
                    category: v,
                    fabricType: v === 'Diğer' ? '' : p.fabricType,
                  }))}
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">Birim Başına Adet *</Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-9 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={form.unitQuantity}
                  onChange={e => setForm(p => ({ ...p, unitQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                  onBlur={e => { if (!e.target.value || e.target.value === '0') setForm(p => ({ ...p, unitQuantity: '1' })); }}
                  data-testid="input-pending-item-quantity"
                />
              </div>
              {form.category === 'Kumaş' && (
                <div className="sm:col-span-5 space-y-1">
                  <Label className="text-xs">Kumaş Türü (isteğe bağlı)</Label>
                  <Input
                    placeholder="Örn: Dokuma, Örme, Non-woven..."
                    className="h-9 rounded-xl"
                    value={form.fabricType}
                    onChange={e => setForm(p => ({ ...p, fabricType: e.target.value }))}
                  />
                </div>
              )}
              {canSeePrice && (
                <div className="sm:col-span-6 space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Receipt className="w-3 h-3" /> Birim Fiyat
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      className="h-9 rounded-xl flex-1"
                      value={form.unitPrice}
                      onChange={e => setForm(p => ({ ...p, unitPrice: e.target.value.replace(/[^0-9.,]/g, '') }))}
                      data-testid="input-pending-item-price"
                    />
                    <Select value={form.unitPriceCurrency} onValueChange={(v) => setForm(p => ({ ...p, unitPriceCurrency: v as Currency }))}>
                      <SelectTrigger className="h-9 rounded-xl w-24" data-testid="select-pending-item-currency">
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
              <div className="sm:col-span-12 space-y-1">
                <Label className="text-xs">Açıklama (isteğe bağlı)</Label>
                <Textarea
                  placeholder="İçerik hakkında notlar..."
                  className="rounded-xl min-h-[56px]"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>

            {/* Phase selector — visible for all categories */}
            <PhaseSelector
              phases={form.fabricPhases}
              onChange={phases => setForm(p => ({ ...p, fabricPhases: phases }))}
              availablePhases={availablePhases}
            />

            {/* Stok Türü/Alt Türü — only for stok orders */}
            {isStokOrder && (
              <div className="mt-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Stok Türü Hedefi</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tür</Label>
                    <Select
                      value={form.stokTurHedef || '__none__'}
                      onValueChange={v => setForm(p => ({ ...p, stokTurHedef: v === '__none__' ? '' : v, stokAltTurHedef: '' }))}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-pending-stok-tur">
                        <SelectValue placeholder="Tür seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Belirtilmemiş</SelectItem>
                        {kategoriler.map(k => (
                          <SelectItem key={k.id} value={k.ad}>{k.ad}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Alt Tür</Label>
                    <Select
                      value={form.stokAltTurHedef || '__none__'}
                      onValueChange={v => setForm(p => ({ ...p, stokAltTurHedef: v === '__none__' ? '' : v }))}
                      disabled={!form.stokTurHedef}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-pending-stok-alt-tur">
                        <SelectValue placeholder="Alt tür seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Yok</SelectItem>
                        {allAltTurler
                          .filter(a => {
                            const kat = kategoriler.find(k => k.ad === form.stokTurHedef);
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

            {totalQuantity > 0 && parseInt(form.unitQuantity) > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Toplam {totalQuantity} birim için gerekli:{' '}
                <strong className="text-primary">{(parseInt(form.unitQuantity) || 0) * totalQuantity} adet</strong>
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <Button
                type="button"
                size="sm"
                className="rounded-xl"
                onClick={handleAdd}
                disabled={!form.name.trim()}
                data-testid="button-save-pending-item"
              >
                <Check className="w-4 h-4" />
                <span className="ml-1">{editingId ? 'Güncelle' : 'Listeye Ekle'}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-xl"
                onClick={closeForm}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Henüz içerik eklenmemiş.</p>
            <p className="text-xs mt-1">"Ekle" veya "Kütüphane" butonuyla içerik ekleyin.</p>
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
              <div key={item.tempId} className={cn('px-6 py-4 grid grid-cols-12 gap-2 items-start transition-colors', editingId === item.tempId && 'bg-primary/5 border-l-2 border-primary')} data-testid={`pending-item-${item.tempId}`}>
                <div className="col-span-7 sm:col-span-4">
                  <p className="font-semibold text-sm">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                  {(item.stokTurHedef || item.stokAltTurHedef) && (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">
                      → {[item.stokTurHedef, item.stokAltTurHedef].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    item.category === 'Kumaş'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {item.category === 'Kumaş' ? <Layers className="w-2.5 h-2.5" /> : <Package className="w-2.5 h-2.5" />}
                    {item.category}
                  </span>
                </div>
                <div className="col-span-4 sm:col-span-2 sm:text-center">
                  <span className="text-sm font-medium">{item.unitQuantity} adet/birim</span>
                  {canSeePrice && item.unitPrice != null && (
                    <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`text-pending-unit-price-${item.tempId}`}>
                      {formatMoney(item.unitPrice, item.unitPriceCurrency ?? 'TRY')} / adet
                    </p>
                  )}
                </div>
                <div className="col-span-5 sm:col-span-2 sm:text-center">
                  <span className={cn('text-base font-bold', totalQuantity > 0 ? 'text-primary' : 'text-muted-foreground')}>
                    {totalQuantity > 0 ? `${item.unitQuantity * totalQuantity} adet` : '-'}
                  </span>
                  {canSeePrice && item.unitPrice != null && totalQuantity > 0 && (() => {
                    const cur = item.unitPriceCurrency ?? 'TRY';
                    const lineAmount = item.unitPrice * item.unitQuantity * totalQuantity;
                    const all = convertAll(lineAmount, cur, rates);
                    return (
                      <div className="mt-0.5 space-y-0.5" data-testid={`text-pending-line-total-${item.tempId}`}>
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
                <div className="col-span-3 sm:col-span-2 flex gap-1 justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-primary"
                    onClick={() => handleEdit(item)}
                    data-testid={`button-edit-pending-${item.tempId}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive"
                    onClick={() => handleDelete(item.tempId)}
                    data-testid={`button-delete-pending-${item.tempId}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {canSeePrice && items.length > 0 && totalQuantity > 0 && (() => {
          // Aggregate per-item totals into a single TRY-normalized base, plus a per-currency raw subtotal.
          const subtotalsByCurrency: Record<Currency, number> = { TRY: 0, USD: 0, EUR: 0 };
          let subtotalTRY = 0;
          let canConvert = !!rates;
          for (const it of items) {
            if (it.unitPrice == null) continue;
            const cur = (it.unitPriceCurrency ?? 'TRY') as Currency;
            const line = it.unitPrice * it.unitQuantity * totalQuantity;
            subtotalsByCurrency[cur] += line;
            if (rates) {
              const all = convertAll(line, cur, rates);
              if (all) subtotalTRY += all.TRY;
            } else {
              canConvert = false;
              if (cur === 'TRY') subtotalTRY += line;
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
            <div className="border-t bg-emerald-50/40 dark:bg-emerald-950/20 px-6 py-4 space-y-3" data-testid="section-pending-totals">
              <div className="flex items-start justify-between text-sm gap-3 flex-wrap">
                <span className="text-muted-foreground">Ara Toplam</span>
                <div className="text-right" data-testid="text-pending-subtotal">
                  {usedCurrencies.length > 1 && (
                    <div className="space-y-0.5 mb-1">
                      {usedCurrencies.map(c => (
                        <p key={c} className="text-xs text-muted-foreground">
                          {formatMoney(subtotalsByCurrency[c], c)}
                        </p>
                      ))}
                    </div>
                  )}
                  {canConvert && grandAll ? (
                    <p className="font-semibold">{formatMoney(grandAll.TRY - kdvAmountTRY - iscilikAmountTRY, 'TRY')}</p>
                  ) : (
                    <p className="font-semibold">{formatMoney(subtotalsByCurrency.TRY, 'TRY')}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={kdvOn}
                    onCheckedChange={(v) => setKdvOn(!!v)}
                    data-testid="checkbox-pending-kdv"
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
                    data-testid="input-pending-kdv-pct"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  {kdvOn && (
                    <span className="text-sm font-medium" data-testid="text-pending-kdv-amount">
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
                    data-testid="checkbox-pending-iscilik"
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
                      data-testid="button-pending-iscilik-mode-pct"
                    >%</button>
                    <button
                      type="button"
                      disabled={!iscilikOn}
                      onClick={() => setIscilikMode('manual')}
                      className={cn(
                        'px-2 font-medium transition-colors border-l border-border disabled:opacity-50',
                        iscilikMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                      )}
                      data-testid="button-pending-iscilik-mode-manual"
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
                        data-testid="input-pending-iscilik-pct"
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
                        data-testid="input-pending-iscilik-manual"
                      />
                      <span className="text-sm text-muted-foreground">₺</span>
                    </>
                  )}
                  {iscilikOn && (
                    <span className="text-sm font-medium" data-testid="text-pending-iscilik-amount">
                      = {formatMoney(iscilikAmountTRY, 'TRY')}
                    </span>
                  )}
                </div>
              </div>
              <div className="border-t pt-3 space-y-1.5" data-testid="text-pending-grand-total">
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
                  <div className="flex items-center justify-end gap-1.5">
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
                        data-testid={`button-pending-currency-${c}`}
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
      </CardContent>
    </Card>
  );
}
