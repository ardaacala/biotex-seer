import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { APP_VERSION } from "./version";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function serveStatic(app: Express) {
  // In the production CJS bundle (dist/index.cjs), __dirname resolves to dist/
  // so dist/public is the correct location for the built client assets.
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexPath = path.resolve(distPath, "index.html");
  let indexHtml = fs.readFileSync(indexPath, "utf-8");
  if (!indexHtml.includes('name="app-version"')) {
    indexHtml = indexHtml.replace(
      "</head>",
      `    <meta name="app-version" content="${APP_VERSION}" />\n  </head>`,
    );
  } else {
    indexHtml = indexHtml.replace(
      /<meta name="app-version" content="[^"]*"\s*\/?>/,
      `<meta name="app-version" content="${APP_VERSION}" />`,
    );
  }

  const sendIndex = (_req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(indexHtml);
  };

  app.get("/", sendIndex);
  app.get("/index.html", sendIndex);

  // Kill-switch service worker. A previous deploy registered a SW that broke
  // initial render. We now serve a tiny worker that immediately unregisters
  // itself and clears its caches, so any returning user is healed on the next
  // visit. New users never register a SW (client/src/main.tsx no longer
  // calls register()).
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(
      `self.addEventListener("install",()=>self.skipWaiting());\n` +
        `self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{` +
        `try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}catch(_){}` +
        `try{await self.registration.unregister();}catch(_){}` +
        `try{const cs=await self.clients.matchAll();cs.forEach(c=>c.navigate&&c.navigate(c.url));}catch(_){}` +
        `})());});\n`,
    );
  });

  app.use(
    express.static(distPath, {
      // The default cache header; per-file overrides happen in setHeaders below.
      maxAge: 0,
      setHeaders: (res, filePath) => {
        const rel = path.relative(distPath, filePath);
        const url = "/" + rel.split(path.sep).join("/");

        if (filePath.endsWith("index.html")) {
          res.setHeader(
            "Cache-Control",
            "no-cache, no-store, must-revalidate",
          );
          return;
        }

        // Service worker must be revalidated frequently so users pick up the
        // new SW (which then promotes new app code) without long staleness.
        if (url === "/sw.js" || filePath.endsWith("sw.js")) {
          res.setHeader(
            "Cache-Control",
            "no-cache, no-store, must-revalidate",
          );
          return;
        }

        // Vite emits hashed asset filenames under /assets/. They are immutable
        // because any change produces a new hash + filename.
        if (url.startsWith("/assets/")) {
          res.setHeader(
            "Cache-Control",
            `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
          );
          return;
        }

        // Other root-level files (favicon.png, manifest.json, etc.) — short
        // cache so a republish picks them up reasonably quickly.
        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", sendIndex);
}
