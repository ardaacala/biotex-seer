import { useState, useRef, useEffect, useCallback } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Truck, MapPin, Package, Calendar, Clock, User, History,
  CheckCircle2, LogOut, ChevronDown, ChevronUp, Hash, ZoomIn, ChevronLeft, ChevronRight, X as XIcon, Camera, Pencil, Check, Image, Plus, FileEdit, Search, Trash2, BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Split } from 'lucide-react';
import type { ShipmentPlan, ShipmentPlanAddress, ShipmentPlanItem, ShipmentPlanPhoto, Shipment, ProductionRecord, AddressLibrary } from '@shared/schema';
import { LazyImage } from '@/components/lazy-image';
import { VEHICLE_TYPES } from '@shared/schema';
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
  removeShipmentItems,
  remapAfterAddressRemoval,
  compactAddressesForSubmit,
  selectedShipmentCount,
  setItemField,
  totalKoliEquiv as splitTotalKoliEquiv,
  backfillSplitAddresses,
} from '@/lib/shipment-plan-items';

type LoadingType = SplitLoadingType;
const paletToKoli = splitPaletToKoli;

// boxCount is the koli total for all loadingTypes; for palet modes, also show
// the pallet breakdown including a partial last pallet when relevant.
//   ▸ koli mode      → "100 koli"
//   ▸ full pallets   → "20 palet · 400 koli"
//   ▸ partial pallet → "21 palet (sonuncusu 13 koli) · 413 koli"
function formatLoadingSummary(boxCount: number, loadingType: string): string {
  const koli = Math.max(0, Math.floor(boxCount || 0));
  const info = paletInfo(koli, loadingType);
  if (!info.isPalet) return `${koli} koli`;
  if (info.paletCount === 0) return `0 palet · 0 koli`;
  const head = info.hasPartialLastPalet
    ? `${info.paletCount} palet (sonuncusu ${info.lastPaletKoli} koli)`
    : `${info.paletCount} palet`;
  return `${head} · ${koli} koli`;
}

type PlanFull = ShipmentPlan & {
  addresses: Array<ShipmentPlanAddress & { hasIrsaliyePhoto?: boolean }>;
  items: Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord }; hasIrsaliyePhoto?: boolean }>;
  photos: Array<ShipmentPlanPhoto & { hasPhoto?: boolean }>;
  createdByUser?: string;
  departedByUser?: string;
  hasDriverPhoto?: boolean;
  hasCargoLabelPhoto?: boolean;
};

function fmt(d: string | Date | null | undefined, withTime = false) {
  if (!d) return '—';
  const date = new Date(d as string);
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = (d as string).split('-');
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const VEHICLE_TYPE_OPTIONS = {
  tir: { label: 'Tır', icon: '🚛' },
  on_teker: { label: '10 Teker', icon: '🚚' },
  kirkayak: { label: 'Kırkayak', icon: '🚜' },
} as const;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function IrsaliyePickerInline({ value, onChange, itemId }: { value: string; onChange: (v: string) => void; itemId: number }) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const handleFile = async (f: File) => onChange(await toBase64(f));
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1 flex items-center gap-1">
        <Image className="w-3 h-3" /> İrsaliye
      </p>
      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="irsaliye" className="h-20 w-auto rounded-lg object-cover border" />
          <button type="button" onClick={() => onChange('')}
            className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center shadow"
            data-testid={`button-remove-irsaliye-${itemId}`}>
            <XIcon className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => camRef.current?.click()}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary transition-colors"
            data-testid={`button-irsaliye-camera-${itemId}`}>
            <Camera className="w-3 h-3" /> Kamera
          </button>
          <button type="button" onClick={() => galRef.current?.click()}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 text-muted-foreground transition-colors"
            data-testid={`button-irsaliye-gallery-${itemId}`}>
            <Image className="w-3 h-3" /> Galeri
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
        className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors mt-1 ml-1"
        onClick={() => setOpen(true)}
        data-testid="button-open-address-library"
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
          <XIcon className="w-3.5 h-3.5" />
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
              data-testid={`button-address-lib-${item.id}`}
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

