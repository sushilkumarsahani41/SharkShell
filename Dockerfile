# ─────────────────────────────────────────────
# SharkShell — All-in-One Docker Image
# ─────────────────────────────────────────────

# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Build the Nest.js Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
# Need openssl for generating keys properly if needed in some contexts, though not strictly required for compile
RUN apk add --no-cache openssl
RUN npm ci --ignore-scripts
COPY backend/ .
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies for the backend, AND PostgreSQL for internal auto-generation fallback
RUN apk add --no-cache openssl postgresql postgresql-contrib su-exec bash

COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy the built backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy the built frontend into a "public" directory for NestJS ServeStatic to serve
COPY --from=frontend-builder /app/frontend/dist ./public

# Setup user and permissions for PostgreSQL
RUN addgroup -g 1001 sharkshell && \
    adduser -u 1001 -G sharkshell -s /bin/sh -D sharkshell && \
    mkdir -p /app/secrets && \
    mkdir -p /app/pgdata && \
    chown -R sharkshell:sharkshell /app

# Copy the custom entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PORT=80
USER root
EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
