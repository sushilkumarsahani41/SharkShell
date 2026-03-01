#!/bin/sh
set -e

# ─────────────────────────────────────────────
# SharkShell Docker Entrypoint
# Auto-initializes PostgreSQL + generates secrets
# ─────────────────────────────────────────────

SECRETS_DIR="/app/secrets"
mkdir -p "$SECRETS_DIR"

# ── JWT RSA Key Pair ──────────────────────────
JWT_KEY_FILE="${SECRETS_DIR}/jwt.key"
JWT_PUB_FILE="${SECRETS_DIR}/jwt.pub"

if [ ! -f "$JWT_KEY_FILE" ]; then
    echo "🔑 Generating RSA key pair for JWT..."
    openssl genrsa -out "$JWT_KEY_FILE" 2048 2>/dev/null
    openssl rsa -in "$JWT_KEY_FILE" -pubout -out "$JWT_PUB_FILE" 2>/dev/null
    chmod 600 "$JWT_KEY_FILE"
    echo "   ✅ JWT keys generated"
fi

export JWT_KEY_FILE
export JWT_PUB_FILE

# ── Encryption Key ────────────────────────────
if [ -z "$ENCRYPTION_KEY" ]; then
    ENC_KEY_FILE="${SECRETS_DIR}/encryption.key"
    if [ ! -f "$ENC_KEY_FILE" ]; then
        echo "🔐 Generating AES-256 encryption key..."
        openssl rand -hex 32 > "$ENC_KEY_FILE"
        chmod 600 "$ENC_KEY_FILE"
        echo "   ✅ Encryption key generated"
    fi
    export ENCRYPTION_KEY=$(cat "$ENC_KEY_FILE")
fi

# ── Internal PostgreSQL Setup ─────────────────
if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ] || [ "$DB_HOST" = "postgres" ]; then
    export DB_HOST="127.0.0.1"
    export DB_USER="${DB_USER:-sharkshell}"
    export DB_NAME="${DB_NAME:-sharkshell}"
    export DB_PORT="${DB_PORT:-5432}"

    # Generate DB password if not set
    if [ -z "$DB_PASSWORD" ]; then
        DB_PASS_FILE="${SECRETS_DIR}/db.pass"
        if [ ! -f "$DB_PASS_FILE" ]; then
            echo "🗄️  Generating database password..."
            openssl rand -base64 24 | tr -d '\n/+=' > "$DB_PASS_FILE"
            chmod 600 "$DB_PASS_FILE"
            echo "   ✅ DB password generated"
        fi
        export DB_PASSWORD=$(cat "$DB_PASS_FILE")
    fi

    # Initialize PostgreSQL if first run
    PG_DATA="/var/lib/postgresql/data"
    if [ ! -f "$PG_DATA/PG_VERSION" ]; then
        echo "📦 Initializing PostgreSQL..."

        # Write password to temp file for initdb
        PW_FILE=$(mktemp)
        echo "$DB_PASSWORD" > "$PW_FILE"
        chown postgres:postgres "$PW_FILE"

        # Init the DB cluster
        su postgres -c "initdb -D $PG_DATA --auth=md5 --pwfile=$PW_FILE --username=$DB_USER" 2>/dev/null
        rm -f "$PW_FILE"

        # Configure to listen on localhost
        echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"
        # Overwrite pg_hba.conf for simple auth
        cat > "$PG_DATA/pg_hba.conf" <<EOF
local   all   all                 md5
host    all   all   127.0.0.1/32  md5
EOF
        chown postgres:postgres "$PG_DATA/pg_hba.conf"

        # Start temporarily to create database
        su postgres -c "pg_ctl -D $PG_DATA start -w -o '-h 127.0.0.1'" 2>/dev/null

        # Set password and create database
        export PGPASSWORD="$DB_PASSWORD"
        psql -h 127.0.0.1 -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || true
        unset PGPASSWORD

        su postgres -c "pg_ctl -D $PG_DATA stop -w" 2>/dev/null
        echo "   ✅ PostgreSQL initialized (user: $DB_USER, db: $DB_NAME)"
    fi

    export INTERNAL_PG=true
else
    export INTERNAL_PG=false
fi

echo ""
echo "  🦈 SharkShell starting..."
echo "     DB: ${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}"
echo "     Web: http://0.0.0.0:80"
echo ""

exec "$@"
