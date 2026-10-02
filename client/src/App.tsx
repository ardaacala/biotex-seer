import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "./hooks/use-auth";
import { useSoundNotifications } from "./hooks/use-sound-notifications";
import { Layout } from "./components/layout";
import { UpdateBanner } from "./components/UpdateBanner";
import { Loader2 } from "lucide-react";

import AuthPage from "./pages/auth";
import Dashboard from "./pages/dashboard";
import NotFound from "@/pages/not-found";
import RecordList from "./pages/records/list";
import RecordForm from "./pages/records/form";
import RecordDetail from "./pages/records/detail";
import AdminPanel from "./pages/admin";
import ItemLibraryPage from "./pages/library";
import CustomerLibraryPage from "./pages/musteri-kutuphanesi";
import OrderTitleLibraryPage from "./pages/baslik-kutuphanesi";
import ProductionPage from "./pages/production";
import CompletedOrdersPage from "./pages/completed";
import OrderSequencePage from "./pages/order-sequence";
import SampleList from "./pages/samples/index";
import SampleForm from "./pages/samples/form";
import SampleDetail from "./pages/samples/detail";
import ShipmentList from "./pages/shipments/index";
import ShipmentPlansPage from "./pages/shipments/plans";
import ChatPage from "./pages/chat";
import StokPage from "./pages/stok/index";
import FazTakibiPage from "./pages/faz-takibi";
import GelenSiparislerPage from "./pages/gelen/index";
import YeniGelenSiparisPage from "./pages/gelen/new";
import DepoHareketleriPage from "./pages/stok/depo-hareketleri";
import EtiketDepoHareketPage from "./pages/stok/etiket";
import EtiketStokItemPage from "./pages/stok/etiket-stok-item";
import BarkodRaporuPage from "./pages/stok/barkod-raporu";

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

const ACTIVE_ROLES = ['admin', 'uretim_sefi', 'uretim_calisan', 'ofis_calisan'];
const MANAGER_ROLES = ['admin', 'uretim_sefi', 'ofis_calisan'];
// Routes accessible only by non-worker roles (uretim_calisan excluded)
const NON_WORKER_ROLES = ['admin', 'uretim_sefi', 'ofis_calisan'];

function SoundNotifications() {
  useSoundNotifications();
  return null;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <Layout>
      {user && <SoundNotifications />}
      <Switch>
        <Route path="/login">
          {user ? <Redirect to="/" /> : <AuthPage />}
        </Route>

        <Route path="/">
          <ProtectedRoute roles={ACTIVE_ROLES}><Dashboard /></ProtectedRoute>
        </Route>

        <Route path="/records">
          <ProtectedRoute roles={ACTIVE_ROLES}><RecordList /></ProtectedRoute>
        </Route>

        <Route path="/records/new">
          <ProtectedRoute roles={MANAGER_ROLES}><RecordForm /></ProtectedRoute>
        </Route>

        <Route path="/records/:id/edit">
          <ProtectedRoute roles={MANAGER_ROLES}><RecordForm /></ProtectedRoute>
        </Route>

        <Route path="/records/:id">
          <ProtectedRoute roles={ACTIVE_ROLES}><RecordDetail /></ProtectedRoute>
        </Route>

        <Route path="/production">
          <ProtectedRoute roles={ACTIVE_ROLES}><ProductionPage /></ProtectedRoute>
        </Route>

        <Route path="/tamamlanan">
          <ProtectedRoute roles={ACTIVE_ROLES}><CompletedOrdersPage /></ProtectedRoute>
        </Route>

        <Route path="/library">
          <ProtectedRoute roles={MANAGER_ROLES}><ItemLibraryPage /></ProtectedRoute>
        </Route>

        <Route path="/musteri-kutuphanesi">
          <ProtectedRoute roles={MANAGER_ROLES}><CustomerLibraryPage /></ProtectedRoute>
        </Route>

        <Route path="/baslik-kutuphanesi">
          <ProtectedRoute roles={MANAGER_ROLES}><OrderTitleLibraryPage /></ProtectedRoute>
        </Route>

        <Route path="/siparis-sirasi">
          <ProtectedRoute roles={ACTIVE_ROLES}><OrderSequencePage /></ProtectedRoute>
        </Route>

        <Route path="/admin">
          <ProtectedRoute roles={['admin', 'ofis_calisan']}><AdminPanel /></ProtectedRoute>
        </Route>

        <Route path="/numuneler">
          <ProtectedRoute roles={ACTIVE_ROLES}><SampleList /></ProtectedRoute>
        </Route>

        <Route path="/numuneler/new">
          <ProtectedRoute roles={MANAGER_ROLES}><SampleForm /></ProtectedRoute>
        </Route>

        <Route path="/numuneler/:id/edit">
          <ProtectedRoute roles={MANAGER_ROLES}><SampleForm /></ProtectedRoute>
        </Route>

        <Route path="/numuneler/:id">
          <ProtectedRoute roles={ACTIVE_ROLES}><SampleDetail /></ProtectedRoute>
        </Route>

        <Route path="/sevkiyat">
          <ProtectedRoute roles={ACTIVE_ROLES}><ShipmentList /></ProtectedRoute>
        </Route>

        <Route path="/sevkiyat/:recordId">
          {(params) => <Redirect to={`/records/${params.recordId}`} replace />}
        </Route>

        <Route path="/sevkiyat-planlari">
          <ProtectedRoute roles={ACTIVE_ROLES}><ShipmentPlansPage /></ProtectedRoute>
        </Route>

        <Route path="/sohbet">
          <ProtectedRoute roles={ACTIVE_ROLES}><ChatPage /></ProtectedRoute>
        </Route>

        <Route path="/stok">
          <ProtectedRoute roles={ACTIVE_ROLES}><StokPage /></ProtectedRoute>
        </Route>

        <Route path="/faz-takibi">
          <ProtectedRoute roles={ACTIVE_ROLES}><FazTakibiPage /></ProtectedRoute>
        </Route>

        <Route path="/gelen">
          <ProtectedRoute roles={ACTIVE_ROLES}><GelenSiparislerPage /></ProtectedRoute>
        </Route>

        <Route path="/gelen/new">
          <ProtectedRoute roles={MANAGER_ROLES}><YeniGelenSiparisPage /></ProtectedRoute>
        </Route>

        <Route path="/stok/depo-hareketleri">
          <ProtectedRoute roles={NON_WORKER_ROLES}><DepoHareketleriPage /></ProtectedRoute>
        </Route>

        <Route path="/stok/barkod-raporu">
          <ProtectedRoute roles={NON_WORKER_ROLES}><BarkodRaporuPage /></ProtectedRoute>
        </Route>

        <Route path="/etiket/depo-hareket/:id">
          <ProtectedRoute roles={NON_WORKER_ROLES}><EtiketDepoHareketPage /></ProtectedRoute>
        </Route>

        <Route path="/etiket/stok-item/:id">
          <ProtectedRoute roles={NON_WORKER_ROLES}><EtiketStokItemPage /></ProtectedRoute>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <UpdateBanner />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
