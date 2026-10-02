import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useRecord, useCreateRecord, useUpdateRecord } from '@/hooks/use-records';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ImageUpload } from '@/components/image-upload';
import { ArrowLeft, Save, Loader2, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Sample } from '@shared/schema';
import { OrderItemsSection } from '@/components/order-items-section';
import { CustomerInput } from '@/components/customer-input';
import { OrderTitleInput } from '@/components/order-title-input';
import { PendingItemsSection, type PendingItem } from '@/components/pending-items-section';
import { useOrderTitleLibrary } from '@/hooks/use-order-title-library';
import { normalizeForSearch } from '@/lib/utils';

export default function RecordForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEdit = !!id;
  const queryClient = useQueryClient();

  const { data: record, isLoading: isLoadingRecord } = useRecord(isEdit ? Number(id) : 0);
  const createMutation = useCreateRecord();
  const updateMutation = useUpdateRecord();
  const { data: titleLibrary = [] } = useOrderTitleLibrary();

  const [clientUpdatedAt, setClientUpdatedAt] = useState<string | undefined>(undefined);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    totalQuantity: '',
    itemsPerBox: '',
    status: 'pending',
    lotNumber: '',
    referenceId: '',
    priority: 'normal',
    customer: '',
    orderDate: new Date().toISOString().split('T')[0],
    photoUrl: null as string | null,
    photoThumbUrl: null as string | null,
    pastalPhotoUrl: null as string | null,
    pastalPhotoThumbUrl: null as string | null,
    urunIslemPhotoUrl: null as string | null,
    urunIslemPhotoThumbUrl: null as string | null,
    katlamaPhotoUrl: null as string | null,
    katlamaPhotoThumbUrl: null as string | null,
    setToplamaPhotoUrl: null as string | null,
    setToplamaPhotoThumbUrl: null as string | null,
    kolilemePhotoUrl: null as string | null,
    kolilemePhotoThumbUrl: null as string | null,
    sevkiyatPhotoUrl: null as string | null,
    sevkiyatPhotoThumbUrl: null as string | null,
    sterilizasyonPhotoUrl: null as string | null,
    sterilizasyonPhotoThumbUrl: null as string | null,
    sampleId: '' as string,
    waitingNote: '',
    orderType: 'musteri' as string,
  });

  const { data: samples = [] } = useQuery<Sample[]>({
    queryKey: ['/api/samples'],
    queryFn: () => fetch('/api/samples', { credentials: 'include' }).then(r => r.json()),
  });

  useEffect(() => {
    if (isEdit && record) {
      setClientUpdatedAt(record.updatedAt ? new Date(record.updatedAt).toISOString() : undefined);
      setFormData({
        title: record.title,
        description: record.description || '',
        totalQuantity: String(record.totalQuantity),
        itemsPerBox: String(record.itemsPerBox || 1),
        status: record.status,
        lotNumber: record.lotNumber || '',
        referenceId: record.referenceId || '',
        priority: record.priority || 'normal',
        customer: record.customer || '',
        orderDate: record.orderDate ? new Date(record.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        photoUrl: record.photoUrl,
        photoThumbUrl: (record as any).photoThumbUrl || null,
        pastalPhotoUrl: record.pastalPhotoUrl || null,
        pastalPhotoThumbUrl: (record as any).pastalPhotoThumbUrl || null,
        urunIslemPhotoUrl: record.urunIslemPhotoUrl || null,
        urunIslemPhotoThumbUrl: (record as any).urunIslemPhotoThumbUrl || null,
        katlamaPhotoUrl: record.katlamaPhotoUrl || null,
        katlamaPhotoThumbUrl: (record as any).katlamaPhotoThumbUrl || null,
        setToplamaPhotoUrl: record.setToplamaPhotoUrl || null,
        setToplamaPhotoThumbUrl: (record as any).setToplamaPhotoThumbUrl || null,
        kolilemePhotoUrl: record.kolilemePhotoUrl || null,
        kolilemePhotoThumbUrl: (record as any).kolilemePhotoThumbUrl || null,
        sevkiyatPhotoUrl: record.sevkiyatPhotoUrl || null,
        sevkiyatPhotoThumbUrl: (record as any).sevkiyatPhotoThumbUrl || null,
        sterilizasyonPhotoUrl: (record as any).sterilizasyonPhotoUrl || null,
        sterilizasyonPhotoThumbUrl: (record as any).sterilizasyonPhotoThumbUrl || null,
        sampleId: record.sampleId != null ? String(record.sampleId) : '',
        waitingNote: (record as any).waitingNote || '',
        orderType: (record as any).orderType || 'musteri',
      });
    }
  }, [record, isEdit]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSubmit = {
        ...formData,
        totalQuantity: parseInt(formData.totalQuantity) || 1,
        itemsPerBox: parseInt(formData.itemsPerBox) || 1,
        orderDate: new Date(formData.orderDate),
        sampleId: formData.sampleId ? parseInt(formData.sampleId) : null,
        waitingNote: formData.status === 'waiting_product' && formData.waitingNote ? formData.waitingNote : null,
      };
      if (isEdit) {
        await updateMutation.mutateAsync({ id: Number(id), clientUpdatedAt, ...dataToSubmit });
        setLocation(`/records/${id}`);
      } else {
        const created = await createMutation.mutateAsync(dataToSubmit as any);
        for (const item of pendingItems) {
          await fetch(`/api/records/${created.id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              name: item.name,
              unitQuantity: item.unitQuantity,
              category: item.category,
              fabricType: item.category === 'Kumaş' ? (item.fabricType || null) : null,
              fabricPhases: item.fabricPhases.length > 0 ? item.fabricPhases : null,
              description: item.description || null,
              stokTurHedef: item.stokTurHedef || null,
              stokAltTurHedef: item.stokAltTurHedef || null,
            }),
          });
        }

        // Auto-save title to library if it's new (not already in library)
        const trimmedTitle = formData.title.trim();
        const alreadyInLibrary = titleLibrary.some(
          e => normalizeForSearch(e.title) === normalizeForSearch(trimmedTitle)
        );
        if (trimmedTitle && !alreadyInLibrary) {
          apiRequest('POST', '/api/order-title-library', {
            title: trimmedTitle,
            referenceId: formData.referenceId.trim() || null,
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['/api/order-title-library'] });
          }).catch(() => {});
        }

        setLocation(`/records/${created.id}`);
      }
    } catch (error) {}
  };

  const phases = [
    { key: 'pastalPhotoUrl', label: 'Pastal' },
    { key: 'urunIslemPhotoUrl', label: 'Ürün İşlem' },
    { key: 'katlamaPhotoUrl', label: 'Katlama' },
    { key: 'setToplamaPhotoUrl', label: 'Set Toplama' },
    { key: 'kolilemePhotoUrl', label: 'Kolileme' },
    { key: 'sevkiyatPhotoUrl', label: 'Sevkiyat' },
    { key: 'sterilizasyonPhotoUrl', label: 'Sterilizasyon Biformu' },
  ];

  if (isEdit && isLoadingRecord) return <div className="p-8 text-center"><Loader2 className="animate-spin inline mr-2" />Yükleniyor...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-display font-bold">
            {isEdit ? 'Siparişi Düzenle' : 'Yeni Sipariş'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEdit ? 'Mevcut sipariş detaylarını güncelleyin.' : 'Sisteme yeni bir sipariş girişi yapın.'}
          </p>
        </div>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="space-y-6"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT') {
              e.preventDefault();
              const form = e.currentTarget;
              const focusable = Array.from(
                form.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
              );
              const idx = focusable.indexOf(target);
              if (idx !== -1 && idx < focusable.length - 1) {
                focusable[idx + 1].focus();
              }
            }
          }
        }}
      >
        <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
          <div className="bg-primary/5 p-6 border-b">
            <h2 className="text-lg font-semibold mb-4 text-center">Genel Ürün Görseli</h2>
            <ImageUpload value={formData.photoUrl} onChange={(base64, thumb) => setFormData(p => ({ ...p, photoUrl: base64, photoThumbUrl: thumb ?? null }))} />
          </div>

          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-base font-semibold">Sipariş Başlığı</Label>
                <OrderTitleInput
                  value={formData.title}
                  onChange={v => setFormData(p => ({ ...p, title: v }))}
                  onPick={(title, referenceId) => setFormData(p => ({ ...p, title, referenceId }))}
                  currentReferenceId={formData.referenceId}
                  placeholder="Örn: 2024 Yaz Sezonu - Tişört"
                  testId="input-record-title"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Lot No</Label>
                <Input placeholder="Örn: LOT-123" className="h-12 rounded-xl" value={formData.lotNumber} onChange={e => setFormData(p => ({ ...p, lotNumber: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Referans ID</Label>
                <Input placeholder="Örn: REF-456" className="h-12 rounded-xl" value={formData.referenceId} onChange={e => setFormData(p => ({ ...p, referenceId: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Sipariş Türü</Label>
                <Select value={formData.orderType} onValueChange={(val) => setFormData(p => ({ ...p, orderType: val }))}>
                  <SelectTrigger className={`h-12 rounded-xl ${formData.orderType === 'stok' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : ''}`} data-testid="select-order-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="musteri">Müşteri Siparişi</SelectItem>
                    <SelectItem value="stok">Stok Üretimi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.orderType !== 'stok' && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Sipariş Veren Müşteri</Label>
                  <CustomerInput
                    value={formData.customer}
                    onChange={v => setFormData(p => ({ ...p, customer: v }))}
                    placeholder="Müşteri Adı"
                    testId="input-record-customer"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-base font-semibold">Sipariş Tarihi</Label>
                <Input type="date" className="h-12 rounded-xl" value={formData.orderDate} onChange={e => setFormData(p => ({ ...p, orderDate: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Öncelik</Label>
                <Select value={formData.priority} onValueChange={(val) => setFormData(p => ({ ...p, priority: val }))}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acil">Acil</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="pasif">Pasif</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Durum</Label>
                <Select value={formData.status} onValueChange={(val) => setFormData(p => ({ ...p, status: val, waitingNote: val !== 'waiting_product' ? '' : p.waitingNote }))}>
                  <SelectTrigger className={`h-12 rounded-xl ${formData.status === 'waiting_product' ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Beklemede</SelectItem>
                    <SelectItem value="in_progress">Devam Ediyor</SelectItem>
                    <SelectItem value="completed">Tamamlandı</SelectItem>
                    <SelectItem value="waiting_product">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                        Ürün Bekleniyor
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.status === 'waiting_product' && (
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-base font-semibold text-purple-700 dark:text-purple-300">
                    Beklenen Ürün / Açıklama
                    <span className="ml-1 text-destructive">*</span>
                  </Label>
                  <Textarea
                    required
                    placeholder="Hangi ürün bekleniyor? Eksik olan nedir? Açıklayın..."
                    className="min-h-[100px] rounded-xl border-purple-300 focus-visible:ring-purple-400 bg-purple-50/50 dark:bg-purple-900/10"
                    value={formData.waitingNote}
                    onChange={e => setFormData(p => ({ ...p, waitingNote: e.target.value }))}
                    data-testid="textarea-waiting-note"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-base font-semibold">Toplam Adet</Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  className="h-12 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={formData.totalQuantity}
                  onChange={e => setFormData(p => ({ ...p, totalQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                  onBlur={e => { if (!e.target.value || e.target.value === '0') setFormData(p => ({ ...p, totalQuantity: '1' })); }}
                  data-testid="input-total-quantity"
                />
              </div>

              {formData.orderType !== 'stok' && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Koli İçi Adet</Label>
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    className="h-12 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={formData.itemsPerBox}
                    onChange={e => setFormData(p => ({ ...p, itemsPerBox: e.target.value.replace(/[^0-9]/g, '') }))}
                    onBlur={e => { if (!e.target.value || e.target.value === '0') setFormData(p => ({ ...p, itemsPerBox: '1' })); }}
                    data-testid="input-items-per-box"
                  />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label className="text-base font-semibold">Açıklama</Label>
                <Textarea placeholder="Notlar veya ek bilgiler..." className="min-h-[100px] rounded-xl" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  Sipariş Numunesi
                  <span className="text-xs font-normal text-muted-foreground">(opsiyonel)</span>
                </Label>
                <Select
                  value={formData.sampleId || '__none__'}
                  onValueChange={(val) => setFormData(p => ({ ...p, sampleId: val === '__none__' ? '' : val }))}
                >
                  <SelectTrigger className="h-12 rounded-xl" data-testid="select-sample">
                    <SelectValue placeholder="Numune seç..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Numune seçilmedi —</SelectItem>
                    {samples.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.title}{s.lotNumber ? ` · ${s.lotNumber}` : ''}{s.customer ? ` · ${s.customer}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {phases.map((phase) => (
              <Card key={phase.key} className="glass-card border-none shadow-md rounded-2xl p-6">
                <Label className="text-base font-semibold block mb-4 text-center">{phase.label} Fotoğrafı</Label>
                <ImageUpload
                  value={(formData as any)[phase.key]}
                  onChange={(base64, thumb) => {
                    const thumbKey = phase.key.replace(/PhotoUrl$/, 'PhotoThumbUrl');
                    setFormData(p => ({ ...p, [phase.key]: base64, [thumbKey]: thumb ?? null } as typeof p));
                  }}
                />
              </Card>
            ))}
          </div>
        )}

        {isEdit ? (
          <OrderItemsSection
            recordId={Number(id)}
            totalQuantity={parseInt(formData.totalQuantity) || 0}
            itemsPerBox={parseInt(formData.itemsPerBox) || 1}
            orderType={formData.orderType}
          />
        ) : (
          <PendingItemsSection
            items={pendingItems}
            onChange={setPendingItems}
            totalQuantity={parseInt(formData.totalQuantity) || 0}
            orderType={formData.orderType}
          />
        )}

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()} className="rounded-xl px-6 h-12">İptal</Button>
          <Button type="submit" disabled={isPending} className="rounded-xl px-8 h-12">
            {isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {isEdit ? 'Güncelle' : 'Kaydet'}
          </Button>
        </div>
      </motion.form>
    </div>
  );
}
