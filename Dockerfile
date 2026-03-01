# ─────────────────────────────────────────
# SharkShell — All-in-One Docker Image
# PostgreSQL + Backend (Nest.js) + Frontend (nginx)
# ─────────────────────────────────────────

# ── Stage 1: Build Backend ───
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --ignore-scripts
COPY backend/ .
RUN npm run build

# ── Stage 2: Build Frontend ───
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 3: Production (All-in-One) ───
FROM node:20-alpine

RUN apk add --no-cache nginx openssl supervisor postgresql postgresql-contrib

WORKDIR /app

# Backend: copy built app + production deps
COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=backend-builder /app/backend/dist ./dist
COPY backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Frontend: copy built static files to nginx
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/http.d/default.conf

# Supervisor config
COPY supervisord.conf /etc/supervisord.conf

# PostgreSQL data directory + init script
RUN mkdir -p /var/lib/postgresql/data /run/postgresql /var/log/supervisor /run/nginx /app/secrets && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chown -R node:node /app/secrets

EXPOSE 80

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
