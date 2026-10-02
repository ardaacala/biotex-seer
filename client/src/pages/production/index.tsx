import { useState, useRef } from 'react';
import { Link } from 'wouter';
import {
  useProductionSummary,
  type ProductionSummaryItem,
  type PhaseData,
  type ItemPhaseData,
  type ProductionLogEntry,
} from '@/hooks/use-production-summary';
import { useCreateProductionLog, useDeleteProductionLog } from '@/hooks/use-production-logs';
import { useAuth } from '@/hooks/use-auth';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  Zap, AlertTriangle, Clock, User as UserIcon, ChevronDown, ChevronUp,
  Plus, Loader2, Check, Trash2, ExternalLink, RefreshCw, Package, PackageCheck,
  Camera, CheckCircle2, Layers, ListChecks, Search
} from 'lucide-react';
import { cn, normalizeForSearch } from '@/lib/utils';
import type { ProductionRecord } from '@shared/schema';

/* ─── helpers ────────────────────────────────────────────────────────────── */

function pctColor(pct: number) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 60)  return 'bg-primary';
  if (pct >= 30)  return 'bg-amber-400';
  return 'bg-rose-400';
}

function pctTextColor(pct: number) {
  if (pct >= 100) return 'text-green-600';
  if (pct >= 60)  return 'text-primary';
  if (pct >= 30)  return 'text-amber-500';
  return 'text-rose-500';
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

function BigProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-3.5 bg-muted rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={cn("h-full rounded-full", pctColor(pct))}
      />
    </div>
  );
}

/* ─── Phase photo field map ───────────────────────────────────────────────── */

const PHASE_ICONS: Record<string, string> = {
  pastal:      '🪡',
  urun_islem:  '⚙️',
  katlama:     '📐',
  set_toplama: '📦',
  kolileme:    '📫',
  sevkiyat:    '🚚',
};

const PHASE_PHOTO_FIELD: Record<string, keyof ProductionRecord> = {
  pastal:         'pastalPhotoUrl',
  urun_islem:     'urunIslemPhotoUrl',
  katlama:        'katlamaPhotoUrl',
  set_toplama:    'setToplamaPhotoUrl',
  kolileme:       'kolilemePhotoUrl',
  sevkiyat:       'sevkiyatPhotoUrl',
  sterilizasyon:  'sterilizasyonPhotoUrl',
};

const ITEM_PHASE_PHOTO_FIELD: Record<string, 'pastalPhotoUrl' | 'urunIslemPhotoUrl' | 'katlamaPhotoUrl'> = {
  pastal:     'pastalPhotoUrl',
  urun_islem: 'urunIslemPhotoUrl',
  katlama:    'katlamaPhotoUrl',
};

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let { width, height } = img;
        if (width > height) { if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; } }
        else { if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─── Record-level phase photo mutation ─────────────────────────────────── */

function useUpdatePhasePhoto(recordId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: Record<string, string | null>) =>
      apiRequest('PATCH', `/api/records/${recordId}/photo-fields`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/production-summary'] });
      qc.invalidateQueries({ queryKey: ['/api/records'] });
      toast({ title: 'Fotoğraf güncellendi' });
    },
    onError: () => toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi', variant: 'destructive' }),
  });
}

function useDeletePhasePhoto(recordId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (field: string) =>
      apiRequest('DELETE', `/api/records/${recordId}/photo/${field}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/production-summary'] });
      qc.invalidateQueries({ queryKey: ['/api/records'] });
      toast({ title: 'Fotoğraf silindi' });
    },
    onError: () => toast({ title: 'Hata', description: 'Fotoğraf silinemedi', variant: 'destructive' }),
  });
}

/* ─── Item-level phase photo mutation ───────────────────────────────────── */

function useUpdateItemPhoto(recordId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ itemId, field, value }: { itemId: number; field: string; value: string | null }) =>
      apiRequest('PATCH', `/api/records/${recordId}/items/${itemId}/photo-fields`, { [field]: value }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/production-summary'] });
      toast({ title: 'Fotoğraf güncellendi' });
    },
    onError: () => toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi', variant: 'destructive' }),
  });
}

function useDeleteItemPhoto(recordId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ itemId, field }: { itemId: number; field: string }) =>
      apiRequest('DELETE', `/api/records/${recordId}/items/${itemId}/photo/${field}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/production-summary'] });
      toast({ title: 'Fotoğraf silindi' });
    },
    onError: () => toast({ title: 'Hata', description: 'Fotoğraf silinemedi', variant: 'destructive' }),
  });
}

