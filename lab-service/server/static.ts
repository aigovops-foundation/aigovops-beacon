/**
 * server/static.ts — serve the built client in production. Rebuilt 2026-08-04 (phase 2 of 4).
 *
 * Exports `serveStatic(app)`, called from index.ts behind `NODE_ENV === "production"` (the dev
 * branch dynamically imports ./vite instead).
 *
 * WHAT IT SERVES. `script/build.ts` writes the server bundle to `dist/index.cjs` and copies
 * `edge/components` to `dist/public/components`, so `dist/public` is the web root.
 *
 * THE CLIENT MAY NOT EXIST, AND THAT IS FINE. The rebuild deliberately does not restore the
 * original React client — the estate's lab pages live on GitHub Pages (`docs/lab.html`,
 * `docs/lab-100.html`) and talk to this service purely as an API, loading their web components
 * from their own origin. So `dist/public` will usually contain only `components/`, with no
 * index.html. This module therefore has to degrade rather than crash: a missing web root is the
 * expected state, not an error.
 */

import fs from "node:fs";
import path from "node:path";
import express, { type Express, type Request, type Response, type NextFunction } from "express";

/** Resolve `dist/public` relative to the running bundle, not the CWD. */
function resolvePublicDir(): string {
  const fromEnv = process.env.BEACON_PUBLIC_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  // dist/index.cjs runs with CWD=/app in the container; dist/public sits beside it.
  return path.resolve(process.cwd(), "dist", "public");
}

export function serveStatic(app: Express): void {
  const publicDir = resolvePublicDir();

  if (!fs.existsSync(publicDir)) {
    // Expected when the service runs API-only. Say so once, clearly, and carry on — an API that
    // refuses to boot because it has no UI would be a worse failure than a missing page.
    console.warn(
      `[static] no web root at ${publicDir} — serving API only. ` +
      "This is normal: the lab UI is hosted on GitHub Pages and uses this service as an API.",
    );
    app.use("/api/*splat", (_req, _res, next) => next());
    return;
  }

  app.use(
    express.static(publicDir, {
      index: false,
      // Hashed asset filenames may be cached hard; anything else must revalidate so a redeploy is
      // visible immediately. Getting this backwards is how a lab serves last week's bundle.
      setHeaders(res, filePath) {
        res.setHeader(
          "Cache-Control",
          /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(filePath)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );

  /**
   * SPA fallback — but NEVER for /api. A catch-all that swallowed unmatched API routes would turn
   * every typo into a 200 of HTML, which is precisely the failure that made the deployed lab look
   * healthy while it was broken: its host returns the app shell for any path, so a `.js.map`
   * request "succeeded" with HTML and made it look like sourcemaps were published. An API must
   * 404 honestly.
   */
  const indexHtml = path.join(publicDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(indexHtml);
    });
  }
}
