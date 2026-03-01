# ─── Build Stage ───
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ─── Production Stage ───
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN addgroup -g 1001 sharkshell && \
    adduser -u 1001 -G sharkshell -s /bin/sh -D sharkshell && \
    mkdir -p /app/secrets && chown -R sharkshell:sharkshell /app

USER sharkshell

EXPOSE 3002

# Healthcheck hits an actual endpoint to ensure NestJS is up
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:3002/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main"]
