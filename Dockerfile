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
RUN apk add --no-cache openssl
RUN npm ci --ignore-scripts
COPY backend/ .
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine AS production
WORKDIR /app

# Install Nginx, PostgreSQL (for embedded DB fallback), and utilities
RUN apk add --no-cache openssl nginx postgresql postgresql-contrib su-exec bash

COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy the built backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy the built frontend into "public" for Nginx to serve
COPY --from=frontend-builder /app/frontend/dist ./public

# Nginx config
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/http.d/sharkshell.conf

# Setup user and permissions
RUN addgroup -g 1001 sharkshell && \
    adduser -u 1001 -G sharkshell -s /bin/sh -D sharkshell && \
    mkdir -p /app/secrets && \
    mkdir -p /app/pgdata && \
    mkdir -p /run/nginx && \
    chown -R sharkshell:sharkshell /app

# Copy the custom entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER root
EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
