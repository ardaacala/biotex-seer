type Listener = (updateAvailable: boolean) => void;

const listeners = new Set<Listener>();
let updateAvailable = false;

function readInitialVersion(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector(
    'meta[name="app-version"]',
  ) as HTMLMetaElement | null;
  const v = meta?.content?.trim();
  return v && v.length > 0 ? v : null;
}

const INITIAL_VERSION = readInitialVersion();

export function notifyServerVersion(version: string | null | undefined) {
  if (!version) return;
  if (!INITIAL_VERSION) return;
  if (updateAvailable) return;
  if (version === INITIAL_VERSION) return;
  updateAvailable = true;
  for (const listener of listeners) {
    listener(true);
  }
}

export function isUpdateAvailable() {
  return updateAvailable;
}

export function subscribeUpdateAvailable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
