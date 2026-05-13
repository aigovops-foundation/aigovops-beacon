# Beacon — single-image build.
#
# Stage 1 builds the Studio static bundle. Stage 2 installs the server
# and copies the bundle into /app/server/public so one process serves
# both API and UI.

FROM node:20-alpine AS studio
WORKDIR /studio
COPY studio/package.json studio/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY studio/ ./
RUN npm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache python3 make g++ \
    && addgroup -S beacon && adduser -S beacon -G beacon
WORKDIR /app

# Server first so we keep the layer cache when only Studio changes.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY server/ ./server/
COPY checklists/ ./checklists/
COPY policy/ ./policy/

COPY --from=studio /studio/dist ./server/public

ENV BEACON_DATA_DIR=/data
ENV BEACON_HOST=0.0.0.0
ENV BEACON_PORT=8787
ENV NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8787

USER beacon
WORKDIR /app/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/api/v1/health || exit 1

CMD ["node", "src/index.js"]