/* ── Edit Plan Dialog ──────────────────────────────────────────────────── */
function EditPlanDialog({ plan, open, onClose }: { plan: PlanFull; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [vehicleType, setVehicleType] = useState(plan.vehicleType);
  const [departureDate, setDepartureDate] = useState(plan.plannedDepartureDate ?? '');
  const [shippingCompany, setShippingCompany] = useState(plan.shippingCompany ?? '');
  const [notes, setNotes] = useState(plan.notes ?? '');
  const [addresses, setAddresses] = useState<string[]>(
    plan.addresses.length > 0 ? plan.addresses.map(a => a.address) : ['']
  );
  const [addressIrsaliyePhotos, setAddressIrsaliyePhotos] = useState<Record<number, string>>({});
  const [editItems, setEditItems] = useState<PlanItemsMap>({});
  // Explicit display order for in-plan shipments. Kept separate from
  // editItems map keys so that intra-shipment edits (split toggle, address
  // change, etc) which churn the keys do NOT reorder the visible list.
  // We only mutate this on explicit add/remove of a shipment.
  const [shipmentOrder, setShipmentOrder] = useState<number[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [planPhoto, setPlanPhoto] = useState<string>('');
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [pendingPhotoFetches, setPendingPhotoFetches] = useState(0);
  const [photoHydrationFailed, setPhotoHydrationFailed] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => { const url = e.target?.result as string; if (url) setPlanPhoto(url); };
    reader.readAsDataURL(file);
  };

  const { data: allShipments = [] } = useQuery<Array<Shipment & { record: ProductionRecord; readyBoxes: number; totalPlannedBoxes: number }>>({
    queryKey: ['/api/shipments'],
    enabled: open,
  });

  // Boxes (in koli) currently allocated to THIS plan per shipment, captured
  // from the un-edited snapshot. The backend's readyBoxes already subtracts
  // these, so when computing the editing cap we add them back.
  const originalKoliPerShipment = (() => {
    const map = new Map<number, number>();
    for (const it of plan.items) {
      // boxCount is already the koli total regardless of loadingType.
      const k = it.boxCount ?? 0;
      map.set(it.shipmentId, (map.get(it.shipmentId) ?? 0) + k);
    }
    return map;
  })();
  const editableReady = (s: Shipment & { readyBoxes?: number }) =>
    Math.max(0, (s.readyBoxes ?? 0) + (originalKoliPerShipment.get(s.id) ?? 0));

  const { data: detailData, isError: detailFetchError } = useQuery<PlanFull>({
    queryKey: ['/api/shipment-plans', plan.id],
    enabled: open,
    retry: 2,
  });

  useEffect(() => {
    if (open) {
      setVehicleType(plan.vehicleType);
      setDepartureDate(plan.plannedDepartureDate ?? '');
      setShippingCompany(plan.shippingCompany ?? '');
      setNotes(plan.notes ?? '');
      setAddresses(plan.addresses.length > 0 ? plan.addresses.map(a => a.address) : ['']);
      setAddressIrsaliyePhotos({});
      setItemSearch('');
      setPlanPhoto('');
      setDetailLoaded(false);
      setPendingPhotoFetches(0);
      setPhotoHydrationFailed(false);
      let initMap: PlanItemsMap = {};
      const initOrder: number[] = [];
      for (const item of plan.items) {
        initMap = addOrReplaceItem(initMap, {
          shipmentId: item.shipmentId,
          boxCount: item.boxCount,
          loadingType: (item.loadingType as LoadingType) || 'koli',
          addressIndex: item.addressIndex ?? 0,
        });
        if (!initOrder.includes(item.shipmentId)) initOrder.push(item.shipmentId);
      }
      setEditItems(backfillSplitAddresses(initMap, nonEmptyAddressIdx));
      setShipmentOrder(initOrder);
    }
  }, [open, plan]);

  useEffect(() => {
    if (detailData && open && !detailLoaded) {
      setDetailLoaded(true);
      let initMap: PlanItemsMap = {};
      const initOrder: number[] = [];
      for (const item of detailData.items) {
        initMap = addOrReplaceItem(initMap, {
          shipmentId: item.shipmentId,
          boxCount: item.boxCount,
          loadingType: (item.loadingType as LoadingType) || 'koli',
          addressIndex: item.addressIndex ?? 0,
        });
        if (!initOrder.includes(item.shipmentId)) initOrder.push(item.shipmentId);
      }
      setEditItems(backfillSplitAddresses(initMap, nonEmptyAddressIdx));
      setShipmentOrder(initOrder);

      // Fetch full base64 photos lazily so the edit form can round-trip them.
      // Track pending fetches so the Save button stays disabled until all
      // existing photos are hydrated; otherwise the user could submit before
      // they arrive and the PATCH would drop the existing photos.
      const photoFetches: Array<{ kind: 'plan'; url: string } | { kind: 'address'; idx: number; url: string }> = [];
      const firstPhoto = detailData.photos?.find(p => p.hasPhoto);
      if (firstPhoto) {
        photoFetches.push({ kind: 'plan', url: `/api/photo/shipment_plan_photos/${firstPhoto.id}/photoUrl?json=1` });
      } else {
        setPlanPhoto('');
      }
      detailData.addresses.forEach((addr, idx) => {
        if (addr.hasIrsaliyePhoto) {
          photoFetches.push({ kind: 'address', idx, url: `/api/photo/shipment_plan_addresses/${addr.id}/irsaliyePhoto?json=1` });
        }
      });

      if (photoFetches.length === 0) return;
      setPendingPhotoFetches(photoFetches.length);
      for (const job of photoFetches) {
        fetch(job.url, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((d: { photoUrl?: string | null } | null) => {
            if (!d?.photoUrl) {
              setPhotoHydrationFailed(true);
              return;
            }
            if (job.kind === 'plan') {
              setPlanPhoto(d.photoUrl);
            } else {
              setAddressIrsaliyePhotos(prev => ({ ...prev, [job.idx]: d.photoUrl as string }));
            }
          })
          .catch(() => setPhotoHydrationFailed(true))
          .finally(() => setPendingPhotoFetches(n => Math.max(0, n - 1)));
      }
    }
  }, [detailData, open, detailLoaded]);

  // Indices of non-empty addresses (used to render per-address sub-rows).
  const nonEmptyAddressIdx = addresses
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.trim())
    .map(({ i }) => i);
  const hasMultipleAddresses = nonEmptyAddressIdx.length > 1;

  // If addresses shrink, drop entries pointing to indices that no longer exist.
  useEffect(() => {
    const valid = new Set<number>(addresses.map((_, i) => i));
    setEditItems(prev => pruneOrphanedAddressItems(prev, valid));
  }, [addresses.length]);

  const toggleShipment = (s: Shipment & { record: ProductionRecord; readyBoxes?: number }) => {
    if (isShipmentSelected(editItems, s.id)) {
      setEditItems(prev => removeShipmentItems(prev, s.id));
      setShipmentOrder(prev => prev.filter(id => id !== s.id));
    } else {
      // Default to currently editable ready (= readyBoxes + this plan's existing assignment).
      const defaultBoxes = Math.max(1, editableReady(s));
      const firstAddrIdx = nonEmptyAddressIdx[0] ?? 0;
      setEditItems(prev => addOrReplaceItem(prev, {
        shipmentId: s.id, boxCount: defaultBoxes, loadingType: 'koli', addressIndex: firstAddrIdx,
      }));
      setShipmentOrder(prev => prev.includes(s.id) ? prev : [...prev, s.id]);
    }
  };

  const toggleSplit = (s: Shipment & { record: ProductionRecord; readyBoxes?: number }) => {
    if (isShipmentSplit(editItems, s.id)) {
      setEditItems(prev => disableSplit(prev, s.id));
    } else {
      const defaultBoxes = Math.max(1, editableReady(s));
      setEditItems(prev => enableSplit(prev, s.id, nonEmptyAddressIdx, defaultBoxes));
    }
  };

  const totalKoli = splitTotalKoliEquiv(editItems);

  const saveMutation = useMutation({
    mutationFn: () => {
      type AddrPayload = { address: string; irsaliyePhoto?: string };
      const addrPayloads: Array<AddrPayload | null> = addresses.map((addr, idx) =>
        addr.trim() ? { address: addr, irsaliyePhoto: addressIrsaliyePhotos[idx] || undefined } : null
      );
      const compact = compactAddressesForSubmit(addrPayloads, a => a == null, editItems);
      return apiRequest('PATCH', `/api/shipment-plans/${plan.id}`, {
        vehicleType,
        plannedDepartureDate: departureDate || null,
        shippingCompany: shippingCompany.trim() || null,
        notes: notes.trim() || null,
        addresses: compact.addresses as AddrPayload[],
        items: compact.items,
        photos: planPhoto ? [planPhoto] : [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/shipment-plans'] });
      qc.invalidateQueries({ queryKey: ['/api/shipments'] });
      toast({ title: 'Plan güncellendi' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Plan güncellenemedi', description: err?.message, variant: 'destructive' }),
  });

  // Categorize shipments: those in the plan vs others available
  const planShipmentIds = new Set<number>(
    Object.keys(editItems).map(k => Number(k.split('__')[0]))
  );
  const availableShipments = Array.isArray(allShipments)
    ? allShipments.filter(s => !planShipmentIds.has(s.id))
    : [];
  const filteredAvailable = itemSearch.trim()
    ? availableShipments.filter(s => {
        const q = normalizeForSearch(itemSearch);
        return normalizeForSearch(s.record.title).includes(q) ||
          normalizeForSearch(s.record.customer).includes(q) ||
          normalizeForSearch(s.record.lotNumber).includes(q);
      })
    : availableShipments;

  // Shipments already in plan, ordered by `shipmentOrder` so newly added
  // shipments appear at the bottom of the list (not the top), and intra-
  // shipment edits (split, address change, etc) do not reorder anything.
  // Fallback: any shipment present in editItems but missing from
  // shipmentOrder (e.g. legacy state) gets appended.
  const allInPlanIds = Array.from(planShipmentIds);
  const orderedShipmentIds = [
    ...shipmentOrder.filter(id => planShipmentIds.has(id)),
    ...allInPlanIds.filter(id => !shipmentOrder.includes(id)),
  ];
  const shipmentById = new Map<number, Shipment & { record: ProductionRecord }>();
  if (Array.isArray(allShipments)) {
    for (const s of allShipments) shipmentById.set(s.id, s);
  }
  for (const it of plan.items) {
    if (!shipmentById.has(it.shipment.id)) {
      shipmentById.set(it.shipment.id, it.shipment as Shipment & { record: ProductionRecord });
    }
  }
  const planShipmentsData = orderedShipmentIds
    .map(id => shipmentById.get(id))
    .filter((s): s is Shipment & { record: ProductionRecord } => !!s);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-primary" />
            Sevkiyat Planını Düzenle
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Araç Tipi */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Araç Tipi</label>
            <div className="flex gap-2">
              {(Object.entries(VEHICLE_TYPE_OPTIONS) as [string, { label: string; icon: string }][]).map(([key, v]) => (
                <button
                  key={key}
                  onClick={() => setVehicleType(key)}
                  className={`flex-1 rounded-xl border-2 p-3 text-center transition-all ${vehicleType === key ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/40'}`}
                  data-testid={`edit-vehicle-${key}`}
                >
                  <div className="text-xl mb-0.5">{v.icon}</div>
                  <div className="text-xs font-semibold">{v.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tarih + Firma */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Çıkış Tarihi
              </label>
              <Input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} className="rounded-xl" data-testid="edit-departure-date" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Firma</label>
              <Input placeholder="DHL, MNG..." value={shippingCompany} onChange={e => setShippingCompany(e.target.value)} className="rounded-xl" data-testid="edit-shipping-company" />
            </div>
          </div>

          {/* Adresler */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Teslimat Adresleri
            </label>
            <div className="space-y-3">
              {addresses.map((addr, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input placeholder={`Adres ${i + 1}`} value={addr} onChange={e => { const n = [...addresses]; n[i] = e.target.value; setAddresses(n); }} className="rounded-xl flex-1" data-testid={`edit-address-${i}`} />
                    {addresses.length > 1 && (
                      <button className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" onClick={() => {
                        setAddresses(addresses.filter((_, j) => j !== i));
                        setEditItems(prev => remapAfterAddressRemoval(prev, i));
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
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {addr.trim() && (
                    <div className="ml-1">
                      <IrsaliyePickerInline
                        value={addressIrsaliyePhotos[i] ?? ''}
                        onChange={v => setAddressIrsaliyePhotos(prev => ({ ...prev, [i]: v }))}
                        itemId={i}
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full rounded-xl gap-2" onClick={() => setAddresses([...addresses, ''])} data-testid="edit-add-address">
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
            </div>
          </div>

          {/* Not */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Not</label>
            <Input placeholder="Plan notu..." value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl" data-testid="edit-notes" />
          </div>

          {/* Fotoğraf */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2 flex items-center gap-1">
              <Image className="w-3 h-3" /> Fotoğraf <span className="text-muted-foreground/50 normal-case font-normal">(isteğe bağlı)</span>
            </label>
            {planPhoto ? (
              <div className="relative inline-block">
                <img src={planPhoto} alt="Plan fotoğrafı" className="h-32 w-auto rounded-xl object-cover border" />
                <button
                  type="button"
                  onClick={() => setPlanPhoto('')}
                  className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
                  data-testid="button-remove-plan-photo"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 p-4 transition-colors"
                  onClick={() => cameraRef.current?.click()}
                  data-testid="button-edit-plan-camera"
                >
                  <Camera className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium text-primary">Kamera</span>
                </button>
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 p-4 transition-colors"
                  onClick={() => galleryRef.current?.click()}
                  data-testid="button-edit-plan-gallery"
                >
                  <Image className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Galeri</span>
                </button>
              </div>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ''; }} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ''; }} />
          </div>

          {/* Sevk Edilen İçerikler */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Package className="w-3 h-3" /> Sevk Edilen İçerikler
              </label>
              <span className="text-xs text-muted-foreground">{selectedShipmentCount(editItems)} sipariş · {totalKoli} koli</span>
            </div>

            {/* Current items in plan */}
            <div className="space-y-2 mb-3">
              {planShipmentsData.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3 bg-muted/20 rounded-xl">Henüz sipariş eklenmemiş</p>
              )}
              {planShipmentsData.map(s => {
                const split = isShipmentSplit(editItems, s.id);
                const shipmentItems = getItemsForShipment(editItems, s.id);
                if (shipmentItems.length === 0) return null;
                const singleEntry = !split ? shipmentItems[0]?.entry : undefined;
                const singleKey = !split ? shipmentItems[0]?.key : undefined;
                // boxCount is the koli total regardless of loadingType.
                const sumBoxes = shipmentItems.reduce(
                  (sum, it) => sum + (it.entry.boxCount ?? 0),
                  0,
                );
                const r = s.record;
                return (
                  <div key={s.id} className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-start gap-2">
                      <Package className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm line-clamp-1">{r.title}</p>
                        {r.customer && <p className="text-xs text-muted-foreground">{r.customer}</p>}

                        <div className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5 mt-1.5">
                          <span className="text-muted-foreground">Bu plana eklenen</span>
                          <span className={`font-semibold ${sumBoxes > editableReady(s) ? 'text-red-500' : 'text-primary'}`} data-testid={`text-edit-assigned-${s.id}`}>
                            {sumBoxes} / {editableReady(s)} koli
                          </span>
                        </div>
                        {/* Multi-address split toggle — only when 2+ addresses */}
                        {hasMultipleAddresses && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer select-none mt-2" data-testid={`edit-label-split-${s.id}`}>
                            <input
                              type="checkbox"
                              checked={split}
                              onChange={() => toggleSplit(s)}
                              className="w-4 h-4 rounded border-muted-foreground/40 accent-primary"
                              data-testid={`edit-checkbox-split-${s.id}`}
                            />
                            <Split className="w-3.5 h-3.5 text-primary" />
                            <span className="font-medium">Birden fazla adrese teslim edilecek</span>
                          </label>
                        )}

                        {/* Single-address (default) */}
                        {!split && singleEntry && singleKey && (
                          <>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Input
                                type="text" inputMode="numeric"
                                value={String(singleEntry.boxCount)}
                                onChange={e => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const v = raw === '' ? 0 : parseInt(raw, 10);
                                  const cap = Math.max(0, editableReady(s));
                                  const clamped = Math.min(v, cap);
                                  if (v > cap) {
                                    toast({
                                      title: 'Hazır koliden fazla',
                                      description: `En fazla ${cap} koli girilebilir.`,
                                      variant: 'destructive',
                                    });
                                  }
                                  setEditItems(prev => setItemField(prev, singleKey, 'boxCount', clamped));
                                }}
                                onFocus={e => e.target.select()}
                                className="rounded-lg h-7 text-sm w-20" placeholder="0"
                                data-testid={`edit-item-boxes-${s.id}`}
                              />
                              <div className="flex rounded-lg overflow-hidden border text-xs">
                                {(['koli', 'palet16', 'palet20'] as LoadingType[]).map(lt => (
                                  <button key={lt}
                                    className={`px-2 py-1 transition-colors ${singleEntry.loadingType === lt ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                    onClick={() => setEditItems(prev => setItemField(prev, singleKey, 'loadingType', lt))}
                                    data-testid={`edit-item-lt-${lt}-${s.id}`}
                                  >
                                    {lt === 'koli' ? 'Koli' : lt === 'palet16' ? "16'lı" : "20'li"}
                                  </button>
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground" data-testid={`text-edit-loading-summary-${s.id}`}>= {formatLoadingSummary(singleEntry.boxCount, singleEntry.loadingType)}</span>
                            </div>

                            {hasMultipleAddresses && (
                              <div className="flex items-start gap-1.5 mt-2">
                                <MapPin className="w-3.5 h-3.5 text-primary mt-1.5 shrink-0" />
                                <div className="flex flex-col gap-1 flex-1">
                                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Teslimat Adresi</p>
                                  <div className="flex flex-col gap-1">
                                    {addresses.map((addr, ai) => {
                                      if (!addr.trim()) return null;
                                      const isSelected = (singleEntry.addressIndex ?? 0) === ai;
                                      return (
                                        <button key={ai} type="button"
                                          onClick={() => setEditItems(prev => setItemField(prev, singleKey, 'addressIndex', ai))}
                                          className={`text-left text-xs px-2.5 py-1.5 rounded-lg border transition-colors line-clamp-1 ${isSelected ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border/50 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground'}`}
                                          data-testid={`edit-addr-${s.id}-${ai}`}
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
                          <div className="mt-2 space-y-2">
                            {nonEmptyAddressIdx.map(ai => {
                              const found = shipmentItems.find(it => (it.entry.addressIndex ?? 0) === ai);
                              if (!found) return null;
                              const subEntry = found.entry;
                              const subKey = found.key;
                              const addrText = addresses[ai] ?? '';
                              return (
                                <div key={ai} className="rounded-xl border border-primary/20 bg-card p-2.5 space-y-1.5"
                                  data-testid={`edit-split-row-${s.id}-${ai}`}>
                                  <div className="flex items-start gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                    <p className="text-xs font-medium text-primary line-clamp-2 flex-1" data-testid={`edit-split-addr-${s.id}-${ai}`}>{addrText}</p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Input type="text" inputMode="numeric" value={String(subEntry.boxCount)}
                                      onChange={e => {
                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                        const v = raw === '' ? 0 : parseInt(raw, 10);
                                        const max = Math.max(0, editableReady(s));
                                        const othersSum = shipmentItems
                                          .filter(it => it.key !== subKey)
                                          .reduce((sum, it) => sum + it.entry.boxCount, 0);
                                        const available = Math.max(0, max - othersSum);
                                        const clamped = Math.min(v, available);
                                        if (v > available) {
                                          toast({ title: 'Hazır koliden fazla', description: `Bu adres için en fazla ${available} koli girilebilir.`, variant: 'destructive' });
                                        }
                                        setEditItems(prev => setItemField(prev, subKey, 'boxCount', clamped));
                                      }}
                                      onFocus={e => e.target.select()}
                                      className="rounded-lg h-7 text-sm w-20" placeholder="0"
                                      data-testid={`edit-split-boxes-${s.id}-${ai}`} />
                                    <div className="flex rounded-lg overflow-hidden border text-xs">
                                      {(['koli', 'palet16', 'palet20'] as LoadingType[]).map(lt => (
                                        <button key={lt}
                                          className={`px-2 py-1 transition-colors ${subEntry.loadingType === lt ? 'bg-primary text-white' : 'hover:bg-muted/50'}`}
                                          onClick={() => setEditItems(prev => setItemField(prev, subKey, 'loadingType', lt))}
                                          data-testid={`edit-split-lt-${lt}-${s.id}-${ai}`}
                                        >
                                          {lt === 'koli' ? 'Koli' : lt === 'palet16' ? "16'lı" : "20'li"}
                                        </button>
                                      ))}
                                    </div>
                                    <span className="text-xs text-muted-foreground" data-testid={`text-edit-split-loading-summary-${s.id}-${ai}`}>= {formatLoadingSummary(subEntry.boxCount, subEntry.loadingType)}</span>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between text-xs px-1 pt-1 border-t">
                              <span className="text-muted-foreground">Toplam</span>
                              <span className={`font-semibold ${sumBoxes > editableReady(s) ? 'text-red-500' : 'text-primary'}`} data-testid={`edit-split-total-${s.id}`}>
                                {sumBoxes} / {editableReady(s)} koli
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      <button className="p-1.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        onClick={() => toggleShipment(s)}
                        data-testid={`edit-remove-item-${s.id}`}
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add more shipments */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sipariş Ekle</p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input placeholder="Sipariş veya müşteri ara..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} className="pl-8 rounded-xl h-8 text-sm" data-testid="edit-item-search" />
              </div>
              {filteredAvailable.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 bg-muted/10 rounded-xl">
                  {itemSearch ? 'Eşleşen sipariş bulunamadı' : 'Eklenebilecek başka sipariş yok'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {filteredAvailable.map(s => {
                    const r = s.record;
                    return (
                      <button key={s.id}
                        className="w-full rounded-xl border border-border/50 p-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-2"
                        onClick={() => toggleShipment(s)}
                        data-testid={`edit-add-item-${s.id}`}
                      >
                        <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{r.title}</p>
                          <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                            {r.customer && <span>{r.customer}</span>}
                            <span>
                              <span className="font-semibold text-primary">{s.readyBoxes ?? 0}</span>
                              {' / '}
                              <span>{s.totalPlannedBoxes ?? 0}</span>
                              {' koli hazır'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
        {(detailFetchError || photoHydrationFailed) && (
          <div className="px-6 py-2 text-xs text-destructive text-center">
            Fotoğraf verileri yüklenemedi. Kaydetmek için diyaloğu kapatıp tekrar açın.
          </div>
        )}
        <DialogFooter className="px-6 pb-6 pt-4 border-t flex gap-2 shrink-0">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>İptal</Button>
          <Button
            className="flex-1 rounded-xl"
            disabled={saveMutation.isPending || Object.keys(editItems).length === 0 || !detailLoaded || pendingPhotoFetches > 0 || photoHydrationFailed}
            onClick={() => saveMutation.mutate()}
            data-testid="button-save-plan-edit"
          >
            {saveMutation.isPending
              ? 'Kaydediliyor...'
              : !detailLoaded || pendingPhotoFetches > 0
                ? 'Yükleniyor...'
                : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Depart Dialog (with required photo) ────────────────────────────────── */
function DepartDialog({ planId, open, onClose, onConfirm, isPending }: {
  planId: number | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (photo: string) => void;
  isPending: boolean;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setPhoto(null);
  }, [open]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const url = e.target?.result as string;
      if (url) setPhoto(url);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-green-600" />
            Araç Çıkışı — Fotoğraf Zorunlu
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Araç çıkışı için yükleme fotoğrafı çekin. Bu işlem geri alınamaz.
          </p>

          {!photo ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 p-5 transition-colors"
                onClick={() => cameraRef.current?.click()}
                data-testid="button-depart-camera"
              >
                <Camera className="w-7 h-7 text-primary" />
                <span className="text-sm font-medium text-primary">Kamera</span>
              </button>
              <button
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 p-5 transition-colors"
                onClick={() => galleryRef.current?.click()}
                data-testid="button-depart-gallery"
              >
                <Image className="w-7 h-7 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Galeri</span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden aspect-video bg-muted">
              <img src={photo} alt="Çıkış fotoğrafı" className="w-full h-full object-cover" />
              <button
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-destructive transition-colors"
                onClick={() => setPhoto(null)}
                data-testid="button-remove-depart-photo"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileInput} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />

          {!photo && (
            <p className="text-xs text-red-500 text-center">Devam etmek için fotoğraf ekleyin</p>
          )}
        </div>

        <DialogFooter className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>İptal</Button>
          <Button
            className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white"
            disabled={!photo || isPending}
            onClick={() => photo && onConfirm(photo)}
            data-testid="button-confirm-depart"
          >
            {isPending ? 'Kaydediliyor...' : 'Çıkış Yaptı'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── PlanCard ────────────────────────────────────────────────────────────── */
function PlanCard({ plan, onDepart, canEdit, onDelete, expanded, onToggle }: { plan: PlanFull; onDepart?: (id: number) => void; canEdit?: boolean; onDelete?: (id: number) => void; expanded: boolean; onToggle: () => void }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyValue, setCompanyValue] = useState(plan.shippingCompany ?? '');
  const [editOpen, setEditOpen] = useState(false);
  const companyInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const vt = VEHICLE_TYPES[plan.vehicleType as keyof typeof VEHICLE_TYPES];
  const isActive = plan.status === 'active';
  const vehicleEmoji = plan.vehicleType === 'tir' ? '🚛' : plan.vehicleType === 'on_teker' ? '🚚' : '🚜';

  const { data: detailData, isLoading: detailLoading, isError: detailError } = useQuery<PlanFull>({
    queryKey: ['/api/shipment-plans', plan.id],
    enabled: expanded,
    retry: 2,
  });

  const detailItems = detailData?.items ?? plan.items;

  const allPhotos: Array<{ id: string | number; thumbUrl: string; fullUrl: string; label?: string }> = [];
  if (detailData) {
    if (detailData.hasDriverPhoto) {
      allPhotos.push({
        id: 'driver',
        thumbUrl: `/api/photo/shipment_plans/${plan.id}/driverPhoto?thumb=1`,
        fullUrl: `/api/photo/shipment_plans/${plan.id}/driverPhoto`,
        label: 'Sürücü',
      });
    }
    if (detailData.hasCargoLabelPhoto) {
      allPhotos.push({
        id: 'cargo',
        thumbUrl: `/api/photo/shipment_plans/${plan.id}/cargoLabelPhoto?thumb=1`,
        fullUrl: `/api/photo/shipment_plans/${plan.id}/cargoLabelPhoto`,
        label: 'Kargo Etiketi',
      });
    }
    for (const addr of detailData.addresses) {
      if (addr.hasIrsaliyePhoto) {
        allPhotos.push({
          id: `irsaliye-addr-${addr.id}`,
          thumbUrl: `/api/photo/shipment_plan_addresses/${addr.id}/irsaliyePhoto?thumb=1`,
          fullUrl: `/api/photo/shipment_plan_addresses/${addr.id}/irsaliyePhoto`,
          label: `İrsaliye — ${addr.address.substring(0, 30)}`,
        });
      }
    }
    for (const photo of (detailData.photos ?? [])) {
      if (photo.hasPhoto) {
        allPhotos.push({
          id: photo.id,
          thumbUrl: `/api/photo/shipment_plan_photos/${photo.id}/photoUrl?thumb=1`,
          fullUrl: `/api/photo/shipment_plan_photos/${photo.id}/photoUrl`,
        });
      }
    }
  }

  useEffect(() => { if (editingCompany) companyInputRef.current?.focus(); }, [editingCompany]);

  const updateCompany = useMutation({
    mutationFn: (company: string | null) =>
      apiRequest('PATCH', `/api/shipment-plans/${plan.id}`, { shippingCompany: company }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/shipment-plans'] });
      setEditingCompany(false);
      toast({ title: 'Firma adı güncellendi' });
    },
  });

  // boxCount is the koli total for every loadingType — sum directly.
  const totalKoli = plan.items.reduce((s, i) => s + (i.boxCount ?? 0), 0);

  return (
    <>
      {canEdit && isActive && (
        <EditPlanDialog plan={plan} open={editOpen} onClose={() => setEditOpen(false)} />
      )}

      <div
        className={`rounded-2xl border-2 overflow-hidden transition-all ${isActive ? 'border-primary/30 bg-card' : 'border-border/30 bg-muted/10'}`}
        data-testid={`card-plan-${plan.id}`}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl mt-0.5">{vehicleEmoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {editingCompany ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Input
                      ref={companyInputRef}
                      value={companyValue}
                      onChange={e => setCompanyValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updateCompany.mutate(companyValue.trim() || null);
                        if (e.key === 'Escape') { setEditingCompany(false); setCompanyValue(plan.shippingCompany ?? ''); }
                      }}
                      placeholder="Firma adı..."
                      className="h-7 text-sm rounded-lg w-36"
                      data-testid={`input-company-${plan.id}`}
                    />
                    <button
                      onClick={() => updateCompany.mutate(companyValue.trim() || null)}
                      className="p-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                      data-testid={`button-save-company-${plan.id}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setEditingCompany(false); setCompanyValue(plan.shippingCompany ?? ''); }}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-1.5"
                    onClick={e => { e.stopPropagation(); setEditingCompany(true); }}
                    data-testid={`button-edit-company-${plan.id}`}
                  >
                    <span className="font-bold text-base">
                      {plan.shippingCompany
                        ? <>{plan.shippingCompany} <span className="text-muted-foreground font-normal">·</span> {vt?.label ?? plan.vehicleType}</>
                        : <span className="flex items-center gap-1.5">{vt?.label ?? plan.vehicleType} <span className="text-xs font-normal text-primary/60 border border-primary/30 rounded-md px-1.5 py-0.5">+ Firma</span></span>
                      }
                    </span>
                    <Pencil className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                  </button>
                )}
                {isActive ? (
                  <Badge className="rounded-full text-xs bg-amber-500/15 text-amber-600 border-amber-500/30">
                    <Clock className="w-3 h-3 mr-1" />Bekliyor
                  </Badge>
                ) : (
                  <Badge className="rounded-full text-xs bg-green-500/15 text-green-600 border-green-500/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" />Çıkış Yapıldı
                  </Badge>
                )}
                {canEdit && isActive && (
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <button
                      className="p-1.5 rounded-xl hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
                      onClick={e => { e.stopPropagation(); setEditOpen(true); }}
                      data-testid={`button-edit-plan-${plan.id}`}
                      title="Planı Düzenle"
                    >
                      <FileEdit className="w-4 h-4" />
                    </button>
                    {onDelete && (
                      <button
                        className="p-1.5 rounded-xl hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                        onClick={e => { e.stopPropagation(); onDelete(plan.id); }}
                        data-testid={`button-delete-plan-${plan.id}`}
                        title="Planı Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Çıkış: {fmtDate(plan.plannedDepartureDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />{totalKoli} koli · {plan.items.length} sipariş
                </span>
              </div>
              {plan.addresses.length > 0 && (
                <div className="mt-1.5 flex items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-primary/60" />
                  <span className="line-clamp-1">{plan.addresses.map(a => a.address).join(' · ')}</span>
                </div>
              )}
            </div>
            <button
              className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors shrink-0 mt-0.5"
              onClick={onToggle}
              data-testid={`button-expand-plan-${plan.id}`}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t space-y-2">
                  {detailItems.map(item => {
                    const r = item.shipment.record;
                    return (
                      <div key={item.id} className="flex items-center gap-2 text-sm bg-muted/20 rounded-xl p-2.5">
                        <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="flex-1 min-w-0 font-medium line-clamp-1">{r.title}</span>
                        {r.customer && <span className="text-xs text-muted-foreground hidden sm:inline">{r.customer}</span>}
                        <Badge variant="secondary" className="rounded-lg text-xs shrink-0" data-testid={`badge-detail-loading-${item.id}`}>
                          {formatLoadingSummary(item.boxCount, item.loadingType)}
                        </Badge>
                      </div>
                    );
                  })}
                  {plan.addresses.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Adresler</p>
                      {plan.addresses.map((a) => (
                        <div key={a.id} className="flex items-start gap-1.5 text-xs text-muted-foreground mb-1">
                          <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-primary/60" />
                          <span>{a.address}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Fotoğraflar yükleniyor...
                    </div>
                  ) : detailError ? (
                    <div className="flex items-center justify-center py-3 gap-2 text-sm text-destructive">
                      Detaylar yüklenemedi
                    </div>
                  ) : allPhotos.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Fotoğraflar ({allPhotos.length})
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {allPhotos.map((photo, idx) => (
                          <button
                            key={photo.id}
                            onClick={() => setLightboxIdx(idx)}
                            className="relative rounded-xl overflow-hidden aspect-square bg-muted block group"
                            data-testid={`plan-photo-${idx}`}
                          >
                            <LazyImage
                              src={photo.thumbUrl}
                              alt={photo.label || `Fotoğraf ${idx + 1}`}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                              containerClassName="absolute inset-0"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                            {photo.label && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-0.5 px-1 text-center truncate">
                                {photo.label}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Lightbox */}
                  {lightboxIdx !== null && allPhotos.length > 0 && (
                    <div
                      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                      onClick={() => setLightboxIdx(null)}
                    >
                      <button
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
                        onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
                      >
                        <XIcon className="w-5 h-5" />
                      </button>
                      {allPhotos.length > 1 && (
                        <button
                          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
                          onClick={(e) => { e.stopPropagation(); setLightboxIdx(i => i !== null ? (i - 1 + allPhotos.length) % allPhotos.length : 0); }}
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                      )}
                      <div className="flex flex-col items-center gap-2 max-h-[90vh] max-w-[90vw]">
                        <img
                          src={allPhotos[lightboxIdx].fullUrl}
                          alt={allPhotos[lightboxIdx].label || `Fotoğraf ${lightboxIdx + 1}`}
                          className="max-h-[80vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {allPhotos[lightboxIdx].label && (
                          <span className="text-white text-sm bg-black/50 px-3 py-1 rounded-full">{allPhotos[lightboxIdx].label}</span>
                        )}
                      </div>
                      {allPhotos.length > 1 && (
                        <button
                          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
                          onClick={(e) => { e.stopPropagation(); setLightboxIdx(i => i !== null ? (i + 1) % allPhotos.length : 0); }}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      )}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {allPhotos.map((_, i) => (
                          <button
                            key={i}
                            className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIdx ? 'bg-white' : 'bg-white/40'}`}
                            onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {plan.notes && (
                    <div className="bg-muted/30 rounded-xl p-2.5 text-xs text-muted-foreground">
                      {plan.notes}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                    {plan.createdByUser && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />Oluşturan: {plan.createdByUser}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmt(plan.createdAt, true)}
                    </span>
                    {!isActive && plan.departedAt && (
                      <span className="flex items-center gap-1 text-green-600">
                        <LogOut className="w-3 h-3" />
                        {plan.departedByUser ?? 'Bilinmiyor'} — {fmt(plan.departedAt, true)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isActive && onDepart && (
          <div className="border-t px-4 py-3">
            <Button
              size="sm"
              className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onDepart(plan.id)}
              data-testid={`button-depart-plan-${plan.id}`}
            >
              <LogOut className="w-4 h-4" />
              Araç Çıkış Yaptı
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function ShipmentPlansPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [departPlanId, setDepartPlanId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);
  const expandedPlanIdRef = useRef<number | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTogglePlan = useCallback((planId: number) => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    const prev = expandedPlanIdRef.current;
    if (prev === planId) {
      expandedPlanIdRef.current = null;
      setExpandedPlanId(null);
      cleanupTimerRef.current = setTimeout(() => {
        qc.removeQueries({ queryKey: ['/api/shipment-plans', planId] });
        cleanupTimerRef.current = null;
      }, 500);
    } else {
      if (prev !== null) {
        qc.removeQueries({ queryKey: ['/api/shipment-plans', prev] });
      }
      expandedPlanIdRef.current = planId;
      setExpandedPlanId(planId);
    }
  }, [qc]);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  const isManager = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';

  const { data: plans = [], isLoading } = useQuery<PlanFull[]>({
    queryKey: ['/api/shipment-plans'],
    queryFn: () => fetch('/api/shipment-plans', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const activePlans = Array.isArray(plans) ? plans.filter(p => p.status === 'active') : [];
  const departedPlans = Array.isArray(plans) ? plans.filter(p => p.status === 'departed') : [];

  const departPlan = useMutation({
    mutationFn: ({ id, departurePhotoUrl }: { id: number; departurePhotoUrl: string }) =>
      apiRequest('POST', `/api/shipment-plans/${id}/depart`, { departurePhotoUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/shipment-plans'] });
      qc.invalidateQueries({ queryKey: ['/api/shipments'] });
      toast({ title: 'Araç çıkış kaydedildi' });
      setDepartPlanId(null);
    },
    onError: () => toast({ title: 'Çıkış kaydedilemedi', variant: 'destructive' }),
  });

  const deletePlan = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/shipment-plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/shipment-plans'] });
      qc.invalidateQueries({ queryKey: ['/api/shipments'] });
      toast({ title: 'Plan silindi' });
      setDeletePlanId(null);
    },
    onError: () => toast({ title: 'Plan silinemedi', variant: 'destructive' }),
  });

  return (
    <>
    {/* Delete Confirm Dialog */}
    <Dialog open={deletePlanId !== null} onOpenChange={open => { if (!open) setDeletePlanId(null); }}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" /> Planı Sil
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Bu sevkiyat planı ve tüm verileri kalıcı olarak silinecek. Emin misiniz?</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setDeletePlanId(null)} data-testid="button-delete-cancel">İptal</Button>
          <Button variant="destructive" className="rounded-xl gap-2" onClick={() => deletePlanId !== null && deletePlan.mutate(deletePlanId)} disabled={deletePlan.isPending} data-testid="button-delete-confirm">
            {deletePlan.isPending ? 'Siliniyor...' : <><Trash2 className="w-4 h-4" /> Sil</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div className="flex flex-col h-full bg-background">
      <div className="px-4 sm:px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">Sevkiyat Planları</h1>
            <p className="text-xs text-muted-foreground">{activePlans.length} aktif · {departedPlans.length} geçmiş</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />)}
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Aktif Planlar</h2>
                <Badge variant="secondary" className="rounded-full text-xs">{activePlans.length}</Badge>
              </div>
              {activePlans.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground opacity-60">
                  <Truck className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">Aktif sevkiyat planı yok</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activePlans.map(plan => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onDepart={id => setDepartPlanId(id)}
                      canEdit={isManager}
                      onDelete={isManager ? id => setDeletePlanId(id) : undefined}
                      expanded={expandedPlanId === plan.id}
                      onToggle={() => handleTogglePlan(plan.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {departedPlans.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-2 mb-3 w-full group"
                  onClick={() => setHistoryOpen(v => !v)}
                  data-testid="button-toggle-plan-history"
                >
                  <History className="w-4 h-4 text-green-500" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                    Geçmiş Sevkiyatlar
                  </h2>
                  <Badge className="rounded-full text-xs bg-green-500/15 text-green-600 border-green-500/30">{departedPlans.length}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{historyOpen ? '▲' : '▼'}</span>
                </button>
                {historyOpen && (
                  <div className="space-y-3">
                    {departedPlans.map(plan => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        expanded={expandedPlanId === plan.id}
                        onToggle={() => handleTogglePlan(plan.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <DepartDialog
        planId={departPlanId}
        open={departPlanId !== null}
        onClose={() => setDepartPlanId(null)}
        onConfirm={(photo) => departPlanId !== null && departPlan.mutate({ id: departPlanId, departurePhotoUrl: photo })}
        isPending={departPlan.isPending}
      />
    </div>
    </>
  );
}
