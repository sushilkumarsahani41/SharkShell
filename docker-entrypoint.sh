#!/bin/bash
set -e

echo "🦈 SharkShell Entrypoint"

mkdir -p /app/secrets
chown -R sharkshell:sharkshell /app/secrets

# 1. JWT and Security Auto-Generation — persisted across restarts
if [ -z "$JWT_SECRET" ]; then
    if [ -f /app/secrets/jwt_secret ]; then
        export JWT_SECRET=$(cat /app/secrets/jwt_secret)
        echo "ℹ️  Loaded JWT_SECRET from secrets store."
    else
        export JWT_SECRET=$(openssl rand -hex 32)
        echo "$JWT_SECRET" > /app/secrets/jwt_secret
        chmod 600 /app/secrets/jwt_secret
        echo "ℹ️  Auto-generated and persisted JWT_SECRET."
    fi
fi

if [ -z "$ENCRYPTION_KEY" ]; then
    if [ -f /app/secrets/encryption_key ]; then
        export ENCRYPTION_KEY=$(cat /app/secrets/encryption_key)
        echo "ℹ️  Loaded ENCRYPTION_KEY from secrets store."
    else
        export ENCRYPTION_KEY=$(openssl rand -hex 32)
        echo "$ENCRYPTION_KEY" > /app/secrets/encryption_key
        chmod 600 /app/secrets/encryption_key
        echo "ℹ️  Auto-generated and persisted ENCRYPTION_KEY."
    fi
fi

# 2. Database Validation
DB_VARS_COUNT=0
[ -n "$DB_HOST" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))
[ -n "$DB_USER" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))
[ -n "$DB_PASSWORD" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))
[ -n "$DB_NAME" ] && DB_VARS_COUNT=$((DB_VARS_COUNT+1))

if [ "$DB_VARS_COUNT" -gt 0 ] && [ "$DB_VARS_COUNT" -lt 4 ]; then
    echo "❌ Error: Incomplete database variables."
    echo "If you want to use an external database, you must provide ALL of: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME."
    exit 1
fi

if [ "$DB_VARS_COUNT" -eq 0 ]; then
    echo "ℹ️  No external database provided. Booting internal PostgreSQL..."

    export DB_HOST="127.0.0.1"
    export DB_PORT="5432"
    export DB_USER="sharkshell"
    export DB_NAME="sharkshell"

    # Load or generate a stable DB password persisted across restarts
    if [ -f /app/secrets/db_password ]; then
        export DB_PASSWORD=$(cat /app/secrets/db_password)
        echo "ℹ️  Loaded DB_PASSWORD from secrets store."
    else
        export DB_PASSWORD=$(openssl rand -hex 24)
        echo "$DB_PASSWORD" > /app/secrets/db_password
        chmod 600 /app/secrets/db_password
        echo "ℹ️  Auto-generated and persisted DB_PASSWORD."
    fi

    PGDATA=/app/pgdata
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    mkdir -p /run/postgresql
    chown -R postgres:postgres /run/postgresql

    if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
        echo "Initializing local database..."
        su-exec postgres initdb -D "$PGDATA" -E UTF8 --locale=C

        echo "Starting PostgreSQL..."
        su-exec postgres pg_ctl start -D "$PGDATA" -w -o "-c listen_addresses='localhost'"

        echo "Configuring PostgreSQL user and Database..."
        su-exec postgres psql postgres -c "CREATE USER sharkshell WITH PASSWORD '${DB_PASSWORD}';"
        su-exec postgres psql postgres -c "CREATE DATABASE sharkshell OWNER sharkshell;"
    else
        echo "Existing internal database found. Starting..."
        su-exec postgres pg_ctl start -D "$PGDATA" -w -o "-c listen_addresses='localhost'"
    fi
fi

# 3. Upload size ceiling — nginx's client_max_body_size can't read env vars directly,
# so template it here from the same MAX_UPLOAD_GB the backend reads (see docs/SFTP.md).
if ! [[ "$MAX_UPLOAD_GB" =~ ^[0-9]+$ ]] || [ "$MAX_UPLOAD_GB" -eq 0 ]; then
    MAX_UPLOAD_GB=50
fi
sed -i "s/client_max_body_size .*;/client_max_body_size ${MAX_UPLOAD_GB}G;/" /etc/nginx/http.d/sharkshell.conf
echo "ℹ️  Max upload size ceiling: ${MAX_UPLOAD_GB}GB"

echo "🚀 Starting Nginx..."
nginx

echo "🚀 Starting SharkShell Backend..."
exec "$@"
