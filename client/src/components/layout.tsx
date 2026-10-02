import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { LayoutDashboard, FileText, PlusCircle, ShieldAlert, LogOut, User as UserIcon, Menu, X, ChevronLeft, ChevronRight, ChevronDown, BookOpen, BookUser, BookMarked, Library, Zap, Clock, Pencil, Check, ListOrdered, FlaskConical, Truck, Package, MessageCircle, Warehouse, AlertTriangle, Search, Inbox, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import biotexLogo from '@assets/white-logo_1772614993528.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  uretim_sefi: 'Üretim Şefi',
  uretim_calisan: 'Üretim Çalışanı',
  ofis_calisan: 'Ofis Çalışanı',
  aday: 'Aday Üye',
};

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sevkiyatOpen, setSevkiyatOpen] = useState(() =>
    location === '/sevkiyat' || location.startsWith('/sevkiyat-planlari')
  );
  const [siparislerOpen, setSiparislerOpen] = useState(() =>
    location.startsWith('/records') || location === '/gelen' || location === '/library' || location === '/musteri-kutuphanesi' || location === '/baslik-kutuphanesi' || location === '/numuneler'
  );
  const [kutuphanelerOpen, setKutuphanelerOpen] = useState(() =>
    location === '/library' || location === '/musteri-kutuphanesi' || location === '/baslik-kutuphanesi'
  );
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateDisplayName = useMutation({
    mutationFn: (displayName: string | null) =>
      apiRequest('PUT', `/api/users/${user?.id}/display-name`, { displayName }).then(r => r.json()),
    onSuccess: (updated) => {
      queryClient.setQueryData(['/api/auth/me'], updated);
      toast({ title: "Adınız güncellendi" });
      setEditingName(false);
    },
    onError: (err: any) => {
      toast({ title: "Hata", description: err.message || "Ad güncellenemedi", variant: "destructive" });
    },
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/chat/unread-count'],
    queryFn: () => fetch('/api/chat/unread-count', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: location === '/sohbet' ? false : 5000,
    enabled: !!user && user.role !== 'aday',
  });
  const unreadCount = unreadData?.count ?? 0;

  if (!user) return <>{children}</>;

  // Aday üyeler için bekleme ekranı
  if (user.role === 'aday') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-amber-100 dark:bg-amber-900/30 p-6 rounded-full">
              <Clock className="w-16 h-16 text-amber-500" />
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-display font-bold">Onay Bekleniyor</h1>
            <p className="text-muted-foreground leading-relaxed">
              Hesabınız oluşturuldu. Bir yönetici hesabınızı onaylayana kadar sisteme erişemezsiniz.
            </p>
            <p className="text-sm text-muted-foreground">
              Onaylanmayan hesaplar 1 saat içinde otomatik olarak silinir.
            </p>
          </div>
          <div className="bg-muted/30 rounded-2xl p-4 flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-full">
              <UserIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">{user.displayName || user.username}</p>
              <p className="text-xs text-muted-foreground">Aday Üye</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => logout()}
            data-testid="button-logout-aday"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Çıkış Yap
          </Button>
        </div>
      </div>
    );
  }

  const isManager = user.role === 'admin' || user.role === 'uretim_sefi' || user.role === 'ofis_calisan';

  const navItemsBefore = [
    { href: '/', icon: LayoutDashboard, label: 'Panel' },
  ];

  const navItemsMiddle = [
    { href: '/production', icon: Zap, label: 'Anlık Üretim' },
    { href: '/siparis-sirasi', icon: ListOrdered, label: 'Sipariş Sırası' },
    { href: '/faz-takibi', icon: Search, label: 'Faz Takibi' },
  ];

  const navItemsAfter = [
    ...(user.role === 'admin' || user.role === 'ofis_calisan' ? [{ href: '/admin', icon: ShieldAlert, label: 'Yönetim Paneli' }] : []),
  ];

  const navItems = [...navItemsBefore, ...navItemsMiddle, ...navItemsAfter];

  const isKutuphanelerActive = location === '/library' || location === '/musteri-kutuphanesi' || location === '/baslik-kutuphanesi';
  const isSiparislerActive = location.startsWith('/records') || location === '/gelen' || isKutuphanelerActive || location === '/numuneler';
  const siparislerChildren = [
    { href: '/records', icon: FileText, label: 'Aktif Siparişler' },
    { href: '/gelen', icon: Inbox, label: 'Gelen Siparişler' },
    ...(isManager ? [{ href: '/records/new', icon: PlusCircle, label: 'Yeni Sipariş' }] : []),
    { href: '/numuneler', icon: FlaskConical, label: 'Numuneler' },
  ];
  const kutuphanelerChildren = [
    { href: '/baslik-kutuphanesi', icon: BookMarked, label: 'Başlık Kütüphanesi' },
    { href: '/library', icon: BookOpen, label: 'İçerik Kütüphanesi' },
    { href: '/musteri-kutuphanesi', icon: BookUser, label: 'Müşteri Kütüphanesi' },
  ];

  const isSevkiyatActive = location === '/sevkiyat' || location.startsWith('/sevkiyat-planlari');
  const sevkiyatChildren = [
    { href: '/sevkiyat', icon: Package, label: 'Sevkiyat Edilecek Siparişler' },
    { href: '/sevkiyat-planlari', icon: Truck, label: 'Sevkiyat Planları' },
  ];
  const canSeeSevkiyat =
    user.role === 'admin' ||
    user.role === 'uretim_sefi' ||
    user.role === 'ofis_calisan' ||
    (user.role === 'uretim_calisan' && !!(user as any).sevkiyatYetkisi);

  const isDepoHareketleriActive = location === '/stok/depo-hareketleri';
  const isBarkodRaporuActive = location === '/stok/barkod-raporu';
  const isStokActive = location === '/stok';
  const canSeeStok =
    user.role === 'admin' ||
    user.role === 'ofis_calisan' ||
    !!(user as any).stokYetkisi;

  // Mobile bottom nav: Panel, Siparişler(aktif), Anlık Üretim, Faz Takibi
  const mobileNavItems = [
    { href: '/', icon: LayoutDashboard, label: 'Panel' },
    { href: '/records', icon: FileText, label: 'Siparişler' },
    { href: '/production', icon: Zap, label: 'Anlık Üretim' },
    { href: '/faz-takibi', icon: Search, label: 'Faz Takibi' },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r border-border/50">
      <Link href="/" className={cn("flex items-center gap-3 hover:opacity-80 transition-opacity", collapsed ? "justify-center p-4" : "px-5 py-5")} onClick={() => setMobileMenuOpen(false)}>
        <img
          src={biotexLogo}
          alt="Biotex"
          className={cn(
            "object-contain transition-all duration-300 shrink-0",
            collapsed ? "h-9 w-9" : "h-10"
          )}
        />
        {!collapsed && (
          <span className="font-display font-semibold text-sm leading-tight whitespace-nowrap">
            <span style={{ color: '#1a5fa8' }}>Biotex</span>{' '}
            <span style={{ color: '#a8c800' }}>Seer</span>
          </span>
        )}
      </Link>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItemsBefore.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="block" onClick={() => setMobileMenuOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}>
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? 'text-primary' : '')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {isActive && !collapsed && (
                  <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
                )}
              </div>
            </Link>
          );
        })}

        {/* Siparişler Grubu */}
        <div>
          <button
            onClick={() => setSiparislerOpen(v => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
              isSiparislerActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            data-testid="button-siparisler-group"
          >
            <FileText className={cn("w-5 h-5 shrink-0", isSiparislerActive ? 'text-primary' : '')} />
            {!collapsed && (
              <>
                <span className="truncate flex-1 text-left">Siparişler</span>
                <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", (siparislerOpen || isSiparislerActive) && "rotate-180")} />
              </>
            )}
          </button>
          <AnimatePresence initial={false}>
            {(siparislerOpen || isSiparislerActive) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={cn("mt-0.5 space-y-0.5", collapsed ? "pl-0" : "pl-3")}>
                  {siparislerChildren.map(child => {
                    const isActive = location === child.href || (child.href !== '/records' && child.href !== '/gelen' && location.startsWith(child.href));
                    const isRecordsActive = child.href === '/records' && location.startsWith('/records') && location !== '/gelen';
                    const isGelenActive = child.href === '/gelen' && location === '/gelen';
                    const active = isActive || isRecordsActive || isGelenActive;
                    return (
                      <Link key={child.href} href={child.href} className="block" onClick={() => setMobileMenuOpen(false)}>
                        <div className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 relative",
                          !collapsed && "border-l-2 border-border/40 rounded-l-none ml-1",
                          active
                            ? 'bg-primary/10 text-primary font-semibold border-primary!'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}>
                          <child.icon className={cn("w-4 h-4 shrink-0", active ? 'text-primary' : '')} />
                          {!collapsed && <span className="truncate text-sm">{child.label}</span>}
                          {active && !collapsed && (
                            <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-7 bg-primary rounded-r-full" />
                          )}
                        </div>
                      </Link>
                    );
                  })}

                  {isManager && (
                    <div>
                      <button
                        onClick={() => setKutuphanelerOpen(v => !v)}
                        aria-expanded={kutuphanelerOpen || isKutuphanelerActive}
                        aria-controls="sidebar-kutuphaneler-panel"
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 relative",
                          !collapsed && "border-l-2 border-border/40 rounded-l-none ml-1",
                          isKutuphanelerActive
                            ? 'bg-primary/10 text-primary font-semibold border-primary!'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                        data-testid="button-kutuphaneler-group"
                      >
                        <Library className={cn("w-4 h-4 shrink-0", isKutuphanelerActive ? 'text-primary' : '')} />
                        {!collapsed && (
                          <>
                            <span className="truncate text-sm flex-1 text-left">Kütüphaneler</span>
                            <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", (kutuphanelerOpen || isKutuphanelerActive) && "rotate-180")} />
                          </>
                        )}
                      </button>
                      <AnimatePresence initial={false}>
                        {(kutuphanelerOpen || isKutuphanelerActive) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className={cn("mt-0.5 space-y-0.5", collapsed ? "pl-0" : "pl-3")}>
                              {kutuphanelerChildren.map(sub => {
                                const subActive = location === sub.href;
                                return (
                                  <Link key={sub.href} href={sub.href} className="block" onClick={() => setMobileMenuOpen(false)}>
                                    <div className={cn(
                                      "flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-300 relative",
                                      !collapsed && "border-l-2 border-border/40 rounded-l-none ml-1",
                                      subActive
                                        ? 'bg-primary/10 text-primary font-semibold border-primary!'
                                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                    )}
                                    data-testid={`link-kutuphane-${sub.href.replace('/', '')}`}>
                                      <sub.icon className={cn("w-4 h-4 shrink-0", subActive ? 'text-primary' : '')} />
                                      {!collapsed && <span className="truncate text-sm">{sub.label}</span>}
                                      {subActive && !collapsed && (
                                        <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />
                                      )}
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {navItemsMiddle.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="block" onClick={() => setMobileMenuOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}>
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? 'text-primary' : '')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {isActive && !collapsed && (
                  <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
                )}
              </div>
            </Link>
          );
        })}

        {/* Sevkiyat Grubu */}
        {canSeeSevkiyat && <div>
          <button
            onClick={() => setSevkiyatOpen(v => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
              isSevkiyatActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            data-testid="button-sevkiyat-group"
          >
            <Truck className={cn("w-5 h-5 shrink-0", isSevkiyatActive ? 'text-primary' : '')} />
            {!collapsed && (
              <>
                <span className="truncate flex-1 text-left">Sevkiyat</span>
                <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", (sevkiyatOpen || isSevkiyatActive) && "rotate-180")} />
              </>
            )}
          </button>
          <AnimatePresence initial={false}>
            {(sevkiyatOpen || isSevkiyatActive) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={cn("mt-0.5 space-y-0.5", collapsed ? "pl-0" : "pl-3")}>
                  {sevkiyatChildren.map(child => {
                    const isActive = location === child.href;
                    return (
                      <Link key={child.href} href={child.href} className="block" onClick={() => setMobileMenuOpen(false)}>
                        <div className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 relative",
                          !collapsed && "border-l-2 border-border/40 rounded-l-none ml-1",
                          isActive
                            ? 'bg-primary/10 text-primary font-semibold border-primary!'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}>
                          <child.icon className={cn("w-4 h-4 shrink-0", isActive ? 'text-primary' : '')} />
                          {!collapsed && <span className="truncate text-sm">{child.label}</span>}
                          {isActive && !collapsed && (
                            <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-7 bg-primary rounded-r-full" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>}

        {/* Stok */}
        {canSeeStok && (
          <Link href="/stok" className="block" onClick={() => setMobileMenuOpen(false)}>
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
              isStokActive
                ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            data-testid="link-stok"
            >
              <Warehouse className={cn("w-5 h-5 shrink-0", isStokActive ? 'text-primary' : '')} />
              {!collapsed && <span className="truncate">Stok</span>}
              {isStokActive && !collapsed && (
                <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
              )}
            </div>
          </Link>
        )}

        {/* Depo Hareketleri */}
        {isManager && (
          <Link href="/stok/depo-hareketleri" className="block" onClick={() => setMobileMenuOpen(false)}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
                isDepoHareketleriActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              data-testid="link-depo-hareketleri"
            >
              <ArrowLeftRight className={cn("w-5 h-5 shrink-0", isDepoHareketleriActive ? 'text-primary' : '')} />
              {!collapsed && <span className="truncate">Depo Hareketleri</span>}
              {isDepoHareketleriActive && !collapsed && (
                <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
              )}
            </div>
          </Link>
        )}

        {/* Barkod Doğrulama Raporu */}
        {isManager && (
          <Link href="/stok/barkod-raporu" className="block" onClick={() => setMobileMenuOpen(false)}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
                isBarkodRaporuActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              data-testid="link-barkod-raporu"
            >
              <ShieldCheck className={cn("w-5 h-5 shrink-0", isBarkodRaporuActive ? 'text-primary' : '')} />
              {!collapsed && <span className="truncate">Barkod Raporu</span>}
              {isBarkodRaporuActive && !collapsed && (
                <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
              )}
            </div>
          </Link>
        )}

        {/* Sohbet */}
        {(() => {
          const isActive = location === '/sohbet';
          return (
            <Link href="/sohbet" className="block" onClick={() => setMobileMenuOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}>
                <div className="relative shrink-0">
                  <MessageCircle className={cn("w-5 h-5", isActive ? 'text-primary' : '')} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <span className="truncate flex-1">İletişim Kanalı</span>
                )}
                {!collapsed && unreadCount > 0 && (
                  <span className="shrink-0 min-w-[20px] h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {isActive && !collapsed && (
                  <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
                )}
              </div>
            </Link>
          );
        })()}

        {navItemsAfter.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="block" onClick={() => setMobileMenuOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative",
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}>
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? 'text-primary' : '')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {isActive && !collapsed && (
                  <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50">
        <div className={cn("flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl mb-3", collapsed && "px-2 justify-center")}>
          <div className="bg-primary/20 p-2 rounded-full text-primary shrink-0">
            <UserIcon className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') updateDisplayName.mutate(nameValue.trim() || null);
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    className="h-6 text-xs rounded-lg px-2 py-0"
                    placeholder="Adınız..."
                    maxLength={50}
                    data-testid="input-own-display-name"
                  />
                  <Button
                    size="icon"
                    variant="default"
                    className="h-6 w-6 shrink-0 rounded-md"
                    onClick={() => updateDisplayName.mutate(nameValue.trim() || null)}
                    disabled={updateDisplayName.isPending}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  className="group w-full text-left"
                  onClick={() => { setNameValue(user.displayName ?? ''); setEditingName(true); }}
                  data-testid="button-edit-own-display-name"
                >
                  <p className="text-sm font-semibold truncate flex items-center gap-1">
                    {user.displayName || user.username}
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                  </p>
                  {user.displayName && (
                    <p className="text-[10px] text-muted-foreground truncate">@{user.username}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
                </button>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          className={cn("w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl", collapsed && "justify-center")}
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className={cn("w-5 h-5", !collapsed && "mr-3")} />
          {!collapsed && <span>Çıkış Yap</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col transition-all duration-300 relative z-50",
        collapsed ? "w-20" : "w-64"
      )}>
        {renderSidebarContent()}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-10 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg border-2 border-background hover:scale-110 transition-transform"
          data-testid="button-collapse-sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Mobile Menu Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 right-4 z-50 bg-background/80 backdrop-blur shadow-sm border"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        data-testid="button-mobile-menu"
      >
        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </Button>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 z-[70] md:hidden"
            >
              {renderSidebarContent()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0 scroll-smooth">
          <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 w-full z-40 rounded-t-2xl border-t border-border/50 bg-background/90 backdrop-blur-lg">
        <div className="flex justify-around items-center py-2 px-1">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="flex-1 py-1" onClick={() => setMobileMenuOpen(false)}>
                <div className="flex flex-col items-center gap-0.5">
                  <div className={cn("p-1.5 rounded-xl transition-colors", isActive ? 'bg-primary/10' : '')}>
                    <item.icon className={cn("w-5 h-5", isActive ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <span className={cn("text-[9px] font-medium leading-tight text-center", isActive ? 'text-primary' : 'text-muted-foreground')}>
                    {item.label.split(' ')[0]}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
