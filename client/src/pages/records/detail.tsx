import { useParams, Link, useLocation } from 'wouter';
import { useRecord, useDeleteRecord } from '@/hooks/use-records';
import { useOrderItems } from '@/hooks/use-order-items';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { OrderItemsSection } from '@/components/order-items-section';
import { ArrowLeft, Edit, Trash2, Image as ImageIcon, Box, Calendar, User as UserIcon, AlertTriangle, Tag, ZoomIn, Plus, X, GalleryThumbnails, Activity, Truck, MapPin, Package, Clock, CheckCircle2, FlaskConical, History, ChevronDown, ChevronUp, Copy, ExternalLink, Warehouse, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { RecordPhoto, Shipment, ShipmentPlan, Sample, ReceteItem } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { VEHICLE_TYPES } from '@shared/schema';
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
} from "@/components/ui/alert-dialog";

function PhaseAlbumCard({
  label,
  target,
  unit,
  items,
  itemPhotoKey,
  recordPhoto,
}: {
  label: string;
  target: number;
  unit?: string;
  items: import('@shared/schema').OrderItem[];
  itemPhotoKey: 'pastalPhotoUrl' | 'urunIslemPhotoUrl' | 'katlamaPhotoUrl';
  recordPhoto?: string | null;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const itemsWithPhoto = items.filter(it => it[itemPhotoKey]);
  const totalItems = items.length;
  const coveredItems = itemsWithPhoto.length;

  if (totalItems === 0) {
    return (
      <Card className="glass-card border-none shadow-md rounded-2xl overflow-hidden">
        <div className="p-4 bg-muted/30 border-b flex justify-between items-center">
          <span className="font-semibold">{label}</span>
          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Hedef: {target} {unit || 'adet'}</span>
        </div>
        {recordPhoto ? (
          <img src={recordPhoto} className="w-full h-48 object-cover cursor-zoom-in" onClick={() => setLightboxSrc(recordPhoto)} />
        ) : (
          <div className="w-full h-48 flex items-center justify-center text-muted-foreground opacity-30 bg-muted/10">
            <ImageIcon className="w-10 h-10" />
          </div>
        )}
        {lightboxSrc && (
          <Dialog open onOpenChange={() => setLightboxSrc(null)}>
            <DialogContent className="max-w-4xl p-2 bg-black/90 border-none rounded-2xl">
              <img src={lightboxSrc} className="w-full max-h-[85vh] object-contain rounded-xl" />
            </DialogContent>
          </Dialog>
        )}
      </Card>
    );
  }

  return (
    <Card className="glass-card border-none shadow-md rounded-2xl overflow-hidden">
      <div className="p-4 bg-muted/30 border-b flex justify-between items-center">
        <span className="font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{coveredItems}/{totalItems} içerik</span>
          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Hedef: {target} {unit || 'adet'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {items.map(item => {
          const src = item[itemPhotoKey];
          return (
            <div key={item.id} className="group rounded-xl overflow-hidden bg-muted/20">
              {src ? (
                <img
                  src={src}
                  alt={item.name}
                  className="w-full h-32 object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-200"
                  onClick={() => setLightboxSrc(src)}
                  data-testid={`img-phase-item-${item.id}`}
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center text-muted-foreground opacity-25 bg-muted/10">
                  <ImageIcon className="w-8 h-8" />
                </div>
              )}
              <p className="px-2 py-1.5 text-xs font-medium truncate border-t bg-card/60">{item.name}</p>
            </div>
          );
        })}
      </div>
      {lightboxSrc && (
        <Dialog open onOpenChange={() => setLightboxSrc(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/90 border-none rounded-2xl">
            <img src={lightboxSrc} className="w-full max-h-[85vh] object-contain rounded-xl" />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = h * MAX / w; w = MAX; }
        if (h > MAX) { w = w * MAX / h; h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function ShipmentInfoSection({ recordId }: { recordId: number }) {
  const { data: allShipments = [] } = useQuery<Array<Shipment & { record: any }>>({
    queryKey: ['/api/shipments'],
    queryFn: () => fetch('/api/shipments', { credentials: 'include' }).then(r => r.json()),
  });
  const shipment = Array.isArray(allShipments) ? allShipments.find(s => s.record?.id === recordId) : null;

  const { data: plans = [] } = useQuery<ShipmentPlan[]>({
    queryKey: ['/api/shipments', shipment?.id, 'plans'],
    queryFn: () => fetch(`/api/shipments/${shipment!.id}/plans`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!shipment?.id,
  });

  if (!shipment) return null;

  const totalBoxes = Math.ceil((shipment as any).record?.totalQuantity / ((shipment as any).record?.itemsPerBox || 1));
  const pendingBoxes = shipment.pendingBoxes ?? totalBoxes;
  const isFullyLoaded = pendingBoxes === 0;
  const shippedBoxes = totalBoxes - pendingBoxes;

  return (
    <Card className="glass-card border-none shadow-md rounded-2xl overflow-hidden">
      <div className="p-4 bg-muted/30 border-b flex items-center gap-2">
        <Truck className="w-4 h-4 text-primary" />
        <span className="font-semibold">Sevkiyat Bilgisi</span>
        {isFullyLoaded ? (
          <Badge className="rounded-full text-xs bg-green-500/15 text-green-600 border-green-500/30 ml-auto">
            <CheckCircle2 className="w-3 h-3 mr-1" />Tamamlandı
          </Badge>
        ) : shippedBoxes > 0 ? (
          <Badge variant="secondary" className="rounded-full text-xs ml-auto">
            <Clock className="w-3 h-3 mr-1" />Kısmi ({shippedBoxes}/{totalBoxes} koli)
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-full text-xs ml-auto">Bekliyor</Badge>
        )}
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Toplam Koli</p>
            <p className="font-bold text-base">{totalBoxes}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Yüklenen</p>
            <p className="font-bold text-base text-green-600">{shippedBoxes}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bekleyen</p>
            <p className={`font-bold text-base ${pendingBoxes > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{pendingBoxes}</p>
          </div>
        </div>
        {plans.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sevkiyat Planları</p>
            <div className="space-y-2">
              {plans.map(plan => {
                const vt = VEHICLE_TYPES[plan.vehicleType as keyof typeof VEHICLE_TYPES];
                const vehicleEmoji = plan.vehicleType === 'tir' ? '🚛' : plan.vehicleType === 'on_teker' ? '🚚' : '🚜';
                return (
                  <div key={plan.id} className="flex items-center gap-2 text-sm bg-muted/20 rounded-xl p-2.5">
                    <span className="text-base">{vehicleEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{vt?.label ?? plan.vehicleType}</span>
                      {plan.plannedDepartureDate && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(plan.plannedDepartureDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <Badge className={`rounded-full text-xs shrink-0 ${plan.status === 'departed' ? 'bg-green-500/15 text-green-600 border-green-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}`}>
                      {plan.status === 'departed' ? 'Çıkış Yapıldı' : 'Aktif'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhotoAlbum({ recordId }: { recordId: number }) {
  const { user } = useAuth();
  const canManagePhotos = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';
  const { toast } = useToast();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [lightbox, setLightbox] = useState<RecordPhoto | null>(null);

  const { data: photos = [], isLoading } = useQuery<RecordPhoto[]>({
    queryKey: ['/api/records', recordId, 'photos'],
    queryFn: () => fetch(`/api/records/${recordId}/photos`, { credentials: 'include' }).then(r => r.json()),
  });

  const addPhoto = useMutation({
    mutationFn: (body: { photoUrl: string; caption: string }) =>
      apiRequest('POST', `/api/records/${recordId}/photos`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/records', recordId, 'photos'] });
      setAddOpen(false);
      setPreviewSrc(null);
      setCaption('');
      toast({ title: 'Fotoğraf eklendi' });
    },
    onError: () => {
      toast({ title: 'Fotoğraf kaydedilemedi', description: 'Lütfen tekrar deneyin.', variant: 'destructive' });
    },
  });

  const deletePhoto = useMutation({
    mutationFn: (photoId: number) =>
      apiRequest('DELETE', `/api/records/${recordId}/photos/${photoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/records', recordId, 'photos'] });
      toast({ title: 'Fotoğraf silindi' });
    },
  });

  const handleFile = async (file: File) => {
    const b64 = await compressImage(file);
    setPreviewSrc(b64);
  };

  const clearPreview = () => {
    setPreviewSrc(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  };

  return (
    <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
      <div className="p-6 bg-muted/20 border-b flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <GalleryThumbnails className="w-5 h-5 text-primary" />
          Fotoğraf Albümü
          <span className="text-sm font-normal text-muted-foreground">({photos.length})</span>
        </h3>
        <Button
          size="sm"
          className="rounded-xl gap-2"
          onClick={() => setAddOpen(true)}
          data-testid="button-add-album-photo"
        >
          <Plus className="w-4 h-4" /> Fotoğraf Ekle
        </Button>
      </div>

      <CardContent className="p-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-6">Yükleniyor...</div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3 opacity-60">
            <GalleryThumbnails className="w-12 h-12" />
            <p className="text-sm">Henüz fotoğraf eklenmemiş.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {photos.map(p => (
              <div key={p.id} className="group relative rounded-2xl overflow-hidden bg-muted/20 shadow-md">
                <img
                  src={p.photoUrl}
                  alt={p.caption || ''}
                  className="w-full h-40 object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-300"
                  onClick={() => setLightbox(p)}
                  data-testid={`img-album-${p.id}`}
                />
                {p.caption && (
                  <div className="px-3 py-2 text-xs text-muted-foreground truncate border-t bg-card/80">{p.caption}</div>
                )}
                {canManagePhotos && (
                  <button
                    className="absolute top-2 right-2 bg-black/60 hover:bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deletePhoto.mutate(p.id)}
                    data-testid={`button-delete-photo-${p.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) clearPreview(); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Fotoğraf Ekle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Hidden inputs: one for camera, one for gallery */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async e => { if (e.target.files?.[0]) await handleFile(e.target.files[0]); }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => { if (e.target.files?.[0]) await handleFile(e.target.files[0]); }}
            />

            {previewSrc ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={previewSrc} className="w-full h-48 object-cover" />
                <button
                  className="absolute top-2 right-2 bg-black/60 hover:bg-destructive text-white rounded-full p-1"
                  onClick={clearPreview}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="h-28 border-2 border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/30 transition-colors"
                  onClick={() => cameraRef.current?.click()}
                  data-testid="button-take-photo"
                >
                  <ImageIcon className="w-7 h-7 opacity-50" />
                  <span className="text-xs font-medium">Fotoğraf Çek</span>
                </button>
                <button
                  className="h-28 border-2 border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/30 transition-colors"
                  onClick={() => galleryRef.current?.click()}
                  data-testid="button-upload-photo"
                >
                  <GalleryThumbnails className="w-7 h-7 opacity-50" />
                  <span className="text-xs font-medium">Galeriden Seç</span>
                </button>
              </div>
            )}

            <Input
              placeholder="Açıklama (isteğe bağlı)"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="rounded-xl"
              data-testid="input-photo-caption"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setAddOpen(false)}>İptal</Button>
              <Button
                className="flex-1 rounded-xl"
                disabled={!previewSrc || addPhoto.isPending}
                onClick={() => previewSrc && addPhoto.mutate({ photoUrl: previewSrc, caption })}
                data-testid="button-save-album-photo"
              >
                {addPhoto.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/90 border-none rounded-2xl">
            <img src={lightbox.photoUrl} alt={lightbox.caption || ''} className="w-full max-h-[85vh] object-contain rounded-xl" />
            {lightbox.caption && (
              <p className="text-center text-white/70 text-sm py-2">{lightbox.caption}</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

interface PhaseSummaryPhase {
  key: string;
  label: string;
  target: number;
  unit: string;
  completed: number;
  pct: number;
  lastLog: { username: string; quantity: number } | null;
}

const PHASE_ICONS: Record<string, string> = {
  pastal: '✂️',
  urun_islem: '🔧',
  katlama: '📐',
  set_toplama: '📦',
  kolileme: '🗃️',
  sevkiyat: '🚚',
};

function PhaseProgressSection({ recordId }: { recordId: number }) {
  const { data, isLoading } = useQuery<{ phases: PhaseSummaryPhase[]; totalPct: number }>({
    queryKey: ['/api/records', recordId, 'phase-summary'],
    queryFn: () => fetch(`/api/records/${recordId}/phase-summary`, { credentials: 'include' }).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
        <div className="p-5 border-b bg-muted/20">
          <div className="h-5 bg-muted/50 rounded w-40 animate-pulse" />
        </div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex gap-2">
                <div className="h-4 bg-muted/40 rounded w-24 animate-pulse" />
                <div className="ml-auto h-4 bg-muted/40 rounded w-10 animate-pulse" />
              </div>
              <div className="h-2 bg-muted/30 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const allDone = data.totalPct >= 100;

  return (
    <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
      <div className="p-5 bg-muted/20 border-b flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Üretim Fazları
        </h3>
        <span className={cn(
          "text-sm font-bold px-3 py-1 rounded-full",
          allDone
            ? "bg-green-500/10 text-green-600 dark:text-green-400"
            : "bg-primary/10 text-primary"
        )}>
          {data.totalPct}% tamamlandı
        </span>
      </div>
      <div className="p-4 space-y-3.5">
        {data.phases.map(phase => {
          const isDone = phase.pct >= 100;
          return (
            <div key={phase.key} className={cn(
              "rounded-xl px-3 py-2.5 transition-colors",
              isDone ? "bg-green-500/5 border border-green-500/20" : "bg-muted/10 border border-transparent"
            )}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm shrink-0" aria-hidden>{PHASE_ICONS[phase.key] || '▸'}</span>
                <span className="flex-1 text-sm font-medium">{phase.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {phase.completed}/{phase.target} {phase.unit}
                </span>
                <span className={cn(
                  "text-xs font-bold shrink-0 min-w-[36px] text-right",
                  isDone ? "text-green-500" : "text-muted-foreground"
                )}>
                  {phase.pct}%{isDone && ' ✓'}
                </span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    isDone ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${phase.pct}%` }}
                />
              </div>
              {phase.lastLog && !isDone && (
                <p className="text-[10px] text-muted-foreground mt-1 opacity-70">
                  Son: {phase.lastLog.username} +{phase.lastLog.quantity} {phase.unit}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function RecordDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: record, isLoading } = useRecord(Number(id));
  const { data: orderItems = [] } = useOrderItems(Number(id));
  const deleteMutation = useDeleteRecord();
  const [photoOpen, setPhotoOpen] = useState(false);

  const { data: linkedSample } = useQuery<Sample>({
    queryKey: ['/api/samples', record?.sampleId ?? 0],
    queryFn: () => fetch(`/api/samples/${record!.sampleId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!record?.sampleId,
  });

  type EditLog = { id: number; recordId: number; editedBy: number; editedAt: string; note: string | null; editorName: string };
  const { data: editLogs = [] } = useQuery<EditLog[]>({
    queryKey: ['/api/records', Number(id), 'edit-history'],
    queryFn: () => fetch(`/api/records/${id}/edit-history`, { credentials: 'include' }).then(r => r.json()),
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  const { data: receteItems = [] } = useQuery<ReceteItem[]>({
    queryKey: ['/api/recete', Number(id)],
    queryFn: () => fetch(`/api/recete/${id}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });

  type StokAtama = { id: number; stokItemId: number; stokAdi: string; lot: string | null; birim: string; rezerveMiktar: number; kaynak: string; tasindi: boolean; tasindiMiktar: number | null; receteItemId: number | null };
  const { data: stokAtamalar = [] } = useQuery<StokAtama[]>({
    queryKey: ['/api/records', Number(id), 'stok-atamalar'],
    queryFn: () => fetch(`/api/records/${id}/stok-atamalar`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });

  const queryClient = useQueryClient();
  const cloneMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/records/${id}/clone`),
    onSuccess: async (res: any) => {
      const newRecord = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/records'] });
      setLocation(`/records/${newRecord.id}/edit`);
    },
    onError: () => toast({ title: 'Hata', description: 'Sipariş kopyalanamadı', variant: 'destructive' }),
  });

  const { data: sourceRecord } = useQuery({
    queryKey: ['/api/records', record?.clonedFromId],
    queryFn: () => fetch(`/api/records/${record!.clonedFromId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!record?.clonedFromId,
  });

  const transferToStokMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/records/${id}/transfer-to-stock`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['/api/records', Number(id)] });
      queryClient.invalidateQueries({ queryKey: ['/api/stok'] });
      toast({ title: 'Stoka Transfer Edildi', description: 'Ürünler stok modülüne eklendi.' });
    },
    onError: (err: any) => toast({ title: 'Hata', description: err?.message || 'Transfer başarısız', variant: 'destructive' }),
  });

  if (isLoading) return <div className="p-8 text-center">Yükleniyor...</div>;
  if (!record) return <div className="p-8 text-center">Kayıt bulunamadı</div>;

  const canEdit = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan' || user?.id === record.createdBy;
  const boxesNeeded = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(record.id);
      setLocation('/records');
    } catch (error) {}
  };

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-display font-bold">{record.title}</h1>
              <StatusBadge status={record.status} />
              {(record as any).orderType === 'stok' && (
                <Badge className="rounded-full text-xs bg-emerald-500/15 text-emerald-700 border-emerald-400/40" data-testid="badge-order-type-stok">
                  Stok Üretimi
                </Badge>
              )}
              {record.priority === 'acil' && (
                <span className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" /> ACİL
                </span>
              )}
            </div>
            <p className="text-muted-foreground font-mono mt-1 text-sm">EMİR-#{record.id.toString().padStart(6, '0')}</p>
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              className="rounded-xl border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400"
              onClick={() => cloneMutation.mutate()}
              disabled={cloneMutation.isPending}
              data-testid="button-clone-order"
            >
              <Copy className="w-4 h-4 mr-2" />
              {cloneMutation.isPending ? 'Kopyalanıyor...' : 'Tekrarla'}
            </Button>
            <Link href={`/records/${record.id}/edit`}>
              <Button variant="outline" className="rounded-xl border-primary/20 text-primary">
                <Edit className="w-4 h-4 mr-2" />Düzenle
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="rounded-xl"><Trash2 className="w-4 h-4 mr-2" />Sil</Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Emin misiniz?</AlertDialogTitle>
                  <AlertDialogDescription>Bu işlem geri alınamaz. Sipariş kalıcı olarak silinecektir.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">İptal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive rounded-xl">Sil</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Hero Photo */}
      {record.photoUrl && (
        <>
          <Card
            className="glass-card border-none shadow-xl rounded-3xl overflow-hidden cursor-zoom-in group"
            onClick={() => setPhotoOpen(true)}
            data-testid="card-order-photo"
          >
            <div className="relative">
              <img
                src={record.photoUrl}
                alt={record.title}
                className="w-full max-h-[480px] object-contain bg-muted/20 group-hover:opacity-95 transition-opacity"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black/40 rounded-full p-3">
                  <ZoomIn className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                <ZoomIn className="w-3 h-3" /> Büyütmek için tıkla
              </div>
            </div>
          </Card>

          <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
            <DialogContent className="max-w-5xl p-2 bg-black/90 border-none rounded-2xl" data-testid="dialog-photo-fullscreen">
              <img
                src={record.photoUrl}
                alt={record.title}
                className="w-full max-h-[90vh] object-contain rounded-xl"
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Kaynak Sipariş Bilgisi */}
      {record.clonedFromId && sourceRecord && (
        <Card className="glass-card border-none shadow-md rounded-2xl p-5 border-l-4 border-violet-400 bg-violet-50/50 dark:bg-violet-950/20" data-testid="card-kaynak-siparis">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="bg-violet-100 dark:bg-violet-900/40 p-2 rounded-lg text-violet-600 dark:text-violet-400">
                <History className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-violet-500 dark:text-violet-400 font-bold">Geçmiş Sipariş</p>
                <p className="font-semibold text-sm">{(sourceRecord as any).title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lot: <span className="font-mono">{(sourceRecord as any).lotNumber || '—'}</span>
                  {' · '}EMİR-#{String((sourceRecord as any).id).padStart(6, '0')}
                </p>
              </div>
            </div>
            <Link href={`/records/${record.clonedFromId}`}>
              <Button variant="ghost" size="sm" className="rounded-xl text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30" data-testid="link-kaynak-siparis">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Geçmiş Siparişi Gör
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {(record as any).orderType === 'stok' && (
        <Card className={`glass-card border-none shadow-md rounded-2xl p-5 border-l-4 ${(record as any).stokTransferredAt ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'}`} data-testid="card-stok-transfer">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${(record as any).stokTransferredAt ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'}`}>
                <Warehouse className="w-4 h-4" />
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-bold ${(record as any).stokTransferredAt ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'}`}>Stok Üretimi</p>
                {(record as any).stokTransferredAt ? (
                  <>
                    <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">Stoka Transfer Edildi</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date((record as any).stokTransferredAt), 'dd.MM.yyyy HH:mm')}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-sm">Stok Transferi Bekliyor</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Ürün işlem tamamlandığında otomatik transfer yapılır</p>
                  </>
                )}
              </div>
            </div>
            {canEdit && !(record as any).stokTransferredAt && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                onClick={() => transferToStokMutation.mutate()}
                disabled={transferToStokMutation.isPending}
                data-testid="button-transfer-to-stok"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                {transferToStokMutation.isPending ? 'Transfer ediliyor...' : 'Manuel Transfer Et'}
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden p-8">
            <div className="flex flex-wrap gap-6 mb-8">
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 p-2 rounded-lg text-primary"><Tag className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Lot Numarası</p>
                  <p className="font-semibold">{record.lotNumber || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500"><Box className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Referans ID</p>
                  <p className="font-semibold">{record.referenceId || '-'}</p>
                </div>
              </div>
              {(record as any).orderType !== 'stok' && (
                <div className="flex items-center gap-2">
                  <div className="bg-purple-500/10 p-2 rounded-lg text-purple-500"><UserIcon className="w-4 h-4" /></div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Müşteri</p>
                    {record.customer && (user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan') ? (
                      <Link
                        href={`/musteri-kutuphanesi?q=${encodeURIComponent(record.customer)}`}
                        className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                        data-testid="link-record-customer"
                      >
                        {record.customer}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Link>
                    ) : (
                      <p className="font-semibold">{record.customer || '-'}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="bg-amber-500/10 p-2 rounded-lg text-amber-500"><Calendar className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Sipariş Tarihi</p>
                  <p className="font-semibold">{record.orderDate ? format(new Date(record.orderDate), 'dd.MM.yyyy') : '-'}</p>
                </div>
              </div>
              {linkedSample && (
                <Link href={`/numuneler/${linkedSample.id}`}>
                  <div className="flex items-center gap-2 cursor-pointer group" data-testid="link-linked-sample">
                    <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                      <FlaskConical className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Sipariş Numunesi</p>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400 group-hover:underline transition-all">
                        {linkedSample.title}
                        {linkedSample.lotNumber && <span className="font-normal text-muted-foreground ml-1">· {linkedSample.lotNumber}</span>}
                      </p>
                    </div>
                  </div>
                </Link>
              )}
            </div>

            <h2 className="text-xl font-display font-semibold mb-4 border-t pt-6">Açıklama</h2>
            <div className="text-muted-foreground whitespace-pre-wrap">
              {record.description || <span className="italic">Açıklama girilmemiş.</span>}
            </div>

            {/* Reçete (BOM) */}
            <h2 className="text-xl font-display font-semibold mb-3 border-t pt-6 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" /> Reçete (BOM)
            </h2>
            {receteItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Reçete girilmemiş.</p>
            ) : (
              <div className="space-y-3">
                {receteItems.map(item => {
                  const lots = stokAtamalar.filter(a => a.receteItemId === item.id);
                  const unlinked = stokAtamalar.filter(a => a.receteItemId == null);
                  const showUnlinked = receteItems.indexOf(item) === receteItems.length - 1 && unlinked.length > 0;
                  return (
                    <div key={item.id} data-testid={`detail-recete-item-${item.id}`}>
                      {/* Row: ingredient name + required quantity */}
                      <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FlaskConical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium">{item.stokTur}</span>
                          {item.stokAltTur && <span className="text-xs text-muted-foreground">/ {item.stokAltTur}</span>}
                        </div>
                        <span className="text-sm font-semibold text-primary shrink-0 ml-4">{Number(item.miktar)} {item.birim}</span>
                      </div>

                      {/* Assigned stock lots */}
                      {lots.length > 0 && (
                        <div className="ml-4 mt-1.5 space-y-1">
                          {lots.map(lot => (
                            <div
                              key={lot.id}
                              className={cn(
                                'flex items-center justify-between rounded-lg px-3 py-1.5 border text-xs',
                                lot.tasindi
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                              )}
                              data-testid={`detail-recete-lot-${lot.id}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Package className="w-3 h-3 shrink-0 text-muted-foreground" />
                                <span className="font-medium truncate">{lot.stokAdi}</span>
                                {lot.lot && <span className="text-muted-foreground shrink-0">· LOT: {lot.lot}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <span className={cn('font-semibold', lot.tasindi ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400')}>
                                  {(lot.tasindiMiktar ?? lot.rezerveMiktar).toLocaleString('tr-TR')} {lot.birim}
                                </span>
                                {lot.tasindi
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                  : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Unlinked fazlalık lots appended after last recete item */}
                      {showUnlinked && (
                        <div className="ml-4 mt-1.5 space-y-1">
                          {unlinked.map(lot => (
                            <div
                              key={lot.id}
                              className="flex items-center justify-between rounded-lg px-3 py-1.5 border text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                              data-testid={`detail-recete-lot-${lot.id}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Package className="w-3 h-3 shrink-0 text-muted-foreground" />
                                <span className="font-medium truncate">{lot.stokAdi}</span>
                                {lot.lot && <span className="text-muted-foreground shrink-0">· LOT: {lot.lot}</span>}
                                <span className="text-blue-600 dark:text-blue-400 italic ml-1">(fazlalık)</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <span className="font-semibold text-blue-700 dark:text-blue-400">
                                  {(lot.tasindiMiktar ?? lot.rezerveMiktar).toLocaleString('tr-TR')} {lot.birim}
                                </span>
                                {lot.tasindi
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                  : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Phase Progress */}
          <PhaseProgressSection recordId={record.id} />

          {/* Order Items Section */}
          <OrderItemsSection
            recordId={record.id}
            totalQuantity={record.totalQuantity}
            itemsPerBox={record.itemsPerBox || 1}
            readonly={!canEdit}
            orderType={(record as any).orderType || 'musteri'}
          />

          {/* Shipment Info */}
          <ShipmentInfoSection recordId={record.id} />

          {/* Photo Album */}
          <PhotoAlbum recordId={record.id} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pastal — per-item album */}
            <PhaseAlbumCard
              label="Pastal"
              target={record.totalQuantity}
              items={orderItems}
              itemPhotoKey="pastalPhotoUrl"
              recordPhoto={record.pastalPhotoUrl}
            />
            {/* Ürün İşlem — per-item album */}
            <PhaseAlbumCard
              label="Ürün İşlem"
              target={record.totalQuantity}
              items={orderItems}
              itemPhotoKey="urunIslemPhotoUrl"
              recordPhoto={record.urunIslemPhotoUrl}
            />
            {/* Katlama — per-item album (only for non-stok orders) */}
            {(record as any).orderType !== 'stok' && (
              <PhaseAlbumCard
                label="Katlama"
                target={record.totalQuantity}
                items={orderItems}
                itemPhotoKey="katlamaPhotoUrl"
                recordPhoto={record.katlamaPhotoUrl}
              />
            )}
            {/* Set Toplama, Kolileme — single record-level photo (only for non-stok orders) */}
            {(record as any).orderType !== 'stok' && [
              { key: 'setToplamaPhotoUrl', label: 'Set Toplama', target: record.totalQuantity },
              { key: 'kolilemePhotoUrl', label: 'Kolileme', target: boxesNeeded, unit: 'koli' },
            ].map(phase => (
              <Card key={phase.key} className="glass-card border-none shadow-md rounded-2xl overflow-hidden">
                <div className="p-4 bg-muted/30 border-b flex justify-between items-center">
                  <span className="font-semibold">{phase.label}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Hedef: {phase.target} {phase.unit || 'adet'}</span>
                </div>
                {(record as any)[phase.key] ? (
                  <img src={(record as any)[phase.key]} loading="lazy" decoding="async" className="w-full h-48 object-cover" />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center text-muted-foreground opacity-30 bg-muted/10">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
              </Card>
            ))}
            {/* Sevkiyat — üç fotoğraf: Teknomar + Zeos + Sterilizasyon Biformu (only for non-stok orders) */}
            {(record as any).orderType !== 'stok' && (
              <Card className="glass-card border-none shadow-md rounded-2xl overflow-hidden">
              <div className="p-4 bg-muted/30 border-b flex justify-between items-center">
                <span className="font-semibold">Sevkiyat</span>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Hedef: {boxesNeeded} koli</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                {/* Teknomar fotoğrafı */}
                <div className="flex flex-col">
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/10 border-b">Teknomar</div>
                  {(record as any).sevkiyatPhotoUrl ? (
                    <button className="relative group overflow-hidden" onClick={() => setZoomPhoto((record as any).sevkiyatPhotoUrl)}>
                      <img src={(record as any).sevkiyatPhotoUrl} loading="lazy" decoding="async" className="w-full h-40 object-cover transition-transform duration-200 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center text-muted-foreground opacity-30 bg-muted/10">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}
                </div>
                {/* Zeos fotoğrafı */}
                <div className="flex flex-col">
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/10 border-b">Zeos</div>
                  {(record as any).sevkiyatZeosPhotoUrl ? (
                    <button className="relative group overflow-hidden" onClick={() => setZoomPhoto((record as any).sevkiyatZeosPhotoUrl)}>
                      <img src={(record as any).sevkiyatZeosPhotoUrl} loading="lazy" decoding="async" className="w-full h-40 object-cover transition-transform duration-200 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center text-muted-foreground opacity-30 bg-muted/10">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}
                </div>
                {/* Sterilizasyon Biformu fotoğrafı */}
                <div className="flex flex-col">
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/10 border-b">Sterilizasyon Biformu</div>
                  {(record as any).sterilizasyonPhotoUrl ? (
                    <button className="relative group overflow-hidden" onClick={() => setZoomPhoto((record as any).sterilizasyonPhotoUrl)}>
                      <img src={(record as any).sterilizasyonPhotoUrl} loading="lazy" decoding="async" className="w-full h-40 object-cover transition-transform duration-200 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center text-muted-foreground opacity-30 bg-muted/10">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}
                </div>
              </div>
            </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="glass-card border-none shadow-lg rounded-3xl p-6 space-y-6">
            <h3 className="font-display font-semibold text-lg flex items-center gap-2"><Box className="w-5 h-5 text-primary" /> Üretim Bilgileri</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Toplam Üretilecek</p>
                <p className="text-3xl font-bold">{record.totalQuantity} <small className="text-sm font-normal">adet</small></p>
              </div>
              <div className="h-px bg-border/50 w-full" />
              {(record as any).orderType !== 'stok' && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Koli İçi Adet</p>
                    <p className="text-xl font-bold">{record.itemsPerBox} <small className="text-sm font-normal">adet</small></p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Koli Hedefi</p>
                    <p className="text-xl font-bold">{boxesNeeded} <small className="text-sm font-normal">koli</small></p>
                  </div>
                </>
              )}
              <div className="h-px bg-border/50 w-full" />
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <UserIcon className="w-4 h-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm font-medium">Sisteme Kaydeden</p>
                    <p className="text-xs text-muted-foreground">
                      {(record as any).createdByName ?? `Kullanıcı #${record.createdBy}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm font-medium">Sistem Giriş Tarihi</p>
                    <p className="text-xs text-muted-foreground">{record.createdAt ? format(new Date(record.createdAt), 'dd.MM.yyyy HH:mm') : '-'}</p>
                  </div>
                </div>
                {record.lastUpdatedBy && (
                  <>
                    <div className="flex items-start gap-3">
                      <Edit className="w-4 h-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-sm font-medium">Son Düzenleyen</p>
                        <p className="text-xs text-muted-foreground">
                          {(record as any).lastUpdatedByName ?? `Kullanıcı #${record.lastUpdatedBy}`}
                        </p>
                      </div>
                    </div>
                    {record.updatedAt && (
                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                          <p className="text-sm font-medium">Son Düzenlenme</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(record.updatedAt), 'dd.MM.yyyy HH:mm')}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {editLogs.length > 0 && (
                  <div>
                    <button
                      data-testid="button-edit-history-toggle"
                      onClick={() => setHistoryOpen(h => !h)}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Düzenleme Geçmişi ({editLogs.length})</span>
                      {historyOpen ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>
                    {historyOpen && (
                      <div className="mt-2 space-y-1.5 pl-5 border-l-2 border-border/40">
                        {editLogs.map(log => (
                          <div key={log.id} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">{log.editorName}</span>
                            {' — '}
                            {format(new Date(log.editedAt), 'dd.MM.yyyy HH:mm')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>

    {/* Fotoğraf zoom lightbox */}
    {zoomPhoto && (
      <div
        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
        onClick={() => setZoomPhoto(null)}
      >
        <button
          className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          onClick={() => setZoomPhoto(null)}
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={zoomPhoto}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={e => e.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}
