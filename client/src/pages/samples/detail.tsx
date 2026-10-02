import { useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft, Edit, Trash2, FlaskConical, User, Hash, Tag, GalleryThumbnails,
  Image as ImageIcon, Plus, X, ZoomIn, FileText, Package, Layers, Truck, Check, Loader2, BookOpen, ExternalLink,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Sample, SamplePhoto, SampleItem } from '@shared/schema';
import { cn, normalizeForSearch } from '@/lib/utils';
import { LazyImage } from '@/components/lazy-image';

type SamplePhotoLite = SamplePhoto & { hasPhoto?: boolean };
type SampleItemLite = SampleItem & { hasPhoto?: boolean };

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  });
}

function PhotoAlbum({ sampleId }: { sampleId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [lightbox, setLightbox] = useState<SamplePhotoLite | null>(null);

  const { data: photos = [], isLoading } = useQuery<SamplePhotoLite[]>({
    queryKey: ['/api/samples', sampleId, 'photos'],
    queryFn: () => fetch(`/api/samples/${sampleId}/photos`, { credentials: 'include' }).then(r => r.json()),
  });

  const addPhoto = useMutation({
    mutationFn: (body: { photoUrl: string; caption: string }) =>
      apiRequest('POST', `/api/samples/${sampleId}/photos`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/samples', sampleId, 'photos'] });
      setAddOpen(false); setPreviewSrc(null); setCaption('');
      toast({ title: 'Fotoğraf eklendi' });
    },
    onError: () => toast({ title: 'Fotoğraf kaydedilemedi', variant: 'destructive' }),
  });

  const deletePhoto = useMutation({
    mutationFn: (photoId: number) => apiRequest('DELETE', `/api/samples/${sampleId}/photos/${photoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/samples', sampleId, 'photos'] });
      toast({ title: 'Fotoğraf silindi' });
    },
  });

  const handleFile = async (file: File) => setPreviewSrc(await compressImage(file));
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
        <Button size="sm" className="rounded-xl gap-2" onClick={() => setAddOpen(true)} data-testid="button-add-sample-photo">
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
                <LazyImage
                  src={`/api/photo/sample_photos/${p.id}/photoUrl`}
                  hasPhoto={p.hasPhoto ?? !!p.photoUrl}
                  alt={p.caption || ''}
                  containerClassName="relative w-full h-40 cursor-zoom-in bg-muted/20"
                  className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                  onClick={() => setLightbox(p)}
                  data-testid={`img-sample-album-${p.id}`}
                />
                {p.caption && (
                  <div className="px-3 py-2 text-xs text-muted-foreground truncate border-t bg-card/80">{p.caption}</div>
                )}
                <button
                  className="absolute top-2 right-2 bg-black/60 hover:bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deletePhoto.mutate(p.id)}
                  data-testid={`button-delete-sample-photo-${p.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) clearPreview(); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Fotoğraf Ekle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async e => { if (e.target.files?.[0]) await handleFile(e.target.files[0]); }} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden"
              onChange={async e => { if (e.target.files?.[0]) await handleFile(e.target.files[0]); }} />
            {previewSrc ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={previewSrc} className="w-full h-48 object-cover" />
                <button className="absolute top-2 right-2 bg-black/60 hover:bg-destructive text-white rounded-full p-1" onClick={clearPreview}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="h-28 border-2 border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/30 transition-colors"
                  onClick={() => cameraRef.current?.click()}
                  data-testid="button-take-sample-photo"
                >
                  <ImageIcon className="w-7 h-7 opacity-50" />
                  <span className="text-xs font-medium">Fotoğraf Çek</span>
                </button>
                <button
                  className="h-28 border-2 border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/30 transition-colors"
                  onClick={() => galleryRef.current?.click()}
                  data-testid="button-upload-sample-photo"
                >
                  <GalleryThumbnails className="w-7 h-7 opacity-50" />
                  <span className="text-xs font-medium">Galeriden Seç</span>
                </button>
              </div>
            )}
            <Input placeholder="Açıklama (isteğe bağlı)" value={caption} onChange={e => setCaption(e.target.value)}
              className="rounded-xl" data-testid="input-sample-photo-caption" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setAddOpen(false)}>İptal</Button>
              <Button className="flex-1 rounded-xl" disabled={!previewSrc || addPhoto.isPending}
                onClick={() => previewSrc && addPhoto.mutate({ photoUrl: previewSrc, caption })}
                data-testid="button-save-sample-photo">
                {addPhoto.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/90 border-none rounded-2xl">
            <img src={`/api/photo/sample_photos/${lightbox.id}/photoUrl`} alt={lightbox.caption || ''} className="w-full max-h-[85vh] object-contain rounded-xl" />
            {lightbox.caption && <p className="text-center text-white/70 text-sm pt-1 pb-1">{lightbox.caption}</p>}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

type ItemForm = { name: string; unitQuantity: string; category: 'Kumaş' | 'Diğer'; fabricType: string; description: string; photoUrl: string };
const EMPTY_ITEM: ItemForm = { name: '', unitQuantity: '1', category: 'Diğer', fabricType: '', description: '', photoUrl: '' };

function PhotoPicker({ value, onChange, testIdPrefix }: { value: string; onChange: (v: string) => void; testIdPrefix: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const handleFile = async (file: File) => onChange(await compressImage(file));
  return (
    <div className="space-y-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      {value ? (
        <div className="relative rounded-xl overflow-hidden w-32 h-32">
          <img src={value} className="w-full h-full object-cover" />
          <button type="button" className="absolute top-1 right-1 bg-black/60 hover:bg-destructive text-white rounded-full p-1"
            onClick={() => onChange('')} data-testid={`${testIdPrefix}-clear`}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          <button type="button"
            className="h-20 border-2 border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/30 transition-colors"
            onClick={() => cameraRef.current?.click()} data-testid={`${testIdPrefix}-camera`}>
            <ImageIcon className="w-5 h-5 opacity-60" />
            <span className="text-[11px] font-medium">Fotoğraf Çek</span>
          </button>
          <button type="button"
            className="h-20 border-2 border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/30 transition-colors"
            onClick={() => galleryRef.current?.click()} data-testid={`${testIdPrefix}-gallery`}>
            <GalleryThumbnails className="w-5 h-5 opacity-60" />
            <span className="text-[11px] font-medium">Galeriden Seç</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SampleItemsSection({ sampleId, readonly }: { sampleId: number; readonly: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newItem, setNewItem] = useState<ItemForm>(EMPTY_ITEM);
  const [editItem, setEditItem] = useState<ItemForm>(EMPTY_ITEM);
  const [librarySearch, setLibrarySearch] = useState('');
  const [photoReminderFor, setPhotoReminderFor] = useState<SampleItem | null>(null);

  const { data: items = [], isLoading } = useQuery<SampleItemLite[]>({
    queryKey: ['/api/samples', sampleId, 'items'],
    queryFn: () => fetch(`/api/samples/${sampleId}/items`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: library = [] } = useQuery<Array<{ id: number; name: string; description: string | null; defaultUnitQuantity: number; category: string | null; fabricType: string | null }>>({
    queryKey: ['/api/item-library'],
    queryFn: () => fetch('/api/item-library', { credentials: 'include' }).then(r => r.json()),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ['/api/samples', sampleId, 'items'] });

  const createM = useMutation({
    mutationFn: (body: any) => apiRequest('POST', `/api/samples/${sampleId}/items`, body).then(r => r.json()),
    onSuccess: (created: SampleItem, variables: any) => {
      inv();
      setShowForm(false);
      setShowLibrary(false);
      setNewItem(EMPTY_ITEM);
      toast({ title: 'İçerik eklendi' });
      if (!variables?.photoUrl) {
        setPhotoReminderFor(created);
      }
    },
    onError: (e: any) => toast({ title: 'Hata', description: e?.message || 'Eklenemedi', variant: 'destructive' }),
  });
  const updateM = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest('PUT', `/api/samples/${sampleId}/items/${id}`, body),
    onSuccess: () => { inv(); setEditingId(null); toast({ title: 'İçerik güncellendi' }); },
    onError: (e: any) => toast({ title: 'Hata', description: e?.message || 'Güncellenemedi', variant: 'destructive' }),
  });
  const deleteM = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/samples/${sampleId}/items/${id}`),
    onSuccess: () => { inv(); toast({ title: 'İçerik silindi' }); },
  });

  const submitNew = () => {
    if (!newItem.name.trim()) return;
    createM.mutate({
      name: newItem.name.trim(),
      unitQuantity: parseInt(newItem.unitQuantity) || 1,
      category: newItem.category,
      fabricType: newItem.category === 'Kumaş' ? (newItem.fabricType.trim() || null) : null,
      description: newItem.description.trim() || null,
      photoUrl: newItem.photoUrl || null,
    });
  };
  const submitEdit = (id: number) => {
    updateM.mutate({ id, body: {
      name: editItem.name.trim(),
      unitQuantity: parseInt(editItem.unitQuantity) || 1,
      category: editItem.category,
      fabricType: editItem.category === 'Kumaş' ? (editItem.fabricType.trim() || null) : null,
      description: editItem.description.trim() || null,
      photoUrl: editItem.photoUrl || null,
    }});
  };

  const handleSelectFromLibrary = (entry: { name: string; description: string | null; defaultUnitQuantity: number; category: string | null; fabricType: string | null }) => {
    setNewItem({
      name: entry.name,
      unitQuantity: String(entry.defaultUnitQuantity || 1),
      category: (entry.category as 'Kumaş' | 'Diğer') || 'Diğer',
      fabricType: entry.fabricType || '',
      description: entry.description || '',
      photoUrl: '',
    });
    setShowLibrary(false);
    setShowForm(true);
  };

  const filteredLibrary = library.filter(l => normalizeForSearch(l.name).includes(normalizeForSearch(librarySearch)));

  return (
    <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
      <div className="p-6 bg-muted/20 border-b flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Numune İçerikleri
          {items.length > 0 && (
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">{items.length}</span>
          )}
        </h3>
        {!readonly && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="rounded-xl text-muted-foreground hover:text-primary"
              onClick={() => { setShowLibrary(s => !s); setShowForm(false); }} data-testid="button-sample-item-library">
              <BookOpen className="w-4 h-4 mr-1" /> Kütüphane
            </Button>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { setShowForm(s => !s); setShowLibrary(false); setNewItem(EMPTY_ITEM); }} data-testid="button-add-sample-item">
              <Plus className="w-4 h-4" /> Ekle
            </Button>
          </div>
        )}
      </div>
      <CardContent className="p-0">
        {showLibrary && (
          <div className="p-4 border-b bg-blue-50/50 dark:bg-blue-950/20">
            <p className="text-sm font-semibold mb-3 text-blue-700 dark:text-blue-300">Kütüphaneden Seç</p>
            <Input placeholder="İçerik ara..." className="h-9 rounded-xl mb-3"
              value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} data-testid="input-sample-library-search" />
            {filteredLibrary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Eşleşen içerik bulunamadı</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredLibrary.map(entry => (
                  <button key={entry.id} onClick={() => handleSelectFromLibrary(entry)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 flex items-center justify-between transition-colors"
                    data-testid={`sample-library-item-${entry.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      {entry.description && <p className="text-xs text-muted-foreground truncate">{entry.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        entry.category === 'Kumaş' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-muted text-muted-foreground')}>
                        {entry.category === 'Kumaş' ? <Layers className="w-2.5 h-2.5" /> : <Package className="w-2.5 h-2.5" />}{entry.category || 'Diğer'}
                      </span>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{entry.defaultUnitQuantity} adet</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showForm && (
          <div className="p-4 border-b bg-muted/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6 space-y-1">
                <Label className="text-xs">İçerik Adı *</Label>
                <Input className="h-9 rounded-xl" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} data-testid="input-sample-item-name" />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">Sınıf *</Label>
                <div className="flex rounded-xl border border-border overflow-hidden h-9 text-xs">
                  {(['Kumaş', 'Diğer'] as const).map(c => (
                    <button key={c} type="button" onClick={() => setNewItem(p => ({ ...p, category: c, fabricType: c === 'Diğer' ? '' : p.fabricType }))}
                      className={cn('flex-1 flex items-center justify-center gap-1 px-2 font-medium', newItem.category === c ? (c === 'Kumaş' ? 'bg-blue-600 text-white' : 'bg-muted text-foreground') : 'bg-transparent text-muted-foreground hover:bg-muted/60')}>
                      {c === 'Kumaş' ? <Layers className="w-3 h-3" /> : <Package className="w-3 h-3" />}{c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">Birim/Adet *</Label>
                <Input inputMode="numeric" className="h-9 rounded-xl" value={newItem.unitQuantity}
                  onChange={e => setNewItem(p => ({ ...p, unitQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                  onBlur={e => { if (!e.target.value || e.target.value === '0') setNewItem(p => ({ ...p, unitQuantity: '1' })); }} />
              </div>
            </div>
            {newItem.category === 'Kumaş' && (
              <div className="space-y-1">
                <Label className="text-xs">Kumaş Türü</Label>
                <Input className="h-9 rounded-xl" placeholder="Örn: %100 Pamuk..." value={newItem.fabricType} onChange={e => setNewItem(p => ({ ...p, fabricType: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Açıklama</Label>
              <Textarea className="rounded-xl min-h-[60px] text-sm" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fotoğraf <span className="text-muted-foreground font-normal">(isteğe bağlı)</span></Label>
              <PhotoPicker value={newItem.photoUrl} onChange={v => setNewItem(p => ({ ...p, photoUrl: v }))} testIdPrefix="sample-item-new-photo" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl" onClick={submitNew} disabled={createM.isPending || !newItem.name.trim()} data-testid="button-save-sample-item">
                {createM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}<span className="ml-1">Kaydet</span>
              </Button>
              <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => { setShowForm(false); setNewItem(EMPTY_ITEM); }}><X className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Henüz içerik eklenmemiş.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {items.map(item => (
              <div key={item.id} className="px-6 py-4" data-testid={`sample-item-row-${item.id}`}>
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6 space-y-1">
                        <Input className="h-8 rounded-xl text-sm" value={editItem.name} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="sm:col-span-3 space-y-1">
                        <div className="flex rounded-xl border border-border overflow-hidden h-8 text-xs">
                          {(['Kumaş', 'Diğer'] as const).map(c => (
                            <button key={c} type="button" onClick={() => setEditItem(p => ({ ...p, category: c, fabricType: c === 'Diğer' ? '' : p.fabricType }))}
                              className={cn('flex-1 px-2 font-medium', editItem.category === c ? (c === 'Kumaş' ? 'bg-blue-600 text-white' : 'bg-muted text-foreground') : 'bg-transparent text-muted-foreground')}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="sm:col-span-3 space-y-1">
                        <Input inputMode="numeric" className="h-8 rounded-xl text-sm" value={editItem.unitQuantity}
                          onChange={e => setEditItem(p => ({ ...p, unitQuantity: e.target.value.replace(/[^0-9]/g, '') }))} />
                      </div>
                    </div>
                    {editItem.category === 'Kumaş' && (
                      <Input className="h-8 rounded-xl text-xs" placeholder="Kumaş türü..." value={editItem.fabricType} onChange={e => setEditItem(p => ({ ...p, fabricType: e.target.value }))} />
                    )}
                    <Textarea className="rounded-xl min-h-[50px] text-xs" placeholder="Açıklama..." value={editItem.description} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))} />
                    <div className="space-y-1">
                      <Label className="text-xs">Fotoğraf <span className="text-muted-foreground font-normal">(isteğe bağlı)</span></Label>
                      <PhotoPicker value={editItem.photoUrl} onChange={v => setEditItem(p => ({ ...p, photoUrl: v }))} testIdPrefix={`sample-item-edit-photo-${item.id}`} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-xl h-8" onClick={() => submitEdit(item.id)} disabled={updateM.isPending}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl h-8" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    {(item.hasPhoto ?? !!item.photoUrl) && (
                      <LazyImage
                        src={`/api/photo/sample_items/${item.id}/photoUrl`}
                        hasPhoto
                        alt={item.name}
                        containerClassName="relative w-16 h-16 rounded-xl shrink-0 border border-border/50 overflow-hidden bg-muted/20"
                        className="w-16 h-16 object-cover"
                        data-testid={`img-sample-item-${item.id}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                          item.category === 'Kumaş' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-muted text-muted-foreground')}>
                          {item.category === 'Kumaş' ? <Layers className="w-2.5 h-2.5" /> : <Package className="w-2.5 h-2.5" />}{item.category}
                        </span>
                        {item.fabricType && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate">{item.fabricType}</span>
                        )}
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">×{item.unitQuantity}</span>
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{item.description}</p>}
                    </div>
                    {!readonly && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="rounded-xl h-8 w-8" onClick={async () => {
                          setEditingId(item.id);
                          let existingPhoto = item.photoUrl || '';
                          if (!existingPhoto && (item.hasPhoto)) {
                            try {
                              const res = await fetch(`/api/photo/sample_items/${item.id}/photoUrl?json=1`, { credentials: 'include' });
                              if (res.ok) {
                                const data = await res.json();
                                existingPhoto = data?.photoUrl || '';
                              }
                            } catch {}
                          }
                          setEditItem({
                            name: item.name, unitQuantity: String(item.unitQuantity),
                            category: (item.category as 'Kumaş' | 'Diğer') || 'Diğer',
                            fabricType: item.fabricType || '', description: item.description || '',
                            photoUrl: existingPhoto,
                          });
                        }} data-testid={`button-edit-sample-item-${item.id}`}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="rounded-xl h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteM.mutate(item.id)} data-testid={`button-delete-sample-item-${item.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!photoReminderFor} onOpenChange={(o) => { if (!o) setPhotoReminderFor(null); }}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Fotoğraf eklemek ister misiniz?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>"{photoReminderFor?.name}"</strong> içeriği kaydedildi ancak fotoğraf eklenmedi.
            Görsel referans için fotoğraf ekleyebilirsiniz <span className="text-muted-foreground/80">(isteğe bağlı)</span>.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setPhotoReminderFor(null)} data-testid="button-skip-photo-reminder">
              Şimdi Değil
            </Button>
            <Button className="flex-1 rounded-xl gap-1.5" onClick={() => {
              const it = photoReminderFor!;
              setEditingId(it.id);
              setEditItem({
                name: it.name, unitQuantity: String(it.unitQuantity),
                category: (it.category as 'Kumaş' | 'Diğer') || 'Diğer',
                fabricType: it.fabricType || '', description: it.description || '',
                photoUrl: it.photoUrl || '',
              });
              setPhotoReminderFor(null);
            }} data-testid="button-add-photo-reminder">
              <ImageIcon className="w-4 h-4" /> Fotoğraf Ekle
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function SampleDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const isManager = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: sevkiyatData } = useQuery<{ record: { id: number } | null }>({
    queryKey: ['/api/samples', id, 'sevkiyat'],
    queryFn: () => fetch(`/api/samples/${id}/sevkiyat`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });
  const existingShipmentRecordId = sevkiyatData?.record?.id ?? null;

  const sevkiyatM = useMutation({
    mutationFn: () => apiRequest('POST', `/api/samples/${id}/sevkiyat`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['/api/samples', id, 'sevkiyat'] });
      qc.invalidateQueries({ queryKey: ['/api/shipments'] });
      qc.invalidateQueries({ queryKey: ['/api/records'] });
      toast({
        title: data?.alreadyExists ? 'Sevkiyat zaten var' : 'Sevkiyata eklendi',
        description: 'Numune sipariş olarak sevkiyat listesine taşındı.',
      });
      const recId = data?.record?.id;
      if (recId) setLocation(`/records/${recId}`);
    },
    onError: (e: any) => toast({ title: 'Hata', description: e?.message || 'Sevkiyat oluşturulamadı', variant: 'destructive' }),
  });

  const { data: sample, isLoading } = useQuery<Sample>({
    queryKey: ['/api/samples', id],
    queryFn: () => fetch(`/api/samples/${id}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });

  const deleteSample = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/samples/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/samples'] });
      toast({ title: 'Numune silindi' });
      window.location.href = '/numuneler';
    },
    onError: () => toast({ title: 'Silinemedi', variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!sample) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <FlaskConical className="w-12 h-12 opacity-40" />
        <p>Numune bulunamadı.</p>
        <Link href="/numuneler"><Button variant="outline" className="rounded-xl">Listeye Dön</Button></Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 sm:px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/numuneler">
            <Button variant="ghost" size="icon" className="rounded-xl shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl shrink-0">
              <FlaskConical className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-display font-bold line-clamp-1">{sample.title}</h1>
          </div>
        </div>
        {isManager && (
          <div className="flex items-center gap-2 shrink-0">
            {existingShipmentRecordId ? (
              <Link href={`/records/${existingShipmentRecordId}`}>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5 border-emerald-400/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30" data-testid="button-view-sample-shipment">
                  <Truck className="w-4 h-4" /> Sevkiyatı Görüntüle
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 border-emerald-400/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                onClick={() => sevkiyatM.mutate()} disabled={sevkiyatM.isPending} data-testid="button-create-sample-shipment">
                {sevkiyatM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Sevkiyata Ekle
              </Button>
            )}
            <Link href={`/numuneler/${id}/edit`}>
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5" data-testid="button-edit-sample">
                <Edit className="w-4 h-4" /> Düzenle
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              onClick={() => setDeleteOpen(true)} data-testid="button-delete-sample">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
            <div className="p-6 bg-muted/20 border-b">
              <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-primary" /> Numune Bilgileri
              </h3>
            </div>
            <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {sample.customer && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Müşteri</span>
                  {isManager ? (
                    <Link
                      href={`/musteri-kutuphanesi?q=${encodeURIComponent(sample.customer)}`}
                      className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1 w-fit"
                      data-testid="link-sample-customer"
                    >
                      {sample.customer}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </Link>
                  ) : (
                    <span className="text-sm font-medium" data-testid="text-sample-customer">{sample.customer}</span>
                  )}
                </div>
              )}
              {sample.lotNumber && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Lot Numarası</span>
                  <span className="text-sm font-mono font-medium" data-testid="text-sample-lot">{sample.lotNumber}</span>
                </div>
              )}
              {sample.referenceId && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />Referans No</span>
                  <span className="text-sm font-mono font-medium" data-testid="text-sample-ref">{sample.referenceId}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Eklenme Tarihi</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(sample.createdAt!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              {sample.notes && (
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Notlar</span>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sample.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <SampleItemsSection sampleId={id} readonly={!isManager} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <PhotoAlbum sampleId={id} />
        </motion.div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Numuneyi Sil</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>"{sample.title}"</strong> numunesini ve tüm fotoğraflarını kalıcı olarak silmek istediğinizden emin misiniz?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteOpen(false)}>İptal</Button>
            <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => deleteSample.mutate()}
              disabled={deleteSample.isPending} data-testid="button-confirm-delete-sample">
              {deleteSample.isPending ? 'Siliniyor...' : 'Sil'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
