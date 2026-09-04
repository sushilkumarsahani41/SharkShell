#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SharkShell — script-based deploy (no Docker)
#
# Targets:  Debian / Ubuntu       (apt    + systemd)
#           Fedora / RHEL / Rocky / AlmaLinux (dnf + systemd)
#           Arch Linux / Manjaro  (pacman + systemd)
#           Alpine                (apk    + OpenRC)
# CPU arch: x86_64 and arm64
#
#   One-liner (pulls everything for you):
#     curl -fsSL https://sharkshell.in/get | sudo bash
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
    # "sharkshell-src.tar.gz" never existed as a release asset (404s on
    # every version — the uploaded asset is the versioned
    # sharkshell-deploy-X.Y.Z.tar.gz), so this always failed here. It also
    # wouldn't have been enough on its own: that uploaded asset is a slim
    # deploy kit (deploy.sh, bin/, nginx.conf) with no frontend/ or backend/
    # — everything the build steps below need. What actually has full
    # source is GitHub's own auto-generated tag archive, which needs only
    # the tag name, not a guessed asset filename.
    LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/sushilkumarsahani41/SharkShell/releases/latest" \
        | grep -o '"tag_name": *"[^"]*"' \
        | cut -d'"' -f4)"
    [ -n "$LATEST_TAG" ] || die "could not resolve the latest release tag from the GitHub API — check network or deploy from a local clone"
    SRC_TARBALL_URL="https://github.com/sushilkumarsahani41/SharkShell/archive/refs/tags/${LATEST_TAG}.tar.gz"
    if ! curl -fsSL "$SRC_TARBALL_URL" -o "$TMP_TAR"; then
        die "failed to download source tarball ($SRC_TARBALL_URL) — check network or deploy from a local clone"
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
# DISTRO drives package-manager/path choices; SVC_MGR is the only thing
# that matters for service management — every family except Alpine uses
# systemd, so that split stays a simple two-way branch throughout.
. /etc/os-release
case "${ID:-}" in
    debian|ubuntu)                          DISTRO=debian ;;
    alpine)                                 DISTRO=alpine ;;
    fedora|rhel|centos|rocky|almalinux|ol)  DISTRO=rhel ;;
    arch|archarm|manjaro|endeavouros)       DISTRO=arch ;;
    *)
        case " ${ID_LIKE:-} " in
            *" debian "*)         DISTRO=debian ;;
            *" rhel "*|*" fedora "*) DISTRO=rhel ;;
            *" arch "*)            DISTRO=arch ;;
            *) die "unsupported distro '${ID:-unknown}' (need Debian/Ubuntu, Fedora/RHEL/Rocky/Alma, Arch, or Alpine)" ;;
        esac
        ;;
esac
[ "$DISTRO" = alpine ] && SVC_MGR=openrc || SVC_MGR=systemd
log "Detected: ${PRETTY_NAME} (family: $DISTRO, service manager: $SVC_MGR)"

# ── 2. System packages ───────────────────────────────────────
case "$DISTRO" in
    debian)
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq curl ca-certificates nginx postgresql postgresql-client logrotate >/dev/null
        if ! command -v node >/dev/null 2>&1; then
            log "Installing Node.js 20 (NodeSource)..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
            apt-get install -y -qq nodejs >/dev/null
        fi
        ;;
    rhel)
        log "Installing packages (dnf)..."
        dnf install -y -q curl ca-certificates nginx postgresql-server postgresql logrotate >/dev/null
        if ! command -v node >/dev/null 2>&1; then
            log "Installing Node.js 20 (NodeSource)..."
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null
            dnf install -y -q nodejs >/dev/null
        fi
        ;;
    arch)
        log "Installing packages (pacman)..."
        # -Syu (full sync + upgrade), not -Sy alone — a partial upgrade on
        # Arch is a known way to end up with a broken system.
        pacman -Syu --noconfirm --needed curl ca-certificates nginx postgresql logrotate nodejs npm >/dev/null
        ;;
    alpine)
        log "Installing packages (apk)..."
        apk add --no-cache nodejs npm nginx postgresql postgresql-client logrotate su-exec curl
        ;;
esac
command -v node  >/dev/null 2>&1 || die "node not found after install"
command -v nginx >/dev/null 2>&1 || die "nginx not found after install"
command -v psql  >/dev/null 2>&1 || die "psql not found after install"
log "Toolchain: node $(node -v), npm $(npm -v), $(. /etc/os-release; echo "$PRETTY_NAME")"