/* ─── PhasePhotoWidget (record-level) ───────────────────────────────────── */

function PhasePhotoWidget({
  photoUrl,
  phaseKey,
  recordId,
  readOnly = false,
  canDelete = false,
  fieldOverride,
  testIdSuffix,
}: {
  photoUrl: string | null | undefined;
  phaseKey: string;
  recordId: number;
  readOnly?: boolean;
  canDelete?: boolean;
  fieldOverride?: string;
  testIdSuffix?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useUpdatePhasePhoto(recordId);
  const deleteMutation = useDeletePhasePhoto(recordId);
  const field = (fieldOverride ?? PHASE_PHOTO_FIELD[phaseKey]) as keyof ProductionRecord;
  const tid = testIdSuffix ?? phaseKey;
  const [preview, setPreview] = useState<string | null | undefined>(photoUrl);
  const [showFull, setShowFull] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const base64 = await compressImage(file);
    setPreview(base64);
    mutation.mutate({ [field]: base64 });
  };

  const handleDelete = () => {
    setPreview(null);
    deleteMutation.mutate(field);
  };

  const currentPhoto = preview !== undefined ? preview : photoUrl;

  if (!currentPhoto && readOnly) return null;

  return (
    <>
      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          data-testid={`input-phase-photo-${tid}`}
        />
      )}
      {currentPhoto ? (
        <div className="relative shrink-0 group">
          <button
            onClick={() => setShowFull(true)}
            className="block w-14 h-14 rounded-xl overflow-hidden ring-1 ring-border hover:ring-primary transition-all"
          >
            <img src={currentPhoto} alt={`${tid} foto`} className="w-full h-full object-cover" />
          </button>
          {!readOnly && (
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
              title="Fotoğrafı değiştir"
              data-testid={`button-change-photo-${tid}`}
            >
              {mutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Camera className="w-2.5 h-2.5" />}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="absolute -top-1 -left-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 items-center justify-center shadow-md hover:scale-110 transition-transform hidden group-hover:flex"
              title="Fotoğrafı sil"
              data-testid={`button-delete-phase-photo-${tid}`}
            >
              {deleteMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>
      ) : !readOnly ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center gap-0.5 transition-all"
          title="Fotoğraf ekle"
          data-testid={`button-add-photo-${tid}`}
        >
          {mutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            : <Camera className="w-4 h-4 text-muted-foreground/60" />}
          <span className="text-[8px] text-muted-foreground/50 leading-none">Foto</span>
        </button>
      ) : null}

      <AnimatePresence>
        {showFull && currentPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowFull(false)}
          >
            <motion.img
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              src={currentPhoto}
              alt="Tam ekran"
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── ItemPhasePhotoWidget (item-level) ─────────────────────────────────── */

function ItemPhasePhotoWidget({
  photoUrl,
  phaseKey,
  recordId,
  itemId,
  readOnly = false,
  canDelete = false,
}: {
  photoUrl: string | null | undefined;
  phaseKey: string;
  recordId: number;
  itemId: number;
  readOnly?: boolean;
  canDelete?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useUpdateItemPhoto(recordId);
  const deleteMutation = useDeleteItemPhoto(recordId);
  const field = ITEM_PHASE_PHOTO_FIELD[phaseKey];
  const [preview, setPreview] = useState<string | null | undefined>(photoUrl);
  const [showFull, setShowFull] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const base64 = await compressImage(file);
    setPreview(base64);
    mutation.mutate({ itemId, field, value: base64 });
  };

  const handleDelete = () => {
    setPreview(null);
    deleteMutation.mutate({ itemId, field });
  };

  const currentPhoto = preview !== undefined ? preview : photoUrl;
  if (!currentPhoto && readOnly) return null;

  return (
    <>
      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
        />
      )}
      {currentPhoto ? (
        <div className="relative shrink-0 group">
          <button
            onClick={() => setShowFull(true)}
            className="block w-10 h-10 rounded-lg overflow-hidden ring-1 ring-border hover:ring-primary transition-all"
          >
            <img src={currentPhoto} alt={`${phaseKey} foto`} className="w-full h-full object-cover" />
          </button>
          {!readOnly && (
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            >
              {mutation.isPending ? <Loader2 className="w-2 h-2 animate-spin" /> : <Camera className="w-2 h-2" />}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="absolute -top-1 -left-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 items-center justify-center shadow-md hover:scale-110 transition-transform hidden group-hover:flex"
              title="Fotoğrafı sil"
            >
              {deleteMutation.isPending ? <Loader2 className="w-2 h-2 animate-spin" /> : <Trash2 className="w-2 h-2" />}
            </button>
          )}
        </div>
      ) : !readOnly ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="shrink-0 w-10 h-10 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center transition-all"
          title="Fotoğraf ekle"
        >
          {mutation.isPending
            ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            : <Camera className="w-3 h-3 text-muted-foreground/60" />}
        </button>
      ) : null}

      <AnimatePresence>
        {showFull && currentPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowFull(false)}
          >
            <motion.img
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              src={currentPhoto}
              alt="Tam ekran"
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── PhaseLogForm (aggregate) ───────────────────────────────────────────── */

function PhaseLogForm({
  recordId,
  phase,
  onDone,
}: {
  recordId: number;
  phase: PhaseData;
  onDone: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const mutation = useCreateProductionLog(recordId);

  const handleSubmit = async () => {
    await mutation.mutateAsync({ phase: phase.key, quantity: parseInt(qty) || 1, notes: notes.trim() || undefined });
    setQty('1');
    setNotes('');
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-primary/5 border-t border-border/40 px-4 py-3 space-y-3">
        <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          {phase.label} — Üretim Kaydet
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tamamlanan {phase.unit} *</Label>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              className="h-8 rounded-xl text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={qty}
              onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => { if (!e.target.value || e.target.value === '0') setQty('1'); }}
              data-testid={`input-log-quantity-${phase.key}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Not (isteğe bağlı)</Label>
            <Input
              placeholder="Kısa not..."
              className="h-8 rounded-xl text-sm"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              data-testid={`input-log-notes-${phase.key}`}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-xl h-8 text-xs"
            onClick={handleSubmit}
            disabled={mutation.isPending || !qty || parseInt(qty) < 1}
            data-testid={`button-save-log-${phase.key}`}
          >
            {mutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              : <Check className="w-3.5 h-3.5 mr-1" />}
            Kaydet
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl h-8 text-xs" onClick={onDone}>İptal</Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── ItemPhaseLogForm (per-item for Kumaş phases) ──────────────────────── */

function ItemPhaseLogForm({
  recordId,
  phaseKey,
  phaseLabel,
  item,
  onDone,
}: {
  recordId: number;
  phaseKey: string;
  phaseLabel: string;
  item: ItemPhaseData;
  onDone: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const mutation = useCreateProductionLog(recordId);

  const handleSubmit = async () => {
    await mutation.mutateAsync({
      phase: phaseKey,
      quantity: parseInt(qty) || 1,
      notes: notes.trim() || undefined,
      orderItemId: item.id,
    });
    setQty('1');
    setNotes('');
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-primary/5 border-t border-border/40 px-3 py-2.5 space-y-2">
        <p className="text-[11px] font-semibold text-primary flex items-center gap-1">
          <Plus className="w-3 h-3" />
          {phaseLabel} — {item.name}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tamamlanan adet *</Label>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              className="h-8 rounded-xl text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={qty}
              onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => { if (!e.target.value || e.target.value === '0') setQty('1'); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Not</Label>
            <Input
              placeholder="Kısa not..."
              className="h-8 rounded-xl text-sm"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-xl h-7 text-[11px]"
            onClick={handleSubmit}
            disabled={mutation.isPending || !qty || parseInt(qty) < 1}
          >
            {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
            Kaydet
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl h-7 text-[11px]" onClick={onDone}>İptal</Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── ItemPhaseRow (per-item row for Kumaş phases) ──────────────────────── */

function ItemPhaseRow({
  item,
  phaseKey,
  phaseLabel,
  recordId,
  isAdmin,
  readOnly,
}: {
  item: ItemPhaseData;
  phaseKey: string;
  phaseLabel: string;
  recordId: number;
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const deleteMutation = useDeleteProductionLog(recordId);
  const isDone = item.pct >= 100;

  const photoUrl = phaseKey === 'pastal' ? item.pastalPhotoUrl
    : phaseKey === 'urun_islem' ? item.urunIslemPhotoUrl
    : item.katlamaPhotoUrl;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      isDone ? "border-green-500/30 bg-green-500/5" : "border-border/30 bg-muted/5"
    )}>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium truncate">{item.name}</span>
            <span className={cn("text-[11px] font-bold shrink-0", pctTextColor(item.pct))}>
              {item.pct}%{isDone && ' ✓'}
            </span>
          </div>
          <MiniProgressBar pct={item.pct} />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {item.completed} / {item.target} adet
            {!readOnly && ` · kalan: ${Math.max(0, item.target - item.completed)}`}
          </p>
        </div>
        <ItemPhasePhotoWidget
          photoUrl={photoUrl}
          phaseKey={phaseKey}
          recordId={recordId}
          itemId={item.id}
          readOnly={readOnly}
          canDelete={isAdmin}
        />
      </div>

      {item.lastLog && (
        <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[10px] text-muted-foreground">
          <UserIcon className="w-2.5 h-2.5 opacity-60" />
          <span className="font-medium">{item.lastLog.username}</span>
          <span className="bg-primary/10 text-primary px-1 rounded font-bold">+{item.lastLog.quantity}</span>
          {item.lastLog.completedAt && (
            <span>{formatDistanceToNow(new Date(item.lastLog.completedAt), { addSuffix: true, locale: tr })}</span>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-1 px-3 pb-2">
          <Button
            size="sm"
            variant={showForm ? 'outline' : 'default'}
            className="h-6 rounded-lg text-[11px] flex-1"
            onClick={() => { setShowForm(v => !v); setExpanded(false); }}
          >
            <Plus className="w-3 h-3 mr-1" />
            Kaydet
          </Button>
          {item.allLogs.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 rounded-lg text-[11px] text-muted-foreground"
              onClick={() => { setExpanded(v => !v); setShowForm(false); }}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {item.allLogs.length}
            </Button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && !readOnly && (
          <ItemPhaseLogForm
            key="form"
            recordId={recordId}
            phaseKey={phaseKey}
            phaseLabel={phaseLabel}
            item={item}
            onDone={() => setShowForm(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="logs"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 px-3 py-2 space-y-1">
              {item.allLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 text-[11px]">
                  <div className="flex-1">
                    <span className="font-semibold">{log.username}</span>
                    <span className="text-muted-foreground mx-1">—</span>
                    <span className="text-primary font-bold">+{log.quantity}</span>
                    {log.completedAt && (
                      <span className="text-muted-foreground ml-1.5">{format(new Date(log.completedAt), 'dd.MM.yyyy HH:mm')}</span>
                    )}
                    {log.notes && <p className="text-muted-foreground opacity-70">{log.notes}</p>}
                  </div>
                  {isAdmin && !readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 rounded text-destructive opacity-50 hover:opacity-100 shrink-0"
                      onClick={() => deleteMutation.mutate(log.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── PhaseRow (aggregate or set_toplama info) ───────────────────────────── */

function PhaseRow({
  phase,
  record,
  isAdmin,
  readOnly = false,
}: {
  phase: PhaseData;
  record: ProductionRecord;
  isAdmin: boolean;
  readOnly?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const deleteMutation = useDeleteProductionLog(record.id);
  const isDone = phase.pct >= 100;
  const icon = PHASE_ICONS[phase.key] || '▸';
  const photoField = PHASE_PHOTO_FIELD[phase.key];
  const photoUrl = photoField ? (record[photoField] as string | null) : null;
  const isSetToplama = phase.key === 'set_toplama';

  return (
    <>
      {/* ── Compact summary card row (tappable) ── */}
      <button
        className={cn(
          "w-full rounded-xl border overflow-hidden transition-all text-left active:scale-[0.99]",
          isDone ? "border-green-500/30 bg-green-500/5" : "border-border/40 bg-muted/10"
        )}
        onClick={() => setSheetOpen(true)}
        data-testid={`button-phase-row-${phase.key}-${record.id}`}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="text-base shrink-0" aria-hidden>{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold">{phase.label}</span>
              <span className={cn("text-xs font-bold shrink-0", pctTextColor(phase.pct))}>
                {phase.pct}%{isDone && ' ✓'}
              </span>
            </div>
            <MiniProgressBar pct={phase.pct} />
            <p className="text-[10px] text-muted-foreground mt-1">
              {phase.completed} / {phase.target} {phase.unit}
              {!readOnly && ` · kalan: ${Math.max(0, phase.target - phase.completed)}`}
            </p>
          </div>
          {/* show photo thumbnail if exists */}
          {photoUrl && (
            <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden ring-1 ring-border">
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          {/* tap hint */}
          <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        </div>

        {phase.lastLog && !isSetToplama && (
          <div className="flex items-center gap-2 px-3 pb-2 text-[10px] text-muted-foreground">
            <UserIcon className="w-3 h-3 shrink-0 opacity-60" />
            <span className="font-medium truncate">{phase.lastLog.username}</span>
            <span className="bg-primary/10 text-primary px-1 rounded font-bold shrink-0">
              +{phase.lastLog.quantity} {phase.unit}
            </span>
            {phase.lastLog.completedAt && (
              <span className="shrink-0">
                {formatDistanceToNow(new Date(phase.lastLog.completedAt), { addSuffix: true, locale: tr })}
              </span>
            )}
          </div>
        )}
        {!phase.lastLog && !isSetToplama && (
          <div className="flex items-center gap-1.5 px-3 pb-2 text-[10px] text-muted-foreground opacity-40">
            <Clock className="w-3 h-3" />
            <span>Henüz kayıt yok</span>
          </div>
        )}
        {isSetToplama && phase.allOrderItems && phase.allOrderItems.length > 0 && (
          <div className="px-3 pb-2">
            <p className="text-[10px] text-muted-foreground">
              {phase.allOrderItems.length} içerik — detaylar için dokunun
            </p>
          </div>
        )}
      </button>

      {/* ── Bottom Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-3xl p-0 pb-safe"
        >
          {/* drag handle */}
          <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
          </div>

          <div className="px-5 pb-10 space-y-5">
            {/* Phase title + progress */}
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>{icon}</span>
              <div className="flex-1">
                <h3 className="font-display font-bold text-xl">{phase.label}</h3>
                <p className="text-sm text-muted-foreground">
                  {phase.completed} / {phase.target} {phase.unit}
                  {!readOnly && ` · kalan: ${Math.max(0, phase.target - phase.completed)}`}
                </p>
              </div>
              <span className={cn("text-xl font-bold shrink-0", pctTextColor(phase.pct))}>
                {phase.pct}%{isDone && ' ✓'}
              </span>
            </div>
            <BigProgressBar pct={phase.pct} />

            {/* Photo widget (with edit capability) */}
            {!isSetToplama && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-muted/20 rounded-xl px-4 py-3">
                  <span className="text-xs font-semibold text-muted-foreground flex-1">
                    {phase.key === 'sevkiyat' ? 'Teknomar' : 'Faz Fotoğrafı'}
                  </span>
                  <PhasePhotoWidget
                    photoUrl={photoUrl}
                    phaseKey={phase.key}
                    recordId={record.id}
                    readOnly={readOnly}
                    canDelete={isAdmin}
                  />
                </div>
                {phase.key === 'sevkiyat' && (
                  <div className="flex items-center gap-3 bg-muted/20 rounded-xl px-4 py-3">
                    <span className="text-xs font-semibold text-muted-foreground flex-1">Zeos</span>
                    <PhasePhotoWidget
                      photoUrl={(record as any).sevkiyatZeosPhotoUrl ?? null}
                      phaseKey="sevkiyat"
                      fieldOverride="sevkiyatZeosPhotoUrl"
                      testIdSuffix="zeos"
                      recordId={record.id}
                      readOnly={readOnly}
                      canDelete={isAdmin}
                    />
                  </div>
                )}
                {phase.key === 'sevkiyat' && (
                  <div className="flex items-center gap-3 bg-muted/20 rounded-xl px-4 py-3">
                    <span className="text-xs font-semibold text-muted-foreground flex-1">Sterilizasyon Biformu</span>
                    <PhasePhotoWidget
                      photoUrl={record.sterilizasyonPhotoUrl ?? null}
                      phaseKey="sevkiyat"
                      fieldOverride="sterilizasyonPhotoUrl"
                      testIdSuffix="sterilizasyon"
                      recordId={record.id}
                      readOnly={readOnly}
                      canDelete={isAdmin}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Set Toplama items */}
            {isSetToplama && phase.allOrderItems && phase.allOrderItems.length > 0 && (
              <div className="bg-muted/20 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-3">
                  <ListChecks className="w-3.5 h-3.5" />
                  İçerikler
                </p>
                <div className="space-y-2">
                  {phase.allOrderItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{item.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                          item.category === 'Kumaş'
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-muted text-muted-foreground"
                        )}>{item.category}</span>
                        <span className="text-muted-foreground">{item.unitQuantity} adet</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Log form */}
            {!readOnly && (
              <div>
                <AnimatePresence mode="wait">
                  {!showForm ? (
                    <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Button
                        className="w-full rounded-xl h-12 text-sm"
                        onClick={() => setShowForm(true)}
                        data-testid={`button-log-phase-${phase.key}-${record.id}`}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Üretim Kaydet
                      </Button>
                    </motion.div>
                  ) : (
                    <PhaseLogForm
                      key="form"
                      recordId={record.id}
                      phase={phase}
                      onDone={() => setShowForm(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Log history */}
            {phase.allLogs.length > 0 && (
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/20 transition-colors"
                  onClick={() => setLogsExpanded(v => !v)}
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Kayıt Geçmişi
                    <span className="text-xs font-normal text-muted-foreground">({phase.allLogs.length})</span>
                  </span>
                  {logsExpanded
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <AnimatePresence>
                  {logsExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/40 px-4 py-3 space-y-2">
                        {phase.allLogs.map(log => (
                          <div key={log.id} className="flex items-start gap-2 text-xs">
                            <div className="flex-1 leading-snug">
                              <span className="font-semibold">{log.username}</span>
                              <span className="text-muted-foreground mx-1">—</span>
                              <span className="text-primary font-bold">+{log.quantity} {phase.unit}</span>
                              {log.completedAt && (
                                <span className="text-muted-foreground ml-1.5">
                                  {format(new Date(log.completedAt), 'dd.MM.yyyy HH:mm')}
                                </span>
                              )}
                              {log.notes && <p className="text-muted-foreground opacity-70 mt-0.5">{log.notes}</p>}
                            </div>
                            {isAdmin && !readOnly && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0 rounded text-destructive opacity-50 hover:opacity-100 shrink-0"
                                onClick={() => deleteMutation.mutate(log.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ─── KumasPhaseSection (header + per-item rows) ────────────────────────── */

function KumasPhaseSection({
  phase,
  record,
  isAdmin,
  readOnly,
}: {
  phase: PhaseData;
  record: ProductionRecord;
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isDone = phase.pct >= 100;
  const icon = PHASE_ICONS[phase.key] || '▸';
  const itemCount = phase.items?.length ?? 0;

  return (
    <>
      {/* ── Compact summary card row (tappable) ── */}
      <button
        className={cn(
          "w-full rounded-xl border overflow-hidden text-left transition-all active:scale-[0.99]",
          isDone ? "border-green-500/30 bg-green-500/5" : "border-border/40 bg-muted/10"
        )}
        onClick={() => setSheetOpen(true)}
        data-testid={`button-kumas-phase-${phase.key}-${record.id}`}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="text-base shrink-0">{icon}</span>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                {phase.label}
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Layers className="w-2.5 h-2.5" />
                  {itemCount} içerik
                </span>
              </span>
              <span className={cn("text-xs font-bold shrink-0", pctTextColor(phase.pct))}>
                {phase.pct}%{isDone && ' ✓'}
              </span>
            </div>
            <MiniProgressBar pct={phase.pct} />
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0 ml-1" />
        </div>
        {!readOnly && (
          <div className="px-3 pb-2 text-[10px] text-primary/50 flex items-center gap-1">
            <Plus className="w-3 h-3" />
            <span>İçeriklere göre kayıt ekle</span>
          </div>
        )}
      </button>

      {/* ── Bottom Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-3xl p-0 pb-safe"
        >
          {/* drag handle */}
          <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
          </div>

          <div className="px-5 pb-10 space-y-4">
            {/* Phase title */}
            <div className="flex items-center gap-3">
              <span className="text-3xl">{icon}</span>
              <div className="flex-1">
                <h3 className="font-display font-bold text-xl">{phase.label}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  İçerik bazlı — {itemCount} ürün
                </p>
              </div>
              <span className={cn("text-xl font-bold shrink-0", pctTextColor(phase.pct))}>
                {phase.pct}%{isDone && ' ✓'}
              </span>
            </div>
            <BigProgressBar pct={phase.pct} />

            {/* Per-item rows */}
            <div className="space-y-3">
              {phase.items?.map(item => (
                <ItemPhaseRow
                  key={item.id}
                  item={item}
                  phaseKey={phase.key}
                  phaseLabel={phase.label}
                  recordId={record.id}
                  isAdmin={isAdmin}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ─── OrderCard ──────────────────────────────────────────────────────────── */

const KUMAS_PHASES = new Set(['pastal', 'urun_islem', 'katlama']);

function OrderCard({
  item,
  index,
  readOnly = false,
}: {
  item: ProductionSummaryItem;
  index: number;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const { record, phases, totalPct, phasesFullyDone, hasKumas } = item;
  const isAcil = record.priority === 'acil';
  const isFullyDone = phasesFullyDone === 6;
  const isAdmin = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <Card className={cn(
        "glass-card border-none shadow-lg rounded-2xl overflow-hidden",
        isAcil && !readOnly && "ring-2 ring-destructive/40",
        isFullyDone && "ring-2 ring-green-500/30"
      )}>
        <CardHeader className={cn(
          "px-5 pt-5 pb-3",
          isAcil && !readOnly ? 'bg-destructive/5' : isFullyDone ? 'bg-green-500/5' : 'bg-muted/20'
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {readOnly ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Tamamlandı
                  </span>
                ) : (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                    isAcil ? 'bg-destructive text-destructive-foreground' :
                    record.priority === 'normal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {isAcil ? '⚡ ACİL' : record.priority === 'normal' ? 'Normal' : record.priority}
                  </span>
                )}
                {hasKumas && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 flex items-center gap-0.5">
                    <Layers className="w-2.5 h-2.5" /> Kumaşlı
                  </span>
                )}
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
            <Link href={`/records/${record.id}`} className="shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className="px-5 pb-4 space-y-3">
          <button
            className={cn(
              "w-full rounded-xl border-2 px-4 py-3 space-y-2 text-left transition-colors",
              isFullyDone
                ? "border-green-500/40 bg-green-500/5 hover:bg-green-500/10"
                : "border-primary/20 bg-primary/5 hover:bg-primary/10"
            )}
            onClick={() => setExpanded(v => !v)}
            data-testid={`button-expand-card-${record.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isFullyDone
                  ? <PackageCheck className="w-4 h-4 text-green-600" />
                  : <Package className="w-4 h-4 text-primary" />}
                <span className="text-sm font-bold">Toplam İlerleme</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{phasesFullyDone}/6 faz</span>
                <span className={cn("text-sm font-bold", pctTextColor(totalPct))}>{totalPct}%</span>
                {expanded
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            <BigProgressBar pct={totalPct} />
            <div className="flex flex-wrap gap-1 pt-0.5">
              {phases.map(p => (
                <span
                  key={p.key}
                  className={cn(
                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                    p.pct >= 100
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : p.pct > 0
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                  )}
                  data-testid={`phase-pill-${p.key}-${record.id}`}
                >
                  {p.pct >= 100 ? '✓' : p.pct > 0 ? '…' : '○'} {p.label}
                </span>
              ))}
            </div>
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                key="phases"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden space-y-2"
              >
                {readOnly && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    Bu sipariş tamamlanmıştır. Kayıtlar salt okunur olarak görüntülenmektedir.
                  </p>
                )}
                {phases.map(phase => {
                  if (KUMAS_PHASES.has(phase.key) && phase.items && phase.items.length > 0) {
                    return (
                      <KumasPhaseSection
                        key={phase.key}
                        phase={phase}
                        record={record}
                        isAdmin={isAdmin}
                        readOnly={readOnly}
                      />
                    );
                  }
                  return (
                    <PhaseRow
                      key={phase.key}
                      phase={phase}
                      record={record}
                      isAdmin={isAdmin}
                      readOnly={readOnly}
                    />
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ProductionPage() {
  const { data: summary, isLoading, isError, error, refetch, isFetching } = useProductionSummary();
  const [lotSearch, setLotSearch] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'lotNumber' | 'customer' | 'fifo'>('fifo');

  const activeOrders = summary ?? [];
  const acilOrders = activeOrders.filter(s => s.record.priority === 'acil').length;

  function fifoScore(r: { priority?: string | null; orderDate?: string | null; createdAt?: string | null }) {
    const date = r.orderDate ? new Date(r.orderDate).getTime() : new Date(r.createdAt || 0).getTime();
    return (r.priority === 'acil' ? 0 : 1_000_000_000_000_000) + date;
  }

  const filteredOrders = [...(lotSearch.trim()
    ? activeOrders.filter(s => {
        const q = normalizeForSearch(lotSearch.trim());
        return (
          normalizeForSearch(s.record.title).includes(q) ||
          normalizeForSearch(s.record.customer).includes(q) ||
          normalizeForSearch(s.record.lotNumber).includes(q)
        );
      })
    : activeOrders
  )].sort((a, b) => {
    if (sortBy === 'fifo') return fifoScore(a.record) - fifoScore(b.record);
    const aVal = (a.record[sortBy as 'title' | 'lotNumber' | 'customer'] ?? '').toLowerCase();
    const bVal = (b.record[sortBy as 'title' | 'lotNumber' | 'customer'] ?? '').toLowerCase();
    return aVal.localeCompare(bVal, 'tr');
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <span className="bg-primary/10 text-primary p-2 rounded-xl">
              <Zap className="w-7 h-7" />
            </span>
            Anlık Üretim
          </h1>
          <p className="text-muted-foreground mt-1">6 üretim fazının ilerleme takibi ve üretim kayıt girişi.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-production"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
          Yenile
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="glass-card border-none rounded-2xl p-4 text-center" data-testid="stat-total-orders">
          <p className="text-2xl font-display font-bold">{activeOrders.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Aktif Sipariş</p>
        </Card>
        <Card className={cn("glass-card border-none rounded-2xl p-4 text-center", acilOrders > 0 && "ring-2 ring-destructive/30")} data-testid="stat-acil-orders">
          <p className={cn("text-2xl font-display font-bold", acilOrders > 0 ? "text-destructive" : "")}>{acilOrders}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Acil</p>
        </Card>
      </div>

      {/* Lot search + sort bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Başlık, müşteri veya lot numarasına göre ara..."
            className="pl-10 h-12 rounded-xl bg-card border-border/50 focus:bg-background shadow-sm"
            value={lotSearch}
            onChange={(e) => setLotSearch(e.target.value)}
            data-testid="input-search-lot"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'title' | 'lotNumber' | 'customer')}>
          <SelectTrigger
            className="h-12 w-[190px] rounded-xl bg-card border-border/50 shadow-sm shrink-0"
            data-testid="select-sort-production"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fifo">FIFO Üretim Sırasına Göre</SelectItem>
            <SelectItem value="title">Sipariş Adına Göre</SelectItem>
            <SelectItem value="lotNumber">Lot Sırasına Göre</SelectItem>
            <SelectItem value="customer">Müşteriye Göre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {acilOrders > 0 && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-4 py-3 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {acilOrders} acil sipariş var — bu siparişler önce üretilmelidir!
        </div>
      )}

      {/* Active (FIFO) order cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card border-none rounded-2xl h-48 animate-pulse bg-muted/30" />
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
      ) : activeOrders.length === 0 ? (
        <Card className="glass-card border-none rounded-2xl p-12 text-center text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Aktif sipariş bulunmuyor.</p>
          <p className="text-sm mt-1">Tamamlanan siparişleri "Tamamlanan Siparişler" sayfasından görüntüleyebilirsiniz.</p>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="glass-card border-none rounded-2xl p-12 text-center text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Eşleşen sipariş bulunamadı.</p>
          <p className="text-sm mt-1">Lot numarası "<span className="font-semibold">{lotSearch}</span>" ile kayıtlı aktif sipariş yok.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map((item, idx) => (
            <OrderCard key={item.record.id} item={item} index={idx} readOnly={false} />
          ))}
        </div>
      )}
    </div>
  );
}
