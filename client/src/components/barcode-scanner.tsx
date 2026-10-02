import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Camera, Keyboard, ScanLine, X, Check, Loader2, Settings2, Volume2, Vibrate } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  LS_SES,
  LS_VIB,
  readPref,
  writePref,
  runFeedback,
  dispatchScan,
} from '@/lib/scanner-feedback';

export type BarkodKaynak = 'kamera' | 'fiziksel' | 'manuel';
type Tab = 'kamera' | 'fiziksel' | 'manuel';

interface Html5QrInstance {
  start(
    cameraConfig: { facingMode: string } | string,
    config: { fps: number; qrbox: { width: number; height: number } },
    onScan: (decodedText: string) => void,
    onError: (msg: string) => void
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

interface Html5QrcodeModule {
  Html5Qrcode: new (elementId: string, verbose?: boolean) => Html5QrInstance;
}

type ScanResult = boolean | void;
type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (code: string, kaynak: BarkodKaynak) => ScanResult | Promise<ScanResult>;
  title?: string;
  subtitle?: string;
};

const DEBOUNCE_MS = 1000;

export function BarcodeScanner({ open, onClose, onScan, title = 'Barkod Tara', subtitle }: Props) {
  const [tab, setTab] = useState<Tab>('kamera');
  const [manuel, setManuel] = useState('');
  const [fiziksel, setFiziksel] = useState('');
  const [busy, setBusy] = useState(false);
  const [sesAcik, setSesAcik] = useState<boolean>(() => readPref(LS_SES, true));
  const [vibAcik, setVibAcik] = useState<boolean>(() => readPref(LS_VIB, true));
  const scannerRef = useRef<Html5QrInstance | null>(null);
  const containerId = 'barcode-scanner-region';
  const { toast } = useToast();

  // Debounce: aynı kodu 1sn içinde tekrar tetikleme. Modal yaşam döngüsü boyunca paylaşılır.
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });

  // Modal kapanınca state sıfırla
  useEffect(() => {
    if (!open) {
      setManuel('');
      setFiziksel('');
      lastScanRef.current = { code: '', ts: 0 };
    }
  }, [open]);

  // Ayar değişince kalıcı kaydet
  useEffect(() => { writePref(LS_SES, sesAcik); }, [sesAcik]);
  useEffect(() => { writePref(LS_VIB, vibAcik); }, [vibAcik]);

  // Geri bildirim — başarı/başarısızlık örüntüleri
  const sesAcikRef = useRef(sesAcik);
  const vibAcikRef = useRef(vibAcik);
  useEffect(() => { sesAcikRef.current = sesAcik; }, [sesAcik]);
  useEffect(() => { vibAcikRef.current = vibAcik; }, [vibAcik]);

  const feedback = useCallback((ok: boolean) => {
    runFeedback(ok, { ses: sesAcikRef.current, vibration: vibAcikRef.current });
  }, []);

  /* Tek noktadan tarama dağıtımı: debounce + onScan + geri bildirim */
  const emit = useCallback(async (code: string, kaynak: BarkodKaynak) => {
    const v = String(code || '').trim();
    if (!v) return;
    const now = Date.now();
    const last = lastScanRef.current;
    if (last.code === v && now - last.ts < DEBOUNCE_MS) return;
    lastScanRef.current = { code: v, ts: now };
    await dispatchScan(onScan, feedback, v, kaynak);
  }, [onScan, feedback]);

  // Fiziksel tarayıcı için page-level keydown heuristic:
  // hızlı (≤50ms aralıklı) karakterleri biriktir, Enter veya 250ms sessizlikten sonra gönder.
  useEffect(() => {
    if (!open || tab !== 'fiziksel') return;

    let buffer = '';
    let lastTs = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      const v = buffer.trim();
      buffer = '';
      lastTs = 0;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (v) {
        setFiziksel(v);
        void emit(v, 'fiziksel');
      }
    };

    const handler = (e: KeyboardEvent) => {
      // Aktif öğe input/textarea ise atla — kullanıcı normal yazıyor
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const now = Date.now();
      const fast = lastTs === 0 || (now - lastTs) <= 50;

      if (e.key === 'Enter') {
        if (buffer.length > 0) {
          e.preventDefault();
          flush();
        }
        return;
      }
      // Sadece tek-karakter (ve görünür) tuşları işle — modifier/fonksiyon tuşlarını yoksay
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      if (!fast) buffer = '';
      buffer += e.key;
      setFiziksel(buffer);
      lastTs = now;

      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 250);
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [open, tab, emit]);

  // Kamera tarayıcı yaşam döngüsü
  useEffect(() => {
    let mounted = true;
    let started = false;

    async function start() {
      if (!open || tab !== 'kamera') return;
      try {
        setBusy(true);
        const mod = (await import('html5-qrcode')) as unknown as Html5QrcodeModule;
        if (!mounted) return;
        const inst = new mod.Html5Qrcode(containerId, false);
        scannerRef.current = inst;
        await inst.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            if (!mounted) return;
            // Tarayıcıyı durdurma — eşleşmezse aynı kamerada tekrar denenebilsin.
            // Modal kapandığında cleanup zaten kamerayı kapatacak.
            void emit(String(decodedText), 'kamera');
          },
          () => { /* tarama hatası — yoksay */ }
        );
        started = true;
      } catch (err) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Kameraya erişim izni gerekli';
          toast({ title: 'Kamera başlatılamadı', description: msg, variant: 'destructive' });
        }
      } finally {
        if (mounted) setBusy(false);
      }
    }
    start();

    return () => {
      mounted = false;
      const inst = scannerRef.current;
      if (inst && started) {
        inst.stop().catch(() => {}).finally(() => {
          try { inst.clear(); } catch {}
        });
      }
      scannerRef.current = null;
    };
  }, [open, tab, emit, toast]);

  const submitManuel = () => {
    const v = manuel.trim();
    if (!v) {
      toast({ title: 'Lot/QR değeri girin', variant: 'destructive' });
      return;
    }
    void emit(v, 'manuel');
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden" data-testid="modal-barcode-scanner">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ScanLine className="w-5 h-5 text-primary" /> {title}
            </DialogTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  aria-label="Tarayıcı ayarları"
                  data-testid="button-scanner-ayarlar"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Geri bildirim</p>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="scanner-ses" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Volume2 className="w-4 h-4" /> Ses
                  </Label>
                  <Switch
                    id="scanner-ses"
                    checked={sesAcik}
                    onCheckedChange={setSesAcik}
                    data-testid="switch-scanner-ses"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="scanner-vib" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Vibrate className="w-4 h-4" /> Titreşim
                  </Label>
                  <Switch
                    id="scanner-vib"
                    checked={vibAcik}
                    onCheckedChange={setVibAcik}
                    data-testid="switch-scanner-titresim"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </DialogHeader>

        <div className="px-4 pb-4">
          <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
            <TabsList className="grid grid-cols-3 w-full rounded-xl">
              <TabsTrigger value="kamera" className="gap-1.5 text-xs" data-testid="tab-kamera">
                <Camera className="w-3.5 h-3.5" /> Kamera
              </TabsTrigger>
              <TabsTrigger value="fiziksel" className="gap-1.5 text-xs" data-testid="tab-fiziksel">
                <Keyboard className="w-3.5 h-3.5" /> Tarayıcı
              </TabsTrigger>
              <TabsTrigger value="manuel" className="gap-1.5 text-xs" data-testid="tab-manuel">
                <ScanLine className="w-3.5 h-3.5" /> Manuel
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kamera" className="mt-4">
              <div className="rounded-xl overflow-hidden border bg-black aspect-square w-full relative">
                <div id={containerId} className="w-full h-full" />
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                QR/Barkodu kameraya gösterin
              </p>
            </TabsContent>

            <TabsContent value="fiziksel" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                USB / Bluetooth tarayıcınızla okutun. Tuşlamaya gerek yok — kod otomatik algılanır ve gönderilir.
              </p>
              <div
                className="rounded-xl border-2 border-dashed border-muted bg-muted/30 px-3 py-6 text-center min-h-[64px] flex items-center justify-center"
                data-testid="display-fiziksel-buffer"
              >
                {fiziksel
                  ? <span className="font-mono text-sm">{fiziksel}</span>
                  : <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Keyboard className="w-3.5 h-3.5" /> Tarama bekleniyor…
                    </span>}
              </div>
            </TabsContent>

            <TabsContent value="manuel" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                LOT numarasını veya QR içeriğini elle girin.
              </p>
              <Input
                value={manuel}
                onChange={e => setManuel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitManuel(); } }}
                placeholder="Örn: LOT-2024-001, BTX-DH-42 veya BTX-SI-7"
                className="rounded-xl"
                data-testid="input-manuel-barkod"
                autoFocus
              />
              <Button onClick={submitManuel} disabled={!manuel.trim()} className="w-full rounded-xl gap-2" data-testid="button-manuel-onayla">
                <Check className="w-4 h-4" /> Onayla
              </Button>
            </TabsContent>
          </Tabs>

          <Button variant="ghost" onClick={onClose} className="w-full mt-3 rounded-xl gap-2" data-testid="button-scanner-kapat">
            <X className="w-4 h-4" /> Kapat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Bir taranan kodun, beklenen depo hareketinin lot/id'sine eşleşip eşleşmediğini kontrol eder. */
export function barkodEslesir(scanned: string, lot: string | null, depoHareketId: number): boolean {
  const s = String(scanned || '').trim().toUpperCase();
  if (!s) return false;
  if (s === `BTX-DH-${depoHareketId}`) return true;
  if (s === String(depoHareketId)) return true;
  if (lot && s === String(lot).trim().toUpperCase()) return true;
  return false;
}

/** Bir stok kalemi (raf etiketi) için BTX-SI-<id> veya lot eşleşmesini kontrol eder. */
export function barkodEslesirStokItem(scanned: string, lot: string | null, stokItemId: number): boolean {
  const s = String(scanned || '').trim().toUpperCase();
  if (!s) return false;
  if (s === `BTX-SI-${stokItemId}`) return true;
  if (lot && s === String(lot).trim().toUpperCase()) return true;
  return false;
}

/** Tarama içeriğinden BTX-SI-<id> öneki ile stok kalemi id'sini çıkarır. */
export function parseStokItemKodu(scanned: string): number | null {
  const s = String(scanned || '').trim().toUpperCase();
  const m = s.match(/^BTX-SI-(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}
