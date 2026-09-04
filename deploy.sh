#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SharkShell — script-based deploy (no Docker)
#
# Targets:  Debian / Ubuntu (apt + systemd)  |  Alpine (apk + OpenRC)
# Arch:     x86_64 and arm64
#
#   One-liner (pulls everything for you):
#     curl -fsSL https://raw.githubusercontent.com/sushilkumarsahani41/SharkShell/main/install.sh | sudo bash
#
#   Or from a local clone / release bundle:
#     sudo ./deploy.sh
#
#   Day-to-day management: sharkshell <cmd>
#
# Layout:
#   /opt/sharkshell/       runtime (backend/, public/, run.sh)
#   /var/lib/sharkshell/   secrets/ + logs/
#   /etc/sharkshell/       env (config) + src.path (repo location)
#   built-in PostgreSQL    uses the distro's default cluster (localhost only)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/sharkshell"
DATA_DIR="/var/lib/sharkshell"
ENV_DIR="/etc/sharkshell"
ENV_FILE="$ENV_DIR/env"
SECRETS_DIR="$DATA_DIR/secrets"
LOG_DIR="$DATA_DIR/logs"
SERVICE="sharkshell"
RUN_USER="sharkshell"
HEALTH_URL="http://127.0.0.1/api/auth/setup-status"

log() { printf '\033[1;34m[sharkshell]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[sharkshell] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root: sudo ./deploy.sh"

# ── 0. Locate source ─────────────────────────────────────────
# Priority: next to this script → recorded src.path → tarball from GitHub.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR=""
if [ -f "$SCRIPT_DIR/backend/package.json" ] && [ -f "$SCRIPT_DIR/frontend/package.json" ]; then
    REPO_DIR="$SCRIPT_DIR"
elif [ -f "$ENV_DIR/src.path" ] && [ -f "$(cat "$ENV_DIR/src.path")/backend/package.json" ]; then
    REPO_DIR="$(cat "$ENV_DIR/src.path")"
fi
if [ -z "$REPO_DIR" ]; then
    log "No local source found — downloading latest release tarball..."
    REPO_DIR="/opt/sharkshell-src"
    TMP_TAR="$(mktemp /tmp/sharkshell-src.XXXXXX.tar.gz)"
    TMP_EXTRACT="$(mktemp -d /tmp/sharkshell-extract.XXXXXX)"
    trap 'rm -rf "$TMP_TAR" "$TMP_EXTRACT"' EXIT
    if ! curl -fsSL "https://github.com/sushilkumarsahani41/SharkShell/releases/latest/download/sharkshell-src.tar.gz" -o "$TMP_TAR"; then
        die "failed to download source tarball — check network or deploy from a local clone"
    fi
    tar -xzf "$TMP_TAR" -C "$TMP_EXTRACT"
    rm -rf "$REPO_DIR"
    mkdir -p "$REPO_DIR"
    # tarball extracts to a single top-level directory
    EXTRACTED_DIR="$(find "$TMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d | head -1)"
    cp -a "$EXTRACTED_DIR/." "$REPO_DIR/"
    log "Source ready at $REPO_DIR"
else
    log "Using source at $REPO_DIR"
fi

# ── 1. Detect distro ─────────────────────────────────────────
. /etc/os-release
case "${ID:-}" in
    debian|ubuntu) DISTRO=debian ;;
    alpine)        DISTRO=alpine ;;
    *) die "unsupported distro '${ID:-unknown}' (need Debian, Ubuntu or Alpine)" ;;
esac
log "Detected: ${PRETTY_NAME}"

