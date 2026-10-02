import crypto from "crypto";
import fs from "fs";
import path from "path";

function computeAppVersion(): string {
  // In production the bundled server lives at dist/index.cjs and the built
  // client is at dist/public/index.html. We resolve from cwd (project root)
  // so this works in the CJS bundle without relying on import.meta.url.
  const candidates = [
    path.resolve(process.cwd(), "dist", "public", "index.html"),
    path.resolve(process.cwd(), "client", "index.html"),
  ];
  for (const indexPath of candidates) {
    if (fs.existsSync(indexPath)) {
      const buf = fs.readFileSync(indexPath);
      return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
    }
  }
  return `dev-${Date.now().toString(36)}`;
}

export const APP_VERSION = computeAppVersion();
