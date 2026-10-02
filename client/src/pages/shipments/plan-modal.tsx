import { useState, useRef, useEffect } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Truck, Package, MapPin, CheckCircle2, ChevronRight, ChevronLeft, Hash, User, Calendar, Building2, Search, Phone, Car, Image as ImageIcon, BookOpen, Split } from 'lucide-react';
import type { Shipment, ProductionRecord, AddressLibrary } from '@shared/schema';
import {
  type PlanItemsMap,
  type LoadingType as SplitLoadingType,
  addOrReplaceItem,
  disableSplit,
  enableSplit,
  getItemsForShipment,
  isShipmentSelected,
  isShipmentSplit,
  paletToKoli as splitPaletToKoli,
  paletInfo,
  pruneOrphanedAddressItems,
  removeItemByKey,
  removeShipmentItems,
  remapAfterAddressRemoval,
  compactAddressesForSubmit,
  selectedShipmentCount,
  setItemField,
  totalKoliEquiv as splitTotalKoliEquiv,
} from '@/lib/shipment-plan-items';

/* ── Address Library Picker ────────────────────────────────────────────── */
function AddressLibraryPicker({ onSelect }: { onSelect: (address: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: library = [] } = useQuery<AddressLibrary[]>({
    queryKey: ['/api/address-library'],
    enabled: open,
  });
  if (!open) {
    return (
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors ml-1"
        onClick={() => setOpen(true)}
        data-testid="button-open-address-library-modal"
      >
        <BookOpen className="w-3 h-3" /> Kayıtlı adresler
      </button>
    );
  }
  return (
    <div className="mt-1.5 rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground">Kayıtlı adresler</span>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {library.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Henüz kayıtlı adres yok</p>
      ) : (
        <div className="max-h-40 overflow-y-auto divide-y">
          {library.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
              onClick={() => { onSelect(item.address); setOpen(false); }}
              data-testid={`button-modal-address-lib-${item.id}`}
            >
              <span className="truncate">{item.address}</span>
              <Badge variant="secondary" className="rounded-full text-[10px] shrink-0">{item.useCount}×</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ShipmentWithRecord = Shipment & {
  record: ProductionRecord;
  readyBoxes: number;
  totalPlannedBoxes: number;
};

// Maximum boxCount value the user may enter for the given shipment. boxCount
// always represents koli count (regardless of loadingType), capped at the
// shipment's readyBoxes (sevkiyat-phase logs minus already-assigned koli).
function maxBoxCountFor(s: ShipmentWithRecord, _loading: LoadingType): number {
  return Math.max(0, s.readyBoxes ?? 0);
}

// Compact display string for a koli total + loadingType. Returns just the koli
// total for koli mode; for palet modes adds the pallet breakdown including
// partial-last-pallet info when relevant.
//   ▸ koli mode      → "100 koli"
//   ▸ full pallets   → "20 palet · 400 koli"
//   ▸ partial pallet → "21 palet (sonuncusu 13 koli) · 413 koli"
function formatLoadingSummary(boxCount: number, loading: LoadingType): string {
  const koli = Math.max(0, Math.floor(boxCount || 0));
  const info = paletInfo(koli, loading);
  if (!info.isPalet) return `${koli} koli`;
  if (info.paletCount === 0) return `0 palet · 0 koli`;
  const head = info.hasPartialLastPalet
    ? `${info.paletCount} palet (sonuncusu ${info.lastPaletKoli} koli)`
    : `${info.paletCount} palet`;
  return `${head} · ${koli} koli`;
}

const VEHICLE_TYPES = {
  tir:       { label: 'Tır',       maxKoli: 660,      icon: '🚛', hasPallet: true,  hasDriver: true,  isCargo: false },
  on_teker:  { label: '10 Teker',  maxKoli: 340,      icon: '🚚', hasPallet: true,  hasDriver: true,  isCargo: false },
  kirkayak:  { label: 'Kırkayak', maxKoli: 380,      icon: '🚜', hasPallet: true,  hasDriver: true,  isCargo: false },
  panelvan:  { label: 'Panelvan',  maxKoli: 80,       icon: '🚐', hasPallet: false, hasDriver: true,  isCargo: false },
  kargo:     { label: 'Kargo',     maxKoli: Infinity, icon: '📦', hasPallet: false, hasDriver: false, isCargo: true  },
} as const;

type VehicleKey = keyof typeof VEHICLE_TYPES;
type LoadingType = SplitLoadingType;

interface Props {
  open: boolean;
  onClose: () => void;
  pendingShipments: ShipmentWithRecord[];
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" />{label} <span className="text-muted-foreground/50">(opsiyonel)</span>
      </label>
      <div className="flex gap-2 items-center">
        <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => ref.current?.click()}>
          <ImageIcon className="w-4 h-4" /> {value ? 'Değiştir' : 'Fotoğraf Seç'}
        </Button>
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-destructive hover:text-destructive/80">
            <X className="w-4 h-4" />
          </button>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onChange(await toBase64(f));
          }} />
      </div>
      {value && (
        <img src={value} alt="preview" className="mt-2 h-24 w-auto rounded-xl object-cover border" />
      )}
    </div>
  );
}

function IrsaliyePicker({ value, onChange, itemId }: { value: string; onChange: (v: string) => void; itemId: number }) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const handleFile = async (f: File) => onChange(await toBase64(f));
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" /> İrsaliye
      </p>
      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="irsaliye" className="h-20 w-auto rounded-lg object-cover border" />
          <button type="button" onClick={() => onChange('')}
            className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center shadow"
            data-testid={`button-remove-irsaliye-${itemId}`}>
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => camRef.current?.click()}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary transition-colors"
            data-testid={`button-irsaliye-camera-${itemId}`}>
            <ImageIcon className="w-3 h-3" /> Kamera
          </button>
          <button type="button" onClick={() => galRef.current?.click()}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 text-muted-foreground transition-colors"
            data-testid={`button-irsaliye-gallery-${itemId}`}>
            <ImageIcon className="w-3 h-3" /> Galeri
          </button>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

