import { useMemo, useState } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, FileSpreadsheet, ScanLine, ShieldCheck, AlertTriangle,
  Camera, Pencil, Filter, RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Link } from 'wouter';

type Row = {
  id: number;
  stokItemId: number;
  urunAdi: string;
  lot: string | null;
  birim: string;
  siparisId: number;
  siparisTitle: string;
  siparisLot: string | null;
  tasindiAt: string | null;
  tasindiBy: number | null;
  tasindiByUsername: string | null;
  tasindiMiktar: number | null;
  rezervedMiktar: number;
  barkodDogrulandi: boolean;
  barkodKaynak: string | null;
};

type UserOption = { id: number; name: string };

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function kaynakLabel(k: string | null): string {
  switch (k) {
    case 'kamera': return 'Kamera';
    case 'tarayici': return 'Tarayıcı';
    case 'manuel': return 'Manuel';
    default: return '—';
  }
}

function KaynakBadge({ value }: { value: string | null }) {
  const common = 'gap-1';
  if (value === 'kamera') return <Badge variant="secondary" className={common} data-testid={`badge-kaynak-kamera`}><Camera className="w-3 h-3" />Kamera</Badge>;
  if (value === 'tarayici') return <Badge variant="secondary" className={common} data-testid={`badge-kaynak-tarayici`}><ScanLine className="w-3 h-3" />Tarayıcı</Badge>;
  if (value === 'manuel') return <Badge variant="outline" className={common} data-testid={`badge-kaynak-manuel`}><Pencil className="w-3 h-3" />Manuel</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

export default function BarkodRaporuPage() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<string>(todayIso(-7));
  const [endDate, setEndDate] = useState<string>(todayIso(0));
  const [userId, setUserId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all | dogrulandi | atlandi
  const [search, setSearch] = useState<string>('');

  const usersQ = useQuery<UserOption[]>({ queryKey: ['/api/users/name-list'] });

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (startDate) p.set('startDate', new Date(startDate + 'T00:00:00').toISOString());
    if (endDate) p.set('endDate', new Date(endDate + 'T23:59:59.999').toISOString());
    if (userId && userId !== 'all') p.set('userId', userId);
    return p.toString();
  }, [startDate, endDate, userId]);

  const rowsQ = useQuery<Row[]>({
    queryKey: ['/api/raporlar/barkod-dogrulama', queryParams],
    queryFn: async () => {
      const r = await fetch(`/api/raporlar/barkod-dogrulama?${queryParams}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Yüklenemedi');
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const data = rowsQ.data ?? [];
    const q = normalizeForSearch(search.trim());
    return data.filter(r => {
      if (statusFilter === 'dogrulandi' && !r.barkodDogrulandi) return false;
      if (statusFilter === 'atlandi' && r.barkodDogrulandi) return false;
      if (q) {
        const hay = normalizeForSearch([r.urunAdi, r.lot ?? '', r.siparisTitle, r.siparisLot ?? '', r.tasindiByUsername ?? ''].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rowsQ.data, statusFilter, search]);

  const counts = useMemo(() => {
    const total = filtered.length;
    const dogrulandi = filtered.filter(r => r.barkodDogrulandi).length;
    const atlandi = total - dogrulandi;
    const manuel = filtered.filter(r => r.barkodKaynak === 'manuel').length;
    return { total, dogrulandi, atlandi, manuel };
  }, [filtered]);

  const exportExcel = () => {
    if (!filtered.length) {
      toast({ title: 'Veri yok', description: 'İndirilecek kayıt bulunamadı.', variant: 'destructive' });
      return;
    }
    type ExportRow = {
      'Tarih': string;
      'Ürün': string;
      'Lot': string;
      'Sipariş': string;
      'Sipariş Lot': string;
      'Kullanıcı': string;
      'Taşınan Miktar': string;
      'Birim': string;
      'Doğrulama Durumu': string;
      'Kaynak': string;
    };
    const rows: ExportRow[] = filtered.map(r => ({
      'Tarih': fmtDate(r.tasindiAt),
      'Ürün': r.urunAdi,
      'Lot': r.lot ?? '',
      'Sipariş': r.siparisTitle,
      'Sipariş Lot': r.siparisLot ?? '',
      'Kullanıcı': r.tasindiByUsername ?? '',
      'Taşınan Miktar': r.tasindiMiktar != null ? String(r.tasindiMiktar) : '',
      'Birim': r.birim,
      'Doğrulama Durumu': r.barkodDogrulandi ? 'Doğrulandı' : 'Atlandı',
      'Kaynak': kaynakLabel(r.barkodKaynak),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const cols = Object.keys(rows[0]) as Array<keyof ExportRow>;
    ws['!cols'] = cols.map(k => ({
      wch: Math.min(40, Math.max(String(k).length + 2, ...rows.map(r => r[k].length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Barkod Doğrulama');
    const fileName = `barkod-dogrulama-${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({ title: 'Excel indirildi', description: `${rows.length} kayıt aktarıldı.` });
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Barkod Doğrulama Raporu
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sefer ve lot bazında barkod doğrulama geçmişini görüntüleyin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => rowsQ.refetch()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" /> Yenile
          </Button>
          <Button size="sm" onClick={exportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel'e Aktar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label htmlFor="start-date" className="text-xs">Başlangıç</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-date" className="text-xs">Bitiş</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kullanıcı</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger data-testid="select-user">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm kullanıcılar</SelectItem>
                  {(usersQ.data ?? []).map(u => (
                    <SelectItem key={u.id} value={String(u.id)} data-testid={`select-user-option-${u.id}`}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durum</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="dogrulandi">Doğrulandı</SelectItem>
                  <SelectItem value="atlandi">Atlandı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="search" className="text-xs">Ara</Label>
              <Input
                id="search"
                placeholder="Ürün, lot, sipariş..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Toplam</div>
          <div className="text-2xl font-bold" data-testid="stat-total">{counts.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Doğrulandı</div>
          <div className="text-2xl font-bold text-green-600" data-testid="stat-dogrulandi">{counts.dogrulandi}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Atlandı</div>
          <div className="text-2xl font-bold text-amber-600" data-testid="stat-atlandi">{counts.atlandi}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Manuel kullanım</div>
          <div className="text-2xl font-bold text-orange-600" data-testid="stat-manuel">{counts.manuel}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {rowsQ.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Yükleniyor...
            </div>
          ) : rowsQ.isError ? (
            <div className="flex items-center justify-center py-12 text-destructive">
              <AlertTriangle className="w-5 h-5 mr-2" /> Veriler yüklenemedi.
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Filter className="w-8 h-8" />
              <div>Seçilen filtrelere uygun kayıt bulunamadı.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2">Ürün / Lot</th>
                    <th className="px-3 py-2">Sipariş</th>
                    <th className="px-3 py-2">Kullanıcı</th>
                    <th className="px-3 py-2 text-right">Miktar</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Kaynak</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-t hover:bg-muted/30" data-testid={`row-rapor-${r.id}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground" data-testid={`text-tarih-${r.id}`}>
                        {fmtDate(r.tasindiAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium" data-testid={`text-urun-${r.id}`}>{r.urunAdi}</div>
                        {r.lot && <div className="text-xs text-muted-foreground" data-testid={`text-lot-${r.id}`}>Lot: {r.lot}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/records/${r.siparisId}`} className="text-primary hover:underline" data-testid={`link-siparis-${r.id}`}>
                          {r.siparisTitle}
                        </Link>
                        {r.siparisLot && <div className="text-xs text-muted-foreground">Lot: {r.siparisLot}</div>}
                      </td>
                      <td className="px-3 py-2" data-testid={`text-kullanici-${r.id}`}>
                        {r.tasindiByUsername ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-miktar-${r.id}`}>
                        {r.tasindiMiktar ?? '—'} <span className="text-xs text-muted-foreground">{r.birim}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.barkodDogrulandi ? (
                          <Badge className="bg-green-600 hover:bg-green-600 gap-1" data-testid={`badge-status-${r.id}`}>
                            <ShieldCheck className="w-3 h-3" /> Doğrulandı
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600" data-testid={`badge-status-${r.id}`}>
                            <AlertTriangle className="w-3 h-3" /> Atlandı
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <KaynakBadge value={r.barkodKaynak} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
