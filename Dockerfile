# ── Build stage ────────────────────────────────────────────────────────────────
# Use a pinned minor version for reproducibility. Node 20 LTS.
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first so this layer is cached unless deps change
COPY package.json package-lock.json ./

# Install production deps only. sharp needs platform-native binaries —
# npm ci triggers the postinstall script that downloads them for linux/x64.
RUN npm ci --omit=dev

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Create non-root user for the app process
RUN addgroup -S chabisberg && adduser -S chabisberg -G chabisberg

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (no devDependencies, no .env, no local data)
COPY src         ./src
COPY views       ./views
COPY public      ./public
COPY migrations  ./migrations
COPY seeds       ./seeds
COPY knexfile.js ./
COPY package.json ./

# Data directories — created here so they exist even without volume mounts.
# Ownership assigned to non-root user.
RUN mkdir -p /data/db /data/uploads /data/thumbnails \
    && chown -R chabisberg:chabisberg /data /app

USER chabisberg

# Expose configurable port (default 3000)
EXPOSE 3000

# Run migrations + seed before starting, then start the app.
# migrate:latest is idempotent — safe on every container start.
# seed is also idempotent (checks if admin exists before inserting).
CMD ["sh", "-c", "node -e \"require('./knexfile')\" && \
     npx knex migrate:latest && \
     npx knex seed:run && \
     node src/server.js"]
