import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

// Trust the pplx.app proxy so req.ip reflects the real client IP
app.set("trust proxy", true);

// Security headers — minimal, no external dep. Helps even though pplx.app
// adds its own. We deliberately avoid CSP/X-Frame here because the lab is
// served behind the Perplexity proxy which already manages framing.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "64kb" }));

// Simple in-memory rate limiter for /api/admin/login (brute-force protection).
// 8 attempts per 15 minutes per IP. Cleared by process restart.
const loginAttempts = new Map<string, { count: number; first: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 8;
app.use("/api/admin/login", (req, res, next) => {
  if (req.method !== "POST") return next();
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: now });
    return next();
  }
  if (rec.count >= LOGIN_MAX) {
    const retryMs = LOGIN_WINDOW_MS - (now - rec.first);
    res.setHeader("Retry-After", Math.ceil(retryMs / 1000).toString());
    return res.status(429).json({
      error: "Too many login attempts. Try again later.",
      retryAfterSec: Math.ceil(retryMs / 1000),
    });
  }
  rec.count += 1;
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
      // Redact sensitive fields from response logs (tokens, signing keys)
      const SENSITIVE = new Set([
        "token", "signingPrivateKey", "signingPublicKey", "password", "newPassword",
      ]);
      const redact = (v: any): any => {
        if (v == null || typeof v !== "object") return v;
        if (Array.isArray(v)) return v.map(redact);
        const out: any = {};
        for (const k of Object.keys(v)) {
          out[k] = SENSITIVE.has(k) ? "[redacted]" : redact(v[k]);
        }
        return out;
      };

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && res.statusCode >= 400) {
        // Only log full body on errors, and redact sensitive fields.
        logLine += ` :: ${JSON.stringify(redact(capturedJsonResponse))}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log error class + message only, not the full object (which can include req body w/ password)
    console.error(`Internal Server Error: ${err?.name || "Error"}: ${err?.message || "unknown"}`);

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
