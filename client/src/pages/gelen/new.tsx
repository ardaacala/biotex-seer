import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Loader2, ScanLine } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { PendingItemsSection, type PendingItem } from '@/components/pending-items-section';
import { BarcodeScanner, parseStokItemKodu, type BarkodKaynak } from '@/components/barcode-scanner';
import { CustomerInput } from '@/components/customer-input';
import { OrderTitleInput } from '@/components/order-title-input';
import type { StokItem } from '@shared/schema';

export default function YeniGelenSiparisPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [boundStok, setBoundStok] = useState<StokItem | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    lotNumber: '',
    referenceId: '',
    customer: '',
    totalQuantity: '',
    itemsPerBox: '1',
    description: '',
  });

  const handleScan = async (code: string, _kaynak: BarkodKaynak): Promise<boolean> => {
    const stokId = parseStokItemKodu(code);
    if (stokId == null) {
      // Tek başına lot numarası — alan içine yaz
      setFormData(p => ({ ...p, lotNumber: code.trim() }));
      toast({ title: 'Lot okundu', description: code.trim() });
      setScannerOpen(false);
      return true;
    }
    try {
      const r = await fetch(`/api/stok/${stokId}`, { credentials: 'include' });
      if (!r.ok) {
        toast({ title: 'Stok kalemi bulunamadı', description: code, variant: 'destructive' });
        return false;
      }
      const item = (await r.json()) as StokItem;
      setBoundStok(item);
      setFormData(p => ({
        ...p,
        lotNumber: item.lot ?? p.lotNumber,
      }));
      toast({
        title: 'Stok kalemine bağlandı',
        description: `${item.urunAdi}${item.lot ? ` · LOT ${item.lot}` : ''}`,
      });
      setScannerOpen(false);
      return true;
    } catch (e: any) {
      toast({ title: 'Hata', description: e?.message ?? 'Stok kalemi okunamadı', variant: 'destructive' });
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !Number(formData.totalQuantity)) {
      toast({ title: 'Sipariş adı ve toplam adet zorunludur', variant: 'destructive' });
      return;
    }
    setIsPending(true);
    try {
      const res = await apiRequest('POST', '/api/gelen', {
        title: formData.title.trim(),
        lotNumber: formData.lotNumber.trim() || null,
        referenceId: formData.referenceId.trim() || null,
        customer: formData.customer.trim() || null,
        totalQuantity: Number(formData.totalQuantity),
        itemsPerBox: Number(formData.itemsPerBox) || 1,
        description: formData.description.trim() || '',
      });
      const created = await res.json();

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
            unitPrice: item.unitPrice ?? null,
            unitPriceCurrency: item.unitPriceCurrency ?? 'TRY',
          }),
        });
      }

      toast({ title: 'Gelen sipariş oluşturuldu' });
      setLocation('/gelen');
    } catch (err: any) {
      toast({ title: 'Hata', description: err.message, variant: 'destructive' });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/gelen')} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-display font-bold">Yeni Gelen Sipariş</h1>
          <p className="text-muted-foreground mt-1">Gelen siparişi kaydedin ve içerik ekleyin.</p>
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
              if (idx !== -1 && idx < focusable.length - 1) focusable[idx + 1].focus();
            }
          }
        }}
      >
        <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-base font-semibold">Sipariş Adı *</Label>
                <OrderTitleInput
                  value={formData.title}
                  onChange={v => setFormData(p => ({ ...p, title: v }))}
                  onPick={(title, referenceId) => setFormData(p => ({ ...p, title, referenceId }))}
                  currentReferenceId={formData.referenceId}
                  placeholder="Örn: 2024 Yaz Sezonu - Tişört"
                  testId="input-gelen-new-title"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-base font-semibold">Referans ID</Label>
                <Input
                  placeholder="Örn: REF-456"
                  className="h-12 rounded-xl"
                  value={formData.referenceId}
                  onChange={e => setFormData(p => ({ ...p, referenceId: e.target.value }))}
                  data-testid="input-gelen-new-reference"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center justify-between">
                  <span>Lot No</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-lg gap-1.5"
                    onClick={() => setScannerOpen(true)}
                    data-testid="button-gelen-new-scan"
                  >
                    <ScanLine className="w-3.5 h-3.5" /> QR Tara
                  </Button>
                </Label>
                <Input
                  placeholder="Örn: LOT-123"
                  className="h-12 rounded-xl"
                  value={formData.lotNumber}
                  onChange={e => {
                    const v = e.target.value;
                    setFormData(p => ({ ...p, lotNumber: v }));
                    if (boundStok && v.trim().toUpperCase() !== (boundStok.lot ?? '').trim().toUpperCase()) {
                      setBoundStok(null);
                    }
                  }}
                  data-testid="input-gelen-new-lot"
                />
                {boundStok && (
                  <p className="text-xs text-green-700 dark:text-green-400" data-testid="text-bound-stok">
                    Bağlı stok: <span className="font-mono">BTX-SI-{boundStok.id}</span> · {boundStok.urunAdi}
                    {boundStok.lot ? ` · LOT ${boundStok.lot}` : ''}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Müşteri</Label>
                <CustomerInput
                  value={formData.customer}
                  onChange={v => setFormData(p => ({ ...p, customer: v }))}
                  placeholder="Müşteri adı"
                  testId="input-gelen-new-customer"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Toplam Adet *</Label>
                <Input
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-12 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={formData.totalQuantity}
                  onChange={e => setFormData(p => ({ ...p, totalQuantity: e.target.value.replace(/[^0-9]/g, '') }))}
                  onBlur={e => { if (!e.target.value || e.target.value === '0') setFormData(p => ({ ...p, totalQuantity: '' })); }}
                  data-testid="input-gelen-new-qty"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Koli İçi Adet</Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-12 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={formData.itemsPerBox}
                  onChange={e => setFormData(p => ({ ...p, itemsPerBox: e.target.value.replace(/[^0-9]/g, '') || '1' }))}
                  onBlur={e => { if (!e.target.value || e.target.value === '0') setFormData(p => ({ ...p, itemsPerBox: '1' })); }}
                  data-testid="input-gelen-new-box"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <PendingItemsSection
          items={pendingItems}
          onChange={setPendingItems}
          totalQuantity={parseInt(formData.totalQuantity) || 0}
          orderType="musteri"
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => setLocation('/gelen')} className="rounded-xl px-6 h-12">
            İptal
          </Button>
          <Button type="submit" disabled={isPending} className="rounded-xl px-8 h-12" data-testid="button-gelen-new-submit">
            {isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Kaydet
          </Button>
        </div>
      </motion.form>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Stok QR / Lot Tara"
        subtitle="Mevcut stok kalemine bağlamak için BTX-SI-… QR'ını veya lot numarasını okutun."
      />
    </div>
  );
}