# ── 3. Runtime user + directories ────────────────────────────
if id "$RUN_USER" >/dev/null 2>&1; then
    log "User '$RUN_USER' already exists"
elif [ "$DISTRO" = alpine ]; then
    adduser -S -D -H -h "$DATA_DIR" "$RUN_USER"
    log "Created system user '$RUN_USER'"
else
    # nologin lives in different places across debian/rhel/arch
    NOLOGIN_SHELL="/usr/sbin/nologin"
    [ -x "$NOLOGIN_SHELL" ] || NOLOGIN_SHELL="/sbin/nologin"
    [ -x "$NOLOGIN_SHELL" ] || NOLOGIN_SHELL="/usr/bin/nologin"
    useradd --system --create-home --home-dir "$DATA_DIR" --shell "$NOLOGIN_SHELL" "$RUN_USER"
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
    log "Created $ENV_FILE"
else
    log "Keeping existing $ENV_FILE"
fi
# run.sh sources this file while running as $RUN_USER (see the service
# definition below), so root-only 600 leaves the backend unable to read its
# own config — it crash-loops on "Permission denied" and never starts.
# Applied unconditionally (not just on first create) so re-running this
# script also repairs an install that already hit that bug.
chown root:"$RUN_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

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
        # Same bug as the env file: this runs as root, so the new file is
        # root:root regardless of SECRETS_DIR's own ownership — run.sh's
        # load_or_gen then hits "Permission denied" reading it as $RUN_USER
        # and the backend crash-loops before ever printing a real log line.
        chown root:"$RUN_USER" "$f"
        chmod 640 "$f"
        log "Generated secrets/$1"
    fi
}
gen_secret jwt_secret
gen_secret encryption_key
[ "$INTERNAL_DB" = 1 ] && gen_secret db_password

# ── 7. Built-in PostgreSQL (skipped when external DB configured)
# Appended (not overwritten) into each distro's postgresql.conf, guarded
# by this marker so re-running deploy.sh stays idempotent.
append_pg_tuning() {
    grep -q 'SharkShell low-resource tuning' "$1" || cat >> "$1" <<'EOF'

# SharkShell low-resource tuning
shared_buffers = 128MB
effective_cache_size = 256MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 50
EOF
}

if [ "$INTERNAL_DB" = 1 ]; then
    log "Setting up built-in PostgreSQL..."
    DB_PASSWORD="$(cat "$SECRETS_DIR/db_password")"
    case "$DISTRO" in
        debian)
            PG_VER="$(ls -1 /etc/postgresql | sort -V | tail -1)"
            PG_MAIN="/etc/postgresql/$PG_VER/main"
            grep -qE '^\s*include_dir' "$PG_MAIN/postgresql.conf" || echo "include_dir = 'conf.d'" >> "$PG_MAIN/postgresql.conf"
            mkdir -p "$PG_MAIN/conf.d"
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
            ;;
        rhel)
            # postgresql-server ships the binaries but does not auto-init a
            # cluster like Debian's package does — do it ourselves, once.
            PG_DATA="/var/lib/pgsql/data"
            if [ ! -f "$PG_DATA/PG_VERSION" ]; then
                log "Initializing PostgreSQL data directory..."
                postgresql-setup --initdb >/dev/null 2>&1 || postgresql-setup --initdb postgresql >/dev/null 2>&1
            fi
            append_pg_tuning "$PG_DATA/postgresql.conf"
            systemctl enable postgresql >/dev/null
            systemctl start postgresql 2>/dev/null || systemctl restart postgresql
            psql_as_pg() { su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }
            ;;
        arch)
            # Same story as RHEL: the postgresql package needs an explicit initdb.
            PG_DATA="/var/lib/postgres/data"
            mkdir -p "$PG_DATA"
            chown postgres:postgres "$PG_DATA"
            if [ ! -f "$PG_DATA/PG_VERSION" ]; then
                log "Initializing PostgreSQL data directory..."
                su -s /bin/sh postgres -c "initdb -D '$PG_DATA' -E UTF8 --locale=C"
            fi
            append_pg_tuning "$PG_DATA/postgresql.conf"
            systemctl enable postgresql >/dev/null
            systemctl start postgresql 2>/dev/null || systemctl restart postgresql
            psql_as_pg() { su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }
            ;;
        alpine)
            ALPINE_PGDATA="/var/lib/postgresql/data"
            mkdir -p "$ALPINE_PGDATA"
            chown -R postgres:postgres "$ALPINE_PGDATA"
            if [ -z "$(ls -A "$ALPINE_PGDATA" 2>/dev/null)" ]; then
                log "Initializing PostgreSQL data directory..."
                su-exec postgres initdb -D "$ALPINE_PGDATA" -E UTF8 --locale=C
            fi
            append_pg_tuning "$ALPINE_PGDATA/postgresql.conf"
            rc-service postgresql start 2>/dev/null || rc-service postgresql restart
            psql_as_pg() { su-exec postgres psql -v ON_ERROR_STOP=1 -tAc "$1"; }
            ;;
    esac
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
# Neither pattern used to match: nginx.conf indents both lines four spaces,
# but both were anchored on `^` (line must *start* with the pattern) — so
# root stayed hardcoded to /app/public (a path that only exists inside the
# Docker image; nginx 500s serving from it on every script-based install)
# and client_max_body_size stayed hardcoded to nginx.conf's own default
# regardless of MAX_UPLOAD_GB. Dropping the anchors is enough: both patterns
# are distinctive full-directive text that only appears once in the file.
NGINX_BODY="$(sed -e "s|root /app/public;|root $APP_DIR/public;|" \
                  -e "s|client_max_body_size .*;|client_max_body_size ${MAX_UPLOAD_GB}G;|" \
                  "$REPO_DIR/nginx.conf")"
