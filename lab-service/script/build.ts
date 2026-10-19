import { build as esbuild } from "esbuild";
import { rm, readFile, mkdir, cp, access } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // No client build: the UI is edge/components/, copied into dist/public below. The scaffold's
  // `viteBuild()` call was removed because `vite` is not a dependency of this service and never
  // was — `npm run build` failed on the import before it reached esbuild.

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Copy the v2 edge web-components into the static dist tree so the
  // existing Express static handler serves them at /components/*.js.
  // This is what lets aigovops-foundation.github.io load:
  //   <script src="https://<lab>/components/beacon-lab-bridge.js">
  // without any extra route logic on the server.
  // edge/vendor rides along as /vendor/*.js: beacon-lab.js resolves tweetnacl at
  // `new URL("../vendor/nacl-fast.min.js", import.meta.url)`, so a backend-served component
  // needs the library beside it or receipts verify as INVALID.
  for (const dir of ["components", "vendor"]) {
    try {
      await access(`edge/${dir}`);
      await mkdir(`dist/public/${dir}`, { recursive: true });
      await cp(`edge/${dir}`, `dist/public/${dir}`, { recursive: true });
      console.log(`copied edge/${dir} -> dist/public/${dir}`);
    } catch {
      console.log(`no edge/${dir} directory — skipping ${dir} copy`);
    }
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
