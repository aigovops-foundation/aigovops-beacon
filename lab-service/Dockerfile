# Multi-stage Dockerfile for Beacon Lab.
# Stage 1: build — compiles native deps, bundles the server to dist/index.cjs, prunes devDeps.
# Stage 2: runtime — lean image: the pruned node_modules + built output, no toolchain.

# ── builder ──────────────────────────────────────────────────────────────────
#
# BASE IS DEBIAN SLIM, NOT ALPINE. better-sqlite3 has no musl prebuild, so alpine must compile it
# from source, and the alpine image has no toolchain either — `npm ci` dies in node-gyp.
#
# Slim alone was NOT enough: better-sqlite3 13.0.2 had no prebuild matching this image's node
# either, and prebuild-install falls back to `node-gyp rebuild` silently, so the build failed on
# slim too with "find Python ... could not be run". The fix is to stop depending on a prebuild
# existing at all — install the toolchain and compile once, here.
#
# The compile happens EXACTLY ONCE. The previous layout ran `npm ci --omit=dev` again in the
# runtime stage, which meant compiling native deps a second time and needing python3/make/g++ in
# the final image. Instead the builder prunes its own node_modules to production and the runtime
# stage copies the result: one compile, and no compiler in what ships.
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Install all deps (including devDeps needed for the build step).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build.
COPY . .
RUN npm run build

# Drop devDeps in place, keeping the already-compiled native binaries.
RUN npm prune --omit=dev

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# /data is the Fly.io persistent volume mount — SQLite lives there.
# Create the directory so the health-check can start even before the volume.
RUN mkdir -p /data

# Expose the port Express listens on (must match fly.toml internal_port).
EXPOSE 5000

# Liveness probe, using node itself. The original used `curl`, which is in neither node:22-alpine
# nor node:22-slim, so it could never pass — the container would have reported unhealthy forever
# while serving perfectly. busybox `wget` would work on alpine but not on slim. `node` is the one
# binary guaranteed present in any node image, so this survives a future base change too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Entry point — runs the CommonJS bundle emitted by esbuild.
CMD ["node", "dist/index.cjs"]
