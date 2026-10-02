import { useState, useEffect, useRef } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useOrderTitleLibrary, useCreateOrderTitle, useUpdateOrderTitle, useDeleteOrderTitle,
} from '@/hooks/use-order-title-library';
import { BookMarked, Plus, Edit2, Trash2, Check, X, Loader2, Tag } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import type { OrderTitleLibraryEntry } from '@shared/schema';

const EMPTY_NEW = { title: '', referenceId: '' };

export default function OrderTitleLibraryPage() {
  const { user } = useAuth();
  const isManager = !!user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);

  const { data: library, isLoading } = useOrderTitleLibrary();
  const createMutation = useCreateOrderTitle();
  const updateMutation = useUpdateOrderTitle();
  const deleteMutation = useDeleteOrderTitle();

  const [location] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [newEntry, setNewEntry] = useState(EMPTY_NEW);
  const [editEntry, setEditEntry] = useState(EMPTY_NEW);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(qs);
    const q = params.get('q');
    if (q) setSearch(q);
  }, [location]);

  useEffect(() => {
    if (!library || library.length === 0) return;
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(qs);
    const q = normalizeForSearch((params.get('q') || '').trim());
    if (!q) { setHighlightId(null); return; }
    const match = library.find(e => normalizeForSearch(e.title) === q);
    if (match) {
      setHighlightId(match.id);
      setTimeout(() => {
        rowRefs.current[match.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      const t = setTimeout(() => setHighlightId(null), 2400);
      return () => clearTimeout(t);
    }
  }, [library, location]);

  const filtered = library?.filter(e => {
    const q = normalizeForSearch(search);
    return (
      normalizeForSearch(e.title).includes(q) ||
      (e.referenceId && normalizeForSearch(e.referenceId).includes(q))
    );
  }) || [];

  const handleCreate = async () => {
    if (!newEntry.title.trim()) return;
    try {
      await createMutation.mutateAsync({
        title: newEntry.title.trim(),
        referenceId: newEntry.referenceId.trim() || null,
      });
      setNewEntry(EMPTY_NEW);
      setShowForm(false);
    } catch {}
  };

  const handleStartEdit = (entry: OrderTitleLibraryEntry) => {
    setEditingId(entry.id);
    setEditEntry({
      title: entry.title,
      referenceId: entry.referenceId || '',
    });
  };

  const handleUpdate = async (id: number) => {
    if (!editEntry.title.trim()) return;
    try {
      await updateMutation.mutateAsync({
        id,
        title: editEntry.title.trim(),
        referenceId: editEntry.referenceId.trim() || null,
      });
      setEditingId(null);
    } catch {}
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <BookMarked className="w-8 h-8 text-primary" />
            Başlık Kütüphanesi
          </h1>
          <p className="text-muted-foreground mt-1">
            Sık kullanılan sipariş başlıklarını ve referans kodlarını buradan yönetin.
          </p>
        </div>
        {isManager && (
          <Button
            className="rounded-xl"
            onClick={() => setShowForm(!showForm)}
            data-testid="button-add-order-title"
          >
            <Plus className="w-4 h-4 mr-2" />
            Yeni Başlık
          </Button>
        )}
      </div>

      {showForm && isManager && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-card border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-primary/5 border-b px-6 py-4">
              <CardTitle className="text-base font-semibold">Yeni Sipariş Başlığı Ekle</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Başlık *</Label>
                  <Input
                    placeholder="Örn: Artroskopi Set"
                    className="h-11 rounded-xl"
                    value={newEntry.title}
                    onChange={e => setNewEntry(p => ({ ...p, title: e.target.value }))}
                    data-testid="input-new-order-title"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Referans Kodu</Label>
                  <Input
                    placeholder="Örn: Fn 804 (isteğe bağlı)"
                    className="h-11 rounded-xl"
                    value={newEntry.referenceId}
                    onChange={e => setNewEntry(p => ({ ...p, referenceId: e.target.value }))}
                    data-testid="input-new-order-title-ref"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newEntry.title.trim()}
                  className="rounded-xl"
                  data-testid="button-save-order-title"
                >
                  {createMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <Check className="w-4 h-4 mr-2" />}
                  Kaydet
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => { setShowForm(false); setNewEntry(EMPTY_NEW); }}
                >
                  <X className="w-4 h-4 mr-2" />
                  İptal
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Card className="glass-card border-none shadow-lg rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5 border-b px-6 py-4 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Kayıtlı Başlıklar
            {library && (
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                {library.length}
              </span>
            )}
          </CardTitle>
          <div className="w-48 md:w-64">
            <Input
              placeholder="Başlık veya referans ara..."
              className="h-9 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-order-title-library-search"
            />
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <BookMarked className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{search ? 'Arama sonucu bulunamadı.' : 'Henüz başlık eklenmedi.'}</p>
            {!search && (
              <p className="text-sm mt-1">
                Sipariş oluştururken eklediğiniz başlıklar burada toplanır veya yukarıdan manuel ekleyin.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((entry, idx) => (
              <motion.div
                key={entry.id}
                ref={(el: HTMLDivElement | null) => { rowRefs.current[entry.id] = el; }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`px-6 py-4 transition-colors duration-700 ${highlightId === entry.id ? 'bg-primary/10 ring-2 ring-primary/40' : ''}`}
                data-testid={`order-title-row-${entry.id}`}
              >
                {editingId === entry.id ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      className="h-9 rounded-xl text-sm sm:col-span-2"
                      placeholder="Başlık"
                      value={editEntry.title}
                      onChange={e => setEditEntry(p => ({ ...p, title: e.target.value }))}
                      data-testid={`input-edit-order-title-${entry.id}`}
                    />
                    <Input
                      className="h-9 rounded-xl text-sm sm:col-span-2"
                      placeholder="Referans kodu"
                      value={editEntry.referenceId}
                      onChange={e => setEditEntry(p => ({ ...p, referenceId: e.target.value }))}
                      data-testid={`input-edit-order-title-ref-${entry.id}`}
                    />
                    <div className="sm:col-span-2 flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 rounded-lg text-green-600"
                        onClick={() => handleUpdate(entry.id)}
                        disabled={updateMutation.isPending || !editEntry.title.trim()}
                        data-testid={`button-save-edit-order-title-${entry.id}`}
                      >
                        {updateMutation.isPending
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 rounded-lg"
                        onClick={() => setEditingId(null)}
                        data-testid={`button-cancel-edit-order-title-${entry.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-base" data-testid={`text-order-title-${entry.id}`}>
                        {entry.title}
                      </p>
                      {entry.referenceId && (
                        <p className="text-xs text-muted-foreground font-mono" data-testid={`text-order-title-ref-${entry.id}`}>
                          Ref: {entry.referenceId}
                        </p>
                      )}
                    </div>
                    {isManager && (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-muted-foreground hidden sm:block mr-1">
                          {entry.createdAt ? format(new Date(entry.createdAt), 'dd.MM.yy') : ''}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => handleStartEdit(entry)}
                          data-testid={`button-edit-order-title-${entry.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive"
                              data-testid={`button-delete-order-title-${entry.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Başlık silinsin mi?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{entry.title}" kütüphaneden silinecek. Mevcut siparişlerin başlıkları etkilenmez.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">İptal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(entry.id)}
                                className="bg-destructive rounded-xl"
                                data-testid={`button-confirm-delete-order-title-${entry.id}`}
                              >
                                Sil
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
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
