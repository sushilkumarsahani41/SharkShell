#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SharkShell runtime launcher
# Exec'd by the systemd unit / OpenRC script. Mirrors
# docker-entrypoint.sh: loads /etc/sharkshell/env, loads (or
# auto-generates and persists) secrets from
# /var/lib/sharkshell/secrets, resolves the database, then
# exec's the backend.
# ─────────────────────────────────────────────────────────────
set -eu

APP_DIR="/opt/sharkshell"
DATA_DIR="/var/lib/sharkshell"
SECRETS_DIR="$DATA_DIR/secrets"
LOG_DIR="$DATA_DIR/logs"
ENV_FILE="/etc/sharkshell/env"

[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
mkdir -p "$SECRETS_DIR" "$LOG_DIR"

# Load-or-generate a secret: $1=env var, $2=filename, $3=hex bytes.
# Existing value in env wins, then persisted file, then generate.
load_or_gen() {
    local var="$1" file="$SECRETS_DIR/$2" val=""
    eval "val=\${$var:-}"
    if [ -z "$val" ] && [ -f "$file" ]; then
        val="$(cat "$file")"
    fi
    if [ -z "$val" ]; then
        val="$(openssl rand -hex "$3")"
        printf '%s\n' "$val" > "$file"
        chmod 600 "$file"
    fi
    printf -v "$var" '%s' "$val"
    export "$var"
}

load_or_gen JWT_SECRET jwt_secret 32
load_or_gen ENCRYPTION_KEY encryption_key 32

# Database: all four DB_* set -> external DB. None set -> built-in
# PostgreSQL on 127.0.0.1 with an auto-managed password.
DB_VARS=0
for v in DB_HOST DB_USER DB_PASSWORD DB_NAME; do
    [ -n "${!v:-}" ] && DB_VARS=$((DB_VARS+1))
done
if [ "$DB_VARS" -gt 0 ] && [ "$DB_VARS" -lt 4 ]; then
    echo "ERROR: incomplete database configuration in $ENV_FILE." >&2
    echo "Set ALL of DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (external DB)" >&2
    echo "or NONE of them (built-in PostgreSQL)." >&2
    exit 1
fi
if [ "$DB_VARS" -eq 0 ]; then
    export DB_HOST="127.0.0.1"
    export DB_PORT="${DB_PORT:-5432}"
    export DB_USER="sharkshell"
    export DB_NAME="sharkshell"
    load_or_gen DB_PASSWORD db_password 24
fi

# Low-resource defaults — override via /etc/sharkshell/env
: "${PORT:=3002}"
: "${NODE_ENV:=production}"
: "${NODE_OPTIONS:---max-old-space-size=${NODE_MAX_OLD_SPACE_MB:-512}}"
export PORT NODE_ENV NODE_OPTIONS

cd "$APP_DIR/backend"
exec node dist/main.js >> "$LOG_DIR/backend.log" 2>&1
