import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Printer, Loader2, QrCode } from 'lucide-react';
import type { StokItem } from '@shared/schema';

export default function EtiketStokItemPage() {
  const { id } = useParams();
  const stokItemId = Number(id);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<StokItem>({
    queryKey: ['/api/stok', stokItemId],
    queryFn: () => fetch(`/api/stok/${stokItemId}`, { credentials: 'include' }).then(r => {
      if (!r.ok) throw new Error('Stok kalemi bulunamadı');
      return r.json();
    }),
    enabled: !!stokItemId,
    retry: false,
  });

  useEffect(() => {
    if (!stokItemId) return;
    (async () => {
      const QRCode = await import('qrcode');
      const url = await QRCode.toDataURL(`BTX-SI-${stokItemId}`, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(url);
    })();
  }, [stokItemId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-4">
        <p className="text-sm text-destructive font-medium" data-testid="text-etiket-stok-error">
          Etiket yüklenemedi: stok kalemi bulunamadı veya erişim yok.
        </p>
        <Link href="/stok">
          <Button variant="outline" className="rounded-xl gap-2" data-testid="button-back-error">
            <ArrowLeft className="w-4 h-4" /> Stok listesine dön
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <style>{`
        @media print {
          @page { size: 60mm 40mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .etiket-print {
            width: 60mm !important;
            height: 40mm !important;
            padding: 2mm !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: row !important;
            gap: 2mm !important;
            align-items: stretch !important;
            font-size: 8pt !important;
            color: #000 !important;
            background: #fff !important;
            page-break-inside: avoid;
          }
          .etiket-print .etiket-qr { width: 32mm !important; height: 32mm !important; flex-shrink: 0; }
          .etiket-print .etiket-meta { flex: 1 1 auto !important; min-width: 0; line-height: 1.2 !important; overflow: hidden; }
          .etiket-print .etiket-meta p { margin: 0 0 1mm 0 !important; }
          .etiket-print .etiket-label { font-size: 6pt !important; color: #555 !important; text-transform: uppercase; }
          .etiket-print .etiket-value { font-size: 8pt !important; font-weight: 600 !important; }
          .etiket-print .etiket-value-lg { font-size: 9pt !important; font-weight: 700 !important; }
          .etiket-print .etiket-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; font-size: 7pt !important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/stok">
          <Button variant="outline" className="gap-2 rounded-xl" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" /> Geri
          </Button>
        </Link>
        <Button onClick={handlePrint} className="gap-2 rounded-xl" data-testid="button-print">
          <Printer className="w-4 h-4" /> Yazdır
        </Button>
      </div>

      <Card className="rounded-2xl border-2">
        <CardContent ref={printRef} className="p-6 etiket-print">
          <div className="flex items-center gap-2 text-xs text-muted-foreground print:hidden mb-3 w-full">
            <QrCode className="w-4 h-4" />
            <span>Biotex Seer · Stok Kalemi Etiketi (60×40 mm)</span>
          </div>

          <div className="shrink-0 bg-white border rounded-lg p-1 etiket-qr">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR BTX-SI-${stokItemId}`} className="w-40 h-40 print:w-full print:h-full" data-testid="img-qr" />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1 etiket-meta ml-6 print:ml-0">
            <p className="etiket-label text-xs uppercase tracking-wide text-muted-foreground">Ürün</p>
            <p className="etiket-value-lg font-semibold text-base truncate" data-testid="text-urun-adi">{data.urunAdi}</p>

            <p className="etiket-label text-xs uppercase tracking-wide text-muted-foreground">Tür</p>
            <p className="etiket-value text-sm truncate" data-testid="text-tur">
              {data.tur}{data.altTur ? ` · ${data.altTur}` : ''}
            </p>

            <p className="etiket-label text-xs uppercase tracking-wide text-muted-foreground">LOT</p>
            <p className="etiket-mono font-mono text-sm" data-testid="text-lot">{data.lot ?? '—'}</p>

            <p className="etiket-label text-xs uppercase tracking-wide text-muted-foreground">Miktar</p>
            <p className="etiket-value text-sm" data-testid="text-miktar">
              {Number(data.miktar).toLocaleString('tr-TR')} {data.birim}
            </p>

            <p className="etiket-mono font-mono text-[11px] text-muted-foreground pt-1" data-testid="text-qr-kod">BTX-SI-{stokItemId}</p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center print:hidden">
        Yazdırma etiket boyutu: 60 × 40 mm. Etiketi kesip stok kalemi/lot üzerine yapıştırın.
      </p>
    </div>
  );
}
