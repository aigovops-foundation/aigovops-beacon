# Multi-stage Dockerfile for Beacon Lab.
# Stage 1: build — produces dist/index.cjs + compiled client assets.
# Stage 2: runtime — lean image with only production deps + built output.

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (including devDeps needed for the build step).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build.
COPY . .
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Only copy production deps.  --omit=dev trims ~60 MB of devDep weight.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder stage.
COPY --from=builder /app/dist ./dist

# /data is the Fly.io persistent volume mount — SQLite lives there.
# Create the directory so the health-check can start even before the volume.
RUN mkdir -p /data

# Expose the port Express listens on (must match fly.toml internal_port).
EXPOSE 5000

# Liveness probe used by both Docker and Fly.io.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/status || exit 1

# Entry point — runs the CommonJS bundle emitted by esbuild.
CMD ["node", "dist/index.cjs"]
