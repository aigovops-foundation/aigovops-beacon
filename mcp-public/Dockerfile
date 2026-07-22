# AiGovOps Beacon — hosted MCP server.
# Single-stage. Builds embedded Beacon core + MCP tool registry into one image.
FROM node:20-alpine

WORKDIR /app

# Copy the whole repo so the relative `../server` and `../mcp` imports resolve.
COPY .. /app/

# Install Beacon core + MCP shared deps + the wrapper itself.
RUN cd /app/server && npm install --omit=dev --no-audit --no-fund \
 && cd /app/mcp    && npm install --omit=dev --no-audit --no-fund \
 && cd /app/mcp-public && npm install --no-audit --no-fund

WORKDIR /app/mcp-public

ENV NODE_ENV=production
ENV BEACON_PORT=8787
ENV BEACON_DATA_DIR=/tmp/beacon-public
ENV PUBLIC_MODE=1
ENV PORT=8080

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server.js"]
