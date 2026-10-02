import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { pool } from "./db";
import { APP_VERSION } from "./version";

const app = express();
const httpServer = createServer(app);

// Gzip/deflate compression for HTML/JS/CSS/JSON responses.
// Skip already-compressed binary photo endpoints to avoid wasting CPU on data
// that won't shrink (and to preserve the existing ETag/Cache-Control there).
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith("/api/photo")) return false;
      const type = res.getHeader("Content-Type");
      if (typeof type === "string" && type.startsWith("image/")) return false;
      return compression.filter(req, res);
    },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("X-App-Version", APP_VERSION);
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
declare module "express-session" {
  interface SessionData {
    userId: number;
    loginAt?: number;
  }
}

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// The production edge firewall (WAF) blocks request bodies containing
// `data:<mime>;base64,` URIs (403 before reaching us), which broke every image
// upload. The client rewrites those prefixes to a `REPLB64::<mime>::` sentinel;
// here we restore the original data URIs before any validation/storage runs so
// the rest of the app is unaffected.
const WAF_SENTINEL_RE = /REPLB64::([a-zA-Z0-9.+/-]+)::/g;

function restoreDataUris(value: any): any {
  if (typeof value === "string") {
    return value.includes("REPLB64::")
      ? value.replace(WAF_SENTINEL_RE, "data:$1;base64,")
      : value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = restoreDataUris(value[i]);
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = restoreDataUris(value[key]);
    return value;
  }
  return value;
}

app.use((req, _res, next) => {
  if (req.body) req.body = restoreDataUris(req.body);
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Builds a safe, bounded one-line summary of an API JSON response for logging.
// Never serializes large/base64 payloads (e.g. data: image URLs) in full, which
// previously caused massive string allocations and OOM crashes (SIGTERM) on the
// photo-upload endpoints in production.
const LOG_RESPONSE_MAX_CHARS = 500;

function summarizeResponseForLog(body: unknown): string {
  // Redact long strings and base64/data URLs so we never stringify megabytes.
  const replacer = (_key: string, value: unknown) => {
    if (typeof value === "string") {
      if (/^data:/i.test(value)) {
        return `[data-url ${value.length} chars]`;
      }
      if (value.length > 120) {
        return `${value.slice(0, 120)}…[${value.length} chars]`;
      }
    }
    return value;
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(body, replacer);
  } catch {
    return "[unserializable response]";
  }

  if (serialized === undefined) {
    return "";
  }
  if (serialized.length > LOG_RESPONSE_MAX_CHARS) {
    return `${serialized.slice(0, LOG_RESPONSE_MAX_CHARS)}…[truncated ${serialized.length} chars]`;
  }
  return serialized;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const summary = summarizeResponseForLog(capturedJsonResponse);
        if (summary) {
          logLine += ` :: ${summary}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure blocked_ips table exists (safe raw SQL — only touches this table)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id SERIAL PRIMARY KEY,
      ip TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL DEFAULT 'Too many failed login attempts',
      blocked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add driver + cargo columns to shipment_plans if not already present
  await pool.query(`
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS driver_name TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS driver_phone TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS dorse_plate TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS driver_photo TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS cargo_company TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS cargo_title TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS cargo_description TEXT;
    ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS cargo_label_photo TEXT;
  `);

  await registerRoutes(httpServer, app);

  // Saatlik aday temizleme: 1 saatten uzun süredir onaylanmamış aday üyeler silinir
  setInterval(async () => {
    try {
      const deleted = await storage.cleanupExpiredCandidates();
      if (deleted > 0) log(`${deleted} süresi dolmuş aday üye silindi`, "cleanup");
    } catch (err) {
      console.error("Aday temizleme hatası:", err);
    }
  }, 60 * 60 * 1000);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
