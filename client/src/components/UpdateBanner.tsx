import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isUpdateAvailable,
  subscribeUpdateAvailable,
} from "@/lib/version";

export function UpdateBanner() {
  const [show, setShow] = useState(isUpdateAvailable());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = subscribeUpdateAvailable(() => setShow(true));
    return () => {
      unsub();
    };
  }, []);

  if (!show || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/30 bg-background/95 px-4 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
      data-testid="banner-update-available"
      role="status"
    >
      <RefreshCw className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium">Yeni sürüm yayında</span>
      <Button
        size="sm"
        onClick={() => window.location.reload()}
        data-testid="button-update-reload"
      >
        Yenile
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted"
        aria-label="Kapat"
        data-testid="button-update-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