export default function ShipmentPlanModal({ open, onClose, pendingShipments }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);

  // Step 1: Vehicle
  const [vehicleType, setVehicleType] = useState<VehicleKey | null>(null);

  // Step 2 (driver): non-kargo only
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [dorsePlate, setDorsePlate] = useState('');
  const [driverPhoto, setDriverPhoto] = useState('');

  // Step 2/3: Date + address
  const [departureDate, setDepartureDate] = useState('');
  const [addresses, setAddresses] = useState<string[]>(['']);
  const [addressIrsaliyePhotos, setAddressIrsaliyePhotos] = useState<Record<number, string>>({});
  const [shippingCompany, setShippingCompany] = useState('');
  const [notes, setNotes] = useState('');

  // Step 3/4: Items — keyed by `${shipmentId}__${addressIndex}` to support
  // splitting one lot across multiple delivery addresses.
  const [items, setItems] = useState<PlanItemsMap>({});
  const [orderSearch, setOrderSearch] = useState('');

  // Step 4 (kargo details): kargo only
  const [cargoCompany, setCargoCompany] = useState('');
  const [cargoTitle, setCargoTitle] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [cargoLabelPhoto, setCargoLabelPhoto] = useState('');

  const vehicle = vehicleType ? VEHICLE_TYPES[vehicleType] : null;
  const isKargo = vehicleType === 'kargo';

  // Step labels differ for kargo vs normal
  const STEP_LABELS = isKargo
    ? ['Araç Tipi', 'Tarih & Adres', 'Sipariş Seçimi', 'Kargo Bilgileri']
    : ['Araç Tipi', 'Şoför Bilgileri', 'Tarih & Adres', 'Sipariş Seçimi'];
  const TOTAL_STEPS = 4;

  const totalKoliEquiv = splitTotalKoliEquiv(items);
  const capacityPct = vehicle && vehicle.maxKoli !== Infinity
    ? Math.min(100, Math.round((totalKoliEquiv / vehicle.maxKoli) * 100))
    : 0;

  // Indices of non-empty addresses (used to render per-address sub-rows).
  const nonEmptyAddressIdx = addresses
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.trim())
    .map(({ i }) => i);
  const hasMultipleAddresses = nonEmptyAddressIdx.length > 1;

  // If addresses shrink, drop entries pointing to indices that no longer exist.
  useEffect(() => {
    const valid = new Set<number>(addresses.map((_, i) => i));
    setItems(prev => pruneOrphanedAddressItems(prev, valid));
  }, [addresses.length]);

  const buildSubmitPayload = () => {
    type AddrPayload = { address: string; irsaliyePhoto?: string };
    const addrPayloads: Array<AddrPayload | null> = addresses.map((addr, idx) =>
      addr.trim() ? { address: addr, irsaliyePhoto: addressIrsaliyePhotos[idx] || undefined } : null
    );
    const compact = compactAddressesForSubmit(
      addrPayloads,
      a => a == null,
      items,
    );
    return { addresses: compact.addresses as AddrPayload[], items: compact.items };
  };

  const createPlan = useMutation({
    mutationFn: () => {
      const compact = buildSubmitPayload();
      return apiRequest('POST', '/api/shipment-plans', {
      vehicleType,
      plannedDepartureDate: departureDate,
      notes: notes || null,
      shippingCompany: shippingCompany || null,
      addresses: compact.addresses,
      items: compact.items,
      photos: [],
      // Driver info
      driverName: driverName || undefined,
      driverPhone: driverPhone || undefined,
      vehiclePlate: vehiclePlate || undefined,
      dorsePlate: dorsePlate || undefined,
      driverPhoto: driverPhoto || undefined,
      // Cargo info
      cargoCompany: cargoCompany || undefined,
      cargoTitle: cargoTitle || undefined,
      cargoDescription: cargoDescription || undefined,
      cargoLabelPhoto: cargoLabelPhoto || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/shipments'] });
      qc.invalidateQueries({ queryKey: ['/api/shipment-plans'] });
      toast({ title: 'Sevkiyat planı oluşturuldu' });
      handleClose();
    },
    onError: (err: Error) => toast({ title: 'Plan oluşturulamadı', description: err?.message, variant: 'destructive' }),
  });

  const handleClose = () => {
    setStep(1);
    setVehicleType(null);
    setDriverName(''); setDriverPhone(''); setVehiclePlate(''); setDorsePlate(''); setDriverPhoto('');
    setDepartureDate(''); setAddresses(['']); setAddressIrsaliyePhotos({}); setShippingCompany(''); setNotes('');
    setItems({}); setOrderSearch('');
    setCargoCompany(''); setCargoTitle(''); setCargoDescription(''); setCargoLabelPhoto('');
    onClose();
  };

  const toggleItem = (s: ShipmentWithRecord) => {
    const id = s.id;
    if (isShipmentSelected(items, id)) {
      setItems(prev => removeShipmentItems(prev, id));
    } else {
      // Default to all currently-ready boxes (from sevkiyat phase logs).
      const defaultBoxes = Math.max(1, s.readyBoxes ?? 0);
      const firstAddrIdx = nonEmptyAddressIdx[0] ?? 0;
      setItems(prev => addOrReplaceItem(prev, {
        shipmentId: id, boxCount: defaultBoxes, loadingType: 'koli', addressIndex: firstAddrIdx,
      }));
    }
  };

  const toggleSplit = (s: ShipmentWithRecord) => {
    const id = s.id;
    if (isShipmentSplit(items, id)) {
      setItems(prev => disableSplit(prev, id));
    } else {
      const defaultBoxes = Math.max(1, s.readyBoxes ?? 0);
      setItems(prev => enableSplit(prev, id, nonEmptyAddressIdx, defaultBoxes));
    }
  };

  // Clamp a user-typed boxCount against ready boxes for the given shipment +
  // loading type. Surfaces a toast when the value is reduced so the user
  // notices the clamp.
  const clampBoxCount = (s: ShipmentWithRecord, loading: LoadingType, value: number): number => {
    const safe = Math.max(0, Math.floor(value) || 0);
    const max = maxBoxCountFor(s, loading);
    if (max <= 0) {
      toast({ title: 'Hazır koli yok', description: `Bu sipariş için sevkiyat fazına işlenmiş koli bulunmuyor.`, variant: 'destructive' });
      return 0;
    }
    if (safe > max) {
      toast({
        title: 'Hazır koliden fazla',
        description: `En fazla ${max} koli girilebilir.`,
        variant: 'destructive',
      });
      return max;
    }
    return safe;
  };

  const canProceed = (): boolean => {
    if (step === 1) return !!vehicleType;
    if (isKargo) {
      if (step === 2) return !!departureDate && addresses.some(a => a.trim());
      if (step === 3) return selectedShipmentCount(items) > 0;
      if (step === 4) return true; // cargo details optional
    } else {
      if (step === 2) return !!driverName && !!vehiclePlate; // at least name + plate
      if (step === 3) return !!departureDate && addresses.some(a => a.trim());
      if (step === 4) return selectedShipmentCount(items) > 0;
    }
    return true;
  };

  // Map wizard step to semantic step for display
  const getStepLabel = () => STEP_LABELS[step - 1] ?? '';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-primary" />
            Sevkiyat Planla
          </DialogTitle>
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{getStepLabel()}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* STEP 1: Araç Tipi */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">Hangi araç tipi kullanılacak?</p>
              {(Object.entries(VEHICLE_TYPES) as [VehicleKey, typeof VEHICLE_TYPES[VehicleKey]][]).map(([key, v]) => (
                <button
                  key={key}
                  onClick={() => setVehicleType(key)}
                  className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${vehicleType === key ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/40 hover:bg-muted/30'}`}
                  data-testid={`button-vehicle-${key}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{v.icon}</span>
                      <div>
                        <p className="font-bold text-base">{v.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.isCargo
                            ? 'Sınırsız kapasite — kargo firması bilgileri girilir'
                            : v.hasPallet
                              ? `${v.maxKoli} koli kapasitesi · palet seçeneği var`
                              : `${v.maxKoli} koli kapasitesi · sadece koli`}
                        </p>
                      </div>
                    </div>
                    {vehicleType === key && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                  </div>
                </button>
              ))}
              {vehicle?.hasPallet && (
                <p className="text-xs text-muted-foreground pt-1">* 16'lı palet = 16 koli · 20'li palet = 20 koli</p>
              )}
            </div>
          )}

          {/* STEP 2 (non-kargo): Şoför Bilgileri */}
          {step === 2 && !isKargo && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-2">Şoför ve araç bilgilerini girin:</p>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <User className="w-3 h-3" />Şoför Adı <span className="text-red-500">*</span>
                </label>
                <Input placeholder="Şoförün adı soyadı" value={driverName} onChange={e => setDriverName(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" />Telefon Numarası
                </label>
                <Input placeholder="0555 123 45 67" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className="rounded-xl" type="tel" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <Car className="w-3 h-3" />Araç Plakası <span className="text-red-500">*</span>
                </label>
                <Input placeholder="34 ABC 123" value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <Car className="w-3 h-3" />Dorse Plakası
                </label>
                <Input placeholder="34 ABC 456" value={dorsePlate} onChange={e => setDorsePlate(e.target.value)} className="rounded-xl" />
              </div>
              <PhotoPicker label="Araç Fotoğrafı" value={driverPhoto} onChange={setDriverPhoto} />
            </div>
          )}

          {/* STEP 2 (kargo) or STEP 3 (non-kargo): Tarih & Adres */}
          {((isKargo && step === 2) || (!isKargo && step === 3)) && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />Tahmini Çıkış Tarihi <span className="text-red-500">*</span>
                </label>
                <Input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} className="rounded-xl"
                  min={new Date().toISOString().split('T')[0]} required data-testid="input-departure-date" />
                {!departureDate && <p className="text-xs text-red-500 mt-1">Çıkış tarihi zorunludur</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />Sevkiyat Firması
                </label>
                <Input placeholder="Örn: DHL, MNG, Aras Kargo..." value={shippingCompany} onChange={e => setShippingCompany(e.target.value)} className="rounded-xl" data-testid="input-shipping-company" />
              </div>
              <p className="text-sm text-muted-foreground pt-2">Teslimat adresi veya adreslerini girin:</p>
              {addresses.map((addr, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <MapPin className="w-4 h-4 text-primary mt-2.5 shrink-0" />
                      <Input placeholder={`Adres ${i + 1}`} value={addr}
                        onChange={e => { const next = [...addresses]; next[i] = e.target.value; setAddresses(next); }}
                        className="rounded-xl flex-1" data-testid={`input-address-${i}`} />
                    </div>
                    {addresses.length > 1 && (
                      <button className="mt-1 p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => {
                          setAddresses(addresses.filter((_, j) => j !== i));
                          setItems(prev => remapAfterAddressRemoval(prev, i));
                          setAddressIrsaliyePhotos(prev => {
                            const next: Record<number, string> = {};
                            Object.entries(prev).forEach(([k, v]) => {
                              const ki = Number(k);
                              if (ki < i) next[ki] = v;
                              else if (ki > i) next[ki - 1] = v;
                            });
                            return next;
                          });
                        }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {addr.trim() && (
                    <div className="ml-6">
                      <IrsaliyePicker
                        value={addressIrsaliyePhotos[i] ?? ''}
                        onChange={v => setAddressIrsaliyePhotos(prev => ({ ...prev, [i]: v }))}
                        itemId={i}
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full rounded-xl gap-2 mt-2"
                onClick={() => setAddresses([...addresses, ''])} data-testid="button-add-address">
                <Plus className="w-4 h-4" /> Adres Ekle
              </Button>
              <AddressLibraryPicker onSelect={addr => {
                const emptyIdx = addresses.findIndex(a => !a.trim());
                if (emptyIdx >= 0) {
                  const n = [...addresses]; n[emptyIdx] = addr; setAddresses(n);
                } else {
                  setAddresses([...addresses, addr]);
                }
              }} />
              <div className="pt-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Not (isteğe bağlı)</label>
                <Input placeholder="Plan notu..." value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl" />
              </div>
            </div>
          )}

          {/* STEP 3 (kargo) or STEP 4 (non-kargo): Sipariş Seçimi */}
          {((isKargo && step === 3) || (!isKargo && step === 4)) && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Sipariş, müşteri veya lot ara..." value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)} className="pl-9 rounded-xl" data-testid="input-order-search" />
              </div>
              {vehicle && vehicle.maxKoli !== Infinity && (
                <div className="mb-4 p-3 bg-muted/30 rounded-xl">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{vehicle.label} kapasitesi</span>
                    <span className={`font-semibold ${capacityPct > 90 ? 'text-red-500' : capacityPct > 70 ? 'text-amber-500' : 'text-green-600'}`}>
                      {totalKoliEquiv} / {vehicle.maxKoli} koli ({capacityPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${capacityPct > 90 ? 'bg-red-500' : capacityPct > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                      style={{ width: `${capacityPct}%` }} />
                  </div>
                </div>
              )}
              {(() => {
                const q = normalizeForSearch(orderSearch.trim());
                const filtered = q
                  ? pendingShipments.filter(s =>
                      normalizeForSearch(s.record.title).includes(q) ||
                      normalizeForSearch(s.record.customer).includes(q) ||
                      normalizeForSearch(s.record.lotNumber).includes(q) ||
                      normalizeForSearch(s.record.referenceId).includes(q))
                  : pendingShipments;
                return filtered.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground opacity-60">
                    <Package className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">{q ? 'Eşleşen sipariş bulunamadı' : 'Bekleyen sipariş yok'}</p>
                  </div>
                ) : filtered.map(s => {
                  const r = s.record;
                  const selected = isShipmentSelected(items, s.id);
                  const split = isShipmentSplit(items, s.id);
                  const shipmentItems = getItemsForShipment(items, s.id);
                  const singleEntry = !split ? shipmentItems[0]?.entry : undefined;
                  const singleKey = !split ? shipmentItems[0]?.key : undefined;
                  const ready = s.readyBoxes ?? 0;
                  const totalPlanned = s.totalPlannedBoxes ?? Math.ceil(r.totalQuantity / (r.itemsPerBox || 1));
                  const sumBoxes = shipmentItems.reduce(
                    (sum, it) => sum + it.entry.boxCount * splitPaletToKoli(it.entry.loadingType),
                    0,
                  );
                  return (
                    <div key={s.id}
                      className={`rounded-2xl border-2 p-3 transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border/40'}`}
                      data-testid={`card-plan-order-${s.id}`}>
                      <div className="flex items-start gap-2">
                        <button
                          className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40'}`}
                          onClick={() => toggleItem(s)} data-testid={`checkbox-plan-order-${s.id}`}>
                          {selected && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm line-clamp-1">{r.title}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            {r.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.customer}</span>}
                            {r.lotNumber && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{r.lotNumber}</span>}
                            <span className="flex items-center gap-1" data-testid={`text-ready-${s.id}`}>
                              <Package className="w-3 h-3" />
                              <span className="font-semibold text-primary">{ready}</span>
                              <span className="text-muted-foreground/70">/ {totalPlanned}</span>
                              <span className="text-muted-foreground/70">koli</span>
                            </span>
                          </div>
                          {selected && (
                            <div className="mt-2 space-y-2">
                              <div className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                                <span className="text-muted-foreground">Bu plana eklenen</span>
                                <span className={`font-semibold ${sumBoxes > ready ? 'text-red-500' : 'text-primary'}`} data-testid={`text-assigned-${s.id}`}>
                                  {sumBoxes} / {ready} koli
                                </span>
                              </div>
                              {/* Multi-address split toggle — only when 2+ addresses */}
                              {hasMultipleAddresses && (
                                <label className="flex items-center gap-2 text-xs cursor-pointer select-none" data-testid={`label-split-${s.id}`}>
                                  <input
                                    type="checkbox"
                                    checked={split}
                                    onChange={() => toggleSplit(s)}
                                    className="w-4 h-4 rounded border-muted-foreground/40 accent-primary"
                                    data-testid={`checkbox-split-${s.id}`}
                                  />
                                  <Split className="w-3.5 h-3.5 text-primary" />
                                  <span className="font-medium">Birden fazla adrese teslim edilecek</span>
                                </label>
                              )}

                              {/* Single-address mode (default) */}
                              {!split && singleEntry && singleKey && (
                                <>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Input type="text" inputMode="numeric" value={String(singleEntry.boxCount)}
                                      onChange={e => {
                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                        const v = raw === '' ? 0 : parseInt(raw, 10);
                                        setItems(prev => setItemField(prev, singleKey, 'boxCount', clampBoxCount(s, singleEntry.loadingType, v)));
                                      }}
                                      onFocus={e => e.target.select()}
                                      className="rounded-lg h-7 text-sm w-24" placeholder="0"
                                      data-testid={`input-plan-boxes-${s.id}`} />
                                    {vehicle?.hasPallet ? (
                                      <div className="flex rounded-lg overflow-hidden border text-xs">
                                        <button className={`px-3 py-1 transition-colors ${singleEntry.loadingType === 'koli' ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                          onClick={() => setItems(prev => setItemField(prev, singleKey, 'loadingType', 'koli'))} data-testid={`button-koli-${s.id}`}>Koli</button>
                                        <button className={`px-3 py-1 transition-colors ${singleEntry.loadingType === 'palet16' ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                          onClick={() => setItems(prev => setItemField(prev, singleKey, 'loadingType', 'palet16'))} data-testid={`button-palet16-${s.id}`}>16'lı Palet</button>
                                        <button className={`px-3 py-1 transition-colors ${singleEntry.loadingType === 'palet20' ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                          onClick={() => setItems(prev => setItemField(prev, singleKey, 'loadingType', 'palet20'))} data-testid={`button-palet20-${s.id}`}>20'li Palet</button>
                                      </div>
                                    ) : (
                                      <Badge variant="secondary">Koli</Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground" data-testid={`text-loading-summary-${s.id}`}>
                                      = {formatLoadingSummary(singleEntry.boxCount, singleEntry.loadingType)}
                                    </span>
                                  </div>

                                  {/* Single-mode address picker — when 2+ addresses */}
                                  {hasMultipleAddresses && (
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-primary mt-1.5 shrink-0" />
                                      <div className="flex flex-col gap-1 flex-1">
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Teslimat Adresi</p>
                                        <div className="flex flex-col gap-1">
                                          {addresses.map((addr, ai) => {
                                            if (!addr.trim()) return null;
                                            const isSelected = (singleEntry.addressIndex ?? 0) === ai;
                                            return (
                                              <button
                                                key={ai}
                                                type="button"
                                                onClick={() => setItems(prev => setItemField(prev, singleKey, 'addressIndex', ai))}
                                                className={`text-left text-xs px-2.5 py-1.5 rounded-lg border transition-colors line-clamp-1 ${isSelected ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border/50 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground'}`}
                                                data-testid={`button-addr-${s.id}-${ai}`}
                                              >
                                                {addr}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Split mode: one editable sub-row per address */}
                              {split && (
                                <div className="space-y-2">
                                  {nonEmptyAddressIdx.map(ai => {
                                    const found = shipmentItems.find(it => (it.entry.addressIndex ?? 0) === ai);
                                    if (!found) return null;
                                    const subEntry = found.entry;
                                    const subKey = found.key;
                                    const addrText = addresses[ai] ?? '';
                                    return (
                                      <div key={ai} className="rounded-xl border border-primary/20 bg-card p-2.5 space-y-1.5"
                                        data-testid={`split-row-${s.id}-${ai}`}>
                                        <div className="flex items-start gap-1.5">
                                          <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                          <p className="text-xs font-medium text-primary line-clamp-2 flex-1" data-testid={`text-split-addr-${s.id}-${ai}`}>{addrText}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Input type="text" inputMode="numeric" value={String(subEntry.boxCount)}
                                            onChange={e => {
                                              const raw = e.target.value.replace(/[^0-9]/g, '');
                                              const v = raw === '' ? 0 : parseInt(raw, 10);
                                              const max = maxBoxCountFor(s, subEntry.loadingType);
                                              const othersSum = shipmentItems
                                                .filter(it => it.key !== subKey)
                                                .reduce((sum, it) => sum + it.entry.boxCount, 0);
                                              const available = Math.max(0, max - othersSum);
                                              const clamped = Math.min(v, available);
                                              if (v > available) {
                                                toast({ title: 'Hazır koliden fazla', description: `Bu adres için en fazla ${available} koli girilebilir.`, variant: 'destructive' });
                                              }
                                              setItems(prev => setItemField(prev, subKey, 'boxCount', clamped));
                                            }}
                                            onFocus={e => e.target.select()}
                                            className="rounded-lg h-7 text-sm w-20" placeholder="0"
                                            data-testid={`input-split-boxes-${s.id}-${ai}`} />
                                          {vehicle?.hasPallet ? (
                                            <div className="flex rounded-lg overflow-hidden border text-xs">
                                              <button className={`px-2.5 py-1 transition-colors ${subEntry.loadingType === 'koli' ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                                onClick={() => setItems(prev => setItemField(prev, subKey, 'loadingType', 'koli'))} data-testid={`button-split-koli-${s.id}-${ai}`}>Koli</button>
                                              <button className={`px-2.5 py-1 transition-colors ${subEntry.loadingType === 'palet16' ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                                onClick={() => setItems(prev => setItemField(prev, subKey, 'loadingType', 'palet16'))} data-testid={`button-split-palet16-${s.id}-${ai}`}>16'lı</button>
                                              <button className={`px-2.5 py-1 transition-colors ${subEntry.loadingType === 'palet20' ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                                onClick={() => setItems(prev => setItemField(prev, subKey, 'loadingType', 'palet20'))} data-testid={`button-split-palet20-${s.id}-${ai}`}>20'li</button>
                                            </div>
                                          ) : (
                                            <Badge variant="secondary">Koli</Badge>
                                          )}
                                          <span className="text-xs text-muted-foreground" data-testid={`text-split-loading-summary-${s.id}-${ai}`}>
                                            = {formatLoadingSummary(subEntry.boxCount, subEntry.loadingType)}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-center justify-between text-xs px-1 pt-1 border-t">
                                    <span className="text-muted-foreground">Toplam</span>
                                    <span className={`font-semibold ${sumBoxes > ready ? 'text-red-500' : 'text-primary'}`} data-testid={`text-split-total-${s.id}`}>
                                      {sumBoxes} / {ready} koli
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* STEP 4 (kargo only): Kargo Bilgileri */}
          {isKargo && step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-2">Kargo gönderim bilgilerini girin:</p>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />Kargo Firması
                </label>
                <Input placeholder="Örn: Yurtiçi Kargo, MNG, Aras..." value={cargoCompany} onChange={e => setCargoCompany(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Başlık</label>
                <Input placeholder="Gönderi başlığı" value={cargoTitle} onChange={e => setCargoTitle(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Açıklama</label>
                <Input placeholder="Gönderi açıklaması" value={cargoDescription} onChange={e => setCargoDescription(e.target.value)} className="rounded-xl" />
              </div>
              <PhotoPicker label="Etiket Fotoğrafı" value={cargoLabelPhoto} onChange={setCargoLabelPhoto} />
            </div>
          )}

        </div>

        <div className="px-6 pb-6 pt-4 border-t flex gap-2 shrink-0">
          {step > 1 && (
            <Button variant="outline" className="flex-1 rounded-xl gap-1" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft className="w-4 h-4" /> Geri
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button className="flex-1 rounded-xl gap-1" disabled={!canProceed()} onClick={() => setStep(s => s + 1)}
              data-testid="button-plan-next">
              İleri <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="flex-1 rounded-xl gap-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={!canProceed() || createPlan.isPending}
              onClick={() => createPlan.mutate()}
              data-testid="button-create-plan"
            >
              <Truck className="w-4 h-4" />
              {createPlan.isPending ? 'Oluşturuluyor...' : 'Planı Oluştur'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