case "$DISTRO" in
    debian)
        printf '%s\n' "$NGINX_BODY" > /etc/nginx/sites-available/sharkshell.conf
        rm -f /etc/nginx/sites-enabled/default
        ln -sf /etc/nginx/sites-available/sharkshell.conf /etc/nginx/sites-enabled/sharkshell.conf
        ;;
    rhel|arch)
        # Unlike Debian's sites-available/ convention, the RHEL and Arch nginx
        # packages embed their default "welcome" server block directly inside
        # nginx.conf. Replace it with a minimal main context that just includes
        # conf.d/*.conf — same end result as removing Debian's default site,
        # just done at the file that actually needs editing on these distros.
        NGINX_MARKER="# Managed by SharkShell deploy.sh — edit conf.d/sharkshell.conf instead"
        if ! grep -qF "$NGINX_MARKER" /etc/nginx/nginx.conf 2>/dev/null; then
            [ -f /etc/nginx/nginx.conf ] && [ ! -f /etc/nginx/nginx.conf.orig ] && cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig
            cat > /etc/nginx/nginx.conf <<EOF
$NGINX_MARKER
worker_processes auto;
pid /run/nginx.pid;
events { worker_connections 1024; }
http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    include /etc/nginx/conf.d/*.conf;
}
EOF
        fi
        mkdir -p /etc/nginx/conf.d
        rm -f /etc/nginx/conf.d/default.conf
        printf '%s\n' "$NGINX_BODY" > /etc/nginx/conf.d/sharkshell.conf
        ;;
    alpine)
        rm -f /etc/nginx/http.d/default.conf
        printf '%s\n' "$NGINX_BODY" > /etc/nginx/http.d/sharkshell.conf
        rc-update add nginx default >/dev/null 2>&1 || true
        ;;
esac
if [ "$DISTRO" = rhel ] && command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
    # Fedora/RHEL/Rocky/Alma ship SELinux enforcing by default. Without these,
    # nginx is silently denied from proxying to 127.0.0.1:$PORT and from
    # reading $APP_DIR/public (not a standard httpd content path) — the
    # symptom is a health-check timeout with a clean backend log, which is
    # a confusing thing to debug blind.
    log "SELinux detected — allowing nginx to proxy to the backend and serve $APP_DIR/public"
    if command -v setsebool >/dev/null 2>&1; then setsebool -P httpd_can_network_connect on 2>/dev/null || true; fi
    if command -v chcon >/dev/null 2>&1; then chcon -R -t httpd_sys_content_t "$APP_DIR/public" 2>/dev/null || true; fi
fi
nginx -t
if [ "$SVC_MGR" = systemd ]; then
    systemctl enable nginx >/dev/null
    systemctl reload-or-restart nginx
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
if [ "$SVC_MGR" = systemd ]; then
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
if [ "$SVC_MGR" = systemd ]; then
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
