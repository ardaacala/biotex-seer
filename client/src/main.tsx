import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// IMPORTANT: service worker registration is disabled. A previous deploy
// included a SW that broke initial render in production. We also actively
// unregister any worker still installed on returning visitors so they fully
// recover after their next visit (and we delete its caches).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if (typeof caches !== "undefined") {
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("biotex-"))
            .map((k) => caches.delete(k)),
        ),
      )
      .catch(() => {});
  }
}