# ── 2. System packages ───────────────────────────────────────
if [ "$DISTRO" = debian ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates nginx postgresql postgresql-client logrotate >/dev/null
    if ! command -v node >/dev/null 2>&1; then
        log "Installing Node.js 20 (NodeSource)..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
        apt-get install -y -qq nodejs >/dev/null
    fi
else
    log "Installing packages (apk)..."
    apk add --no-cache nodejs npm nginx postgresql postgresql-client logrotate su-exec curl
fi
command -v node  >/dev/null 2>&1 || die "node not found after install"
command -v nginx >/dev/null 2>&1 || die "nginx not found after install"
command -v psql  >/dev/null 2>&1 || die "psql not found after install"
log "Toolchain: node $(node -v), npm $(npm -v), $(. /etc/os-release; echo "$PRETTY_NAME")"

# ── 3. Runtime user + directories ────────────────────────────
if id "$RUN_USER" >/dev/null 2>&1; then
    log "User '$RUN_USER' already exists"
else
    if [ "$DISTRO" = debian ]; then
        useradd --system --create-home --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$RUN_USER"
    else
        adduser -S -D -H -h "$DATA_DIR" "$RUN_USER"
    fi
    log "Created system user '$RUN_USER'"
fi
mkdir -p "$APP_DIR" "$SECRETS_DIR" "$LOG_DIR" "$ENV_DIR"
chown -R "$RUN_USER:$RUN_USER" "$SECRETS_DIR" "$LOG_DIR"
chmod 700 "$SECRETS_DIR"

# ── 4. Build frontend + backend on server ────────────────────
log "Building frontend (vite) — this can take a minute..."
(cd "$REPO_DIR/frontend" && npm ci --no-audit --no-fund && npm run build)
rm -rf "$APP_DIR/public"
mkdir -p "$APP_DIR/public"
cp -a "$REPO_DIR/frontend/dist/." "$APP_DIR/public/"

log "Building backend (nest)..."
(cd "$REPO_DIR/backend" && npm ci --ignore-scripts --no-audit --no-fund && npm run build)
(cd "$REPO_DIR/backend" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
rm -rf "$APP_DIR/backend"
mkdir -p "$APP_DIR/backend"
cp -a "$REPO_DIR/backend/dist" "$REPO_DIR/backend/node_modules" "$REPO_DIR/backend/package.json" "$APP_DIR/backend/"

install -m 755 "$REPO_DIR/bin/run.sh" "$APP_DIR/run.sh"
install -m 755 "$REPO_DIR/bin/sharkshell" /usr/local/bin/sharkshell
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
log "Build complete → $APP_DIR"

# ── 5. Config file (created once — later edits are yours) ────
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'EOF'
# ─────────────────────────────────────────────────────────────
# SharkShell configuration — edit, then: sharkshell restart
# ─────────────────────────────────────────────────────────────

# Public URL of this instance. REQUIRED behind a TLS-terminating
# reverse proxy or tunnel (Cloudflare Tunnel, nginx with SSL, ...).
# Without it, OAuth/MCP discovery documents advertise the wrong URL.
# Example: APP_URL=https://shell.example.com
APP_URL=

# ── Database ──────────────────────────────────────────────────
# Leave ALL FOUR blank to use the built-in PostgreSQL (default,
# data kept in the distro's default cluster on 127.0.0.1).
# To use your own Postgres, set ALL FOUR (password included here).
DB_HOST=
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_NAME=

# ── Limits / misc ─────────────────────────────────────────────
# Upload ceiling (GB) — mirrored into nginx client_max_body_size
# and read by the backend. Admin-configured limit is always <= this.
MAX_UPLOAD_GB=50
# Backend port (nginx proxies to it)
PORT=3002
# Node.js heap cap in MB (low-memory friendly default: 512)
NODE_MAX_OLD_SPACE_MB=512
# Uncomment to pin secrets instead of auto-generated ones:
# JWT_SECRET=
# ENCRYPTION_KEY=
EOF
    chmod 600 "$ENV_FILE"
    log "Created $ENV_FILE"
else
    log "Keeping existing $ENV_FILE"
fi

# Source config for the rest of the install
set -a; . "$ENV_FILE"; set +a
: "${PORT:=3002}"
: "${MAX_UPLOAD_GB:=50}"

DB_VARS=0
for v in DB_HOST DB_USER DB_PASSWORD DB_NAME; do
    [ -n "${!v:-}" ] && DB_VARS=$((DB_VARS+1))
done
[ "$DB_VARS" -gt 0 ] && [ "$DB_VARS" -lt 4 ] && die "incomplete DB_* in $ENV_FILE — set all four or none"
INTERNAL_DB=0
[ "$DB_VARS" -eq 0 ] && INTERNAL_DB=1

# ── 6. Secrets (persisted, auto-generated once) ──────────────
gen_secret() {
    local f="$SECRETS_DIR/$1"
    if [ ! -f "$f" ]; then
        openssl rand -hex 32 > "$f"
        chmod 600 "$f"
        log "Generated secrets/$1"
    fi
}
gen_secret jwt_secret
gen_secret encryption_key
[ "$INTERNAL_DB" = 1 ] && gen_secret db_password

# ── 7. Built-in PostgreSQL (skipped when external DB configured)
if [ "$INTERNAL_DB" = 1 ]; then
    log "Setting up built-in PostgreSQL..."
    DB_PASSWORD="$(cat "$SECRETS_DIR/db_password")"
    if [ "$DISTRO" = debian ]; then
        PG_VER="$(ls -1 /etc/postgresql | sort -V | tail -1)"
        PG_MAIN="/etc/postgresql/$PG_VER/main"
        grep -qE '^\s*include_dir' "$PG_MAIN/postgresql.conf" || echo "include_dir = 'conf.d'" >> "$PG_MAIN/postgresql.conf"
        mkdir -p "$PG_MAIN/conf.d"
        # Low-resource tuning
        cat > "$PG_MAIN/conf.d/10-sharkshell.conf" <<'EOF'
# SharkShell low-resource tuning
shared_buffers = 128MB
effective_cache_size = 256MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 50
EOF
        pg_ctlcluster "$PG_VER" main start 2>/dev/null || pg_ctlcluster "$PG_VER" main restart
        psql_as_pg() { su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }
    else
        ALPINE_PGDATA="/var/lib/postgresql/data"
        mkdir -p "$ALPINE_PGDATA"
        chown -R postgres:postgres "$ALPINE_PGDATA"
        if [ -z "$(ls -A "$ALPINE_PGDATA" 2>/dev/null)" ]; then
            log "Initializing PostgreSQL data directory..."
            su-exec postgres initdb -D "$ALPINE_PGDATA" -E UTF8 --locale=C
        fi
        if ! grep -q 'SharkShell low-resource tuning' "$ALPINE_PGDATA/postgresql.conf"; then
            cat >> "$ALPINE_PGDATA/postgresql.conf" <<'EOF'

# SharkShell low-resource tuning
shared_buffers = 128MB
effective_cache_size = 256MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 50
EOF
        fi
        rc-service postgresql start 2>/dev/null || rc-service postgresql restart
        psql_as_pg() { su-exec postgres psql -v ON_ERROR_STOP=1 -tAc "$1"; }
    fi
    if [ "$(psql_as_pg "SELECT 1 FROM pg_roles WHERE rolname='sharkshell'")" != "1" ]; then
        psql_as_pg "CREATE USER sharkshell WITH PASSWORD '$DB_PASSWORD'"
        log "Created PostgreSQL user 'sharkshell'"
    fi
    if [ "$(psql_as_pg "SELECT 1 FROM pg_database WHERE datname='sharkshell'")" != "1" ]; then
        psql_as_pg "CREATE DATABASE sharkshell OWNER sharkshell"
        log "Created PostgreSQL database 'sharkshell'"
    fi
    log "PostgreSQL ready (localhost only, data in distro default location)"
fi

# ── 8. nginx ─────────────────────────────────────────────────
log "Configuring nginx..."
NGINX_BODY="$(sed -e "s|^root /app/public;|root $APP_DIR/public;|" \
                  -e "s|^client_max_body_size .*;|client_max_body_size ${MAX_UPLOAD_GB}G;|" \
                  "$REPO_DIR/nginx.conf")"
if [ "$DISTRO" = debian ]; then
    printf '%s\n' "$NGINX_BODY" > /etc/nginx/sites-available/sharkshell.conf
    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/sharkshell.conf /etc/nginx/sites-enabled/sharkshell.conf
    NGINX_RELOAD="systemctl reload-or-start nginx"
else
    rm -f /etc/nginx/http.d/default.conf
    printf '%s\n' "$NGINX_BODY" > /etc/nginx/http.d/sharkshell.conf
    rc-update add nginx default >/dev/null 2>&1 || true
    NGINX_RELOAD="rc-service nginx reload"
fi
nginx -t
if [ "$DISTRO" = debian ]; then
    systemctl enable nginx >/dev/null
    systemctl reload-or-start nginx
else
    rc-service nginx reload 2>/dev/null || rc-service nginx start
fi
log "nginx configured (serves UI on :80, proxies /api/ → 127.0.0.1:$PORT, max upload ${MAX_UPLOAD_GB}G)"

# ── 9. Log rotation ──────────────────────────────────────────
cat > /etc/logrotate.d/sharkshell <<EOF
$LOG_DIR/*.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

# ── 10. Service definition ───────────────────────────────────
log "Installing '$SERVICE' service..."
if [ "$DISTRO" = debian ]; then
    {
        echo "[Unit]"
        echo "Description=SharkShell backend (Nest.js)"
        if [ "$INTERNAL_DB" = 1 ]; then
            echo "Wants=postgresql.service"
            echo "After=network-online.target postgresql.service"
        else
            echo "After=network-online.target"
        fi
        echo ""
        echo "[Service]"
        echo "User=$RUN_USER"
        echo "Group=$RUN_USER"
        echo "WorkingDirectory=$APP_DIR/backend"
        echo "ExecStart=/bin/bash $APP_DIR/run.sh"
        echo "Restart=on-failure"
        echo "RestartSec=5"
        echo "UMask=0027"
        echo ""
        echo "[Install]"
        echo "WantedBy=multi-user.target"
    } > /etc/systemd/system/sharkshell.service
    systemctl daemon-reload
    systemctl enable sharkshell >/dev/null
else
    {
        echo '#!/sbin/openrc-run'
        echo "name=sharkshell"
        echo 'description="SharkShell backend (Nest.js)"'
        echo 'command="/bin/bash"'
        echo "command_args=\"$APP_DIR/run.sh\""
        echo 'command_background="yes"'
        echo 'pidfile="/run/sharkshell.pid"'
        echo 'depend() {'
        echo '    need net'
        if [ "$INTERNAL_DB" = 1 ]; then
            echo '    need postgresql'
        fi
        echo '}'
    } > /etc/init.d/sharkshell
    chmod 755 /etc/init.d/sharkshell
    rc-update add sharkshell default >/dev/null 2>&1 || true
fi

# ── 11. (Re)start + health check ─────────────────────────────
echo "$REPO_DIR" > "$ENV_DIR/src.path"
log "Starting $SERVICE..."
if [ "$DISTRO" = debian ]; then
    systemctl restart sharkshell
else
    rc-service sharkshell restart 2>/dev/null || rc-service sharkshell start
fi

log "Waiting for health endpoint ($HEALTH_URL)..."
HEALTHY=0
for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    sleep 2
done
if [ "$HEALTHY" != 1 ]; then
    echo "" >&2
    tail -n 40 "$LOG_DIR/backend.log" >&2 || true
    die "backend did not become healthy in 60s — see log above"
fi

# ── Done ─────────────────────────────────────────────────────
cat <<EOF

  ✅ SharkShell deployed (script mode, no Docker)

     URL:      ${APP_URL:-http://<server-ip>}
     Config:   $ENV_FILE   (edit, then: sharkshell restart)
     Secrets:  $SECRETS_DIR/
     Log:      $LOG_DIR/backend.log
     Source:   $REPO_DIR
     DB:       $([ "$INTERNAL_DB" = 1 ] && echo "built-in PostgreSQL (localhost)" || echo "external ($DB_HOST:$DB_PORT/$DB_NAME)")

     Commands:
       sharkshell status     service + health overview
       sharkshell logs       tail the backend log
       sharkshell db         open a psql shell
       sharkshell restart    restart the backend
       sharkshell update     git pull + rebuild + restart
       sharkshell uninstall  remove everything (use --force)

  Open the URL and complete the first-time setup to create
  your admin account.
EOF
