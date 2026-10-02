import { useState, useEffect, useRef } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCustomerLibrary, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
} from '@/hooks/use-customer-library';
import { BookUser, Plus, Edit2, Trash2, Check, X, Loader2, User, Phone, Mail, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import type { CustomerLibraryEntry } from '@shared/schema';

const EMPTY_NEW = { name: '', phone: '', email: '', address: '', notes: '' };

export default function CustomerLibraryPage() {
  const { user } = useAuth();
  const isManager = !!user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);

  const { data: library, isLoading } = useCustomerLibrary();
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const deleteMutation = useDeleteCustomer();

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
    const match = library.find(e => normalizeForSearch(e.name) === q);
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
      normalizeForSearch(e.name).includes(q) ||
      (e.phone && normalizeForSearch(e.phone).includes(q)) ||
      (e.email && normalizeForSearch(e.email).includes(q))
    );
  }) || [];

  const handleCreate = async () => {
    if (!newEntry.name.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: newEntry.name.trim(),
        phone: newEntry.phone.trim() || null,
        email: newEntry.email.trim() || null,
        address: newEntry.address.trim() || null,
        notes: newEntry.notes.trim() || null,
      });
      setNewEntry(EMPTY_NEW);
      setShowForm(false);
    } catch {}
  };

  const handleStartEdit = (entry: CustomerLibraryEntry) => {
    setEditingId(entry.id);
    setEditEntry({
      name: entry.name,
      phone: entry.phone || '',
      email: entry.email || '',
      address: entry.address || '',
      notes: entry.notes || '',
    });
  };

  const handleUpdate = async (id: number) => {
    try {
      await updateMutation.mutateAsync({
        id,
        name: editEntry.name.trim(),
        phone: editEntry.phone.trim() || null,
        email: editEntry.email.trim() || null,
        address: editEntry.address.trim() || null,
        notes: editEntry.notes.trim() || null,
      });
      setEditingId(null);
    } catch {}
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <BookUser className="w-8 h-8 text-primary" />
            Müşteri Kütüphanesi
          </h1>
          <p className="text-muted-foreground mt-1">
            Sık çalıştığınız müşterileri buradan yönetin, sipariş oluştururken kolayca seçin.
          </p>
        </div>
        {isManager && (
          <Button
            className="rounded-xl"
            onClick={() => setShowForm(!showForm)}
            data-testid="button-add-customer"
          >
            <Plus className="w-4 h-4 mr-2" />
            Yeni Müşteri
          </Button>
        )}
      </div>

      {showForm && isManager && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-card border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-primary/5 border-b px-6 py-4">
              <CardTitle className="text-base font-semibold">Yeni Müşteri Ekle</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Müşteri Adı *</Label>
                  <Input
                    placeholder="Örn: Acme Tekstil A.Ş."
                    className="h-11 rounded-xl"
                    value={newEntry.name}
                    onChange={e => setNewEntry(p => ({ ...p, name: e.target.value }))}
                    data-testid="input-new-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input
                    placeholder="+90 ..."
                    className="h-11 rounded-xl"
                    value={newEntry.phone}
                    onChange={e => setNewEntry(p => ({ ...p, phone: e.target.value }))}
                    data-testid="input-new-customer-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-posta</Label>
                  <Input
                    type="email"
                    placeholder="info@firma.com"
                    className="h-11 rounded-xl"
                    value={newEntry.email}
                    onChange={e => setNewEntry(p => ({ ...p, email: e.target.value }))}
                    data-testid="input-new-customer-email"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Adres</Label>
                  <Textarea
                    placeholder="İsteğe bağlı..."
                    className="rounded-xl min-h-[60px]"
                    value={newEntry.address}
                    onChange={e => setNewEntry(p => ({ ...p, address: e.target.value }))}
                    data-testid="input-new-customer-address"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Not</Label>
                  <Textarea
                    placeholder="İsteğe bağlı notlar..."
                    className="rounded-xl min-h-[50px]"
                    value={newEntry.notes}
                    onChange={e => setNewEntry(p => ({ ...p, notes: e.target.value }))}
                    data-testid="input-new-customer-notes"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newEntry.name.trim()}
                  className="rounded-xl"
                  data-testid="button-save-customer"
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
            <User className="w-5 h-5 text-primary" />
            Kayıtlı Müşteriler
            {library && (
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                {library.length}
              </span>
            )}
          </CardTitle>
          <div className="w-48 md:w-64">
            <Input
              placeholder="Müşteri ara..."
              className="h-9 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-customer-library-search"
            />
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <BookUser className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{search ? 'Arama sonucu bulunamadı.' : 'Henüz müşteri eklenmedi.'}</p>
            {!search && (
              <p className="text-sm mt-1">
                Sipariş oluştururken eklediğiniz müşteriler burada toplanır veya yukarıdan manuel ekleyin.
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
                data-testid={`customer-row-${entry.id}`}
              >
                {editingId === entry.id ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      className="h-9 rounded-xl text-sm sm:col-span-2"
                      placeholder="Müşteri adı"
                      value={editEntry.name}
                      onChange={e => setEditEntry(p => ({ ...p, name: e.target.value }))}
                    />
                    <Input
                      className="h-9 rounded-xl text-sm"
                      placeholder="Telefon"
                      value={editEntry.phone}
                      onChange={e => setEditEntry(p => ({ ...p, phone: e.target.value }))}
                    />
                    <Input
                      className="h-9 rounded-xl text-sm"
                      placeholder="E-posta"
                      type="email"
                      value={editEntry.email}
                      onChange={e => setEditEntry(p => ({ ...p, email: e.target.value }))}
                    />
                    <Textarea
                      className="rounded-xl min-h-[50px] text-sm sm:col-span-2"
                      placeholder="Adres"
                      value={editEntry.address}
                      onChange={e => setEditEntry(p => ({ ...p, address: e.target.value }))}
                    />
                    <Textarea
                      className="rounded-xl min-h-[40px] text-sm sm:col-span-2"
                      placeholder="Not"
                      value={editEntry.notes}
                      onChange={e => setEditEntry(p => ({ ...p, notes: e.target.value }))}
                    />
                    <div className="sm:col-span-2 flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 rounded-lg text-green-600"
                        onClick={() => handleUpdate(entry.id)}
                        disabled={updateMutation.isPending}
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
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-base">{entry.name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {entry.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{entry.phone}
                          </span>
                        )}
                        {entry.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />{entry.email}
                          </span>
                        )}
                        {entry.address && (
                          <span className="flex items-center gap-1 truncate max-w-[300px]">
                            <MapPin className="w-3 h-3" />{entry.address}
                          </span>
                        )}
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground italic mt-1">{entry.notes}</p>
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
                          data-testid={`button-edit-customer-${entry.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive"
                              data-testid={`button-delete-customer-${entry.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Müşteri silinsin mi?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{entry.name}" kütüphaneden silinecek. Mevcut siparişlerdeki müşteri adı etkilenmez.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">İptal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(entry.id)}
                                className="bg-destructive rounded-xl"
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
