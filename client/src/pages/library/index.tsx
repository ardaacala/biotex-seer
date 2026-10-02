import { useState } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useItemLibrary, useCreateItemLibraryEntry, useUpdateItemLibraryEntry, useDeleteItemLibraryEntry } from '@/hooks/use-item-library';
import { BookOpen, Plus, Edit2, Trash2, Check, X, Loader2, Package, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
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
} from '@/components/ui/alert-dialog';
import type { ItemLibraryEntry } from '@shared/schema';

const CATEGORIES = ['Kumaş', 'Diğer'] as const;

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      category === 'Kumaş'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        : 'bg-muted text-muted-foreground'
    }`}>
      {category}
    </span>
  );
}

const ALL_FABRIC_PHASES = ['pastal', 'urun_islem', 'katlama'] as const;
const FABRIC_PHASE_LABELS: Record<string, string> = {
  pastal: 'Pastal',
  urun_islem: 'Ürün İşlem',
  katlama: 'Katlama',
};

const EMPTY_NEW = { name: '', defaultUnitQuantity: '1', description: '', category: 'Diğer', fabricType: '', fabricPhases: [] as string[] };

export default function ItemLibraryPage() {
  const { data: library, isLoading } = useItemLibrary();
  const createMutation = useCreateItemLibraryEntry();
  const updateMutation = useUpdateItemLibraryEntry();
  const deleteMutation = useDeleteItemLibraryEntry();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [newEntry, setNewEntry] = useState(EMPTY_NEW);
  const [editEntry, setEditEntry] = useState({ name: '', defaultUnitQuantity: '1', description: '', category: 'Diğer', fabricType: '', fabricPhases: [...ALL_FABRIC_PHASES] as string[] });

  const filtered = library?.filter(e => normalizeForSearch(e.name).includes(normalizeForSearch(search))) || [];

  const handleCreate = async () => {
    if (!newEntry.name.trim()) return;
    await createMutation.mutateAsync({
      name: newEntry.name.trim(),
      defaultUnitQuantity: parseInt(newEntry.defaultUnitQuantity) || 1,
      description: newEntry.description.trim() || undefined,
      category: newEntry.category as 'Kumaş' | 'Diğer',
      fabricType: newEntry.category === 'Kumaş' ? (newEntry.fabricType.trim() || undefined) : null,
    });
    setNewEntry(EMPTY_NEW);
    setShowForm(false);
  };

  const handleStartEdit = (entry: ItemLibraryEntry) => {
    setEditingId(entry.id);
    setEditEntry({
      name: entry.name,
      defaultUnitQuantity: String(entry.defaultUnitQuantity),
      description: entry.description || '',
      category: entry.category || 'Diğer',
      fabricType: entry.fabricType || '',
      fabricPhases: [...ALL_FABRIC_PHASES],
    });
  };

  const handleUpdate = async (id: number) => {
    await updateMutation.mutateAsync({
      id,
      name: editEntry.name,
      defaultUnitQuantity: parseInt(editEntry.defaultUnitQuantity) || 1,
      description: editEntry.description || undefined,
      category: editEntry.category as 'Kumaş' | 'Diğer',
      fabricType: editEntry.category === 'Kumaş' ? (editEntry.fabricType.trim() || undefined) : null,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary" />
            İçerik Kütüphanesi
          </h1>
          <p className="text-muted-foreground mt-1">Sık kullanılan kalemleri buradan yönetin, sipariş oluştururken kolayca ekleyin.</p>
        </div>
        <Button className="rounded-xl" onClick={() => setShowForm(!showForm)} data-testid="button-add-library-entry">
          <Plus className="w-4 h-4 mr-2" />
          Yeni Kalem
        </Button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-card border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-primary/5 border-b px-6 py-4">
              <CardTitle className="text-base font-semibold">Yeni Kalem Ekle</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-2">
                  <Label>Kalem Adı *</Label>
                  <Input
                    placeholder="Örn: Düğme, Fermuar, Etiket..."
                    className="h-11 rounded-xl"
                    value={newEntry.name}
                    onChange={e => setNewEntry(p => ({ ...p, name: e.target.value }))}
                    data-testid="input-library-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sınıf</Label>
                  <Select
                    value={newEntry.category}
                    onValueChange={v => setNewEntry(p => ({ ...p, category: v, fabricType: v === 'Diğer' ? '' : p.fabricType }))}
                  >
                    <SelectTrigger className="h-11 rounded-xl" data-testid="select-library-category">
                      <Layers className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newEntry.category === 'Kumaş' && (
                  <div className="sm:col-span-2 space-y-3">
                    <div className="space-y-2">
                      <Label>Kumaş Türü (isteğe bağlı)</Label>
                      <Input
                        placeholder="Örn: Dokuma, Örme, Non-woven..."
                        className="h-11 rounded-xl"
                        value={newEntry.fabricType}
                        onChange={e => setNewEntry(p => ({ ...p, fabricType: e.target.value }))}
                        data-testid="input-library-fabric-type"
                      />
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Anlık Üretim'de takip edilecek fazlar</p>
                      </div>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-2">Bu seçim kütüphane kaydına değil, sipariş kalemlerine uygulanır.</p>
                      <div className="flex flex-wrap gap-3">
                        {ALL_FABRIC_PHASES.map(phase => {
                          const isChecked = newEntry.fabricPhases.includes(phase);
                          const isLast = isChecked && newEntry.fabricPhases.length === 1;
                          return (
                            <label key={phase} className={`flex items-center gap-1.5 select-none ${isLast ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                              <input
                                type="checkbox"
                                className="accent-blue-600 w-3.5 h-3.5"
                                checked={isChecked}
                                disabled={isLast}
                                onChange={e => {
                                  const phases = e.target.checked
                                    ? [...newEntry.fabricPhases, phase]
                                    : newEntry.fabricPhases.filter(p => p !== phase);
                                  if (phases.length > 0) setNewEntry(prev => ({ ...prev, fabricPhases: phases }));
                                }}
                                data-testid={`checkbox-library-new-phase-${phase}`}
                              />
                              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{FABRIC_PHASE_LABELS[phase]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Varsayılan Birim/Adet</Label>
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="h-11 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={newEntry.defaultUnitQuantity}
                    onChange={e => setNewEntry(p => ({ ...p, defaultUnitQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                    onBlur={e => { if (!e.target.value || e.target.value === '0') setNewEntry(p => ({ ...p, defaultUnitQuantity: '1' })); }}
                    data-testid="input-library-quantity"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Açıklama (isteğe bağlı)</Label>
                  <Textarea
                    placeholder="Kalem hakkında notlar..."
                    className="rounded-xl"
                    value={newEntry.description}
                    onChange={e => setNewEntry(p => ({ ...p, description: e.target.value }))}
                    data-testid="input-library-description"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <Button onClick={handleCreate} disabled={createMutation.isPending || !newEntry.name.trim()} className="rounded-xl" data-testid="button-save-library-entry">
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Kaydet
                </Button>
                <Button variant="ghost" className="rounded-xl" onClick={() => { setShowForm(false); setNewEntry(EMPTY_NEW); }}>
                  <X className="w-4 h-4 mr-2" />
                  İptal
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Card className="glass-card border-none shadow-lg rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5 border-b px-6 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Kayıtlı Kalemler
            {library && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">{library.length}</span>}
          </CardTitle>
          <div className="w-48 md:w-64">
            <Input
              placeholder="Kalem ara..."
              className="h-9 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-library-search"
            />
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{search ? 'Arama sonucu bulunamadı.' : 'Kütüphane boş.'}</p>
            <p className="text-sm mt-1">Sipariş kalemi eklerken seçtiğiniz kalemler otomatik olarak buraya eklenir.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="px-6 py-2 bg-muted/20 hidden sm:grid sm:grid-cols-12 gap-2 text-xs text-muted-foreground uppercase font-semibold">
              <div className="col-span-3">Kalem Adı</div>
              <div className="col-span-2">Sınıf</div>
              <div className="col-span-2 text-center">Birim/Adet</div>
              <div className="col-span-3">Açıklama</div>
              <div className="col-span-2 text-center">Ekleme Tarihi</div>
            </div>
            {filtered.map((entry, idx) => (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="px-6 py-4" data-testid={`library-row-${entry.id}`}>
                {editingId === entry.id ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    <div className="sm:col-span-3 space-y-1">
                      <Input className="h-9 rounded-xl text-sm" value={editEntry.name} onChange={e => setEditEntry(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <Select
                        value={editEntry.category}
                        onValueChange={v => setEditEntry(p => ({ ...p, category: v, fabricType: v === 'Diğer' ? '' : p.fabricType }))}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editEntry.category === 'Kumaş' && (
                        <>
                          <Input
                            placeholder="Kumaş türü..."
                            className="h-8 rounded-xl text-xs mt-1"
                            value={editEntry.fabricType}
                            onChange={e => setEditEntry(p => ({ ...p, fabricType: e.target.value }))}
                            data-testid={`input-edit-library-fabric-type-${entry.id}`}
                          />
                          <div className="mt-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-2.5 py-2">
                            <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">Takip edilecek fazlar</p>
                            <p className="text-[9px] text-blue-400 dark:text-blue-500 mb-1.5">Sipariş kalemlerine uygulanır, kütüphaneye kaydedilmez.</p>
                            <div className="flex flex-col gap-1">
                              {ALL_FABRIC_PHASES.map(phase => {
                                const isChecked = editEntry.fabricPhases.includes(phase);
                                const isLast = isChecked && editEntry.fabricPhases.length === 1;
                                return (
                                  <label key={phase} className={`flex items-center gap-1.5 select-none ${isLast ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                    <input
                                      type="checkbox"
                                      className="accent-blue-600 w-3 h-3"
                                      checked={isChecked}
                                      disabled={isLast}
                                      onChange={e => {
                                        const phases = e.target.checked
                                          ? [...editEntry.fabricPhases, phase]
                                          : editEntry.fabricPhases.filter(p => p !== phase);
                                        if (phases.length > 0) setEditEntry(prev => ({ ...prev, fabricPhases: phases }));
                                      }}
                                      data-testid={`checkbox-edit-library-phase-${phase}-${entry.id}`}
                                    />
                                    <span className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">{FABRIC_PHASE_LABELS[phase]}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-9 rounded-xl text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={editEntry.defaultUnitQuantity}
                        onChange={e => setEditEntry(p => ({ ...p, defaultUnitQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                        onBlur={e => { if (!e.target.value || e.target.value === '0') setEditEntry(p => ({ ...p, defaultUnitQuantity: '1' })); }}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Textarea placeholder="Açıklama..." className="rounded-xl min-h-[60px] text-sm" value={editEntry.description} onChange={e => setEditEntry(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2 flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-green-600" onClick={() => handleUpdate(entry.id)} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-9 sm:col-span-3">
                      <p className="font-semibold">{entry.name}</p>
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <div className="flex flex-col gap-0.5">
                        <CategoryBadge category={entry.category || 'Diğer'} />
                        {entry.category === 'Kumaş' && entry.fabricType && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium pl-1 truncate max-w-[96px]">
                            {entry.fabricType}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-2 sm:text-center">
                      <span className="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{entry.defaultUnitQuantity} adet</span>
                    </div>
                    <div className="col-span-8 sm:col-span-3 text-sm text-muted-foreground truncate">
                      {entry.description || <span className="italic opacity-50">Açıklama yok</span>}
                    </div>
                    <div className="col-span-12 sm:col-span-2 flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {entry.createdAt ? format(new Date(entry.createdAt), 'dd.MM.yy') : ''}
                      </span>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={() => handleStartEdit(entry)} data-testid={`button-edit-library-${entry.id}`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive" data-testid={`button-delete-library-${entry.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Kalem silinsin mi?</AlertDialogTitle>
                            <AlertDialogDescription>"{entry.name}" kalemi kütüphaneden silinecek. Mevcut sipariş kalemleri etkilenmez.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">İptal</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(entry.id)} className="bg-destructive rounded-xl">Sil</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
