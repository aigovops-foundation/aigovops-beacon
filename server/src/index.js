// AIGovOps Beacon — server entry point.
//
// Boot order, on purpose:
//   1) Resolve config (env > .beacon/config.yaml > defaults).
//   2) Ensure the on-disk shape exists (~/.beacon).
//   3) Open SQLite, run migrations.
//   4) Load or create the active signing key.
//   5) Load checklist packs and policy gates from disk.
//   6) Start HTTP server.
//
// Beacon is meant to be boring. The interesting things happen in the
// services it composes — not here.

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { loadConfig } from "./lib/config.js";
import { ensureLayout } from "./lib/layout.js";
import { openDatabase } from "./services/db.js";
import { loadOrCreateActiveKey } from "./services/keys.js";
import { loadChecklistPacks } from "./services/checklists.js";
import { loadPolicies } from "./services/policies.js";
import { createRouter } from "./routes/index.js";

export async function bootstrap() {
  const config = loadConfig();
  await ensureLayout(config);

  const db = openDatabase(config);
  const activeKey = await loadOrCreateActiveKey(config, db);
  const checklists = loadChecklistPacks(config);
  const policies = loadPolicies(config);

  const ctx = { config, db, activeKey, checklists, policies };

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.server.corsOrigins }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(config.server.logFormat));

  app.use("/api/v1", createRouter(ctx));

  app.get("/", (_req, res) =>
    res.json({
      name: "AIGovOps Beacon",
      version: ctx.config.beaconVersion,
      docs: "https://github.com/aigovops-foundation/aigovops-beacon",
      principle:
        "Agents do the bureaucracy; humans hold moral legitimacy.",
    })
  );

  app.use((err, _req, res, _next) => {
    // Errors are receipts too — surface the id so a human can find it.
    const errorId = err.errorId || "no-id";
    res.status(err.statusCode || 500).json({
      error: err.code || "internal_error",
      message: err.message,
      errorId,
    });
  });

  const { host, port } = config.server;

  // Tests drive the Express app directly through supertest and never need
  // a live listener; BEACON_NO_LISTEN lets them skip it so Node exits
  // cleanly without dangling handles.
  let server = null;
  if (process.env.BEACON_NO_LISTEN !== "1") {
    server = app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(
        `Beacon ${ctx.config.beaconVersion} listening on http://${host}:${port}`
      );
      // eslint-disable-next-line no-console
      console.log(`  data root: ${ctx.config.dataDir}`);
      // eslint-disable-next-line no-console
      console.log(`  active key fingerprint: ${ctx.activeKey.fingerprint}`);
    });
  }
  ctx.server = server;

  return { app, ctx, server };
}

// Only auto-boot when invoked directly, not when imported by tests.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("src/index.js");

if (isDirectInvocation) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Beacon failed to start:", err);
    process.exit(1);
  });
}
